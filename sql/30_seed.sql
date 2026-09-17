-- demo trip mirroring the design prototype
insert into dim_trip values ('t1','Kyoto & Osaka','2026-10-03','2026-10-08','Oct 3 – 8, 2026','USD','JPY',4800,'active');
insert into dim_member values ('mia','t1','Mia',true),('alex','t1','Alex',false),('jun','t1','Jun',false),('sora','t1','Sora',false);
insert into dim_trip_budget values ('t1','Transport',2200),('t1','Stay',1300),('t1','Food',700),('t1','Sights',150),('t1','Shopping',350),('t1','Other',100);

-- Historical sample rates only. Never used for new real expenses or replaced by live sync.
insert or ignore into dim_fx_rate(rate_date,base_ccy,quote_ccy,rate,source) values
  (date '2026-08-01','USD','USD',1.0,'seed'),(date '2026-08-01','USD','JPY',149.3,'seed'),(date '2026-08-01','USD','EUR',0.926,'seed'),
  (date '2026-08-01','USD','GBP',0.787,'seed'),(date '2026-08-01','USD','TWD',32.05,'seed'),(date '2026-08-01','USD','KRW',1350.0,'seed');

insert into dim_place values
  ('kix','Kansai International Airport','Osaka',null,34.4347,135.2441,null),
  ('granbell','Hotel Granbell Kyoto','Gion-Shijo, Kyoto',null,35.0031,135.7717,null),
  ('cross','Cross Hotel Osaka','Shinsaibashi, Osaka',null,34.6707,135.5011,null),
  ('ichiran','Ichiran Ramen Kawaramachi','Kyoto',null,null,null,null),
  ('fushimi','Fushimi Inari Taisha','Kyoto',null,34.9671,135.7727,null),
  ('nishiki','Nishiki Market','Kyoto',null,35.0050,135.7649,null),
  ('kiyomizu','Kiyomizu-dera','Kyoto',null,34.9949,135.7850,null),
  ('pontocho','Pontocho Alley','Kyoto',null,null,null,null),
  ('arashiyama','Arashiyama Bamboo Grove','Kyoto',null,35.0170,135.6714,null),
  ('tenryuji','Tenryu-ji','Arashiyama, Kyoto',null,null,null,null),
  ('arabica','% Arabica Arashiyama','Kyoto',null,null,null,null),
  ('gion','Hanamikoji Street','Gion, Kyoto',null,null,null,null),
  ('nara','Todai-ji','Nara',null,null,null,null),
  ('dotonbori','Dotonbori','Osaka',null,null,null,null),
  ('castle','Osaka Castle','Osaka',null,null,null,null),
  ('kuromon','Kuromon Ichiba Market','Osaka',null,null,null,null),
  ('shinsaibashi','Shinsaibashi-suji','Osaka',null,null,null,null);

insert into dwd_itinerary_item values
  (1,'t1',1,'14:20','flight','Land at Kansai (KIX)','kix',0,'JPY','UA 837'),
  (2,'t1',1,'15:30','transport','Haruka express to Kyoto','kix',13600,'JPY','reserved car'),
  (3,'t1',1,'17:00','hotel','Check in · Hotel Granbell','granbell',0,'JPY',null),
  (4,'t1',1,'19:00','food','Ichiran ramen','ichiran',6000,'JPY',null),
  (5,'t1',2,'08:00','sight','Fushimi Inari','fushimi',0,'JPY','go early'),
  (6,'t1',2,'12:00','food','Nishiki market lunch','nishiki',8000,'JPY',null),
  (7,'t1',2,'14:30','sight','Kiyomizu-dera','kiyomizu',2000,'JPY','¥500 each'),
  (8,'t1',2,'19:00','food','Kaiseki dinner','pontocho',36000,'JPY','reservation'),
  (9,'t1',3,'08:30','sight','Arashiyama bamboo grove','arashiyama',0,'JPY',null),
  (10,'t1',3,'11:00','sight','Tenryu-ji temple','tenryuji',2000,'JPY','¥500 each'),
  (11,'t1',3,'13:00','food','% Arabica','arabica',1400,'JPY',null),
  (12,'t1',3,'16:00','shop','Aritsugu knives','nishiki',28000,'JPY',null),
  (13,'t1',3,'19:30','sight','Gion evening walk','gion',0,'JPY',null),
  (14,'t1',4,'09:00','sight','Nara day trip','nara',2400,'JPY',null),
  (15,'t1',4,'18:00','food','Dotonbori street food','dotonbori',9000,'JPY',null),
  (16,'t1',5,'10:00','sight','Osaka Castle','castle',2400,'JPY',null),
  (17,'t1',5,'13:00','food','Kuromon market','kuromon',7000,'JPY',null),
  (18,'t1',5,'15:00','shop','Shinsaibashi shopping','shinsaibashi',12000,'JPY',null),
  (19,'t1',6,'09:00','hotel','Check out · Cross Hotel','cross',0,'JPY',null),
  (20,'t1',6,'17:40','flight','KIX → SFO','kix',0,'JPY','UA 838');

insert into dwd_booking(booking_id,trip_id,kind,title,provider,ref_code,confirmation,origin,destination,starts_at,ends_at,place_id,price,price_ccy,notes) values
  (1,'t1','flight','SFO → KIX','United','UA 837','K4R7ZQ','SFO','KIX','2026-10-02 11:05','2026-10-03 14:20','kix',1960,'USD','11h 15m'),
  (2,'t1','flight','KIX → SFO','United','UA 838','K4R7ZQ','KIX','SFO','2026-10-08 17:40','2026-10-08 11:05','kix',null,'USD','10h 25m'),
  (3,'t1','hotel','Hotel Granbell Kyoto',null,null,'GB-48213',null,null,'2026-10-03 15:00','2026-10-06 11:00','granbell',1260,'USD','3 nights'),
  (4,'t1','hotel','Cross Hotel Osaka',null,null,'CH-90177',null,null,'2026-10-06 15:00','2026-10-08 11:00','cross',480,'USD','2 nights'),
  (5,'t1','reservation','Pontocho kaiseki',null,null,null,null,null,'2026-10-04 19:00','2026-10-04 21:00','pontocho',null,'JPY','4 guests'),
  (6,'t1','reservation','Mizuno okonomiyaki',null,null,null,null,null,'2026-10-06 18:30','2026-10-06 19:30','dotonbori',null,'JPY','4 guests'),
  (7,'t1','reservation','Endo Sushi',null,null,null,null,null,'2026-10-07 12:30','2026-10-07 13:30','kuromon',null,'JPY','4 guests');

insert into dwd_shopping_item(trip_id,title,where_hint,planned_price,planned_ccy,is_bought) values
  ('t1','Ippodo matcha powder','Teramachi',3800,'JPY',true),
  ('t1','Yatsuhashi sweets','Kiyomizu slope',1200,'JPY',false),
  ('t1','Aritsugu kitchen knife','Nishiki market',28000,'JPY',false),
  ('t1','Furoshiki cloth','Gion',2400,'JPY',true),
  ('t1','Regional Kit Kats','Don Quijote, Osaka',1500,'JPY',false);

insert into dwd_expense(expense_id,trip_id,day_no,spent_at,title,category,amount,currency,member_id,fx_rate_date,place_id) values
  (1,'t1',0,'2026-08-12 10:00','Flights SFO–KIX ×4','Transport',1960,'USD','mia',date '2026-08-01','kix'),
  (2,'t1',1,'2026-10-03 17:05','Hotel Granbell deposit','Stay',620,'USD','alex',date '2026-08-01','granbell'),
  (3,'t1',1,'2026-10-03 15:20','Haruka express','Transport',13600,'JPY','mia',date '2026-08-01','kix'),
  (4,'t1',1,'2026-10-03 19:40','Ichiran ramen','Food',6900,'JPY','jun',date '2026-08-01','ichiran'),
  (5,'t1',2,'2026-10-04 09:10','Fushimi Inari omamori','Shopping',3200,'JPY','sora',date '2026-08-01','fushimi'),
  (6,'t1',2,'2026-10-04 12:30','Nishiki market lunch','Food',9400,'JPY','alex',date '2026-08-01','nishiki'),
  (7,'t1',2,'2026-10-04 14:35','Kiyomizu-dera entry','Sights',2000,'JPY','mia',date '2026-08-01','kiyomizu'),
  (8,'t1',2,'2026-10-04 21:00','Pontocho kaiseki dinner','Food',38000,'JPY','jun',date '2026-08-01','pontocho'),
  (9,'t1',3,'2026-10-05 08:10','Arashiyama bus','Transport',1840,'JPY','sora',date '2026-08-01','arashiyama'),
  (10,'t1',3,'2026-10-05 13:15','Matcha at % Arabica','Food',2600,'JPY','alex',date '2026-08-01','arabica');

insert into dwd_expense_split
  select e.expense_id, m.member_id, 0.25 from dwd_expense e cross join dim_member m where m.trip_id = e.trip_id;

update dwd_booking set start_zone='America/Los_Angeles' where booking_id=1;
update dwd_booking set end_zone='America/Los_Angeles' where booking_id=2;
