// Builds a small, valid PDF in memory: one page per string in `pages`.
// Tests use it so we know exactly which text is on which page — and no binary
// test file has to be stored in git.
//
// A PDF is a list of numbered "objects" (catalog → pages → page → content
// stream) plus an index ("xref") of each object's byte position at the end.

const LINE_LENGTH = 80 // wrap text; text running off the page isn't extracted

function escapePdfText(text) {
  return text.replace(/[()\\]/g, (c) => '\\' + c) // ( ) \ are special in PDF strings
}

/**
 * @param {string[]} pages  text for each page (ASCII)
 * @returns {Buffer}
 */
export function makePdf(pages) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]

  pages.forEach((text, i) => {
    const lines = text.match(new RegExp(`.{1,${LINE_LENGTH}}(\\s|$)`, 'g')) ?? [text]
    // BT/ET = begin/end text, Tf = font, TL = line spacing, Td = position, Tj = show text, T* = next line
    const stream =
      'BT /F1 11 Tf 14 TL 50 740 Td ' +
      lines.map((l) => `(${escapePdfText(l)}) Tj T*`).join(' ') +
      ' ET'
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    )
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((obj, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })

  const xrefStart = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

  return Buffer.from(pdf, 'latin1')
}
