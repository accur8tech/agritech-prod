"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import apiClient from "@/lib/apiClient"
import { ProductsService } from "@/lib/supabase"
import { useCreateClaim } from "@/lib/hooks"
import {
  extractLocationFromProductRegion,
  formatPerilTypeLabel,
  formatProductClaimSelectLabel,
  getManualEvaluationWindow,
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
import { Trash2 } from "lucide-react"
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
  max_payout: undefined,
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
        if (regionLoc.country && SUPPORTED_COUNTRIES.includes(regionLoc.country as CountryCode)) {
          setCountry(regionLoc.country as CountryCode)
        }
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
        } else {
          setEvaluationStart("")
          setEvaluationEnd("")
        }
      })
      .catch(() => toast.error("Failed to load product"))
  }, [productId])

  // Nigeria often has no ward list: auto-fill commune = district for API contract
  // Skip in product mode so location stays locked to the selected product.
  useEffect(() => {
    if (mode === "product") return
    if (!countryConfig.hasCommuneLevel && district) {
      setCommune(district)
    }
  }, [mode, country, district, countryConfig.hasCommuneLevel])

  const productTermsheet = useMemo(
    () => (selectedProduct ? mapProductToClaimTermsheet(selectedProduct) : null),
    [selectedProduct]
  )

  const productLocationComplete = useMemo(() => {
    if (!selectedProduct) return false
    const loc = extractLocationFromProductRegion(selectedProduct.region)
    const communeValue = loc.commune || (!countryConfig.hasCommuneLevel ? loc.district : "")
    return !!(loc.province && loc.district && communeValue)
  }, [selectedProduct, countryConfig.hasCommuneLevel])

  const productDatesComplete = !!(evaluationStart && evaluationEnd)

  const resolveCommune = () => {
    if (countryConfig.hasCommuneLevel) return commune
    return commune || district
  }

  const locationReady = () => {
    const c = resolveCommune()
    return !!(country && province && district && c)
  }

  const manualWindow = useMemo(() => getManualEvaluationWindow(perils), [perils])

  const buildPayload = (): ClaimEvaluatePayload => {
    const location = {
      country,
      province,
      district,
      commune: resolveCommune(),
    }

    if (mode === "manual") {
      if (!locationReady()) {
        throw new Error("Please select province, district, and commune")
      }
      if (!perils.length) throw new Error("Add at least one coverage period")
      for (const p of perils) {
        if (!p.startDate || !p.endDate) {
          throw new Error("Each coverage period needs start and end dates")
        }
        if (p.startDate > p.endDate) {
          throw new Error("Each coverage period's start must be on or before its end")
        }
      }
      const window = getManualEvaluationWindow(perils)
      if (!window) {
        throw new Error("Each coverage period needs start and end dates")
      }
      if (window.start > window.end) {
        throw new Error("Coverage start must be on or before the end date")
      }
      return {
        location,
        evaluation_start: window.start,
        evaluation_end: window.end,
        termsheet: mapManualFormToClaimTermsheet(perils, sumInsured),
        sum_insured_scale: 1,
        enrollment_id: null,
        product_id: null,
        source: "manual",
      }
    }

    if (!locationReady()) {
      throw new Error("Please select province, district, and commune")
    }
    if (!evaluationStart || !evaluationEnd) {
      throw new Error("Please enter coverage start and end dates")
    }
    if (evaluationStart > evaluationEnd) {
      throw new Error("Coverage start must be on or before the end date")
    }
    if (!selectedProduct) throw new Error("Please select a product")
    if (!productLocationComplete) {
      throw new Error(
        "This product has no complete location set. Update the product region, or use Enter terms manually."
      )
    }
    if (!productDatesComplete) {
      throw new Error(
        "This product has no coverage dates set. Update the product, or use Enter terms manually."
      )
    }
    const termsheet = productTermsheet || mapProductToClaimTermsheet(selectedProduct)
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
    if (mode === "manual") {
      // No product policy on manual checks — avoid "policy still active" / partial banners.
      return getPolicyClaimContext({
        evaluationStart: manualWindow?.start,
        evaluationEnd: manualWindow?.end,
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

            <TabsContent value="manual" className="space-y-6 mt-4">
              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Location</h3>
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
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                  <div className="sm:max-w-xs w-full">
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
                    className="border border-gray-200 rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-medium text-gray-900">
                        Period {idx + 1}
                        {peril.startDate && peril.endDate
                          ? ` · ${peril.startDate} – ${peril.endDate}`
                          : ""}
                      </h4>
                      {perils.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-500 shrink-0"
                          aria-label={`Remove period ${idx + 1}`}
                          onClick={() =>
                            setPerils((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label>Coverage type</Label>
                        <Select
                          value={peril.peril_type}
                          onValueChange={(v) =>
                            updatePeril(idx, {
                              peril_type: v as ManualPerilForm["peril_type"],
                            })
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
                          onChange={(e) =>
                            updatePeril(idx, { startDate: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Period end</Label>
                        <Input
                          type="date"
                          value={peril.endDate}
                          onChange={(e) =>
                            updatePeril(idx, { endDate: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label>Trigger</Label>
                        <Input
                          type="number"
                          value={peril.trigger}
                          onChange={(e) =>
                            updatePeril(idx, { trigger: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <Label>Duration (days)</Label>
                        <Input
                          type="number"
                          value={peril.duration}
                          onChange={(e) =>
                            updatePeril(idx, { duration: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div>
                        <Label>Payout per unit</Label>
                        <Input
                          type="number"
                          value={peril.unit_payout}
                          onChange={(e) =>
                            updatePeril(idx, {
                              unit_payout: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>Maximum payout (optional)</Label>
                        <Input
                          type="number"
                          placeholder={`Defaults to sum insured (${sumInsured})`}
                          value={peril.max_payout ?? ""}
                          onChange={(e) =>
                            updatePeril(idx, {
                              max_payout:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
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
                              exit_trigger:
                                e.target.value === ""
                                  ? undefined
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </div>
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
              </div>

              <div className="space-y-3 border-t pt-4">
                {manualWindow && (
                  <p className="text-sm text-gray-500">
                    Weather will be checked for{" "}
                    <span className="text-gray-800">
                      {manualWindow.start} – {manualWindow.end}
                    </span>{" "}
                    (from your period dates). This may take a minute or two.
                  </p>
                )}
                {!manualWindow && (
                  <p className="text-sm text-gray-500">
                    We look up the latest weather for this location. This may take a
                    minute or two.
                  </p>
                )}
                <Button onClick={runEvaluate} disabled={running}>
                  {running ? `Checking… ${taskStatus || ""}` : "Check for payout"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="product" className="space-y-4 mt-4">
              <div>
                <Label>Product</Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[min(100vw-2rem,36rem)]">
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="whitespace-normal">
                        {formatProductClaimSelectLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProduct && productTermsheet && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">Termsheet preview</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500">Location: </span>
                      <span className="text-gray-900">
                        {[commune, district, province].filter(Boolean).join(", ") ||
                          "Not set on product"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Coverage: </span>
                      <span className="text-gray-900">
                        {evaluationStart && evaluationEnd
                          ? `${evaluationStart} – ${evaluationEnd}`
                          : "Not set on product"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Sum insured: </span>
                      <span className="text-gray-900">
                        ${Number(productTermsheet.sumInsured || 0).toLocaleString()}
                      </span>
                    </div>
                    {selectedProduct.crop && (
                      <div>
                        <span className="text-gray-500">Crop: </span>
                        <span className="text-gray-900">{selectedProduct.crop}</span>
                      </div>
                    )}
                  </div>

                  {productTermsheet.periods.length === 0 ? (
                    <p className="text-sm text-amber-800">
                      This product has no coverage periods configured.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="px-3 py-2 font-medium">Period</th>
                            <th className="px-3 py-2 font-medium">Type</th>
                            <th className="px-3 py-2 font-medium">Trigger</th>
                            <th className="px-3 py-2 font-medium">Duration</th>
                            <th className="px-3 py-2 font-medium">Exit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productTermsheet.periods.map((period, periodIdx) =>
                            (period.perils.length ? period.perils : [null]).map(
                              (peril, perilIdx) => {
                                const exitVal =
                                  peril?.exit_trigger ?? peril?.exit ?? null
                                return (
                                  <tr
                                    key={`${periodIdx}-${perilIdx}`}
                                    className="border-t border-gray-100"
                                  >
                                    <td className="px-3 py-2 text-gray-900 whitespace-nowrap">
                                      {period.startDate && period.endDate
                                        ? `${period.startDate} – ${period.endDate}`
                                        : `Period ${periodIdx + 1}`}
                                    </td>
                                    <td className="px-3 py-2 text-gray-900">
                                      {formatPerilTypeLabel(peril?.peril_type)}
                                    </td>
                                    <td className="px-3 py-2 text-gray-900">
                                      {peril != null ? peril.trigger : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-gray-900">
                                      {peril != null ? `${peril.duration} days` : "—"}
                                    </td>
                                    <td className="px-3 py-2 text-gray-900">
                                      {exitVal != null ? exitVal : "—"}
                                    </td>
                                  </tr>
                                )
                              }
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(!productLocationComplete || !productDatesComplete) && (
                    <p className="text-sm text-amber-800">
                      {!productLocationComplete
                        ? "This product is missing a complete location. Update it on the product page, or use Enter terms manually."
                        : "This product is missing coverage dates. Update it on the product page, or use Enter terms manually."}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-3 pt-2">
                <p className="text-sm text-gray-500">
                  We look up the latest weather for this product&apos;s location. This may
                  take a minute or two.
                </p>
                <Button
                  onClick={runEvaluate}
                  disabled={
                    running ||
                    !selectedProduct ||
                    !productLocationComplete ||
                    !productDatesComplete ||
                    !(productTermsheet?.periods.length)
                  }
                >
                  {running ? `Checking… ${taskStatus || ""}` : "Check for payout"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
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
