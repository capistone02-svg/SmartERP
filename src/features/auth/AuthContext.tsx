import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import type { Action, Permission, Profile } from "@/types"

// The login screen asks for an Employee ID; Supabase Auth needs an email.
const LOGIN_DOMAIN = "erp.example.com"
const employeeIdToEmail = (id: string) => `${id.trim().toLowerCase()}@${LOGIN_DOMAIN}`

interface AuthState {
  loading: boolean
  session: Session | null
  profile: Profile | null
  permissions: Permission[]
  notice: string | null
  signIn: (employeeId: string, password: string, remember: boolean) => Promise<string | null>
  signOut: () => Promise<void>
  can: (resource: string, action: Action) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 1) Start-up: restore session (and honour "Remember me" being unticked)
  useEffect(() => {
    let active = true
    async function init() {
      try {
        if (localStorage.getItem("erp_remember") === "0" && !sessionStorage.getItem("erp_tab")) {
          await supabase.auth.signOut({ scope: "local" })
        }
      } catch {
        /* storage not available - ignore */
      }
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setSession(data.session)
      if (!data.session) setLoading(false)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setProfile(null)
        setPermissions([])
        setLoading(false)
      }
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // 2) Whenever the signed-in user changes, load their profile + permissions from the database
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    ;(async () => {
      const { data: p, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()
      if (!active) return
      if (error || !p || !p.is_active) {
        console.error("Could not load profile:", error)
        setNotice(
          p && !p.is_active
            ? "This account is not active. Please contact your system administrator."
            : "Your account could not be loaded. Please contact your system administrator.",
        )
        await supabase.auth.signOut({ scope: "local" })
        setLoading(false)
        return
      }
      const { data: perms } = await supabase
        .from("permissions")
        .select("resource, functional_area, can_view, can_create, can_update, can_delete")
        .eq("role", p.role)
      if (!active) return
      setProfile(p as Profile)
      setPermissions(
        ((perms ?? []) as Permission[]).filter((r) => r.functional_area === p.functional_area),
      )
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [userId])

  const signIn = useCallback(async (employeeId: string, password: string, remember: boolean) => {
    setNotice(null)
    try {
      localStorage.setItem("erp_remember", remember ? "1" : "0")
      sessionStorage.setItem("erp_tab", "1")
    } catch {
      /* ignore */
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: employeeIdToEmail(employeeId),
      password,
    })
    if (error) return "Invalid Employee ID or password."
    return null // profile loading and the active-account check happen in the effect above
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut({ scope: "local" })
  }, [])

  // Used only to show/hide buttons. The database (RLS) is what really enforces access.
  const can = useCallback(
    (resource: string, action: Action) => {
      const row = permissions.find((r) => r.resource === resource)
      if (!row) return false
      return action === "view"
        ? row.can_view
        : action === "create"
          ? row.can_create
          : action === "update"
            ? row.can_update
            : row.can_delete
    },
    [permissions],
  )

  const value = useMemo(
    () => ({ loading, session, profile, permissions, notice, signIn, signOut, can }),
    [loading, session, profile, permissions, notice, signIn, signOut, can],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}