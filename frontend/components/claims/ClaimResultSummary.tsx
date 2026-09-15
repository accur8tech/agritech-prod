"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { getWeatherAvailabilityMessage } from "@/lib/claimStatus"

const PERIL_LABELS: Record<string, string> = {
  LRI: "Low rainfall (drought)",
  ERI: "Excess rainfall",
  LTI: "Low temperature",
  HTI: "High temperature",
}

const METHOD_LABELS: Record<string, string> = {
  aggregate: "Full period total",
  rolling: "Multi-day window",
}

function money(n: number | null | undefined) {
  return `$${Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtNum(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(Number(n))) return "—"
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  })
}

function formatDateLabel(value?: string | null) {
  if (!value) return "—"
  const d = new Date(value.slice(0, 10) + "T00:00:00")
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function unitForPeril(perilType?: string) {
  if (!perilType) return ""
  if (perilType === "LRI" || perilType === "ERI") return "mm"
  if (perilType === "LTI" || perilType === "HTI") return "°C"
  return ""
}

export type ClaimEvalViewModel = {
  triggered?: boolean
  payout: number
  uncapped_payout?: number
  trigger_window?: string | null
  trigger_value?: number | null
  peril_breakdown?: any
  weather_snapshot?: any
  data_available_through?: Record<string, string | null>
  evaluation_end?: string | null
  location?: {
    country?: string
    province?: string
    district?: string
    commune?: string
  }
}

function normalizePeriods(breakdown: any): any[] {
  if (!breakdown) return []
  if (Array.isArray(breakdown)) return breakdown
  if (Array.isArray(breakdown.periods)) return breakdown.periods
  return []
}

export function ClaimResultSummary({
  result,
  compact = false,
}: {
  result: ClaimEvalViewModel
  compact?: boolean
}) {
  const periods = normalizePeriods(result.peril_breakdown)
  const weather =
    result.weather_snapshot ||
    result.peril_breakdown?.weather_snapshot ||
    null
  const location =
    result.location ||
    weather?.location ||
    null
  const hasInsufficient = periods.some((p) =>
    (p.perils || []).some((peril: any) => peril.insufficient_data)
  )
  const weatherMessage = getWeatherAvailabilityMessage({
    perilBreakdown: result.peril_breakdown,
    weatherSnapshot: weather,
    dataAvailableThrough: result.data_available_through,
    evaluationEnd:
      result.evaluation_end ||
      weather?.date_end ||
      periods[periods.length - 1]?.end_date ||
      null,
  })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Outcome</div>
          <div className="mt-1">
            <Badge
              variant="secondary"
              className={
                result.triggered || Number(result.payout) > 0
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }
            >
              {result.triggered || Number(result.payout) > 0
                  ? "Payout applies"
                  : "No payout"}
            </Badge>
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Amount</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">
            {money(result.payout)}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Actual weather</div>
          <div className="mt-1 text-lg font-medium text-gray-900">
            {result.trigger_value != null ? fmtNum(result.trigger_value, 2) : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-500">Coverage window</div>
          <div className="mt-1 text-sm font-medium text-gray-900 leading-snug">
            {result.trigger_window || "—"}
          </div>
        </div>
      </div>

      {weatherMessage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {weatherMessage}
        </div>
      )}

      {!weatherMessage && hasInsufficient && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Weather data is incomplete for part of this period, so some amounts may show as
          $0.00. Please check again later, or use dates that already have published data.
        </div>
      )}

      {location && (
        <div className="text-sm text-gray-700">
          <span className="text-gray-500">Location: </span>
          {[
            location.country,
            location.province,
            location.district,
            location.commune,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Coverage details</h4>
        {periods.length === 0 ? (
          <p className="text-sm text-gray-500">No coverage details available.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Coverage type</TableHead>
                  <TableHead>How measured</TableHead>
                  <TableHead className="text-right">Trigger level</TableHead>
                  <TableHead className="text-right">Actual weather</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periods.map((period, pIdx) =>
                  (period.perils || []).map((peril: any, perilIdx: number) => {
                    const unit = unitForPeril(peril.peril_type)
                    return (
                      <TableRow key={`${pIdx}-${perilIdx}`}>
                        <TableCell className="text-sm whitespace-nowrap">
                          <div className="font-medium">Period {pIdx + 1}</div>
                          <div className="text-xs text-gray-500">
                            {formatDateLabel(period.start_date)} –{" "}
                            {formatDateLabel(period.end_date)}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="font-medium">
                            {PERIL_LABELS[peril.peril_type] || peril.peril_type}
                          </div>
                          <div className="text-xs text-gray-500">
                            Duration {peril.duration} day
                            {peril.duration === 1 ? "" : "s"}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {METHOD_LABELS[peril.method] || peril.method || "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {fmtNum(peril.trigger, 2)}
                          {unit ? ` ${unit}` : ""}
                          {peril.exit_trigger != null && (
                            <div className="text-xs text-gray-500">
                              Exit {fmtNum(peril.exit_trigger, 2)}
                              {unit ? ` ${unit}` : ""}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {peril.insufficient_data
                            ? "No data"
                            : `${fmtNum(peril.actual_value, 2)}${unit ? ` ${unit}` : ""}`}
                          {!peril.insufficient_data && (
                            <div className="text-xs text-gray-500">
                              {peril.observations ?? 0} days
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {peril.insufficient_data ? (
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                              Data incomplete
                            </Badge>
                          ) : peril.trigger_met ? (
                            <Badge variant="secondary" className="bg-green-100 text-green-800">
                              Payout due
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-gray-100 text-gray-700">
                              No payout
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium tabular-nums">
                          {money(peril.payout)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {!compact && weather && (
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Weather used</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <div className="text-xs text-gray-500 mb-1">Data source</div>
              <div className="font-medium text-gray-900">
                {(weather.datasets || [])
                  .map((d: string) =>
                    d === "ERA5_LAND" || d === "ERA5-Land" ? "ERA5" : d
                  )
                  .join(", ") || "—"}
              </div>
              {weather.fetched_at && (
                <div className="text-xs text-gray-500 mt-1">
                  Checked {new Date(weather.fetched_at).toLocaleString()}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-2">
                Period {formatDateLabel(weather.date_start)} –{" "}
                {formatDateLabel(weather.date_end)}
              </div>
            </div>

            {weather.series_summary &&
              Object.entries(weather.series_summary).map(([dataset, summary]: [string, any]) => (
                <div
                  key={dataset}
                  className="rounded-lg border border-gray-200 bg-white p-3 text-sm"
                >
                  <div className="text-xs text-gray-500 mb-1 capitalize">
                    {dataset === "precipitation"
                      ? "Rainfall"
                      : dataset === "temperature"
                        ? "Temperature"
                        : dataset}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs text-gray-500">Days of data</div>
                      <div className="font-medium">{summary?.observations ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Latest day available</div>
                      <div className="font-medium">
                        {formatDateLabel(summary?.last_date)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Min</div>
                      <div className="font-medium">{fmtNum(summary?.min, 2)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Max</div>
                      <div className="font-medium">{fmtNum(summary?.max, 2)}</div>
                    </div>
                    {summary?.sum != null && (
                      <div className="col-span-2">
                        <div className="text-xs text-gray-500">Total</div>
                        <div className="font-medium">{fmtNum(summary.sum, 2)}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>

          {result.data_available_through && (
            <p className="text-xs text-gray-500 mt-2">
              Latest weather available:{" "}
              {Object.entries(result.data_available_through)
                .map(([k, v]) => {
                  const label =
                    k === "precipitation"
                      ? "rainfall"
                      : k === "temperature"
                        ? "temperature"
                        : k
                  return `${label} through ${v ? formatDateLabel(v) : "n/a"}`
                })
                .join(" · ")}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
