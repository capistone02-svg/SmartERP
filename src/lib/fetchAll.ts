// Reads every row of a query, 1,000 at a time (the database returns at most 1,000 per request).
// Pass a function that builds the query for a given row range, and sort it by a unique column.
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw error
    const chunk = (data ?? []) as T[]
    out.push(...chunk)
    if (chunk.length < 1000) break
  }
  return out
}
