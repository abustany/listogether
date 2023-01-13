import * as Automerge from "@automerge/automerge";
import { ParentProps, createContext, useContext, createSignal, createResource } from "solid-js";
import { v4 as uuidv4 } from "uuid";
import { DBSchema, IDBPDatabase, openDB, StoreNames } from "idb";
import { toByteArray as decodeBase64 } from "base64-js";

import { List, ListChange } from "./list-schema";

interface ListStore {
  getLists(): Readonly<List>[];
  addList(name: string): Promise<string>;
  deleteList(id: string): Promise<void>;
  updateList(listId: string, changes: ListChange[]): Promise<void>;
  sync(): void;
  isSynchronizing(): boolean;
}

interface ListIds {
  ids: string[];
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

async function getDeviceId(): Promise<DeviceID> {
  let deviceId = await storage.loadDeviceId();
  if (deviceId) return deviceId;

  const res = await fetch("/api/v1/device/register", {
    method: "POST",
  });

  if (res.status !== 200) {
    throw new Error(`unexpected HTTP status ${res.status}`);
  }

  deviceId = (await res.json()) as DeviceID;
  await storage.saveDeviceId(deviceId);

  return deviceId;
}

interface DeviceID {
  id: string;
  raw: string;
}

class Storage {
  private db: Promise<IDBPDatabase<Storage.Schema>>;

  constructor() {
    this.db = openDB<Storage.Schema>("listogether", 1, {
      upgrade(database) {
        database.createObjectStore(Storage.DocStore, {});
        database.createObjectStore(Storage.SyncState, {});
        database.createObjectStore(Storage.MetaStore, {});
      },
    });
  }

  private async saveDocToStore<T>(
    store: StoreNames<Storage.Schema>,
    docId: string,
    doc: Automerge.Doc<T>,
  ): Promise<void> {
    (await this.db).put(store, Automerge.save(doc), docId);
  }

  async saveDoc<T>(docId: string, doc: Automerge.Doc<T>): Promise<void> {
    return this.saveDocToStore(Storage.DocStore, docId, doc);
  }

  private async loadDocFromStore<T>(
    store: StoreNames<Storage.Schema>,
    docId: string,
  ): Promise<Automerge.Doc<T> | null> {
    const data = await (await this.db).get(store, docId);
    if (!data) return null;
    return Automerge.load<T>(data as Uint8Array);
  }

  async loadDoc<T>(docId: string): Promise<Automerge.Doc<T> | null> {
    return this.loadDocFromStore(Storage.DocStore, docId);
  }

  async loadDocs<T>(docIds: string[]): Promise<(Automerge.Doc<T> | null)[]> {
    const tx = (await this.db).transaction(Storage.DocStore, "readonly");
    const docs = await Promise.all(docIds.map((id) => tx.store.get(id)));
    return docs.map((data) => (data ? Automerge.load<T>(data) : null));
  }

  async deleteDoc(docId: string): Promise<void> {
    return (await this.db).delete(Storage.DocStore, docId);
  }

  async saveListIds(ids: Automerge.Doc<ListIds>): Promise<void> {
    return this.saveDocToStore(Storage.MetaStore, Storage.MetaKeys.list_ids, ids);
  }

  async loadListIds(): Promise<Automerge.Doc<ListIds> | null> {
    return await this.loadDocFromStore(Storage.MetaStore, Storage.MetaKeys.list_ids);
  }

  async loadDeviceId(): Promise<DeviceID | null> {
    const val = await (await this.db).get(Storage.MetaStore, Storage.MetaKeys.device_id);
    return val ? (val as DeviceID) : null;
  }

  async saveDeviceId(id: DeviceID): Promise<void> {
    (await this.db).put(Storage.MetaStore, id, Storage.MetaKeys.device_id);
  }

  async loadSyncState(docId: string): Promise<Automerge.SyncState | null> {
    const data = await (await this.db).get(Storage.SyncState, docId);
    if (!data) return null;
    return Automerge.decodeSyncState(data as Uint8Array);
  }

  async saveSyncState(docId: string, syncState: Automerge.SyncState) {
    await (await this.db).put(Storage.SyncState, Automerge.encodeSyncState(syncState), docId);
  }
}

namespace Storage {
  export const DocStore = "docs";
  export const SyncState = "sync_state";
  export const MetaStore = "meta";
  export const MetaKeys = {
    device_id: "device_id",
    list_ids: "list_ids",
  };

  export interface Schema extends DBSchema {
    [DocStore]: {
      key: string;
      value: Uint8Array;
    };
    [SyncState]: {
      key: string;
      value: Uint8Array;
    };
    [MetaStore]: {
      key: string;
      value: unknown;
    };
  }
}

function str2uint8Array(s: string): Uint8Array {
  return Uint8Array.from(s.split("").map((x) => x.charCodeAt(0)));
}

function rawDeviceIdToHex(id: string): string {
  while (id.length % 4 !== 0) id += "="; // base64-js requires padding to be present

  const data = decodeBase64(id);
  let res = "";

  for (const x of data) {
    res += x.toString(16);
  }

  return res;
}

const storage = new Storage();

const listStore = {
  async __loadListIds(): Promise<Automerge.Doc<ListIds>> {
    const deviceId = await getDeviceId();

    return (
      (await storage.loadListIds()) ??
      Automerge.change(
        Automerge.init<ListIds>({ actor: rawDeviceIdToHex(deviceId.raw) }),
        { message: "Initialize id list", time: unixTimestamp() },
        (x) => {
          x.ids = [];
        },
      )
    );
  },

  async __updateListIds(listIds: Automerge.Doc<ListIds>, message: string, f: (ids: string[]) => void): Promise<void> {
    return storage.saveListIds(
      Automerge.change(listIds, { message, time: unixTimestamp() }, (x) => {
        f(x.ids);
      }),
    );
  },

  async loadLists(): Promise<List[]> {
    function listExists(l: List | null): l is List {
      return l !== null;
    }

    const listIds = (await this.__loadListIds()).ids;

    return (await storage.loadDocs<List>(listIds)).filter(listExists);
  },

  async saveList(l: List): Promise<void> {
    return storage.saveDoc(l.id, l);
  },

  async addList(name: string): Promise<List> {
    const deviceId = await getDeviceId();
    const l = Automerge.change(
      Automerge.init<List>({ actor: rawDeviceIdToHex(deviceId.raw) }),
      { message: `Create list ${name}`, time: unixTimestamp() },
      (doc) => {
        doc.id = uuidv4();
        doc.name = name;
        doc.sections = [];
      },
    );
    await this.saveList(l);
    await this.__updateListIds(await this.__loadListIds(), `Add list ${l.id}`, (ids) => ids.push(l.id));
    return l;
  },

  async deleteList(id: string): Promise<void> {
    await storage.deleteDoc(id);

    const listIds = await this.__loadListIds();
    const idx = listIds.ids.findIndex((x) => x === id);
    if (idx === -1) return;

    await this.__updateListIds(listIds, `Remove list ${id}`, (ids) => ids.splice(idx, 1));
  },

  async updateList(listId: string, changes: ListChange[]): Promise<List> {
    const list = await storage.loadDoc<List>(listId);
    if (list === null) throw new Error(`list ${listId} does not exist`);
    if (changes.length === 0) return list;

    const changelog = changes.reduce((log, change) => {
      log += describeChange(change);
      log += "\n";
      return log;
    }, "");

    const updated = Automerge.change(list, { message: changelog, time: unixTimestamp() }, (doc) => {
      changes.forEach((c) => {
        applyChange(doc, c);
      });
    });

    await this.saveList(updated);

    return updated;
  },
  async syncDocument(ws: WebSocket, docId: string, doc: Automerge.Doc<unknown>): Promise<void> {
    let syncState = (await storage.loadSyncState(docId)) ?? Automerge.initSyncState();

    return new Promise((resolve, reject) => {
      let onMessage: (ev: MessageEvent) => void;

      const unsafeTick = (incomingMessage: Uint8Array | null) => {
        const otherIsFinished = incomingMessage !== null && incomingMessage.byteLength === 0;

        if (otherIsFinished) {
          // everyone is done
          console.log("received empty message, sync done");
          ws.removeEventListener("message", onMessage);
          storage
            .saveSyncState(docId, syncState)
            .then((_) => resolve(undefined))
            .catch(reject);
          return;
        }

        if (incomingMessage !== null && incomingMessage.byteLength > 0) {
          [doc, syncState] = Automerge.receiveSyncMessage(doc, syncState, incomingMessage);
        }

        let reply: Uint8Array | null;
        [syncState, reply] = Automerge.generateSyncMessage(doc, syncState);

        const payload = reply?.buffer || new ArrayBuffer(0);
        console.log(`sending sync message (${payload.byteLength} bytes)`);
        ws.send(payload);
      };

      const tick = (incomingMessage: Uint8Array | null) => {
        try {
          unsafeTick(incomingMessage);
        } catch (e) {
          reject(e);
        }
      };

      onMessage = (ev) => {
        const data = ev.data;

        if (!(data instanceof ArrayBuffer)) {
          reject("received non-binary message");
          return;
        }

        console.log(`received sync message (${data.byteLength} bytes)`);
        tick(new Uint8Array(data));
      };

      ws.addEventListener("message", onMessage);

      // send the document ID
      ws.send(str2uint8Array(docId));

      // start the sync
      tick(null);
    });
  },
  async sync(): Promise<void> {
    const deviceId = await getDeviceId();
    console.log(`device ID is ${deviceId.raw}`);

    const ws = new WebSocket(`ws://${window.location.host}/api/v1/document/sync`);
    ws.binaryType = "arraybuffer";

    // First sync the document list
    const documentList = await storage.loadListIds();
    if (!documentList) return;

    return new Promise((resolve, reject) => {
      ws.onerror = (ev) => {
        reject(ev);
      };
      ws.onclose = () => {
        resolve();
      };
      ws.onopen = async () => {
        // send protocol version
        ws.send(new Uint8Array([1]));
        ws.send(str2uint8Array(deviceId.id));
        await this.syncDocument(ws, Storage.MetaKeys.list_ids, documentList);
        ws.close();
      };
    });
  },
};

export const ListStoreContext = createContext<ListStore>({
  getLists: () => [],
  addList: (_name: string) => Promise.resolve(""),
  deleteList: (_id: string) => Promise.resolve(undefined),
  updateList: (_listId: string, _changes: ListChange[]) => Promise.resolve(undefined),
  sync: () => {},
  isSynchronizing: () => false,
});

export function ListStoreProvider(props: ParentProps) {
  const [getLists, { mutate: mutateLists, refetch: refetchLists }] = createResource<List[]>(
    () => listStore.loadLists(),
    { initialValue: [] },
  );
  const [isSynchronizing, setIsSynchronizing] = createSignal<boolean>(false);
  const p: ListStore = {
    getLists,
    async addList(name: string): Promise<string> {
      const l = await listStore.addList(name);
      await refetchLists();
      return l.id;
    },
    async deleteList(id: string): Promise<void> {
      mutateLists((lists) => lists.filter((l) => l.id !== id));

      await listStore.deleteList(id);
      await refetchLists();
    },
    async updateList(listId: string, changes: ListChange[]): Promise<void> {
      // TODO: implement optimistic update?

      await listStore.updateList(listId, changes);
      await refetchLists();
    },
    sync(): void {
      setIsSynchronizing(true);
      listStore
        .sync()
        .catch((e) => {
          console.error("sync failed", e);
        })
        .finally(() => {
          setIsSynchronizing(false);
        });
    },
    isSynchronizing,
  };

  return <ListStoreContext.Provider value={p}>{props.children}</ListStoreContext.Provider>;
}

export const useLists = () => useContext(ListStoreContext);
