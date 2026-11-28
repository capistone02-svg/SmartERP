import { supabase } from "@/lib/supabase"

// The name of the account function you deployed in Supabase (Edge Functions).
const FUNCTION_NAME = "smart-action"

// Calls the account function. Returns an error message, or null on success.
export async function callAccountFunction(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body })
  if (error) {
    try {
      const res = (error as { context?: Response }).context
      if (res) {
        const j = await res.json()
        // Function errors use { error }; platform errors (401/404) use { msg } / { message }.
        if (j?.error) return String(j.error)
        if (j?.message) return String(j.message)
        if (j?.msg) return String(j.msg)
      }
    } catch {
      /* fall through */
    }
    // No response at all (CORS/network). Include the raw error so it can be diagnosed.
    return `The request failed (${error.message ?? "network error"}). Please check that the account function is deployed.`
  }
  return data?.error ? String(data.error) : null
}

// A random temporary password (no look-alike characters such as 0/O or 1/l).
export function randomPassword(length = 10): string {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789"]
  const all = sets.join("")
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length]
  const out = sets.map(pick)
  while (out.length < length) out.push(pick(all))
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out.join("")
}
