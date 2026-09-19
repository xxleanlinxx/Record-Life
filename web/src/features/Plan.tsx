import { dayColor } from "../lib/presentation";
import { usePageParams } from "../navigation";
import { useEffect, useRef, type CSSProperties } from "react";
import {
  ArrowUpRight,
  Check,
  Ellipsis,
  MapPin,
  Plus,
  Route,
  ShoppingBag,
} from "lucide-react";
import type { Bundle, OpenEditor, Shopping } from "../lib/types";
import {
  addDays,
  directions,
  kinds,
  mapUrl,
  money,
  phase,
  shortDate,
  weekday,
} from "../lib/domain";
import { Button, Empty, Section } from "../components/ui";
import CategoryIcon from "../components/CategoryIcon";

export default function Plan({
  data,
  edit,
  bought,
}: {
  data: Bundle;
  edit: OpenEditor;
  bought: (item: Shopping, value: boolean) => void;
}) {
  const [params, update] = usePageParams();
  const mode = params.get("view") === "shopping" ? "shopping" : "days";
  const setMode = (view: string) => update({ view });
  const requested = Number(params.get("day") ?? phase(data.trip).day);
  const day = Number.isInteger(requested)
    ? Math.max(1, Math.min(data.trip.n_days, requested))
    : phase(data.trip).day;
  const layout = params.get("layout") === "cards" ? "cards" : "timeline";
  const setDay = (day: number) => update({ day: String(day) });
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selected = rail.current?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (selected && rail.current)
      rail.current.scrollLeft =
        selected.offsetLeft -
        rail.current.offsetLeft -
        (rail.current.clientWidth - selected.clientWidth) / 2;
  }, [day, mode]);
  const items = data.itinerary.filter((i) => i.day_no === day),
    date = addDays(data.trip.start_date, day - 1);
  return (
    <div
      className="plan-page"
      style={{ "--day-color": dayColor(day) } as CSSProperties}
    >
      <div className="page-title">
        <div>
          <span className="eyebrow">A LITTLE PLAN, A LOT OF POSSIBILITY</span>
          <h1>把期待，排進每一天。</h1>
        </div>
        <Button
          onClick={() =>
            edit(
              mode === "days"
                ? { kind: "activity", day }
                : { kind: "shopping" },
            )
          }
        >
          <Plus size={18} />
          {mode === "days" ? "新增行程" : "新增物品"}
        </Button>
      </div>
      <div className="segmented" aria-label="計畫內容">
        <button aria-pressed={mode === "days"} onClick={() => setMode("days")}>
          <Route size={17} />
          每日行程
        </button>
        <button
          aria-pressed={mode === "shopping"}
          onClick={() => setMode("shopping")}
        >
          <ShoppingBag size={17} />
          購物清單
          <span className="count">
            {data.shopping.filter((s) => !s.is_bought).length}
          </span>
        </button>
      </div>
      {mode === "days" ? (
        <>
          <div ref={rail} className="day-rail" aria-label="選擇旅行日期">
            {Array.from({ length: data.trip.n_days }, (_, i) => i + 1).map(
              (d) => (
                <button
                  key={d}
                  style={{ "--day-color": dayColor(d) } as CSSProperties}
                  aria-pressed={day === d}
                  onClick={() => setDay(d)}
                >
                  <small>DAY {String(d).padStart(2, "0")}</small>
                  <strong>
                    {shortDate(addDays(data.trip.start_date, d - 1))}
                  </strong>
                  <span>{weekday(addDays(data.trip.start_date, d - 1))}</span>
                  <i
                    className={
                      data.itinerary.some((a) => a.day_no === d)
                        ? "has-plan"
                        : ""
                    }
                  />
                </button>
              ),
            )}
          </div>
          <div className="day-banner">
            <span>Day {String(day).padStart(2, "0")}</span>
            <h2>
              {shortDate(date)}・{weekday(date)}
            </h2>
            <p>
              {items.length
                ? items
                    .slice(0, 3)
                    .map((item) => item.place || item.title)
                    .join(" · ")
                : "把喜歡的地方，慢慢排進今天。"}
            </p>
          </div>
          <div className="segmented layout-switch" aria-label="行程呈現方式">
            <button
              aria-pressed={layout === "timeline"}
              onClick={() => update({ layout: "timeline" })}
            >
              時間軸
            </button>
            <button
              aria-pressed={layout === "cards"}
              onClick={() => update({ layout: "cards" })}
            >
              卡片總覽
            </button>
          </div>
          <Section
            title="景點與活動"
            meta={`${items.length} 個停留點 · 按時間慢慢走`}
          >
            <div className={layout === "cards" ? "activity-grid" : "timeline"}>
              {items.length ? (
                items.map((item, i) => (
                  <div className="timeline-item" key={item.item_id}>
                    <time>{item.start_time}</time>
                    <span className="timeline-node" />
                    <div className="card activity-card">
                      <div className="activity-top">
                        <CategoryIcon category={item.kind} />
                        <span className="tag">{kinds[item.kind]}</span>
                        <button
                          className="icon-button"
                          aria-label={`編輯${item.title}`}
                          onClick={() => edit({ kind: "activity", row: item })}
                        >
                          <Ellipsis size={20} />
                        </button>
                      </div>
                      <h3>{item.title}</h3>
                      {item.place && (
                        <a
                          className="place-link"
                          href={mapUrl(
                            item.place,
                            item.locality,
                            item.gmaps_place_id,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MapPin size={15} />
                          {item.place}
                          <ArrowUpRight size={14} />
                        </a>
                      )}
                      {item.notes && (
                        <p className="activity-notes">{item.notes}</p>
                      )}
                      <div className="activity-footer">
                        <span>
                          {item.planned_cost
                            ? `預計 ${money(item.planned_cost, item.planned_ccy)}`
                            : "不需另外付費"}
                        </span>
                        <button
                          className="text-link"
                          onClick={() => edit({ kind: "activity", row: item })}
                        >
                          編輯
                        </button>
                      </div>
                    </div>
                    {layout === "timeline" &&
                      i < items.length - 1 &&
                      item.place &&
                      items[i + 1].place && (
                        <a
                          className="route-link"
                          href={directions(
                            `${item.place} ${item.locality ?? ""}`,
                            `${items[i + 1].place} ${items[i + 1].locality ?? ""}`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Route size={14} />
                          前往下一站的交通方式
                          <ArrowUpRight size={14} />
                        </a>
                      )}
                  </div>
                ))
              ) : (
                <div className="card">
                  <Empty
                    title="這一天，還是一張白紙"
                    action={
                      <Button onClick={() => edit({ kind: "activity", day })}>
                        <Plus size={17} />
                        安排第一個行程
                      </Button>
                    }
                  >
                    加入景點、餐廳或交通，出發時就能一眼找到。
                  </Empty>
                </div>
              )}
            </div>
            {items.length > 0 && (
              <button
                className="add-dashed"
                onClick={() => edit({ kind: "activity", day })}
              >
                <Plus size={18} />
                再留一個期待
              </button>
            )}
          </Section>
        </>
      ) : (
        <ShoppingList data={data} edit={edit} bought={bought} />
      )}
    </div>
  );
}
function ShoppingList({
  data,
  edit,
  bought,
}: {
  data: Bundle;
  edit: OpenEditor;
  bought: (item: Shopping, value: boolean) => void;
}) {
  const done = data.shopping.filter((s) => s.is_bought).length;
  return (
    <Section
      title="把喜歡的，帶回家"
      meta={`${done} / ${data.shopping.length} 件已買到。勾選只更新清單，按「記帳」才會計入旅費。`}
    >
      <div className="card shopping-list">
        {data.shopping.length ? (
          data.shopping.map((item) => (
            <div
              className={`shopping-row ${item.is_bought ? "bought" : ""}`}
              key={item.item_id}
            >
              <button
                className="check-button"
                aria-label={`${item.is_bought ? "取消已購買" : "標記已購買"}${item.title}`}
                aria-pressed={item.is_bought}
                disabled={!!item.expense_id}
                onClick={() => bought(item, !item.is_bought)}
              >
                {item.is_bought && <Check size={17} />}
              </button>
              <div className="row-copy">
                <strong>{item.title}</strong>
                <small>
                  {item.where_hint || "還沒決定在哪裡買"} ·{" "}
                  {money(item.planned_price, item.planned_ccy)}
                </small>
              </div>
              <div className="shopping-actions">
                {item.expense_id ? (
                  <span className="tag success-tag">已記帳</span>
                ) : (
                  <button
                    className="mini-button"
                    onClick={() => edit({ kind: "expense", shopping: item })}
                  >
                    記帳
                  </button>
                )}
                <button
                  className="icon-button"
                  aria-label={`編輯${item.title}`}
                  onClick={() => edit({ kind: "shopping", row: item })}
                >
                  <Ellipsis size={20} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <Empty
            title="有什麼想帶回家的嗎？"
            action={
              <Button onClick={() => edit({ kind: "shopping" })}>
                新增想買的物品
              </Button>
            }
          >
            伴手禮、選物或一直惦記的小東西，都先記在這裡。
          </Empty>
        )}
      </div>
    </Section>
  );
}
