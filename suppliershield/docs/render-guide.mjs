import fs from 'node:fs'

const input = process.argv[2]
const output = process.argv[3]

if (!input || !output) {
  console.error('Usage: node docs/render-guide.mjs <input.md> <output.html>')
  process.exit(1)
}

const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

const inline = (value) =>
  escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>')

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/)
const body = []
let inCode = false
let codeLang = ''
let codeLines = []
let inList = false
let paragraph = []

function closeParagraph() {
  if (!paragraph.length) return
  body.push(`<p>${inline(paragraph.join(' '))}</p>`)
  paragraph = []
}

function closeList() {
  if (!inList) return
  body.push('</ul>')
  inList = false
}

function closeCode() {
  if (!inCode) return
  const lang = codeLang ? `<span class="code-lang">${escapeHtml(codeLang)}</span>` : ''
  body.push(`<pre>${lang}<code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  inCode = false
  codeLang = ''
  codeLines = []
}

for (const line of lines) {
  const codeMatch = line.match(/^```(.*)$/)
  if (codeMatch) {
    if (inCode) {
      closeCode()
    } else {
      closeParagraph()
      closeList()
      inCode = true
      codeLang = codeMatch[1].trim()
      codeLines = []
    }
    continue
  }

  if (inCode) {
    codeLines.push(line)
    continue
  }

  if (!line.trim()) {
    closeParagraph()
    closeList()
    continue
  }

  const heading = line.match(/^(#{1,3})\s+(.*)$/)
  if (heading) {
    closeParagraph()
    closeList()
    const level = heading[1].length
    body.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    continue
  }

  const bullet = line.match(/^-\s+(.*)$/)
  if (bullet) {
    closeParagraph()
    if (!inList) {
      body.push('<ul>')
      inList = true
    }
    body.push(`<li>${inline(bullet[1])}</li>`)
    continue
  }

  paragraph.push(line.trim())
}

closeCode()
closeParagraph()
closeList()

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>CAP Vite Cloud Foundry Deployment Guide</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      color: #172033;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.48;
      margin: 0;
    }
    h1 {
      color: #0f3f5f;
      font-size: 28px;
      line-height: 1.12;
      margin: 0 0 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid #58a6c4;
    }
    h2 {
      color: #174862;
      font-size: 18px;
      margin: 24px 0 8px;
      page-break-after: avoid;
    }
    h3 {
      color: #28546a;
      font-size: 14px;
      margin: 16px 0 6px;
      page-break-after: avoid;
    }
    p { margin: 6px 0; }
    ul { margin: 6px 0 10px 18px; padding: 0; }
    li { margin: 3px 0; }
    code {
      color: #243244;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 10.5px;
    }
    p code, li code {
      background: #eef3f7;
      border: 1px solid #d9e3ea;
      border-radius: 4px;
      padding: 1px 4px;
    }
    pre {
      background: #f6f8fa;
      border: 1px solid #d8dee4;
      border-radius: 6px;
      margin: 8px 0 12px;
      padding: 10px 12px;
      white-space: pre-wrap;
      word-break: break-word;
      page-break-inside: avoid;
    }
    pre code {
      display: block;
      color: #1f2937;
      font-size: 9.5px;
      line-height: 1.42;
    }
    .code-lang {
      color: #64748b;
      display: block;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 9px;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`

fs.writeFileSync(output, html)
