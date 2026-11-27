import type { Option } from "@/components/shared/SearchSelect"

export type CaseKind = "complaint" | "refund" | "inquiry" | "feedback"

// Statuses that still need work
export const PENDING = ["open", "in_progress", "for_review", "approved"]

export interface KindConfig {
  kind: CaseKind
  path: string // tab address under /customer-service
  label: string // one case, e.g. "Complaint"
  plural: string
  blurb: string
  statuses: Option[] // the steps of this case type, in order
  done: string[] // statuses that need a resolution note
  doneLabel: string
  doneRequired: boolean
}

export const KINDS: Record<CaseKind, KindConfig> = {
  complaint: {
    kind: "complaint", path: "complaints", label: "Complaint", plural: "Complaints",
    blurb: "Problems with a service or product. Link a product only when the complaint is about one - every complaint must have a customer.",
    statuses: [
      { value: "open", label: "Received" },
      { value: "in_progress", label: "Investigating" },
      { value: "resolved", label: "Resolved" },
      { value: "closed", label: "Closed" },
    ],
    done: ["resolved", "closed"], doneLabel: "How it was resolved", doneRequired: true,
  },
  refund: {
    kind: "refund", path: "refunds", label: "Refund / Return", plural: "Refunds and Returns",
    blurb: "Linked to the sale being refunded; the customer is filled in from that sale. The Department Head approves or denies.",
    statuses: [
      { value: "open", label: "Requested" },
      { value: "for_review", label: "Head review" },
      { value: "approved", label: "Approved" },
      { value: "denied", label: "Denied" },
      { value: "resolved", label: "Completed" },
    ],
    done: ["denied", "resolved"], doneLabel: "Decision or completion note", doneRequired: true,
  },
  inquiry: {
    kind: "inquiry", path: "inquiries", label: "Product inquiry", plural: "Product Inquiries",
    blurb: "Questions from a customer about a product, its availability or promotions. Every inquiry must have a customer.",
    statuses: [
      { value: "open", label: "Open" },
      { value: "resolved", label: "Answered" },
      { value: "closed", label: "Closed" },
    ],
    done: ["resolved", "closed"], doneLabel: "Answer given", doneRequired: true,
  },
  feedback: {
    kind: "feedback", path: "feedback", label: "Feedback", plural: "Feedback",
    blurb: "Ratings, compliments and suggestions from a customer. Ratings feed the satisfaction score.",
    statuses: [
      { value: "open", label: "Received" },
      { value: "resolved", label: "Reviewed" },
    ],
    done: ["resolved"], doneLabel: "Action taken (optional)", doneRequired: false,
  },
}

export const KIND_LIST: KindConfig[] = [KINDS.complaint, KINDS.refund, KINDS.inquiry, KINDS.feedback]

// Database case_type -> tab. (Older "service_request" cases only appear under All cases.)
export const TYPE_LABEL: Record<string, string> = {
  complaint: "Complaint", refund: "Refund / Return", inquiry: "Product inquiry",
  feedback: "Feedback", service_request: "Service request",
}
export const TYPE_TONE = {
  complaint: "red", refund: "amber", inquiry: "blue", feedback: "green", service_request: "gray",
} as const

const DEFAULT_STATUS: Record<string, string> = {
  open: "Open", in_progress: "In progress", for_review: "Head review", approved: "Approved",
  denied: "Denied", resolved: "Resolved", closed: "Closed",
}
export function statusLabel(caseType: string, status: string): string {
  const cfg = KIND_LIST.find((k) => k.kind === caseType)
  return cfg?.statuses.find((s) => s.value === status)?.label ?? DEFAULT_STATUS[status] ?? status
}
export const STATUS_TONE: Record<string, "green" | "amber" | "red" | "blue" | "gray"> = {
  open: "amber", in_progress: "blue", for_review: "blue", approved: "blue",
  denied: "red", resolved: "green", closed: "gray",
}
export const SEVERITY_TONE = { high: "red", medium: "amber", low: "gray" } as const
export const SEVERITIES: Option[] = [
  { value: "high", label: "High (due in 2 days)" },
  { value: "medium", label: "Medium (due in 5 days)" },
  { value: "low", label: "Low (due in 10 days)" },
]
export const RATINGS: Option[] = [
  { value: "5", label: "5 - Excellent" },
  { value: "4", label: "4 - Good" },
  { value: "3", label: "3 - Fair" },
  { value: "2", label: "2 - Poor" },
  { value: "1", label: "1 - Very poor" },
]
export const stars = (n: number | null) => (n ? "★".repeat(n) + "☆".repeat(5 - n) : "—")

// The "Case" row used by the list pages and the details window
export interface CaseRow {
  id: string
  case_no: string
  case_type: string
  customer_id: string | null
  subject: string
  description: string | null
  date_submitted: string
  status: string
  assigned_to: string | null
  resolution_details: string | null
  resolution_date: string | null
  created_by: string | null
  product_id: string | null
  product_name: string | null
  sales_transaction_id: string | null
  sale_no: string | null
  severity: string | null
  due_date: string | null
  refund_amount: number | null
  rating: number | null
  customer: { full_name: string; card_type: string | null } | null
}

export const CASE_SELECT =
  "id, case_no, case_type, customer_id, subject, description, date_submitted, status, assigned_to, resolution_details, resolution_date, created_by, product_id, product_name, sales_transaction_id, sale_no, severity, due_date, refund_amount, rating, customer:customers(full_name, card_type)"
