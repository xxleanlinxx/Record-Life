import streamlit as st
from core import db,fx,ui

con,tid,H,trip = ui.context()
ui.header("Budget","Every payment in view",f"In {H} · saved expense values")
daily = db.q(con,"select * from dws_trip_daily where trip_id=? order by day_no",[tid])
cat = db.q(con,"select * from dws_trip_category where trip_id=? order by actual_home desc,category",[tid])
bal = db.q(con,"""select b.*,m.display_name from dws_member_balance b
    join dim_member m on b.member_id=m.member_id and b.trip_id=m.trip_id where b.trip_id=?""",[tid])
spent = float(daily.spent_home.sum())
budget = float(trip.budget_home)
remaining = budget-spent
day,left,phase = ui.progress(trip)
ui.card(f'<span class="tr-kicker">Spent</span><span class="tr-num">{fx.fmt(spent,H)}</span>'
    f'<div>Remaining {fx.fmt(remaining,H)} / {fx.fmt(budget,H)}</div>' + ui.bar(spent/budget*100 if budget else 0))
st.caption(f"{phase}" + (f" · {fx.fmt(remaining/left,H)} / day left" if left else ""))
view = st.radio("Budget view",["Category","Per day","Plan vs actual"],horizontal=True)
if view=="Category":
    mx = max(float(cat.actual_home.max()),1)
    for _,r in cat.iterrows():
        st.markdown(f'<div>{r.category} · {fx.fmt(r.actual_home,H)} · {(r.actual_home/spent if spent else 0):.0%}</div>'
            + ui.bar(r.actual_home/mx*100),unsafe_allow_html=True)
elif view=="Per day":
    st.bar_chart(daily.set_index("day_label")[["spent_home"]].rename(columns={"spent_home":H}),color="#5980a6",height=220)
else:
    table = cat[["category","planned_home","actual_home","delta_home"]].copy()
    for name in table.columns[1:]:
        table[name] = table[name].map(lambda v:fx.fmt(v,H))
    st.dataframe(table.rename(columns={"category":"Category","planned_home":"Planned","actual_home":"Actual","delta_home":"Over / under"}),hide_index=True,use_container_width=True)
st.subheader("Group balance")
st.caption("Based on the participants selected for each expense.")
for _,r in bal.iterrows():
    owed = "is owed" if r.balance_home>0.005 else "owes" if r.balance_home < -0.005 else "settled"
    st.markdown(ui.row(ui.escape(r.display_name[:1]),ui.escape(r.display_name),
        f"Paid {fx.fmt(r.paid_home,H)} · share {fx.fmt(r.owed_share_home,H)}",f"{fx.fmt(abs(r.balance_home),H)}<div class='sub'>{owed}</div>"),unsafe_allow_html=True)
st.subheader("All entries")
entries = db.q(con,"""select e.*,m.display_name from v_dwd_expense_home e join dim_member m using(member_id)
    where e.trip_id=? order by spent_at desc,expense_id desc""",[tid])
if entries.empty:
    st.caption("No expenses yet.")
for _,r in entries.iterrows():
    label = "Pre" if r.day_no==0 else f"D{r.day_no}"
    st.markdown(ui.row(label,ui.escape(r.title),ui.escape(f"{r.display_name} · {r.category}") + f" · FX {r.fx_rate_date or '1:1'}",
        f"{fx.fmt(r.amount_home,H)}<div class='sub'>{fx.fmt(r.amount,r.currency)}</div>"),unsafe_allow_html=True)
st.page_link("screens/record.py",label="Add, edit or delete expenses")
