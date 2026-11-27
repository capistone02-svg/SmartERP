import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
  className?: string
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading: boolean
  error?: string | null
  emptyText?: string
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export function DataTable<T>({
  columns, rows, rowKey, loading, error, emptyText = "No records found.",
  page, pageSize, total, onPageChange,
}: Props<T>) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const message = (text: string, cls = "text-neutral-500") => (
    <TableRow>
      <TableCell colSpan={columns.length} className={cn("py-10 text-center text-sm", cls)}>
        {text}
      </TableCell>
    </TableRow>
  )

  return (
    <div className="overflow-hidden rounded-xl border border-[#dbe3f5] bg-white shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#f6f9fe] hover:bg-[#f6f9fe]">
              {columns.map((c, i) => (
                <TableHead key={i} className={cn("text-xs font-semibold text-neutral-600", c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? message("Loading...")
              : error
                ? message(error, "text-red-600")
                : rows.length === 0
                  ? message(emptyText)
                  : rows.map((r) => (
                      <TableRow key={rowKey(r)}>
                        {columns.map((c, i) => (
                          <TableCell key={i} className={cn("text-sm", c.className)}>
                            {c.cell(r)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500">
        <span>{total === 0 ? "0 records" : `Showing ${start}–${end} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <span>Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}