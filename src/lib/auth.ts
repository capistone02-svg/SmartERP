import { isSupabaseConfigured, supabase } from "@/lib/supabase"

export type UserRole = "admin" | "department_head" | "staff"

export type AppUser = {
  id: string
  name: string
  employeeId: string
  email: string
  role: UserRole
  department: string
}

const SESSION_KEY = "erp-system-session"

const seedUsers: AppUser[] = [
  {
    id: "u-1001",
    name: "Maria Dela Cruz",
    employeeId: "26-47605",
    email: "maria.delacruz@smcitybatangas.com",
    role: "admin",
    department: "System Administration",
  },
  {
    id: "u-1002",
    name: "Ramon Santos",
    employeeId: "26-47012",
    email: "ramon.santos@smcitybatangas.com",
    role: "department_head",
    department: "Finance",
  },
  {
    id: "u-1003",
    name: "Alicia Reyes",
    employeeId: "26-48200",
    email: "alicia.reyes@smcitybatangas.com",
    role: "staff",
    department: "Inventory",
  },
]

const seedPasswords: Record<string, string> = {
  "26-47605": "admin123",
  "26-47012": "head123",
  "26-48200": "staff123",
}

function normalizeRole(roleValue: unknown): UserRole {
  const normalized = String(roleValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "")

  if (normalized === "admin") return "admin"
  if (normalized === "department_head" || normalized === "department-head") return "department_head"
  return "staff"
}

function normalizeUser(raw: any): AppUser | null {
  if (!raw) return null

  const role = raw.role_name ?? raw.role ?? raw.user_role ?? raw.role_name ?? raw.role_id
  const department = raw.department_name ?? raw.department ?? raw.department_name

  if (!raw.id || !raw.employee_id || !raw.full_name || !role || !department) {
    return null
  }

  return {
    id: String(raw.id),
    name: String(raw.full_name),
    employeeId: String(raw.employee_id),
    email: String(raw.email ?? `${String(raw.employee_id).toLowerCase()}@smcitybatangas.com`),
    role: normalizeRole(role),
    department: String(department),
  }
}

async function hashPassword(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

async function verifyPassword(storedHash: string | null | undefined, candidate: string): Promise<boolean> {
  const normalizedStoredHash = String(storedHash ?? "").trim()
  if (!normalizedStoredHash) return false

  if (normalizedStoredHash === candidate) return true

  const candidateHash = await hashPassword(candidate)
  return normalizedStoredHash === candidateHash
}

async function signInWithSupabase(employeeId: string, password: string): Promise<AppUser | null> {
  if (!isSupabaseConfigured || !supabase) {
    return null
  }

  try {
    const { data, error } = await supabase
      .from("vw_user_access")
      .select("id, full_name, employee_id, email, role_name, department_name, is_active")
      .eq("employee_id", employeeId)
      .maybeSingle()

    if (error || !data) {
      return null
    }

    const user = normalizeUser(data)
    if (!user) {
      return null
    }

    if (data.is_active === false) {
      return null
    }

    const credentialMatch = await supabase
      .from("user_credentials")
      .select("password_hash")
      .eq("profile_id", user.id)
      .maybeSingle()

    if (credentialMatch.error || !credentialMatch.data) {
      return null
    }

    const storedHash = credentialMatch.data.password_hash
    const passwordMatches = await verifyPassword(storedHash, password)
    if (!passwordMatches) {
      return null
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify(user))
    return user
  } catch {
    return null
  }
}

export async function signInWithCredentials(employeeId: string, password: string): Promise<AppUser | null> {
  const normalizedEmployeeId = employeeId.trim()

  const supabaseUser = await signInWithSupabase(normalizedEmployeeId, password)
  if (supabaseUser) {
    return supabaseUser
  }

  const user = seedUsers.find((entry) => entry.employeeId === normalizedEmployeeId)

  if (!user) {
    return null
  }

  if (seedPasswords[normalizedEmployeeId] !== password) {
    return null
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
  return user
}

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      return null
    }

    return JSON.parse(raw) as AppUser
  } catch {
    return null
  }
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY)
}

export function canAccessDepartment(user: AppUser | null, department: string) {
  if (!user) return false
  if (user.role === "admin") return true
  return user.department === department
}

export function hasRole(user: AppUser | null, allowedRoles: UserRole[]) {
  if (!user) return false
  return allowedRoles.includes(user.role)
}
