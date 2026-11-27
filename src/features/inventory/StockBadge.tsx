const MAP: Record<string, [string, string]> = {
  in_stock: ["In stock", "bg-green-100 text-green-700"],
  low_stock: ["Low stock", "bg-amber-100 text-amber-700"],
  out_of_stock: ["Out of stock", "bg-red-100 text-red-700"],
}

export function StockBadge({ status }: { status: string }) {
  const [label, cls] = MAP[status] ?? [status, "bg-neutral-100 text-neutral-700"]
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}