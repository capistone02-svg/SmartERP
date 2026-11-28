import {
  AlignLeft,
  House,
  LayoutGrid,
  MessageSquare,
  Monitor,
  TrendingUp,
  User,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import type { FunctionalArea, Profile } from "@/types"

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  area?: FunctionalArea
  adminOnly?: boolean
  headOrAdmin?: boolean
}

// Same order as the Figma sidebar
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", path: "/", icon: House },
  { label: "Human Resource", path: "/hr", icon: User, area: "human_resources" },
  { label: "Finance", path: "/finance", icon: TrendingUp, area: "finance_accounting" },
  { label: "Inventory", path: "/inventory", icon: LayoutGrid, area: "inventory_warehouse" },
  { label: "Sales", path: "/sales", icon: AlignLeft, area: "sales_marketing" },
  { label: "Customer Service", path: "/customer-service", icon: MessageSquare, area: "customer_service" },
  { label: "Team", path: "/team", icon: UsersRound, headOrAdmin: true },
  { label: "Administration", path: "/administration", icon: Users, adminOnly: true },
  { label: "Reports", path: "/reports", icon: Monitor },
]

// Admin oversees every department (view only). Heads and Staff see only their own area.
// The first item opens a different page for each role, so it is named differently too.
export function navFor(profile: Profile): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return profile.role === "admin"
    if (item.headOrAdmin) return profile.role === "department_head" || profile.role === "admin"
    if (item.area) return profile.role === "admin" || profile.functional_area === item.area
    return true
  }).map((item) =>
    item.path === "/"
      ? { ...item, label: profile.role === "admin" ? "Overview" : profile.role === "department_head" ? "Dashboard" : "My Work" }
      : item,
  )
}
