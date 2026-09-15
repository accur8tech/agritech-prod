"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import apiClient from "@/lib/apiClient"
import { ProductsService } from "@/lib/supabase"
import { useCreateClaim } from "@/lib/hooks"
import {
  extractLocationFromProductRegion,
  getTermsheetDateWindow,
  mapManualFormToClaimTermsheet,
  mapProductToClaimTermsheet,
  type ClaimEvaluatePayload,
  type ManualPerilForm,
} from "@/lib/claimMappers"
import {
  CountryCode,
  SUPPORTED_COUNTRIES,
  getCommunesForDistrict,
  getCountryConfig,
  getDistrictsForState,
  getStatesForCountry,
} from "@/components/weather/locationConfig"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  defaultStatusForPayout,
  friendlyWeatherFetchError,
  getPolicyClaimContext,
} from "@/lib/claimStatus"
import { ClaimResultSummary } from "./ClaimResultSummary"

type EvalResult = {
  triggered: boolean
  payout: number
  trigger_window?: string
  trigger_value?: number | null
  peril_breakdown?: any
  weather_snapshot?: any
  termsheet_snapshot?: any
  data_available_through?: Record<string, string | null>
}

const emptyPeril = (): ManualPerilForm => ({
  peril_type: "LRI",
  startDate: "",
  endDate: "",
  trigger: 0,
  duration: 10,
  unit_payout: 1,
  max_payout: 100,
  exit_trigger: undefined,
  exit: undefined,
})

async function pollTask(taskId: string, onTick?: (status: string) => void): Promise<EvalResult> {
  const maxAttempts = 180
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await apiClient.get(`/api/tasks/${taskId}`)
    const status = String(data?.status || "")
    onTick?.(status)
    const normalized = status.toUpperCase()

    if (normalized === "SUCCESS") {
      if (!data?.result) {
        throw new Error("Evaluation finished but returned an empty result")
      }
      return data.result as EvalResult
    }

    // Only stop on true terminal failures — not STARTED/Pending worker metadata
    if (normalized === "FAILURE" || normalized === "FAILED" || normalized === "REVOKED") {
      const detail =
        typeof data.result === "string"
          ? data.result
          : data.result?.message || JSON.stringify(data.result) || "Claim evaluation failed"
      // Guard: old /api/tasks bug mapped STARTED → Failure with {pid, hostname}
      if (
        typeof detail === "string" &&
        detail.includes("'pid'") &&
        detail.includes("'hostname'")
      ) {
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      throw new Error(detail)
    }

    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error("Claim evaluation timed out. Try a shorter date window.")
}

export function ClaimEvaluatePanel({
  onSaved,
  onStartAnother,
}: {
  onSaved?: (claimId?: string) => void
  onStartAnother?: () => void
}) {
  const createClaim = useCreateClaim()
  const [mode, setMode] = useState<"manual" | "product">("manual")
  const [country, setCountry] = useState<CountryCode>("Cambodia")
  const [province, setProvince] = useState("")
  const [district, setDistrict] = useState("")
  const [commune, setCommune] = useState("")
  const [evaluationStart, setEvaluationStart] = useState("")
  const [evaluationEnd, setEvaluationEnd] = useState("")
  const [sumInsured, setSumInsured] = useState(1000)
  const [perils, setPerils] = useState<ManualPerilForm[]>([emptyPeril()])

  const [products, setProducts] = useState<any[]>([])
  const [productId, setProductId] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<any>(null)

  const [running, setRunning] = useState(false)
  const [taskStatus, setTaskStatus] = useState<string | null>(null)
  const [result, setResult] = useState<EvalResult | null>(null)
  const [lastPayload, setLastPayload] = useState<ClaimEvaluatePayload | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const [claimName, setClaimName] = useState("")
  const resultRef = useRef<HTMLDivElement | null>(null)

  const countryConfig = getCountryConfig(country)
  const provinces = useMemo(() => getStatesForCountry(country), [country])
  const districts = useMemo(
    () => (province ? getDistrictsForState(country, province) : []),
    [country, province]
  )
  const communes = useMemo(
    () => (province && district ? getCommunesForDistrict(country, province, district) : []),
    [country, province, district]
  )

  useEffect(() => {
    ProductsService.getProducts()
      .then(setProducts)
      .catch(() => toast.error("Failed to load products"))
  }, [])

  useEffect(() => {
    if (!productId) {
      setSelectedProduct(null)
      return
    }
    ProductsService.getProductById(productId)
      .then((p) => {
        setSelectedProduct(p)
        const regionLoc = extractLocationFromProductRegion(p.region)
        if (regionLoc.province) setProvince(regionLoc.province)
        if (regionLoc.district) setDistrict(regionLoc.district)
        if (regionLoc.commune) setCommune(regionLoc.commune)

        // Prefer absolute coverage period dates (InsureSmart), not planting+start_day offsets
        const termsheet = mapProductToClaimTermsheet(p)
        const window = getTermsheetDateWindow(termsheet)
        if (window) {
          setEvaluationStart(window.start)
          setEvaluationEnd(window.end)
        } else if (p.coverage_start_date && p.coverage_end_date) {
          setEvaluationStart(p.coverage_start_date)
          setEvaluationEnd(p.coverage_end_date)
        }
      })
      .catch(() => toast.error("Failed to load product"))
  }, [productId])

  // Nigeria often has no ward list: auto-fill commune = district for API contract
  useEffect(() => {
    if (!countryConfig.hasCommuneLevel && district) {
      setCommune(district)
    }
  }, [country, district, countryConfig.hasCommuneLevel])

  const resolveCommune = () => {
    if (countryConfig.hasCommuneLevel) return commune
    return commune || district
  }

  const locationReady = () => {
    const c = resolveCommune()
    return !!(country && province && district && c)
  }

  const buildPayload = (): ClaimEvaluatePayload => {
    if (!locationReady()) {
      throw new Error("Please select province, district, and commune")
    }
    if (!evaluationStart || !evaluationEnd) {
      throw new Error("Please enter coverage start and end dates")
    }
    if (evaluationStart > evaluationEnd) {
      throw new Error("Coverage start must be on or before the end date")
    }

    const location = {
      country,
      province,
      district,
      commune: resolveCommune(),
    }

    if (mode === "manual") {
      if (!perils.length) throw new Error("Add at least one coverage period")
      for (const p of perils) {
        if (!p.startDate || !p.endDate) {
          throw new Error("Each coverage period needs start and end dates")
        }
      }
      return {
        location,
        evaluation_start: evaluationStart,
        evaluation_end: evaluationEnd,
        termsheet: mapManualFormToClaimTermsheet(perils, sumInsured),
        sum_insured_scale: 1,
        enrollment_id: null,
        product_id: null,
        source: "manual",
      }
    }

    if (!selectedProduct) throw new Error("Please select a product")
    const termsheet = mapProductToClaimTermsheet(selectedProduct)
    if (!termsheet.periods.length) {
      throw new Error("This product has no coverage terms to check")
    }

    return {
      location,
      evaluation_start: evaluationStart,
      evaluation_end: evaluationEnd,
      termsheet,
      sum_insured_scale: 1,
      enrollment_id: null,
      product_id: selectedProduct.id,
      source: "product",
    }
  }

  const runEvaluate = async () => {
    setResult(null)
    setLastError(null)
    setClaimName("")
    setRunning(true)
    setTaskStatus("Starting…")
    try {
      const payload = buildPayload()
      setLastPayload(payload)
      const { data } = await apiClient.post("/api/claims/evaluate", payload)
      if (!data?.task_id) {
        throw new Error("Backend did not return a task_id")
      }
      setTaskStatus("Checking weather data…")
      const evalResult = await pollTask(data.task_id, (s) => {
        const normalized = String(s || "").toUpperCase()
        if (normalized === "STARTED" || normalized === "PENDING") {
          setTaskStatus("Checking weather data…")
        } else {
          setTaskStatus("Calculating payout…")
        }
      })
      setResult(evalResult)
      // Fresh suggestion for every check: location + actual trigger window (or evaluation dates)
      const loc = payload.location
      const place = [loc.commune, loc.district].filter(Boolean).join(", ")
      const windowLabel =
        evalResult.trigger_window ||
        (payload.evaluation_start && payload.evaluation_end
          ? `${payload.evaluation_start} – ${payload.evaluation_end}`
          : "")
      setClaimName([place, windowLabel].filter(Boolean).join(" · ").slice(0, 120))
      // Scroll to the results card (not the status banner)
      requestAnimationFrame(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
      })
      toast.success(
        evalResult.triggered
          ? `A payout of $${Number(evalResult.payout).toFixed(2)} applies`
          : "No payout for this period"
      )
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Evaluation failed"
      const text = friendlyWeatherFetchError(
        typeof msg === "string" ? msg : JSON.stringify(msg)
      )
      setLastError(text)
      toast.error(text)
    } finally {
      setRunning(false)
      setTaskStatus(null)
    }
  }

  const policyContext = (() => {
    if (!selectedProduct && mode !== "product") {
      return getPolicyClaimContext({
        coverageStart: evaluationStart,
        coverageEnd: evaluationEnd,
        evaluationStart,
        evaluationEnd,
      })
    }
    return getPolicyClaimContext({
      coverageStart:
        selectedProduct?.coverage_start_date ||
        selectedProduct?.triggers?.coveragePeriods?.[0]?.startDate ||
        evaluationStart,
      coverageEnd:
        selectedProduct?.coverage_end_date ||
        (selectedProduct?.triggers?.coveragePeriods || []).slice(-1)[0]
          ?.endDate ||
        evaluationEnd,
      evaluationStart,
      evaluationEnd,
    })
  })()

  const saveClaim = async () => {
    if (!result) return
    const trimmedName = claimName.trim()
    if (!trimmedName) {
      toast.error("Please enter a claim name before saving")
      return
    }
    try {
      const status = defaultStatusForPayout(Number(result.payout))
      const baseSnap = result.termsheet_snapshot || { termsheet: {}, meta: {} }
      const termsheet_snapshot = {
        ...baseSnap,
        meta: {
          ...(baseSnap.meta || {}),
          source: lastPayload?.source || baseSnap.meta?.source || "manual",
          product_id: lastPayload?.product_id || null,
          location: lastPayload?.location || baseSnap.meta?.location,
          evaluation_start: lastPayload?.evaluation_start || evaluationStart,
          evaluation_end: lastPayload?.evaluation_end || evaluationEnd,
          policy_active: policyContext.policyActive,
          is_partial_claim: policyContext.isPartialClaim,
          coverage_label: policyContext.coverageLabel,
          evaluation_label: policyContext.evaluationLabel,
        },
      }

      const saved = await createClaim.mutateAsync({
        name: trimmedName,
        enrollment_id: lastPayload?.enrollment_id ?? null,
        trigger_window: result.trigger_window || null,
        trigger_value: result.trigger_value ?? null,
        payout: result.payout,
        status,
        termsheet_snapshot,
        peril_breakdown: {
          periods: result.peril_breakdown,
          weather_snapshot: result.weather_snapshot,
          data_available_through: result.data_available_through,
        },
      })
      onSaved?.(saved?.id)
    } catch {
      // toast handled in hook
    }
  }

  const resetForNextCheck = () => {
    setResult(null)
    setLastError(null)
    setLastPayload(null)
    setClaimName("")
    onStartAnother?.()
  }

  const updatePeril = (index: number, patch: Partial<ManualPerilForm>) => {
    setPerils((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  return (
    <div className="space-y-6">
      {(running || lastError || (result && !running)) && (
        <div
          className={`rounded-lg border px-4 py-3 ${
            lastError
              ? "border-red-200 bg-red-50"
              : running
                ? "border-blue-200 bg-blue-50"
                : result?.triggered
                  ? "border-green-200 bg-green-50"
                  : "border-amber-200 bg-amber-50"
          }`}
        >
          {running && (
            <p className="text-sm font-medium text-blue-900">
              Checking coverage… {taskStatus || "please wait"}
            </p>
          )}
          {lastError && !running && (
            <p className="text-sm font-medium text-red-800">
              Could not complete the check: {lastError}
            </p>
          )}
          {result && !running && !lastError && (
            <p className="text-sm font-medium text-gray-900">
              {result.triggered ? "Payout applies" : "No payout for this period"}
              {" · "}
              <span className="font-semibold">
                ${Number(result.payout).toFixed(2)}
              </span>
              {result.trigger_window ? ` · ${result.trigger_window}` : ""}
            </p>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Coverage check</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList>
              <TabsTrigger value="manual">Enter terms manually</TabsTrigger>
              <TabsTrigger value="product">Use existing product</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Sum insured</Label>
                  <Input
                    type="number"
                    value={sumInsured}
                    onChange={(e) => setSumInsured(Number(e.target.value))}
                  />
                </div>
              </div>
              {perils.map((peril, idx) => (
                <div
                  key={idx}
                  className="border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                  <div>
                    <Label>Coverage type</Label>
                    <Select
                      value={peril.peril_type}
                      onValueChange={(v) =>
                        updatePeril(idx, { peril_type: v as ManualPerilForm["peril_type"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="LRI">Drought (low rainfall)</SelectItem>
                        <SelectItem value="ERI">Excess rain</SelectItem>
                        <SelectItem value="LTI">Cold (low temperature)</SelectItem>
                        <SelectItem value="HTI">Heat (high temperature)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Period start</Label>
                    <Input
                      type="date"
                      value={peril.startDate}
                      onChange={(e) => updatePeril(idx, { startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Period end</Label>
                    <Input
                      type="date"
                      value={peril.endDate}
                      onChange={(e) => updatePeril(idx, { endDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Trigger</Label>
                    <Input
                      type="number"
                      value={peril.trigger}
                      onChange={(e) => updatePeril(idx, { trigger: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Duration (days)</Label>
                    <Input
                      type="number"
                      value={peril.duration}
                      onChange={(e) => updatePeril(idx, { duration: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <Label>Payout per unit</Label>
                    <Input
                      type="number"
                      value={peril.unit_payout}
                      onChange={(e) =>
                        updatePeril(idx, { unit_payout: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label>Maximum payout</Label>
                    <Input
                      type="number"
                      value={peril.max_payout}
                      onChange={(e) =>
                        updatePeril(idx, { max_payout: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div>
                    <Label>Exit level (optional)</Label>
                    <Input
                      type="number"
                      value={peril.exit_trigger ?? peril.exit ?? ""}
                      onChange={(e) =>
                        updatePeril(idx, {
                          exit_trigger: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                onClick={() => setPerils((p) => [...p, emptyPeril()])}
              >
                Add coverage period
              </Button>
            </TabsContent>

            <TabsContent value="product" className="space-y-4 mt-4">
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.crop ? `(${p.crop})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>

          <div className="border-t pt-4 space-y-4">
            <h3 className="font-medium text-gray-900">Location and coverage dates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <Label>Country</Label>
                <Select
                  value={country}
                  onValueChange={(v) => {
                    setCountry(v as CountryCode)
                    setProvince("")
                    setDistrict("")
                    setCommune("")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{countryConfig.labels.state}</Label>
                <Select
                  value={province}
                  onValueChange={(v) => {
                    setProvince(v)
                    setDistrict("")
                    setCommune("")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {provinces.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{countryConfig.labels.district}</Label>
                <Select
                  value={district}
                  onValueChange={(v) => {
                    setDistrict(v)
                    setCommune("")
                  }}
                  disabled={!province}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {districts.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {countryConfig.hasCommuneLevel && (
                <div>
                  <Label>{countryConfig.labels.commune}</Label>
                  <Select
                    value={commune}
                    onValueChange={setCommune}
                    disabled={!district}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {communes.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Coverage start</Label>
                <Input
                  type="date"
                  value={evaluationStart}
                  onChange={(e) => setEvaluationStart(e.target.value)}
                />
              </div>
              <div>
                <Label>Coverage end</Label>
                <Input
                  type="date"
                  value={evaluationEnd}
                  onChange={(e) => setEvaluationEnd(e.target.value)}
                />
              </div>
            </div>

            {(policyContext.policyActive || policyContext.isPartialClaim) && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 space-y-1">
                {policyContext.policyActive && (
                  <p>
                    <span className="font-medium">Policy is still active.</span> Full
                    coverage runs {policyContext.coverageLabel}. You can process a
                    partial claim for the dates below and check again later.
                  </p>
                )}
                {policyContext.isPartialClaim && (
                  <p>
                    <span className="font-medium">Partial claim check.</span> Selected
                    dates ({policyContext.evaluationLabel}) are only part of the full
                    coverage window.
                  </p>
                )}
              </div>
            )}

            <p className="text-sm text-gray-500">
              We look up the latest weather for this location. This may take a minute or two.
            </p>
            <Button onClick={runEvaluate} disabled={running}>
              {running ? `Checking… ${taskStatus || ""}` : "Check for payout"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card ref={resultRef}>
          <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
            <CardTitle>Results</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={saveClaim}
                disabled={createClaim.isPending || !claimName.trim()}
              >
                {Number(result.payout) > 0
                  ? "Save as under process"
                  : "Save as clear"}
              </Button>
              <Button variant="outline" onClick={resetForNextCheck}>
                Check another
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-md">
              <Label htmlFor="claim-name-results">Claim name</Label>
              <Input
                id="claim-name-results"
                className="mt-1"
                placeholder="Name this claim so you can find it in the list"
                value={claimName}
                onChange={(e) => setClaimName(e.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-gray-500 mt-1">
                Required before saving. Suggested from this check’s location and window —
                edit as needed.
              </p>
            </div>
            {(policyContext.policyActive || policyContext.isPartialClaim) && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                {policyContext.policyActive && (
                  <p className="font-medium">Policy is still active.</p>
                )}
                {policyContext.isPartialClaim && (
                  <p>
                    Partial claim for {policyContext.evaluationLabel}. Remaining
                    coverage can be checked in a later review.
                  </p>
                )}
              </div>
            )}
            <ClaimResultSummary
              result={{
                triggered: result.triggered,
                payout: result.payout,
                uncapped_payout: (result as any).uncapped_payout,
                trigger_window: result.trigger_window,
                trigger_value: result.trigger_value,
                peril_breakdown: result.peril_breakdown,
                weather_snapshot: result.weather_snapshot,
                data_available_through: result.data_available_through,
                evaluation_end: lastPayload?.evaluation_end || evaluationEnd,
                location: lastPayload?.location,
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
