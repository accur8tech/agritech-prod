import type { ClaimStatus } from "@/lib/database.types"

/** Canonical workflow statuses for claims ops */
export const CLAIM_STATUS_VALUES = [
  "under_process",
  "clear",
  "paid",
  "rejected",
] as const

export type ClaimWorkflowStatus = (typeof CLAIM_STATUS_VALUES)[number]

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  under_process: "Under process",
  clear: "Clear",
  paid: "Paid",
  rejected: "Rejected",
  // Legacy DB values (pre-workflow rename)
  pending: "Under process",
  approved: "Under process",
}

export const CLAIM_STATUS_BADGE_CLASS: Record<string, string> = {
  under_process: "bg-yellow-100 text-yellow-800",
  clear: "bg-slate-100 text-slate-700",
  paid: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-yellow-100 text-yellow-800",
}

/** Normalize legacy statuses into the current workflow set */
export function normalizeClaimStatus(status?: string | null): ClaimWorkflowStatus {
  if (status === "clear") return "clear"
  if (status === "paid") return "paid"
  if (status === "rejected") return "rejected"
  if (status === "under_process" || status === "pending" || status === "approved") {
    return "under_process"
  }
  return "under_process"
}

export function claimStatusLabel(status?: string | null): string {
  if (!status) return "—"
  return CLAIM_STATUS_LABELS[status] || status
}

export function isOpenClaimStatus(status?: string | null): boolean {
  return normalizeClaimStatus(status) === "under_process"
}

export function defaultStatusForPayout(payout: number): ClaimStatus {
  return payout > 0 ? "under_process" : "clear"
}

export function parseISODate(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value.slice(0, 10) + "T00:00:00")
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatShortDate(value?: string | null): string {
  const d = parseISODate(value)
  if (!d) return "—"
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

/**
 * Policy still active if coverage end is today or later.
 * Partial claim if the checked window is shorter than the full product coverage.
 */
export function getPolicyClaimContext(opts: {
  coverageStart?: string | null
  coverageEnd?: string | null
  evaluationStart?: string | null
  evaluationEnd?: string | null
  today?: Date
}): {
  policyActive: boolean
  isPartialClaim: boolean
  coverageLabel: string
  evaluationLabel: string
} {
  const today = opts.today || new Date()
  today.setHours(0, 0, 0, 0)

  const coverageStart = parseISODate(opts.coverageStart)
  const coverageEnd = parseISODate(opts.coverageEnd)
  const evalStart = parseISODate(opts.evaluationStart)
  const evalEnd = parseISODate(opts.evaluationEnd)

  const policyActive = !!(coverageEnd && coverageEnd >= today)

  let isPartialClaim = false
  if (coverageStart && coverageEnd && evalStart && evalEnd) {
    const fullMs = coverageEnd.getTime() - coverageStart.getTime()
    const evalMs = evalEnd.getTime() - evalStart.getTime()
    const startsLater = evalStart.getTime() > coverageStart.getTime()
    const endsEarlier = evalEnd.getTime() < coverageEnd.getTime()
    isPartialClaim = (startsLater || endsEarlier) && evalMs < fullMs
  }

  return {
    policyActive,
    isPartialClaim,
    coverageLabel:
      coverageStart && coverageEnd
        ? `${formatShortDate(opts.coverageStart)} – ${formatShortDate(opts.coverageEnd)}`
        : "—",
    evaluationLabel:
      evalStart && evalEnd
        ? `${formatShortDate(opts.evaluationStart)} – ${formatShortDate(opts.evaluationEnd)}`
        : "—",
  }
}

function normalizePeriods(breakdown: any): any[] {
  if (!breakdown) return []
  if (Array.isArray(breakdown)) return breakdown
  if (Array.isArray(breakdown.periods)) return breakdown.periods
  return []
}

/**
 * Agent-friendly message when rainfall (CHIRPS) or temperature data is incomplete.
 */
export function getWeatherAvailabilityMessage(opts: {
  perilBreakdown?: any
  weatherSnapshot?: any
  dataAvailableThrough?: Record<string, string | null>
  evaluationEnd?: string | null
}): string | null {
  const periods = normalizePeriods(opts.perilBreakdown)
  const perils = periods.flatMap((p) => p.perils || [])
  const rainPerils = perils.filter(
    (p: any) => p.peril_type === "LRI" || p.peril_type === "ERI"
  )
  const tempPerils = perils.filter(
    (p: any) => p.peril_type === "LTI" || p.peril_type === "HTI"
  )

  const rainInsufficient = rainPerils.some((p: any) => p.insufficient_data)
  const tempInsufficient = tempPerils.some((p: any) => p.insufficient_data)

  const precipThrough =
    opts.dataAvailableThrough?.precipitation ||
    opts.weatherSnapshot?.series_summary?.precipitation?.last_date ||
    null
  const tempThrough =
    opts.dataAvailableThrough?.temperature ||
    opts.weatherSnapshot?.series_summary?.temperature?.last_date ||
    null

  const evalEnd = parseISODate(opts.evaluationEnd)
  const precipEnd = parseISODate(precipThrough)
  const tempEnd = parseISODate(tempThrough)

  const expectsRain =
    rainPerils.length > 0 ||
    (opts.weatherSnapshot?.datasets || []).includes("CHIRPS") ||
    opts.dataAvailableThrough?.precipitation !== undefined

  const expectsTemp =
    tempPerils.length > 0 ||
    (opts.weatherSnapshot?.datasets || []).includes("ERA5_LAND") ||
    opts.dataAvailableThrough?.temperature !== undefined

  const rainLagging =
    !!expectsRain &&
    !!evalEnd &&
    ((!!precipEnd && precipEnd < evalEnd) || (!precipThrough && rainPerils.length > 0))
  const tempLagging =
    !!expectsTemp &&
    !!evalEnd &&
    ((!!tempEnd && tempEnd < evalEnd) || (!tempThrough && tempPerils.length > 0))

  const rainMissingObs =
    rainPerils.length > 0 &&
    rainPerils.every((p: any) => !p.observations || p.observations === 0)

  if (rainInsufficient || rainLagging || rainMissingObs) {
    const throughLabel = precipThrough
      ? ` Rainfall data is currently available only through ${formatShortDate(precipThrough)}.`
      : ""
    return (
      `Rainfall data from CHIRPS is not yet available for the full period you selected.` +
      throughLabel +
      ` Satellite rainfall usually updates a few days after the weather occurs. Please check again later, or use dates that already have published data.`
    )
  }

  if (tempInsufficient || tempLagging) {
    const throughLabel = tempThrough
      ? ` Temperature data is currently available only through ${formatShortDate(tempThrough)}.`
      : ""
    return (
      `Temperature weather data is not yet available for the full period you selected.` +
      throughLabel +
      ` Please check again later, or use dates that already have published data.`
    )
  }

  if (perils.some((p: any) => p.insufficient_data)) {
    return (
      "Weather data is incomplete for part of this period, so some amounts may show as $0.00. " +
      "Please check again later, or use dates that already have published data."
    )
  }

  return null
}

/** Map backend/GEE fetch failures into agent-friendly copy. */
export function friendlyWeatherFetchError(raw: string): string {
  const text = (raw || "").toLowerCase()
  if (
    text.includes("precipitation") ||
    text.includes("chirps") ||
    text.includes("rainfall")
  ) {
    return (
      "Rainfall data from CHIRPS is not yet available for the period you selected. " +
      "Satellite rainfall usually updates a few days after the weather occurs. " +
      "Please check again later, or use dates that already have published data."
    )
  }
  if (text.includes("temperature") || text.includes("era5")) {
    return (
      "Temperature weather data is not yet available for the period you selected. " +
      "Please check again later, or use dates that already have published data."
    )
  }
  if (text.includes("no ") && text.includes("data returned")) {
    return (
      "Weather data is not yet available for the period you selected. " +
      "Please check again later, or use dates that already have published data."
    )
  }
  return raw
}

