import { useState } from "react"
import { Download, FileSpreadsheet, Upload } from "lucide-react"
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
const SAMPLE_CSV = [
  HEADERS.join(","),
  "2026-11-28,CHR-001,,1,1875.00",
  "2026-11-28,MSE-001,,2,1700.00",
  "2026-11-28,PPR-001,CUS-00001,5,600.00",
  "2026-11-28,TNR-001,,1,2200.00",
].join("\n") + "\n"

interface NewSale {
  transaction_date: string
  product_id: string
  customer_id: string | null
  quantity: number
  amount: number
  approval_status: "approved"
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
  const url = URL.createObjectURL(new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" }))
  const a = document.createElement("a")
  a.href = url
  a.download = "cashier_pos_sales_template.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export function SalesImport({ onDone }: { onDone: () => void }) {
  const { can } = useAuth()
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
      if (cust && !customerId) problems.push(`unknown customer ID "${cust}" (leave blank for walk-in counter sales)`)
      const q = Number(qty)
      if (!Number.isInteger(q) || q < 1) problems.push("quantity must be a whole number of 1 or more")
      const a = Number(amt)
      if (amt === "" || !Number.isFinite(a) || a < 0) problems.push("amount must be 0 or more")
      if (problems.length) bad.push({ row: n, problem: problems.join("; "), line: r.join(",") })
      else {
        good.push({
          transaction_date: date,
          product_id: productId!,
          customer_id: customerId ?? null,
          quantity: q,
          amount: a,
          approval_status: "approved",
        })
        const key = [date, sku, cust, q, a].join("|")
        if (seen.has(key)) dup++
        seen.add(key)
        if (shown.length < 8) shown.push([String(n), date, sku, cust || "Walk-in", String(q), peso(a)])
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
    toast.success(`${valid.length} cashier POS sales records successfully imported and finalized.`)
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
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <Upload className="h-4 w-4" /> Import POS CSV
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-brand" />
              Cashier End-of-Day Sales Import
            </DialogTitle>
            <DialogDescription>
              Import daily cashier register transactions from CSV. Walk-in purchases do not require a customer number. Transactions are recorded directly as completed sales and deducted from inventory.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-2xl bg-muted/70 p-3.5 border border-border">
              <div className="text-xs">
                <p className="font-semibold text-foreground">Cashier Register POS Template</p>
                <p className="text-muted-foreground">Columns: {HEADERS.join(", ")}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                className="gap-1.5 shrink-0 bg-card hover:bg-accent shadow-xs"
              >
                <Download className="h-3.5 w-3.5" /> Download Template
              </Button>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">Select POS CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
                className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-1 file:text-xs file:font-medium file:text-brand-foreground hover:file:bg-brand/90"
              />
            </div>
          </div>

          {fileName && errors.length === 0 && valid.length > 0 && (
            <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              ✓ <b>{valid.length}</b> cashier sales rows are ready to import from <b>{fileName}</b>.
              {dupes > 0 && ` (${dupes} look like duplicate rows in this file)`}
            </p>
          )}

          {preview.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-left text-muted-foreground">
                  <tr>
                    {["Row", "Date", "SKU", "Customer", "Qty", "Amount"].map((h) => (
                      <th key={h} className="px-3 py-1.5 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r[0]} className="border-t border-border">
                      {r.map((c, i) => (
                        <td key={i} className="px-3 py-1.5">
                          {i === 3 && c === "Walk-in" ? (
                            <span className="text-muted-foreground italic">Walk-in</span>
                          ) : (
                            c
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                Showing preview of first {preview.length} of {valid.length} valid sales records.
              </p>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}

          {allProblems.length > 0 && (
            <button type="button" onClick={downloadErrors} className="w-fit text-xs text-brand hover:underline">
              Download error report ({allProblems.length} rows with issues)
            </button>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || valid.length === 0 || errors.length > 0}
              onClick={runImport}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
            >
              {busy ? "Importing..." : `Import ${valid.length > 0 ? `(${valid.length})` : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}