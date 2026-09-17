"""Industry design system on Streamlit — Barlow type, steel accent, blueprint frames."""
import streamlit as st
from html import escape
import pandas as pd

CSS = """
<style>
@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;700&family=Barlow+Condensed:wght@400;600&display=swap');
:root{--ink:#1d1f20;--paper:#f2f2f3;--acc:#5980a6;--acc700:#416180;--acc900:#1d2d3d;--mute:rgba(29,31,32,.55);--rule:rgba(29,31,32,.16)}
html,body,[class*="css"],.stApp{font-family:'Barlow',system-ui,sans-serif;color:var(--ink);background:var(--paper)}
h1,h2,h3,.tr-h{font-family:'Barlow Condensed',system-ui,sans-serif!important;font-weight:600!important;letter-spacing:-.015em;line-height:1.05}
.block-container{max-width:440px;padding:1.2rem 1.1rem 6rem}
.st-key-bottom_nav{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:min(100%,440px);padding:10px 12px max(14px,env(safe-area-inset-bottom));background:var(--paper);border-top:1px solid var(--rule);z-index:99}
.st-key-bottom_nav [data-testid="stHorizontalBlock"]{gap:4px;flex-wrap:nowrap}
.st-key-bottom_nav [data-testid="stColumn"]{min-width:0!important}
.st-key-bottom_nav [data-testid="stPageLink"] a{font-size:12px;padding:5px 2px;justify-content:center}
.stButton>button{border-radius:0!important;border:1px solid var(--rule);font-family:'Barlow Condensed';font-weight:600;font-size:15px}
.stButton>button[kind="primary"]{background:var(--acc);border-color:var(--acc);color:var(--paper)}
.stButton>button[kind="primary"]:hover{background:#597ea3}
div[data-baseweb="input"] input,div[data-baseweb="select"]>div{border-radius:0!important;background:#e9e9ea}
div[data-testid="stRadio"] label{font-size:13px}
a.tr-map{font-size:11px;color:var(--acc700);text-decoration:none;letter-spacing:.04em}
.tr-kicker{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--acc)}
.tr-num{font-family:'Barlow Condensed';font-weight:600;font-size:40px;line-height:1}
.tr-mute{font-size:12px;color:var(--mute)}
.tr-bp{position:relative;border:1px solid var(--rule);padding:14px;margin:8px 0 14px;display:flex;flex-direction:column;gap:8px}
.tr-bp .c{position:absolute;width:11px;height:11px;color:rgba(29,31,32,.55)}
.tr-bp .c:before,.tr-bp .c:after{content:"";position:absolute;background:currentColor}
.tr-bp .c:before{left:5px;top:0;width:1px;height:100%}.tr-bp .c:after{top:5px;left:0;width:100%;height:1px}
.tr-bp .tl{top:-6px;left:-6px}.tr-bp .tr{top:-6px;right:-6px}.tr-bp .bl{bottom:-6px;left:-6px}.tr-bp .br{bottom:-6px;right:-6px}
.tr-bar{height:8px;border:1px solid rgba(29,31,32,.3);position:relative}
.tr-bar>i{position:absolute;inset:0;background:var(--acc)}
.tr-row{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid rgba(29,31,32,.1);font-size:14px}
.tr-row .t{font-family:'Barlow Condensed';font-weight:600;font-size:15px}
.tr-row .sub{font-size:11px;color:var(--mute)}
.tr-row .amt{font-family:'Barlow Condensed';font-weight:600;font-size:16px;text-align:right}
.tr-tag{display:inline-block;font-size:10px;padding:2px 8px;background:#f5f5f8;color:#424244;letter-spacing:.02em}
.tr-tabs{position:fixed;left:0;right:0;bottom:0;display:grid;grid-template-columns:1fr 1fr 64px 1fr 1fr;border-top:1px solid rgba(29,31,32,.3);background:var(--paper);padding:6px 8px 14px;z-index:99;max-width:440px;margin:0 auto}
.tr-tabs a{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 0;font-size:10px;letter-spacing:.08em;text-transform:uppercase;text-decoration:none;color:var(--mute)}
.tr-tabs a.on{color:var(--acc)}
.tr-tabs a.plus{margin-top:-22px;width:52px;height:52px;background:var(--acc);color:var(--paper);justify-self:center;justify-content:center;font-size:26px;font-family:'Barlow Condensed'}
[data-testid="stSidebarNav"]{display:none}
</style>
"""

def inject_css():
    st.markdown(CSS, unsafe_allow_html=True)

def corners() -> str:
    return '<i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>'

def blueprint(inner_html: str):
    st.markdown(f'<div class="tr-bp">{corners()}{inner_html}</div>', unsafe_allow_html=True)

def bar(pct: float, marker_pct: float | None = None) -> str:
    m = f'<b style="position:absolute;top:-4px;bottom:-4px;left:{marker_pct:.1f}%;width:1px;background:#1d1f20"></b>' if marker_pct is not None else ""
    return f'<div class="tr-bar"><i style="width:{min(100,max(0,pct)):.1f}%"></i>{m}</div>'

def row(left: str, title: str, sub: str, right: str) -> str:
    return (f'<div class="tr-row"><div class="t">{left}</div><div><div>{title}</div>'
            f'<div class="sub">{sub}</div></div><div class="amt">{right}</div></div>')

def header(kicker: str, title: str, meta: str = ""):
    st.markdown(f'<div class="tr-kicker">{escape(str(kicker))}</div><h2 style="margin:2px 0 0">{escape(str(title))}</h2>'
                f'<div class="tr-mute">{escape(str(meta))}</div>', unsafe_allow_html=True)

def tab_bar(active: str):
    with st.container(key="bottom_nav"):
        for col,name in zip(st.columns(5),["Home","Plan","Record","Bookings","Budget"]):
            col.page_link(f"screens/{name.lower()}.py",label="＋ Record" if name=="Record" else name)

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
