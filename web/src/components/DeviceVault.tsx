import { useEffect, useRef, useState } from "react";
import { Download, HardDrive, ShieldCheck, Upload } from "lucide-react";
import { Button, Modal } from "./ui";
import { api } from "../lib/api";
import { errorMessage } from "../lib/domain";
type Preview = { trips: { name: string }[]; expenses: number };
export function downloadFile(
  content: BlobPart,
  name: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function DeviceVault({
  reload,
  notify,
  compact = false,
}: {
  reload: () => Promise<void>;
  notify: (s: string) => void;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<{
      data: unknown;
      preview: Preview;
      generation: string;
      name: string;
    } | null>(null),
    [error, setError] = useState(""),
    [persisted, setPersisted] = useState(false),
    [savedAt, setSavedAt] = useState(""),
    [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    let alive = true;
    import("../lib/device/store")
      .then((s) => s.storageStatus())
      .then((s) => {
        if (alive) {
          setPersisted(s.persisted);
          setSavedAt(s.savedAt);
        }
      })
      .catch(() => {});
    if (import.meta.env.PROD && "serviceWorker" in navigator)
      navigator.serviceWorker.ready.then(() => {
        if (alive) setOfflineReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function backup(binary = false) {
    setBusy(true);
    try {
      if (binary) {
        const bytes = await (
          await import("../lib/device/store")
        ).binaryBackup();
        downloadFile(
          bytes.slice().buffer,
          `record-life-${new Date().toISOString().slice(0, 10)}.duckdb`,
          "application/octet-stream",
        );
      } else
        downloadFile(
          JSON.stringify(await api.backup(), null, 2),
          `record-life-${new Date().toISOString().slice(0, 10)}.json`,
        );
      notify("已匯出備份，請妥善保存在裝置或個人備份空間。");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function inspect(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("備份超過 50 MB，請先分批整理資料。");
      const data: unknown = JSON.parse(await file.text()),
        store = await import("../lib/device/store"),
        status = await store.storageStatus(),
        preview = await store.backupPreview(data);
      setPending({
        data,
        preview,
        generation: status.generation,
        name: file.name,
      });
    } catch {
      notify(
        "無法讀取這份備份，請選擇完整的 Record Life JSON 備份；目前資料沒有變更。",
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function restore() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      await (
        await import("../lib/device/store")
      ).restoreBackup(pending.data, pending.generation);
      await reload();
      setPending(null);
      setSavedAt(new Date().toISOString());
      notify("備份已還原，所有彙總已重新計算。");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function persist() {
    setBusy(true);
    try {
      const accepted = await navigator.storage.persist();
      setPersisted(accepted);
      notify(
        accepted
          ? "瀏覽器已允許持久保存；仍建議定期匯出備份。"
          : "瀏覽器尚未授予持久保存，資料仍可使用，請定期匯出備份。",
      );
    } catch {
      notify("此瀏覽器不支援持久保存請求，請定期匯出備份。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={compact ? "vault-compact" : "device-vault"}>
      {!compact && (
        <>
          <h3>
            <HardDrive size={18} />
            資料留在這部裝置
          </h3>
          <p>
            旅程與花費保存在這個瀏覽器，不會上傳伺服器。清除網站資料或使用無痕模式可能使資料消失；換裝置時，請用
            JSON 備份還原。
          </p>
          <small className="muted">
            {persisted ? "已允許持久保存" : "一般裝置儲存"}
            {offlineReady ? " · 離線快取已就緒" : ""}
            {savedAt
              ? ` · 最近儲存 ${new Date(savedAt).toLocaleString("zh-TW")}`
              : ""}
          </small>
        </>
      )}
      <div className="actions">
        {!compact && (
          <Button variant="secondary" busy={busy} onClick={() => backup()}>
            <Download size={16} />
            匯出 JSON 備份
          </Button>
        )}
        <Button
          variant="secondary"
          busy={busy}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={16} />
          {busy ? "處理中…" : "匯入備份"}
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        aria-label="選擇 JSON 備份檔"
        hidden
        onChange={(e) => void inspect(e.target.files?.[0])}
      />
      {!compact && (
        <>
          <div className="actions vault-secondary">
            <Button
              variant="ghost"
              onClick={() => backup(true)}
              disabled={busy}
            >
              另存 DuckDB 檔
            </Button>
            <Button
              variant="ghost"
              onClick={persist}
              disabled={busy || persisted}
            >
              <ShieldCheck size={16} />
              {persisted ? "已啟用持久保存" : "允許持久保存"}
            </Button>
          </div>
          <small className="muted">
            JSON 可直接在此還原，也支援舊版匯出。DuckDB 檔供資料分析工具使用。
          </small>
        </>
      )}
      {pending && (
        <Modal
          title="確認還原備份"
          onClose={() => setPending(null)}
          busy={busy}
        >
          <div className="sheet-body">
            <p>{pending.name}</p>
            <p>
              包含 {pending.preview.trips.length} 趟旅程、
              {pending.preview.expenses} 筆有效支出。
            </p>
            <ul>
              {pending.preview.trips.slice(0, 10).map((t, i) => (
                <li key={i}>{t.name}</li>
              ))}
            </ul>
            <p className="error-banner">
              還原會取代目前瀏覽器內的所有旅程。請先匯出目前資料，或取消還原。
            </p>
            {error && (
              <p role="alert" className="error-banner">
                {error}
              </p>
            )}
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => backup()}
            >
              先匯出目前資料
            </Button>
          </div>
          <footer className="sheet-footer">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              取消
            </Button>
            <Button variant="danger" busy={busy} onClick={restore}>
              確認取代並還原
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
