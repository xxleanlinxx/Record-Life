-- ───────────── DIM layer: reference / dimension tables ─────────────
create table if not exists dim_currency (
  ccy         varchar primary key,        -- ISO 4217 (TWD = New Taiwan dollar, NT$)
  symbol      varchar not null,
  minor_units tinyint not null default 2
);
insert or ignore into dim_currency values
  ('USD','$',2),('EUR','€',2),('GBP','£',2),('TWD','NT$',0),('JPY','¥',0),('KRW','₩',0);

create table if not exists dim_fx_rate (
  rate_date  date    not null,            -- the D-1 snapshot date the rate applies to
  base_ccy   varchar not null,
  quote_ccy  varchar not null,
  rate       double  not null,            -- 1 base = rate quote
  source     varchar,
  loaded_at  timestamp default now(),
  primary key (rate_date, base_ccy, quote_ccy)
);

create table if not exists dim_category (
  category varchar primary key,
  sort_no  tinyint not null,
  icon     varchar
);
insert or ignore into dim_category values
  ('Transport',1,'bus'),('Stay',2,'bed'),('Food',3,'utensils'),('Sights',4,'landmark'),('Shopping',5,'shopping-bag'),('Other',6,'more-horizontal');

create table if not exists dim_trip (
  trip_id        varchar primary key,
  name           varchar not null,
  start_date     date not null,
  end_date       date not null,
  n_days         integer generated always as (date_diff('day', start_date, end_date) + 1),
  dates_label    varchar,
  home_currency  varchar not null check (home_currency in ('TWD','USD','EUR','GBP')),
  local_currency varchar not null check (local_currency in ('TWD','USD','EUR','GBP','JPY','KRW')),
  budget_home    double  not null,
  status         varchar default 'planning'
);

create table if not exists dim_member (
  member_id    varchar primary key,
  trip_id      varchar not null references dim_trip(trip_id),
  display_name varchar not null,
  is_owner     boolean default false
);

create table if not exists dim_place (
  place_id       varchar primary key,
  name           varchar not null,
  locality       varchar,                 -- city/area appended to the Maps query
  address        varchar,
  lat            double, lng double,
  gmaps_place_id varchar                  -- optional: pins the exact Google place
);

-- per-category planned budget in home currency (used by dws_trip_category)
create table if not exists dim_trip_budget (
  trip_id      varchar references dim_trip(trip_id),
  category     varchar references dim_category(category),
  planned_home double not null,
  primary key (trip_id, category)
);
