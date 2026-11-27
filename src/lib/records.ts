import { friendlyError } from "@/lib/errors"
import { supabase } from "@/lib/supabase"

// Returns an error message, or null when it worked.
export async function saveRecord(
  table: string,
  payload: Record<string, unknown>,
  id?: string,
): Promise<string | null> {
  if (id) {
    const { data, error } = await supabase.from(table).update(payload).eq("id", id).select("id")
    if (error) return friendlyError(error)
    if (!data || data.length === 0) return "This record could not be updated. You may not have permission to edit it."
    return null
  }
  const { error } = await supabase.from(table).insert(payload)
  return error ? friendlyError(error) : null
}

// "Delete" hides the record; it only works if the Admin switched delete on for this role.
export async function deleteRecord(table: string, id: string): Promise<string | null> {
  const { error } = await supabase.rpc("soft_delete_record", { p_table: table, p_id: id })
  return error ? friendlyError(error) : null
}