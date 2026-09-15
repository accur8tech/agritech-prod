"use client"

import { useRef } from "react"
import { PrinterIcon } from "@heroicons/react/24/outline"
import { Button } from "@/components/ui/button"
import { ClaimResultSummary, type ClaimEvalViewModel } from "./ClaimResultSummary"
import { claimStatusLabel } from "@/lib/claimStatus"

interface ClaimPrintButtonProps {
  title?: string
  subtitle?: string
  status?: string | null
  result: ClaimEvalViewModel
  extraLines?: string[]
}

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    color: #111;
    font-family: Georgia, "Times New Roman", serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body { padding: 20px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h4 { font-size: 14px; margin: 16px 0 8px; font-weight: 700; }
  .muted { color: #555; font-size: 13px; margin: 0 0 8px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 12px;
    background: #f5f5f5;
  }
  .space-y-5 > * + * { margin-top: 1.25rem; }
  .space-y-4 > * + * { margin-top: 1rem; }
  .grid {
    display: grid;
    gap: 10px;
    margin: 12px 0;
  }
  .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .md\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .rounded-lg, .rounded-md {
    border: 1px solid #ddd;
    border-radius: 6px;
    padding: 10px;
    background: #fff;
  }
  .border { border: 1px solid #ddd; }
  .border-amber-200 { border-color: #fde68a; }
  .bg-amber-50 { background: #fffbeb; }
  .text-amber-900, .text-amber-800 { color: #78350f; }
  .text-xs { font-size: 11px; }
  .text-sm { font-size: 13px; }
  .text-lg { font-size: 16px; }
  .text-xl { font-size: 18px; }
  .font-semibold, .font-medium, .font-bold { font-weight: 600; }
  .text-gray-500 { color: #6b7280; }
  .text-gray-600, .text-gray-700 { color: #374151; }
  .text-gray-900 { color: #111827; }
  .mt-1 { margin-top: 4px; }
  .mt-2 { margin-top: 8px; }
  .mb-2 { margin-bottom: 8px; }
  .leading-snug { line-height: 1.35; }
  .tabular-nums { font-variant-numeric: tabular-nums; }
  .whitespace-nowrap { white-space: nowrap; }
  .overflow-hidden { overflow: visible !important; }
  .capitalize { text-transform: capitalize; }
  .col-span-2 { grid-column: span 2; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 12px;
  }
  th, td {
    border: 1px solid #ddd;
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  th { background: #f5f5f5; font-weight: 600; }
  .text-right { text-align: right; }
  tr { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  tbody { display: table-row-group; }
  .print-section { page-break-inside: avoid; break-inside: avoid-page; }
  @media print {
    @page { size: auto; margin: 12mm; }
    body { padding: 0; }
    .rounded-lg, .rounded-md, table, tr, h4 {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`

/**
 * Prints claim / coverage-check details via a hidden iframe
 * (avoids a blank popup tab alongside the print dialog).
 */
export function ClaimPrintButton({
  title = "Claim summary",
  subtitle,
  status,
  result,
  extraLines = [],
}: ClaimPrintButtonProps) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    const existing = document.getElementById("claim-print-frame")
    if (existing) existing.remove()

    const iframe = document.createElement("iframe")
    iframe.id = "claim-print-frame"
    iframe.setAttribute("title", "Print claim")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    iframe.style.opacity = "0"
    iframe.style.pointerEvents = "none"
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument || iframe.contentWindow?.document
    const win = iframe.contentWindow
    if (!doc || !win) {
      iframe.remove()
      return
    }

    doc.open()
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title.replace(/</g, "&lt;")}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>
  ${content.innerHTML}
</body>
</html>`)
    doc.close()

    const cleanup = () => {
      try {
        iframe.remove()
      } catch {
        // ignore
      }
    }

    const triggerPrint = () => {
      try {
        win.focus()
        win.print()
      } finally {
        // Remove after the print dialog closes (or shortly if afterprint is unsupported)
        win.addEventListener("afterprint", cleanup, { once: true })
        window.setTimeout(cleanup, 1500)
      }
    }

    // Wait a tick so layout (esp. multi-period tables) is ready before printing
    if (doc.readyState === "complete") {
      window.setTimeout(triggerPrint, 50)
    } else {
      win.addEventListener("load", () => window.setTimeout(triggerPrint, 50), {
        once: true,
      })
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={handlePrint}>
        <PrinterIcon className="h-4 w-4 mr-2" />
        Print
      </Button>

      {/* Off-screen print source (visible to layout, not to users) */}
      <div
        className="fixed left-[-10000px] top-0 w-[900px] overflow-visible"
        aria-hidden
      >
        <div ref={printRef}>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {status && (
            <p className="muted">
              Status: <span className="badge">{claimStatusLabel(status)}</span>
            </p>
          )}
          {extraLines.map((line) => (
            <p key={line} className="muted">
              {line}
            </p>
          ))}
          <ClaimResultSummary result={result} />
        </div>
      </div>
    </>
  )
}
