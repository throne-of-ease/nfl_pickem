import { describe, expect, it } from 'vitest'
import { formatDeployment, githubRead, loadDeployment, parseOptions, resolveCommit } from '../scripts/deployment-status.js'

describe('deployment status across workflow triggers', () => {
  const commit = 'a'.repeat(40)
  it('finds the latest run for the exact commit, including manual runs', async () => {
    const paths = []
    const read = async (path) => {
      paths.push(path)
      if (path.includes('/jobs')) return { jobs: [{ name: 'deploy-pages', conclusion: 'success' }] }
      return { workflow_runs: [
        { id: 3, head_sha: 'b'.repeat(40), conclusion: 'success' },
        { id: 1, head_sha: commit, event: 'push', conclusion: 'failure' },
        { id: 2, head_sha: commit, event: 'workflow_dispatch', conclusion: 'success' },
      ] }
    }
    const deployment = await loadDeployment({ commit }, read)
    expect(deployment.run.id).toBe(2)
    expect(paths[0]).toContain(`head_sha=${commit}`)
    expect(paths[0]).not.toContain('event=')
    expect(formatDeployment(deployment)).toContain('deploy-pages: success')
  })

  it('reports an absent run rather than a successful deployment for a previous commit', async () => {
    expect(await loadDeployment({ commit }, async () => ({ workflow_runs: [] }))).toEqual({ run: null, jobs: [] })
  })

  it('monitors the selected run after a failed-jobs retry and includes paginated jobs', async () => {
    const read = async (path) => {
      if (path === 'actions/runs/42') return { id: 42, head_sha: commit, status: 'in_progress', conclusion: null }
      if (path.endsWith('page=1')) return { jobs: Array.from({ length: 100 }, () => ({ name: 'verify', conclusion: 'success' })) }
      return { jobs: [{ name: 'deploy-pages', status: 'in_progress', conclusion: null }] }
    }
    const deployment = await loadDeployment({ run: '42' }, read)
    expect(deployment.jobs).toHaveLength(101)
    expect(formatDeployment(deployment)).toContain('deploy-pages: in_progress')
  })

  it('resolves the remote branch so connector-created commits work without shell Git credentials', async () => {
    const read = async (path) => {
      expect(path).toBe('git/ref/heads/feat%2Fcompact-pick-sheet')
      return { object: { sha: commit } }
    }
    expect(await resolveCommit(parseOptions([]), read)).toBe(commit)
  })

  it('surfaces denied/rate-limited reads without reporting deployment success', async () => {
    await expect(githubRead('actions/runs/42', async () => ({ ok: false, status: 403 }))).rejects.toThrow('HTTP 403')
  })

  it('rejects ambiguous selectors and invalid timeouts', () => {
    expect(() => parseOptions(['--commit', commit, '--run', '42'])).toThrow('not both')
    expect(() => parseOptions(['--timeout', '0'])).toThrow('positive')
    expect(() => parseOptions(['--commit'])).toThrow('Missing value')
  })
})
