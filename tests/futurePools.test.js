// @vitest-environment node
import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { POOLS } from '../src/domain.js'

it('creates all season pools without changing existing pools, drafts or picks', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;`)
    const initial = readFileSync(new URL('../supabase/migrations/202608260001_initial.sql', import.meta.url), 'utf8')
    await db.exec(initial.slice(initial.indexOf('create table public.profiles'), initial.indexOf('create or replace function public.get_my_draft')))
    await db.exec(`alter table pools add column accepts_late_picks boolean default false;
      alter table profiles add column username text;
      create table app_settings(key text primary key, registration_open boolean);
      insert into auth.users values(auth.uid());
      insert into profiles values(auth.uid(),'Pat',false,'pat');
      insert into pools(key,label,phase,espn_season,espn_season_type,espn_week,counts_toward_season,closed)
        values('week-10','Custom week','regular',2026,2,10,true,true);`)
    for (const file of ['202609170001_hidden_pick_status.sql', '202609270003_reserve_unpicked_locked_confidence.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
    const migration = readFileSync(new URL('../supabase/migrations/202611170001_initialize_season_pools.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    expect((await db.query('select key from pools order by key')).rows.map((r) => r.key)).toEqual(POOLS.map((p) => p.key).sort())
    expect((await db.query("select label,closed from pools where key='week-10'")).rows[0]).toEqual({ label: 'Custom week', closed: true })
    for (const pool of POOLS.filter((p) => p.espnWeek >= 11 || p.phase === 'postseason')) {
      const data = (await db.query('select get_season_data($1) as result', [pool.key])).rows[0].result
      expect(data.profiles).toEqual([{ id: '00000000-0000-0000-0000-000000000001', name: 'Pat' }])
      expect(data.hiddenPickStatuses).toEqual([])
      await db.query("insert into games(id,pool_key,kickoff,away_team,home_team,status) values($1,$2,now()+interval '100 days','BUF','MIA','scheduled')", [pool.key, pool.key])
      const picks = [{ gameId: pool.key, team: 'BUF', confidence: 1 }]
      expect((await db.query('select replace_picks($1,0,$2) as result', [pool.key, JSON.stringify(picks)])).rows[0].result.picks).toEqual(picks)
    }
    const before = (await db.query('select * from picks order by pool_key')).rows
    await db.exec(migration)
    expect((await db.query('select * from picks order by pool_key')).rows).toEqual(before)
  } finally { await db.close() }
}, 30000)
