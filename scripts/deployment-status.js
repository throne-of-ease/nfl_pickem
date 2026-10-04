import { pathToFileURL } from 'node:url'

const repository = 'throne-of-ease/nfl_pickem'
const defaultBranch = 'feat/compact-pick-sheet'

export function parseOptions(args) {
  const options = { branch: defaultBranch, wait: false, timeout: 900 }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--wait') options.wait = true
    else if (['--commit', '--branch', '--run', '--timeout'].includes(argument)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`)
      options[argument.slice(2)] = value
    } else throw new Error(`Unknown argument: ${argument}`)
  }
  if (options.commit && !/^[a-f0-9]{40}$/i.test(options.commit)) throw new Error('--commit requires a full commit SHA')
  if (options.run && !/^\d+$/.test(options.run)) throw new Error('--run requires a numeric workflow run ID')
  if (options.run && options.commit) throw new Error('Use --run or --commit, not both')
  options.timeout = Number(options.timeout)
  if (!Number.isFinite(options.timeout) || options.timeout <= 0) throw new Error('--timeout must be positive seconds')
  return options
}

export async function githubRead(path, fetchImpl = fetch) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/${path}`, {
    headers, signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`GitHub read failed: HTTP ${response.status}`)
  return response.json()
}

export async function resolveCommit(options, read = githubRead) {
  if (options.commit || options.run) return options.commit
  const ref = await read(`git/ref/heads/${encodeURIComponent(options.branch)}`)
  return ref.object.sha
}

export async function loadDeployment(options, read = githubRead) {
  let run
  if (options.run) run = await read(`actions/runs/${options.run}`)
  else {
    // Do not filter by event: pushes and manual runs both deploy this project.
    const data = await read(`actions/workflows/deploy.yml/runs?head_sha=${encodeURIComponent(options.commit)}&per_page=100`)
    run = data.workflow_runs.filter((item) => item.head_sha === options.commit)
      .sort((a, b) => b.id - a.id)[0]
  }
  if (!run) return { run: null, jobs: [] }
  const jobs = []
  for (let page = 1; ; page += 1) {
    const data = await read(`actions/runs/${run.id}/jobs?per_page=100&page=${page}`)
    jobs.push(...data.jobs)
    if (data.jobs.length < 100) break
  }
  return { run, jobs }
}

export function formatDeployment({ run, jobs }) {
  if (!run) return 'Waiting for the deployment workflow to appear.'
  return [`Run ${run.id} · ${run.head_sha} · ${run.status} · ${run.conclusion ?? 'pending'}`, run.html_url,
    ...jobs.map((job) => `  ${job.name}: ${job.conclusion ?? job.status}`)].join('\n')
}

export async function main(args = process.argv.slice(2)) {
  const options = parseOptions(args)
  options.commit = await resolveCommit(options)
  const deadline = Date.now() + options.timeout * 1000
  let previous
  do {
    const deployment = await loadDeployment(options)
    const message = formatDeployment(deployment)
    if (message !== previous) console.log(message)
    previous = message
    if (deployment.run?.status === 'completed') return deployment.run.conclusion === 'success' ? 0 : 1
    if (!options.wait) return 2
    if (Date.now() >= deadline) throw new Error('Timed out waiting for deployment')
    await new Promise((resolve) => setTimeout(resolve, Math.min(10000, deadline - Date.now())))
  } while (true)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code }).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
