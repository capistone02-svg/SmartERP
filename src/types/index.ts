export type AppRole = "admin" | "department_head" | "staff"

export type FunctionalArea =
  | "human_resources"
  | "finance_accounting"
  | "inventory_warehouse"
  | "sales_marketing"
  | "customer_service"

export type Action = "view" | "create" | "update" | "delete" | "import" | "export"

export interface Profile {
  id: string
  employee_no: string
  email: string
  full_name: string
  role: AppRole
  functional_area: FunctionalArea | null
  employee_id: string | null
  avatar_url: string | null
  is_active: boolean
}

export interface Permission {
  resource: string
  functional_area: FunctionalArea | null
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_import: boolean
  can_export: boolean
}

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  department_head: "Department Head",
  staff: "Staff",
}

export const AREA_LABEL: Record<FunctionalArea, string> = {
  human_resources: "Human Resources",
  finance_accounting: "Finance and Accounting",
  inventory_warehouse: "Inventory and Warehouse",
  sales_marketing: "Sales and Marketing",
  customer_service: "Customer Service",
}