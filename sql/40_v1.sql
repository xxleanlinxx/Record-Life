-- Migrate the original prototype without revaluing its historical expenses.
alter table dwd_expense add column booked_home_amount decimal(18,6);
alter table dwd_expense add column booked_home_currency varchar;
alter table dwd_expense add column fx_home_currency varchar;
alter table dwd_expense add column applied_fx_rate decimal(24,12);
alter table dwd_expense add column submission_id varchar;
alter table dwd_expense add column is_deleted boolean default false;
alter table dwd_booking add column start_zone varchar default 'Asia/Tokyo';
alter table dwd_booking add column end_zone varchar default 'Asia/Tokyo';
create unique index if not exists expense_submission on dwd_expense(submission_id);
create table if not exists dwd_currency_change (
  change_id varchar primary key,
  trip_id varchar not null references dim_trip(trip_id),
  from_ccy varchar not null, to_ccy varchar not null,
  factor decimal(24,12) not null, rate_date date not null,
  changed_at timestamp default now()
);
