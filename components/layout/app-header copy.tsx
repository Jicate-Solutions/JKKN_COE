"use client"

import { useState, useEffect } from "react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ModeToggle } from "@/components/common/mode-toggle"
import { Badge } from "@/components/ui/badge"
import { BellRing, Clock, Calendar } from "lucide-react"
import { NavUser } from "@/components/layout/nav-user"

interface AppHeaderProps {
  title?: string
  showDateTime?: boolean
  className?: string
}

export function AppHeader({ 
  title = "JKKN Controller of Examination Portal",
  showDateTime = true,
  className = ""
}: AppHeaderProps) {
  const [currentTime, setCurrentTime] = useState<Date | null>(null)

  useEffect(() => {
    setCurrentTime(new Date())
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatCurrentDateTime = (date: Date | null) => {
    if (!date) return "Loading..."
    
    const day = date.getDate().toString().padStart(2, '0')
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const year = date.getFullYear()
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
    
    return `${day}-${month}-${year} | ${weekday} | ${time}`
  }
 
  return (
    <header className={`flex h-16 shrink-0 items-center justify-between px-6 bg-gradient-to-r from-[#059669] to-teal-600 text-white shadow-md relative ${className}`}>
      <div className="flex items-center gap-4 relative z-10">
        <SidebarTrigger className="-ml-1 text-white hover:bg-white/20 transition-all duration-200 rounded-md" />
        <Separator orientation="vertical" className="h-6 bg-white/30" />
        <div>
          <div className="text-base md:text-lg font-bold text-white font-[family-name:var(--font-space-grotesk)]">
            {title}
          </div>
          <div className="text-xs text-white/90 font-semibold font-inter">
            Controller of Examination
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        {showDateTime && (
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white/15 rounded-lg backdrop-blur-sm border border-white/20">
            <Clock className="h-4 w-4 text-white/90" />
            <div className="text-sm font-semibold text-white font-inter">
              {formatCurrentDateTime(currentTime)}
            </div>
          </div>
        )}

        <Badge variant="secondary" className="bg-white/15 text-white border-white/20 hover:bg-white/25 transition-all duration-200 p-2 cursor-pointer">
          <BellRing className="h-4 w-4" />
        </Badge>

        <ModeToggle />

        <NavUser />
      </div>
    </header>
  )
}
