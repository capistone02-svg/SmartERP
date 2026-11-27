import { LogOut, Settings, UserRound } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/features/auth/AuthContext"
import { cn } from "@/lib/utils"
import { ROLE_LABEL } from "@/types"

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase()
}

export function ProfileMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  if (!profile) return null

  const go = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  return (
    <div className="mt-2 border-t border-neutral-200 pt-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors hover:bg-[#eef6fd] data-[state=open]:bg-[#dbeefc]",
              collapsed && "justify-center",
            )}
          >
            <Avatar className="h-9 w-9 shrink-0">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} alt="" />}
              <AvatarFallback className="bg-[#0e63a6] text-xs font-medium text-white">
                {initials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-black">{profile.full_name}</span>
                <span className="block truncate text-xs text-neutral-500">{ROLE_LABEL[profile.role]}</span>
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-56 rounded-xl p-1.5 shadow-lg">
          <DropdownMenuItem className="gap-2 py-2" onSelect={() => go("/profile")}>
            <UserRound className="h-4 w-4" /> My Profile
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2 py-2" onSelect={() => go("/settings")}>
            <Settings className="h-4 w-4" /> Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 py-2 text-red-600 focus:bg-red-50 focus:text-red-600"
            onSelect={async () => {
              await signOut()
              navigate("/login")
            }}
          >
            <LogOut className="h-4 w-4" /> Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}