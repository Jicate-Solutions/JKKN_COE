/**
 * Design System Components and Utilities
 * 
 * This file contains reusable design system components and utilities
 * that ensure consistency across the application.
 */

import { cn } from "@/lib/utils"
import { ReactNode } from "react"

// Typography Components
export function DisplayText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("text-4xl font-bold tracking-tight lg:text-5xl", className)}>
      {children}
    </h1>
  )
}

export function HeadingText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-2xl font-semibold tracking-tight", className)}>
      {children}
    </h2>
  )
}

export function SubheadingText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-lg font-medium text-muted-foreground", className)}>
      {children}
    </h3>
  )
}

export function BodyText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-base leading-7", className)}>
      {children}
    </p>
  )
}

export function CaptionText({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  )
}

// Layout Components
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-h-screen bg-background", className)}>
      {children}
    </div>
  )
}

export function ContentContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("container mx-auto px-4 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  )
}

export function Section({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("py-8 sm:py-12 lg:py-16", className)}>
      {children}
    </section>
  )
}

// Animation Components
export function FadeIn({ children, delay = 0, className }: { 
  children: ReactNode; 
  delay?: number; 
  className?: string 
}) {
  return (
    <div 
      className={cn("animate-fade-in", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function SlideUp({ children, delay = 0, className }: { 
  children: ReactNode; 
  delay?: number; 
  className?: string 
}) {
  return (
    <div 
      className={cn("animate-slide-up", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

export function ScaleIn({ children, delay = 0, className }: { 
  children: ReactNode; 
  delay?: number; 
  className?: string 
}) {
  return (
    <div 
      className={cn("animate-scale-in", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

// Interactive Components
export function HoverLift({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("hover-lift", className)}>
      {children}
    </div>
  )
}

export function HoverGlow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("hover-glow", className)}>
      {children}
    </div>
  )
}

export function HoverScale({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("hover-scale", className)}>
      {children}
    </div>
  )
}

// Status Components
export function SuccessIndicator({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("status-success rounded-md p-3 border", className)}>
      {children}
    </div>
  )
}

export function WarningIndicator({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("status-warning rounded-md p-3 border", className)}>
      {children}
    </div>
  )
}

export function ErrorIndicator({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("status-error rounded-md p-3 border", className)}>
      {children}
    </div>
  )
}

export function InfoIndicator({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("status-info rounded-md p-3 border", className)}>
      {children}
    </div>
  )
}

// Loading Components
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("skeleton h-4 w-full", className)} />
  )
}

export function LoadingShimmer({ className }: { className?: string }) {
  return (
    <div className={cn("loading-shimmer h-4 w-full rounded", className)} />
  )
}

// Focus Components
export function FocusRing({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("focus-ring", className)}>
      {children}
    </div>
  )
}
