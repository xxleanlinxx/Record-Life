"""Travel journal presentation shared by the Streamlit screens."""
import streamlit as st
from html import escape
import pandas as pd
from pathlib import Path
import datetime as dt

CSS = (Path(__file__).with_name("styles.css")).read_text(encoding="utf-8")
DAY_COLORS = ("#b54b28", "#2e6ea0", "#4f722b", "#a33c18", "#99570c")

def day_color(day):
    return DAY_COLORS[(max(1, int(day)) - 1) % len(DAY_COLORS)]

def inject_css():
    st.markdown(f"<style>{CSS}</style>", unsafe_allow_html=True)

def card(inner_html: str, day: int = 1):
    st.markdown(f'<div class="tr-card" style="--day-color:{day_color(day)}">{inner_html}</div>', unsafe_allow_html=True)


def bar(pct: float, marker_pct: float | None = None) -> str:
    m = f'<b style="position:absolute;top:-4px;bottom:-4px;left:{marker_pct:.1f}%;width:1px;background:#1d1f20"></b>' if marker_pct is not None else ""
    return f'<div class="tr-bar"><i style="width:{min(100,max(0,pct)):.1f}%"></i>{m}</div>'

def row(left: str, title: str, sub: str, right: str) -> str:
    return (f'<div class="tr-row"><div class="t">{left}</div><div><div>{title}</div>'
            f'<div class="sub">{sub}</div></div><div class="amt">{right}</div></div>')

def header(kicker: str, title: str, meta: str = ""):
    st.markdown(f'<div class="tr-header"><div class="tr-journal">Travel Journal</div>'
                f'<div class="tr-kicker">{escape(str(kicker))}</div><h2>{escape(str(title))}</h2>'
                f'<div class="tr-mute">{escape(str(meta))}</div>'
                '<svg class="tr-wave" viewBox="0 0 180 20" aria-hidden="true"><path d="M2 10 Q24 0 46 10 T90 10 T134 10 T178 10" fill="none" stroke="currentColor" stroke-width="2"/></svg></div>',
                unsafe_allow_html=True)

def day_header(day: int, title: str, meta: str):
    st.markdown(f'<div class="tr-day-header" style="--day-color:{day_color(day)}">'
                f'<div class="tr-day-title">Day {day:02d}</div><h3>{escape(title)}</h3>'
                f'<p>{escape(meta)}</p></div>', unsafe_allow_html=True)

def trip_days(trip, items):
    """Show a bounded preview; every card opens the real, editable day."""
    st.subheader("Every day, a new chapter")
    with st.container(key="trip_days_preview"):
        for offset in range(0, min(int(trip.n_days), 6), 2):
            for day, col in zip(range(offset + 1, min(offset + 3, int(trip.n_days) + 1)), st.columns(2)):
                part = items[items.day_no == day]
                date = trip.start_date + dt.timedelta(days=day - 1)
                title = text(part.iloc[0].place) or text(part.iloc[0].title) if not part.empty else "Room for discovery"
                stops = " · ".join(part.title.head(3)) if not part.empty else "Add your favourite places and little detours."
                with col:
                    st.markdown(f'<article class="tr-day-card" style="--day-color:{day_color(day)}"><header>'
                                f'<strong>Day {day:02d}</strong><span>{date:%b %d · %a}</span></header><section>'
                                f'<strong>{escape(title)}</strong><p>{escape(stops)}</p></section></article>', unsafe_allow_html=True)
                    if st.button(f"Open Day {day} →", key=f"open_day_{trip.trip_id}_{day}", width="stretch"):
                        st.session_state.requested_day = day
                        st.switch_page("screens/plan.py")
        if trip.n_days > 6:
            st.page_link("screens/plan.py", label=f"Explore all {trip.n_days} days →")


def option_menu(active: str):
    """Top menu switches registered pages, retaining Streamlit's native routes."""
    from streamlit_option_menu import option_menu as render_menu

    names = ["Home", "Plan", "Record", "Bookings", "Budget"]
    labels = ["Home", "Plan", "+ Record", "Bookings", "Budget"]
    index = names.index(active)

    def select_page(key):
        selected = names[labels.index(st.session_state[key])]
        if selected != active:
            st.switch_page(f"screens/{selected.lower()}.py")

    render_menu(
        None, labels, icons=["house", "calendar3", "plus-circle", "journal-bookmark", "wallet2"],
        default_index=index, orientation="horizontal", key=f"top_menu_{active}",
        on_change=select_page,
        styles={
            "container": {"padding": "4px!important", "background-color": "#faf7f0"},
            "nav": {"flex-wrap": "nowrap", "gap": "2px"},
            "nav-item": {"flex": "1 1 0", "min-width": "0"},
            "nav-link": {"font-size": "13px", "padding": "8px 0", "margin": "0",
                         "min-height": "60px", "display": "flex", "flex-direction": "column",
                         "align-items": "center", "justify-content": "center", "white-space": "nowrap",
                         "border-radius": "6px", "color": "#765a43"},
            "icon": {"font-size": "18px", "margin-right": "0"},
            "nav-link-selected": {"background-color": "#b54b28", "color": "#fff"},
        },
    )


def text(value, default=""):
    return default if value is None or pd.isna(value) else str(value)

def context():
    from core import db, services
    con = db.connect()
    tid = st.session_state.get("trip_id")
    if not tid:
        st.info("Create a trip on Home to get started.")
        st.page_link("screens/home.py",label="Go to Home")
        st.stop()
    t = services.trip(con,tid)
    return con,tid,t.home_currency,t

def progress(trip):
    from core import fx
    current = fx.today()
    if current < trip.start_date:
        return 0,int(trip.n_days),"Before departure"
    if current > trip.end_date:
        return int(trip.n_days),0,"Trip completed"
    day = (current-trip.start_date).days+1
    return day,int(trip.n_days)-day+1,f"Day {day} of {trip.n_days}"

def flash():
    message = st.session_state.pop("flash",None)
    if message:
        st.success(message)

def saved(message):
    st.session_state.flash = message
    st.rerun()
