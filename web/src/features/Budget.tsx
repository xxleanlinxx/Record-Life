import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import type { Bundle, OpenEditor } from "../lib/types";
import {
  categories,
  settlementBalances,
  money,
  phase,
  settlements,
  shortDate,
} from "../lib/domain";
import { Avatar, Button, Empty, Progress, Section } from "../components/ui";
import CategoryIcon from "../components/CategoryIcon";

export default function Budget({
  data,
  edit,
}: {
  data: Bundle;
  edit: OpenEditor;
}) {
  const [view, setView] = useState("category"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const { trip } = data,
    H = trip.home_currency,
    spent = data.daily.reduce((s, d) => s + d.spent_home, 0),
    remaining = trip.budget_home - spent,
    p = phase(trip);
  const balances = settlementBalances(data.balances);
  const transfers = settlements(balances);
  const entries = data.expenses.filter(
    (e) =>
      (filter === "all" || e.category === filter) &&
      `${e.title} ${e.payer}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">SPEND WELL, TRAVEL FREELY</span>
          <h1>旅費清楚，玩得自在。</h1>
        </div>
        <Button onClick={() => edit({ kind: "expense" })}>
          <Plus size={18} />
          記一筆
        </Button>
      </div>
      <div className="budget-summary">
        <div className="card">
          <span>
            <Wallet size={16} />
            已花費
          </span>
          <strong>{money(spent, H)}</strong>
          <small>共 {data.expenses.length} 筆支出</small>
        </div>
        <div className="card highlighted">
          <span>剩餘預算</span>
          <strong className={remaining < 0 ? "negative" : ""}>
            {money(remaining, H)}
          </strong>
          <small>
            {remaining < 0
              ? "已超出原訂預算"
              : p.left > 0
                ? `接下來每天約 ${money(remaining / p.left, H)}`
                : "旅程已結束"}
          </small>
        </div>
        <button
          className="card budget-edit"
          onClick={() => edit({ kind: "trip" })}
        >
          <span>
            總預算
            <ArrowUpRight size={16} />
          </span>
          <strong>{money(trip.budget_home, H)}</strong>
          <small>調整預算</small>
        </button>
      </div>
      <div className="budget-grid">
        <Section
          title="花在哪裡，一目了然"
          action={
            <div className="small-tabs">
              <button
                aria-pressed={view === "category"}
                onClick={() => setView("category")}
              >
                分類
              </button>
              <button
                aria-pressed={view === "daily"}
                onClick={() => setView("daily")}
              >
                每日
              </button>
            </div>
          }
        >
          <div className="card breakdown">
            {view === "category" ? (
              data.categories.map((c) => (
                <div className="category-budget" key={c.category}>
                  <div>
                    <CategoryIcon category={c.category} />
                    <strong>{categories[c.category]}</strong>
                    <span>{money(c.actual_home, H)}</span>
                  </div>
                  <Progress
                    value={
                      c.planned_home
                        ? (c.actual_home / c.planned_home) * 100
                        : spent
                          ? (c.actual_home / spent) * 100
                          : 0
                    }
                    label={`${categories[c.category]}預算使用比例`}
                  />
                  <p>
                    {c.planned_home
                      ? `預算 ${money(c.planned_home, H)}`
                      : "尚未配置分類預算"}
                    {c.planned_home > 0 && c.actual_home > c.planned_home && (
                      <span className="negative">
                        超出 {money(c.actual_home - c.planned_home, H)}
                      </span>
                    )}
                  </p>
                </div>
              ))
            ) : (
              <div className="day-chart" aria-label="每日支出">
                {data.daily.map((d) => (
                  <div className="day-chart-row" key={d.day_no}>
                    <span>{d.day_no === 0 ? "行前" : `D${d.day_no}`}</span>
                    <div>
                      <i
                        style={{
                          width: `${(d.spent_home / Math.max(...data.daily.map((x) => x.spent_home), 1)) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{money(d.spent_home, H)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Section>
        <Section title="一起旅行，分帳也簡單" meta="依每筆支出選擇的旅伴分攤">
          <div className="card balances">
            {balances.map((b, i) => (
              <div className="balance-row" key={b.member_id}>
                <Avatar name={b.display_name} index={i} />
                <div>
                  <strong>{b.display_name}</strong>
                  <small>已付 {money(b.paid_home, H)}</small>
                </div>
                <div className="balance-result">
                  <strong>{money(Math.abs(b.balance_home), H)}</strong>
                  <small>
                    {b.balance_home > 0.005
                      ? "應收回"
                      : b.balance_home < -0.005
                        ? "需補付"
                        : "已結清"}
                  </small>
                </div>
              </div>
            ))}
            {transfers.length > 0 && (
              <div className="settlements">
                <h3>
                  <Users size={16} />
                  建議結算
                </h3>
                <small className="muted">
                  以小數點後兩位分配尾差，收付總額一致。
                </small>
                {transfers.map((s, i) => (
                  <p key={i}>
                    <span>
                      {s.from}
                      <ArrowRight size={13} />
                      {s.to}
                    </span>
                    <strong>{money(s.amount, H)}</strong>
                  </p>
                ))}
              </div>
            )}
          </div>
        </Section>
      </div>
      <Section
        title="每一筆，都記得"
        meta={`${data.expenses.length} 筆紀錄 · 點選一筆可編輯`}
      >
        <div className="entry-toolbar">
          <label className="search">
            <Search size={18} />
            <input
              aria-label="搜尋支出"
              placeholder="搜尋花費或付款人"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="篩選支出分類"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">所有分類</option>
            {Object.entries(categories).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="card expense-list">
          {entries.length ? (
            entries.map((e) => (
              <button
                className="expense-row"
                key={e.expense_id}
                onClick={() => edit({ kind: "expense", row: e })}
              >
                <CategoryIcon category={e.category} />
                <span className="row-copy">
                  <strong>{e.title}</strong>
                  <small>
                    {shortDate(e.spent_at)} · {e.payer} 付款 ·{" "}
                    {e.day_no === 0 ? "行前" : `Day ${e.day_no}`}
                  </small>
                </span>
                <span className="row-amount">
                  <strong>{money(e.amount_home, H)}</strong>
                  <small>
                    {e.currency !== H
                      ? money(e.amount, e.currency)
                      : categories[e.category]}
                  </small>
                </span>
              </button>
            ))
          ) : (
            <Empty
              title={
                data.expenses.length ? "沒有符合的紀錄" : "從第一筆花費開始"
              }
            >
              {data.expenses.length
                ? "換個關鍵字或分類試試。"
                : "記下每一筆，預算就會自動更新。"}
            </Empty>
          )}
        </div>
      </Section>
    </>
  );
}
