import { useMemo, useState } from "react"
import { FileText, Search } from "lucide-react"
import { inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { parseCsv } from "@/lib/csvRead"
import { cn } from "@/lib/utils"

const PAGE = 20

// Opens an exported log (or any CSV) in the browser. The file stays on this computer; nothing is uploaded.
export default function CsvViewer() {
  const [name, setName] = useState("")
  const [head, setHead] = useState<string[]>([])
  const [body, setBody] = useState<string[][]>([])
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState("")
  const [filters, setFilters] = useState<Record<number, string>>({})
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    if (file.size > 25 * 1024 * 1024) return setError("The file is larger than 25 MB.")
    const rows = parseCsv(await file.text())
    if (rows.length < 2) return setError("This file has no rows to show.")
    setName(file.name); setHead(rows[0]); setBody(rows.slice(1))
    setText(""); setFilters({}); setFrom(""); setTo(""); setPage(1)
  }

  // Columns with only a few different values become dropdown filters.
  const choices = useMemo(() => {
    const out: Record<number, string[]> = {}
    head.forEach((_, i) => {
      const set = new Set<string>()
      for (const r of body) { set.add(r[i] ?? ""); if (set.size > 12) break }
      if (set.size > 1 && set.size <= 12) out[i] = [...set].sort()
    })
    return out
  }, [head, body])

  // A date column: "occurred_at" in the archive files, or one called "When"
  const dateCol = head.findIndex((h) => /^(occurred_at|when|date)$/i.test(h.trim()))

  const shown = useMemo(() => {
    const q = text.trim().toLowerCase()
    return body.filter((r) => {
      if (q && !r.some((c) => c.toLowerCase().includes(q))) return false
      for (const [i, v] of Object.entries(filters)) if (v && r[Number(i)] !== v) return false
      if (dateCol >= 0 && (from || to)) {
        const t = new Date(r[dateCol])
        if (Number.isNaN(t.getTime())) return false
        if (from && t < new Date(`${from}T00:00:00+08:00`)) return false
        if (to && t > new Date(`${to}T23:59:59.999+08:00`)) return false
      }
      return true
    })
  }, [body, text, filters, from, to, dateCol])

  const pages = Math.max(1, Math.ceil(shown.length / PAGE))
  const slice = shown.slice((page - 1) * PAGE, page * PAGE)
  const back = () => setPage(1)

  return (
    <section className="rounded-xl border bg-card p-4 shadow-card">
      <h3 className="text-sm font-semibold">Open an exported file</h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Pick a CSV you exported earlier to search it here. The file is read on this computer and is not uploaded.
      </p>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
        <FileText className="h-4 w-4" /> Choose CSV file
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = "" }} />
      </label>
      {name && <span className="ml-3 text-xs text-muted-foreground">{name} · {body.length.toLocaleString()} rows</span>}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      {head.length > 0 && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={text} placeholder="Search every column..." className={cn(inputClass, "pl-9")}
                onChange={(e) => { setText(e.target.value); back() }} />
            </div>
            {Object.entries(choices).map(([i, opts]) => (
              <select key={i} aria-label={head[Number(i)]} value={filters[Number(i)] ?? ""} className={cn(inputClass, "w-auto")}
                onChange={(e) => { setFilters({ ...filters, [Number(i)]: e.target.value }); back() }}>
                <option value="">{head[Number(i)]}: All</option>
                {opts.map((o) => <option key={o} value={o}>{o === "" ? "(empty)" : o.length > 40 ? o.slice(0, 40) + "…" : o}</option>)}
              </select>
            ))}
            {dateCol >= 0 && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">From</label>
                  <input type="date" value={from} className={cn(inputClass, "w-auto")} onChange={(e) => { setFrom(e.target.value); back() }} />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">To</label>
                  <input type="date" value={to} className={cn(inputClass, "w-auto")} onChange={(e) => { setTo(e.target.value); back() }} />
                </div>
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted text-left font-semibold text-muted-foreground">
                  {head.map((h, i) => <th key={i} className="whitespace-nowrap px-3 py-2">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {slice.map((r, ri) => (
                  <tr key={ri} className="border-t align-top">
                    {head.map((_, i) => <td key={i} className="max-w-xs truncate px-3 py-2" title={r[i]}>{r[i]}</td>)}
                  </tr>
                ))}
                {slice.length === 0 && <tr><td colSpan={head.length} className="px-3 py-6 text-center text-muted-foreground">No rows match.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{shown.length.toLocaleString()} of {body.length.toLocaleString()} rows</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span>Page {page} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
