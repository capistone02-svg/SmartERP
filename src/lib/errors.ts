interface ErrLike {
  message?: string
  code?: string
}

// Turns database errors into plain language
export function friendlyError(err: unknown): string {
  const e = (err ?? {}) as ErrLike
  const msg = e.message ?? ""
  if (e.code === "23505") return "A record with the same unique value already exists."
  if (e.code === "23503") return "This record is linked to other records, so that change is not allowed."
  if (e.code === "23514") return "One of the entered values is not allowed. Please check the form."
  if (e.code === "42501" || msg.includes("row-level security"))
    return "You do not have permission to perform this action."
  if (/Insufficient stock|permission to delete|not permitted|cannot be altered/.test(msg)) return msg
  return "Something went wrong. Please try again."
}