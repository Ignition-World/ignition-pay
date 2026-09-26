'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Wallet, Send, ArrowDownUp, History, Anchor, Settings, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

import { useTranslation } from '@/lib/i18n'

const navItemsDef = [
  { href: '/dashboard', translationKey: 'common.dashboard', defaultLabel: 'Dashboard', icon: Wallet },
  { href: '/send', translationKey: 'common.send', defaultLabel: 'Send', icon: Send },
  { href: '/receive', translationKey: 'common.receive', defaultLabel: 'Receive', icon: ArrowDownUp },
  { href: '/history', translationKey: 'common.history', defaultLabel: 'History', icon: History },
  { href: '/anchors', translationKey: 'common.anchors', defaultLabel: 'Anchors', icon: Anchor },
  { href: '/settings', translationKey: 'common.settings', defaultLabel: 'Settings', icon: Settings },
]

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed'

function getInitialCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function Navigation() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  const navItems = navItemsDef.map((item) => ({
    ...item,
    label: t(item.translationKey),
  }))

  const bottomTabs = navItems.filter((item) =>
    ['/dashboard', '/send', '/receive', '/history'].includes(item.href),
  )

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed))
    } catch {
      // localStorage unavailable
    }
  }, [collapsed])

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev)
  }, [])

  return (
    <>
      {/* Mobile Navigation */}
      <nav className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border">
        <div className="flex items-center justify-between h-16 px-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-primary">
            <Wallet size={24} />
            <span>Ignition Pay</span>
          </Link>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-foreground"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {isOpen && (
          <div className="border-t border-border">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-medium border-b border-border last:border-b-0 transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Mobile Bottom Tabs */}
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-4">
          {bottomTabs.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-medium transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon size={20} aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed left-0 top-0 bottom-0 bg-card border-r border-border transition-all duration-300 ease-in-out ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        <div className={`h-16 flex items-center border-b border-border ${collapsed ? 'justify-center px-2' : 'px-6'}`}>
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold text-primary overflow-hidden">
            <Wallet size={24} className="flex-shrink-0" />
            {!collapsed && <span>Ignition Pay</span>}
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-3 rounded-lg font-medium transition-all ${
                  collapsed ? 'justify-center px-2 py-3' : 'px-4 py-3'
                } ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-muted'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>

        <div className={`border-t border-border ${collapsed ? 'px-2 py-3' : 'px-4 py-4'}`}>
          <button
            onClick={toggleCollapse}
            className={`flex items-center w-full rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ${
              collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-4 py-2'
            }`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={18} />
            ) : (
              <>
                <ChevronLeft size={18} />
                <span className="text-xs">Collapse</span>
              </>
            )}
          </button>
          {!collapsed && (
            <div className="mt-2 text-xs text-muted-foreground">
              <div>Ignition Pay v1.0</div>
              <div>Stellar Native</div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
