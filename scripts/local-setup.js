import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npx.cmd' : 'npx'
for (const args of [['supabase', 'start'], ['supabase', 'db', 'reset']]) {
  const result = spawnSync(npm, args, { stdio: 'inherit', shell: false })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
console.log('Local Supabase reset with four rehearsal users. Run npm run dev:preseason.')
