const waitForImage = (image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
  const done = () => { clearTimeout(timeout); resolve() }
  const timeout = setTimeout(done, 2000)
  image.addEventListener('load', done, { once: true })
  image.addEventListener('error', done, { once: true })
})

const visible = (element) => {
  const style = getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function textItems(cell) {
  const elements = [...cell.querySelectorAll('button, strong, b, small, span, time')]
    .filter((element) => visible(element) && !element.children.length && element.textContent.trim())
  if (elements.length) return elements.map((element) => ({ element, text: element.textContent.trim() }))
  return cell.innerText.trim().split(/\n/).filter(Boolean).map((text) => ({ element: cell, text }))
}

function canvasFont(style) {
  return style.font && style.font !== 'normal' ? style.font : `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
}

function wrapText(context, text, width, anywhere) {
  if (context.measureText(text).width <= width) return [text]
  const result = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= width) {
      line = candidate
    } else {
      if (line) result.push(line)
      line = ''
      if (context.measureText(word).width <= width || !anywhere) line = word
      else {
        for (const character of word) {
          if (context.measureText(line + character).width > width && line) { result.push(line); line = '' }
          line += character
        }
      }
    }
  }
  if (line) result.push(line)
  return result.length ? result : [text]
}

function drawBox(context, element, tableRect, offsetY) {
  if (!visible(element)) return
  const rect = element.getBoundingClientRect()
  const x = rect.left - tableRect.left
  const y = rect.top - tableRect.top + offsetY
  const width = rect.width
  const height = rect.height
  if (!width || !height) return
  const style = getComputedStyle(element)
  if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
    context.fillStyle = style.backgroundColor
    const radiusValue = style.borderTopLeftRadius
    const radius = parseFloat(radiusValue) || 0
    if (radiusValue.includes('%')) {
      context.beginPath()
      context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
      context.fill()
    } else if (radius && context.roundRect) {
      context.beginPath()
      context.roundRect(x, y, width, height, radius)
      context.fill()
    } else context.fillRect(x, y, width, height)
  }
  const borderWidth = parseFloat(style.borderTopWidth) || parseFloat(style.borderWidth) || 0
  if (borderWidth && style.borderTopStyle !== 'none') {
    context.strokeStyle = style.borderTopColor
    context.lineWidth = borderWidth
    context.setLineDash(style.borderTopStyle === 'dashed' ? [3, 2] : [])
    context.strokeRect(x + borderWidth / 2, y + borderWidth / 2, width - borderWidth, height - borderWidth)
    context.setLineDash([])
  }
}

// Reuse the browser's actual line breaks. Rewrapping with canvas metrics can
// add a line to a narrow name cell and paint it over the season total below.
function browserTextLines(element) {
  if (!document.createRange) return []
  const lines = []
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  while (walker.nextNode()) {
    const node = walker.currentNode
    for (let index = 0; index < node.length; index++) {
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      // jsdom has no text layout; the fallback below also supports that case.
      if (!range.getBoundingClientRect) return []
      const rect = range.getBoundingClientRect()
      if (!rect.width || !rect.height) continue
      let line = lines.at(-1)
      if (!line || Math.abs(line.top - rect.top) > .5) {
        line = { text: '', left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
        lines.push(line)
      }
      line.text += node.data[index]
      line.left = Math.min(line.left, rect.left)
      line.right = Math.max(line.right, rect.right)
    }
  }
  return lines
}

function drawText(context, item, cell, tableRect, offsetY) {
  const element = item.element
  if (!visible(element)) return
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const cellRect = cell.getBoundingClientRect()
  const fontSize = parseFloat(style.fontSize) || 12
  const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2
  context.save()
  context.font = canvasFont(style)
  context.fillStyle = style.color
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing
  const transform = text => style.textTransform === 'uppercase' ? text.toLocaleUpperCase() : style.textTransform === 'lowercase' ? text.toLocaleLowerCase() : style.textTransform === 'capitalize' ? text.replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase()) : text
  let lines = browserTextLines(element)
  if (!lines.length) {
    const availableWidth = Math.max(1, rect.width || cellRect.width)
    const text = transform(item.text)
    const wrapped = style.whiteSpace === 'nowrap' ? [text] : wrapText(context, text, availableWidth, style.overflowWrap === 'anywhere' || style.wordBreak === 'break-word')
    lines = wrapped.map((text, index) => ({ text, left: rect.left, right: rect.left + availableWidth, top: rect.top + index * lineHeight, bottom: rect.top + (index + 1) * lineHeight }))
  }
  context.beginPath()
  // Keep each text block inside its browser allocation, including wrapped names.
  context.rect(cellRect.left - tableRect.left, rect.top - tableRect.top + offsetY, cellRect.width, rect.height || cellRect.height)
  context.clip()
  for (const line of lines) {
    const text = transform(line.text)
    const metrics = context.measureText(text)
    const ascent = metrics.fontBoundingBoxAscent ?? fontSize * .8
    const descent = metrics.fontBoundingBoxDescent ?? fontSize * .2
    const baseline = line.top + (line.bottom - line.top - ascent - descent) / 2 + ascent
    const width = Math.max(1, Math.min(line.right, cellRect.right) - Math.max(line.left, cellRect.left))
    // Scaling only when metrics differ avoids artificial ellipses and clipping.
    context.fillText(text, line.left - tableRect.left, baseline - tableRect.top + offsetY, width)
  }
  context.restore()
}

function drawLegend(context, legend, width, y) {
  if (!legend) return 22
  const style = getComputedStyle(legend)
  const lineHeight = 16
  let x = 12
  let lineY = y + lineHeight
  context.font = canvasFont(style)
  context.fillStyle = style.color
  context.textAlign = 'left'
  for (const node of legend.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.matches('span')) {
      if (x + 9 > width - 10) { x = 12; lineY += lineHeight }
      const dotStyle = getComputedStyle(node)
      context.fillStyle = dotStyle.backgroundColor
      context.beginPath()
      context.arc(x + 3, lineY - 4, 3.5, 0, Math.PI * 2)
      context.fill()
      x += 10
      context.fillStyle = style.color
      continue
    }
    const text = node.textContent.replace(/\s+/g, ' ').trim()
    if (!text) continue
    const gap = x > 12 ? 3 : 0
    const textWidth = context.measureText(text).width
    if (x + gap + textWidth > width - 10) { x = 12; lineY += lineHeight }
    context.fillText(text, x + gap, lineY)
    x += gap + textWidth
  }
  return lineY - y + 4
}

// Draw the displayed cells so hidden picks stay hidden and browser theme/logo styling is preserved.
export async function tableToPngBlob(table, title) {
  if (!table) throw new Error('Table is unavailable')
  await document.fonts?.ready
  const logos = [...table.querySelectorAll('img')]
  await Promise.all(logos.map(waitForImage))
  const tableRect = table.getBoundingClientRect()
  const width = Math.ceil(Math.max(tableRect.width, table.scrollWidth))
  const tableHeight = Math.ceil(tableRect.height)
  const section = table.closest('section')
  const legend = section?.querySelector('.overview-legend')
  const legendHeight = legend ? Math.ceil(legend.getBoundingClientRect().height || 20) + 12 : 0
  const rootStyle = getComputedStyle(document.documentElement)
  const paper = rootStyle.getPropertyValue('--paper').trim() || rootStyle.backgroundColor
  const ink = rootStyle.getPropertyValue('--ink').trim() || rootStyle.color
  const font = rootStyle.fontFamily
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  const headingFont = `700 16px ${font}`
  context.font = headingFont
  const headingLines = wrapText(context, `NFL Pick\u2019em 2026 \u00b7 ${title}`, Math.max(1, width - 24), true)
  const headingHeight = Math.max(48, 24 + headingLines.length * 20)
  canvas.width = Math.ceil(width * 2)
  canvas.height = Math.ceil((headingHeight + tableHeight + legendHeight) * 2)
  context.scale(2, 2)
  context.fillStyle = paper
  context.fillRect(0, 0, width, headingHeight + tableHeight + legendHeight)
  context.fillStyle = ink
  context.font = headingFont
  context.textAlign = 'left'
  headingLines.forEach((line, index) => context.fillText(line, 12, 28 + index * 20))

  const rows = [...table.rows]
  rows.forEach((row) => [...row.cells].forEach((cell) => {
    const rect = cell.getBoundingClientRect()
    const x = rect.left - tableRect.left
    const y = headingHeight + rect.top - tableRect.top
    const style = getComputedStyle(cell)
    if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      context.fillStyle = style.backgroundColor
      context.fillRect(x, y, rect.width, rect.height)
    }
    const border = parseFloat(style.borderBottomWidth) || 0
    if (border && style.borderBottomStyle !== 'none') {
      context.fillStyle = style.borderBottomColor
      context.fillRect(x, y + rect.height - border, rect.width, border)
    }
  }))

  rows.forEach((row) => [...row.cells].forEach((cell) => {
    const rect = cell.getBoundingClientRect()
    const x = rect.left - tableRect.left
    const y = headingHeight + rect.top - tableRect.top
    context.save()
    context.beginPath()
    context.rect(x, y, rect.width, rect.height)
    context.clip()
    cell.querySelectorAll('.overview-pick, .pick-hidden, .pick-empty, .live-badge, .overview-gotw').forEach((element) => drawBox(context, element, tableRect, headingHeight))
    cell.querySelectorAll('img').forEach((image) => {
      if (!image.naturalWidth) return
      const logoRect = image.getBoundingClientRect()
      context.drawImage(image, logoRect.left - tableRect.left, headingHeight + logoRect.top - tableRect.top, logoRect.width, logoRect.height)
    })
    textItems(cell).forEach((item) => drawText(context, item, cell, tableRect, headingHeight))
    context.restore()
  }))

  context.fillStyle = paper
  context.fillRect(0, headingHeight + tableHeight, width, legendHeight)
  if (legend) drawLegend(context, legend, width, headingHeight + tableHeight + 6)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
}
