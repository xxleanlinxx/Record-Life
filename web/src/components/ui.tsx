import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, ArrowRight, Compass, LoaderCircle } from "lucide-react";

export function Button({
  children,
  variant = "primary",
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={busy || props.disabled}
      className={`button ${variant} ${props.className ?? ""}`}
    >
      {busy ? (
        <LoaderCircle size={18} className="spin" aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Compass size={28} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Section({
  title,
  meta,
  action,
  children,
}: {
  title: string;
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <header className="section-heading">
        <div>
          <h2>{title}</h2>
          {meta && <p>{meta}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar avatar-${index % 4}`} aria-label={name}>
      {name.slice(0, 1)}
    </span>
  );
}
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(100, Math.max(0, value)))}
    >
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  dirty = false,
  busy = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  dirty?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirm, setConfirm] = useState(false);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirm(true);
    else onClose();
  };
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = old;
      const target =
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous !== document.body
          ? previous
          : document.querySelector<HTMLElement>("main");
      target?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="dialog-title"
      onKeyDown={(e) => {
        if (e.key !== "Tab") return;
        const nodes = [
          ...e.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a[href],input:not(:disabled):not([type="hidden"]),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((node) => node.getClientRects().length > 0);
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
    >
      <div className="sheet-handle" />
      <header className="sheet-heading">
        <div>
          <h2 id="dialog-title">{confirm ? "保留未完成的內容？" : title}</h2>
          {!confirm && subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="關閉視窗"
          onClick={requestClose}
          disabled={busy}
        >
          <X size={22} />
        </button>
      </header>
      {confirm ? (
        <div className="discard">
          <p>這些變更尚未儲存。你可以繼續編輯，或捨棄這次變更。</p>
          <div className="actions">
            <Button variant="secondary" onClick={onClose}>
              捨棄變更
            </Button>
            <Button onClick={() => setConfirm(false)}>繼續編輯</Button>
          </div>
        </div>
      ) : (
        children
      )}
    </dialog>
  );
}
export function CardLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-link" onClick={onClick}>
      {children}
      <ArrowRight size={16} />
    </button>
  );
}
