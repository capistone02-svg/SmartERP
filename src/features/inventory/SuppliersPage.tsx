import { useEffect, useState } from "react"
import type { Column } from "@/components/shared/DataTable"
import { ResourcePage, type FieldDef } from "@/components/shared/ResourcePage"
import { Badge } from "@/components/ui/badge"
import { supabase } from "@/lib/supabase"

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_by: string | null
}

export default function SuppliersPage() {
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    supabase
      .from("products")
      .select("supplier_id")
      .is("deleted_at", null)
      .not("supplier_id", "is", null)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        for (const r of (data ?? []) as { supplier_id: string }[]) {
          counts[r.supplier_id] = (counts[r.supplier_id] ?? 0) + 1
        }
        setProductCounts(counts)
      })
  }, [])

  const columns: Column<Supplier>[] = [
    {
      header: "Supplier",
      cell: (r) => (
        <div>
          <span className="font-medium text-foreground">{r.name}</span>
          {r.address && <p className="line-clamp-1 text-xs text-muted-foreground">{r.address}</p>}
        </div>
      ),
    },
    {
      header: "Linked products",
      cell: (r) => {
        const count = productCounts[r.id] ?? 0
        return count > 0 ? (
          <Badge variant="secondary" className="font-normal">
            {count} product{count === 1 ? "" : "s"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">0</span>
        )
      },
    },
    { header: "Contact person", cell: (r) => r.contact_person ?? <span className="text-muted-foreground">—</span> },
    { header: "Phone", cell: (r) => r.phone ?? <span className="text-muted-foreground">—</span> },
    { header: "Email", cell: (r) => r.email ?? <span className="text-muted-foreground">—</span> },
  ]

  const fields: FieldDef[] = [
    { name: "name", label: "Supplier name / Company", type: "text", required: true, fullWidth: true, placeholder: "e.g. Alpha Distribution" },
    { name: "contact_person", label: "Contact person", type: "text", placeholder: "e.g. Maria Santos" },
    { name: "phone", label: "Phone number", type: "text", placeholder: "e.g. +63 917 123 4567" },
    { name: "email", label: "Email address", type: "email", fullWidth: true, placeholder: "e.g. orders@supplier.com" },
    { name: "address", label: "Business address", type: "textarea", placeholder: "Street, City, Province" },
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 rounded-lg border border-border/80 bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        <div>
          <span className="font-semibold text-foreground">Suppliers directory</span> — vendors who provide raw goods and inventory.
          Link suppliers to Products in the catalog and select them during Stock In movements to track receiving sources.
        </div>
      </div>

      <ResourcePage<Supplier>
        resource="suppliers"
        table="suppliers"
        singular="Supplier"
        select="id, name, contact_person, email, phone, address, created_by"
        searchColumns={["name", "contact_person", "email", "phone", "address"]}
        searchPlaceholder="Search suppliers by name, contact, email, phone, or address..."
        orderBy="name"
        columns={columns}
        fields={fields}
        rowKey={(r) => r.id}
        emptyText="No suppliers registered. Add your vendors above to link them with catalog products."
      />
    </div>
  )
}
