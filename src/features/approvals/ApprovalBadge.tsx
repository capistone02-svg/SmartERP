export type ApprovalStatus = "pending" | "approved" | "rejected"

const STYLE: Record<ApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
}
const LABEL: Record<ApprovalStatus, string> = {
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
}

// Shows where a record stands. A rejected record also shows the Head's reason.
export function ApprovalBadge({ status, note }: { status: ApprovalStatus; note?: string | null }) {
  return (
    <div>
      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STYLE[status]}`} title={note ?? undefined}>
        {LABEL[status]}
      </span>
      {status === "rejected" && note && <div className="mt-1 max-w-[16rem] text-xs text-red-600">Reason: {note}</div>}
    </div>
  )
}
