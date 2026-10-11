const SVG_NS = 'http://www.w3.org/2000/svg'
const svgElement = (tag, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, tag)
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value))
  return element
}

// SVGs loaded as images cannot inherit the page's CSS or theme variables.
const STYLE_PROPERTIES = ['color', 'fill', 'fill-opacity', 'stroke', 'stroke-opacity', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'word-spacing', 'text-anchor', 'dominant-baseline', 'paint-order', 'vector-effect', 'visibility', 'display']

export function cloneStyledChart(svg) {
  const copy = svg.cloneNode(true)
  const originals = [svg, ...svg.querySelectorAll('*')]
  ;[copy, ...copy.querySelectorAll('*')].forEach((element, index) => {
    const style = getComputedStyle(originals[index])
    for (const property of STYLE_PROPERTIES) element.style.setProperty(property, style.getPropertyValue(property))
  })
  return copy
}

export function wrapExportText(text, context, maxWidth) {
  const lines = []
  let line = ''
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && context.measureText(`${line} ${word}`).width > maxWidth) { lines.push(line); line = '' }
    // Long names / words must also fit, without truncating any characters.
    if (context.measureText(word).width <= maxWidth) line += (line ? ' ' : '') + word
    else for (const character of word) {
      if (line && context.measureText(line + character).width > maxWidth) { lines.push(line); line = '' }
      line += character
    }
  }
  if (line) lines.push(line)
  return lines
}

export function buildChartExport(svg, context) {
  if (!svg) throw new Error('Chart is unavailable')
  const card = svg.closest('.chart-card')
  const viewBox = svg.viewBox.baseVal
  if (!(viewBox.width > 0 && viewBox.height > 0)) throw new Error('Chart dimensions are unavailable')
  const box = svg.getBoundingClientRect()
  const plotWidth = box.width || viewBox.width
  const plotHeight = plotWidth * viewBox.height / viewBox.width
  const scale = plotWidth / viewBox.width
  const bounds = svg.getBBox()
  const extraLeft = Math.max(0, viewBox.x - bounds.x) * scale
  const extraTop = Math.max(0, viewBox.y - bounds.y) * scale
  const extraRight = Math.max(0, bounds.x + bounds.width - viewBox.x - viewBox.width) * scale
  const extraBottom = Math.max(0, bounds.y + bounds.height - viewBox.y - viewBox.height) * scale
  const padding = 16
  const width = Math.ceil(plotWidth + extraLeft + extraRight + padding * 2)
  const root = svgElement('svg', { width })
  const style = getComputedStyle(card ?? svg)
  const background = svgElement('rect', { width, fill: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#0b1118' : style.backgroundColor })
  root.append(background)
  let cursor = padding
  const appendText = (text, element, fallbackSize) => {
    if (!text) return
    const computed = getComputedStyle(element ?? svg)
    const fontSize = parseFloat(computed.fontSize) || fallbackSize
    const fontFamily = computed.fontFamily || 'Arial, sans-serif'
    const fontWeight = computed.fontWeight || '400'
    const lineHeight = parseFloat(computed.lineHeight) || fontSize * 1.3
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`
    const lines = wrapExportText(text, context, width - padding * 2)
    for (const line of lines) {
      const node = svgElement('text', { x: padding, y: cursor + fontSize, fill: computed.color, 'font-family': fontFamily, 'font-size': fontSize, 'font-weight': fontWeight })
      node.textContent = line
      root.append(node)
      cursor += lineHeight
    }
    cursor += 8
  }
  const title = card?.querySelector('.chart-heading h3')
  appendText(title?.textContent ?? svg.getAttribute('aria-label'), title, 18)
  const controls = [...(card?.querySelectorAll('.chart-heading label') ?? [])].map((label) => {
    const select = label.querySelector('select')
    const checkbox = label.querySelector('input[type="checkbox"]')
    const name = [...label.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' ').trim()
    return select ? `${name}: ${select.selectedOptions[0]?.textContent ?? ''}` : checkbox ? `${label.textContent.trim()}: ${checkbox.checked ? 'On' : 'Off'}` : label.textContent.trim()
  })
  appendText(controls.join(' · '), card?.querySelector('.chart-heading label'), 12)
  const copy = cloneStyledChart(svg)
  copy.setAttribute('x', padding + extraLeft)
  copy.setAttribute('y', cursor + extraTop)
  copy.setAttribute('width', plotWidth)
  copy.setAttribute('height', plotHeight)
  copy.style.width = `${plotWidth}px`
  copy.style.height = `${plotHeight}px`
  copy.style.minWidth = '0'
  copy.style.overflow = 'visible'
  const plot = { x: padding + extraLeft, y: cursor + extraTop, width: plotWidth, height: plotHeight }
  root.append(copy)
  cursor += plotHeight + extraTop + extraBottom + 8
  const description = card?.querySelector('.chart-description')
  appendText(description?.textContent, description, 13)
  const height = Math.ceil(cursor + padding)
  root.setAttribute('height', height)
  root.setAttribute('viewBox', `0 0 ${width} ${height}`)
  background.setAttribute('height', height)
  return { svg: root, width, height, plot }
}

export async function svgToPngBlob(svg) {
  if (!svg) throw new Error('Chart is unavailable')
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')
  const exported = buildChartExport(svg, context)
  const resolution = 2
  canvas.width = Math.ceil(exported.width * resolution)
  canvas.height = Math.ceil(exported.height * resolution)
  const source = new XMLSerializer().serializeToString(exported.svg)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png')
      } catch (error) { reject(error) }
    }
    image.onerror = () => reject(new Error('Chart image could not be rendered'))
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  })
}
