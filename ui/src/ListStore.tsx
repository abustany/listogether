import * as Automerge from "@automerge/automerge";
import { ParentProps, createContext, useContext, createSignal, createResource, Resource } from "solid-js";
import { makeEventListener } from "@solid-primitives/event-listener";
import { v4 as uuidv4 } from "uuid";
import { DBSchema, IDBPDatabase, openDB, StoreNames } from "idb";
import { toByteArray as decodeBase64 } from "base64-js";

import { captureException } from "./errors";
import { List, ListChange } from "./list-schema";

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
    case "delete-item":
      return `Delete item #${1 + c.itemIdx} of section #${1 + c.sectionIdx}`;
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
    case "delete-item":
      doc.sections[c.sectionIdx].items.splice(c.itemIdx, 1);
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
    actor: Automerge.ActorId,
  ): Promise<Automerge.Doc<T> | null> {
    const data = await (await this.db).get(store, docId);
    if (!data) return null;
    return Automerge.load<T>(data as Uint8Array, { actor });
  }

  async loadDoc<T>(docId: string, actor: Automerge.ActorId): Promise<Automerge.Doc<T> | null> {
    return this.loadDocFromStore(Storage.DocStore, docId, actor);
  }

  async loadDocs<T>(docIds: string[], actor: Automerge.ActorId): Promise<(Automerge.Doc<T> | null)[]> {
    const tx = (await this.db).transaction(Storage.DocStore, "readonly");
    const docs = await Promise.all(docIds.map((id) => tx.store.get(id)));
    return docs.map((data) => (data ? Automerge.load<T>(data, { actor }) : null));
  }

  async deleteDoc(docId: string): Promise<void> {
    return (await this.db).delete(Storage.DocStore, docId);
  }

  async saveListIds(ids: Automerge.Doc<ListIds>): Promise<void> {
    return this.saveDocToStore(Storage.MetaStore, Storage.MetaKeys.list_ids, ids);
  }

  async loadListIds(actor: Automerge.ActorId): Promise<Automerge.Doc<ListIds> | null> {
    return await this.loadDocFromStore(Storage.MetaStore, Storage.MetaKeys.list_ids, actor);
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

  async deleteSyncState(docId: string): Promise<void> {
    return (await this.db).delete(Storage.SyncState, docId);
  }

  async loadLastSyncTime(): Promise<Date | undefined> {
    const timestamp = (await (await this.db).get(Storage.MetaStore, Storage.MetaKeys.last_sync_time)) as
      | number
      | undefined;
    return timestamp ? new Date(timestamp) : undefined;
  }

  async saveLastSyncTime(d: Date): Promise<void> {
    await (await this.db).put(Storage.MetaStore, d.getTime(), Storage.MetaKeys.last_sync_time);
  }
}

namespace Storage {
  export const DocStore = "docs";
  export const SyncState = "sync_state";
  export const MetaStore = "meta";
  export const MetaKeys = {
    device_id: "device_id",
    list_ids: "list_ids",
    last_sync_time: "last_sync_time",
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
    const hex = x.toString(16);

    if (hex.length === 1) res += "0";
    res += hex;
  }

  return res;
}

const storage = new Storage();

function initDoc<T>(deviceId: DeviceID, initialValue?: T): Automerge.Doc<T> {
  if (initialValue) {
    return Automerge.from(initialValue, { actor: rawDeviceIdToHex(deviceId.raw) });
  }

  return Automerge.init<T>({ actor: rawDeviceIdToHex(deviceId.raw) });
}

class ListStore {
  private cachedActorId: Promise<Automerge.ActorId> | undefined;

  private getActorId(): Promise<Automerge.ActorId> {
    if (!this.cachedActorId) {
      this.cachedActorId = getDeviceId().then((id) => rawDeviceIdToHex(id.raw));
    }

    return this.cachedActorId;
  }

  private async loadListIds(): Promise<Automerge.Doc<ListIds>> {
    const deviceId = await getDeviceId();
    return (await storage.loadListIds(await this.getActorId())) ?? initDoc<ListIds>(deviceId, { ids: [] });
  }

  private async updateListIds(
    listIds: Automerge.Doc<ListIds>,
    message: string,
    f: (ids: string[]) => void,
  ): Promise<void> {
    return storage.saveListIds(
      Automerge.change(listIds, { message, time: unixTimestamp() }, (x) => {
        f(x.ids);
      }),
    );
  }

  async loadLists(): Promise<List[]> {
    function listExists(l: List | null): l is List {
      return l !== null;
    }

    const listIds = (await this.loadListIds()).ids ?? [];

    return (await storage.loadDocs<List>(listIds, await this.getActorId())).filter(listExists);
  }

  async saveList(l: List): Promise<void> {
    return storage.saveDoc(l.id, l);
  }

  async addList(name: string): Promise<List> {
    const deviceId = await getDeviceId();
    const l = initDoc<List>(deviceId, { id: uuidv4(), name, sections: [] });
    await this.saveList(l);
    await this.updateListIds(await this.loadListIds(), `Add list ${l.id}`, (ids) => ids.push(l.id));
    return l;
  }

  async deleteList(id: string): Promise<void> {
    await storage.deleteSyncState(id);
    await storage.deleteDoc(id);

    const listIds = await this.loadListIds();
    const idx = (listIds.ids ?? []).findIndex((x) => x === id);
    if (idx === -1) return;

    await this.updateListIds(listIds, `Remove list ${id}`, (ids) => ids.splice(idx, 1));
  }

  async updateList(listId: string, changes: ListChange[]): Promise<List> {
    const list = await storage.loadDoc<List>(listId, await this.getActorId());
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
  }
  async syncDocument<T>(ws: WebSocket, docId: string, doc: Automerge.Doc<T>): Promise<Automerge.Doc<T>> {
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
            .then((_) => resolve(doc))
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
  }
  async withSyncSocket<T>(f: (deviceId: DeviceID, ws: WebSocket) => Promise<T>): Promise<T> {
    const deviceId = await getDeviceId();
    console.log(`device ID is ${deviceId.raw} (${rawDeviceIdToHex(deviceId.raw)})`);

    const websocketProtocol = document.location.protocol === "http:" ? "ws" : "wss";
    const ws = new WebSocket(`${websocketProtocol}://${window.location.host}/api/v1/document/sync`);
    ws.binaryType = "arraybuffer";

    let res: T;

    return new Promise((resolve, reject) => {
      // readyToClose becomes true once f returns. At that point it doesn't
      // matter who closes the socket first between us and the server. Firefox
      // and Chrome seem to happily close a closed socket, but Safari will
      // throw an error.
      let readyToClose = false;

      ws.onclose = (ev) => {
        if (readyToClose) {
          resolve(res);
        } else {
          reject(new Error(`WebSocket closed with code ${ev.code}`));
        }
      };
      ws.onopen = async () => {
        // send protocol version
        ws.send(new Uint8Array([1]));
        ws.send(str2uint8Array(deviceId.id));

        try {
          res = await f(deviceId, ws);
          readyToClose = true;
        } finally {
          ws.close();
        }
      };
    });
  }
  async sync(): Promise<void> {
    return this.withSyncSocket(async (deviceId, ws) => {
      let listIdsDoc = await this.loadListIds();

      // sync list ids first so we get notified of potential new lists
      try {
        console.log("synchronizing list ids");
        listIdsDoc = await this.syncDocument(ws, rawDeviceIdToHex(deviceId.raw), listIdsDoc);
        await storage.saveListIds(listIdsDoc);
      } catch (e) {
        console.error(`error synchronizing list ids: ${e}`);
        throw e;
      }

      // sync all docs
      for (const docId of listIdsDoc.ids ?? []) {
        try {
          console.log(`synchronizing document ${docId}`);
          let doc = (await storage.loadDoc(docId, await this.getActorId())) ?? initDoc<List>(deviceId);
          doc = await this.syncDocument(ws, docId, doc);
          await storage.saveDoc(docId, doc);
        } catch (e) {
          console.error(`error synchronizing document ${docId}: ${e}`);
          throw e;
        }
      }

      await storage.saveLastSyncTime(new Date());
    });
  }
  async importList(docId: string): Promise<Automerge.Doc<List>> {
    const doc = await storage.loadDoc<List>(docId, await this.getActorId());
    if (doc) return doc;

    return this.withSyncSocket(async (deviceId, ws) => {
      const doc = await this.syncDocument(ws, docId, initDoc<List>(deviceId));
      if (!doc.id) {
        throw new Error("no id property on document"); // sanity check
      }

      await storage.saveDoc(docId, doc);
      await this.updateListIds(await this.loadListIds(), `Add list ${doc.id}`, (ids) => ids.push(doc.id));

      return doc;
    });
  }
  async getLastSyncTime(): Promise<Date | undefined> {
    return storage.loadLastSyncTime();
  }
}

const listStore = new ListStore();

interface IListStoreContext {
  getLists: Resource<Readonly<List>[]>;
  getLastSyncTime(): Date | undefined;
  addList(name: string): Promise<string>;
  deleteList(id: string): Promise<void>;
  updateList(listId: string, changes: ListChange[]): Promise<void>;
  sync(): void;
  importList(docId: string): Promise<List>;
  isSynchronizing(): boolean;
}

export const ListStoreContext = createContext<IListStoreContext | null>(null);

export function ListStoreProvider(props: ParentProps) {
  const [getLists, { mutate: mutateLists, refetch: refetchLists }] = createResource<List[]>(() =>
    listStore.loadLists(),
  );
  const [getLastSyncTime, { refetch: refetchLastSyncTime }] = createResource<Date | undefined>(() =>
    listStore.getLastSyncTime(),
  );
  const ensureListsAreLoaded = () => {
    if (getLists.latest === undefined) throw new Error("lists are not loaded yet");
  };
  const [isSynchronizing, setIsSynchronizing] = createSignal<boolean>(false);
  const p: IListStoreContext = {
    getLists,
    getLastSyncTime,
    async addList(name: string): Promise<string> {
      ensureListsAreLoaded();

      const l = await listStore.addList(name);
      await refetchLists();
      p.sync();
      return l.id;
    },
    async deleteList(id: string): Promise<void> {
      ensureListsAreLoaded();

      mutateLists((lists) => lists?.filter((l) => l.id !== id));

      await listStore.deleteList(id);
      await refetchLists();
      p.sync();
    },
    async updateList(listId: string, changes: ListChange[]): Promise<void> {
      ensureListsAreLoaded();

      if (changes.length === 0) return Promise.resolve(undefined);
      // TODO: implement optimistic update?

      await listStore.updateList(listId, changes);
      await refetchLists();
      p.sync();
    },
    sync(): void {
      setIsSynchronizing(true);
      listStore
        .sync()
        .catch((e) => {
          console.error("sync failed", e, e.stack);
          captureException(e);
        })
        .finally(() => {
          setIsSynchronizing(false);
          refetchLists();
          refetchLastSyncTime();
        });
    },
    async importList(docId): Promise<List> {
      const doc = await listStore.importList(docId);
      await refetchLists();

      return doc;
    },
    isSynchronizing,
  };

  makeEventListener(window, "online", () => {
    p.sync();
  });

  return <ListStoreContext.Provider value={p}>{props.children}</ListStoreContext.Provider>;
}

export const useLists = () => useContext(ListStoreContext)!;
