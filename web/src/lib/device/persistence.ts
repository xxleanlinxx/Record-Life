import { ApiError } from "../errors";
export interface Snapshot {
  generation: string;
  bytes: Uint8Array;
  savedAt: string;
}
const DB_NAME = "record-life-device-v1";
async function openStore() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("snapshots");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error("請關閉其他舊版分頁後再試。"));
  });
}
export async function readSnapshot(): Promise<Snapshot | undefined> {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("snapshots", "readonly"),
        r = tx.objectStore("snapshots").get("current");
      tx.oncomplete = () => resolve(r.result as Snapshot | undefined);
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
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
        r = store.get("current");
      let conflict = false;
      r.onsuccess = () => {
        if ((r.result as Snapshot | undefined)?.generation !== expected) {
          conflict = true;
          tx.abort();
          return;
        }
        try {
          store.put(snapshot, "current");
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
