import { useState } from "react"
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAuth } from "@/features/auth/AuthContext"
import { downloadCsv } from "@/lib/csv"
import { friendlyError } from "@/lib/errors"
import { peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"

const HEADERS = [
  "sku",
  "name",
  "category",
  "unit",
  "unit_price",
  "low_stock_threshold",
  "supplier_name",
  "description",
]

const SAMPLE_ROWS = [
  ["LAP-001", "Business Laptop 14-inch", "Electronics", "unit", "42500.00", "5", "Alpha Distribution", "Core i5 16GB 512GB SSD"],
  ["CAB-002", "HDMI Cable 2m", "Accessories", "pc", "320.00", "20", "Prime Wholesale Inc", "Braided high speed HDMI 2.0"],
  ["NOT-001", "Spiral Notebook A5", "Office Supplies", "pack", "85.00", "30", "", "Pack of 3 ruled notebooks"],
]

const TEMPLATE_CONTENT =
  HEADERS.join(",") + "\n" + SAMPLE_ROWS.map((r) => r.map((c) => (c.includes(",") ? `"${c}"` : c)).join(",")).join("\n") + "\n"

interface ProductRow {
  sku: string
  name: string
  category: string
  unit: string
  unit_price: number
  low_stock_threshold: number
  supplier_id: string | null
  description: string | null
}

interface RejectedRow {
  row: number
  sku: string
  name: string
  reason: string
  original: string
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
  const blob = new Blob(["\uFEFF" + TEMPLATE_CONTENT], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "products_import_template.csv"
  a.click()
  URL.revokeObjectURL(url)
}

export function ProductsImport({ onDone }: { onDone: () => void }) {
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  const [fileName, setFileName] = useState("")
  const [valid, setValid] = useState<ProductRow[]>([])
  const [rejected, setRejected] = useState<RejectedRow[]>([])
  const [preview, setPreview] = useState<string[][]>([])
  const [formatError, setFormatError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [importedSummary, setImportedSummary] = useState<{ imported: number; rejected: number } | null>(null)

  if (!can("products", "create") || !can("products", "import")) return null

  function reset() {
    setFileName("")
    setValid([])
    setRejected([])
    setPreview([])
    setFormatError(null)
    setImportedSummary(null)
  }

  async function onFile(file: File) {
    reset()
    setFileName(file.name)
    const rows = parseCsv(await file.text())
    if (rows.length < 2) {
      setFormatError("The file has no data rows.")
      return
    }
    if (rows.length > 2001) {
      setFormatError("Please import at most 2,000 products at a time.")
      return
    }
    const header = rows[0].map((h) => h.trim().toLowerCase())
    const expected = HEADERS.slice(0, 3) // sku, name, category are the minimum required
    if (!expected.every((h, i) => header[i] === h)) {
      setFormatError(`The header row must start with: ${HEADERS.join(", ")}`)
      return
    }

    const [existingRes, supRes] = await Promise.all([
      supabase.from("products").select("sku").is("deleted_at", null).limit(10000),
      supabase.from("suppliers").select("id, name").is("deleted_at", null).limit(1000),
    ])
    if (existingRes.error || supRes.error) {
      setFormatError("Could not load existing products and suppliers to validate the file.")
      return
    }

    const existingSkus = new Set(
      ((existingRes.data ?? []) as { sku: string }[]).map((r) => r.sku.trim().toLowerCase()),
    )
    const suppliersByName = new Map(
      ((supRes.data ?? []) as { id: string; name: string }[]).map((s) => [s.name.trim().toLowerCase(), s.id]),
    )

    const good: ProductRow[] = []
    const bad: RejectedRow[] = []
    const shown: string[][] = []
    const seenInFile = new Set<string>()

    rows.slice(1).forEach((r, idx) => {
      const rowNum = idx + 2
      const [
        rawSku = "",
        rawName = "",
        rawCategory = "",
        rawUnit = "",
        rawPrice = "",
        rawThreshold = "",
        rawSupplier = "",
        rawDesc = "",
      ] = r.map((c) => (c ?? "").trim())

      const problems: string[] = []

      if (!rawSku) {
        problems.push("SKU is required")
      } else {
        const skuKey = rawSku.toLowerCase()
        if (existingSkus.has(skuKey)) {
          problems.push(`SKU "${rawSku}" already exists in the database`)
        } else if (seenInFile.has(skuKey)) {
          problems.push(`Duplicate SKU "${rawSku}" appears earlier in this file`)
        } else {
          seenInFile.add(skuKey)
        }
      }

      if (!rawName) problems.push("Product name is required")
      if (!rawCategory) problems.push("Category is required")

      const unit = rawUnit || "pc"

      let unitPrice = 0
      if (rawPrice !== "") {
        const p = Number(rawPrice)
        if (!Number.isFinite(p) || p < 0) problems.push("Unit price must be a non-negative number")
        else unitPrice = p
      }

      let threshold = 20
      if (rawThreshold !== "") {
        const t = Number(rawThreshold)
        if (!Number.isInteger(t) || t < 0) problems.push("Low stock threshold must be a non-negative whole number")
        else threshold = t
      }

      let supplierId: string | null = null
      if (rawSupplier) {
        const sid = suppliersByName.get(rawSupplier.toLowerCase())
        if (!sid) problems.push(`Unknown supplier "${rawSupplier}" (must match an existing supplier name)`)
        else supplierId = sid
      }

      if (problems.length > 0) {
        bad.push({
          row: rowNum,
          sku: rawSku || "—",
          name: rawName || "—",
          reason: problems.join("; "),
          original: r.join(","),
        })
      } else {
        good.push({
          sku: rawSku,
          name: rawName,
          category: rawCategory,
          unit,
          unit_price: unitPrice,
          low_stock_threshold: threshold,
          supplier_id: supplierId,
          description: rawDesc || null,
        })
        if (shown.length < 8) {
          shown.push([
            String(rowNum),
            rawSku,
            rawName,
            rawCategory,
            unit,
            peso(unitPrice),
            rawSupplier || "—",
          ])
        }
      }
    })

    setValid(good)
    setRejected(bad)
    setPreview(shown)
  }

  async function runImport() {
    if (valid.length === 0) return
    setBusy(true)
    const { error } = await supabase.from("products").insert(valid)
    setBusy(false)
    if (error) {
      toast.error(friendlyError(error))
      return
    }

    const countImported = valid.length
    const countRejected = rejected.length
    setImportedSummary({ imported: countImported, rejected: countRejected })
    toast.success(
      countRejected > 0
        ? `Imported ${countImported} products (${countRejected} invalid rows were skipped).`
        : `Successfully imported all ${countImported} products.`,
    )
    onDone()
  }

  function downloadRejectedReport() {
    downloadCsv(
      `products-import-rejected-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Row", "SKU", "Name", "Reason for rejection", "Original row content"],
      rejected.map((b) => [b.row, b.sku, b.name, b.reason, b.original]),
    )
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="mr-1 h-4 w-4" /> Bulk Import
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (!o) reset()
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bulk import products</DialogTitle>
            <DialogDescription>
              Upload a CSV file containing your product catalog. Products are registered here first before
              tracking their stock movements across warehouses.
            </DialogDescription>
          </DialogHeader>

          {/* Template helper */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-[#0e63a6]" />
              <div>
                <p className="font-medium">Need the format?</p>
                <p className="text-xs text-muted-foreground">
                  Download the Excel-compatible CSV template with required headers and examples.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="mr-1 h-3.5 w-3.5" /> Template
            </Button>
          </div>

          {/* File picker */}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#0e63a6] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-[#0b5189]"
          />

          {formatError && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>{formatError}</div>
            </div>
          )}

          {/* Post-import summary */}
          {importedSummary && (
            <div className="space-y-2 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Import complete
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{importedSummary.imported}</span> products imported successfully.
                {importedSummary.rejected > 0 && (
                  <> <span className="font-semibold text-destructive">{importedSummary.rejected}</span> rows were rejected.</>
                )}
              </p>
              {importedSummary.rejected > 0 && (
                <Button variant="outline" size="sm" onClick={downloadRejectedReport}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Download rejected rows report
                </Button>
              )}
            </div>
          )}

          {/* Pre-import summary counters */}
          {!importedSummary && fileName && !formatError && (
            <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2.5 text-emerald-800">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">{valid.length} valid</div>
                  <div className="text-[11px] text-emerald-700">Ready to import</div>
                </div>
              </div>
              <div
                className={`flex items-center gap-2 rounded-md border p-2.5 ${
                  rejected.length > 0
                    ? "border-amber-200 bg-amber-50/60 text-amber-800"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">{rejected.length} rejected</div>
                  <div className="text-[11px]">
                    {rejected.length > 0 ? "Will be skipped safely" : "No invalid rows"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preview of valid rows */}
          {!importedSummary && preview.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Preview of valid products ({preview.length} of {valid.length})
              </p>
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      {["Row", "SKU", "Name", "Category", "Unit", "Price", "Supplier"].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r) => (
                      <tr key={r[0]} className="border-t border-border">
                        {r.map((c, i) => (
                          <td key={i} className="px-2 py-1">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rejection list + downloadable error report */}
          {!importedSummary && rejected.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-destructive">
                  Rejected rows ({rejected.length}) — will NOT be imported
                </p>
                <button
                  type="button"
                  onClick={downloadRejectedReport}
                  className="text-xs text-[#0e63a6] underline hover:text-[#0b5189]"
                >
                  Download rejection report (CSV)
                </button>
              </div>
              <ul className="max-h-36 space-y-1 overflow-y-auto rounded-md bg-destructive/5 p-2 text-xs text-destructive">
                {rejected.slice(0, 30).map((b) => (
                  <li key={b.row}>
                    <span className="font-semibold">Row {b.row} ({b.sku}):</span> {b.reason}
                  </li>
                ))}
                {rejected.length > 30 && (
                  <li className="italic text-muted-foreground">
                    ...and {rejected.length - 30} more rows. Download the report above for all details.
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {importedSummary ? "Close" : "Cancel"}
            </Button>
            {!importedSummary && (
              <Button
                disabled={busy || valid.length === 0}
                onClick={runImport}
                className="bg-[#0e63a6] text-white hover:bg-[#0b5189]"
              >
                {busy ? "Importing..." : `Import ${valid.length} valid product${valid.length === 1 ? "" : "s"}`}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
