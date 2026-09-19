import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { api, API_BASE, DEVICE_MODE } from "../lib/api";
import { errorMessage, money } from "../lib/domain";
import type { Bundle, Editor as EditorType } from "../lib/types";
import { Avatar, Button, Field, Section } from "../components/ui";
import DeviceVault from "../components/DeviceVault";
export default function SettingsPage({
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
      await api.addMember(data.trip.trip_id, name);
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
