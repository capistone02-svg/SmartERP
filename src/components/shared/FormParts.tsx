import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export const inputClass =
  "h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm outline-none focus:border-[#0e63a6] focus:ring-1 focus:ring-[#0e63a6] disabled:bg-neutral-100 disabled:text-neutral-500"

export function FormField({
  label, required, children, className,
}: {
  label: string
  required?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-neutral-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  )
}