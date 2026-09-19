import { ApiError } from "../errors";
export interface Snapshot {
  generation: string;
  bytes: Uint8Array;
  savedAt: string;
}
export type SnapshotMeta = Omit<Snapshot, "bytes"> & { byteLength: number };
function metadata(snapshot: Snapshot): SnapshotMeta {
  return {
    generation: snapshot.generation,
    savedAt: snapshot.savedAt,
    byteLength: snapshot.bytes.byteLength,
  };
}
const DB_NAME = "record-life-device-v1";
async function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 2);
    r.onupgradeneeded = (event) => {
      const store =
        event.oldVersion === 0
          ? r.result.createObjectStore("snapshots")
          : r.transaction!.objectStore("snapshots");
      const old = store.get("current");
      old.onsuccess = () => {
        if (old.result) store.put(metadata(old.result), "metadata");
      };
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("請關閉其他舊版分頁後再試。"));
  });
}
async function read<T>(key: string): Promise<T | undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readonly"),
        r = tx.objectStore("snapshots").get(key);
      tx.oncomplete = () => resolve(r.result as T | undefined);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export const readSnapshot = () => read<Snapshot>("current");
export const readMetadata = () => read<SnapshotMeta>("metadata");
export async function saveSnapshot(
  bytes: Uint8Array,
  expected?: string,
): Promise<Snapshot> {
  const snapshot: Snapshot = {
      bytes,
      generation: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
    },
    db = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("snapshots", "readwrite", {
          durability: "strict",
        }),
        store = tx.objectStore("snapshots"),
        r = store.get("metadata");
      let conflict = false;
      r.onsuccess = () => {
        if ((r.result as SnapshotMeta | undefined)?.generation !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        try {
          store.put(snapshot, "current");
          store.put(metadata(snapshot), "metadata");
        } catch {
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          conflict
            ? new ApiError("其他分頁已更新資料，請重新載入後再試。", 409)
            : new ApiError(
                "裝置儲存空間不足或儲存失敗，這次變更未保存。請釋放空間後重試。",
                507,
              ),
        );
      tx.onerror = () => {};
    });
    return snapshot;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "裝置儲存空間不足或儲存失敗，這次變更未保存。請釋放空間後重試。",
      507,
    );
  } finally {
    db.close();
  }
}
