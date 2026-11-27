import { supabase } from "@/lib/supabase"

// Records sign-outs and failed sign-ins in the Login Log.
// Successful sign-ins are recorded by the database itself.
// Call installAuthAudit() once, when the app starts.

let installed = false

export function installAuthAudit() {
  if (installed) return

  const auth = supabase.auth

  // Prevent the app from crashing if Supabase is not properly configured.
  if (
    typeof auth.signInWithPassword !== "function" ||
    typeof auth.signOut !== "function"
  ) {
    console.error(
      "Auth audit was not installed: Supabase authentication methods are unavailable. Check your Vercel environment variables.",
    )
    return
  }

  installed = true

  const agent = () =>
    typeof navigator !== "undefined"
      ? navigator.userAgent.slice(0, 200)
      : null

  const origSignIn = auth.signInWithPassword.bind(auth)

  auth.signInWithPassword = async (credentials) => {
    const res = await origSignIn(credentials)

    if (res.error && "email" in credentials) {
      const employeeNo = credentials.email.split("@")[0]

      supabase
        .rpc("log_failed_login", {
          p_employee_no: employeeNo,
          p_user_agent: agent(),
        })
        .then(
          () => undefined,
          () => undefined,
        )
    }

    return res
  }

  const origSignOut = auth.signOut.bind(auth)

  auth.signOut = async (options) => {
    try {
      await supabase.rpc("log_logout", {
        p_user_agent: agent(),
      })
    } catch {
      // Never block a sign-out.
    }

    return origSignOut(options)
  }
}
