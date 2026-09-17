import {
  ArrowUpRight,
  CalendarDays,
  Plus,
  MapPin,
  Wallet,
  Plane,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Bundle, OpenEditor } from "../lib/types";
import { money, phase, shortDate, mapUrl, categories } from "../lib/domain";
import {
  Avatar,
  Button,
  CardLink,
  Empty,
  Progress,
  Section,
} from "../components/ui";
import CategoryIcon from "../components/CategoryIcon";

export default function Overview({
  data,
  edit,
}: {
  data: Bundle;
  edit: OpenEditor;
}) {
  const nav = useNavigate(),
    { trip } = data,
    p = phase(trip);
  const spent = data.daily.reduce((s, d) => s + d.spent_home, 0),
    remaining = trip.budget_home - spent;
  const items = data.itinerary.filter((i) => i.day_no === p.day);
  const ratio = trip.budget_home ? (spent / trip.budget_home) * 100 : 0;
  return (
    <>
      <div className="journey-hero">
        <div>
          <span className="eyebrow">
            <span className="status-dot" />
            {p.label}
          </span>
          <h1>{trip.name}</h1>
          <p>
            <CalendarDays size={16} />
            {shortDate(trip.start_date)} — {shortDate(trip.end_date)}
            <span className="dot-separator">·</span>
            {trip.n_days} 天的旅行
          </p>
          <div className="hero-members">
            <div className="avatar-stack">
              {data.members.slice(0, 4).map((m, i) => (
                <Avatar key={m.member_id} name={m.display_name} index={i} />
              ))}
            </div>
            <span>
              {data.members.length === 1
                ? "一個人的自在旅行"
                : `${data.members.length} 位旅伴，一起出發`}
            </span>
          </div>
        </div>
        <div className="hero-stamp" aria-hidden="true">
          <Plane size={40} strokeWidth={1} />
          <span>
            GO SOMEWHERE
            <br />
            MAKE MEMORIES
          </span>
        </div>
      </div>
      <div className="overview-grid">
        <div>
          <Section
            title={
              p.before
                ? "第一天，從這裡開始"
                : p.after
                  ? "旅行最後一天"
                  : "今天的安排"
            }
            meta={`DAY ${String(p.day).padStart(2, "0")} · ${items.length} 個停留點`}
            action={<CardLink onClick={() => nav("/plan")}>完整行程</CardLink>}
          >
            <div className="card timeline-preview">
              {items.length ? (
                items.slice(0, 4).map((item, index) => (
                  <div className="preview-stop" key={item.item_id}>
                    <div className="stop-line">
                      <i />
                      {index < Math.min(items.length, 4) - 1 && <span />}
                    </div>
                    <time>{item.start_time}</time>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.place || item.notes || "讓今天多一點期待"}</p>
                    </div>
                    {item.place && (
                      <a
                        className="icon-button"
                        href={mapUrl(
                          item.place,
                          item.locality,
                          item.gmaps_place_id,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`在 Google Maps 開啟${item.title}`}
                      >
                        <ArrowUpRight size={18} />
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <Empty
                  title="第一個停留點，想去哪裡？"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => edit({ kind: "activity", day: p.day })}
                    >
                      <Plus size={16} />
                      新增行程
                    </Button>
                  }
                >
                  景點、餐廳或散步的街道，都可以放進來。
                </Empty>
              )}
            </div>
          </Section>
          <Section
            title="最近記下的花費"
            action={
              <CardLink onClick={() => nav("/budget")}>全部支出</CardLink>
            }
          >
            <div className="card expense-list">
              {data.expenses.length ? (
                data.expenses.slice(0, 4).map((e) => (
                  <button
                    className="expense-row"
                    key={e.expense_id}
                    onClick={() => edit({ kind: "expense", row: e })}
                  >
                    <CategoryIcon category={e.category} />
                    <span className="row-copy">
                      <strong>{e.title}</strong>
                      <small>
                        {e.payer} 付款 · {categories[e.category]} ·{" "}
                        {shortDate(e.spent_at)}
                      </small>
                    </span>
                    <span className="row-amount">
                      <strong>
                        {money(e.amount_home, trip.home_currency)}
                      </strong>
                      {e.currency !== trip.home_currency && (
                        <small>{money(e.amount, e.currency)}</small>
                      )}
                    </span>
                  </button>
                ))
              ) : (
                <Empty
                  title="還沒有支出紀錄"
                  action={
                    <Button
                      variant="secondary"
                      onClick={() => edit({ kind: "expense" })}
                    >
                      記下第一筆
                    </Button>
                  }
                >
                  先把預算準備好，旅途中再慢慢記錄。
                </Empty>
              )}
            </div>
          </Section>
        </div>
        <aside className="overview-aside">
          <Section title="旅費，心裡有個底">
            <div className="card budget-card">
              <div className="card-kicker">
                <Wallet size={17} />
                剩餘預算
              </div>
              <div className={`large-money ${remaining < 0 ? "negative" : ""}`}>
                {money(remaining, trip.home_currency)}
              </div>
              <p>總預算 {money(trip.budget_home, trip.home_currency)}</p>
              <Progress value={ratio} label="已使用預算" />
              <div className="budget-foot">
                <span>已花費 {money(spent, trip.home_currency)}</span>
                <strong>{Math.round(ratio)}%</strong>
              </div>
              {p.left > 0 && trip.budget_home > 0 && (
                <div className="daily-allowance">
                  <span>接下來每天約可花</span>
                  <strong>
                    {money(Math.max(0, remaining / p.left), trip.home_currency)}
                  </strong>
                </div>
              )}
              <Button variant="secondary" onClick={() => nav("/budget")}>
                查看預算明細
                <ArrowUpRight size={16} />
              </Button>
            </div>
          </Section>
          <div className="note-card">
            <MapPin size={22} />
            <h3>計畫之外，也值得記下。</h3>
            <p>
              多留一點時間給巷口的咖啡店，
              <br />
              或是剛好遇見的風景。
            </p>
          </div>
          <div className="fx-note">
            <span className={`status-dot ${data.fx.date ? "" : "muted-dot"}`} />
            {data.fx.date ? `換算匯率 ${data.fx.date}` : "尚未同步匯率"}
            <button onClick={() => nav("/settings")}>查看</button>
          </div>
        </aside>
      </div>
    </>
  );
}
