import { jsPDF } from 'jspdf'

const COLORS = {
  primary: [56, 103, 90],
  primaryContainer: [107, 155, 140],
  surface: [249, 249, 255],
  surfaceContainer: [233, 237, 255],
  surfaceContainerLow: [241, 243, 255],
  outline: [112, 121, 117],
  outlineVariant: [192, 200, 196],
  onSurface: [20, 27, 43],
  onSurfaceVariant: [64, 73, 69],
  error: [186, 26, 26],
  secondary: [0, 108, 78],
}

const fmtZAR = (n) =>
  new Intl.NumberFormat('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(Number(n) || 0))

const fmtDate = (d) => {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('en-ZA', {
      day: 'numeric', month: 'short', year: 'numeric',
    }).format(new Date(d))
  } catch {
    return String(d)
  }
}

/**
 * Build an AirHouse-branded invoice PDF for a wallet transaction.
 *
 * @param {object} invoice - normalised invoice payload (see buildInvoiceFromTransaction in lib/invoices.js)
 * @returns {jsPDF}
 */
export function buildInvoicePdf(invoice) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40

  // Header accent bar
  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, pageWidth, 6, 'F')

  // Title block
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  doc.setTextColor(...COLORS.onSurface)
  doc.text(invoice.isReceipt ? 'Receipt' : 'Invoice', margin, 60)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.outline)
  doc.text(`#${invoice.invoiceNumber}`, margin, 78)

  // Right side: status pill + dates
  const statusLabel = (invoice.statusLabel || 'Issued').toUpperCase()
  const statusColor = invoice.statusColor === 'error'
    ? COLORS.error
    : invoice.statusColor === 'warning'
      ? COLORS.outlineVariant
      : COLORS.secondary

  doc.setFillColor(...statusColor)
  doc.roundedRect(pageWidth - margin - 90, 48, 90, 22, 4, 4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text(statusLabel, pageWidth - margin - 45, 63, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.onSurfaceVariant)
  doc.text(`Date Issued:  ${fmtDate(invoice.issueDate)}`, pageWidth - margin, 86, { align: 'right' })
  if (invoice.datePaid) {
    doc.text(`Date Paid:    ${fmtDate(invoice.datePaid)}`, pageWidth - margin, 100, { align: 'right' })
  }

  // Divider
  doc.setDrawColor(...COLORS.outlineVariant)
  doc.setLineWidth(0.7)
  doc.line(margin, 120, pageWidth - margin, 120)

  // Parties (Bill From / Bill To)
  let partyY = 144
  const colWidth = (pageWidth - margin * 2 - 16) / 2

  const drawParty = (x, label, party, accentColor) => {
    doc.setFillColor(...COLORS.surfaceContainer)
    doc.roundedRect(x, partyY, colWidth, 90, 6, 6, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...accentColor)
    doc.text(label.toUpperCase(), x + 14, partyY + 20)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...COLORS.onSurface)
    doc.text(party.name || '—', x + 14, partyY + 40)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.onSurfaceVariant)
    const lines = []
    if (party.email) lines.push(party.email)
    if (party.address) lines.push(party.address)
    if (party.id) lines.push(`ID: ${party.id}`)
    lines.slice(0, 4).forEach((line, i) => {
      doc.text(String(line).slice(0, 70), x + 14, partyY + 56 + i * 12)
    })
  }

  drawParty(margin, invoice.fromLabel || 'Bill From', invoice.from || {}, COLORS.primary)
  drawParty(margin + colWidth + 16, invoice.toLabel || 'Bill To', invoice.to || {}, COLORS.primaryContainer)

  // Line items table
  let tableY = partyY + 90 + 28

  doc.setDrawColor(...COLORS.outlineVariant)
  doc.setLineWidth(1)
  doc.line(margin, tableY, pageWidth - margin, tableY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.outline)
  doc.text('DESCRIPTION', margin, tableY + 16)
  doc.text('AMOUNT (ZAR)', pageWidth - margin, tableY + 16, { align: 'right' })

  let rowY = tableY + 30
  ;(invoice.items || []).forEach((it) => {
    if (rowY > pageHeight - 220) {
      doc.addPage()
      rowY = margin
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.onSurface)
    doc.text(String(it.description || '').slice(0, 70), margin, rowY)

    if (it.details) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(...COLORS.outline)
      doc.text(String(it.details).slice(0, 90), margin, rowY + 12)
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(...COLORS.onSurface)
    const amt = (it.amount < 0 ? '-' : '') + fmtZAR(it.amount)
    doc.text(amt, pageWidth - margin, rowY, { align: 'right' })

    rowY += it.details ? 32 : 22
    doc.setDrawColor(...COLORS.outlineVariant)
    doc.setLineWidth(0.4)
    doc.line(margin, rowY - 6, pageWidth - margin, rowY - 6)
  })

  // Summary box (right half)
  const sumX = pageWidth / 2 + 10
  let sumY = rowY + 24
  if (sumY > pageHeight - 160) {
    doc.addPage()
    sumY = margin + 20
  }
  const sumWidth = pageWidth - margin - sumX
  const summary = invoice.summary || []
  const sumHeight = 24 + summary.length * 22 + 36

  doc.setFillColor(255, 255, 255)
  doc.setDrawColor(...COLORS.outlineVariant)
  doc.roundedRect(sumX, sumY, sumWidth, sumHeight, 6, 6, 'FD')

  let lineY = sumY + 22
  summary.forEach((s) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...(s.color === 'error' ? COLORS.error : COLORS.onSurfaceVariant))
    doc.text(s.label, sumX + 14, lineY)
    doc.setFont('helvetica', 'bold')
    doc.text(
      (s.value < 0 ? '-' : '') + fmtZAR(s.value),
      sumX + sumWidth - 14,
      lineY,
      { align: 'right' }
    )
    lineY += 18
    doc.setDrawColor(...COLORS.outlineVariant)
    doc.setLineWidth(0.3)
    doc.line(sumX + 10, lineY - 6, sumX + sumWidth - 10, lineY - 6)
  })

  // Totals row
  doc.setDrawColor(...COLORS.primary)
  doc.setLineWidth(1.5)
  doc.line(sumX + 10, lineY + 4, sumX + sumWidth - 10, lineY + 4)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...COLORS.primary)
  doc.text(invoice.totalLabel || 'Total (ZAR)', sumX + 14, lineY + 22)

  doc.setFontSize(16)
  doc.text(
    'R ' + fmtZAR(invoice.total),
    sumX + sumWidth - 14,
    lineY + 22,
    { align: 'right' }
  )

  // Footer
  doc.setDrawColor(...COLORS.outlineVariant)
  doc.setLineWidth(0.5)
  doc.line(margin, pageHeight - 60, pageWidth - margin, pageHeight - 60)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.outline)
  doc.text(
    'AirHouse (Pty) Ltd  •  Institutional Grade Trust Systems',
    margin,
    pageHeight - 42
  )
  doc.text(
    'Generated ' + fmtDate(new Date()),
    pageWidth - margin,
    pageHeight - 42,
    { align: 'right' }
  )

  return doc
}

/**
 * Trigger client-side PDF download.
 */
export function downloadInvoicePdf(invoice, filename) {
  const doc = buildInvoicePdf(invoice)
  doc.save(filename || `${invoice.invoiceNumber || 'invoice'}.pdf`)
}
