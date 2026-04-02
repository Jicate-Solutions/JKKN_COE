"use client"

import { Fragment, useMemo, useState, useEffect, useRef } from "react"
import XLSX from "@/lib/utils/excel-compat"
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import supabaseAuthService from "@/services/auth/supabase-auth-service"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/common/use-toast"
import Link from "next/link"
import { PlusCircle, Edit, Trash2, Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, Calendar, TrendingUp, FileSpreadsheet, RefreshCw, CheckCircle, XCircle, AlertTriangle, CalendarCheck, Sparkles, FileDown, FileText, ShieldCheck } from "lucide-react"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { useSessionSync } from '@/hooks/use-session-sync'

// Import types from module
import type {
	ExamTimetable,
	CourseGroup,
	PracticalSlot,
	ExaminationSession,
	Program,
	Semester,
	Institution,
	Board,
	SortFormat,
} from '@/types/exam_timetable'

// Import service functions
import {
	fetchInstitutions as fetchInstitutionsService,
	fetchExaminationSessions as fetchExaminationSessionsService,
	fetchPrograms as fetchProgramsService,
	fetchSemesters as fetchSemestersService,
	fetchBoards as fetchBoardsService,
	fetchExamTimetables as fetchExamTimetablesService,
	fetchCourseOfferings,
	fetchExamRegistrations
} from '@/services/exam-management/exam_timetable-service'

// Import validation dialog
import { ValidateTimetableDialog } from '@/components/exam-management/validate-timetable-dialog'
import type { ValidationResult } from '@/types/validate-timetable'

// Import export functions
import {
	exportToJSON,
	exportToExcel,
	exportToPDF,
	exportTemplate
} from '@/lib/utils/exam_timetable/export-import'

export default function ExamTimetablePage() {
  const { toast } = useToast()

  // Institution filter hook
  const {
    isReady,
    mustSelectInstitution,
    shouldFilter,
    institutionId,
    institutionCode: contextInstitutionCode,
    getInstitutionCodeForCreate
  } = useInstitutionFilter()

  const [items, setItems] = useState<ExamTimetable[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const [sheetOpen, setSheetOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState("all")

  // Dropdown data
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [examinationSessions, setExaminationSessions] = useState<ExaminationSession[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [semesters, setSemesters] = useState<Semester[]>([])

  // Parent section filters
  const [selectedInstitutionCode, setSelectedInstitutionCode] = useState<string>("")
  const { selectedSessionId, setSelectedSessionId, mustSelectSession } = useSessionSync()
  const [selectedProgramType, setSelectedProgramType] = useState<string>("")
  const [selectedProgramId, setSelectedProgramId] = useState<string>("")
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>("")

  // Child section data
  const [generatedLoading, setGeneratedLoading] = useState(false)

  // New grouped state
  const [courseGroups, setCourseGroups] = useState<CourseGroup[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [sortFormat, setSortFormat] = useState<SortFormat>('program-wise')
  const [filterProgram, setFilterProgram] = useState<string>('')
  const [filterBoard, setFilterBoard] = useState<string>('')
  const [filterCategory, setFilterCategory] = useState<string>('')

  // Validation
  const [validateDialogOpen, setValidateDialogOpen] = useState(false)
  const [lastValidationResult, setLastValidationResult] = useState<ValidationResult | null>(null)

  // Ref to track component mount state
  const isMountedRef = useRef(false)

  // Fetch institutions
  const fetchInstitutions = async () => {
    try {
      const data = await fetchInstitutionsService()
      if (isMountedRef.current) {
        setInstitutions(data)
      }
    } catch (error) {
      console.error('Failed to fetch institutions:', error)
    }
  }

  // Fetch examination sessions
  const fetchExaminationSessions = async () => {
    try {
      const data = await fetchExaminationSessionsService()
      if (isMountedRef.current) {
        setExaminationSessions(data)
      }
    } catch (error) {
      console.error('Failed to fetch examination sessions:', error)
    }
  }

  // Fetch programs
  const fetchPrograms = async () => {
    try {
      const data = await fetchProgramsService()
      if (isMountedRef.current) {
        setPrograms(data)
      }
    } catch (error) {
      console.error('Failed to fetch programs:', error)
    }
  }

  // Fetch semesters
  const fetchSemesters = async () => {
    try {
      const data = await fetchSemestersService()
      if (isMountedRef.current) {
        setSemesters(data)
      }
    } catch (error) {
      console.error('Failed to fetch semesters:', error)
    }
  }

  // Fetch boards
  const fetchBoardsData = async () => {
    try {
      const data = await fetchBoardsService(selectedInstitutionCode || undefined)
      if (isMountedRef.current) {
        setBoards(data)
      }
    } catch (error) {
      console.error('Failed to fetch boards:', error)
    }
  }

  // Fetch exam timetables from API
  const fetchExamTimetables = async () => {
    try {
      if (isMountedRef.current) {
        setLoading(true)
      }
      const data = await fetchExamTimetablesService()
      if (isMountedRef.current) {
        setItems(data)
      }
    } catch (error) {
      console.error('Error fetching exam timetables:', error)
      if (isMountedRef.current) {
        setItems([])
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }

  // Load data when institution context is ready
  useEffect(() => {
    isMountedRef.current = true
    if (!isReady) return
    fetchExamTimetables()
    fetchInstitutions()
    fetchExaminationSessions()
    fetchPrograms()
    fetchSemesters()
    fetchBoardsData()

    return () => {
      isMountedRef.current = false
    }
  }, [isReady])

  // Auto-select institution from global context when not "All Institutions"
  useEffect(() => {
    if (isReady && !mustSelectInstitution && contextInstitutionCode) {
      setSelectedInstitutionCode(contextInstitutionCode)
    }
  }, [isReady, mustSelectInstitution, contextInstitutionCode])

  // Cascading filters following the order: Institution Code → Session Name → Program Type → Program → Semester

  // 1. Filter examination sessions by selected institution code
  const filteredSessions = useMemo(() => {
    if (!selectedInstitutionCode) return examinationSessions
    // Examination sessions are typically institution-wide, so return all
    return examinationSessions
  }, [examinationSessions, selectedInstitutionCode])

  // 2. Filter programs by selected institution code
  const filteredProgramsByInstitution = useMemo(() => {
    if (!selectedInstitutionCode) return programs
    return programs.filter(p => p.institution_code === selectedInstitutionCode)
  }, [programs, selectedInstitutionCode])

  // 3. Get unique program types from filtered programs (by institution)
  const programTypes = useMemo(() => {
    const types = new Set(filteredProgramsByInstitution.map(p => p.program_type))
    return Array.from(types)
  }, [filteredProgramsByInstitution])

  // 4. Filter programs by program type (from already filtered programs by institution)
  const filteredProgramsByType = useMemo(() => {
    if (!selectedProgramType) return filteredProgramsByInstitution
    return filteredProgramsByInstitution.filter(p => p.program_type === selectedProgramType)
  }, [filteredProgramsByInstitution, selectedProgramType])

  // 5. Filter semesters - Remove duplicates based on semester_code or semester_name
  const filteredSemesters = useMemo(() => {
    // Remove duplicates based on semester_code (primary) or semester_name (fallback)
    const uniqueSemesters = new Map<string, Semester>()

    semesters.forEach(semester => {
      const key = semester.semester_code || semester.semester_name
      if (!uniqueSemesters.has(key)) {
        uniqueSemesters.set(key, semester)
      }
    })

    let semesterList = Array.from(uniqueSemesters.values())

    // Filter semesters based on selected program's duration
    if (selectedProgramId) {
      const selectedProgram = programs.find(p => p.id === selectedProgramId)
      if (selectedProgram && selectedProgram.duration_years) {
        // Calculate max semesters based on program duration
        const maxSemesters = selectedProgram.duration_years * 2 // 2 semesters per year

        // Filter semesters to show only those within the program's duration
        semesterList = semesterList.filter(semester => {
          // Extract semester number from semester_name (e.g., "Semester 1" -> 1)
          const semesterMatch = semester.semester_name.match(/\d+/)
          if (semesterMatch) {
            const semesterNumber = parseInt(semesterMatch[0])
            return semesterNumber <= maxSemesters
          }
          return true // If no number found, include it
        })
      }
    }

    // Sort by semester_code or semester_name
    return semesterList.sort((a, b) => {
      const aValue = a.semester_code || a.semester_name
      const bValue = b.semester_code || b.semester_name
      return aValue.localeCompare(bValue)
    })
  }, [semesters, selectedProgramId, programs])

	// Sorted + filtered course groups
	const sortedGroups = useMemo(() => {
		let filtered = [...courseGroups]

		if (sortFormat === 'program-wise' && filterProgram) {
			filtered = filtered.filter(g => g.program_codes.includes(filterProgram))
		}
		if (sortFormat === 'board-wise' && filterBoard) {
			filtered = filtered.filter(g => g.board_code === filterBoard)
		}
		if (filterCategory) {
			filtered = filtered.filter(g => g.course_category === filterCategory)
		}

		if (sortFormat === 'program-wise') {
			return filtered.sort((a, b) => {
				const progDiff = (a.program_order || 999) - (b.program_order || 999)
				if (progDiff !== 0) return progDiff
				const semDiff = (a.semester || 0) - (b.semester || 0)
				if (semDiff !== 0) return semDiff
				return a.course_code.localeCompare(b.course_code)
			})
		} else {
			return filtered.sort((a, b) => {
				const boardDiff = (a.board_order ?? 999) - (b.board_order ?? 999)
				if (boardDiff !== 0) return boardDiff
				return a.course_code.localeCompare(b.course_code)
			})
		}
	}, [courseGroups, sortFormat, filterProgram, filterBoard, filterCategory])

	const availableBoards = useMemo(() => {
		const m = new Map<string, string>()
		courseGroups.forEach(g => { if (g.board_code && g.board_name) m.set(g.board_code, g.board_name) })
		return Array.from(m.entries()).map(([code, name]) => ({ code, name }))
	}, [courseGroups])

	const availableGroupPrograms = useMemo(() => {
		const m = new Map<string, string>()
		courseGroups.forEach(g => {
			g.program_codes.forEach((code, i) => { if (code) m.set(code, g.program_names[i] || code) })
		})
		return Array.from(m.entries()).map(([code, name]) => ({ code, name }))
	}, [courseGroups])

	const availableCategories = useMemo(() => {
		const s = new Set<string>()
		courseGroups.forEach(g => { if (g.course_category) s.add(g.course_category) })
		return Array.from(s).sort()
	}, [courseGroups])

  // Handle institution code change - reset all dependent selections
  const handleInstitutionChange = (value: string) => {
    setSelectedInstitutionCode(value)
    setSelectedSessionId("")
    setSelectedProgramType("")
    setSelectedProgramId("")
    setSelectedSemesterId("")
  }

  // Handle session change - reset dependent selections
  const handleSessionChange = (value: string) => {
    setSelectedSessionId(value === "ALL" ? "" : value)
    // Session doesn't affect other dropdowns, so no resets needed
  }

  // Handle program type change - reset dependent selections
  const handleProgramTypeChange = (value: string) => {
    setSelectedProgramType(value === "ALL" ? "" : value)
    setSelectedProgramId("")
    setSelectedSemesterId("")
  }

  // Handle program change - reset dependent selections
  const handleProgramChange = (value: string) => {
    setSelectedProgramId(value === "ALL" ? "" : value)
    setSelectedSemesterId("")
  }

	// Auto-save a single course group (theory) - saves to ALL course_offerings in the group
	const autoSaveGroup = async (group: CourseGroup) => {
		if (!group.exam_date) return
		const selectedInstitution = institutions.find(i => i.institution_code === selectedInstitutionCode)
		if (!selectedInstitution || !selectedSessionId) return

		setCourseGroups(prev => prev.map(g =>
			g.course_code === group.course_code
				? { ...g, saving: true, saveStatus: 'saving' as const, saveError: null }
				: g
		))

		try {
			const results = await Promise.all(
				group.course_offering_ids.map(async (offeringId, idx) => {
					const existingId = group.existing_timetable_ids[idx] || null
					const payload: any = {
						institutions_id: selectedInstitution.id,
						examination_session_id: selectedSessionId,
						course_offering_id: offeringId,
						course_code: group.course_code,
						exam_date: group.exam_date,
						session: group.session,
						exam_time: group.exam_time,
						duration_minutes: group.duration_minutes,
						exam_mode: 'Offline',
						is_published: group.is_published,
						instructions: group.instructions || null,
					}
					if (existingId) payload.id = existingId

					const method = existingId ? 'PUT' : 'POST'
					const res = await fetch('/api/exam-management/exam-timetables', {
						method,
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload),
					})
					if (!res.ok) {
						const err = await res.json().catch(() => ({}))
						throw new Error(err.error || 'Save failed')
					}
					return res.json()
				})
			)

			setCourseGroups(prev => prev.map(g => {
				if (g.course_code !== group.course_code) return g
				return {
					...g,
					existing_timetable_ids: results.map((r: any) => r.id),
					saving: false,
					saveStatus: 'saved' as const,
					saveError: null,
				}
			}))
			setTimeout(() => {
				setCourseGroups(prev => prev.map(g =>
					g.course_code === group.course_code && g.saveStatus === 'saved'
						? { ...g, saveStatus: 'idle' as const }
						: g
				))
			}, 2000)
		} catch (error: any) {
			setCourseGroups(prev => prev.map(g =>
				g.course_code === group.course_code
					? { ...g, saving: false, saveStatus: 'error' as const, saveError: error.message }
					: g
			))
		}
	}

	// Handle field change on a course group + trigger auto-save
	const handleGroupFieldChange = (courseCode: string, field: keyof CourseGroup, value: any) => {
		// Block publish if validation has issues
		if (field === 'is_published' && value === true) {
			if (!lastValidationResult) {
				toast({
					title: '⚠️ Validation Required',
					description: 'Please run "Validate" before publishing. Click the Validate button to check for conflicts.',
					variant: 'destructive',
				})
				return
			}
			if (lastValidationResult.summary.errors_count > 0 || lastValidationResult.summary.warnings_count > 0) {
				toast({
					title: '❌ Cannot Publish',
					description: `${lastValidationResult.summary.errors_count} error(s) and ${lastValidationResult.summary.warnings_count} warning(s) must be resolved before publishing.`,
					variant: 'destructive',
				})
				return
			}
		}

		const saveableFields: (keyof CourseGroup)[] = ['exam_date', 'session', 'exam_time', 'duration_minutes', 'is_published', 'instructions']
		const shouldSave = saveableFields.includes(field)

		setCourseGroups(prev => {
			const updated = prev.map(g =>
				g.course_code === courseCode ? { ...g, [field]: value } : g
			)
			if (shouldSave) {
				const group = updated.find(g => g.course_code === courseCode)
				if (group && group.exam_date) {
					setTimeout(() => autoSaveGroup(group), 0)
				}
			}
			return updated
		})
	}

	// Auto-save a single practical slot (accepts group+slot to avoid stale closure)
	const autoSaveSlot = async (courseCode: string, slotIndex: number, groupData?: CourseGroup) => {
		const group = groupData || courseGroups.find(g => g.course_code === courseCode)
		if (!group?.slots[slotIndex]?.exam_date) return
		const slot = group.slots[slotIndex]
		const selectedInstitution = institutions.find(i => i.institution_code === selectedInstitutionCode)
		if (!selectedInstitution || !selectedSessionId) return

		setCourseGroups(prev => prev.map(g => {
			if (g.course_code !== courseCode) return g
			const s = [...g.slots]
			s[slotIndex] = { ...s[slotIndex], saving: true, saveStatus: 'saving' as const }
			return { ...g, slots: s }
		}))

		try {
			const offeringId = group.course_offering_ids[0]
			const payload: any = {
				institutions_id: selectedInstitution.id,
				examination_session_id: selectedSessionId,
				course_offering_id: offeringId,
				course_code: group.course_code,
				exam_date: slot.exam_date,
				session: slot.session,
				exam_time: slot.exam_time,
				duration_minutes: slot.duration_minutes,
				exam_mode: 'Offline',
				is_published: slot.is_published,
				instructions: slot.instructions || null,
				exam_type: /project/i.test(group.course_type) ? 'Project' : /field.work/i.test(group.course_type) ? 'Field Work' : /group.project/i.test(group.course_type) ? 'Group Project' : 'Practical',
				batch_capacity: slot.batch_capacity,
			}
			if (slot.existing_timetable_id) payload.id = slot.existing_timetable_id

			const method = slot.existing_timetable_id ? 'PUT' : 'POST'
			const res = await fetch('/api/exam-management/exam-timetables', {
				method,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
			})
			if (!res.ok) {
				const err = await res.json().catch(() => ({}))
				throw new Error(err.error || 'Save failed')
			}
			const result = await res.json()

			setCourseGroups(prev => prev.map(g => {
				if (g.course_code !== courseCode) return g
				const s = [...g.slots]
				s[slotIndex] = {
					...s[slotIndex],
					existing_timetable_id: result.id,
					saving: false,
					saveStatus: 'saved' as const,
					saveError: null,
				}
				return { ...g, slots: s }
			}))
			setTimeout(() => {
				setCourseGroups(prev => prev.map(g => {
					if (g.course_code !== courseCode) return g
					const s = [...g.slots]
					if (s[slotIndex]?.saveStatus === 'saved') {
						s[slotIndex] = { ...s[slotIndex], saveStatus: 'idle' as const }
					}
					return { ...g, slots: s }
				}))
			}, 2000)
		} catch (error: any) {
			setCourseGroups(prev => prev.map(g => {
				if (g.course_code !== courseCode) return g
				const s = [...g.slots]
				s[slotIndex] = {
					...s[slotIndex],
					saving: false,
					saveStatus: 'error' as const,
					saveError: error.message,
				}
				return { ...g, slots: s }
			}))
		}
	}

	// Handle slot field change + trigger auto-save
	const handleSlotFieldChange = (courseCode: string, slotIndex: number, field: keyof PracticalSlot, value: any) => {
		const saveableFields: (keyof PracticalSlot)[] = ['exam_date', 'session', 'exam_time', 'duration_minutes', 'batch_capacity', 'is_published']
		const shouldSave = saveableFields.includes(field)

		setCourseGroups(prev => {
			const updated = prev.map(g => {
				if (g.course_code !== courseCode) return g
				const s = [...g.slots]
				s[slotIndex] = { ...s[slotIndex], [field]: value }
				return { ...g, slots: s }
			})
			if (shouldSave) {
				const group = updated.find(g => g.course_code === courseCode)
				if (group?.slots[slotIndex]?.exam_date) {
					setTimeout(() => autoSaveSlot(courseCode, slotIndex, group), 0)
				}
			}
			return updated
		})
	}

	// Add a new empty practical slot
	const addPracticalSlot = (courseCode: string) => {
		setCourseGroups(prev => prev.map(g => {
			if (g.course_code !== courseCode) return g
			return {
				...g,
				expanded: true,
				slots: [...g.slots, {
					id: `new-${Date.now()}`,
					existing_timetable_id: null,
					exam_date: '',
					session: 'FN',
					exam_time: '10:00',
					duration_minutes: 180,
					batch_capacity: null,
					is_published: false,
					instructions: '',
					saving: false,
					saveStatus: 'idle' as const,
					saveError: null,
				}],
			}
		}))
	}

	// Remove a practical slot (deletes from DB if saved)
	const removePracticalSlot = async (courseCode: string, slotIndex: number) => {
		const group = courseGroups.find(g => g.course_code === courseCode)
		if (!group) return
		const slot = group.slots[slotIndex]
		if (slot.existing_timetable_id) {
			try {
				await fetch(`/api/exam-management/exam-timetables?id=${slot.existing_timetable_id}`, { method: 'DELETE' })
			} catch (e) {
				console.error('Failed to delete slot:', e)
			}
		}
		setCourseGroups(prev => prev.map(g => {
			if (g.course_code !== courseCode) return g
			return { ...g, slots: g.slots.filter((_, i) => i !== slotIndex) }
		}))
	}

	// Toggle expand for practical rows
	const toggleExpand = (courseCode: string) => {
		setCourseGroups(prev => prev.map(g =>
			g.course_code === courseCode ? { ...g, expanded: !g.expanded } : g
		))
	}

  // Generate courses based on selected filters (dynamic combinations)
  const handleGenerate = async () => {
    // Reset validation result when regenerating
    setLastValidationResult(null)

    // Validation: At minimum, Institution Code is required
    if (!selectedInstitutionCode) {
      toast({
        title: "⚠️ Validation Error",
        description: "Please select an Institution Code to generate courses.",
        variant: "destructive",
        className: "bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200",
      })
      return
    }

    try {
      if (isMountedRef.current) {
        setGeneratedLoading(true)
      }

      // Build query parameters dynamically based on selected filters
      const params = new URLSearchParams()

      // Get institution ID from institution code
      const selectedInstitution = institutions.find(inst => inst.institution_code === selectedInstitutionCode)
      if (!selectedInstitution) {
        toast({
          title: "❌ Error",
          description: "Invalid institution selected.",
          variant: "destructive",
        })
        if (isMountedRef.current) {
          setGeneratedLoading(false)
        }
        return
      }
      params.append('institutions_id', selectedInstitution.id)

      // Add optional filters if selected
      if (selectedSessionId) params.append('examination_session_id', selectedSessionId)
      if (selectedProgramId) params.append('program_id', selectedProgramId)

      // Note: Semester filtering is done client-side using course_semester_name
      // from the joined course_mapping + semesters data

      // Determine filter combination for user feedback
      let filterCombination = 'Institution Code'
      if (selectedSessionId) filterCombination += ' + Session'
      if (selectedProgramType) filterCombination += ' + Program Type'
      if (selectedProgramId) filterCombination += ' + Program'
      if (selectedSemesterId) filterCombination += ' + Semester'

      // Fetch course offerings
      const courseOfferingsResponse = await fetch(`/api/course-management/course-offering?${params.toString()}`)
      if (!courseOfferingsResponse.ok) {
        throw new Error('Failed to fetch course offerings')
      }
      let courseOfferings = await courseOfferingsResponse.json()

      // Client-side filter by program_type if selected (API doesn't support this filter)
      if (selectedProgramType) {
        courseOfferings = courseOfferings.filter((offering: any) => {
          const program = programs.find(p => p.id === offering.program_id)
          return program && program.program_type === selectedProgramType
        })
      }

      // Client-side filter by semester_name if specific semester is selected
      // This uses the course_semester_name from course_mapping joined with semesters table
      if (selectedSemesterId) {
        const selectedSemester = semesters.find(s => s.id === selectedSemesterId)
        if (selectedSemester) {
          courseOfferings = courseOfferings.filter((offering: any) => {
            // Match against course_semester_name from the joined data
            return offering.course_semester_name === selectedSemester.semester_name
          })
        }
      }
      // When "All Semesters" is selected, show all courses (no additional filtering)

      // Fetch exam registrations for student counts (only if session is selected)
      let registrations: any[] = []
      if (selectedSessionId) {
        const registrationsResponse = await fetch(
          `/api/exam-management/exam-registrations?examination_session_id=${selectedSessionId}&institutions_id=${selectedInstitution.id}`
        )
        if (registrationsResponse.ok) {
          const regData = await registrationsResponse.json()
          registrations = Array.isArray(regData) ? regData : (regData.data || [])
        }
      }
      console.log('📊 Registrations fetched:', registrations.length, 'for session:', selectedSessionId, 'institution:', selectedInstitution.id)

      // Fetch existing timetables (only if session is selected)
      let existingTimetables: any[] = []
      if (selectedSessionId) {
        const timetablesResponse = await fetch(`/api/exam-management/exam-timetables?examination_session_id=${selectedSessionId}`)
        if (timetablesResponse.ok) {
          existingTimetables = await timetablesResponse.json()
        }
      }

      // Create a map of existing timetables by course_offering_id (array per offering for multi-slot)
      const timetableMap = new Map<string, ExamTimetable[]>()
      existingTimetables.forEach((tt: ExamTimetable) => {
        const key = tt.course_offering_id
        if (!timetableMap.has(key)) {
          timetableMap.set(key, [])
        }
        timetableMap.get(key)!.push(tt)
      })

      // Group offerings by course_code for enhanced view
      const groupMap = new Map<string, CourseGroup>()

      courseOfferings.forEach((offering: any) => {
        const code = offering.course_code || 'UNKNOWN'
        const programName = offering.programs?.program_name || offering.program_name || 'N/A'
        const programCode = offering.programs?.program_code || offering.program_code || ''
        const progOrder = offering.programs?.program_order ?? offering.programs?.display_order ?? 999
        const sem = offering.course_semester_number || offering.semester || 0

        const regularCount = registrations.filter((reg: any) =>
          reg.course_offering_id === offering.id && reg.exam_type === 'regular'
        ).length
        const arrearCount = registrations.filter((reg: any) =>
          reg.course_offering_id === offering.id && reg.exam_type === 'arrear'
        ).length

        const allTimetablesForOffering = timetableMap.get(offering.id) || []
        const courseType = offering.course_type || ''
        const courseCategory = offering.course_category || ''
        const isMultiSlot = /practical|project|field.work/i.test(courseType)

        // Theory: pick only the latest timetable per offering (avoid duplicates)
        // Practical: use all timetable entries (each is a batch/slot)
        const latestTimetable = allTimetablesForOffering.length > 0
          ? allTimetablesForOffering.reduce((latest, tt) =>
              new Date(tt.created_at || 0) > new Date(latest.created_at || 0) ? tt : latest
            )
          : null

        if (groupMap.has(code)) {
          const group = groupMap.get(code)!
          if (!group.program_names.includes(programName)) {
            group.program_names.push(programName)
            group.program_codes.push(programCode)
          }
          group.course_offering_ids.push(offering.id)
          group.regular_count += regularCount
          group.arrear_count += arrearCount
          group.program_order = Math.min(group.program_order, progOrder)

          if (group.is_multi_slot) {
            // Practical: add ALL timetable entries as slots
            allTimetablesForOffering.forEach(tt => {
              group.existing_timetable_ids.push(tt.id)
              group.slots.push({
                id: tt.id,
                existing_timetable_id: tt.id,
                exam_date: tt.exam_date || '',
                session: tt.session || 'FN',
                exam_time: tt.exam_time || '10:00',
                duration_minutes: tt.duration_minutes || 180,
                batch_capacity: tt.batch_capacity || null,
                is_published: tt.is_published || false,
                instructions: tt.instructions || '',
                saving: false, saveStatus: 'idle', saveError: null,
              })
            })
          } else {
            // Theory: push exactly ONE timetable ID per offering (keeps index aligned with course_offering_ids)
            group.existing_timetable_ids.push(latestTimetable?.id || '')
            if (!group.exam_date && latestTimetable?.exam_date) {
              group.exam_date = latestTimetable.exam_date
              group.session = latestTimetable.session || 'FN'
              group.exam_time = latestTimetable.exam_time || '10:00'
              group.duration_minutes = latestTimetable.duration_minutes || 180
              group.is_published = latestTimetable.is_published || false
              group.instructions = latestTimetable.instructions || ''
            }
          }
        } else {
          const slots: PracticalSlot[] = []
          if (isMultiSlot && allTimetablesForOffering.length > 0) {
            allTimetablesForOffering.forEach(tt => {
              slots.push({
                id: tt.id,
                existing_timetable_id: tt.id,
                exam_date: tt.exam_date || '',
                session: tt.session || 'FN',
                exam_time: tt.exam_time || '10:00',
                duration_minutes: tt.duration_minutes || 180,
                batch_capacity: tt.batch_capacity || null,
                is_published: tt.is_published || false,
                instructions: tt.instructions || '',
                saving: false, saveStatus: 'idle', saveError: null,
              })
            })
          }

          groupMap.set(code, {
            course_code: code,
            course_title: offering.course_title || offering.course_name || 'N/A',
            course_type: courseType,
            course_category: courseCategory,
            board_code: offering.board_code || null,
            board_name: offering.board_name || null,
            board_order: offering.board_order ?? null,
            program_names: [programName],
            program_codes: [programCode],
            program_order: progOrder,
            semester: sem,
            regular_count: regularCount,
            arrear_count: arrearCount,
            course_offering_ids: [offering.id],
            existing_timetable_ids: isMultiSlot
              ? allTimetablesForOffering.map(tt => tt.id)
              : [latestTimetable?.id || ''],
            is_multi_slot: isMultiSlot,
            exam_date: latestTimetable?.exam_date || '',
            session: latestTimetable?.session || 'FN',
            exam_time: latestTimetable?.exam_time || '10:00',
            duration_minutes: latestTimetable?.duration_minutes || 180,
            is_published: latestTimetable?.is_published || false,
            instructions: latestTimetable?.instructions || '',
            slots,
            saving: false, saveStatus: 'idle', saveError: null, expanded: false,
          })
        }
      })

      const groups = Array.from(groupMap.values())
      if (isMountedRef.current) {
        setCourseGroups(groups)
      }

      // Build filter description for toast
      const selectedSemesterName = selectedSemesterId
        ? semesters.find(s => s.id === selectedSemesterId)?.semester_name
        : null

      const filterDescription = selectedSemesterName
        ? `${filterCombination} - ${selectedSemesterName}`
        : filterCombination

      toast({
        title: "✅ Courses Generated",
        description: `Successfully loaded ${groups.length} grouped course${groups.length !== 1 ? 's' : ''} (${filterDescription}).`,
        className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        duration: 5000,
      })
    } catch (error) {
      console.error('Error generating courses:', error)
      toast({
        title: "❌ Generation Failed",
        description: "Failed to generate course list. Please try again.",
        variant: "destructive",
        className: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200",
      })
    } finally {
      if (isMountedRef.current) {
        setGeneratedLoading(false)
      }
    }
  }

  // Convert courseGroups to flat export-friendly format
  const getExportData = () => {
    return sortedGroups.flatMap(group => {
      if (group.is_multi_slot) {
        return group.slots.map((slot, i) => ({
          course_code: group.course_code,
          course_title: group.course_title,
          program_name: group.program_names.join(', '),
          regular_count: i === 0 ? group.regular_count : 0,
          arrear_count: i === 0 ? group.arrear_count : 0,
          exam_date: slot.exam_date,
          session: slot.session,
          exam_time: slot.exam_time,
          duration_minutes: slot.duration_minutes,
          is_published: slot.is_published,
          instructions: slot.instructions,
          batch_capacity: slot.batch_capacity,
        }))
      }
      return [{
        course_code: group.course_code,
        course_title: group.course_title,
        program_name: group.program_names.join(', '),
        regular_count: group.regular_count,
        arrear_count: group.arrear_count,
        exam_date: group.exam_date,
        session: group.session,
        exam_time: group.exam_time,
        duration_minutes: group.duration_minutes,
        is_published: group.is_published,
        instructions: group.instructions,
      }]
    })
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
  }

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase()
    const data = items
      .filter((i: any) =>
        statusFilter === "all" ||
        (statusFilter === "published" ? i.is_published : !i.is_published)
      )

    if (!sortColumn) return data
    const sorted = [...data].sort((a: any, b: any) => {
      const av = (a as any)[sortColumn]
      const bv = (b as any)[sortColumn]
      if (av === bv) return 0
      if (sortDirection === "asc") return av > bv ? 1 : -1
      return av < bv ? 1 : -1
    })
    return sorted
  }, [items, searchTerm, sortColumn, sortDirection, statusFilter])

  const pageSizeOptions = useMemo(() => {
    const allSizes = [10, 20, 50, 100, 250, 500, 1000]
    const total = filtered.length
    const options = allSizes.filter(s => s < total)
    if (!options.includes(10)) options.unshift(10)
    if (total > 10) options.push(total)
    return options
  }, [filtered.length])

  const isShowAll = itemsPerPage >= filtered.length
  const effectivePerPage = isShowAll ? filtered.length || 1 : itemsPerPage
  const totalPages = Math.ceil(filtered.length / effectivePerPage) || 1
  const startIndex = (currentPage - 1) * effectivePerPage
  const endIndex = startIndex + effectivePerPage
  const pageItems = filtered.slice(startIndex, endIndex)

  useEffect(() => setCurrentPage(1), [searchTerm, sortColumn, sortDirection])

  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
  const formatTime = (t: string) => {
    const [hours, minutes] = t.split(':')
    return `${hours}:${minutes}`
  }

  // Export to JSON
  const handleDownloadJSON = () => {
    const data = getExportData()
    if (data.length === 0) {
      toast({ title: "⚠️ No Data", description: "Please generate courses first before exporting.", variant: "destructive" })
      return
    }
    exportToJSON(data)
    toast({ title: "✅ Export Complete", description: "Timetable data exported to JSON successfully.", className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200" })
  }

  // Export to Excel
  const handleExport = () => {
    const data = getExportData()
    if (data.length === 0) {
      toast({ title: "⚠️ No Data", description: "Please generate courses first before exporting.", variant: "destructive" })
      return
    }
    exportToExcel(data)
    toast({ title: "✅ Export Complete", description: "Timetable data exported to Excel successfully.", className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200" })
  }

  // Export to PDF
  const handleExportPDF = () => {
    const data = getExportData()
    if (data.length === 0) {
      toast({ title: "⚠️ No Data", description: "Please generate courses first before exporting.", variant: "destructive" })
      return
    }
    const selectedInstitution = institutions.find(inst => inst.institution_code === selectedInstitutionCode)
    const selectedSession = selectedSessionId ? examinationSessions.find(sess => sess.id === selectedSessionId) : undefined
    exportToPDF(data, selectedInstitution, selectedSession)
    toast({ title: "✅ Export Complete", description: "Timetable data exported to PDF successfully.", className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200" })
  }

  // Template Export with Reference Sheets
  const handleTemplateExport = () => {
    exportTemplate()

    toast({
      title: "✅ Template Downloaded",
      description: "Template file with reference sheets has been downloaded.",
      className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
    })
  }

  // Import from Excel/CSV/JSON
  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.csv,.xlsx,.xls'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        let rows: any[] = []

        if (file.name.endsWith('.json')) {
          const text = await file.text()
          rows = JSON.parse(text)
        } else if (file.name.endsWith('.csv')) {
          const text = await file.text()
          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length < 2) {
            toast({
              title: "❌ Invalid CSV File",
              description: "CSV file must have at least a header row and one data row",
              variant: "destructive",
            })
            return
          }

          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
          const dataRows = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
            const row: Record<string, string> = {}
            headers.forEach((header, index) => {
              row[header] = values[index] || ''
            })
            return row
          })

          rows = dataRows
        } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
          const data = new Uint8Array(await file.arrayBuffer())
          const wb = await XLSX.read(data)
          const ws = wb.Sheets[wb.SheetNames[0]]
          rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
        }

        if (rows.length === 0) {
          toast({
            title: "❌ No Data Found",
            description: "The file contains no data rows.",
            variant: "destructive",
          })
          return
        }

        // Update course groups with imported data and trigger auto-save
        let matchCount = 0
        for (const row of rows) {
          const code = String(row['Course Code'] || row.course_code || '').trim()
          if (!code) continue

          const group = courseGroups.find(g => g.course_code.trim() === code)
          if (!group) continue
          matchCount++

          const examDate = String(row['Exam Date'] || row.exam_date || group.exam_date)
          const session = String(row['Session (FN/AN)'] || row['Session'] || row.session || group.session)
          const examTime = String(row['Exam Time'] || row.exam_time || group.exam_time)
          const duration = parseInt(String(row['Duration (Minutes)'] || row['Duration'] || row.duration_minutes || group.duration_minutes))
          const isPublished = String(row['Published'] || row.is_published || '').toLowerCase() === 'yes' || row.is_published === true
          const instructions = String(row['Instructions'] || row.instructions || group.instructions || '')

          handleGroupFieldChange(code, 'exam_date', examDate)
          handleGroupFieldChange(code, 'session', session)
          handleGroupFieldChange(code, 'exam_time', examTime)
          handleGroupFieldChange(code, 'duration_minutes', duration)
          handleGroupFieldChange(code, 'is_published', isPublished)
          handleGroupFieldChange(code, 'instructions', instructions)
        }

        toast({
          title: "✅ Import Complete",
          description: `Successfully imported timetable data for ${matchCount} course${matchCount !== 1 ? 's' : ''}.`,
          className: "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200",
        })
      } catch (err) {
        console.error('Import error:', err)
        toast({
          title: "❌ Import Error",
          description: "Import failed. Please check your file format and try again.",
          variant: "destructive",
        })
      }
    }
    input.click()
  }

  return (
    <>
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col min-h-screen">
        <AppHeader />

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 overflow-y-auto">
          <div className="flex items-center gap-2">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/dashboard">Dashboard</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Exam Timetable</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* Scorecard Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 flex-shrink-0">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Total Entries</p>
                    <p className="text-xl font-bold">{items.length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                    <Calendar className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Published</p>
                    <p className="text-xl font-bold text-green-600">{items.filter(i => i.is_published).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <CalendarCheck className="h-3 w-3 text-green-600 dark:text-green-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Unpublished</p>
                    <p className="text-xl font-bold text-red-600">{items.filter(i => !i.is_published).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                    <XCircle className="h-3 w-3 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">This Month</p>
                    <p className="text-xl font-bold text-blue-600">{items.filter(i => {
                      const d = new Date(i.created_at)
                      const n = new Date()
                      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear()
                    }).length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                    <TrendingUp className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Unified Add & Edit Form */}
          <Card className="flex-1 flex flex-col min-h-0">
            <CardHeader className="flex-shrink-0 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Calendar className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold">
                      Exam Timetable Management
                    </h2>
                    <p className="text-xs text-muted-foreground">Generate and manage exam schedules</p>
                  </div>
                </div>
              </div>

              {/* Parent Section - Filter Controls */}
              <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded-md bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-white" />
                  </div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Filter & Generate
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
                  {/* Institution Code - Required (only shown when "All Institutions" selected globally) */}
                  {mustSelectInstitution && (
                    <div className="space-y-1">
                      <Label htmlFor="institution_code" className="text-xs font-semibold">
                        Institution Code <span className="text-red-500">*</span>
                      </Label>
                      <Select value={selectedInstitutionCode} onValueChange={handleInstitutionChange}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select Institution" />
                        </SelectTrigger>
                        <SelectContent>
                          {institutions.map(institution => (
                            <SelectItem key={institution.id} value={institution.institution_code} className="text-xs">
                              {institution.institution_code}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Session Name - Optional (filtered by institution) */}
                  {mustSelectSession && (
                  <div className="space-y-1">
                    <Label htmlFor="session_name" className="text-xs font-medium">
                      Session Name
                    </Label>
                    <Select
                      value={selectedSessionId || "ALL"}
                      onValueChange={handleSessionChange}
                      disabled={!selectedInstitutionCode}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="All Sessions" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">All Sessions</SelectItem>
                        {filteredSessions.map(session => (
                          <SelectItem key={session.id} value={session.id} className="text-xs">
                            {session.session_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  )}

                  {/* Program Type - Optional (filtered by institution) */}
                  <div className="space-y-1">
                    <Label htmlFor="program_type" className="text-xs font-medium">Program Type</Label>
                    <Select
                      value={selectedProgramType || "ALL"}
                      onValueChange={handleProgramTypeChange}
                      disabled={!selectedInstitutionCode}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">All Types</SelectItem>
                        {programTypes.map(type => (
                          <SelectItem key={type} value={type} className="text-xs">{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Program - Optional (filtered by institution + program type) */}
                  <div className="space-y-1">
                    <Label htmlFor="program" className="text-xs font-medium">Program</Label>
                    <Select
                      value={selectedProgramId || "ALL"}
                      onValueChange={handleProgramChange}
                      disabled={!selectedInstitutionCode}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="All Programs" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">All Programs</SelectItem>
                        {filteredProgramsByType.map(program => (
                          <SelectItem key={program.id} value={program.id} className="text-xs">
                            {program.program_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Semester - Optional (filtered by program duration) */}
                  <div className="space-y-1">
                    <Label htmlFor="semester" className="text-xs font-medium">
                      Semester
                      {selectedProgramId && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (filtered by program)
                        </span>
                      )}
                    </Label>
                    <Select
                      value={selectedSemesterId || "ALL"}
                      onValueChange={(value) => setSelectedSemesterId(value === "ALL" ? "" : value)}
                      disabled={!selectedInstitutionCode}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="All Semesters" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" className="text-xs">All Semesters</SelectItem>
                        {filteredSemesters.map(semester => (
                          <SelectItem key={semester.id} value={semester.id} className="text-xs">
                            {semester.semester_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Generate Button */}
                  <div className="flex items-end">
                    <Button
                      onClick={handleGenerate}
                      disabled={!selectedInstitutionCode || generatedLoading}
                      className="h-9 w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-xs"
                    >
                      {generatedLoading ? (
                        <>
                          <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3 w-3 mr-1" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Sort & Filter Controls */}
                {courseGroups.length > 0 && (
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs font-medium whitespace-nowrap">Sort by</Label>
                      <Select
                        value={sortFormat}
                        onValueChange={(value: SortFormat) => {
                          setSortFormat(value)
                          setFilterProgram('')
                          setFilterBoard('')
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="program-wise" className="text-xs">Program-wise</SelectItem>
                          <SelectItem value="board-wise" className="text-xs">Board-wise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {sortFormat === 'program-wise' && availableGroupPrograms.length > 1 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium whitespace-nowrap">Filter</Label>
                        <Select
                          value={filterProgram || 'ALL'}
                          onValueChange={(value) => setFilterProgram(value === 'ALL' ? '' : value)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[180px]">
                            <SelectValue placeholder="All Programs" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL" className="text-xs">All Programs</SelectItem>
                            {availableGroupPrograms.map(p => (
                              <SelectItem key={p.code} value={p.code} className="text-xs">{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {sortFormat === 'board-wise' && availableBoards.length > 1 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium whitespace-nowrap">Filter</Label>
                        <Select
                          value={filterBoard || 'ALL'}
                          onValueChange={(value) => setFilterBoard(value === 'ALL' ? '' : value)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[180px]">
                            <SelectValue placeholder="All Boards" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL" className="text-xs">All Boards</SelectItem>
                            {availableBoards.map(b => (
                              <SelectItem key={b.code} value={b.code} className="text-xs">{b.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {availableCategories.length > 1 && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs font-medium whitespace-nowrap">Category</Label>
                        <Select
                          value={filterCategory || 'ALL'}
                          onValueChange={(value) => setFilterCategory(value === 'ALL' ? '' : value)}
                        >
                          <SelectTrigger className="h-8 text-xs w-[160px]">
                            <SelectValue placeholder="All Categories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL" className="text-xs">All Categories</SelectItem>
                            {availableCategories.map(cat => (
                              <SelectItem key={cat} value={cat} className="text-xs">{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-4 pt-0 flex-1 flex flex-col min-h-0">
              {/* Child Section - Grouped Courses Table */}
              {sortedGroups.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
                        <CalendarCheck className="h-3 w-3 text-white" />
                      </div>
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Course Timetable Entries ({sortedGroups.length})
                      </h3>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2 h-8"
                        onClick={handleTemplateExport}
                      >
                        <FileSpreadsheet className="h-3 w-3 mr-1" />
                        Template
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2 h-8"
                        onClick={handleDownloadJSON}
                      >
                        <FileText className="h-3 w-3 mr-1" />
                        JSON
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2 h-8 bg-green-50 hover:bg-green-100 dark:bg-green-900/10 dark:hover:bg-green-900/20"
                        onClick={handleExport}
                      >
                        <FileSpreadsheet className="h-3 w-3 mr-1 text-green-600" />
                        Excel
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2 h-8 bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20"
                        onClick={handleExportPDF}
                      >
                        <FileDown className="h-3 w-3 mr-1 text-red-600" />
                        PDF
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2 h-8"
                        onClick={handleImport}
                      >
                        <FileSpreadsheet className="h-3 w-3 mr-1" />
                        Upload
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2 h-8 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/10 dark:hover:bg-blue-900/20"
                        onClick={() => setValidateDialogOpen(true)}
                        disabled={!selectedSessionId || !selectedInstitutionCode}
                      >
                        <ShieldCheck className="h-3 w-3 mr-1 text-blue-600" />
                        Validate
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-md border overflow-hidden h-[500px]">
                    <div className="h-full overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
                          <TableRow>
                            <TableHead className="w-[40px] text-xs"></TableHead>
                            <TableHead className="w-[60px] text-xs">Publish</TableHead>
                            <TableHead className="w-[110px] text-xs">Course Code</TableHead>
                            <TableHead className="w-[200px] text-xs">Course Name</TableHead>
                            <TableHead className="w-[150px] text-xs">{sortFormat === 'board-wise' ? 'Board' : 'Programs'}</TableHead>
                            <TableHead className="w-[90px] text-xs text-center">Learners R|A</TableHead>
                            <TableHead className="w-[130px] text-xs">Exam Date</TableHead>
                            <TableHead className="w-[80px] text-xs">Session</TableHead>
                            <TableHead className="w-[100px] text-xs">Time</TableHead>
                            <TableHead className="w-[90px] text-xs">Duration</TableHead>
                            <TableHead className="w-[50px] text-xs"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedGroups.map((group) => (
                            <Fragment key={group.course_code}>
                              {/* Main row */}
                              <TableRow>
                                {/* Expand */}
                                <TableCell className="text-xs p-1">
                                  {group.is_multi_slot ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => toggleExpand(group.course_code)}
                                    >
                                      <ChevronRight
                                        className={`h-3.5 w-3.5 transition-transform duration-200 ${group.expanded ? 'rotate-90' : ''}`}
                                      />
                                    </Button>
                                  ) : null}
                                </TableCell>
                                {/* Publish */}
                                <TableCell className="text-xs">
                                  <Checkbox
                                    checked={group.is_published}
                                    onCheckedChange={(checked) =>
                                      handleGroupFieldChange(group.course_code, 'is_published', checked === true)
                                    }
                                  />
                                </TableCell>
                                {/* Course Code */}
                                <TableCell className="text-xs font-medium">
                                  {group.course_code}
                                  {group.is_multi_slot && (
                                    <Badge variant="outline" className="ml-1 text-[10px]">Practical</Badge>
                                  )}
                                </TableCell>
                                {/* Course Name */}
                                <TableCell className="text-xs">{group.course_title}</TableCell>
                                {/* Programs / Board */}
                                <TableCell className="text-xs">
                                  {sortFormat === 'board-wise'
                                    ? (group.board_name || '-')
                                    : group.program_names.join(', ')}
                                </TableCell>
                                {/* Learners R|A */}
                                <TableCell className="text-xs text-center">
                                  <span className="text-green-600 font-medium">{group.regular_count}</span>
                                  {' | '}
                                  <span className="text-orange-600 font-medium">{group.arrear_count}</span>
                                </TableCell>

                                {!group.is_multi_slot ? (
                                  <>
                                    {/* Exam Date */}
                                    <TableCell>
                                      <Input
                                        type="date"
                                        value={group.exam_date}
                                        onChange={(e) => handleGroupFieldChange(group.course_code, 'exam_date', e.target.value)}
                                        className="h-8 text-xs"
                                      />
                                    </TableCell>
                                    {/* Session */}
                                    <TableCell>
                                      <Select
                                        value={group.session}
                                        onValueChange={(value) => handleGroupFieldChange(group.course_code, 'session', value)}
                                      >
                                        <SelectTrigger className="h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="FN" className="text-xs">FN</SelectItem>
                                          <SelectItem value="AN" className="text-xs">AN</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </TableCell>
                                    {/* Time */}
                                    <TableCell>
                                      <Input
                                        type="time"
                                        value={group.exam_time}
                                        onChange={(e) => handleGroupFieldChange(group.course_code, 'exam_time', e.target.value)}
                                        className="h-8 text-xs"
                                      />
                                    </TableCell>
                                    {/* Duration */}
                                    <TableCell>
                                      <Input
                                        type="number"
                                        value={group.duration_minutes}
                                        onChange={(e) => handleGroupFieldChange(group.course_code, 'duration_minutes', parseInt(e.target.value))}
                                        className="h-8 text-xs"
                                        min="0"
                                      />
                                    </TableCell>
                                  </>
                                ) : (
                                  /* Practical: span across date/session/time/duration columns */
                                  <TableCell colSpan={4} className="text-xs">
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground">
                                        {group.slots.length} slot{group.slots.length !== 1 ? 's' : ''}
                                      </span>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs px-2"
                                        onClick={() => addPracticalSlot(group.course_code)}
                                      >
                                        <PlusCircle className="h-3 w-3 mr-1" />
                                        Add Slot
                                      </Button>
                                    </div>
                                  </TableCell>
                                )}

                                {/* Status */}
                                <TableCell className="text-xs">
                                  {group.saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                                  {group.saveStatus === 'saved' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                                  {group.saveStatus === 'error' && (
                                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" title={group.saveError || 'Save failed'} />
                                  )}
                                </TableCell>
                              </TableRow>

                              {/* Expanded practical sub-rows */}
                              {group.expanded && group.is_multi_slot && group.slots.map((slot, i) => (
                                <TableRow key={`${group.course_code}-slot-${i}`} className="bg-muted/30">
                                  {/* Expand column */}
                                  <TableCell></TableCell>
                                  {/* Publish column */}
                                  <TableCell></TableCell>
                                  {/* Slot label */}
                                  <TableCell className="text-xs">
                                    <Badge variant="secondary" className="text-[10px]">Slot {i + 1}</Badge>
                                  </TableCell>
                                  {/* Batch capacity */}
                                  <TableCell className="text-xs">
                                    <Input
                                      type="number"
                                      value={slot.batch_capacity || ''}
                                      onChange={(e) => handleSlotFieldChange(group.course_code, i, 'batch_capacity', e.target.value ? parseInt(e.target.value) : null)}
                                      placeholder="Capacity"
                                      className="h-7 text-xs w-20"
                                      min="0"
                                    />
                                  </TableCell>
                                  {/* Programs column */}
                                  <TableCell></TableCell>
                                  {/* Learners column */}
                                  <TableCell></TableCell>
                                  {/* Exam Date */}
                                  <TableCell>
                                    <Input
                                      type="date"
                                      value={slot.exam_date}
                                      onChange={(e) => handleSlotFieldChange(group.course_code, i, 'exam_date', e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </TableCell>
                                  {/* Session */}
                                  <TableCell>
                                    <Select
                                      value={slot.session}
                                      onValueChange={(value) => handleSlotFieldChange(group.course_code, i, 'session', value)}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="FN" className="text-xs">FN</SelectItem>
                                        <SelectItem value="AN" className="text-xs">AN</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                  {/* Time */}
                                  <TableCell>
                                    <Input
                                      type="time"
                                      value={slot.exam_time}
                                      onChange={(e) => handleSlotFieldChange(group.course_code, i, 'exam_time', e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </TableCell>
                                  {/* Duration */}
                                  <TableCell>
                                    <Input
                                      type="number"
                                      value={slot.duration_minutes}
                                      onChange={(e) => handleSlotFieldChange(group.course_code, i, 'duration_minutes', parseInt(e.target.value))}
                                      className="h-7 text-xs"
                                      min="0"
                                    />
                                  </TableCell>
                                  {/* Delete + Status */}
                                  <TableCell className="text-xs">
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                                        onClick={() => removePracticalSlot(group.course_code, i)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                      {slot.saving && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                                      {slot.saveStatus === 'saved' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                                      {slot.saveStatus === 'error' && (
                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500" title={slot.saveError || 'Save failed'} />
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </Fragment>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}

              {/* Empty State */}
              {courseGroups.length === 0 && !generatedLoading && (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center mb-4">
                    <Calendar className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-base font-semibold mb-2">No Courses Generated</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Select an examination session and optional filters, then click "Generate" to load courses for timetable creation.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <AppFooter />
      </SidebarInset>
    </SidebarProvider>

    {/* Validation Dialog - rendered as portal, outside SidebarProvider is fine */}
    {validateDialogOpen && (
      <ValidateTimetableDialog
        open={validateDialogOpen}
        onOpenChange={setValidateDialogOpen}
        institutionsId={institutions.find(i => i.institution_code === selectedInstitutionCode)?.id || ''}
        examinationSessionId={selectedSessionId}
        onValidationComplete={setLastValidationResult}
      />
    )}
    </>
  )
}
