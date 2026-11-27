const pesoFmt = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" })
const numFmt = new Intl.NumberFormat("en-PH")

export const peso = (n: number) => pesoFmt.format(n)
export const num = (n: number) => numFmt.format(n)

export function formatDate(s: string | null | undefined) {
  if (!s) return "—"
  return new Date(s + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}