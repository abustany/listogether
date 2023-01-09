import * as Automerge from "@automerge/automerge";
import { ParentProps, createContext, useContext, createSignal } from "solid-js";
import { v4 as uuidv4 } from "uuid";
import { fromByteArray, toByteArray } from "base64-js";

import { List, ListChange } from "./list-schema";

interface ListStore {
  getLists(): Readonly<List>[];
  addList(name: string): string;
  deleteList(id: string): void;
  updateList(id: string, changes: ListChange[]): void;
  sync(): void;
  isSynchronizing(): boolean;
}

interface ListIds {
  ids: string[];
}

const DEVICE_ID_KEY = "listogether.device_id";
const LIST_IDS_KEY = "listogether.list_ids";
const LIST_KEY_PREFIX = "listogether.list.";

function loadDoc<T>(key: string): Automerge.Doc<T> | null {
  const val = localStorage.getItem(key);
  return val === null ? null : Automerge.load(toByteArray(val));
}

function saveDoc<T>(key: string, doc: Automerge.Doc<T>): void {
  localStorage.setItem(key, fromByteArray(Automerge.save(doc)));
}

function describeChange(c: ListChange): string {
  switch (c.type) {
    case "name-change":
      return `Rename list to ${c.name}`;
    case "append-section":
      return `Add new section ${c.name}`;
    case "rename-section":
      return `Rename section #${1 + c.idx} to ${c.name}`;
    case "append-item":
      return `Add new item ${c.text} to section #${1 + c.sectionIdx}`;
    case "rename-item":
      return `Rename item #${1 + c.itemIdx} of section #${1 + c.sectionIdx} to ${c.text}`;
    case "update-item":
      return `${c.checked ? "Check" : "Uncheck"} item #${1 + c.itemIdx} of section #${1 + c.sectionIdx}`;
  }
}

function applyChange(doc: List, c: ListChange): void {
  switch (c.type) {
    case "name-change":
      doc.name = c.name;
      return;
    case "append-section":
      doc.sections.push({ name: c.name, items: [] });
      return;
    case "rename-section":
      doc.sections[c.idx].name = c.name;
      return;
    case "append-item":
      doc.sections[c.sectionIdx].items.push({ text: c.text, checked: false });
      return;
    case "rename-item":
      doc.sections[c.sectionIdx].items[c.itemIdx].text = c.text;
      return;
    case "update-item":
      doc.sections[c.sectionIdx].items[c.itemIdx].checked = c.checked;
      return;
  }
}

const unixTimestamp = () => Math.floor(Date.now() / 1000);

async function getDeviceId(): Promise<string> {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (deviceId) return Promise.resolve(deviceId);

  const res = await fetch("/api/v1/device/register", {
    method: "POST",
  });

  if (res.status !== 200) {
    throw new Error(`unexpected HTTP status ${res.status}`);
  }

  deviceId = await res.text();
  localStorage.setItem(DEVICE_ID_KEY, deviceId);

  return deviceId;
}

const listStore = {
  __loadListIds(): Automerge.Doc<ListIds> {
    return (
      loadDoc(LIST_IDS_KEY) ??
      Automerge.change(Automerge.init<ListIds>(), { message: "Initialize id list", time: unixTimestamp() }, (x) => {
        x.ids = [];
      })
    );
  },
  __updateListIds(listIds: Automerge.Doc<ListIds>, message: string, f: (ids: string[]) => void) {
    saveDoc(
      LIST_IDS_KEY,
      Automerge.change(listIds, { message, time: unixTimestamp() }, (x) => {
        f(x.ids);
      }),
    );
  },
  loadLists(): List[] {
    function listExists(l: List | null): l is List {
      return l !== null;
    }

    return this.__loadListIds()
      .ids.map((id) => loadDoc<List>(LIST_KEY_PREFIX + id))
      .filter(listExists);
  },
  saveList(l: List): void {
    saveDoc(LIST_KEY_PREFIX + l.id, l);
  },
  addList(name: string): List {
    const l = Automerge.change(
      Automerge.init<List>(),
      { message: `Create list ${name}`, time: unixTimestamp() },
      (doc) => {
        doc.id = uuidv4();
        doc.name = name;
        doc.sections = [];
      },
    );
    this.saveList(l);
    this.__updateListIds(this.__loadListIds(), `Add list ${l.id}`, (ids) => ids.push(l.id));
    return l;
  },
  deleteList(id: string): void {
    localStorage.removeItem(LIST_KEY_PREFIX + id);

    const listIds = this.__loadListIds();
    const idx = listIds.ids.findIndex((x) => x === id);
    if (idx === -1) return;

    this.__updateListIds(listIds, `Remove list ${id}`, (ids) => ids.splice(idx, 1));
  },
  updateList(oldList: List, changes: ListChange[]): List {
    if (changes.length === 0) return oldList;

    const changelog = changes.reduce((log, change) => {
      log += describeChange(change);
      log += "\n";
      return log;
    }, "");

    const updated = Automerge.change(oldList, { message: changelog, time: unixTimestamp() }, (doc) => {
      changes.forEach((c) => {
        applyChange(doc, c);
      });
    });

    this.saveList(updated);

    return updated;
  },
  async sync(): Promise<void> {
    const deviceId = await getDeviceId();
    console.log(`device ID is ${deviceId}`);

    // First sync the document list
    let documentList = loadDoc(LIST_IDS_KEY);
    if (!documentList) return;

    let syncState = Automerge.initSyncState();

    const ws = new WebSocket(`ws://${window.location.host}/api/v1/document/foo/sync`);
    ws.binaryType = "arraybuffer";

    const tick = (incomingMessage: Uint8Array | null) => {
      let reply: Uint8Array | null;
      const otherIsFinished = incomingMessage !== null && incomingMessage.byteLength === 0;

      if (incomingMessage !== null && incomingMessage.byteLength > 0) {
        const [updatedDoc, nextSyncState] = Automerge.receiveSyncMessage(documentList!, syncState, incomingMessage);
        documentList = updatedDoc;
        syncState = nextSyncState;
      }

      const [nextSyncState, syncMessage] = Automerge.generateSyncMessage(documentList!, syncState);
      syncState = nextSyncState;
      reply = syncMessage;

      if (otherIsFinished && reply === null) {
        // everyone is done
        console.log("received empty message and nothing to send, closing");
        ws.close();
        return;
      }

      const payload = reply?.buffer || new ArrayBuffer(0);
      console.log(`sending sync message (${payload.byteLength} bytes)`);
      ws.send(payload);
    };

    return new Promise((resolve, reject) => {
      ws.onerror = (ev) => {
        reject(ev);
      };
      ws.onclose = () => {
        resolve();
      };
      ws.onopen = () => {
        tick(null);
      };
      ws.onmessage = (ev) => {
        const data = ev.data;

        if (!(data instanceof ArrayBuffer)) {
          reject("received non-binary message");
          ws.close();
          return;
        }

        console.log(`received sync message (${data.byteLength} bytes)`);

        tick(new Uint8Array(data));
      };
    });
  },
};

export const ListStoreContext = createContext<ListStore>({
  getLists: () => [],
  addList: (_name: string) => "",
  deleteList: (_id: string) => {},
  updateList: (_id: string, _changes: ListChange[]) => {},
  sync: () => {},
  isSynchronizing: () => false,
});

export function ListStoreProvider(props: ParentProps) {
  const [getLists, setLists] = createSignal<List[]>(listStore.loadLists());
  const [isSynchronizing, setIsSynchronizing] = createSignal<boolean>(false);
  const p: ListStore = {
    getLists,
    addList(name: string): string {
      const l = listStore.addList(name);
      setLists((lists) => [...lists, l]);
      return l.id;
    },
    deleteList(id: string): void {
      listStore.deleteList(id);

      const idx = getLists().findIndex((x) => x.id === id);
      if (idx === -1) return;

      setLists((lists) => {
        const res = [...lists];
        res.splice(idx, 1);
        return res;
      });
    },
    updateList(id: string, changes: ListChange[]): void {
      const lists = getLists();
      const idx = lists.findIndex((x) => x.id === id);
      if (idx === -1) return;

      const updatedLists = [...lists];
      updatedLists[idx] = listStore.updateList(lists[idx], changes);
      setLists(updatedLists);
    },
    sync(): void {
      setIsSynchronizing(true);
      listStore.sync().finally(() => {
        setIsSynchronizing(false);
      });
    },
    isSynchronizing,
  };

  return <ListStoreContext.Provider value={p}>{props.children}</ListStoreContext.Provider>;
}

export const useLists = () => useContext(ListStoreContext);
