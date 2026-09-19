import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Compass, Plus, RefreshCw, X } from "lucide-react";
import { api, ApiError, DEVICE_MODE } from "./lib/api";
import { errorMessage } from "./lib/domain";
import type { Editor as EditorType, Shopping } from "./lib/types";
import { Button, Empty, Field } from "./components/ui";
import AppShell from "./components/AppShell";
import DeviceVault from "./components/DeviceVault";
import SettingsPage from "./features/Settings";
import { NavigationState, usePageMemory } from "./navigation";
import Overview from "./features/Overview";
import Plan from "./features/Plan";
import Bookings from "./features/Bookings";
import Budget from "./features/Budget";
import Editor from "./features/Editor";

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
  const pageMemory = usePageMemory(selected);
  const notify = (message: string) => setToast(message);
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
  async function reloadTrip() {
    await client.invalidateQueries({ queryKey: ["trip", selected] });
  }
  async function reload() {
    await client.invalidateQueries();
  }
  async function saved(id?: string) {
    if (id || editor?.kind === "trip" || editor?.kind === "currency")
      await client.invalidateQueries({ queryKey: ["bootstrap"] });
    if (id) {
      setTid(id);
      navigate("/");
    }
    await reloadTrip();
    setEditor(null);
    notify("已儲存，旅程資料已更新");
  }
  async function bought(item: Shopping, value: boolean) {
    try {
      await api.markBought(
        selected!,
        item.item_id,
        value,
        bundle.data!.revision,
      );
      await reloadTrip();
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
    <NavigationState.Provider value={pageMemory}>
      <div className="app-shell">
        <a className="skip-link" href="#main">
          跳至主要內容
        </a>
        <AppShell
          trips={boot.data?.trips ?? []}
          selected={selected}
          selectTrip={(id) => {
            setTid(id);
            navigate("/");
          }}
          createTrip={() => setEditor({ kind: "trip", create: true })}
          record={() => setEditor({ kind: "expense" })}
          canRecord={!!data}
        >
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
                <Button
                  onClick={() => setEditor({ kind: "trip", create: true })}
                >
                  <Plus size={18} />
                  建立第一趟旅程
                </Button>
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      const r = await api.loadDemo();
                      await saved(r.trip_id);
                    } catch (e) {
                      notify(errorMessage(e));
                    }
                  }}
                >
                  先看看京都旅行範例
                </button>
                {DEVICE_MODE && (
                  <DeviceVault
                    compact
                    reload={async () => {
                      await client.invalidateQueries();
                    }}
                    notify={notify}
                  />
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
                    reload={async () => {
                      await client.invalidateQueries();
                    }}
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
        </AppShell>
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
    </NavigationState.Provider>
  );
}
