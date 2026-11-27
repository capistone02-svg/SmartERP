const TONES = {
  green: "bg-green-100 text-green-700",
  amber: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
  blue: "bg-blue-100 text-blue-700",
  gray: "bg-neutral-100 text-neutral-600",
}

export function StatusPill({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TONES[tone]}`}>
      {label.replace(/_/g, " ")}
    </span>
  )
}