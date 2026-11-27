import { useState } from "react"
import { Menu, PanelLeft } from "lucide-react"
import { Outlet } from "react-router-dom"
import logo from "@/assets/sm-logo.svg"
import { Sidebar } from "@/components/layout/Sidebar"
import { cn } from "@/lib/utils"

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("erp_sidebar") === "1"
    } catch {
      return false
    }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem("erp_sidebar", next ? "1" : "0")
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-[#f1f0ff]">
      {/* Desktop sidebar */}
      <div className={cn("fixed inset-y-0 left-0 z-30 hidden p-4 lg:block", collapsed ? "w-[104px]" : "w-[260px]")}>
        <Sidebar collapsed={collapsed} />
        <button
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute right-1 top-10 flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 shadow hover:text-[#0e63a6]"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Small screens: top bar + slide-in menu */}
      <div className="flex items-center gap-3 p-3 lg:hidden">
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="rounded-md p-2 hover:bg-white">
          <Menu className="h-5 w-5" />
        </button>
        <img src={logo} alt="SM Supermalls" className="h-8 w-8" />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[280px] p-3">
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className={cn("p-4 sm:p-6 lg:py-6 lg:pr-8", collapsed ? "lg:pl-[128px]" : "lg:pl-[284px]")}>
        <Outlet />
      </main>
    </div>
  )
}