"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface MobileOptimizedLayoutProps {
  children: React.ReactNode
  className?: string
}

export function MobileOptimizedLayout({ children, className }: MobileOptimizedLayoutProps) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div 
      className={cn(
        "min-h-screen transition-all duration-300",
        isMobile ? "px-2 py-2" : "px-4 py-4",
        className
      )}
    >
      {children}
    </div>
  )
}

// Mobile-specific utility components
export function MobileCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm transition-all duration-200",
      "hover:shadow-md p-4 sm:p-6",
      className
    )}>
      {children}
    </div>
  )
}

export function MobileGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "grid gap-4",
      "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
      className
    )}>
      {children}
    </div>
  )
}

export function MobileButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        "h-10 px-4 py-2 min-h-[44px] min-w-[44px]", // Touch-friendly sizing
        "active:scale-95",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
