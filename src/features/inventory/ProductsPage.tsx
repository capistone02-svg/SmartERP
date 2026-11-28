import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef, type Option } from "@/components/shared/ResourcePage"
import { num, peso } from "@/lib/format"
import { supabase } from "@/lib/supabase"
import { StockBadge } from "./StockBadge"

interface Product {
  id: string
  sku: string
  name: string
  category: string
  description: string | null
  unit: string
  unit_price: number
  supplier_id: string | null
  low_stock_threshold: number
  created_by: string | null
  supplier: { name: string } | null
}

export default function ProductsPage() {
  const [suppliers, setSuppliers] = useState<Option[]>([])
  useEffect(() => {
    supabase
      .from("suppliers")
      .select("id, name")
      .order("name")
      .then(({ data }) =>
        setSuppliers(((data ?? []) as { id: string; name: string }[]).map((s) => ({ value: s.id, label: s.name }))),
      )
  }, [])

  // Live stock from the movements view - a product list without stock is not
  // much use in the warehouse module.
  const [stock, setStock] = useState<Record<string, { quantity: number; stock_status: string }>>({})
  useEffect(() => {
    supabase.from("v_product_stock").select("product_id, quantity, stock_status").then(({ data }) => {
      const m: Record<string, { quantity: number; stock_status: string }> = {}
      for (const r of (data ?? []) as { product_id: string; quantity: number; stock_status: string }[]) {
        m[r.product_id] = { quantity: r.quantity, stock_status: r.stock_status }
      }
      setStock(m)
    })
  }, [])

  const columns: Column<Product>[] = [
    { header: "SKU", cell: (r) => r.sku },
    { header: "Product", cell: (r) => <span className="font-medium">{r.name}</span> },
    { header: "Category", cell: (r) => r.category },
    {
      header: "In stock",
      cell: (r) => {
        const s = stock[r.id]
        return s ? (
          <span className="flex items-center justify-end gap-1.5">
            <StockBadge status={s.stock_status} />
            <span>{num(s.quantity)} {r.unit}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      },
      className: "text-right",
    },
    { header: "Unit price", cell: (r) => peso(r.unit_price), className: "text-right" },
    { header: "Supplier", cell: (r) => r.supplier?.name ?? "—" },
    { header: "Low-stock level", cell: (r) => r.low_stock_threshold, className: "text-right" },
  ]
  const fields: FieldDef[] = [
    { name: "sku", label: "SKU", type: "text", required: true },
    { name: "name", label: "Product name", type: "text", required: true },
    { name: "category", label: "Category", type: "text", required: true },
    { name: "unit", label: "Unit", type: "text", required: true, defaultValue: "pc" },
    { name: "unit_price", label: "Unit price (PHP)", type: "number", min: 0, required: true, defaultValue: "0" },
    { name: "low_stock_threshold", label: "Low-stock level", type: "integer", min: 0, required: true, defaultValue: "20" },
    { name: "supplier_id", label: "Supplier", type: "select", options: suppliers, placeholder: "No supplier" },
    { name: "description", label: "Description", type: "textarea" },
  ]

  return (
    <ResourcePage<Product>
      resource="products" table="products" singular="Product"
      select="id, sku, name, category, description, unit, unit_price, supplier_id, low_stock_threshold, created_by, supplier:suppliers(name)"
      searchColumns={["sku", "name", "category"]} searchPlaceholder="Search products..."
      orderBy="name" columns={columns} fields={fields} rowKey={(r) => r.id}
    />
  )
}