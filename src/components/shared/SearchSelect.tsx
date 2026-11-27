import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Search, X } from "lucide-react"
import { useDebounced } from "@/hooks/useDebounced"
import { cn } from "@/lib/utils"

export interface Option {
  value: string
  label: string
  sub?: string // small grey text under the label (e.g. a customer number)
}

// A list that is searched on the server (for lists too long to load at once).
export interface Lookup {
  search: (query: string) => Promise<Option[]>
  label: (id: string) => Promise<Option | null> // finds the name of the saved choice when a record is opened
}

interface Props {
  value: string
  onChange: (value: string) => void
  options?: Option[] // short lists: filtered on screen
  lookup?: Lookup // long lists: searched in the database
  placeholder?: string
  disabled?: boolean
  clearable?: boolean
}

const SHOW_MAX = 50

export function SearchSelect({ value, onChange, options, lookup, placeholder = "Select...", disabled, clearable = true }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debounced = useDebounced(query, 250)
  const [remote, setRemote] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Option | null>(null)
  const box = useRef<HTMLDivElement>(null)

  // Name of the current choice
  useEffect(() => {
    if (!value) {
      setPicked(null)
      return
    }
    const local = options?.find((o) => o.value === value)
    if (local) {
      setPicked(local)
      return
    }
    if (picked?.value === value) return
    if (!lookup) return
    let on = true
    lookup.label(value).then((o) => on && setPicked(o))
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, options, lookup])

  // Search the database while the list is open
  useEffect(() => {
    if (!open || !lookup) return
    let on = true
    setLoading(true)
    lookup
      .search(debounced.trim())
      .then((rows) => on && setRemote(rows))
      .catch(() => on && setRemote([]))
      .finally(() => on && setLoading(false))
    return () => {
      on = false
    }
  }, [open, debounced, lookup])

  // Close when clicking elsewhere
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [open])

  const shown = useMemo(() => {
    if (lookup) return remote
    const q = query.trim().toLowerCase()
    const all = options ?? []
    return q ? all.filter((o) => (o.label + " " + (o.sub ?? "")).toLowerCase().includes(q)) : all
  }, [lookup, remote, options, query])

  function choose(o: Option) {
    setPicked(o)
    onChange(o.value)
    setOpen(false)
    setQuery("")
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm outline-none",
          "focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <span className={cn("truncate", !picked && "text-muted-foreground")}>{picked?.label ?? placeholder}</span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && value && !disabled && (
            <span
              role="button"
              aria-label="Clear"
              onClick={(e) => {
                e.stopPropagation()
                setPicked(null)
                onChange("")
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div onClick={(e) => e.preventDefault()} className="absolute z-50 mt-1 w-full rounded-2xl border border-border bg-popover p-2 shadow-card">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false)
                if (e.key === "Enter") {
                  e.preventDefault()
                  if (shown[0]) choose(shown[0])
                }
              }}
              placeholder="Type to search..."
              className="h-9 w-full rounded-md border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {loading && <li className="px-3 py-2 text-xs text-muted-foreground">Searching...</li>}
            {!loading && shown.length === 0 && <li className="px-3 py-2 text-xs text-muted-foreground">No matches.</li>}
            {!loading &&
              shown.slice(0, SHOW_MAX).map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => choose(o)}
                    className={cn(
                      "w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-accent",
                      o.value === value && "bg-accent font-medium",
                    )}
                  >
                    <span className="block truncate">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-muted-foreground">{o.sub}</span>}
                  </button>
                </li>
              ))}
            {!loading && shown.length > SHOW_MAX && (
              <li className="px-3 py-2 text-xs text-muted-foreground">Showing the first {SHOW_MAX}. Type to narrow down.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
