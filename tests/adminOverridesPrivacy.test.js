// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

let db
const admin = '00000000-0000-0000-0000-000000000001'
const player = '00000000-0000-0000-0000-000000000002'
const call = async (picks) => (await db.query('select public.admin_replace_picks($1,$2,$3) as result', [player, 'week-01', JSON.stringify(picks)])).rows[0].result
const snapshot = async () => (await db.query('select game_id,team,confidence from picks order by game_id')).rows

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.viewer',true),'')::uuid $$;`)
  const initial = readFileSync(new URL('../supabase/migrations/202608260001_initial.sql', import.meta.url), 'utf8')
  await db.exec(initial.slice(initial.indexOf('create table public.profiles'), initial.indexOf('create or replace function public.get_my_draft')))
  await db.exec(`alter table profiles add column username text; alter table profiles add column contact_email text;
    create table app_settings(key text primary key,registration_open boolean default true);
    insert into auth.users values('${admin}'),('${player}');
    insert into profiles(id,display_name,is_admin,username) values('${admin}','Admin',true,'admin'),('${player}','Pat',false,'pat');
    insert into pools(key,label,phase,espn_season,espn_season_type,espn_week,counts_toward_season) values('week-01','Week 1','regular',2026,2,1,true);
    insert into games(id,pool_key,kickoff,away_team,home_team,status,locked_at) values
      ('g1','week-01',now()-interval '1 day','PIT','BUF','final',null),
      ('g2','week-01',now()+interval '1 day','DAL','PHI','scheduled',now()),
      ('g3','week-01',now()+interval '2 days','KC','DEN','scheduled',null),
      ('g4','week-01',now()+interval '3 days','NYJ','NE','scheduled',null);
    insert into drafts(user_id,pool_key) values('${player}','week-01');
    insert into picks values('${player}','week-01','g1','PIT',1),('${player}','week-01','g2','DAL',2),('${player}','week-01','g3','KC',3);
    insert into admin_audit(admin_id,action,target) values('${admin}','admin_replace_picks','{"userId":"${player}","poolKey":"week-01","picks":[{"gameId":"g1","team":"PIT","confidence":1},{"gameId":"g3","team":"KC","confidence":3}]}');
    select set_config('app.viewer','${admin}',false);`)
  await db.exec(readFileSync(new URL('../supabase/migrations/202610110001_private_locked_pick_overrides.sql', import.meta.url), 'utf8'))
}, 30000)
afterAll(async () => { await db?.close() })

describe('admin locked-pick privacy in PostgreSQL', () => {
  it('omits future teams and confidence from admin data and old audit entries', async () => {
    const data = (await db.query("select get_admin_data('week-01') as result")).rows[0].result
    expect(data.games).toHaveLength(4)
    expect(data.pickCountsByUser[player]).toBe(3)
    expect(data.picks.map((pick) => pick.gameId)).toEqual(['g1', 'g2'])
    const history = (await db.query('select get_admin_override_history() as result')).rows[0].result
    expect(history.overrides[0].picks).toEqual([{ gameId: 'g1', team: 'PIT', confidence: 1 }])
  })
  it('allows a completed-game correction without deleting future or other locked picks', async () => {
    const before = await snapshot()
    const result = await call([{ gameId: 'g1', team: 'BUF', confidence: 1 }])
    expect(result.picks.map((pick) => pick.gameId)).toEqual(['g1', 'g2'])
    expect((await snapshot()).filter((pick) => pick.game_id !== 'g1')).toEqual(before.filter((pick) => pick.game_id !== 'g1'))
  })
  it('rejects changes to upcoming games and rank collisions atomically', async () => {
    const before = await snapshot()
    const revision = (await db.query('select revision from drafts')).rows[0].revision
    for (const picks of [
      [{ gameId: 'g3', team: 'DEN', confidence: 3 }],
      [{ gameId: 'g4', team: 'NE', confidence: 4 }],
    ]) await expect(call(picks)).rejects.toThrow('GAME_NOT_LOCKED')
    await expect(call([{ gameId: 'g1', team: 'PIT', confidence: 3 }])).rejects.toThrow('CONFIDENCE_UNAVAILABLE')
    expect(await snapshot()).toEqual(before)
    expect((await db.query('select revision from drafts')).rows[0].revision).toBe(revision)
  })
  it('swaps ranks of locked games without hitting the unique constraint', async () => {
    await call([{ gameId: 'g1', team: 'BUF', confidence: 2 }, { gameId: 'g2', team: 'PHI', confidence: 1 }])
    expect(await snapshot()).toEqual([
      { game_id: 'g1', team: 'BUF', confidence: 2 }, { game_id: 'g2', team: 'PHI', confidence: 1 }, { game_id: 'g3', team: 'KC', confidence: 3 },
    ])
  })
  it('rejects bad input and non-admin callers', async () => {
    await expect(call([{ gameId: 'g1', team: 'KC', confidence: 2 }])).rejects.toThrow('INVALID_TEAM')
    await expect(call([{ gameId: 'g1', team: 'BUF', confidence: 5 }])).rejects.toThrow('INVALID_CONFIDENCE_SET')
    await expect(call([{ gameId: 'g1', team: 'BUF', confidence: 1 }, { gameId: 'g1', team: 'BUF', confidence: 2 }])).rejects.toThrow('INVALID_CONFIDENCE_SET')
    await db.exec(`select set_config('app.viewer','${player}',false)`)
    await expect(call([{ gameId: 'g1', team: 'BUF', confidence: 2 }])).rejects.toThrow('FORBIDDEN')
    await expect(db.query("select get_admin_data('week-01')")).rejects.toThrow('FORBIDDEN')
    await db.exec(`select set_config('app.viewer','${admin}',false)`)
  })
  it('prevents reading raw historical hidden picks through the audit table', async () => {
    await db.exec('grant usage on schema public,auth to authenticated; grant select on admin_audit to authenticated; set role authenticated;')
    expect((await db.query('select * from admin_audit')).rows).toEqual([])
    const history = (await db.query('select get_admin_override_history() as result')).rows[0].result
    expect(history.overrides.length).toBeGreaterThan(0)
    expect(history.overrides.flatMap((entry) => entry.picks).some((pick) => pick.gameId === 'g3')).toBe(false)
    await db.exec('reset role')
  })
})
