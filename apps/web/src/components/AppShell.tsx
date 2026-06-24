// Copyright 2026 The tempo-flow Authors
// SPDX-License-Identifier: Apache-2.0

import { type ReactNode, useState } from "react"
import { LogOut, Menu, Plug, Settings, Users, Workflow } from "lucide-react"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { Logo } from "@/components/Logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

interface NavItem {
  to: string
  label: string
  icon: typeof Workflow
  show: boolean
  /** Prefix that also counts as active (e.g. /flows/:id highlights Flows). */
  activePrefix: string
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth()
  const { pathname } = useLocation()
  const items: NavItem[] = [
    { to: "/", label: "Flows", icon: Workflow, show: true, activePrefix: "/flows" },
    {
      to: "/integration",
      label: "Integration",
      icon: Plug,
      show: true,
      activePrefix: "/integration",
    },
    {
      to: "/members",
      label: "Members",
      icon: Users,
      show: can("manage", "user"),
      activePrefix: "/members",
    },
    {
      to: "/settings",
      label: "Settings",
      icon: Settings,
      show: can("view", "setting"),
      activePrefix: "/settings",
    },
  ]
  return (
    <nav className="flex flex-col gap-1">
      {items
        .filter((i) => i.show)
        .map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.activePrefix)
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          )
        })}
    </nav>
  )
}

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2 px-2 py-1">
      <Logo className="size-6" />
      <span className="text-base font-bold tracking-tight">tempo-flow</span>
    </NavLink>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  function onLogout(): void {
    logout()
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar p-3 md:flex">
        <Brand />
        <div className="mt-4">
          <NavLinks />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4">
          {/* Mobile nav */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-3">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand />
              <div className="mt-4">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex-1" />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <span className="hidden text-sm sm:inline">{user?.email}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {user?.roles.join(", ")}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut className="mr-2 size-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
