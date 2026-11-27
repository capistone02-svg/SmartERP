// Small per-browser preferences (rows per page, default Overview period).
export function getPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem("erp_pref_" + key) ?? fallback
  } catch {
    return fallback
  }
}

export function setPref(key: string, value: string) {
  try {
    localStorage.setItem("erp_pref_" + key, value)
  } catch {
    /* ignore */
  }
}

export function rowsPerPage(): number {
  const n = Number(getPref("rows", "10"))
  return n === 25 || n === 50 ? n : 10
}