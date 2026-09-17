import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BedDouble,
  Check,
  Copy,
  Ellipsis,
  MapPin,
  Plane,
  Plus,
  Utensils,
} from "lucide-react";
import type { Bundle, OpenEditor } from "../lib/types";
import { mapUrl, money, shortDate, zones } from "../lib/domain";
import { Button, Empty } from "../components/ui";

export default function Bookings({
  data,
  edit,
  notify,
}: {
  data: Bundle;
  edit: OpenEditor;
  notify: (message: string) => void;
}) {
  const [kind, setKind] = useState("all");
  const items = data.bookings.filter((b) => kind === "all" || b.kind === kind);
  const labels = { flight: "航班", hotel: "住宿", reservation: "餐廳" };
  const icons = { flight: Plane, hotel: BedDouble, reservation: Utensils };
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">ALL THE DETAILS, ONE PLACE</span>
          <h1>出發前，安心一點。</h1>
          <p>航班、住宿與餐廳訂位，隨時找得到。</p>
        </div>
        <Button onClick={() => edit({ kind: "booking" })}>
          <Plus size={18} />
          新增預訂
        </Button>
      </div>
      <div className="filter-tabs" aria-label="預訂類型">
        {[["all", "全部"], ...Object.entries(labels)].map(([k, label]) => (
          <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>
            {label}
            <span>
              {data.bookings.filter((b) => k === "all" || b.kind === k).length}
            </span>
          </button>
        ))}
      </div>
      <div className="booking-grid">
        {items.length ? (
          items.map((b) => {
            const Icon = icons[b.kind];
            return (
              <article
                className={`card booking-card ${b.kind}`}
                key={b.booking_id}
              >
                <div className="booking-top">
                  <span className="booking-type">
                    <Icon size={18} />
                    {labels[b.kind]}
                  </span>
                  <span className="tag">已安排</span>
                  <button
                    className="icon-button"
                    aria-label={`編輯${b.title}`}
                    onClick={() => edit({ kind: "booking", row: b })}
                  >
                    <Ellipsis size={20} />
                  </button>
                </div>
                <h2>{b.title}</h2>
                <p className="muted">
                  {[b.provider, b.ref_code].filter(Boolean).join(" · ") ||
                    labels[b.kind]}
                </p>
                <div className="booking-times">
                  <div>
                    <strong>
                      {b.kind === "flight"
                        ? b.origin || "出發"
                        : shortDate(b.starts_at)}
                    </strong>
                    <span>
                      {b.kind === "flight" ? `${shortDate(b.starts_at)} ` : ""}
                      {b.starts_at.slice(11, 16)}
                    </span>
                    <small>{zones[b.start_zone] ?? b.start_zone}</small>
                  </div>
                  <div className="booking-arrow">
                    <span />
                    <ArrowRight size={18} />
                    <span />
                  </div>
                  <div>
                    <strong>
                      {b.kind === "flight"
                        ? b.destination || "抵達"
                        : shortDate(b.ends_at)}
                    </strong>
                    <span>
                      {b.kind === "flight" ? `${shortDate(b.ends_at)} ` : ""}
                      {b.ends_at.slice(11, 16)}
                    </span>
                    <small>{zones[b.end_zone] ?? b.end_zone}</small>
                  </div>
                </div>
                {b.place && (
                  <a
                    className="place-link"
                    href={mapUrl(b.place, b.locality, b.gmaps_place_id)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin size={14} />
                    {b.place}
                    <ArrowUpRight size={14} />
                  </a>
                )}
                <div className="ticket-separator" />
                <div className="booking-bottom">
                  <div>
                    <small>預訂代碼</small>
                    <button
                      className="confirmation-code"
                      disabled={!b.confirmation}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(b.confirmation!);
                          notify("已複製預訂代碼");
                        } catch {
                          notify(`預訂代碼：${b.confirmation}`);
                        }
                      }}
                    >
                      {b.confirmation || "尚未填寫"}
                      {b.confirmation && <Copy size={14} />}
                    </button>
                  </div>
                  <div>
                    <small>預訂金額</small>
                    <strong>
                      {b.price === null
                        ? "尚未填寫"
                        : money(b.price, b.price_ccy)}
                    </strong>
                  </div>
                </div>
                {b.notes && <p className="booking-notes">{b.notes}</p>}
              </article>
            );
          })
        ) : (
          <div className="card full-width">
            <Empty
              title="讓下一趟出發更從容"
              action={
                <Button onClick={() => edit({ kind: "booking" })}>
                  新增第一筆預訂
                </Button>
              }
            >
              輸入確認代碼與時間，就不必在信箱裡反覆搜尋。
            </Empty>
          </div>
        )}
      </div>
      <p className="subtle-note">
        <Check size={15} />
        預訂金額不會自動計入支出，付款後再記帳，避免重複計算。
      </p>
    </>
  );
}
