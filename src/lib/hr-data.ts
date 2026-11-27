export type EmployeeRecord = {
  id: string
  name: string
  employeeId: string
  department: string
  position: string
  status: "Active" | "On Leave" | "Probation"
  tenure: string
  email: string
}

export const employees: EmployeeRecord[] = [
  {
    id: "E-101",
    name: "Maria Garcia",
    employeeId: "EMP-1001",
    department: "Human Resource",
    position: "HR Manager",
    status: "Active",
    tenure: "4 years",
    email: "maria.garcia@smcitybatangas.com",
  },
  {
    id: "E-102",
    name: "John Bautista",
    employeeId: "EMP-1002",
    department: "Human Resource",
    position: "Recruitment Specialist",
    status: "Active",
    tenure: "2 years",
    email: "john.bautista@smcitybatangas.com",
  },
  {
    id: "E-103",
    name: "Nina Santos",
    employeeId: "EMP-1003",
    department: "Finance",
    position: "Finance Analyst",
    status: "Active",
    tenure: "3 years",
    email: "nina.santos@smcitybatangas.com",
  },
  {
    id: "E-104",
    name: "Carlos Dela Cruz",
    employeeId: "EMP-1004",
    department: "Inventory",
    position: "Operations Supervisor",
    status: "On Leave",
    tenure: "1 year",
    email: "carlos.delacruz@smcitybatangas.com",
  },
  {
    id: "E-105",
    name: "Alyssa Mendoza",
    employeeId: "EMP-1005",
    department: "Customer Service",
    position: "Guest Experience Officer",
    status: "Active",
    tenure: "5 years",
    email: "alyssa.mendoza@smcitybatangas.com",
  },
  {
    id: "E-106",
    name: "Patrick Reyes",
    employeeId: "EMP-1006",
    department: "Sales",
    position: "Sales Coordinator",
    status: "Probation",
    tenure: "6 months",
    email: "patrick.reyes@smcitybatangas.com",
  },
]

export const workforceStats = [
  { label: "Active employees", value: "1,264" },
  { label: "Attrition rate", value: "3.8%" },
  { label: "Training completion", value: "87.4%" },
  { label: "Open requisitions", value: "18" },
]

export const hrMonthlyTrend = [
  { month: "Jan", utilization: 78, productivity: 71 },
  { month: "Feb", utilization: 81, productivity: 74 },
  { month: "Mar", utilization: 83, productivity: 77 },
  { month: "Apr", utilization: 80, productivity: 79 },
  { month: "May", utilization: 86, productivity: 82 },
  { month: "Jun", utilization: 89, productivity: 84 },
]
