import streamlit as st
from core import db,fx,ui,maps,services,forms

con = db.connect()
if not st.session_state.get("trip_id"):
    ui.header("Travel recorder","Your next trip starts here","Plan your days. Keep your budget in view.")
    forms.create_trip(con)
    if st.button("Load Kyoto & Osaka demo"):
        db.ensure_schema(con,seed=True)
        ui.saved("Demo loaded. Its existing expenses use explicitly marked sample rates.")
else:
    con,tid,H,trip = ui.context()
    daily = db.q(con,"select * from dws_trip_daily where trip_id=? order by day_no",[tid])
    spent = float(daily.spent_home.sum())
    remaining = trip.budget_home-spent
    day,left,phase = ui.progress(trip)
    ui.header(trip.dates_label,trip["name"],phase)
    if tid == "t1":
        st.caption("Demo trip · existing expenses use sample rates.")
    ui.blueprint(f'<span class="tr-kicker">Remaining</span><span class="tr-num">{fx.fmt(remaining,H)}</span>'
        f'<div class="tr-mute">{fx.fmt(spent,H)} spent / {fx.fmt(trip.budget_home,H)} budget</div>'
        + ui.bar(spent/trip.budget_home*100 if trip.budget_home else 0))
    if left:
        st.caption(f"{left} days left · {fx.fmt(remaining/left,H)} per day")
    st.subheader("First day" if day==0 else "Today" if left else "Last day")
    items = db.q(con,"""select i.*,p.name place,p.locality,p.gmaps_place_id from dwd_itinerary_item i
        left join dim_place p using(place_id) where i.trip_id=? and day_no=? order by start_time,item_id""",[tid,max(1,day)])
    if items.empty:
        st.caption("No activities yet. Add your first stop in Plan.")
    for _,r in items.iterrows():
        link = maps.link(r.place,r.locality,r.gmaps_place_id) if ui.text(r.place) else ""
        st.markdown(ui.row(r.start_time,ui.escape(r.title),link,ui.escape(r.kind)),unsafe_allow_html=True)
    st.subheader("Recent expenses")
    recent = db.q(con,"""select e.*,m.display_name from v_dwd_expense_home e join dim_member m using(member_id)
        where e.trip_id=? order by e.created_at desc,e.expense_id desc limit 3""",[tid])
    if recent.empty:
        st.caption("Your recorded payments will appear here.")
    for _,r in recent.iterrows():
        st.markdown(ui.row("",ui.escape(r.title),ui.escape(f"{r.display_name} · {r.category}"),fx.fmt(r.amount_home,H)),unsafe_allow_html=True)
    with st.expander("Manage this trip"):
        budgets = db.q(con,"select category,planned_home from dim_trip_budget where trip_id=?",[tid]).set_index("category").planned_home.to_dict()
        with st.form(f"edit_trip_{tid}_{H}"):
            name = st.text_input("Trip name",value=trip["name"])
            start = st.date_input("Departure",value=trip.start_date)
            end = st.date_input("Return",value=trip.end_date)
            local = st.selectbox("Destination currency",fx.SPEND_CURRENCIES,index=fx.SPEND_CURRENCIES.index(trip.local_currency))
            budget = st.number_input(f"Total budget ({H})",min_value=0.0,value=round(float(trip.budget_home),2))
            planned = {c:st.number_input(f"{c} budget ({H})",min_value=0.0,value=round(float(budgets.get(c,0)),2)) for c in services.CATEGORIES}
            if st.form_submit_button("Save trip"):
                try:
                    services.update_trip(con,tid,name,start,end,local,budget,planned)
                    ui.saved("Trip updated.")
                except ValueError as exc:
                    st.error(str(exc))
        names = db.q(con,"select display_name from dim_member where trip_id=? order by display_name",[tid]).display_name.tolist()
        st.caption("Members: " + ", ".join(names))
        with st.form(f"member_{tid}"):
            name = st.text_input("New member name")
            if st.form_submit_button("Add member"):
                try:
                    services.add_member(con,tid,name)
                    ui.saved("Member added. Existing splits are unchanged.")
                except ValueError as exc:
                    st.error(str(exc))
    with st.expander("Create another trip"):
        forms.create_trip(con)
