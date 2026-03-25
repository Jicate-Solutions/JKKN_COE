# Course Stats Example

Complete example of a premium stats component for courses with custom metrics.

## Component: `components/stats/premium-course-stats.tsx`

```tsx
import { Card, CardContent } from "@/components/ui/card"
import { BookOpen, CheckCircle, XCircle, TrendingUp, Award, Clock, LucideIcon } from "lucide-react"

interface Course {
  id: string
  course_code: string
  course_name: string
  credits: number
  course_type: string
  is_active: boolean
  created_at: string
}

interface StatConfig {
  label: string
  value: number | string
  icon: LucideIcon
  iconBg: string
  iconColor: string
  valueColor: string
}

interface PremiumCourseStatsProps {
  items: Course[]
  loading?: boolean
}

export function PremiumCourseStats({ items = [], loading = false }: PremiumCourseStatsProps) {
  // Calculate statistics
  const total = items.length
  const active = items.filter((c) => c.is_active).length
  const inactive = items.filter((c) => !c.is_active).length

  // Calculate total credits
  const totalCredits = items.reduce((sum, c) => sum + (c.credits || 0), 0)

  // Count by course type
  const theoryCount = items.filter((c) => c.course_type === 'theory').length
  const practicalCount = items.filter((c) => c.course_type === 'practical').length

  // New this month
  const newThisMonth = items.filter((c) => {
    const itemDate = new Date(c.created_at)
    const currentDate = new Date()
    return (
      itemDate.getMonth() === currentDate.getMonth() &&
      itemDate.getFullYear() === currentDate.getFullYear()
    )
  }).length

  // Define stat configurations
  const stats: StatConfig[] = [
    {
      label: "Total Courses",
      value: total,
      icon: BookOpen,
      iconBg: "bg-blue-50 dark:bg-blue-900/20",
      iconColor: "text-blue-600 dark:text-blue-400",
      valueColor: "text-slate-900 dark:text-slate-100",
    },
    {
      label: "Active",
      value: active,
      icon: CheckCircle,
      iconBg: "bg-emerald-50 dark:bg-emerald-900/20",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      valueColor: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "Inactive",
      value: inactive,
      icon: XCircle,
      iconBg: "bg-red-50 dark:bg-red-900/20",
      iconColor: "text-red-600 dark:text-red-400",
      valueColor: "text-red-600 dark:text-red-400",
    },
    {
      label: "Total Credits",
      value: totalCredits,
      icon: Award,
      iconBg: "bg-amber-50 dark:bg-amber-900/20",
      iconColor: "text-amber-600 dark:text-amber-400",
      valueColor: "text-amber-600 dark:text-amber-400",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, index) => (
        <div key={index} className="card-premium-hover p-2">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {stat.label}
                  </p>
                  {loading ? (
                    <div className="h-9 w-20 bg-slate-200 dark:bg-slate-700 animate-pulse rounded mt-1" />
                  ) : (
                    <p
                      className={`text-3xl font-bold mt-1 font-grotesk ${stat.valueColor}`}
                      aria-label={`${stat.label}: ${stat.value}`}
                    >
                      {stat.value}
                    </p>
                  )}
                </div>
                <div
                  className={`h-12 w-12 rounded-xl flex items-center justify-center ${stat.iconBg}`}
                  aria-hidden="true"
                >
                  <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  )
}
```

## Extended Version with 6 Cards

For pages that need more metrics:

```tsx
const stats: StatConfig[] = [
  {
    label: "Total Courses",
    value: total,
    icon: BookOpen,
    iconBg: "bg-blue-50 dark:bg-blue-900/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    valueColor: "text-slate-900 dark:text-slate-100",
  },
  {
    label: "Active",
    value: active,
    icon: CheckCircle,
    iconBg: "bg-emerald-50 dark:bg-emerald-900/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    valueColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Inactive",
    value: inactive,
    icon: XCircle,
    iconBg: "bg-red-50 dark:bg-red-900/20",
    iconColor: "text-red-600 dark:text-red-400",
    valueColor: "text-red-600 dark:text-red-400",
  },
  {
    label: "Theory",
    value: theoryCount,
    icon: FileText,
    iconBg: "bg-indigo-50 dark:bg-indigo-900/20",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    valueColor: "text-indigo-600 dark:text-indigo-400",
  },
  {
    label: "Practical",
    value: practicalCount,
    icon: FlaskConical,
    iconBg: "bg-orange-50 dark:bg-orange-900/20",
    iconColor: "text-orange-600 dark:text-orange-400",
    valueColor: "text-orange-600 dark:text-orange-400",
  },
  {
    label: "New This Month",
    value: newThisMonth,
    icon: TrendingUp,
    iconBg: "bg-purple-50 dark:bg-purple-900/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    valueColor: "text-purple-600 dark:text-purple-400",
  },
]

// Use 3-column grid for 6 cards
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
```

## Student Stats Example

```tsx
const stats: StatConfig[] = [
  {
    label: "Total Students",
    value: total,
    icon: Users,
    iconBg: "bg-blue-50 dark:bg-blue-900/20",
    iconColor: "text-blue-600 dark:text-blue-400",
    valueColor: "text-slate-900 dark:text-slate-100",
  },
  {
    label: "Active",
    value: active,
    icon: UserCheck,
    iconBg: "bg-emerald-50 dark:bg-emerald-900/20",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    valueColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    label: "Inactive",
    value: inactive,
    icon: UserX,
    iconBg: "bg-red-50 dark:bg-red-900/20",
    iconColor: "text-red-600 dark:text-red-400",
    valueColor: "text-red-600 dark:text-red-400",
  },
  {
    label: "Enrolled This Year",
    value: enrolledThisYear,
    icon: GraduationCap,
    iconBg: "bg-purple-50 dark:bg-purple-900/20",
    iconColor: "text-purple-600 dark:text-purple-400",
    valueColor: "text-purple-600 dark:text-purple-400",
  },
]
```

## Usage Pattern

```tsx
// In your page component
import { PremiumCourseStats } from "@/components/stats/premium-course-stats"

export default function CoursesPage() {
  const [items, setItems] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch data...

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <PageTransition>
          <div className="flex flex-1 flex-col gap-3 p-4 pt-0">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
              <Breadcrumb>...</Breadcrumb>
            </div>

            {/* Premium Stats - Always show before data table */}
            <PremiumCourseStats items={items} loading={loading} />

            {/* Data Table Card */}
            <Card className="flex-1 flex flex-col min-h-0">
              {/* Table content */}
            </Card>
          </div>
        </PageTransition>
        <AppFooter />
      </SidebarInset>
    </SidebarProvider>
  )
}
```

## CSS Hover Effect

Add to `globals.css`:

```css
.card-premium-hover {
  transition: transform 0.2s ease-in-out;
}

.card-premium-hover:hover {
  transform: translateY(-2px);
}
```

This creates a subtle lift effect on hover for the stat cards.
