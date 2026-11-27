import { NavLink } from "react-router-dom"
import logo from "@/assets/sm-logo.svg"
import { ProfileMenu } from "@/components/layout/ProfileMenu"
import { useAuth } from "@/features/auth/AuthContext"
import { navFor } from "@/lib/navigation"
import { cn } from "@/lib/utils"

export function Sidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { profile } = useAuth()
  if (!profile) return null

  return (
    <aside className="flex h-full flex-col rounded-2xl border-2 border-[#2b8ae6] bg-white p-3 shadow-md">
      <div className={cn("flex items-center gap-2 px-1 py-2", collapsed && "justify-center")}>
        <img src={logo} alt="SM Supermalls" className="h-9 w-9 shrink-0" />
        {!collapsed && (
          <span className="text-lg leading-none text-[#0e63a6]">
            <b className="font-semibold">SM</b> <span className="font-light">Supermalls</span>
          </span>
        )}
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1 overflow-y-auto">
        {navFor(profile).map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            title={collapsed ? item.label : undefined}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-xs text-black transition-colors hover:bg-[#eef6fd]",
                collapsed && "justify-center px-0",
                isActive && "bg-[#dbeefc] font-medium text-[#0e63a6] hover:bg-[#dbeefc]",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <ProfileMenu collapsed={collapsed} onNavigate={onNavigate} />
    </aside>
  )
}