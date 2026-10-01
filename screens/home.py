import streamlit as st
from core import db,fx,ui,maps,forms

con = db.connect()
if not st.session_state.get("trip_id"):
    ui.header("Trips","Create your first trip","No trips yet. Start with a name and travel dates.")
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
    with st.container(key="trip_actions"):
        st.page_link("screens/edit_trip.py", label="Edit current trip", icon=":material/edit:")
        st.page_link("screens/new_trip.py", label="Create new trip", icon=":material/add:")
    all_items = db.q(con, "select i.*, p.name place from dwd_itinerary_item i left join dim_place p using(place_id) where i.trip_id=? order by day_no,start_time,item_id", [tid])
    member_count = db.q(con, "select count(*) n from dim_member where trip_id=?", [tid]).iloc[0, 0]
    st.markdown(f'<div class="tr-facts"><div><small>Duration</small><strong>{trip.n_days} days</strong></div>'
                f'<div><small>Travel party</small><strong>{member_count} people</strong></div>'
                f'<div><small>Planned stops</small><strong>{len(all_items)} places</strong></div></div>', unsafe_allow_html=True)
    if day == 0:
        ui.trip_days(trip, all_items)
    if tid == "t1":
        st.caption("Demo trip · existing expenses use sample rates.")
    ui.card(f'<span class="tr-kicker">Remaining</span><span class="tr-num">{fx.fmt(remaining,H)}</span>'
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
        where e.trip_id=? order by e.expense_id desc limit 3""",[tid])
    if recent.empty:
        st.caption("Your recorded payments will appear here.")
    for _,r in recent.iterrows():
        st.markdown(ui.row("",ui.escape(r.title),ui.escape(f"{r.display_name} · {r.category}"),fx.fmt(r.amount_home,H)),unsafe_allow_html=True)
    if day != 0:
        ui.trip_days(trip, all_items)
