import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import type { Bundle } from "../lib/types";
import { addDays, shortDate, weekday } from "../lib/domain";
import { dayColor } from "../lib/presentation";
import { Button, Section } from "./ui";
export default function TripDays({ data }: { data: Bundle }) {
  const [expanded, setExpanded] = useState(false);
  const days = Array.from(
    { length: expanded ? data.trip.n_days : Math.min(data.trip.n_days, 6) },
    (_, i) => i + 1,
  );
  const byDay = new Map<number, Bundle["itinerary"]>();
  for (const item of data.itinerary) {
    const items = byDay.get(item.day_no) ?? [];
    items.push(item);
    byDay.set(item.day_no, items);
  }
  return (
    <Section
      title="每一天，都值得期待"
      meta={`${data.trip.n_days} 天的旅行提案`}
    >
      <div className="trip-days">
        {days.map((day) => {
          const items = byDay.get(day) ?? [],
            date = addDays(data.trip.start_date, day - 1);
          return (
            <Link
              to={`/plan?day=${day}`}
              className="trip-day"
              key={day}
              style={{ "--day-color": dayColor(day) } as CSSProperties}
            >
              <div className="trip-day-heading">
                <span>Day {String(day).padStart(2, "0")}</span>
                <small>
                  {shortDate(date)} · {weekday(date)}
                </small>
              </div>
              <div className="trip-day-copy">
                <strong>
                  {items[0]?.place || items[0]?.title || "留一點空白給驚喜"}
                </strong>
                <p>
                  {items.length
                    ? items
                        .slice(0, 3)
                        .map((item) => item.title)
                        .join(" · ")
                    : "景點、美食與沿途的風景，慢慢安排。"}
                </p>
                <span>
                  {items.length} 個停留點 <ArrowUpRight size={16} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {data.trip.n_days > 6 && (
        <Button variant="ghost" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收合日期" : `查看全部 ${data.trip.n_days} 天`}
        </Button>
      )}
    </Section>
  );
}
