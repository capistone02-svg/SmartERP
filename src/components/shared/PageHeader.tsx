import type { ReactNode } from "react"

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-bold leading-tight text-black">{title}</h1>
        {description && <p className="text-xs text-black">{description}</p>}
      </div>
      {actions}
    </div>
  )
}