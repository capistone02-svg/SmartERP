import { useState } from "react"
import { Eye } from "lucide-react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import CaseDrawer from "@/features/customer-service/CaseDrawer"
import { CASE_SELECT, KINDS, statusLabel, STATUS_TONE, type CaseRow } from "@/features/customer-service/caseConfig"
import { formatDate, peso } from "@/lib/format"

// Refund cases with the Sales record they act on: when the Customer Service
// Head approves or completes a refund, the sale shows it here
// (sales_transactions.refund_state / refunded_amount, kept in sync by the
// database - see supabase/phase8_cs_sales_inventory.sql).
type RefundRow = CaseRow & {
  sale: { transaction_no: string; amount: number; refund_state: string; refunded_amount: number } | null
}

const REFUND_TONE: Record<string, "blue" | "green" | "gray"> = {
  approved: "blue", completed: "green", none: "gray",
}

export default function SalesRefundsPage() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const columns: Column<RefundRow>[] = [
    { header: "Case no.", cell: (r) => <span className="font-medium">{r.case_no}</span> },
    { header: "Requested", cell: (r) => formatDate(r.date_submitted) },
    { header: "Customer", cell: (r) => r.customer?.full_name ?? "—" },
    { header: "Sale", cell: (r) => r.sale?.transaction_no ?? r.sale_no ?? "—" },
    { header: "Requested amount", cell: (r) => (r.refund_amount ? peso(r.refund_amount) : "—"), className: "text-right" },
    {
      header: "On the sales record",
      cell: (r) => (r.sale && r.sale.refund_state !== "none" ? (
        <StatusPill
          label={`${r.sale.refund_state === "approved" ? "Approved" : "Completed"} · ${peso(r.sale.refunded_amount)}`}
          tone={REFUND_TONE[r.sale.refund_state] ?? "gray"}
        />
      ) : (
        <span className="text-muted-foreground">Not yet approved</span>
      )),
    },
    {
      header: "Case status",
      cell: (r) => <StatusPill label={statusLabel(r.case_type, r.status)} tone={STATUS_TONE[r.status] ?? "gray"} />,
    },
    {
      header: "",
      className: "w-12 text-right",
      cell: (r) => (
        <button aria-label="Open refund case" title="Open refund case" onClick={() => setOpenId(r.id)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-brand-text">
          <Eye className="h-4 w-4" />
        </button>
      ),
    },
  ]

  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground">
        Refunds decided by Customer Service, with the effect on the sales record. The sale shows
        <b> Approved</b> once the Head approves and <b>Completed</b> once it is paid out; a denied
        refund leaves the sale untouched. Open a case to see its full timeline.
      </p>
      <ResourcePage<RefundRow>
        resource="service_cases" table="service_cases"
        singular="Refund"
        select={`${CASE_SELECT}, sale:sales_transactions(transaction_no, amount, refund_state, refunded_amount)`}
        searchColumns={["case_no", "subject", "sale_no"]}
        searchPlaceholder="Search case no., subject or sale..."
        orderBy="date_submitted" ascending={false}
        columns={columns} rowKey={(r) => r.id}
        readOnly
        fixedEq={{ case_type: "refund" }}
        refreshSignal={tick}
        filters={[{
          name: "status", label: "Status",
          options: KINDS.refund.statuses,
        }]}
        sorts={[
          { value: "newest", label: "Newest first", column: "date_submitted", ascending: false },
          { value: "oldest", label: "Oldest first", column: "date_submitted", ascending: true },
          { value: "amount_high", label: "Amount (highest)", column: "refund_amount", ascending: false },
          { value: "amount_low", label: "Amount (lowest)", column: "refund_amount", ascending: true },
        ]}
        emptyText="No refund cases yet."
      />
      {openId && (
        <CaseDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={() => setTick((t) => t + 1)} />
      )}
    </>
  )
}
