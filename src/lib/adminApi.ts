import { supabase } from "@/lib/supabase"

// Account actions go straight to the SECURITY DEFINER admin_action RPC over
// PostgREST - the same channel every other query in the app uses. (The old
// edge-function proxy could not be reached from the browser: the gateway's
// responses lack CORS headers, so fetch always failed before the function ran.)
// admin_action role-checks the caller itself and answers { error: null | "message" }.
export async function callAccountFunction(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.rpc("admin_action", {
    p_action: (body.action as string) ?? null,
    p_employee_no: (body.employee_no as string) ?? null,
    p_full_name: (body.full_name as string) ?? null,
    p_password: (body.password as string) ?? null,
    p_user_id: (body.user_id as string) ?? null,
    p_role: (body.role as string) ?? null,
    p_functional_area: (body.functional_area as string) ?? null,
  })
  if (error) return error.message
  const d = data as { error?: string | null } | null
  return d?.error ? String(d.error) : null
}

// A random temporary password (no look-alike characters such as 0/O or 1/l).
export function randomPassword(length = 10): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"]
  const all = sets.join("")
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  const out: string[] = Array.from({ length }, () => pick(all))
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join("")
}
