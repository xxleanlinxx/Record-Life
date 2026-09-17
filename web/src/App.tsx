import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  BookOpen,
  CalendarDays,
  Compass,
  Download,
  Home,
  Plus,
  RefreshCw,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { api, ApiError, API_BASE, DEVICE_MODE } from "./lib/api";
import { errorMessage, money } from "./lib/domain";
import type { Bundle, Editor as EditorType, Shopping } from "./lib/types";
import { Avatar, Button, Empty, Field, Section } from "./components/ui";
import DeviceVault from "./components/DeviceVault";
import Overview from "./features/Overview";
import Plan from "./features/Plan";
import Bookings from "./features/Bookings";
import Budget from "./features/Budget";
import Editor from "./features/Editor";

const links = [
  ["/", "總覽", Home],
  ["/plan", "行程", CalendarDays],
  ["/bookings", "預訂", BookOpen],
  ["/budget", "預算", Wallet],
] as const;
export default function App() {
  const client = useQueryClient(),
    location = useLocation(),
    navigate = useNavigate();
  const [tid, setTid] = useState(
      () => localStorage.getItem("record-life-trip") ?? "",
    ),
    [editor, setEditor] = useState<EditorType | null>(null),
    [toast, setToast] = useState(""),
    [password, setPassword] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const boot = useQuery({ queryKey: ["bootstrap"], queryFn: api.bootstrap }),
    selected = boot.data?.trips.some((t) => t.trip_id === tid)
      ? tid
      : boot.data?.trips[0]?.trip_id;
  const bundle = useQuery({
    queryKey: ["trip", selected],
    queryFn: () => api.trip(selected!),
    enabled: !!selected,
  });
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (!document.querySelector("dialog[open]"))
      document
        .querySelector<HTMLElement>("main")
        ?.focus({ preventScroll: true });
  }, [location.pathname, selected]);
  useEffect(() => {
    if (selected) localStorage.setItem("record-life-trip", selected);
  }, [selected]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    if (location.pathname === "/record" && bundle.data) {
      setEditor({ kind: "expense" });
      navigate("/", { replace: true });
    }
  }, [location.pathname, bundle.data, navigate]);
  async function reload() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["bootstrap"] }),
      client.invalidateQueries({ queryKey: ["trip"] }),
    ]);
  }
  async function saved(id?: string) {
    if (id) {
      setTid(id);
      navigate("/");
    }
    await reload();
    setEditor(null);
    notify("已儲存，旅程資料已更新");
  }
  async function bought(item: Shopping, value: boolean) {
    try {
      await api.write(
        `/trips/${selected}/shopping/${item.item_id}`,
        { bought: value },
        "PATCH",
        bundle.data!.revision,
      );
      await reload();
    } catch (e) {
      notify(errorMessage(e));
      await reload();
    }
  }
  async function refresh() {
    setRefreshing(true);
    try {
      const result = await api.refresh();
      await reload();
      notify(
        result.error
          ? `暫時無法取得更新：${result.error}`
          : `匯率已更新至 ${result.date}`,
      );
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }
  const attemptedFx = useRef(false);
  useEffect(() => {
    if (boot.data && !attemptedFx.current) {
      attemptedFx.current = true;
      if (!boot.data.fx.date || boot.data.fx.date < boot.data.fx.target_date)
        void refresh();
    }
  }, [boot.data]);
  const error = boot.error ?? bundle.error,
    unauthorized = error instanceof ApiError && error.status === 401;
  const data = bundle.data;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳至主要內容
      </a>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Record Life 首頁">
          <span>
            <Compass size={24} />
          </span>
          <div>
            record life<small>你的旅行，值得記下。</small>
          </div>
        </a>
        <div className="sidebar-label">TRAVEL JOURNAL</div>
        <nav aria-label="主要導覽">
          {links.map(([path, label, Icon]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              <Icon size={20} />
              {label}
              <ArrowUpRight size={15} />
            </NavLink>
          ))}
        </nav>
        <Button
          className="sidebar-record"
          onClick={() => setEditor({ kind: "expense" })}
          disabled={!data}
        >
          <Plus size={20} />
          記一筆花費
        </Button>
        <div className="sidebar-bottom">
          <span className="tiny-compass">
            <Compass size={28} strokeWidth={1} />
          </span>
          <p>
            收集風景，
            <br />
            也收集生活。
          </p>
          <NavLink to="/settings">
            <Settings size={18} />
            旅程設定
          </NavLink>
          <small>
            {DEVICE_MODE ? "裝置內儲存" : API_BASE ? "伺服器儲存" : "本機儲存"}{" "}
            · Record Life
          </small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <Compass size={22} />
            <strong>record life</strong>
          </div>
          <div className="trip-switch">
            <label className="sr-only" htmlFor="trip-selector">
              目前旅程
            </label>
            <select
              id="trip-selector"
              value={selected ?? ""}
              disabled={!boot.data?.trips.length}
              onChange={(e) => {
                setTid(e.target.value);
                navigate("/");
              }}
            >
              {boot.data?.trips.length ? (
                boot.data.trips.map((t) => (
                  <option key={t.trip_id} value={t.trip_id}>
                    {t.name}
                  </option>
                ))
              ) : (
                <option>準備你的第一趟旅行</option>
              )}
            </select>
          </div>
          <div className="topbar-actions">
            <span className="local-status">
              <i />
              {DEVICE_MODE
                ? "資料在此裝置"
                : API_BASE
                  ? "已連接資料庫"
                  : "本機資料庫"}
            </span>
            <button
              className="icon-button"
              aria-label="新增旅程"
              onClick={() => setEditor({ kind: "trip", create: true })}
            >
              <Plus size={20} />
            </button>
            <NavLink
              to="/settings"
              className="icon-button"
              aria-label="旅程設定"
            >
              <Settings size={20} />
            </NavLink>
          </div>
        </header>
        <main id="main" tabIndex={-1} key={selected ?? "empty"}>
          {unauthorized ? (
            <div className="card onboarding">
              <h1>開啟你的旅行手帳</h1>
              <p>輸入此資料庫的存取密碼。</p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  sessionStorage.setItem("record-life-token", password);
                  await reload();
                }}
              >
                <Field label="存取密碼">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Button>開啟手帳</Button>
              </form>
            </div>
          ) : boot.isPending || (bundle.isPending && !!selected) ? (
            <div className="loading-state" role="status">
              <RefreshCw className="spin" />
              正在打開旅行手帳…
              {DEVICE_MODE && <small>首次載入資料引擎可能需要一點時間</small>}
            </div>
          ) : error && !data ? (
            <div className="card">
              <Empty
                title="暫時無法開啟手帳"
                action={<Button onClick={reload}>重新連線</Button>}
              >
                {errorMessage(error)}
              </Empty>
            </div>
          ) : !selected ? (
            <div className="card onboarding">
              <span className="eyebrow">YOUR NEXT CHAPTER</span>
              <Compass size={56} strokeWidth={1} />
              <h1>把旅行，記成自己的故事。</h1>
              <p>
                安排每天的期待，收好預訂，
                <br />
                也讓每一筆旅費心裡有數。
              </p>
              <Button onClick={() => setEditor({ kind: "trip", create: true })}>
                <Plus size={18} />
                建立第一趟旅程
              </Button>
              <button
                className="text-link"
                onClick={async () => {
                  try {
                    const r = await api.write<{ trip_id: string }>("/demo", {});
                    await saved(r.trip_id);
                  } catch (e) {
                    notify(errorMessage(e));
                  }
                }}
              >
                先看看京都旅行範例
              </button>
              {DEVICE_MODE && (
                <DeviceVault compact reload={reload} notify={notify} />
              )}
            </div>
          ) : data ? (
            <>
              {error && (
                <div className="error-banner" role="alert">
                  連線暫時中斷，目前顯示上次資料。
                  <button onClick={reload}>重新載入</button>
                </div>
              )}
              {location.pathname === "/plan" ? (
                <Plan data={data} edit={setEditor} bought={bought} />
              ) : location.pathname === "/bookings" ? (
                <Bookings data={data} edit={setEditor} notify={notify} />
              ) : location.pathname === "/budget" ? (
                <Budget data={data} edit={setEditor} />
              ) : location.pathname === "/settings" ? (
                <SettingsPage
                  data={data}
                  edit={setEditor}
                  refresh={refresh}
                  refreshing={refreshing}
                  reload={reload}
                  notify={notify}
                />
              ) : (
                <Overview data={data} edit={setEditor} />
              )}
            </>
          ) : null}
        </main>
        <footer className="page-footer">
          記下每一站，也記得享受當下。<span>RECORD LIFE</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="手機導覽">
        {links.slice(0, 2).map(([path, label, Icon]) => (
          <NavLink key={path} to={path} end={path === "/"}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          className="mobile-record"
          onClick={() => setEditor({ kind: "expense" })}
          disabled={!data}
        >
          <span>
            <Plus size={24} />
          </span>
          記帳
        </button>
        {links.slice(2).map(([path, label, Icon]) => (
          <NavLink key={path} to={path}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <div
        className={`toast ${toast ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toast && (
          <>
            <span>{toast}</span>
            <button aria-label="關閉通知" onClick={() => setToast("")}>
              <X size={16} />
            </button>
          </>
        )}
      </div>
      {editor && (data || (editor.kind === "trip" && editor.create)) && (
        <Editor
          editor={editor}
          data={data}
          close={() => setEditor(null)}
          saved={saved}
          reload={reload}
        />
      )}
    </div>
  );
}
function SettingsPage({
  data,
  edit,
  refresh,
  refreshing,
  reload,
  notify,
}: {
  data: Bundle;
  edit: (e: EditorType) => void;
  refresh: () => void;
  refreshing: boolean;
  reload: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.write(`/trips/${data.trip.trip_id}/members`, { name });
      setName("");
      await reload();
      notify("已加入旅伴");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    setExporting(true);
    try {
      const json = await api.backup(),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(json, null, 2)], {
            type: "application/json",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = `record-life-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("資料匯出完成");
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>你的旅程，你的步調。</h1>
        </div>
      </div>
      <div className="settings-grid">
        <Section title="旅程資料">
          <div className="card settings-card">
            <h3>{data.trip.name}</h3>
            <p>
              {data.trip.start_date.slice(0, 10)} —{" "}
              {data.trip.end_date.slice(0, 10)}
            </p>
            <p>
              總預算 {money(data.trip.budget_home, data.trip.home_currency)} ·
              當地幣別 {data.trip.local_currency}
            </p>
            <div className="actions">
              <Button
                variant="secondary"
                onClick={() => edit({ kind: "trip" })}
              >
                編輯旅程與預算
              </Button>
              <Button
                variant="ghost"
                onClick={() => edit({ kind: "currency" })}
              >
                更換本位幣
              </Button>
            </div>
          </div>
        </Section>
        <Section title="旅行夥伴">
          <div className="card settings-card">
            <div className="member-list">
              {data.members.map((m, i) => (
                <div key={m.member_id}>
                  <Avatar name={m.display_name} index={i} />
                  <span>{m.display_name}</span>
                  {m.is_owner && <small>旅程建立者</small>}
                </div>
              ))}
            </div>
            <form className="inline-form" onSubmit={add}>
              <Field label="新增旅伴">
                <input
                  required
                  maxLength={80}
                  value={name}
                  placeholder="旅伴名字"
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Button type="submit" busy={busy}>
                加入
              </Button>
            </form>
          </div>
        </Section>
        <Section title="匯率與換算">
          <div className="card settings-card">
            <span className="tag">
              {data.fx.date ? `資料日期 ${data.fx.date}` : "尚未取得匯率"}
            </span>
            <p>
              採用前一日或最近可用的歷史匯率。每筆花費儲存時鎖定換算金額，之後更新匯率不會改動舊帳。
            </p>
            <small className="muted">
              來源：{data.fx.source ?? "—"} · 目標日期 {data.fx.target_date}
            </small>
            <Button variant="secondary" onClick={refresh} busy={refreshing}>
              <RefreshCw size={16} />
              更新匯率
            </Button>
          </div>
        </Section>
        <Section title="資料與備份">
          {DEVICE_MODE ? (
            <div className="card settings-card">
              <DeviceVault reload={reload} notify={notify} />
            </div>
          ) : (
            <div className="card settings-card">
              <h3>你的旅行，留在自己的資料庫。</h3>
              <p>
                {API_BASE ? "目前儲存在已連接的伺服器。" : "目前儲存在本機。"}
                匯出包含所有旅程、原始支出與匯率資料的
                JSON；匯入還原目前需由管理者操作。
              </p>
              <Button variant="secondary" onClick={backup} busy={exporting}>
                <Download size={16} />
                匯出所有旅程
              </Button>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
