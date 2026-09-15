"use client"

import { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useClaim, useUpdateClaimStatus } from "@/lib/hooks"
import type { ClaimStatus } from "@/lib/database.types"
import { ClaimResultSummary } from "./ClaimResultSummary"
import { ClaimPrintButton } from "./ClaimPrintButton"
import {
  CLAIM_STATUS_BADGE_CLASS,
  claimStatusLabel,
  isOpenClaimStatus,
  normalizeClaimStatus,
} from "@/lib/claimStatus"

interface ClaimDetailDialogProps {
  claimId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ordered open-claim IDs for "Next claim" navigation */
  openClaimIds?: string[]
  onSelectClaim?: (id: string) => void
  onStartNewCheck?: () => void
}

export function ClaimDetailDialog({
  claimId,
  open,
  onOpenChange,
  openClaimIds = [],
  onSelectClaim,
  onStartNewCheck,
}: ClaimDetailDialogProps) {
  const { data: claim, isLoading } = useClaim(claimId || "")
  const updateStatus = useUpdateClaimStatus()
  const [rejecting, setRejecting] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const meta = claim?.termsheet_snapshot?.meta || {}
  const weather =
    claim?.peril_breakdown?.weather_snapshot ||
    claim?.termsheet_snapshot?.weather_snapshot

  const workflowStatus = normalizeClaimStatus(claim?.status)
  const resultView = claim
    ? {
        triggered: Number(claim.payout) > 0,
        payout: Number(claim.payout),
        trigger_window: claim.trigger_window,
        trigger_value: claim.trigger_value,
        peril_breakdown: claim.peril_breakdown,
        weather_snapshot: weather,
        data_available_through: claim.peril_breakdown?.data_available_through,
        evaluation_end: meta.evaluation_end || null,
        location: meta.location,
      }
    : null

  const nextOpenId = useMemo(() => {
    if (!claimId || !openClaimIds.length) return null
    const idx = openClaimIds.indexOf(claimId)
    if (idx < 0) return openClaimIds[0] || null
    return openClaimIds[idx + 1] || null
  }, [claimId, openClaimIds])

  if (!claimId) return null

  const goNext = () => {
    setRejecting(false)
    setRejectionReason("")
    if (nextOpenId && onSelectClaim) {
      onSelectClaim(nextOpenId)
      return
    }
    onOpenChange(false)
    onStartNewCheck?.()
  }

  const setStatus = async (
    status: ClaimStatus,
    extras?: { rejectionReason?: string }
  ) => {
    await updateStatus.mutateAsync({
      id: claimId,
      status,
      rejectionReason: extras?.rejectionReason,
    })
    setRejecting(false)
    setRejectionReason("")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setRejecting(false)
          setRejectionReason("")
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{claim?.name || "Claim details"}</DialogTitle>
        </DialogHeader>

        {isLoading && <p className="text-gray-500">Loading…</p>}

        {claim && resultView && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {claim.name && (
                  <span className="text-base font-semibold text-gray-900">
                    {claim.name}
                  </span>
                )}
                <Badge
                  variant="secondary"
                  className={CLAIM_STATUS_BADGE_CLASS[claim.status] || ""}
                >
                  {claimStatusLabel(claim.status)}
                </Badge>
                <span className="text-sm text-gray-500">
                  Type:{" "}
                  {meta.source === "manual"
                    ? "Manual check"
                    : meta.source === "product"
                      ? "Product"
                      : meta.source === "enrollment"
                        ? "Policy"
                        : "—"}
                </span>
                {(claim as any).enrollment?.farmer?.english_name && (
                  <span className="text-sm text-gray-500">
                    Farmer: {(claim as any).enrollment.farmer.english_name}
                  </span>
                )}
                {(claim as any).enrollment?.product?.name && (
                  <span className="text-sm text-gray-500">
                    Product: {(claim as any).enrollment.product.name}
                  </span>
                )}
              </div>
              <ClaimPrintButton
                title={claim.name || "Claim summary"}
                status={claim.status}
                result={resultView}
                extraLines={[
                  claim.name ? `Claim name: ${claim.name}` : "",
                  meta.policy_active
                    ? "Policy status: Still active"
                    : meta.policy_active === false
                      ? "Policy status: Coverage period ended"
                      : "",
                  meta.is_partial_claim
                    ? "This is a partial claim check (part of the full coverage period)."
                    : "",
                  meta.rejection_reason
                    ? `Rejection reason: ${meta.rejection_reason}`
                    : "",
                ].filter(Boolean)}
              />
            </div>

            {(meta.policy_active || meta.is_partial_claim) && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 space-y-1">
                {meta.policy_active && (
                  <p>
                    <span className="font-medium">Policy is still active.</span>{" "}
                    Coverage continues after this check
                    {meta.coverage_label ? ` (${meta.coverage_label})` : ""}.
                  </p>
                )}
                {meta.is_partial_claim && (
                  <p>
                    <span className="font-medium">Partial claim.</span> Only part of
                    the full coverage window was checked
                    {meta.evaluation_label ? `: ${meta.evaluation_label}` : ""}.
                    You can run another check later for the remaining period.
                  </p>
                )}
              </div>
            )}

            {meta.rejection_reason && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <span className="font-medium">Rejection reason:</span>{" "}
                {meta.rejection_reason}
              </div>
            )}

            <ClaimResultSummary result={resultView} />

            {rejecting && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                <div>
                  <Label htmlFor="rejection-reason">Reason for rejection</Label>
                  <Textarea
                    id="rejection-reason"
                    className="mt-1 bg-white"
                    rows={3}
                    placeholder="Explain why this claim is rejected…"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    disabled={
                      updateStatus.isPending || !rejectionReason.trim()
                    }
                    onClick={async () => {
                      await setStatus("rejected", {
                        rejectionReason: rejectionReason.trim(),
                      })
                    }}
                  >
                    Confirm rejection
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setRejecting(false)
                      setRejectionReason("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {isOpenClaimStatus(claim.status) && Number(claim.payout) > 0 && !rejecting && (
                <>
                  <Button
                    onClick={() => setStatus("paid")}
                    disabled={updateStatus.isPending}
                  >
                    Mark as paid
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setRejecting(true)}
                    disabled={updateStatus.isPending}
                  >
                    Reject
                  </Button>
                </>
              )}

              {isOpenClaimStatus(claim.status) && Number(claim.payout) <= 0 && (
                <Button
                  onClick={() => setStatus("clear")}
                  disabled={updateStatus.isPending}
                >
                  Mark as clear
                </Button>
              )}

              {(workflowStatus === "paid" ||
                workflowStatus === "clear" ||
                workflowStatus === "rejected") && (
                <Button variant="outline" onClick={goNext}>
                  {nextOpenId ? "Next open claim" : "Start another check"}
                </Button>
              )}

              {isOpenClaimStatus(claim.status) && nextOpenId && (
                <Button variant="outline" onClick={goNext}>
                  Skip to next open claim
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
