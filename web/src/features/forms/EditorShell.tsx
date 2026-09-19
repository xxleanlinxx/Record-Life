import { useEffect, useRef, useState, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button, FieldErrorsContext, Modal } from "../../components/ui";
import { ApiError } from "../../lib/api";
import { errorMessage } from "../../lib/domain";
import type { EditorActions } from "./shared";

export default function EditorShell({
  title,
  subtitle,
  dirty,
  onSubmit,
  onDelete,
  children,
  close,
  saved,
  reload,
  create = false,
}: EditorActions & {
  title: string;
  subtitle?: string;
  dirty: boolean;
  create?: boolean;
  onSubmit: () => Promise<string | void>;
  onDelete?: () => Promise<unknown>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const saving = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function perform(remove = false) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    setConflict(false);
    setFieldErrors({});
    try {
      const tid = remove ? (await onDelete?.(), undefined) : await onSubmit();
      await saved(tid || undefined);
    } catch (cause) {
      setError(errorMessage(cause));
      setConflict(cause instanceof ApiError && cause.status === 409);
      setFieldErrors(cause instanceof ApiError ? cause.fieldErrors : {});
      setDeleting(false);
      requestAnimationFrame(() => {
        const input = formRef.current?.querySelector<HTMLElement>(
          '[aria-invalid="true"]',
        );
        if (input) {
          let parent = input.parentElement;
          while (parent) {
            if (parent instanceof HTMLDetailsElement) parent.open = true;
            parent = parent.parentElement;
          }
          input.focus();
          input.scrollIntoView({ block: "nearest" });
        } else errorRef.current?.focus();
      });
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      dirty={dirty}
      busy={busy}
      onClose={close}
    >
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          void perform();
        }}
      >
        <div className="sheet-body">
          {error && (
            <div
              ref={errorRef}
              tabIndex={-1}
              role="alert"
              className="error-banner"
            >
              {error}
              {conflict && (
                <button
                  type="button"
                  onClick={async () => {
                    await reload();
                    close();
                  }}
                >
                  捨棄變更並載入最新資料
                </button>
              )}
            </div>
          )}
          {deleting ? (
            <div className="delete-confirm">
              <h3>確定刪除這筆紀錄？</h3>
              <p>刪除後相關清單與預算會更新；刪除支出會清除購物記帳關聯。</p>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                保留紀錄
              </Button>{" "}
              <Button
                type="button"
                variant="danger"
                busy={busy}
                onClick={() => void perform(true)}
              >
                確認刪除
              </Button>
            </div>
          ) : (
            <FieldErrorsContext.Provider value={fieldErrors}>
              {children}
            </FieldErrorsContext.Provider>
          )}
        </div>
        {!deleting && (
          <footer className="sheet-footer">
            {onDelete && (
              <button
                type="button"
                className="icon-button delete-button"
                aria-label="刪除紀錄"
                disabled={busy}
                onClick={() => setDeleting(true)}
              >
                <Trash2 size={20} />
              </button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={(event) =>
                event.currentTarget
                  .closest("dialog")
                  ?.dispatchEvent(new Event("cancel", { cancelable: true }))
              }
            >
              取消
            </Button>
            <Button type="submit" busy={busy}>
              {busy ? "儲存中…" : create ? "建立旅程" : "儲存紀錄"}
            </Button>
          </footer>
        )}
      </form>
    </Modal>
  );
}
