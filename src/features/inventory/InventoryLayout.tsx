import { Outlet } from "react-router-dom"
import { ModuleTabs } from "@/components/shared/ModuleTabs"
import { PageHeader } from "@/components/shared/PageHeader"
import { usePendingCount } from "@/features/approvals/usePendingCount"
import { useAuth } from "@/features/auth/AuthContext"

const BASE_TABS = [
  { label: "Overview", to: "/inventory", end: true },
  { label: "Products", to: "/inventory/products" },
  { label: "Stock Levels", to: "/inventory/stock" },
  { label: "Movements", to: "/inventory/movements" },
  { label: "Suppliers", to: "/inventory/suppliers" },
  { label: "Warehouses", to: "/inventory/warehouse" },
]

export default function InventoryLayout() {
  const { profile } = useAuth()
  // Department Heads decide on submissions; Admin can look at the queue.
  const sees = profile?.role === "department_head" || profile?.role === "admin"
  const pending = usePendingCount("inventory_movements", sees)
  const TABS = sees
    ? [...BASE_TABS, { label: pending > 0 ? `Approvals (${pending})` : "Approvals", to: "/inventory/approvals" }]
    : BASE_TABS
  return (
    <>
      <PageHeader
        title="Inventory and Warehouse"
        description="Catalog products, track physical warehouses, record stock movements, and monitor live inventory levels."
      />
      <ModuleTabs tabs={TABS} />
      <Outlet />
    </>
  )
}
