import { NavLink } from "react-router-dom"
import { cn } from "@/lib/utils"

export function ModuleTabs({ tabs }: { tabs: { label: string; to: string; end?: boolean }[] }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[#dbe3f5]">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium",
              isActive
                ? "border-[#0e63a6] text-[#0e63a6]"
                : "border-transparent text-neutral-500 hover:text-black",
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  )
}