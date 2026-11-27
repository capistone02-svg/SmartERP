// Change against an earlier period, e.g. "▲ 12.5% vs 2025".
export interface Compare {
  current: number
  previous: number
  label: string // e.g. "2025"
  upIsGood?: boolean // false for things like expenses, where a rise is not good news
}

export function DeltaLine({ compare }: { compare: Compare }) {
  const { current, previous, label, upIsGood = true } = compare
  if (previous === 0 && current === 0) return <p className="mt-1 text-xs text-neutral-400">No change vs {label}</p>
  if (previous === 0) return <p className="mt-1 text-xs text-neutral-400">New vs {label} (none recorded)</p>
  const pct = ((current - previous) / Math.abs(previous)) * 100
  if (Math.abs(pct) < 0.05) return <p className="mt-1 text-xs text-neutral-400">No change vs {label}</p>
  const up = pct > 0
  const good = up === upIsGood
  return (
    <p className={`mt-1 text-xs font-medium ${good ? "text-green-600" : "text-red-600"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% <span className="font-normal text-neutral-400">vs {label}</span>
    </p>
  )
}

export function KpiCard({ label, value, hint, compare }: { label: string; value: string; hint?: string; compare?: Compare }) {
  return (
    <div className="rounded-xl border border-[#dbe3f5] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-[#0e63a6]">{value}</p>
      {compare ? <DeltaLine compare={compare} /> : hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  )
}
