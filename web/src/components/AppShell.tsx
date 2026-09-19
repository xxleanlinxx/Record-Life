import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  Compass,
  Home,
  Plus,
  Settings,
  Wallet,
} from "lucide-react";
import { API_BASE, DEVICE_MODE } from "../lib/api";
import type { Trip } from "../lib/types";
const links = [
  ["/", "Home", Home],
  ["/plan", "Plan", CalendarDays],
  ["/bookings", "Bookings", BookOpen],
  ["/budget", "Budget", Wallet],
] as const;
export default function AppShell({
  children,
  trips,
  selected,
  selectTrip,
  createTrip,
  record,
  canRecord,
}: {
  children: ReactNode;
  trips: Trip[];
  selected?: string;
  selectTrip: (id: string) => void;
  createTrip: () => void;
  record: () => void;
  canRecord: boolean;
}) {
  const item = ([path, label, Icon]: (typeof links)[number]) => (
    <NavLink key={path} to={path} end={path === "/"}>
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
  return (
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
            disabled={!trips.length}
            onChange={(e) => {
              selectTrip(e.target.value);
            }}
          >
            {trips.length ? (
              trips.map((t) => (
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
            onClick={createTrip}
          >
            <Plus size={20} />
          </button>
          <NavLink to="/settings" className="icon-button" aria-label="旅程設定">
            <Settings size={20} />
          </NavLink>
        </div>
      </header>

      <nav className="option-menu" aria-label="主要導覽">
        {links.slice(0, 2).map(item)}
        <button
          className="option-record"
          onClick={record}
          disabled={!canRecord}
          aria-label="+ Record"
        >
          <Plus size={20} aria-hidden="true" />
          <span>Record</span>
        </button>
        {links.slice(2).map(item)}
      </nav>
      {children}
    </div>
  );
}
