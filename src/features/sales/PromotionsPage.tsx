import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { StatusPill } from "@/components/shared/StatusPill"
import { formatDate, peso, todayStr } from "@/lib/format"
import { supabase } from "@/lib/supabase"

interface Promotion {
  id: string
  name: string
  description: string | null
  product_id: string | null
  discount_percent: number | null
  promo_price: number | null
  start_date: string
  end_date: string
  status: string
  created_by: string | null
  product: { id: string; name: string; sku: string; unit_price: number } | null
}

const TONE = { planned: "blue", active: "green", ended: "gray", cancelled: "red" } as const
const STATUSES = ["planned", "active", "ended", "cancelled"].map((s) => ({
  value: s,
  label: s[0].toUpperCase() + s.slice(1),
}))

export default function PromotionsPage() {
  const [products, setProducts] = useState<Option[]>([])

  useEffect(() => {
    supabase
      .from("products")
      .select("id, sku, name, unit_price")
      .order("name")
      .then(({ data }) => {
        const rows = (data ?? []) as { id: string; sku: string; name: string; unit_price: number }[]
        setProducts(
          rows.map((p) => ({
            value: p.id,
            label: `${p.name} (${p.sku}) — Reg. ${peso(p.unit_price)}`,
          })),
        )
      })
  }, [])

  const columns: Column<Promotion>[] = [
    {
      header: "Promotion",
      cell: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.name}</span>
          {r.description && <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>}
        </div>
      ),
    },
    {
      header: "Target Product",
      cell: (r) =>
        r.product ? (
          <div>
            <span className="font-medium">{r.product.name}</span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">({r.product.sku})</span>
          </div>
        ) : (
          <span className="text-muted-foreground italic">Storewide / General</span>
        ),
    },
    {
      header: "Discount",
      cell: (r) =>
        r.discount_percent && Number(r.discount_percent) > 0 ? (
          <StatusPill label={`${r.discount_percent}% OFF`} tone="green" />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Promo Price",
      cell: (r) =>
        r.promo_price != null ? (
          <div>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {peso(r.promo_price)}
            </span>
            {r.product?.unit_price && (
              <span className="ml-1.5 text-xs text-muted-foreground line-through">
                {peso(r.product.unit_price)}
              </span>
            )}
          </div>
        ) : r.product?.unit_price ? (
          <span>{peso(r.product.unit_price)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: "Period",
      cell: (r) => (
        <span className="text-xs">
          {formatDate(r.start_date)} – {formatDate(r.end_date)}
        </span>
      ),
    },
    {
      header: "Status",
      cell: (r) => <StatusPill label={r.status} tone={TONE[r.status as keyof typeof TONE] ?? "gray"} />,
    },
  ]

  const fields: FieldDef[] = [
    { name: "name", label: "Promotion name", type: "text", required: true, fullWidth: true },
    {
      name: "product_id",
      label: "Discounted Product",
      type: "select",
      options: products,
      placeholder: "None (General store promotion)",
      fullWidth: true,
    },
    {
      name: "discount_percent",
      label: "Discount Percentage (%)",
      type: "number",
      min: 0,
      step: "1",
      placeholder: "e.g. 25 for 25% discount",
      defaultValue: "0",
    },
    { name: "status", label: "Status", type: "select", options: STATUSES, required: true, defaultValue: "planned" },
    { name: "start_date", label: "Start date", type: "date", required: true, defaultValue: todayStr() },
    { name: "end_date", label: "End date", type: "date", required: true, defaultValue: todayStr() },
    { name: "description", label: "Description / Promotion terms", type: "textarea", fullWidth: true },
  ]

  const toForm = (r: Promotion) => ({
    name: r.name,
    description: r.description ?? "",
    product_id: r.product_id ?? "",
    discount_percent: r.discount_percent != null ? String(r.discount_percent) : "0",
    start_date: r.start_date,
    end_date: r.end_date,
    status: r.status,
  })

  return (
    <ResourcePage<Promotion>
      resource="promotions"
      table="promotions"
      singular="Promotion"
      select="id, name, description, product_id, discount_percent, promo_price, start_date, end_date, status, created_by, product:products(id, name, sku, unit_price)"
      searchColumns={["name", "description"]}
      searchPlaceholder="Search promotions..."
      orderBy="start_date"
      ascending={false}
      columns={columns}
      fields={fields}
      toForm={toForm}
      rowKey={(r) => r.id}
      filters={[{ name: "status", label: "Status", options: STATUSES }]}
    />
  )
}