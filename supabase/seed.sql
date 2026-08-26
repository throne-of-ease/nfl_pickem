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

insert into public.profiles(id,display_name,is_admin) values
  ('00000000-0000-0000-0000-000000000001','Admin',true),
  ('00000000-0000-0000-0000-000000000011','Alex',false),
  ('00000000-0000-0000-0000-000000000012','Blair',false),
  ('00000000-0000-0000-0000-000000000013','Casey',false),
  ('00000000-0000-0000-0000-000000000014','Devon',false)
on conflict(id) do nothing;

insert into public.pools(key,label,phase,espn_season,espn_season_type,espn_week,counts_toward_season)
select 'preseason-'||lpad(week::text,2,'0'),'Preseason '||week,'preseason',2026,1,week,false from generate_series(1,4) week
union all select 'week-'||lpad(week::text,2,'0'),'Week '||week,'regular',2026,2,week,true from generate_series(1,18) week
union all values ('wild-card','Wild Card','postseason',2026,3,1,true),('divisional','Divisional','postseason',2026,3,2,true),('conference','Conference','postseason',2026,3,3,true),('super-bowl','Super Bowl','postseason',2026,3,5,true)
on conflict(key) do nothing;

insert into public.games(id,pool_key,kickoff,away_team,home_team,status,away_score,home_score,gotw,predictor_home,home_moneyline,away_moneyline) values
  ('ps1-g1','preseason-01','2026-08-27T18:00:00Z','DAL','PHI','scheduled',0,0,true,.61,-150,130),
  ('ps1-g2','preseason-01','2026-08-27T21:00:00Z','KC','LAC','scheduled',0,0,false,.43,120,-140),
  ('ps1-g3','preseason-01','2026-08-28T18:00:00Z','TB','ATL','scheduled',0,0,false,.52,-105,-105),
  ('ps1-g4','preseason-01','2026-08-28T21:00:00Z','CIN','CLE','scheduled',0,0,false,.47,null,null)
on conflict(id) do nothing;

insert into public.drafts(user_id,pool_key) select id,'preseason-01' from public.profiles where not is_admin on conflict do nothing;
insert into public.picks(user_id,pool_key,game_id,team,confidence)
select p.id,'preseason-01',g.id,case when (row_number() over(partition by p.id order by g.id)+(right(p.id::text,1)::integer))%2=0 then g.home_team else g.away_team end,row_number() over(partition by p.id order by g.id)
from public.profiles p cross join public.games g where not p.is_admin and g.pool_key='preseason-01' on conflict do nothing;

-- Test-only credentials: every seeded account uses password "rehearsal-only".
