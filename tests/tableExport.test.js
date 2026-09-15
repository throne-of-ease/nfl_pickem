import { afterEach, expect, it, vi } from 'vitest'
import { tableToPngBlob } from '../src/tableExport.js'
import { sharePngBlob } from '../src/charts.jsx'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('exports full names and displayed picks without exposing hidden picks', async () => {
  document.body.innerHTML = `<table><thead><tr><th><div class="overview-player"><strong>Very long player name</strong><b>12</b><span>LEAD</span><small>5/-2/9</small></div></th><th>Other player</th></tr></thead><tbody><tr><td><span class="pick-hidden">?</span></td><td><div class="overview-pick"><img class="team-logo" src="phi.png" alt="PHI logo"><strong class="pick-team" style="display:none">PHI</strong><span>7</span></div></td></tr></tbody></table>`
  // jsdom does not implement layout-dependent innerText.
  for (const cell of document.querySelectorAll('th,td')) Object.defineProperty(cell, 'innerText', { value: cell.textContent })
  const image = document.querySelector('.team-logo')
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 100 } })
  const context = { measureText: text => ({ width: text.length * 8 }), scale: vi.fn(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn() }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context)
  const blob = new Blob(['png'], { type: 'image/png' })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(blob))
  expect(await tableToPngBlob(document.querySelector('table'), 'Week 1')).toBe(blob)
  const lines = context.fillText.mock.calls.map(call => call[0])
  expect(lines).toContain('Very long player name')
  expect(lines).toContain('?')
  expect(lines).not.toContain('PHI')
  expect(lines).toContain('7')
  expect(context.drawImage).toHaveBeenCalledWith(image, expect.any(Number), expect.any(Number), 26, 26)
})

it('reports an unavailable canvas', async () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  await expect(tableToPngBlob(null, 'Week 1')).rejects.toThrow('Canvas is unavailable')
})

it('shares a PNG file when file sharing is supported', async () => {
  const share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { canShare: () => true, share })
  await sharePngBlob(new Blob(['png'], { type: 'image/png' }), 'table.png')
  expect(share).toHaveBeenCalledOnce()
  const file = share.mock.calls[0][0].files[0]
  expect(file.name).toBe('table.png')
  expect(file.type).toBe('image/png')
})

it('downloads when file sharing is unsupported', async () => {
  vi.stubGlobal('navigator', { canShare: () => false, share: vi.fn() })
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:test'), revokeObjectURL: vi.fn() })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await sharePngBlob(new Blob(['png']), 'table.png')
  expect(click).toHaveBeenCalledOnce()
  expect(navigator.share).not.toHaveBeenCalled()
})
