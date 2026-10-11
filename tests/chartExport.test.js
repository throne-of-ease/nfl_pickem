import { describe, expect, it, vi } from 'vitest'
import { wrapExportText, cloneStyledChart, svgToPngBlob } from '../src/chartExport.js'

describe('chart export content', () => {
  const context = { measureText: (text) => ({ width: [...text].length * 8 }) }
  it('wraps captions without cutting words or dropping text', () => {
    const text = 'Solid bars show completed contributions; dashed outlines show live stakes.'
    const lines = wrapExportText(text, context, 120)
    expect(lines.join(' ')).toBe(text)
    expect(lines.every(line => context.measureText(line).width <= 120)).toBe(true)
    expect(wrapExportText('VeryLongUnbrokenPlayerName', context, 48).join('')).toBe('VeryLongUnbrokenPlayerName')
    expect(wrapExportText('', context, 48)).toEqual([])
  })
  it('copies themed paint, dashed lines, markers and typography into a standalone SVG', () => {
    document.body.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><path style="fill:rgb(68, 170, 119);stroke:rgb(255, 255, 255);stroke-width:2px;stroke-dasharray:4px, 2px;opacity:0.6"/><text style="font-family:Arial;font-size:13px;font-weight:700;text-anchor:end">Legend</text></svg>'
    const copy = cloneStyledChart(document.querySelector('svg'))
    expect(copy.querySelector('path').style.strokeWidth).toBe('2px')
    expect(copy.querySelector('path').style.strokeDasharray).toBe('4px, 2px')
    expect(copy.querySelector('path').style.opacity).toBe('0.6')
    expect(copy.querySelector('text').style.textAnchor).toBe('end')
    expect(copy.querySelector('text').textContent).toBe('Legend')
  })
  it('rejects missing charts and unavailable canvases', async () => {
    await expect(svgToPngBlob(null)).rejects.toThrow('Chart is unavailable')
    const mock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    try { await expect(svgToPngBlob(document.createElementNS('http://www.w3.org/2000/svg', 'svg'))).rejects.toThrow('Canvas is unavailable') }
    finally { mock.mockRestore() }
  })
})
