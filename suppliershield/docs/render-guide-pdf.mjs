import fs from 'node:fs'

const input = process.argv[2]
const output = process.argv[3]

if (!input || !output) {
  console.error('Usage: node docs/render-guide-pdf.mjs <input.md> <output.pdf>')
  process.exit(1)
}

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 48
const MARGIN_TOP = 52
const MARGIN_BOTTOM = 52
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2

const escapePdf = (value) =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')

const widthFactor = (char, mono = false) => {
  if (mono) return 0.58
  if ('ilI.,:;|!'.includes(char)) return 0.25
  if ('mwMW@#%&'.includes(char)) return 0.88
  if ('ABCDEFGHKNOPQRSTUVWXYZ'.includes(char)) return 0.68
  if (char === ' ') return 0.32
  return 0.52
}

const textWidth = (text, fontSize, mono = false) =>
  [...text].reduce((sum, char) => sum + widthFactor(char, mono) * fontSize, 0)

function wrapText(text, fontSize, maxWidth, mono = false) {
  const words = text.split(/\s+/)
  const lines = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (textWidth(candidate, fontSize, mono) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) lines.push(current)

    if (textWidth(word, fontSize, mono) <= maxWidth) {
      current = word
      continue
    }

    let chunk = ''
    for (const char of word) {
      const next = chunk + char
      if (textWidth(next, fontSize, mono) > maxWidth && chunk) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk = next
      }
    }
    current = chunk
  }

  if (current) lines.push(current)
  return lines.length ? lines : ['']
}

function parseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/)
  const blocks = []
  let code = null
  let paragraph = []

  const closeParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ type: 'p', text: paragraph.join(' ') })
    paragraph = []
  }

  for (const line of lines) {
    const fence = line.match(/^```(.*)$/)
    if (fence) {
      if (code) {
        blocks.push({ type: 'code', lang: code.lang, text: code.lines.join('\n') })
        code = null
      } else {
        closeParagraph()
        code = { lang: fence[1].trim(), lines: [] }
      }
      continue
    }

    if (code) {
      code.lines.push(line)
      continue
    }

    if (!line.trim()) {
      closeParagraph()
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      closeParagraph()
      blocks.push({ type: `h${heading[1].length}`, text: heading[2] })
      continue
    }

    const bullet = line.match(/^-\s+(.*)$/)
    if (bullet) {
      closeParagraph()
      blocks.push({ type: 'li', text: bullet[1] })
      continue
    }

    paragraph.push(line.trim())
  }

  if (code) blocks.push({ type: 'code', lang: code.lang, text: code.lines.join('\n') })
  closeParagraph()
  return blocks
}

const pages = []
let commands = []
let y = PAGE_HEIGHT - MARGIN_TOP
let pageNo = 0

function addPage() {
  if (commands.length) {
    drawFooter()
    pages.push(commands.join('\n'))
  }
  pageNo += 1
  commands = []
  y = PAGE_HEIGHT - MARGIN_TOP
}

function drawText(text, x, yy, size, font = 'F1') {
  commands.push(`BT /${font} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${escapePdf(text)}) Tj ET`)
}

function drawFooter() {
  commands.push('0.72 0.78 0.83 RG 48 38 m 547 38 l S')
  drawText(`CAP + Vite + Cloud Foundry Deployment Guide  |  Page ${pageNo}`, 48, 24, 8, 'F1')
}

function ensureSpace(height) {
  if (y - height < MARGIN_BOTTOM) addPage()
}

function addWrapped(text, opts = {}) {
  const {
    x = MARGIN_X,
    size = 10.5,
    leading = size * 1.35,
    font = 'F1',
    maxWidth = CONTENT_WIDTH,
    before = 0,
    after = 6,
    mono = false,
  } = opts

  const cleaned = text.replace(/`([^`]+)`/g, '$1')
  const lines = wrapText(cleaned, size, maxWidth, mono)
  ensureSpace(before + lines.length * leading + after)
  y -= before
  for (const line of lines) {
    drawText(line, x, y, size, font)
    y -= leading
  }
  y -= after
}

function addCode(text, lang) {
  const codeLines = []
  if (lang) codeLines.push(`[${lang}]`)
  for (const raw of text.split('\n')) {
    const wrapped = wrapText(raw || ' ', 8.2, CONTENT_WIDTH - 18, true)
    codeLines.push(...wrapped)
  }

  const leading = 10.8
  const height = codeLines.length * leading + 18
  ensureSpace(height + 6)
  commands.push('0.96 0.97 0.98 rg')
  commands.push(`48 ${(y - height + 8).toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${height.toFixed(2)} re f`)
  commands.push('0.82 0.86 0.90 RG')
  commands.push(`48 ${(y - height + 8).toFixed(2)} ${CONTENT_WIDTH.toFixed(2)} ${height.toFixed(2)} re S`)
  y -= 10
  for (const line of codeLines) {
    drawText(line, 58, y, 8.2, 'F2')
    y -= leading
  }
  y -= 10
}

addPage()

for (const block of parseMarkdown(fs.readFileSync(input, 'utf8'))) {
  if (block.type === 'h1') {
    ensureSpace(60)
    addWrapped(block.text, { size: 22, leading: 27, before: 0, after: 10, font: 'F3' })
    commands.push('0.35 0.65 0.77 RG 48 ' + y.toFixed(2) + ' m 547 ' + y.toFixed(2) + ' l S')
    y -= 14
  } else if (block.type === 'h2') {
    addWrapped(block.text, { size: 15, leading: 19, before: 14, after: 5, font: 'F3' })
  } else if (block.type === 'h3') {
    addWrapped(block.text, { size: 12.2, leading: 16, before: 8, after: 4, font: 'F3' })
  } else if (block.type === 'li') {
    addWrapped(`- ${block.text}`, { x: MARGIN_X + 12, maxWidth: CONTENT_WIDTH - 12, size: 10.2, after: 2 })
  } else if (block.type === 'code') {
    addCode(block.text, block.lang)
  } else {
    addWrapped(block.text)
  }
}

drawFooter()
pages.push(commands.join('\n'))

const objects = []
const addObject = (content) => {
  objects.push(content)
  return objects.length
}

const fontRegular = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
const fontMono = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')
const fontBold = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

const pageRefs = []
for (const stream of pages) {
  const streamObject = addObject(`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`)
  const pageObject = addObject(`<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontRegular} 0 R /F2 ${fontMono} 0 R /F3 ${fontBold} 0 R >> >> /Contents ${streamObject} 0 R >>`)
  pageRefs.push(pageObject)
}

const pagesObject = addObject(`<< /Type /Pages /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`)
const catalogObject = addObject(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`)

for (const ref of pageRefs) {
  objects[ref - 1] = objects[ref - 1].replace('/Parent 0 0 R', `/Parent ${pagesObject} 0 R`)
}

let pdf = '%PDF-1.4\n'
const offsets = [0]
for (let i = 0; i < objects.length; i += 1) {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
}

const xrefOffset = Buffer.byteLength(pdf)
pdf += `xref\n0 ${objects.length + 1}\n`
pdf += '0000000000 65535 f \n'
for (let i = 1; i < offsets.length; i += 1) {
  pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`

fs.writeFileSync(output, pdf)
