import { isSupabaseConfigured, supabase } from "@/lib/supabase"

export type EmployeeStatus = "Active" | "On Leave" | "Probation"
export type InventoryStatus = "Healthy" | "Low" | "Critical"

export type EmployeeRecord = {
  id: string
  name: string
  employeeId: string
  department: string
  position: string
  status: EmployeeStatus
  tenure: string
  email: string
}

export type FinanceEntry = {
  id: string
  type: "Revenue" | "Expense"
  category: string
  reference: string
  description: string
  date: string
  amount: number
  status: "Cleared" | "Pending"
}

export type InventoryItem = {
  id: string
  item: string
  location: string
  quantity: number
  reorderLevel: number
  status: InventoryStatus
  updatedAt: string
}

export type SalesRecord = {
  id: string
  transactionId: string
  customer: string
  product: string
  date: string
  quantity: number
  amount: number
  channel: string
}

export type CustomerCase = {
  id: string
  customer: string
  type: "Inquiry" | "Complaint" | "Feedback" | "Service Request"
  subject: string
  status: "Open" | "Pending" | "Resolved"
  priority: "Low" | "Medium" | "High"
  date: string
  assignedTo: string
}

export type ERPData = {
  employees: EmployeeRecord[]
  financeEntries: FinanceEntry[]
  inventoryItems: InventoryItem[]
  salesRecords: SalesRecord[]
  customerCases: CustomerCase[]
}

const STORAGE_KEY = "erp-system-thesis-data-v1"

const clampStatus = (value: string): InventoryStatus => {
  if (value === "Low") return "Low"
  if (value === "Critical") return "Critical"
  return "Healthy"
}

export const defaultERPData: ERPData = {
  employees: [
    { id: "emp-1001", name: "Maria Dela Cruz", employeeId: "26-47605", department: "System Administration", position: "Systems Administrator", status: "Active", tenure: "4 years", email: "maria.delacruz@smcitybatangas.com" },
    { id: "emp-1002", name: "Ramon Santos", employeeId: "26-47012", department: "Finance", position: "Finance Manager", status: "Active", tenure: "6 years", email: "ramon.santos@smcitybatangas.com" },
    { id: "emp-1003", name: "Alicia Reyes", employeeId: "26-48200", department: "Inventory", position: "Warehouse Supervisor", status: "Active", tenure: "3 years", email: "alicia.reyes@smcitybatangas.com" },
    { id: "emp-1004", name: "Daniel Cruz", employeeId: "26-48110", department: "Sales", position: "Sales Executive", status: "Active", tenure: "2 years", email: "daniel.cruz@smcitybatangas.com" },
    { id: "emp-1005", name: "Liza Torres", employeeId: "26-48821", department: "Customer Service", position: "Customer Relations Lead", status: "On Leave", tenure: "5 years", email: "liza.torres@smcitybatangas.com" },
  ],
  financeEntries: [
    { id: "fin-101", type: "Revenue", category: "Lease Income", reference: "REV-2041", description: "Mall tenant lease revenue", date: "2026-11-08", amount: 1250000, status: "Cleared" },
    { id: "fin-102", type: "Expense", category: "Utilities", reference: "EXP-4412", description: "Electricity and water operating costs", date: "2026-11-08", amount: 420000, status: "Pending" },
    { id: "fin-103", type: "Revenue", category: "Advertising", reference: "REV-2045", description: "Event sponsorship revenue", date: "2026-11-06", amount: 860000, status: "Cleared" },
    { id: "fin-104", type: "Expense", category: "Maintenance", reference: "EXP-4418", description: "HVAC servicing and repairs", date: "2026-11-05", amount: 310000, status: "Cleared" },
  ],
  inventoryItems: [
    { id: "inv-201", item: "LED Display Panel", location: "Warehouse A", quantity: 120, reorderLevel: 30, status: "Healthy", updatedAt: "2026-11-08" },
    { id: "inv-202", item: "Escalator Motor Kit", location: "Warehouse B", quantity: 18, reorderLevel: 25, status: "Low", updatedAt: "2026-11-07" },
    { id: "inv-203", item: "Cleaning Supply Bundle", location: "Warehouse C", quantity: 9, reorderLevel: 20, status: "Critical", updatedAt: "2026-11-08" },
    { id: "inv-204", item: "Security Camera Unit", location: "Warehouse A", quantity: 64, reorderLevel: 18, status: "Healthy", updatedAt: "2026-11-06" },
  ],
  salesRecords: [
    { id: "sale-301", transactionId: "TXN-8701", customer: "Asterio Builders", product: "Mall Event Sponsorship", date: "2026-11-08", quantity: 1, amount: 540000, channel: "Corporate" },
    { id: "sale-302", transactionId: "TXN-8707", customer: "Ariane Foods", product: "Promotional Booth Package", date: "2026-11-07", quantity: 2, amount: 280000, channel: "Retail" },
    { id: "sale-303", transactionId: "TXN-8712", customer: "Bluebird Telecom", product: "Digital Signage Campaign", date: "2026-11-05", quantity: 1, amount: 620000, channel: "Corporate" },
  ],
  customerCases: [
    { id: "cs-401", customer: "Maricel Ramos", type: "Inquiry", subject: "Mall operating hours", status: "Open", priority: "Medium", date: "2026-11-08", assignedTo: "Customer Service Desk" },
    { id: "cs-402", customer: "Jason Lim", type: "Complaint", subject: "Parking lane congestion", status: "Pending", priority: "High", date: "2026-11-07", assignedTo: "Operations Team" },
    { id: "cs-403", customer: "Eleanor Cruz", type: "Feedback", subject: "Cleanliness rating", status: "Resolved", priority: "Low", date: "2026-11-05", assignedTo: "Guest Services" },
  ],
}

export function readERPData(): ERPData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultERPData))
      return defaultERPData
    }

    const parsed = JSON.parse(raw) as ERPData
    if (!parsed || !Array.isArray(parsed.employees)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultERPData))
      return defaultERPData
    }

    return {
      employees: parsed.employees ?? defaultERPData.employees,
      financeEntries: parsed.financeEntries ?? defaultERPData.financeEntries,
      inventoryItems: (parsed.inventoryItems ?? defaultERPData.inventoryItems).map((item) => ({ ...item, status: clampStatus(String(item.status ?? "Healthy")) })),
      salesRecords: parsed.salesRecords ?? defaultERPData.salesRecords,
      customerCases: parsed.customerCases ?? defaultERPData.customerCases,
    }
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultERPData))
    return defaultERPData
  }
}

export function saveERPData(data: ERPData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export async function loadERPData(): Promise<ERPData> {
  if (isSupabaseConfigured && supabase) {
    try {
      const [profiles, employees, finance, inventory, sales, tickets] = await Promise.all([
        supabase.from("profiles").select("id, full_name, employee_id, department_id").limit(1),
        supabase.from("hr_employee_records").select("id, position, status").limit(1),
        supabase.from("finance_records").select("id, record_name, amount").limit(1),
        supabase.from("inventory_records").select("id, item_name, stock_quantity").limit(1),
        supabase.from("sales_records").select("id, campaign_name, revenue").limit(1),
        supabase.from("customer_tickets").select("id, customer_name, status").limit(1),
      ])

      if (
        !profiles.error &&
        !employees.error &&
        !finance.error &&
        !inventory.error &&
        !sales.error &&
        !tickets.error
      ) {
        return readERPData()
      }
    } catch {
      return readERPData()
    }
  }

  return readERPData()
}

export function createEmployeeRecord(input: Partial<EmployeeRecord>): EmployeeRecord {
  return {
    id: input.id ?? `emp-${Date.now()}`,
    name: input.name ?? "New Employee",
    employeeId: input.employeeId ?? `26-${Math.floor(Math.random() * 90000 + 10000)}`,
    department: input.department ?? "Human Resources",
    position: input.position ?? "Team Member",
    status: input.status ?? "Active",
    tenure: input.tenure ?? "1 year",
    email: input.email ?? "employee@smcitybatangas.com",
  }
}

export function createFinanceEntry(input: Partial<FinanceEntry>): FinanceEntry {
  return {
    id: input.id ?? `fin-${Date.now()}`,
    type: input.type ?? "Expense",
    category: input.category ?? "Operations",
    reference: input.reference ?? `REF-${Math.floor(Math.random() * 9000 + 1000)}`,
    description: input.description ?? "New financial entry",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    amount: input.amount ?? 0,
    status: input.status ?? "Pending",
  }
}

export function createInventoryItem(input: Partial<InventoryItem>): InventoryItem {
  return {
    id: input.id ?? `inv-${Date.now()}`,
    item: input.item ?? "New Item",
    location: input.location ?? "Warehouse A",
    quantity: input.quantity ?? 0,
    reorderLevel: input.reorderLevel ?? 20,
    status: clampStatus(String(input.status ?? "Healthy")),
    updatedAt: input.updatedAt ?? new Date().toISOString().slice(0, 10),
  }
}

export function createSalesRecord(input: Partial<SalesRecord>): SalesRecord {
  return {
    id: input.id ?? `sale-${Date.now()}`,
    transactionId: input.transactionId ?? `TXN-${Math.floor(Math.random() * 9000 + 1000)}`,
    customer: input.customer ?? "New Customer",
    product: input.product ?? "Campaign Package",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    quantity: input.quantity ?? 1,
    amount: input.amount ?? 0,
    channel: input.channel ?? "Retail",
  }
}

export function createCustomerCase(input: Partial<CustomerCase>): CustomerCase {
  return {
    id: input.id ?? `cs-${Date.now()}`,
    customer: input.customer ?? "New Customer",
    type: input.type ?? "Inquiry",
    subject: input.subject ?? "New case",
    status: input.status ?? "Open",
    priority: input.priority ?? "Medium",
    date: input.date ?? new Date().toISOString().slice(0, 10),
    assignedTo: input.assignedTo ?? "Customer Service Desk",
  }
}
