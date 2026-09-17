import streamlit as st
from core import db, fx, ui, services

st.set_page_config(page_title="Record-Life",layout="centered",initial_sidebar_state="collapsed")
ui.inject_css()
con = db.connect()
pages = [st.Page(f"screens/{name.lower()}.py",title=name,default=name=="Home")
    for name in ["Home","Plan","Record","Bookings","Budget"]]
navigation = st.navigation(pages,position="hidden")
trips = db.q(con,"select trip_id,name from dim_trip order by start_date desc,trip_id")
if "pending_trip" in st.session_state:
    st.session_state.trip_id = st.session_state.pop("pending_trip")
    st.session_state.pop("trip_selector",None)
if not trips.empty and st.session_state.get("trip_id") not in trips.trip_id.tolist():
    st.session_state.trip_id = trips.trip_id.iloc[0]

if st.session_state.get("_fx_checked_day") != fx.d_minus_1():
    st.session_state.fx_status = fx.ensure_rates(con)
    st.session_state._fx_checked_day = fx.d_minus_1()

with st.sidebar:
    st.subheader("Settings")
    if not trips.empty:
        labels = dict(zip(trips.trip_id,trips.name))
        if "trip_selector" not in st.session_state:
            st.session_state.trip_selector = st.session_state.trip_id
        tid = st.selectbox("Trip",list(labels),format_func=labels.get,key="trip_selector")
        st.session_state.trip_id = tid
        trip = services.trip(con,tid)
        st.session_state.home_currency = trip.home_currency
        with st.form(f"currency_{tid}_{trip.home_currency}"):
            home = st.selectbox("Home currency",fx.HOME_CURRENCIES,index=fx.HOME_CURRENCIES.index(trip.home_currency))
            st.caption("Budget and recorded totals are converted together; original payments and saved rates remain traceable.")
            if st.form_submit_button("Convert home currency"):
                try:
                    services.change_home_currency(con,tid,home)
                    ui.saved(f"Home currency updated to {home}.")
                except ValueError as exc:
                    st.error(str(exc))
    status = st.session_state.fx_status
    st.caption(f"FX: {status.date or 'unavailable'} · {status.source or 'no snapshot'}")
    if status.error or (status.date and status.date < fx.d_minus_1()):
        st.caption("Using the last complete available snapshot. Saved expenses keep their booked values.")
    if st.button("Refresh rates"):
        st.session_state.fx_status = fx.ensure_rates(con,force=True)
        st.rerun()
    if st.session_state.fx_status.error:
        st.warning(st.session_state.fx_status.error)
    st.caption("D-1 cutoff: Asia/Taipei · provider dates shown as supplied.")
    st.page_link("screens/home.py",label="Manage / create trips")

ui.flash()
navigation.run()
ui.tab_bar(navigation.title)
