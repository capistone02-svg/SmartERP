import { useState } from "react"
import { Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { APPROVALS_CHANGED } from "@/features/approvals/usePendingCount"
import { useAuth } from "@/features/auth/AuthContext"
import { downloadCsv } from "@/lib/csv"
import { friendlyError } from "@/lib/errors"
import { peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"

const HEADERS = ["transaction_date", "product_sku", "customer_no", "quantity", "amount"]
const TEMPLATE = HEADERS.join(",") + "\n2026-01-15,GRC-001,CUS-00001,2,650.00\n"

interface NewSale {
  transaction_date: string
  product_id: string
  customer_id: string | null
  quantity: number
  amount: number
}

function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const endRow = () => {
    row.push(cell)
    cell = ""
    if (row.some((x) => x.trim() !== "")) rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ",") {
      row.push(cell)
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      endRow()
    } else cell += c
  }
  endRow()
  return rows
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "sales_import_template.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export function SalesImport({ onDone }: { onDone: () => void }) {
  const { can, profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState("")
  const [valid, setValid] = useState<NewSale[]>([])
  const [errors, setErrors] = useState<string[]>([]) // first 50, shown on screen
  const [allProblems, setAllProblems] = useState<{ row: number; problem: string; line: string }[]>([])
  const [preview, setPreview] = useState<string[][]>([])
  const [dupes, setDupes] = useState(0)
  const [busy, setBusy] = useState(false)

  if (!can("sales_transactions", "create") || !can("sales_transactions", "import")) return null

  function reset() {
    setFileName("")
    setValid([])
    setErrors([])
    setAllProblems([])
    setPreview([])
    setDupes(0)
  }

  async function onFile(file: File) {
    reset()
    setFileName(file.name)
    const rows = parseCsv(await file.text())
    if (rows.length < 2) return setErrors(["The file has no data rows."])
    if (rows.length > 2001) return setErrors(["Please import at most 2,000 rows at a time."])
    const header = rows[0].map((h) => h.trim().toLowerCase())
    if (HEADERS.some((h, i) => header[i] !== h)) {
      return setErrors([`The first row must be exactly: ${HEADERS.join(",")}`])
    }

    const [p, c] = await Promise.all([
      supabase.from("products").select("id, sku").limit(5000),
      supabase.from("customers").select("id, customer_no").limit(5000),
    ])
    if (p.error || c.error) return setErrors(["Could not load products and customers to check the file."])
    const products = new Map(((p.data ?? []) as { id: string; sku: string }[]).map((r) => [r.sku, r.id]))
    const customers = new Map(((c.data ?? []) as { id: string; customer_no: string }[]).map((r) => [r.customer_no, r.id]))

    const good: NewSale[] = []
    const shown: string[][] = []
    const bad: { row: number; problem: string; line: string }[] = []
    const seen = new Set<string>()
    let dup = 0
    rows.slice(1).forEach((r, idx) => {
      const n = idx + 2
      const [date, sku, cust, qty, amt] = r.map((x) => (x ?? "").trim())
      const problems: string[] = []
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) problems.push("date must be YYYY-MM-DD")
      const productId = products.get(sku)
      if (!productId) problems.push(`unknown product SKU "${sku}"`)
      const customerId = cust ? customers.get(cust) : null
      if (cust && !customerId) problems.push(`unknown customer "${cust}"`)
      const q = Number(qty)
      if (!Number.isInteger(q) || q < 1) problems.push("quantity must be a whole number of 1 or more")
      const a = Number(amt)
      if (amt === "" || !Number.isFinite(a) || a < 0) problems.push("amount must be 0 or more")
      if (problems.length) bad.push({ row: n, problem: problems.join("; "), line: r.join(",") })
      else {
        good.push({ transaction_date: date, product_id: productId!, customer_id: customerId ?? null, quantity: q, amount: a })
        const key = [date, sku, cust, q, a].join("|")
        if (seen.has(key)) dup++
        seen.add(key)
        if (shown.length < 8) shown.push([String(n), date, sku, cust || "—", String(q), peso(a)])
      }
    })
    setValid(good)
    setPreview(shown)
    setDupes(dup)
    setAllProblems(bad)
    const lines = bad.slice(0, 50).map((b) => `Row ${b.row}: ${b.problem}`)
    if (bad.length > 50) lines.push(`...and ${bad.length - 50} more problems. Download the error report to see all of them.`)
    setErrors(lines)
  }

  async function runImport() {
    setBusy(true)
    const { error } = await supabase.from("sales_transactions").insert(valid)
    setBusy(false)
    if (error) return toast.error(friendlyError(error))
    toast.success(
      profile?.role === "staff"
        ? `${valid.length} sales records submitted for approval.`
        : `${valid.length} sales records imported.`,
    )
    window.dispatchEvent(new Event(APPROVALS_CHANGED))
    setOpen(false)
    reset()
    onDone()
  }

  function downloadErrors() {
    downloadCsv(
      `sales-import-errors-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Row", "Problem", "Original line"],
      allProblems.map((b) => [b.row, b.problem, b.line]),
    )
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-4 w-4" /> Import CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import sales records</DialogTitle>
            <DialogDescription>
              Upload a CSV file with the columns {HEADERS.join(", ")}. Nothing is saved unless every row is valid.
              {profile?.role === "staff" && " Your rows go to your Department Head for approval."}
            </DialogDescription>
          </DialogHeader>
          <button type="button" onClick={downloadTemplate} className="w-fit text-sm text-[#0e63a6] underline">
            Download template
          </button>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="text-sm"
          />
          {fileName && errors.length === 0 && valid.length > 0 && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {valid.length} rows are ready to import from {fileName}.
              {dupes > 0 && ` ${dupes} look like duplicates of another row in this file, please check.`}
            </p>
          )}
          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-[#dbe3f5]">
              <table className="w-full text-xs">
                <thead className="bg-[#f6f9fe] text-left text-neutral-600">
                  <tr>
                    {["Row", "Date", "SKU", "Customer", "Qty", "Amount"].map((h) => (
                      <th key={h} className="px-2 py-1 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r[0]} className="border-t border-[#eef1f8]">
                      {r.map((c, i) => <td key={i} className="px-2 py-1">{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-[#eef1f8] px-2 py-1 text-neutral-500">
                Preview of the first {preview.length} of {valid.length} valid rows.
              </p>
            </div>
          )}
          {errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {allProblems.length > 0 && (
            <button type="button" onClick={downloadErrors} className="w-fit text-sm text-[#0e63a6] underline">
              Download error report ({allProblems.length} rows)
            </button>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || valid.length === 0 || errors.length > 0}
              onClick={runImport}
              className="bg-[#0e63a6] text-white hover:bg-[#0b5189]"
            >
              {busy ? "Importing..." : "Import"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}