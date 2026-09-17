from uuid import uuid4
import streamlit as st
from core import db,fx,ui,services

con,tid,H,trip = ui.context()
ui.header("Record","Record expense",f"Budget currency: {H}")
members = db.q(con,"select member_id,display_name from dim_member where trip_id=? order by display_name",[tid])
if members.empty:
    st.info("Add a trip member on Home before recording expenses.")
    st.stop()
labels = dict(zip(members.member_id,members.display_name))
entries = db.q(con,"select * from v_dwd_expense_home where trip_id=? order by expense_id desc",[tid])
mode = st.radio("Entry",["New expense","Edit / delete"],horizontal=True)
row = None
replaces = None
if mode=="Edit / delete":
    if entries.empty:
        st.info("No expenses to edit yet.")
        st.stop()
    replaces = st.selectbox("Expense",entries.expense_id.tolist(),format_func=lambda i:entries.set_index("expense_id").title[i])
    row = entries[entries.expense_id==replaces].iloc[0]
    replaces = int(replaces)
get = lambda key,default: row[key] if row is not None and ui.text(row[key]) else default
token_key = f"expense_token_{tid}_{replaces}"
if token_key not in st.session_state:
    st.session_state[token_key] = uuid4().hex
token = st.session_state[token_key]
with db.LOCK:
    rate_date = fx.latest_rate_date(con)
st.caption(f"FX snapshot: {rate_date or 'unavailable — same-currency entries still work'}. The converted amount is fixed when saved.")
shopping = db.q(con,"select * from dwd_shopping_item where trip_id=? and (expense_id is null or expense_id=?) order by title",[tid,replaces])
shopping_labels = {None:"No shopping item",**{int(r.item_id):r.title for _,r in shopping.iterrows()}}
linked = shopping[shopping.expense_id==replaces] if replaces is not None else shopping.iloc[:0]
shopping_default = int(linked.item_id.iloc[0]) if not linked.empty else None
participants = db.q(con,"select member_id from dwd_expense_split where expense_id=?",[replaces]).member_id.tolist() if replaces else list(labels)
with st.form(f"expense_{token}"):
    title = st.text_input("What",value=get("title",""),placeholder="Lunch at Nishiki market")
    a,b = st.columns(2)
    currency = a.selectbox("Currency",fx.SPEND_CURRENCIES,index=fx.SPEND_CURRENCIES.index(get("currency",trip.local_currency)))
    amount = b.number_input("Amount",min_value=0.0,value=float(get("amount",0)),step=100.0)
    category = st.selectbox("Category",services.CATEGORIES,index=services.CATEGORIES.index(get("category","Food")))
    default_date = row.spent_at.date() if row is not None else min(max(fx.today(),trip.start_date),trip.end_date)
    when = st.date_input("Date",value=default_date,max_value=trip.end_date)
    payer = st.selectbox("Paid by",list(labels),index=list(labels).index(get("member_id",members.member_id.iloc[0])),format_func=labels.get)
    split = st.multiselect("Split among",list(labels),default=participants,format_func=labels.get)
    shopping_id = st.selectbox("Link shopping item",list(shopping_labels),index=list(shopping_labels).index(shopping_default),format_func=shopping_labels.get)
    st.caption("Split equally among selected members. Selecting only yourself records a personal expense.")
    if st.form_submit_button("Save expense",type="primary",use_container_width=True):
        try:
            eid = services.save_expense(con,tid,title,category,amount,currency,when,payer,split,token,shopping_id,replaces)
            saved = db.q(con,"select booked_home_amount from dwd_expense where expense_id=?",[eid]).iloc[0,0]
            st.session_state.pop(token_key,None)
            ui.saved(f"Saved {fx.fmt(amount,currency)} ≈ {fx.fmt(saved,H)}. Budget updated.")
        except ValueError as exc:
            st.error(str(exc))
if replaces is not None:
    st.caption("Delete removes this expense from the budget and clears any linked shopping payment.")
    if st.button("Delete expense"):
        try:
            services.delete_expense(con,tid,replaces)
            ui.saved("Expense deleted. Budget updated.")
        except ValueError as exc:
            st.error(str(exc))
