-- ───────────── DWD layer: detail facts, one row per event, native currency ─────────────
create table if not exists dwd_expense (
  expense_id   integer primary key,
  trip_id      varchar not null references dim_trip(trip_id),
  day_no       integer not null,          -- 0 = pre-trip
  spent_at     timestamp not null,
  title        varchar not null,
  category     varchar not null references dim_category(category),
  amount       double  not null,
  currency     varchar not null references dim_currency(ccy),
  member_id    varchar not null references dim_member(member_id),   -- who paid
  fx_rate_date date,                      -- rate snapshot pinned at save time
  place_id     varchar references dim_place(place_id),
  created_at   timestamp default now()
);

create table if not exists dwd_expense_split (
  expense_id integer references dwd_expense(expense_id),
  member_id  varchar references dim_member(member_id),
  share      double not null,             -- fraction, sums to 1 per expense
  primary key (expense_id, member_id)
);

create table if not exists dwd_itinerary_item (
  item_id      integer primary key,
  trip_id      varchar not null references dim_trip(trip_id),
  day_no       integer not null,
  start_time   varchar not null,          -- 'HH:MM'
  kind         varchar not null,          -- flight | transport | hotel | sight | food | shop
  title        varchar not null,
  place_id     varchar references dim_place(place_id),
  planned_cost double, planned_ccy varchar references dim_currency(ccy),
  notes        varchar
);

create table if not exists dwd_booking (
  booking_id   integer primary key,
  trip_id      varchar not null references dim_trip(trip_id),
  kind         varchar not null,          -- flight | hotel | reservation
  title        varchar not null,
  provider     varchar, ref_code varchar, confirmation varchar,
  origin       varchar, destination varchar,
  starts_at    timestamp, ends_at timestamp,
  place_id     varchar references dim_place(place_id),
  price        double, price_ccy varchar references dim_currency(ccy),
  notes        varchar
);

create sequence if not exists seq_shopping start 100;
create table if not exists dwd_shopping_item (
  item_id       integer primary key default nextval('seq_shopping'),
  trip_id       varchar not null references dim_trip(trip_id),
  title         varchar not null,
  where_hint    varchar,
  planned_price double, planned_ccy varchar references dim_currency(ccy),
  is_bought     boolean default false,
  expense_id    integer references dwd_expense(expense_id),   -- linked once recorded
  updated_at    timestamp default now()
);

-- v_dwd_expense_home is installed by core.db after the versioned migration.
-- It reads the saved booked amount, never the newest market rate.
