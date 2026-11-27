import { useEffect, useRef, useState, type FormEvent } from "react"
import { Outlet } from "react-router-dom"
import { toast } from "sonner"
import { FormField, inputClass } from "@/components/shared/FormParts"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/features/auth/AuthContext"
import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"

const IDLE_MINUTES = 15

// Wraps the signed-in part of the app:
//  1) a user with a temporary password must choose a new one before anything else
//  2) a user who is inactive for IDLE_MINUTES is signed out
export default function PasswordGate() {
  const { profile, signOut } = useAuth()
  const [state, setState] = useState<"loading" | "must" | "ok">("loading")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut

  // 1) Does this user still have a temporary password?
  useEffect(() => {
    if (!profile) return
    let on = true
    supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", profile.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (!on) return
        const flag = (data as { must_change_password?: boolean } | null)?.must_change_password
        setState(!e && flag === true ? "must" : "ok")
      })
    return () => {
      on = false
    }
  }, [profile])

  // 2) Idle sign-out
  useEffect(() => {
    const limit = IDLE_MINUTES * 60 * 1000
    let timer = 0
    let last = 0
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        toast.info(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`)
        void signOutRef.current()
      }, limit)
    }
    const onActivity = () => {
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      arm()
    }
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    arm()
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, onActivity))
    }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (next.length < 8) return setError("The new password must be at least 8 characters.")
    if (next === "Welcome@123") return setError("Choose a different password.")
    if (next !== confirm) return setError("The passwords do not match.")
    setSaving(true)
    const { error: updErr } = await supabase.auth.updateUser({ password: next })
    if (updErr) {
      setSaving(false)
      return setError(friendlyError(updErr))
    }
    const { error: clearErr } = await supabase.rpc("clear_must_change_password")
    setSaving(false)
    if (clearErr) return setError(friendlyError(clearErr))
    toast.success("Password changed.")
    setState("ok")
  }

  if (state === "loading") return <div className="p-8 text-sm text-neutral-500">Loading...</div>
  if (state === "ok") return <Outlet />

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef1fb] p-4">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-[#dbe3f5] bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Choose a new password</h1>
          <p className="mt-1 text-sm text-neutral-600">
            You signed in with a temporary password. Set your own password to continue.
          </p>
        </div>
        <FormField label="New password" required>
          <input type="password" className={inputClass} value={next} placeholder="At least 8 characters"
            onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirm new password" required>
          <input type="password" className={inputClass} value={confirm}
            onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </FormField>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center justify-between">
          <button type="button" className="text-sm text-neutral-500 underline" onClick={() => void signOut()}>
            Sign out
          </button>
          <Button type="submit" disabled={saving} className="bg-[#0e63a6] text-white hover:bg-[#0b5189]">
            {saving ? "Saving..." : "Save password"}
          </Button>
        </div>
      </form>
    </div>
  )
}
