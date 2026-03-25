"use client"

import { useState, useEffect, useMemo, memo } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ModeToggle } from "@/components/common/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { BellRing } from "lucide-react"
import { NavUser } from "@/components/layout/nav-user"
import { InstitutionSelector } from "@/components/layout/institution-selector"
import { useInstitution } from "@/context/institution-context"

// Isolated clock component to prevent re-rendering entire header every second
const HeaderClock = memo(function HeaderClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)

  useEffect(() => {
    setCurrentTime(new Date())
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const formatted = currentTime
    ? `${currentTime.getDate().toString().padStart(2, '0')}-${(currentTime.getMonth() + 1).toString().padStart(2, '0')}-${currentTime.getFullYear()} | ${currentTime.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()} | ${currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`
    : "Loading..."

  return (
    <div className="hidden lg:block text-white text-xs font-semibold font-mono bg-white/10 px-2.5 py-1 rounded-md backdrop-blur-sm shadow-sm">
      {formatted}
    </div>
  )
})

interface AppHeaderProps {
  title?: string
  className?: string
}

export function AppHeader({
  title = "JKKN Controller of Examination Portal",
  className = ""
}: AppHeaderProps) {
  const { selectedInstitution, canSwitchInstitution, currentInstitution } = useInstitution()

  // Dynamic title based on institution selection
  const displayTitle = useMemo(() => {
    // If super_admin and no institution selected, show "JKKN Institutions"
    if (canSwitchInstitution && !selectedInstitution) {
      return "JKKN Institutions"
    }
    // If an institution is selected (or non-super_admin user), show institution name
    const activeInstitution = selectedInstitution || currentInstitution
    if (activeInstitution?.institution_name) {
      return activeInstitution.institution_name
    }
    // Fallback to default title
    return title
  }, [canSwitchInstitution, selectedInstitution, currentInstitution, title])

  // Subtitle changes based on selection
  const displaySubtitle = useMemo(() => {
    if (canSwitchInstitution && !selectedInstitution) {
      return "All Institutions - Controller of Examination"
    }
    return "Controller of Examination"
  }, [canSwitchInstitution, selectedInstitution])

  return (
    <header className={`flex h-16 shrink-0 items-center px-6 bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 shadow-2xl sticky top-0 z-20 overflow-hidden ${className}`}>
      {/* Subtle background pattern */}
      <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 via-transparent to-teal-500/10"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_50%)]"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,255,255,0.05),transparent_50%)]"></div>

      <div className="flex items-center gap-4 relative z-10">
        <SidebarTrigger className="-ml-1 text-white/90 hover:text-white hover:bg-white/20 transition-all duration-300 rounded-md" />
        <Separator orientation="vertical" className="mr-2 h-6 bg-white/30" />
        <div className="flex items-center gap-3">

          <div>
            <div className="text-base md:text-lg font-bold text-white drop-shadow-lg font-[family-name:var(--font-space-grotesk)]">
              {displayTitle}
            </div>
            <div className="text-xs text-emerald-100 opacity-90 font-semibold font-inter">
              {displaySubtitle}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 relative z-15 ml-auto">
        {/* Institution Selector - positioned prominently in header */}
        <InstitutionSelector variant="compact" />
        <Separator orientation="vertical" className="hidden md:block h-6 bg-white/30" />
        <HeaderClock />
        <Separator orientation="vertical" className="hidden lg:block h-6 bg-white/30" />
        <Badge variant="secondary" className="bg-white/20 text-white border-0 hover:bg-white/30 transition-all duration-300 shadow-sm p-2 cursor-pointer backdrop-blur-sm">
          <BellRing className="h-4 w-4" />
        </Badge>
        <ModeToggle />
        <Separator orientation="vertical" className="h-6 bg-white/30" />
        <NavUser variant="compact" />
      </div>
    </header>
  )
}
