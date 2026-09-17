-- ───────────── DWS layer: summaries per trip, rebuilt from DWD by refresh_dws() ─────────────
create table if not exists dws_trip_daily (
  trip_id    varchar, day_no integer, day_label varchar,
  spent_home double, n_entries integer, cum_spent_home double,
  allowance_home double,                  -- remaining budget / days left, as of this day
  primary key (trip_id, day_no)
);
create or replace view v_dws_trip_daily as
with d as (
  select t.trip_id, gs.day_no from dim_trip t, unnest(range(0, t.n_days + 1)) gs(day_no)
),
s as (
  select trip_id, day_no, sum(amount_home) spent_home, count(*) n_entries
  from v_dwd_expense_home group by 1,2
)
select d.trip_id, d.day_no,
       case when d.day_no = 0 then 'Pre' else 'D' || d.day_no end as day_label,
       coalesce(s.spent_home, 0) spent_home, coalesce(s.n_entries, 0) n_entries,
       sum(coalesce(s.spent_home,0)) over (partition by d.trip_id order by d.day_no) cum_spent_home,
       (t.budget_home - sum(coalesce(s.spent_home,0)) over (partition by d.trip_id order by d.day_no))
         / greatest(1, t.n_days - d.day_no) as allowance_home
from d left join s using (trip_id, day_no)
join dim_trip t on t.trip_id = d.trip_id;

create table if not exists dws_trip_category (
  trip_id varchar, category varchar,
  planned_home double, actual_home double, delta_home double, share_of_spend double,
  primary key (trip_id, category)
);
create or replace view v_dws_trip_category as
select t.trip_id, c.category,
       coalesce(b.planned_home, 0) planned_home,
       coalesce(sum(e.amount_home), 0) actual_home,
       coalesce(sum(e.amount_home), 0) - coalesce(b.planned_home, 0) delta_home,
       coalesce(sum(e.amount_home), 0) / nullif(sum(sum(e.amount_home)) over (partition by t.trip_id), 0) share_of_spend
from dim_trip t cross join dim_category c
left join dim_trip_budget b on b.trip_id = t.trip_id and b.category = c.category
left join v_dwd_expense_home e on e.trip_id = t.trip_id and e.category = c.category
group by t.trip_id, c.category, b.planned_home;

create table if not exists dws_member_balance (
  trip_id varchar, member_id varchar,
  paid_home double, owed_share_home double, balance_home double,   -- + is owed / − owes
  primary key (trip_id, member_id)
);
create or replace view v_dws_member_balance as
with paid as (
  select trip_id, member_id, sum(amount_home) paid_home from v_dwd_expense_home group by 1,2
),
share as (
  select e.trip_id, s.member_id, sum(e.amount_home * s.share) owed_share_home
  from v_dwd_expense_home e join dwd_expense_split s using (expense_id) group by 1,2
)
select m.trip_id, m.member_id,
       coalesce(p.paid_home,0) paid_home, coalesce(sh.owed_share_home,0) owed_share_home,
       coalesce(p.paid_home,0) - coalesce(sh.owed_share_home,0) balance_home
from dim_member m
left join paid p using (trip_id, member_id)
left join share sh using (trip_id, member_id);
