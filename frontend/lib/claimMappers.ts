/**
 * Mappers from products / enrollments / manual form → ClaimTermsheetInput
 *
 * InsureSmart stores optimizationConfig.periods[].start_day/end_day as
 * 0-indexed day-of-year (see insure_smart_optimizer.convert_periods).
 * Absolute calendar dates live on triggers.coveragePeriods[].startDate/endDate.
 * Manual Builder also writes absolute dates on coveragePeriods; its start_day/
 * end_day are offsets from plantingDate.
 */

export type ClaimPerilType = 'LRI' | 'ERI' | 'LTI' | 'HTI'

/** How to interpret start_day/end_day when absolute dates are absent */
export type DayIndexMode = 'day_of_year' | 'planting_offset'

export interface ClaimPerilInput {
  peril_type: ClaimPerilType
  trigger: number
  duration: number
  unit_payout: number
  max_payout: number
  exit_trigger?: number
  exit?: number
  dailyCap?: number
  consecutiveDays?: number
  allocated_si?: number
}

export interface ClaimPeriodInput {
  start_day?: number
  end_day?: number
  startDate?: string
  endDate?: string
  perils: ClaimPerilInput[]
}

export interface ClaimTermsheetInput {
  periods: ClaimPeriodInput[]
  sumInsured: number
  plantingDate?: string
  /** day_of_year = InsureSmart; planting_offset = Manual Builder */
  dayIndexMode?: DayIndexMode
  coveragePeriods?: Array<{
    id?: string
    startDate?: string
    endDate?: string
    perilType?: string
  }>
}

export interface ClaimEvaluatePayload {
  location: {
    country: string
    province: string
    district: string
    commune: string
  }
  evaluation_start: string
  evaluation_end: string
  termsheet: ClaimTermsheetInput
  sum_insured_scale: number
  enrollment_id?: string | null
  product_id?: string | null
  source: 'enrollment' | 'product' | 'manual'
}

export interface ManualPerilForm {
  peril_type: ClaimPerilType
  startDate: string
  endDate: string
  trigger: number
  duration: number
  unit_payout: number
  /** Omit / leave blank to default to sum insured at evaluate time */
  max_payout?: number
  exit_trigger?: number
  exit?: number
}

function formatISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Resolve period calendar dates for UI (evaluation window defaults). */
export function resolveClaimPeriodDates(
  period: ClaimPeriodInput,
  opts: {
    plantingDate?: string
    evaluationYear?: number
    dayIndexMode?: DayIndexMode
  }
): { startDate: string; endDate: string } | null {
  if (period.startDate && period.endDate) {
    return { startDate: period.startDate.slice(0, 10), endDate: period.endDate.slice(0, 10) }
  }

  if (period.start_day == null || period.end_day == null) return null

  const mode = opts.dayIndexMode || 'day_of_year'
  const startDay = Number(period.start_day)
  const endDay = Number(period.end_day)

  if (mode === 'planting_offset' && opts.plantingDate) {
    const base = new Date(opts.plantingDate.slice(0, 10) + 'T00:00:00')
    const s = new Date(base)
    s.setDate(base.getDate() + startDay)
    const e = new Date(base)
    e.setDate(base.getDate() + endDay)
    return { startDate: formatISODate(s), endDate: formatISODate(e) }
  }

  // InsureSmart: 0-indexed day of year from Jan 1 of the season year
  const year =
    opts.evaluationYear ||
    (opts.plantingDate ? Number(opts.plantingDate.slice(0, 4)) : new Date().getFullYear())
  const s = new Date(year, 0, 1)
  s.setDate(s.getDate() + startDay)
  const e = new Date(year, 0, 1)
  e.setDate(e.getDate() + endDay)
  return { startDate: formatISODate(s), endDate: formatISODate(e) }
}

export function getTermsheetDateWindow(
  termsheet: ClaimTermsheetInput
): { start: string; end: string } | null {
  const starts: string[] = []
  const ends: string[] = []

  for (const period of termsheet.periods || []) {
    const resolved = resolveClaimPeriodDates(period, {
      plantingDate: termsheet.plantingDate,
      dayIndexMode: termsheet.dayIndexMode,
      evaluationYear: termsheet.plantingDate
        ? Number(termsheet.plantingDate.slice(0, 4))
        : undefined,
    })
    if (resolved) {
      starts.push(resolved.startDate)
      ends.push(resolved.endDate)
    }
  }

  // Also consider coveragePeriods directly
  for (const cp of termsheet.coveragePeriods || []) {
    if (cp.startDate) starts.push(cp.startDate.slice(0, 10))
    if (cp.endDate) ends.push(cp.endDate.slice(0, 10))
  }

  if (!starts.length || !ends.length) return null
  starts.sort()
  ends.sort()
  return { start: starts[0], end: ends[ends.length - 1] }
}

/** Map saved product.triggers → ClaimTermsheetInput */
export function mapProductToClaimTermsheet(product: {
  triggers?: any
  terms?: any
  coverage_start_date?: string
  coverage_end_date?: string
}): ClaimTermsheetInput {
  const triggers = product.triggers || {}
  const config = triggers.optimizationConfig || {}
  const periodsRaw = config.periods || []
  const coveragePeriods: Array<{
    id?: string
    startDate?: string
    endDate?: string
    perilType?: string
  }> = triggers.coveragePeriods || []

  const isManualBuilder = config.id === 'manual-builder'
  const dayIndexMode: DayIndexMode = isManualBuilder ? 'planting_offset' : 'day_of_year'

  const periods: ClaimPeriodInput[] = periodsRaw.map((period: any, index: number) => {
    const coverage = coveragePeriods[index]
    const absoluteStart = coverage?.startDate?.slice?.(0, 10) || coverage?.startDate
    const absoluteEnd = coverage?.endDate?.slice?.(0, 10) || coverage?.endDate

    return {
      start_day: period.start_day,
      end_day: period.end_day,
      // Prefer absolute dates from coveragePeriods (source of truth for InsureSmart UI)
      startDate: absoluteStart || undefined,
      endDate: absoluteEnd || undefined,
      perils: (period.perils || []).map((p: any) => ({
        peril_type: p.peril_type,
        trigger: Number(p.trigger) || 0,
        duration: Number(p.duration || p.consecutiveDays) || 1,
        unit_payout: Number(p.unit_payout) || 0,
        max_payout: Number(p.max_payout) || 0,
        exit_trigger: p.exit_trigger != null ? Number(p.exit_trigger) : undefined,
        exit: p.exit != null ? Number(p.exit) : undefined,
        dailyCap: p.dailyCap != null ? Number(p.dailyCap) : undefined,
        consecutiveDays: p.consecutiveDays != null ? Number(p.consecutiveDays) : undefined,
        allocated_si: p.allocated_si != null ? Number(p.allocated_si) : undefined,
      })),
    }
  })

  // Single-period fallback: product coverage_* dates
  if (
    periods.length === 1 &&
    !periods[0].startDate &&
    product.coverage_start_date &&
    product.coverage_end_date
  ) {
    periods[0].startDate = product.coverage_start_date.slice(0, 10)
    periods[0].endDate = product.coverage_end_date.slice(0, 10)
  }

  const plantingDate =
    product.terms?.plantingDate ||
    product.coverage_start_date ||
    coveragePeriods[0]?.startDate ||
    undefined

  return {
    periods,
    sumInsured: Number(triggers.sumInsured) || 0,
    plantingDate: plantingDate ? String(plantingDate).slice(0, 10) : undefined,
    dayIndexMode,
    coveragePeriods,
  }
}

/** SI scale when enrollment sum insured differs from product design SI */
export function computeSumInsuredScale(
  enrollmentSumInsured: number,
  productSumInsured: number
): number {
  if (!productSumInsured || productSumInsured <= 0) return 1
  return enrollmentSumInsured / productSumInsured
}

/** Span of all period dates — used as the weather evaluation window for manual checks. */
export function getManualEvaluationWindow(
  perils: Array<{ startDate?: string; endDate?: string }>
): { start: string; end: string } | null {
  const dated = perils.filter((p) => p.startDate && p.endDate)
  if (!dated.length) return null
  const starts = dated.map((p) => p.startDate!.slice(0, 10))
  const ends = dated.map((p) => p.endDate!.slice(0, 10))
  const start = [...starts].sort()[0]
  const end = [...ends].sort()[ends.length - 1]
  return { start, end }
}

export function mapManualFormToClaimTermsheet(
  perils: ManualPerilForm[],
  sumInsured: number
): ClaimTermsheetInput {
  const si = Number(sumInsured) || 0
  const periods: ClaimPeriodInput[] = perils.map((p) => ({
    startDate: p.startDate,
    endDate: p.endDate,
    perils: [
      {
        peril_type: p.peril_type,
        trigger: Number(p.trigger) || 0,
        duration: Number(p.duration) || 1,
        unit_payout: Number(p.unit_payout) || 0,
        // Blank max payout → cap at sum insured (API still requires a number)
        max_payout:
          p.max_payout != null && !Number.isNaN(Number(p.max_payout))
            ? Number(p.max_payout)
            : si,
        exit_trigger: p.exit_trigger != null ? Number(p.exit_trigger) : undefined,
        exit: p.exit != null ? Number(p.exit) : undefined,
      },
    ],
  }))

  return {
    periods,
    sumInsured: si,
    dayIndexMode: 'day_of_year',
  }
}

export function extractLocationFromProductRegion(region: any): {
  province?: string
  district?: string
  commune?: string
  country?: string
} {
  if (!region) return {}
  if (typeof region === 'string') {
    try {
      return extractLocationFromProductRegion(JSON.parse(region))
    } catch {
      return { province: region }
    }
  }
  return {
    country: region.country,
    province: region.province || region.state,
    district: region.district || region.lga,
    commune: region.commune || region.ward,
  }
}

const PERIL_LABELS: Record<string, string> = {
  LRI: 'Drought (low rainfall)',
  ERI: 'Excess rain',
  LTI: 'Cold (low temperature)',
  HTI: 'Heat (high temperature)',
}

export function formatPerilTypeLabel(perilType?: string | null): string {
  if (!perilType) return 'Coverage'
  return PERIL_LABELS[perilType] || perilType
}

/** Short coverage window for dropdown labels, e.g. "Jun–Sep 2026" */
export function formatCoverageRangeLabel(
  start?: string | null,
  end?: string | null
): string {
  if (!start && !end) return ''
  const fmt = (iso: string) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
    if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
    return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }
  if (start && end) {
    const s = new Date(`${start.slice(0, 10)}T00:00:00`)
    const e = new Date(`${end.slice(0, 10)}T00:00:00`)
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      const sameYear = s.getFullYear() === e.getFullYear()
      const startLabel = s.toLocaleDateString(undefined, {
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
      })
      const endLabel = e.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      })
      return `${startLabel}–${endLabel}`
    }
    return `${fmt(start)} – ${fmt(end)}`
  }
  return fmt((start || end) as string)
}

/** Distinguish identical product names in claims picker */
export function formatProductClaimSelectLabel(product: {
  name?: string | null
  crop?: string | null
  region?: any
  coverage_start_date?: string | null
  coverage_end_date?: string | null
}): string {
  const name = product.name?.trim() || 'Untitled product'
  const loc = extractLocationFromProductRegion(product.region)
  const place =
    [loc.commune, loc.district, loc.province].filter(Boolean).join(', ') || null
  const range = formatCoverageRangeLabel(
    product.coverage_start_date,
    product.coverage_end_date
  )
  const parts = [name]
  if (place) parts.push(place)
  if (range) parts.push(range)
  else if (product.crop) parts.push(product.crop)
  return parts.join(' · ')
}
