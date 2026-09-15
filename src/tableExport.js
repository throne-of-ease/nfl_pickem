const waitForImage = (image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
  const done = () => { clearTimeout(timeout); resolve() }
  const timeout = setTimeout(done, 2000)
  image.addEventListener('load', done, { once: true })
  image.addEventListener('error', done, { once: true })
})

// Render the displayed cells, so hidden picks never enter the exported image.
export async function tableToPngBlob(table, title) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  await Promise.all([...table.querySelectorAll('.overview-pick .team-logo')].map(waitForImage))
  const rows = [...table.rows].map((row) => [...row.cells].map((cell) => {
    const player = cell.querySelector('.overview-player')
    const pick = cell.querySelector('.overview-pick')
    const content = player || pick || cell.firstElementChild || cell
    const lines = player
      ? [...player.children].map((child) => child.textContent)
      : pick
        ? [pick.querySelector('span').textContent]
        : cell.innerText.trim().split(/\n/).filter(Boolean)
    return { lines, color: getComputedStyle(content).color, image: pick?.querySelector('.team-logo') }
  }))
  context.font = 'bold 14px Arial'
  const widths = rows[0].map((_, column) => Math.max(64, ...rows.flatMap((row) => row[column].lines.map((line) => context.measureText(line).width + 24))))
  const heights = rows.map((row) => Math.max(44, ...row.map((cell) => cell.lines.length * 20 + 16)))
  context.font = 'bold 16px Arial'
  const width = Math.max(widths.reduce((sum, value) => sum + value, 0), context.measureText(`NFL Pick’em 2026 · ${title}`).width + 24)
  widths[0] += width - widths.reduce((sum, value) => sum + value, 0)
  const height = heights.reduce((sum, value) => sum + value, 0) + 78
  canvas.width = Math.ceil(width * 2)
  canvas.height = Math.ceil(height * 2)
  context.scale(2, 2)
  context.fillStyle = '#0b1118'
  context.fillRect(0, 0, width, height)
  context.font = 'bold 16px Arial'
  context.fillStyle = '#edf2f7'
  context.fillText(`NFL Pick’em 2026 · ${title}`, 12, 26)
  let y = 44
  rows.forEach((row, index) => {
    let x = 0
    row.forEach((cell, column) => {
      context.fillStyle = index === 0 ? '#172231' : '#121b26'
      context.fillRect(x, y, widths[column], heights[index])
      context.strokeStyle = '#293746'
      context.strokeRect(x, y, widths[column], heights[index])
      context.font = index === 0 ? 'bold 14px Arial' : '14px Arial'
      context.fillStyle = cell.color
      context.textAlign = 'center'
      if (cell.image?.complete && cell.image.naturalWidth) {
        const logoSize = 26
        const gap = 6
        const textWidth = context.measureText(cell.lines[0]).width
        const logoX = x + (widths[column] - logoSize - gap - textWidth) / 2
        context.drawImage(cell.image, logoX, y + (heights[index] - logoSize) / 2, logoSize, logoSize)
        context.fillText(cell.lines[0], logoX + logoSize + gap + textWidth / 2, y + heights[index] / 2 + 5)
      } else {
        cell.lines.forEach((line, lineIndex) => context.fillText(line, x + widths[column] / 2, y + (heights[index] - cell.lines.length * 20) / 2 + 15 + lineIndex * 20))
      }
      x += widths[column]
    })
    y += heights[index]
  })
  context.textAlign = 'left'
  context.fillStyle = '#8b9aaa'
  context.font = '12px Arial'
  context.fillText('Green: correct · Red: incorrect · ?: hidden until kickoff', 12, y + 22)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}
