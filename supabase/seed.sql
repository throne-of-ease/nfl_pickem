insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
select id,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,crypt('rehearsal-only',gen_salt('bf')),now(),now(),now(),'','','','' from (values
  ('00000000-0000-0000-0000-000000000001'::uuid,'admin@nfl.test'),
  ('00000000-0000-0000-0000-000000000011'::uuid,'alex@nfl.test'),
  ('00000000-0000-0000-0000-000000000012'::uuid,'blair@nfl.test'),
  ('00000000-0000-0000-0000-000000000013'::uuid,'casey@nfl.test'),
  ('00000000-0000-0000-0000-000000000014'::uuid,'devon@nfl.test')
) as seeded(id,email) on conflict(id) do nothing;

insert into auth.identities(id,user_id,provider_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
select id,id,email,jsonb_build_object('sub',id,'email',email),'email',now(),now(),now() from (values
  ('00000000-0000-0000-0000-000000000001'::uuid,'admin@nfl.test'),
  ('00000000-0000-0000-0000-000000000011'::uuid,'alex@nfl.test'),
  ('00000000-0000-0000-0000-000000000012'::uuid,'blair@nfl.test'),
  ('00000000-0000-0000-0000-000000000013'::uuid,'casey@nfl.test'),
  ('00000000-0000-0000-0000-000000000014'::uuid,'devon@nfl.test')
) as seeded(id,email) on conflict(id) do nothing;

insert into public.profiles(id,display_name,is_admin,username) values
  ('00000000-0000-0000-0000-000000000001','Admin',true,'admin'),
  ('00000000-0000-0000-0000-000000000011','Alex',false,'alex'),
  ('00000000-0000-0000-0000-000000000012','Blair',false,'blair'),
  ('00000000-0000-0000-0000-000000000013','Casey',false,'casey'),
  ('00000000-0000-0000-0000-000000000014','Devon',false,'devon')
on conflict(id) do nothing;

insert into public.pools(key,label,phase,espn_season,espn_season_type,espn_week,counts_toward_season,accepts_late_picks)
select 'preseason-hof','Hall of Fame Game','preseason',2026,1,1,false,true
union all select 'preseason-'||lpad(week::text,2,'0'),'Preseason '||week,'preseason',2026,1,week+1,false,true from generate_series(1,3) week
union all select 'week-'||lpad(week::text,2,'0'),'Week '||week,'regular',2026,2,week,true,false from generate_series(1,18) week
union all values ('wild-card','Wild Card','postseason',2026,3,1,true,false),('divisional','Divisional','postseason',2026,3,2,true,false),('conference','Conference','postseason',2026,3,3,true,false),('super-bowl','Super Bowl','postseason',2026,3,5,true,false)
on conflict(key) do nothing;

-- Test-only credentials: every seeded account uses password "rehearsal-only".
-- Picks intentionally remain empty so rehearsal data never appears as real player picks.
