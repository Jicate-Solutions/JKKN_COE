"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useInstitutionFilter } from "@/hooks/use-institution-filter"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { AppFooter } from "@/components/layout/app-footer"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table"
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@/components/ui/tabs"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/common/use-toast"
import {
	Download,
	Upload,
	PlusCircle,
	Search,
	ChevronLeft,
	ChevronRight,
	Edit,
	Trash2,
	FileSpreadsheet,
	FileJson,
	RefreshCw,
	Users,
	UserCheck,
	UserX,
	TrendingUp,
	User,
	GraduationCap,
	Wallet,
	FileText,
	Phone,
	Mail,
	MapPin,
	Calendar,
	Settings,
} from "lucide-react"
import Link from "next/link"
import XLSX from '@/lib/utils/excel-compat'

// Type imports - JKKN Terminology: "Learner" (not "Student")
import type { Learner } from '@/types/learners'

// Service layer imports
import {
	fetchLearners as fetchLearnersService,
	fetchDropdownData as fetchDropdownDataService,
	fetchDepartmentsByInstitution,
	fetchProgramsByDepartment,
	fetchDegreesByProgram,
	fetchSemestersByProgram,
	fetchSectionsByProgram,
	createLearner,
	updateLearner,
	deleteLearner as deleteLearnerService,
} from '@/services/users/learners-service'

// Validation imports
import { validateLearnerData } from '@/lib/utils/learners/validation'

export default function LearnersPage() {
	const { toast } = useToast()

	// Institution filter hook for multi-tenant filtering
	const {
		filter,
		isReady,
		appendToUrl,
		getInstitutionIdForCreate,
		mustSelectInstitution,
		shouldFilter,
		institutionId
	} = useInstitutionFilter()

	const [learners, setLearners] = useState<Learner[]>([])
	const [loading, setLoading] = useState(true)
	const [sheetOpen, setSheetOpen] = useState(false)
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [deleteLearnerId, setDeleteLearnerId] = useState<string | null>(null)
	const [editing, setEditing] = useState<Learner | null>(null)
	const [currentTab, setCurrentTab] = useState("basic")
	const [searchQuery, setSearchQuery] = useState("")
	const [filterStatus, setFilterStatus] = useState("all")
	const [currentPage, setCurrentPage] = useState(1)
	const [itemsPerPage] = useState(10)

	// Comprehensive form state
	const [formData, setFormData] = useState({
		// PRIMARY IDENTIFIERS
		roll_number: "",
		register_number: "",
		application_id: "",
		admission_id: "",

		// BASIC INFORMATION
		first_name: "",
		last_name: "",
		initial: "",
		name_in_tamil: "",
		date_of_birth: "",
		gender: "",
		blood_group: "",

		// CONTACT INFORMATION
		learner_mobile: "",
		learner_email: "",
		college_email: "",
		telephone_number: "",

		// PERMANENT ADDRESS
		permanent_address_door_no: "",
		permanent_address_street: "",
		permanent_address_village: "",
		permanent_address_post_office: "",
		permanent_address_taluk: "",
		permanent_address_district: "",
		permanent_address_state: "Tamil Nadu",
		permanent_address_country: "India",
		permanent_address_pin_code: "",

		// ACADEMIC ASSIGNMENT
		institution_id: "",
		department_id: "",
		program_id: "",
		degree_id: "",
		semester_id: "",
		section_id: "",
		academic_year_id: "",
		batch_year: "",

		// DEMOGRAPHICS
		nationality: "Indian",
		religion: "",
		community: "",
		caste: "",
		sub_caste: "",
		aadhar_number: "",
		emis_number: "",

		// SPECIAL STATUS & CATEGORIES
		first_graduate: false,
		quota: "",
		category: "",
		disability_type: "",
		disability_percentage: "",
		sports_quota: "",
		ncc_number: "",
		nss_number: "",

		// FAMILY DETAILS
		father_name: "",
		father_occupation: "",
		father_education: "",
		father_mobile: "",
		father_email: "",
		mother_name: "",
		mother_occupation: "",
		mother_education: "",
		mother_mobile: "",
		mother_email: "",
		guardian_name: "",
		guardian_relation: "",
		guardian_mobile: "",
		guardian_email: "",
		annual_income: "",

		// 10TH STANDARD
		tenth_last_school: "",
		tenth_board_of_study: "",
		tenth_school_type: "",
		tenth_school_name: "",
		tenth_school_place: "",
		tenth_board: "",
		tenth_mode: "",
		tenth_medium: "",
		tenth_register_number: "",
		tenth_passing_month: "",
		tenth_passing_year: "",
		tenth_marks: "",

		// 11TH STANDARD
		eleventh_last_school: "",
		eleventh_school_type: "",
		eleventh_school_name: "",
		eleventh_school_place: "",
		eleventh_board: "",
		eleventh_mode: "",
		eleventh_medium: "",
		eleventh_register_number: "",
		eleventh_passing_month: "",
		eleventh_passing_year: "",
		eleventh_marks: "",

		// 12TH STANDARD
		twelfth_last_school: "",
		twelfth_school_type: "",
		twelfth_school_name: "",
		twelfth_school_place: "",
		twelfth_board: "",
		twelfth_mode: "",
		twelfth_medium: "",
		twelfth_register_number: "",
		twelfth_passing_month: "",
		twelfth_passing_year: "",
		twelfth_marks: "",
		twelfth_subject_marks: "",

		// ENTRANCE EXAM
		entry_type: "",
		medical_cutoff_marks: "",
		engineering_cutoff_marks: "",
		neet_roll_number: "",
		neet_score: "",
		counseling_applied: false,
		counseling_number: "",

		// UG DEGREE (for PG students)
		qualifying_degree: "",
		ug_last_college: "",
		ug_university: "",
		ug_passing_month: "",
		ug_passing_year: "",
		ug_qualification_type: "",
		ug_education_pattern: "",
		ug_major_marks: "",
		ug_major_max_marks: "",
		ug_major_percentage: "",
		ug_allied_marks: "",
		ug_allied_max_marks: "",
		ug_allied_percentage: "",
		ug_total_marks: "",
		ug_total_max_marks: "",
		ug_total_percentage: "",
		ug_class_obtained: "",
		ug_overall_grade: "",

		// ACCOMMODATION & TRANSPORT
		accommodation_type: "",
		hostel_type: "",
		food_type: "",
		bus_required: false,
		bus_route: "",
		bus_pickup_location: "",
		is_hostelite: false,
		is_bus_user: false,

		// FINANCIAL DETAILS
		bank_beneficiary_name: "",
		bank_account_number: "",
		bank_ifsc_code: "",
		bank_name: "",
		bank_branch: "",
		fixed_fee: "",
		fee_payment_date: "",
		fee_amount_paid: "",

		// DOCUMENTS & CERTIFICATES (JSONB)
		original_certificates_submitted: "",
		xerox_certificates_submitted: "",

		// REFERENCE
		reference_type: "",
		reference_name: "",
		reference_contact: "",

		// MEDIA
		learner_photo_url: "",
		photo_url: "",

		// STATUS
		status: "active",
		admission_status: "",
		is_profile_complete: false,
	})

	const [errors, setErrors] = useState<Record<string, string>>({})

	// Dropdown options state
	const [institutions, setInstitutions] = useState<any[]>([])
	const [departments, setDepartments] = useState<any[]>([])
	const [programs, setPrograms] = useState<any[]>([])
	const [degrees, setDegrees] = useState<any[]>([])
	const [semesters, setSemesters] = useState<any[]>([])
	const [sections, setSections] = useState<any[]>([])
	const [academicYears, setAcademicYears] = useState<any[]>([])
	const [isLoadingEdit, setIsLoadingEdit] = useState(false)

	// Fetch learners from API when institution filter is ready
	useEffect(() => {
		if (!isReady) return
		fetchLearners()
		fetchDropdownData()
	}, [isReady, filter])

	const fetchDropdownData = async () => {
		try {
			const data = await fetchDropdownDataService()
			if (data.institutions) setInstitutions(data.institutions)
			if (data.academicYears) setAcademicYears(data.academicYears)
		} catch (error) {
			console.error('Error fetching dropdown data:', error)
		}
	}

	// Fetch departments when institution changes
	useEffect(() => {
		console.log('🔄 Institution useEffect triggered:', {
			institution_id: formData.institution_id,
			isLoadingEdit,
			institutionsLoaded: institutions.length
		})

		if (formData.institution_id && !isLoadingEdit) {
			console.log('✅ Calling fetchDepartments')
			fetchDepartments(formData.institution_id)
		} else if (!formData.institution_id && !isLoadingEdit) {
			console.log('🧹 Clearing departments and dependent fields')
			setDepartments([])
			setPrograms([])
			setDegrees([])
			setSemesters([])
			setSections([])
			// Clear dependent fields only if not loading edit
			setFormData(prev => ({
				...prev,
				department_id: '',
				program_id: '',
				degree_id: '',
				semester_id: '',
				section_id: ''
			}))
		}
	}, [formData.institution_id, institutions])

	// Fetch programs when department changes
	useEffect(() => {
		if (formData.department_id && !isLoadingEdit) {
			fetchPrograms(formData.department_id)
		} else if (!formData.department_id && !isLoadingEdit) {
			setPrograms([])
			setDegrees([])
			setSemesters([])
			setSections([])
			// Clear dependent fields only if not loading edit
			setFormData(prev => ({
				...prev,
				program_id: '',
				degree_id: '',
				semester_id: '',
				section_id: ''
			}))
		}
	}, [formData.department_id])

	// Fetch degrees, semesters, and sections when program changes
	useEffect(() => {
		if (formData.program_id && !isLoadingEdit) {
			fetchDegrees(formData.program_id)
			fetchSemesters(formData.program_id)
			fetchSections(formData.program_id)
		} else if (!formData.program_id && !isLoadingEdit) {
			setDegrees([])
			setSemesters([])
			setSections([])
			// Clear dependent fields only if not loading edit
			setFormData(prev => ({
				...prev,
				degree_id: '',
				semester_id: '',
				section_id: ''
			}))
		}
	}, [formData.program_id])

	const fetchDepartments = useCallback(async (institutionId: string) => {
		try {
			const institution = institutions.find(inst => inst.id === institutionId)
			if (!institution) {
				console.error('Institution not found in state')
				return
			}
			const data = await fetchDepartmentsByInstitution(institutionId, institution.institution_code)
			setDepartments(data)
		} catch (error) {
			console.error('Error fetching departments:', error)
		}
	}, [institutions])

	const fetchPrograms = useCallback(async (departmentId: string) => {
		try {
			const data = await fetchProgramsByDepartment(departmentId)
			setPrograms(data)
		} catch (error) {
			console.error('Error fetching programs:', error)
		}
	}, [])

	const fetchDegrees = useCallback(async (programId: string) => {
		try {
			const data = await fetchDegreesByProgram(programId)
			setDegrees(data)
		} catch (error) {
			console.error('Error fetching degrees:', error)
		}
	}, [])

	const fetchSemesters = useCallback(async (programId: string) => {
		try {
			const data = await fetchSemestersByProgram(programId)
			setSemesters(data)
		} catch (error) {
			console.error('Error fetching semesters:', error)
		}
	}, [])

	const fetchSections = useCallback(async (programId: string) => {
		try {
			const data = await fetchSectionsByProgram(programId)
			setSections(data)
		} catch (error) {
			console.error('Error fetching sections:', error)
		}
	}, [])

	const fetchLearners = useCallback(async () => {
		try {
			setLoading(true)
			const data = await fetchLearnersService()
			setLearners(data)
		} catch (error) {
			console.error('Error fetching learners:', error)
		} finally {
			setLoading(false)
		}
	}, [])

	const refreshLearners = async () => {
		setLoading(true)
		try {
			const data = await fetchLearnersService()
			setLearners(data)
			toast({
				title: '✅ Refreshed',
				description: `Loaded ${data.length} learners.`,
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error refreshing learners:', error)
			toast({
				title: '❌ Refresh Failed',
				description: 'Failed to load learners.',
				variant: 'destructive'
			})
		} finally {
			setLoading(false)
		}
	}

	const resetForm = () => {
		// Auto-fill institution_id from context if available
		const autoInstitutionId = getInstitutionIdForCreate() || ""
		setFormData({
			// PRIMARY IDENTIFIERS
			roll_number: "",
			register_number: "",
			application_id: "",
			admission_id: "",

			// BASIC INFORMATION
			first_name: "",
			last_name: "",
			initial: "",
			name_in_tamil: "",
			date_of_birth: "",
			gender: "",
			blood_group: "",

			// CONTACT INFORMATION
			learner_mobile: "",
			learner_email: "",
			college_email: "",
			telephone_number: "",

			// PERMANENT ADDRESS
			permanent_address_door_no: "",
			permanent_address_street: "",
			permanent_address_village: "",
			permanent_address_post_office: "",
			permanent_address_taluk: "",
			permanent_address_district: "",
			permanent_address_state: "Tamil Nadu",
			permanent_address_country: "India",
			permanent_address_pin_code: "",

			// ACADEMIC ASSIGNMENT
			institution_id: autoInstitutionId,
			department_id: "",
			program_id: "",
			degree_id: "",
			semester_id: "",
			section_id: "",
			academic_year_id: "",
			batch_year: "",

			// DEMOGRAPHICS
			nationality: "Indian",
			religion: "",
			community: "",
			caste: "",
			sub_caste: "",
			aadhar_number: "",
			emis_number: "",

			// SPECIAL STATUS & CATEGORIES
			first_graduate: false,
			quota: "",
			category: "",
			disability_type: "",
			disability_percentage: "",
			sports_quota: "",
			ncc_number: "",
			nss_number: "",

			// FAMILY DETAILS
			father_name: "",
			father_occupation: "",
			father_education: "",
			father_mobile: "",
			father_email: "",
			mother_name: "",
			mother_occupation: "",
			mother_education: "",
			mother_mobile: "",
			mother_email: "",
			guardian_name: "",
			guardian_relation: "",
			guardian_mobile: "",
			guardian_email: "",
			annual_income: "",

			// 10TH STANDARD
			tenth_last_school: "",
			tenth_board_of_study: "",
			tenth_school_type: "",
			tenth_school_name: "",
			tenth_school_place: "",
			tenth_board: "",
			tenth_mode: "",
			tenth_medium: "",
			tenth_register_number: "",
			tenth_passing_month: "",
			tenth_passing_year: "",
			tenth_marks: "",

			// 11TH STANDARD
			eleventh_last_school: "",
			eleventh_school_type: "",
			eleventh_school_name: "",
			eleventh_school_place: "",
			eleventh_board: "",
			eleventh_mode: "",
			eleventh_medium: "",
			eleventh_register_number: "",
			eleventh_passing_month: "",
			eleventh_passing_year: "",
			eleventh_marks: "",

			// 12TH STANDARD
			twelfth_last_school: "",
			twelfth_school_type: "",
			twelfth_school_name: "",
			twelfth_school_place: "",
			twelfth_board: "",
			twelfth_mode: "",
			twelfth_medium: "",
			twelfth_register_number: "",
			twelfth_passing_month: "",
			twelfth_passing_year: "",
			twelfth_marks: "",
			twelfth_subject_marks: "",

			// ENTRANCE EXAM
			entry_type: "",
			medical_cutoff_marks: "",
			engineering_cutoff_marks: "",
			neet_roll_number: "",
			neet_score: "",
			counseling_applied: false,
			counseling_number: "",

			// UG DEGREE (for PG learners)
			qualifying_degree: "",
			ug_last_college: "",
			ug_university: "",
			ug_passing_month: "",
			ug_passing_year: "",
			ug_qualification_type: "",
			ug_education_pattern: "",
			ug_major_marks: "",
			ug_major_max_marks: "",
			ug_major_percentage: "",
			ug_allied_marks: "",
			ug_allied_max_marks: "",
			ug_allied_percentage: "",
			ug_total_marks: "",
			ug_total_max_marks: "",
			ug_total_percentage: "",
			ug_class_obtained: "",
			ug_overall_grade: "",

			// ACCOMMODATION & TRANSPORT
			accommodation_type: "",
			hostel_type: "",
			food_type: "",
			bus_required: false,
			bus_route: "",
			bus_pickup_location: "",
			is_hostelite: false,
			is_bus_user: false,

			// FINANCIAL DETAILS
			bank_beneficiary_name: "",
			bank_account_number: "",
			bank_ifsc_code: "",
			bank_name: "",
			bank_branch: "",
			fixed_fee: "",
			fee_payment_date: "",
			fee_amount_paid: "",

			// DOCUMENTS & CERTIFICATES (JSONB)
			original_certificates_submitted: "",
			xerox_certificates_submitted: "",

			// REFERENCE
			reference_type: "",
			reference_name: "",
			reference_contact: "",

			// MEDIA
			learner_photo_url: "",
			photo_url: "",

			// STATUS
			status: "active",
			admission_status: "",
			is_profile_complete: false,
		})
		setErrors({})
		setEditing(null)
		setCurrentTab("basic")
	}

	const openAdd = () => {
		resetForm()
		setSheetOpen(true)
	}

	const openEdit = async (learner: Learner) => {
		setEditing(learner)
		setIsLoadingEdit(true)

		// Batch load dependent dropdowns in parallel where possible
		const loadDropdowns = async () => {
			// First level: departments (depends on institution)
			if (learner.institution_id) {
				await fetchDepartments(learner.institution_id)
			}
			// Second level: programs (depends on department)
			if (learner.department_id) {
				await fetchPrograms(learner.department_id)
			}
			// Third level: degrees, semesters, sections (all depend on program, can run in parallel)
			if (learner.program_id) {
				await Promise.all([
					fetchDegrees(learner.program_id),
					fetchSemesters(learner.program_id),
					fetchSections(learner.program_id)
				])
			}
		}
		await loadDropdowns()

		setFormData({
			// PRIMARY IDENTIFIERS
			roll_number: learner.roll_number || "",
			register_number: learner.register_number || "",
			application_id: learner.application_id || "",
			admission_id: learner.admission_id || "",

			// BASIC INFORMATION
			first_name: learner.first_name || "",
			last_name: learner.last_name || "",
			initial: learner.initial || "",
			name_in_tamil: learner.name_in_tamil || "",
			date_of_birth: learner.date_of_birth || "",
			gender: learner.gender || "",
			blood_group: learner.blood_group || "",

			// CONTACT INFORMATION
			learner_mobile: learner.learner_mobile || "",
			learner_email: learner.learner_email || "",
			college_email: learner.college_email || "",
			telephone_number: learner.telephone_number || "",

			// PERMANENT ADDRESS
			permanent_address_door_no: learner.permanent_address_door_no || "",
			permanent_address_street: learner.permanent_address_street || "",
			permanent_address_village: learner.permanent_address_village || "",
			permanent_address_post_office: learner.permanent_address_post_office || "",
			permanent_address_taluk: learner.permanent_address_taluk || "",
			permanent_address_district: learner.permanent_address_district || "",
			permanent_address_state: learner.permanent_address_state || "Tamil Nadu",
			permanent_address_country: learner.permanent_address_country || "India",
			permanent_address_pin_code: learner.permanent_address_pin_code || "",

			// ACADEMIC ASSIGNMENT
			institution_id: learner.institution_id || "",
			department_id: learner.department_id || "",
			program_id: learner.program_id || "",
			degree_id: learner.degree_id || "",
			semester_id: learner.semester_id || "",
			section_id: learner.section_id || "",
			academic_year_id: learner.academic_year_id || "",
			batch_year: String(learner.batch_year || ""),

			// DEMOGRAPHICS
			nationality: learner.nationality || "Indian",
			religion: learner.religion || "",
			community: learner.community || "",
			caste: learner.caste || "",
			sub_caste: learner.sub_caste || "",
			aadhar_number: learner.aadhar_number || "",
			emis_number: learner.emis_number || "",

			// SPECIAL STATUS & CATEGORIES
			first_graduate: learner.first_graduate || false,
			quota: learner.quota || "",
			category: learner.category || "",
			disability_type: learner.disability_type || "",
			disability_percentage: String(learner.disability_percentage || ""),
			sports_quota: learner.sports_quota || "",
			ncc_number: learner.ncc_number || "",
			nss_number: learner.nss_number || "",

			// FAMILY DETAILS
			father_name: learner.father_name || "",
			father_occupation: learner.father_occupation || "",
			father_education: learner.father_education || "",
			father_mobile: learner.father_mobile || "",
			father_email: learner.father_email || "",
			mother_name: learner.mother_name || "",
			mother_occupation: learner.mother_occupation || "",
			mother_education: learner.mother_education || "",
			mother_mobile: learner.mother_mobile || "",
			mother_email: learner.mother_email || "",
			guardian_name: learner.guardian_name || "",
			guardian_relation: learner.guardian_relation || "",
			guardian_mobile: learner.guardian_mobile || "",
			guardian_email: learner.guardian_email || "",
			annual_income: String(learner.annual_income || ""),

			// 10TH STANDARD
			tenth_last_school: learner.tenth_last_school || "",
			tenth_board_of_study: learner.tenth_board_of_study || "",
			tenth_school_type: learner.tenth_school_type || "",
			tenth_school_name: learner.tenth_school_name || "",
			tenth_school_place: learner.tenth_school_place || "",
			tenth_board: learner.tenth_board || "",
			tenth_mode: learner.tenth_mode || "",
			tenth_medium: learner.tenth_medium || "",
			tenth_register_number: learner.tenth_register_number || "",
			tenth_passing_month: learner.tenth_passing_month || "",
			tenth_passing_year: String(learner.tenth_passing_year || ""),
			tenth_marks: learner.tenth_marks ? JSON.stringify(learner.tenth_marks) : "",

			// 11TH STANDARD
			eleventh_last_school: learner.eleventh_last_school || "",
			eleventh_school_type: learner.eleventh_school_type || "",
			eleventh_school_name: learner.eleventh_school_name || "",
			eleventh_school_place: learner.eleventh_school_place || "",
			eleventh_board: learner.eleventh_board || "",
			eleventh_mode: learner.eleventh_mode || "",
			eleventh_medium: learner.eleventh_medium || "",
			eleventh_register_number: learner.eleventh_register_number || "",
			eleventh_passing_month: learner.eleventh_passing_month || "",
			eleventh_passing_year: String(learner.eleventh_passing_year || ""),
			eleventh_marks: learner.eleventh_marks ? JSON.stringify(learner.eleventh_marks) : "",

			// 12TH STANDARD
			twelfth_last_school: learner.twelfth_last_school || "",
			twelfth_school_type: learner.twelfth_school_type || "",
			twelfth_school_name: learner.twelfth_school_name || "",
			twelfth_school_place: learner.twelfth_school_place || "",
			twelfth_board: learner.twelfth_board || "",
			twelfth_mode: learner.twelfth_mode || "",
			twelfth_medium: learner.twelfth_medium || "",
			twelfth_register_number: learner.twelfth_register_number || "",
			twelfth_passing_month: learner.twelfth_passing_month || "",
			twelfth_passing_year: String(learner.twelfth_passing_year || ""),
			twelfth_marks: learner.twelfth_marks ? JSON.stringify(learner.twelfth_marks) : "",
			twelfth_subject_marks: learner.twelfth_subject_marks ? JSON.stringify(learner.twelfth_subject_marks) : "",

			// ENTRANCE EXAM
			entry_type: learner.entry_type || "",
			medical_cutoff_marks: String(learner.medical_cutoff_marks || ""),
			engineering_cutoff_marks: String(learner.engineering_cutoff_marks || ""),
			neet_roll_number: learner.neet_roll_number || "",
			neet_score: String(learner.neet_score || ""),
			counseling_applied: learner.counseling_applied || false,
			counseling_number: learner.counseling_number || "",

			// UG DEGREE (for PG learners)
			qualifying_degree: learner.qualifying_degree || "",
			ug_last_college: learner.ug_last_college || "",
			ug_university: learner.ug_university || "",
			ug_passing_month: learner.ug_passing_month || "",
			ug_passing_year: String(learner.ug_passing_year || ""),
			ug_qualification_type: learner.ug_qualification_type || "",
			ug_education_pattern: learner.ug_education_pattern || "",
			ug_major_marks: String(learner.ug_major_marks || ""),
			ug_major_max_marks: String(learner.ug_major_max_marks || ""),
			ug_major_percentage: String(learner.ug_major_percentage || ""),
			ug_allied_marks: String(learner.ug_allied_marks || ""),
			ug_allied_max_marks: String(learner.ug_allied_max_marks || ""),
			ug_allied_percentage: String(learner.ug_allied_percentage || ""),
			ug_total_marks: String(learner.ug_total_marks || ""),
			ug_total_max_marks: String(learner.ug_total_max_marks || ""),
			ug_total_percentage: String(learner.ug_total_percentage || ""),
			ug_class_obtained: learner.ug_class_obtained || "",
			ug_overall_grade: learner.ug_overall_grade || "",

			// ACCOMMODATION & TRANSPORT
			accommodation_type: learner.accommodation_type || "",
			hostel_type: learner.hostel_type || "",
			food_type: learner.food_type || "",
			bus_required: learner.bus_required || false,
			bus_route: learner.bus_route || "",
			bus_pickup_location: learner.bus_pickup_location || "",
			is_hostelite: learner.is_hostelite || false,
			is_bus_user: learner.is_bus_user || false,

			// FINANCIAL DETAILS
			bank_beneficiary_name: learner.bank_beneficiary_name || "",
			bank_account_number: learner.bank_account_number || "",
			bank_ifsc_code: learner.bank_ifsc_code || "",
			bank_name: learner.bank_name || "",
			bank_branch: learner.bank_branch || "",
			fixed_fee: String(learner.fixed_fee || ""),
			fee_payment_date: learner.fee_payment_date || "",
			fee_amount_paid: String(learner.fee_amount_paid || ""),

			// DOCUMENTS & CERTIFICATES (JSONB)
			original_certificates_submitted: learner.original_certificates_submitted ? JSON.stringify(learner.original_certificates_submitted) : "",
			xerox_certificates_submitted: learner.xerox_certificates_submitted ? JSON.stringify(learner.xerox_certificates_submitted) : "",

			// REFERENCE
			reference_type: learner.reference_type || "",
			reference_name: learner.reference_name || "",
			reference_contact: learner.reference_contact || "",

			// MEDIA
			learner_photo_url: learner.learner_photo_url || learner.photo_url || "",
			photo_url: learner.photo_url || learner.learner_photo_url || "",

			// STATUS
			status: learner.status || "active",
			admission_status: learner.admission_status || "",
			is_profile_complete: learner.is_profile_complete || false,
		})

		setIsLoadingEdit(false)
		setSheetOpen(true)
	}

	const validate = () => {
		const e = validateLearnerData(formData)
		setErrors(e)
		return Object.keys(e).length === 0
	}

	const handleSave = async () => {
		if (!validate()) {
			toast({
				title: '❌ Validation Failed',
				description: 'Please fill in all required fields.',
				variant: 'destructive'
			})
			return
		}

		try {
			const saved = editing
				? await updateLearner(editing.id, formData as any)
				: await createLearner(formData as any)

			if (editing) {
				setLearners(p => p.map(s => s.id === editing.id ? saved : s))
				toast({
					title: '✅ Record Updated',
					description: `${formData.first_name}'s profile has been updated.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			} else {
				setLearners(p => [saved, ...p])
				toast({
					title: '✅ Record Created',
					description: `${formData.first_name} has been added successfully.`,
					className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
				})
			}

			setSheetOpen(false)
			resetForm()
		} catch (e) {
			console.error('Save learner error:', e)
			toast({
				title: '❌ Operation Failed',
				description: e instanceof Error ? e.message : 'Failed to save record.',
				variant: 'destructive'
			})
		}
	}

	const handleDelete = async () => {
		if (!deleteLearnerId) return

		try {
			await deleteLearnerService(deleteLearnerId)
			setLearners(learners.filter(s => s.id !== deleteLearnerId))
			toast({
				title: '✅ Record Deleted',
				description: 'Learner has been removed.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error deleting learner:', error)
			toast({
				title: '❌ Delete Failed',
				description: 'Failed to delete learner.',
				variant: 'destructive'
			})
		} finally {
			setDeleteDialogOpen(false)
			setDeleteLearnerId(null)
		}
	}

	// Export functions
	const downloadLearnersExcel = () => {
		const data = learners.map(s => ({
			// PRIMARY IDENTIFIERS
			'Roll Number': s.roll_number || '',
			'Register Number': s.register_number || '',
			'Application ID': s.application_id || '',
			'Admission ID': s.admission_id || '',

			// BASIC INFORMATION
			'First Name': s.first_name,
			'Last Name': s.last_name || '',
			'Initial': s.initial || '',
			'Name in Tamil': s.name_in_tamil || '',
			'Date of Birth': s.date_of_birth,
			'Age': s.age || '',
			'Gender': s.gender,
			'Blood Group': s.blood_group || '',

			// CONTACT INFORMATION
			'Learner Mobile': s.learner_mobile || '',
			'Learner Email': s.learner_email || '',
			'College Email': s.college_email || '',
			'Telephone': s.telephone_number || '',

			// PERMANENT ADDRESS
			'Address Door No': s.permanent_address_door_no || '',
			'Address Street': s.permanent_address_street || '',
			'Address Village': s.permanent_address_village || '',
			'Address Post Office': s.permanent_address_post_office || '',
			'Address Taluk': s.permanent_address_taluk || '',
			'Address District': s.permanent_address_district || '',
			'Address State': s.permanent_address_state || '',
			'Address Country': s.permanent_address_country || '',
			'Address PIN Code': s.permanent_address_pin_code || '',

			// ACADEMIC ASSIGNMENT
			'Institution Code': s.institution_code || '',
			'Department Code': s.department_code || '',
			'Program Code': s.program_code || '',
			'Degree Code': s.degree_code || '',
			'Semester Code': s.semester_code || '',
			'Section Code': s.section_code || '',
			'Academic Year': s.academic_year || '',
			'Batch Year': s.batch_year || '',
			'Status': s.status,

			// DEMOGRAPHICS
			'Nationality': s.nationality,
			'Religion': s.religion || '',
			'Community': s.community || '',
			'Caste': s.caste || '',
			'Sub Caste': s.sub_caste || '',
			'Aadhar Number': s.aadhar_number || '',
			'EMIS Number': s.emis_number || '',

			// SPECIAL STATUS & CATEGORIES
			'First Graduate': s.first_graduate ? 'Yes' : 'No',
			'Quota': s.quota || '',
			'Category': s.category || '',
			'Disability Type': s.disability_type || '',
			'Disability Percentage': s.disability_percentage || '',
			'Sports Quota': s.sports_quota || '',
			'NCC Number': s.ncc_number || '',
			'NSS Number': s.nss_number || '',

			// FAMILY DETAILS
			'Father Name': s.father_name || '',
			'Father Occupation': s.father_occupation || '',
			'Father Education': s.father_education || '',
			'Father Mobile': s.father_mobile || '',
			'Father Email': s.father_email || '',
			'Mother Name': s.mother_name || '',
			'Mother Occupation': s.mother_occupation || '',
			'Mother Education': s.mother_education || '',
			'Mother Mobile': s.mother_mobile || '',
			'Mother Email': s.mother_email || '',
			'Guardian Name': s.guardian_name || '',
			'Guardian Relation': s.guardian_relation || '',
			'Guardian Mobile': s.guardian_mobile || '',
			'Guardian Email': s.guardian_email || '',
			'Annual Income': s.annual_income || '',

			// 10TH STANDARD
			'10th School Name': s.tenth_school_name || '',
			'10th School Place': s.tenth_school_place || '',
			'10th Board': s.tenth_board || '',
			'10th Medium': s.tenth_medium || '',
			'10th Register Number': s.tenth_register_number || '',
			'10th Passing Year': s.tenth_passing_year || '',
			'10th Marks (JSON)': s.tenth_marks ? JSON.stringify(s.tenth_marks) : '',

			// 11TH STANDARD
			'11th School Name': s.eleventh_school_name || '',
			'11th School Place': s.eleventh_school_place || '',
			'11th Board': s.eleventh_board || '',
			'11th Passing Year': s.eleventh_passing_year || '',
			'11th Marks (JSON)': s.eleventh_marks ? JSON.stringify(s.eleventh_marks) : '',

			// 12TH STANDARD
			'12th School Name': s.twelfth_school_name || '',
			'12th School Place': s.twelfth_school_place || '',
			'12th Board': s.twelfth_board || '',
			'12th Register Number': s.twelfth_register_number || '',
			'12th Passing Year': s.twelfth_passing_year || '',
			'12th Marks (JSON)': s.twelfth_marks ? JSON.stringify(s.twelfth_marks) : '',
			'12th Subject Marks (JSON)': s.twelfth_subject_marks ? JSON.stringify(s.twelfth_subject_marks) : '',

			// ENTRANCE EXAM
			'Entry Type': s.entry_type || '',
			'Medical Cutoff': s.medical_cutoff_marks || '',
			'Engineering Cutoff': s.engineering_cutoff_marks || '',
			'NEET Roll Number': s.neet_roll_number || '',
			'NEET Score': s.neet_score || '',
			'Counseling Applied': s.counseling_applied ? 'Yes' : 'No',
			'Counseling Number': s.counseling_number || '',

			// UG DEGREE (for PG learners)
			'UG Qualifying Degree': s.qualifying_degree || '',
			'UG College': s.ug_last_college || '',
			'UG University': s.ug_university || '',
			'UG Passing Year': s.ug_passing_year || '',
			'UG Total Percentage': s.ug_total_percentage || '',
			'UG Class Obtained': s.ug_class_obtained || '',

			// ACCOMMODATION & TRANSPORT
			'Accommodation Type': s.accommodation_type || '',
			'Hostel Type': s.hostel_type || '',
			'Food Type': s.food_type || '',
			'Bus Required': s.bus_required ? 'Yes' : 'No',
			'Bus Route': s.bus_route || '',
			'Bus Pickup Location': s.bus_pickup_location || '',
			'Hostelite': s.is_hostelite ? 'Yes' : 'No',
			'Bus User': s.is_bus_user ? 'Yes' : 'No',

			// FINANCIAL DETAILS
			'Bank Beneficiary Name': s.bank_beneficiary_name || '',
			'Bank Account Number': s.bank_account_number || '',
			'Bank IFSC Code': s.bank_ifsc_code || '',
			'Bank Name': s.bank_name || '',
			'Bank Branch': s.bank_branch || '',
			'Fixed Fee': s.fixed_fee || '',
			'Fee Payment Date': s.fee_payment_date || '',
			'Fee Amount Paid': s.fee_amount_paid || '',

			// DOCUMENTS & REFERENCE
			'Original Certificates (JSON)': s.original_certificates_submitted ? JSON.stringify(s.original_certificates_submitted) : '',
			'Xerox Certificates (JSON)': s.xerox_certificates_submitted ? JSON.stringify(s.xerox_certificates_submitted) : '',
			'Reference Type': s.reference_type || '',
			'Reference Name': s.reference_name || '',
			'Reference Contact': s.reference_contact || '',

			// MEDIA
			'Learner Photo URL': s.learner_photo_url || s.photo_url || '',

			// STATUS
			'Admission Status': s.admission_status || '',
			'Profile Complete': s.is_profile_complete ? 'Yes' : 'No',
		}))

		const ws = XLSX.utils.json_to_sheet(data)
		const wb = XLSX.utils.book_new()
		XLSX.utils.book_append_sheet(wb, ws, 'Learners')
		XLSX.writeFile(wb, `learners_comprehensive_${new Date().toISOString().split('T')[0]}.xlsx`)

		toast({
			title: '✅ Export Successful',
			description: `${learners.length} learners exported to Excel with all fields.`,
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
		})
	}

	const downloadLearnersJSON = () => {
		const jsonStr = JSON.stringify(learners, null, 2)
		const blob = new Blob([jsonStr], { type: 'application/json' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `learners_${new Date().toISOString().split('T')[0]}.json`
		document.body.appendChild(a)
		a.click()
		document.body.removeChild(a)
		URL.revokeObjectURL(url)

		toast({
			title: '✅ Export Successful',
			description: `${learners.length} learners exported to JSON.`,
			className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
		})
	}

	const downloadTemplate = async () => {
		// Main template with correct column order
		const template = [{
			

			// Columns A-G: Academic Codes (REQUIRED - after Roll Number)
			'Institution Code*': '',
			'Department Code*': '',
			'Program Code*': '',
			'Degree Code': '',
			'Semester Code*': '',
			'Section Code': '',
			'Academic Year*': '',
			'Batch Year': '',

			// Column H: Roll Number
			'Roll Number*': '',
			
			// PRIMARY IDENTIFIERS (continued)
			'Register Number': '',
			'Application ID': '',
			'Admission ID': '',

			// BASIC INFORMATION
			'First Name*': '',
			'Last Name': '',
			'Initial': '',
			'Name in Tamil': '',
			'Date of Birth* (DD-MM-YYYY)': '',
			'Gender* (Male/Female/Other/Transgender)': '',
			'Blood Group (A+/A-/B+/B-/O+/O-/AB+/AB-)': '',
			'Nationality': 'Indian',

			// CONTACT INFORMATION
			'Learner Mobile': '',
			'Learner Email': '',
			'College Email': '',
			'Telephone': '',

			// PERMANENT ADDRESS
			'Address Door No': '',
			'Address Street': '',
			'Address Village': '',
			'Address Post Office': '',
			'Address Taluk': '',
			'Address District': '',
			'Address State': 'Tamil Nadu',
			'Address Country': 'India',
			'Address PIN Code': '',

			// DEMOGRAPHICS
			'Religion': '',
			'Community': '',
			'Caste': '',
			'Sub Caste': '',
			'Aadhar Number': '',
			'EMIS Number': '',

			// SPECIAL STATUS & CATEGORIES
			'First Graduate (Yes/No)': 'No',
			'Quota': '',
			'Category': '',
			'Disability Type': '',
			'Disability Percentage': '',
			'Sports Quota': '',
			'NCC Number': '',
			'NSS Number': '',

			// FAMILY DETAILS
			'Father Name': '',
			'Father Occupation': '',
			'Father Education': '',
			'Father Mobile': '',
			'Father Email': '',
			'Mother Name': '',
			'Mother Occupation': '',
			'Mother Education': '',
			'Mother Mobile': '',
			'Mother Email': '',
			'Guardian Name': '',
			'Guardian Relation': '',
			'Guardian Mobile': '',
			'Guardian Email': '',
			'Annual Income': '',

			// 10TH STANDARD (No JSON fields)
			'10th School Name': '',
			'10th School Place': '',
			'10th Board': '',
			'10th Medium': '',
			'10th Register Number': '',
			'10th Passing Year': '',

			// 11TH STANDARD (No JSON fields)
			'11th School Name': '',
			'11th School Place': '',
			'11th Board': '',
			'11th Passing Year': '',

			// 12TH STANDARD (No JSON fields)
			'12th School Name': '',
			'12th School Place': '',
			'12th Board': '',
			'12th Register Number': '',
			'12th Passing Year': '',

			// ENTRANCE EXAM
			'Entry Type': '',
			'Medical Cutoff': '',
			'Engineering Cutoff': '',
			'NEET Roll Number': '',
			'NEET Score': '',
			'Counseling Applied (Yes/No)': 'No',
			'Counseling Number': '',

			// UG DEGREE (for PG learners)
			'UG Qualifying Degree': '',
			'UG College': '',
			'UG University': '',
			'UG Passing Year': '',
			'UG Total Percentage': '',
			'UG Class Obtained': '',

			// ACCOMMODATION & TRANSPORT
			'Accommodation Type': '',
			'Hostel Type': '',
			'Food Type': '',
			'Bus Required (Yes/No)': 'No',
			'Bus Route': '',
			'Bus Pickup Location': '',
			'Hostelite (Yes/No)': 'No',
			'Bus User (Yes/No)': 'No',

			// FINANCIAL DETAILS
			'Bank Beneficiary Name': '',
			'Bank Account Number': '',
			'Bank IFSC Code': '',
			'Bank Name': '',
			'Bank Branch': '',
			'Fixed Fee': '',
			'Fee Payment Date (DD-MM-YYYY)': '',
			'Fee Amount Paid': '',

			// REFERENCE (No document JSON fields)
			'Reference Type': '',
			'Reference Name': '',
			'Reference Contact': '',

			// MEDIA
			'Learner Photo URL': '',

			// STATUS
			'Admission Status': '',
		}]

		// Fetch ALL reference data for comprehensive single sheet
		try {
			// Fetch all departments
			const deptRes = await fetch('/api/master/departments')
			const allDepartments = deptRes.ok ? await deptRes.json() : []

			// Fetch all programs
			const progRes = await fetch('/api/master/programs')
			const allPrograms = progRes.ok ? await progRes.json() : []

			// Fetch all semesters
			const semRes = await fetch('/api/master/semesters')
			const allSemesters = semRes.ok ? await semRes.json() : []

			// Fetch all sections
			const secRes = await fetch('/api/master/sections')
			const allSections = secRes.ok ? await secRes.json() : []

			// Calculate max rows needed
			const maxRows = Math.max(
				institutions.length,
				allDepartments.length,
				allPrograms.length,
				degrees.length,
				allSemesters.length,
				allSections.length,
				academicYears.length,
				4, // Gender values
				8  // Blood group values
			)

			// Create single comprehensive reference sheet with all data side by side
			const referenceData = []
			for (let i = 0; i < maxRows; i++) {
				referenceData.push({
					'Institution Code': institutions[i]?.institution_code || '',
					'Institution Name': institutions[i]?.institution_name || institutions[i]?.name || '',
					'': '', // Spacer
					'Department Code': allDepartments[i]?.department_code || '',
					'Department Name': allDepartments[i]?.department_name || '',
					' ': '', // Spacer
					'Program Code': allPrograms[i]?.program_code || '',
					'Program Name': allPrograms[i]?.program_name || '',
					'  ': '', // Spacer
					'Degree Code': degrees[i]?.degree_code || '',
					'Degree Name': degrees[i]?.degree_name || '',
					'   ': '', // Spacer
					'Semester Code': allSemesters[i]?.semester_code || '',
					'Semester Name': allSemesters[i]?.semester_name || '',
					'    ': '', // Spacer
					'Section Code': allSections[i]?.section_code || '',
					'Section Name': allSections[i]?.section_name || '',
					'     ': '', // Spacer
					'Academic Year': academicYears[i]?.year_code || academicYears[i]?.year_name || '',
					'      ': '', // Spacer
					'Gender': ['Male', 'Female', 'Other', 'Transgender'][i] || '',
					'       ': '', // Spacer
					'Blood Group': ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'][i] || ''
				})
			}

			// Create workbook with 2 sheets
			const wb = XLSX.utils.book_new()

			// Main template sheet
			const wsTemplate = XLSX.utils.json_to_sheet(template)
			XLSX.utils.book_append_sheet(wb, wsTemplate, 'Learner Upload Template')

			// Single comprehensive reference sheet
			const wsReference = XLSX.utils.json_to_sheet(referenceData)
			XLSX.utils.book_append_sheet(wb, wsReference, 'Reference Data')

			// Download file
			XLSX.writeFile(wb, 'learners_upload_template_with_references.xlsx')

			toast({
				title: '✅ Template Downloaded',
				description: 'Learner upload template with comprehensive reference data sheet downloaded successfully.',
				className: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200'
			})
		} catch (error) {
			console.error('Error generating template:', error)
			toast({
				title: '❌ Error',
				description: 'Failed to generate template. Please try again.',
				variant: 'destructive'
			})
		}
	}

	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (!file) return

		try {
			let jsonData: any[] = []

			if (file.name.endsWith('.json')) {
				const text = await file.text()
				const parsed = JSON.parse(text)
				jsonData = Array.isArray(parsed) ? parsed : [parsed]
			} else {
				const data = await file.arrayBuffer()
				const workbook = XLSX.read(data)
				const worksheet = workbook.Sheets[workbook.SheetNames[0]]
				jsonData = XLSX.utils.sheet_to_json(worksheet) as any[]
			}

			let successCount = 0
			let errorCount = 0

			for (const row of jsonData) {
				try {
					const payload = {
						roll_number: row['Roll Number*'] || row['Roll Number'] || row.roll_number,
						register_number: row['Register Number'] || row.register_number || null,
						first_name: row['First Name*'] || row['First Name'] || row.first_name,
						last_name: row['Last Name'] || row.last_name || null,
						initial: row['Initial'] || row.initial || null,
						date_of_birth: row['Date of Birth* (YYYY-MM-DD)'] || row['Date of Birth'] || row.date_of_birth,
						gender: row['Gender* (Male/Female/Other/Transgender)'] || row['Gender'] || row.gender,
						blood_group: row['Blood Group (A+/A-/B+/B-/O+/O-/AB+/AB-)'] || row['Blood Group'] || row.blood_group || null,
						learner_mobile: row['Mobile'] || row.learner_mobile || null,
						learner_email: row['Email'] || row.learner_email || null,
						college_email: row['College Email'] || row.college_email || null,
						nationality: row['Nationality'] || row.nationality || 'Indian',
						religion: row['Religion'] || row.religion || null,
						community: row['Community'] || row.community || null,
						caste: row['Caste'] || row.caste || null,
						quota: row['Quota'] || row.quota || null,
						category: row['Category'] || row.category || null,
						first_graduate: typeof row.first_graduate === 'boolean' ? row.first_graduate : String(row['First Graduate (Yes/No)'] || row['First Graduate'] || 'No').toUpperCase() === 'YES',
						father_name: row['Father Name'] || row.father_name || null,
						father_mobile: row['Father Mobile'] || row.father_mobile || null,
						mother_name: row['Mother Name'] || row.mother_name || null,
						mother_mobile: row['Mother Mobile'] || row.mother_mobile || null,
						district: row['District'] || row.district || null,
						state: row['State'] || row.state || 'Tamil Nadu',
						batch_year: row['Batch Year'] || row.batch_year || null,
						status: row['Status'] || row.status || 'active',
						is_hostelite: typeof row.is_hostelite === 'boolean' ? row.is_hostelite : String(row['Hostelite (Yes/No)'] || row['Hostelite'] || 'No').toUpperCase() === 'YES',
						is_bus_user: typeof row.is_bus_user === 'boolean' ? row.is_bus_user : String(row['Bus User (Yes/No)'] || row['Bus User'] || 'No').toUpperCase() === 'YES',
					}

					const res = await fetch('/api/users/users-list/learners', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					})

					if (res.ok) {
						successCount++
					} else {
						errorCount++
					}
				} catch (err) {
					errorCount++
				}
			}

			await fetchLearners()

			toast({
				title: successCount > 0 ? '✅ Upload Complete' : '❌ Upload Failed',
				description: `${successCount} learners uploaded successfully. ${errorCount} failed.`,
				className: successCount > 0 ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-200' : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200'
			})

			e.target.value = ''
		} catch (error) {
			console.error('Upload error:', error)
			toast({
				title: '❌ Upload Failed',
				description: 'Failed to process file.',
				variant: 'destructive'
			})
		}
	}

	// Memoized filter and search logic (adapted for MyJKKN API fields)
	const filteredLearners = useMemo(() => {
		const searchLower = searchQuery.toLowerCase()
		// Handle object fields from MyJKKN API (e.g., {id, name})
		const getFieldValue = (field: any) => typeof field === 'object' ? field?.name : field

		return learners.filter((learner: any) => {
			const matchesSearch =
				learner.roll_number?.toLowerCase().includes(searchLower) ||
				learner.first_name?.toLowerCase().includes(searchLower) ||
				learner.last_name?.toLowerCase().includes(searchLower) ||
				getFieldValue(learner.institution)?.toLowerCase().includes(searchLower) ||
				getFieldValue(learner.department)?.toLowerCase().includes(searchLower) ||
				getFieldValue(learner.program)?.toLowerCase().includes(searchLower)

			// Filter by profile status instead of learner status for MyJKKN data
			const matchesFilter = filterStatus === 'all' ||
				(filterStatus === 'active' && learner.is_profile_complete) ||
				(filterStatus === 'inactive' && !learner.is_profile_complete)

			return matchesSearch && matchesFilter
		})
	}, [learners, searchQuery, filterStatus])

	// Memoized pagination
	const { totalPages, startIndex, paginatedLearners } = useMemo(() => {
		const total = Math.ceil(filteredLearners.length / itemsPerPage)
		const start = (currentPage - 1) * itemsPerPage
		const paginated = filteredLearners.slice(start, start + itemsPerPage)
		return { totalPages: total, startIndex: start, paginatedLearners: paginated }
	}, [filteredLearners, currentPage, itemsPerPage])

	// Memoized stats (adapted for MyJKKN API)
	const stats = useMemo(() => ({
		total: learners.length,
		active: learners.filter((s: any) => s.is_profile_complete).length,
		inactive: learners.filter((s: any) => !s.is_profile_complete).length,
		graduated: 0, // MyJKKN API doesn't have this field
	}), [learners])

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<AppHeader>
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
									<BreadcrumbPage>Learners</BreadcrumbPage>
								</BreadcrumbItem>
							</BreadcrumbList>
						</Breadcrumb>
					</div>
				</AppHeader>

				<div className="flex flex-col gap-3 p-3 h-[calc(100vh-8rem)] overflow-hidden">
					{/* Stats Cards */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Total Learners</p>
										<p className="text-xl font-bold text-blue-600">{stats.total}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
										<Users className="h-3 w-3 text-blue-600 dark:text-blue-400" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Profile Complete</p>
										<p className="text-xl font-bold text-green-600">{stats.active}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
										<UserCheck className="h-3 w-3 text-green-600 dark:text-green-400" />
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-3">
								<div className="flex items-center justify-between">
									<div>
										<p className="text-xs font-medium text-muted-foreground">Profile Incomplete</p>
										<p className="text-xl font-bold text-orange-600">{stats.inactive}</p>
									</div>
									<div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
										<UserX className="h-3 w-3 text-orange-600 dark:text-orange-400" />
									</div>
								</div>
							</CardContent>
						</Card>
					</div>

					{/* Main Content */}
					<Card className="flex-1 flex flex-col min-h-0">
						<CardHeader className="flex-shrink-0 p-3">
							<div className="flex items-center justify-between mb-2">
								<h2 className="text-base font-bold">Learners Management</h2>
							</div>

							<div className="flex flex-col sm:flex-row gap-2">
								{/* Search */}
								<div className="relative flex-1">
									<Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search by roll number, name, email..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-8 h-9"
									/>
								</div>

								{/* Profile Filter */}
								<Select value={filterStatus} onValueChange={setFilterStatus}>
									<SelectTrigger className="w-[180px] h-9">
										<SelectValue placeholder="Profile Status" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">All Profiles</SelectItem>
										<SelectItem value="active">Profile Complete</SelectItem>
										<SelectItem value="inactive">Profile Incomplete</SelectItem>
									</SelectContent>
								</Select>

								{/* Action Buttons */}
								<div className="flex gap-1 flex-wrap">
									<Button variant="outline" size="sm" className="text-xs px-2 h-9" onClick={refreshLearners} disabled={loading}>
										<RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
										Refresh
									</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-9" onClick={downloadTemplate}>
										<FileSpreadsheet className="h-3 w-3 mr-1" />
										Template
									</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-9" onClick={downloadLearnersExcel}>
										<Download className="h-3 w-3 mr-1" />
										Excel
									</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-9" onClick={downloadLearnersJSON}>
										<FileJson className="h-3 w-3 mr-1" />
										JSON
									</Button>
									<Button variant="outline" size="sm" className="text-xs px-2 h-9" onClick={() => document.getElementById('file-upload')?.click()}>
										<Upload className="h-3 w-3 mr-1" />
										Import
									</Button>
									<input
										id="file-upload"
										type="file"
										accept=".xlsx,.xls,.json"
										onChange={handleFileUpload}
										className="hidden"
									/>
									<Button size="sm" className="text-xs px-2 h-9" onClick={openAdd}>
										<PlusCircle className="h-3 w-3 mr-1" />
										Add Learner
									</Button>
								</div>
							</div>
						</CardHeader>

						<CardContent className="p-3 pt-0 flex-1 flex flex-col min-h-0">
							<div className="rounded-md border overflow-hidden flex-1 flex flex-col min-h-0">
								<div className="flex-1 overflow-auto">
									<Table>
										<TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900/50">
											<TableRow>
												<TableHead className="font-bold text-xs">Roll Number</TableHead>
												<TableHead className="font-bold text-xs">Name</TableHead>
												<TableHead className="font-bold text-xs">Institution</TableHead>
												<TableHead className="font-bold text-xs">Department</TableHead>
												<TableHead className="font-bold text-xs">Program</TableHead>
												<TableHead className="font-bold text-xs">Profile</TableHead>
												<TableHead className="font-bold text-xs text-right">Actions</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{loading ? (
												<TableRow>
													<TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
														Loading learners...
													</TableCell>
												</TableRow>
											) : paginatedLearners.length === 0 ? (
												<TableRow>
													<TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
														No learners found
													</TableCell>
												</TableRow>
											) : (
												paginatedLearners.map((learner: any) => (
													<TableRow key={learner.id}>

														<TableCell className="font-medium text-xs">{learner.roll_number}</TableCell>
														<TableCell className="text-xs">{learner.full_name}</TableCell>
														<TableCell className="text-xs">{learner.gender}</TableCell>
														<TableCell className="text-xs">{learner.learner_mobile || '-'}</TableCell>
														<TableCell className="text-xs">{learner.learner_email || '-'}</TableCell>
														<TableCell className="text-xs">{learner.batch_year || '-'}</TableCell>

														<TableCell className="font-medium text-xs">{learner.roll_number || '-'}</TableCell>
														<TableCell className="text-xs">{learner.full_name || `${learner.first_name || ''} ${learner.last_name || ''}`.trim() || '-'}</TableCell>
														<TableCell className="text-xs">{typeof learner.institution === 'object' ? learner.institution?.name : learner.institution || '-'}</TableCell>
														<TableCell className="text-xs">{typeof learner.department === 'object' ? (learner.department?.department_name || learner.department?.name) : (learner.department || learner.department_name || learner.department_code) || '-'}</TableCell>
														<TableCell className="text-xs">{typeof learner.program === 'object' ? (learner.program?.program_name || learner.program?.name) : (learner.program || learner.program_name || learner.program_code) || '-'}</TableCell>

														<TableCell className="font-medium text-xs">{learner.roll_number || '-'}</TableCell>
														<TableCell className="text-xs">{learner.full_name || `${learner.first_name || ''} ${learner.last_name || ''}`.trim() || '-'}</TableCell>
														<TableCell className="text-xs">{typeof learner.institution === 'object' ? learner.institution?.name : learner.institution || '-'}</TableCell>
														<TableCell className="text-xs">{typeof learner.department === 'object' ? learner.department?.name : learner.department || '-'}</TableCell>
														<TableCell className="text-xs">{typeof learner.program === 'object' ? learner.program?.name : learner.program || '-'}</TableCell>

														<TableCell className="text-xs">
															<Badge variant={learner.is_profile_complete ? 'default' : 'outline'}>
																{learner.is_profile_complete ? 'Complete' : 'Incomplete'}
															</Badge>
														</TableCell>
														<TableCell className="text-right">
															<Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(learner)}>
																<Edit className="h-3 w-3" />
															</Button>
														</TableCell>
													</TableRow>
												))
											)}
										</TableBody>
									</Table>
								</div>

								{/* Pagination */}
								{filteredLearners.length > 0 && (
									<div className="flex items-center justify-between border-t px-4 py-2 bg-slate-50 dark:bg-slate-900/50">
										<div className="text-xs text-muted-foreground">
											Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredLearners.length)} of {filteredLearners.length} learners
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
												disabled={currentPage === 1}
												className="h-7"
											>
												<ChevronLeft className="h-3 w-3" />
											</Button>
											<span className="text-xs font-medium">
												Page {currentPage} of {totalPages}
											</span>
											<Button
												variant="outline"
												size="sm"
												onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
												disabled={currentPage === totalPages}
												className="h-7"
											>
												<ChevronRight className="h-3 w-3" />
											</Button>
										</div>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Add/Edit Sheet */}
				<Sheet open={sheetOpen} onOpenChange={(o) => { if (!o) resetForm(); setSheetOpen(o) }}>
					<SheetContent className="sm:max-w-[900px] overflow-y-auto">
						<SheetHeader>
							<SheetTitle className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
								{editing ? 'Edit Learner' : 'Add New Learner'}
							</SheetTitle>
						</SheetHeader>

						<Tabs value={currentTab} onValueChange={setCurrentTab} className="mt-4">
							<TabsList className="grid w-full grid-cols-9 gap-1">
								<TabsTrigger value="basic" className="text-xs px-2">Basic</TabsTrigger>
								<TabsTrigger value="contact" className="text-xs px-2">Contact</TabsTrigger>
								<TabsTrigger value="address" className="text-xs px-2">Address</TabsTrigger>
								<TabsTrigger value="academic" className="text-xs px-2">Academic</TabsTrigger>
								<TabsTrigger value="education" className="text-xs px-2">10th/11th/12th</TabsTrigger>
								<TabsTrigger value="entrance" className="text-xs px-2">Entrance/UG</TabsTrigger>
								<TabsTrigger value="accommodation" className="text-xs px-2">Transport/Fee</TabsTrigger>
								<TabsTrigger value="documents" className="text-xs px-2">Documents</TabsTrigger>
								<TabsTrigger value="other" className="text-xs px-2">Other</TabsTrigger>
							</TabsList>

							{/* Basic Info Tab */}
							<TabsContent value="basic" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Roll Number <span className="text-red-500">*</span></Label>
										<Input
											value={formData.roll_number}
											onChange={(e) => setFormData({ ...formData, roll_number: e.target.value })}
											className={`h-10 ${errors.roll_number ? 'border-destructive' : ''}`}
											placeholder="e.g., 24CS001"
										/>
										{errors.roll_number && <p className="text-xs text-destructive">{errors.roll_number}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Register Number</Label>
										<Input
											value={formData.register_number}
											onChange={(e) => setFormData({ ...formData, register_number: e.target.value })}
											className="h-10"
											placeholder="e.g., 412124CS001"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Application ID</Label>
										<Input
											value={formData.application_id}
											onChange={(e) => setFormData({ ...formData, application_id: e.target.value })}
											className="h-10"
											placeholder="Application ID"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Admission ID</Label>
										<Input
											value={formData.admission_id}
											onChange={(e) => setFormData({ ...formData, admission_id: e.target.value })}
											className="h-10"
											placeholder="Admission ID"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">First Name <span className="text-red-500">*</span></Label>
										<Input
											value={formData.first_name}
											onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
											className={`h-10 ${errors.first_name ? 'border-destructive' : ''}`}
										/>
										{errors.first_name && <p className="text-xs text-destructive">{errors.first_name}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Last Name</Label>
										<Input
											value={formData.last_name}
											onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Initial</Label>
										<Input
											value={formData.initial}
											onChange={(e) => setFormData({ ...formData, initial: e.target.value })}
											className="h-10"
											placeholder="e.g., S"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Name in Tamil</Label>
										<Input
											value={formData.name_in_tamil}
											onChange={(e) => setFormData({ ...formData, name_in_tamil: e.target.value })}
											className="h-10"
											placeholder="தமிழில் பெயர்"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Date of Birth <span className="text-red-500">*</span></Label>
										<Input
											type="date"
											value={formData.date_of_birth}
											onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
											className={`h-10 ${errors.date_of_birth ? 'border-destructive' : ''}`}
										/>
										{errors.date_of_birth && <p className="text-xs text-destructive">{errors.date_of_birth}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Gender <span className="text-red-500">*</span></Label>
										<Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
											<SelectTrigger className={`h-10 ${errors.gender ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select gender" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="Male">Male</SelectItem>
												<SelectItem value="Female">Female</SelectItem>
												<SelectItem value="Other">Other</SelectItem>
												<SelectItem value="Transgender">Transgender</SelectItem>
											</SelectContent>
										</Select>
										{errors.gender && <p className="text-xs text-destructive">{errors.gender}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Blood Group</Label>
										<Select value={formData.blood_group} onValueChange={(v) => setFormData({ ...formData, blood_group: v })}>
											<SelectTrigger className="h-10">
												<SelectValue placeholder="Select blood group" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="A+">A+</SelectItem>
												<SelectItem value="A-">A-</SelectItem>
												<SelectItem value="B+">B+</SelectItem>
												<SelectItem value="B-">B-</SelectItem>
												<SelectItem value="O+">O+</SelectItem>
												<SelectItem value="O-">O-</SelectItem>
												<SelectItem value="AB+">AB+</SelectItem>
												<SelectItem value="AB-">AB-</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Learner Photo URL</Label>
										<Input
											value={formData.learner_photo_url}
											onChange={(e) => setFormData({ ...formData, learner_photo_url: e.target.value })}
											className="h-10"
											placeholder="https://example.com/photo.jpg"
										/>
									</div>
								</div>
							</TabsContent>

							{/* Contact Tab */}
							<TabsContent value="contact" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Learner Mobile</Label>
										<Input
											value={formData.learner_mobile}
											onChange={(e) => setFormData({ ...formData, learner_mobile: e.target.value })}
											className="h-10"
											placeholder="10-digit mobile"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Learner Email</Label>
										<Input
											type="email"
											value={formData.learner_email}
											onChange={(e) => setFormData({ ...formData, learner_email: e.target.value })}
											className="h-10"
											placeholder="learner@example.com"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">College Email</Label>
										<Input
											type="email"
											value={formData.college_email}
											onChange={(e) => setFormData({ ...formData, college_email: e.target.value })}
											className="h-10"
											placeholder="learner@college.edu"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Telephone Number</Label>
										<Input
											value={formData.telephone_number}
											onChange={(e) => setFormData({ ...formData, telephone_number: e.target.value })}
											className="h-10"
											placeholder="Landline number"
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Father Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Father Name</Label>
										<Input
											value={formData.father_name}
											onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Father Occupation</Label>
										<Input
											value={formData.father_occupation}
											onChange={(e) => setFormData({ ...formData, father_occupation: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Father Education</Label>
										<Input
											value={formData.father_education}
											onChange={(e) => setFormData({ ...formData, father_education: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Father Mobile</Label>
										<Input
											value={formData.father_mobile}
											onChange={(e) => setFormData({ ...formData, father_mobile: e.target.value })}
											className="h-10"
											placeholder="10-digit mobile"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Father Email</Label>
										<Input
											type="email"
											value={formData.father_email}
											onChange={(e) => setFormData({ ...formData, father_email: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Mother Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Mother Name</Label>
										<Input
											value={formData.mother_name}
											onChange={(e) => setFormData({ ...formData, mother_name: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Mother Occupation</Label>
										<Input
											value={formData.mother_occupation}
											onChange={(e) => setFormData({ ...formData, mother_occupation: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Mother Education</Label>
										<Input
											value={formData.mother_education}
											onChange={(e) => setFormData({ ...formData, mother_education: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Mother Mobile</Label>
										<Input
											value={formData.mother_mobile}
											onChange={(e) => setFormData({ ...formData, mother_mobile: e.target.value })}
											className="h-10"
											placeholder="10-digit mobile"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Mother Email</Label>
										<Input
											type="email"
											value={formData.mother_email}
											onChange={(e) => setFormData({ ...formData, mother_email: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Guardian Details (if applicable)</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Guardian Name</Label>
										<Input
											value={formData.guardian_name}
											onChange={(e) => setFormData({ ...formData, guardian_name: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Guardian Relation</Label>
										<Input
											value={formData.guardian_relation}
											onChange={(e) => setFormData({ ...formData, guardian_relation: e.target.value })}
											className="h-10"
											placeholder="e.g., Uncle, Aunt, Brother"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Guardian Mobile</Label>
										<Input
											value={formData.guardian_mobile}
											onChange={(e) => setFormData({ ...formData, guardian_mobile: e.target.value })}
											className="h-10"
											placeholder="10-digit mobile"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Guardian Email</Label>
										<Input
											type="email"
											value={formData.guardian_email}
											onChange={(e) => setFormData({ ...formData, guardian_email: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Annual Family Income (₹)</Label>
										<Input
											type="number"
											value={formData.annual_income}
											onChange={(e) => setFormData({ ...formData, annual_income: e.target.value })}
											className="h-10"
											placeholder="e.g., 500000"
										/>
									</div>
								</div>
							</TabsContent>

							{/* Address Tab */}
							<TabsContent value="address" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Permanent Address</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Door No</Label>
										<Input
											value={formData.permanent_address_door_no}
											onChange={(e) => setFormData({ ...formData, permanent_address_door_no: e.target.value })}
											className="h-10"
											placeholder="e.g., 12/A"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Street</Label>
										<Input
											value={formData.permanent_address_street}
											onChange={(e) => setFormData({ ...formData, permanent_address_street: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Village/Area</Label>
										<Input
											value={formData.permanent_address_village}
											onChange={(e) => setFormData({ ...formData, permanent_address_village: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Post Office</Label>
										<Input
											value={formData.permanent_address_post_office}
											onChange={(e) => setFormData({ ...formData, permanent_address_post_office: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Taluk</Label>
										<Input
											value={formData.permanent_address_taluk}
											onChange={(e) => setFormData({ ...formData, permanent_address_taluk: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">District</Label>
										<Input
											value={formData.permanent_address_district}
											onChange={(e) => setFormData({ ...formData, permanent_address_district: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">State</Label>
										<Input
											value={formData.permanent_address_state}
											onChange={(e) => setFormData({ ...formData, permanent_address_state: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Country</Label>
										<Input
											value={formData.permanent_address_country}
											onChange={(e) => setFormData({ ...formData, permanent_address_country: e.target.value })}
											className="h-10"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">PIN Code</Label>
										<Input
											value={formData.permanent_address_pin_code}
											onChange={(e) => setFormData({ ...formData, permanent_address_pin_code: e.target.value })}
											className="h-10"
											placeholder="6-digit PIN"
											maxLength={6}
										/>
									</div>
								</div>
							</TabsContent>

							{/* Academic Tab */}
							<TabsContent value="academic" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label className="text-sm font-semibold">Institution <span className="text-red-500">*</span></Label>
										<Select value={formData.institution_id} onValueChange={(v) => setFormData({ ...formData, institution_id: v })}>
											<SelectTrigger className={`h-10 ${errors.institution_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select institution" />
											</SelectTrigger>
											<SelectContent>
												{institutions.map((inst) => (
													<SelectItem key={inst.id} value={inst.id}>
														{inst.institution_code} - {inst.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.institution_id && <p className="text-xs text-destructive">{errors.institution_id}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Department <span className="text-red-500">*</span></Label>
										<Select value={formData.department_id} onValueChange={(v) => setFormData({ ...formData, department_id: v })}>
											<SelectTrigger className={`h-10 ${errors.department_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select department" />
											</SelectTrigger>
											<SelectContent>
												{departments.map((dept) => (
													<SelectItem key={dept.id} value={dept.id}>
														{dept.department_code} - {dept.department_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.department_id && <p className="text-xs text-destructive">{errors.department_id}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Program <span className="text-red-500">*</span></Label>
										<Select value={formData.program_id} onValueChange={(v) => setFormData({ ...formData, program_id: v })}>
											<SelectTrigger className={`h-10 ${errors.program_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select program" />
											</SelectTrigger>
											<SelectContent>
												{programs.map((prog) => (
													<SelectItem key={prog.id} value={prog.id}>
														{prog.program_code} - {prog.program_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.program_id && <p className="text-xs text-destructive">{errors.program_id}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Degree</Label>
										<Select value={formData.degree_id} onValueChange={(v) => setFormData({ ...formData, degree_id: v })}>
											<SelectTrigger className="h-10">
												<SelectValue placeholder="Select degree (optional)" />
											</SelectTrigger>
											<SelectContent>
												{degrees.map((deg) => (
													<SelectItem key={deg.id} value={deg.id}>
														{deg.degree_code} - {deg.degree_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Semester <span className="text-red-500">*</span></Label>
										<Select value={formData.semester_id} onValueChange={(v) => setFormData({ ...formData, semester_id: v })}>
											<SelectTrigger className={`h-10 ${errors.semester_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select semester" />
											</SelectTrigger>
											<SelectContent>
												{semesters.map((sem) => (
													<SelectItem key={sem.id} value={sem.id}>
														{sem.semester_code} - {sem.semester_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.semester_id && <p className="text-xs text-destructive">{errors.semester_id}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Academic Year <span className="text-red-500">*</span></Label>
										<Select value={formData.academic_year_id} onValueChange={(v) => setFormData({ ...formData, academic_year_id: v })}>
											<SelectTrigger className={`h-10 ${errors.academic_year_id ? 'border-destructive' : ''}`}>
												<SelectValue placeholder="Select academic year" />
											</SelectTrigger>
											<SelectContent>
												{academicYears.map((ay) => (
													<SelectItem key={ay.id} value={ay.id}>
														{ay.year_code} - {ay.year_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{errors.academic_year_id && <p className="text-xs text-destructive">{errors.academic_year_id}</p>}
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Section</Label>
										<Select value={formData.section_id} onValueChange={(v) => setFormData({ ...formData, section_id: v })}>
											<SelectTrigger className="h-10">
												<SelectValue placeholder="Select section (optional)" />
											</SelectTrigger>
											<SelectContent>
												{sections.map((sec) => (
													<SelectItem key={sec.id} value={sec.id}>
														{sec.section_code} - {sec.section_name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Batch Year</Label>
										<Input
											type="number"
											value={formData.batch_year}
											onChange={(e) => setFormData({ ...formData, batch_year: e.target.value })}
											className="h-10"
											placeholder="e.g., 2024"
										/>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Status</Label>
										<Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
											<SelectTrigger className="h-10">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="active">Active</SelectItem>
												<SelectItem value="inactive">Inactive</SelectItem>
												<SelectItem value="suspended">Suspended</SelectItem>
												<SelectItem value="graduated">Graduated</SelectItem>
												<SelectItem value="dropout">Dropout</SelectItem>
												<SelectItem value="transferred">Transferred</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div>
							</TabsContent>

							{/* Education (10th/11th/12th) Tab */}
							<TabsContent value="education" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">10th Standard Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">School Name</Label>
										<Input value={formData.tenth_school_name} onChange={(e) => setFormData({ ...formData, tenth_school_name: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">School Place</Label>
										<Input value={formData.tenth_school_place} onChange={(e) => setFormData({ ...formData, tenth_school_place: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Board</Label>
										<Input value={formData.tenth_board} onChange={(e) => setFormData({ ...formData, tenth_board: e.target.value })} className="h-10" placeholder="e.g., CBSE, State Board" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Medium</Label>
										<Input value={formData.tenth_medium} onChange={(e) => setFormData({ ...formData, tenth_medium: e.target.value })} className="h-10" placeholder="e.g., English, Tamil" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Register Number</Label>
										<Input value={formData.tenth_register_number} onChange={(e) => setFormData({ ...formData, tenth_register_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Passing Year</Label>
										<Input type="number" value={formData.tenth_passing_year} onChange={(e) => setFormData({ ...formData, tenth_passing_year: e.target.value })} className="h-10" placeholder="e.g., 2022" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">11th Standard Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">School Name</Label>
										<Input value={formData.eleventh_school_name} onChange={(e) => setFormData({ ...formData, eleventh_school_name: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">School Place</Label>
										<Input value={formData.eleventh_school_place} onChange={(e) => setFormData({ ...formData, eleventh_school_place: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Board</Label>
										<Input value={formData.eleventh_board} onChange={(e) => setFormData({ ...formData, eleventh_board: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Passing Year</Label>
										<Input type="number" value={formData.eleventh_passing_year} onChange={(e) => setFormData({ ...formData, eleventh_passing_year: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">12th Standard Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">School Name</Label>
										<Input value={formData.twelfth_school_name} onChange={(e) => setFormData({ ...formData, twelfth_school_name: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">School Place</Label>
										<Input value={formData.twelfth_school_place} onChange={(e) => setFormData({ ...formData, twelfth_school_place: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Board</Label>
										<Input value={formData.twelfth_board} onChange={(e) => setFormData({ ...formData, twelfth_board: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Register Number</Label>
										<Input value={formData.twelfth_register_number} onChange={(e) => setFormData({ ...formData, twelfth_register_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Passing Year</Label>
										<Input type="number" value={formData.twelfth_passing_year} onChange={(e) => setFormData({ ...formData, twelfth_passing_year: e.target.value })} className="h-10" />
									</div>
								</div>
							</TabsContent>

							{/* Entrance Exam & UG Details Tab */}
							<TabsContent value="entrance" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Entrance Exam Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Entry Type</Label>
										<Input value={formData.entry_type} onChange={(e) => setFormData({ ...formData, entry_type: e.target.value })} className="h-10" placeholder="e.g., NEET, JEE, Direct" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">NEET Roll Number</Label>
										<Input value={formData.neet_roll_number} onChange={(e) => setFormData({ ...formData, neet_roll_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">NEET Score</Label>
										<Input type="number" value={formData.neet_score} onChange={(e) => setFormData({ ...formData, neet_score: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Medical Cutoff Marks</Label>
										<Input type="number" value={formData.medical_cutoff_marks} onChange={(e) => setFormData({ ...formData, medical_cutoff_marks: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Engineering Cutoff Marks</Label>
										<Input type="number" value={formData.engineering_cutoff_marks} onChange={(e) => setFormData({ ...formData, engineering_cutoff_marks: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Counseling Number</Label>
										<Input value={formData.counseling_number} onChange={(e) => setFormData({ ...formData, counseling_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">UG Degree Details (for PG learners)</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Qualifying Degree</Label>
										<Input value={formData.qualifying_degree} onChange={(e) => setFormData({ ...formData, qualifying_degree: e.target.value })} className="h-10" placeholder="e.g., B.E., B.Tech, B.Sc." />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">UG College</Label>
										<Input value={formData.ug_last_college} onChange={(e) => setFormData({ ...formData, ug_last_college: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">UG University</Label>
										<Input value={formData.ug_university} onChange={(e) => setFormData({ ...formData, ug_university: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">UG Passing Year</Label>
										<Input type="number" value={formData.ug_passing_year} onChange={(e) => setFormData({ ...formData, ug_passing_year: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">UG Total Percentage</Label>
										<Input type="number" value={formData.ug_total_percentage} onChange={(e) => setFormData({ ...formData, ug_total_percentage: e.target.value })} className="h-10" placeholder="e.g., 85.5" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">UG Class Obtained</Label>
										<Input value={formData.ug_class_obtained} onChange={(e) => setFormData({ ...formData, ug_class_obtained: e.target.value })} className="h-10" placeholder="e.g., First Class" />
									</div>
								</div>
							</TabsContent>

							{/* Accommodation & Financial Tab */}
							<TabsContent value="accommodation" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Accommodation & Transport</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Accommodation Type</Label>
										<Input value={formData.accommodation_type} onChange={(e) => setFormData({ ...formData, accommodation_type: e.target.value })} className="h-10" placeholder="e.g., Day Scholar, Hosteller" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Hostel Type</Label>
										<Input value={formData.hostel_type} onChange={(e) => setFormData({ ...formData, hostel_type: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Food Type</Label>
										<Input value={formData.food_type} onChange={(e) => setFormData({ ...formData, food_type: e.target.value })} className="h-10" placeholder="e.g., Veg, Non-Veg" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bus Route</Label>
										<Input value={formData.bus_route} onChange={(e) => setFormData({ ...formData, bus_route: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bus Pickup Location</Label>
										<Input value={formData.bus_pickup_location} onChange={(e) => setFormData({ ...formData, bus_pickup_location: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">Financial Details</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bank Beneficiary Name</Label>
										<Input value={formData.bank_beneficiary_name} onChange={(e) => setFormData({ ...formData, bank_beneficiary_name: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bank Account Number</Label>
										<Input value={formData.bank_account_number} onChange={(e) => setFormData({ ...formData, bank_account_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bank IFSC Code</Label>
										<Input value={formData.bank_ifsc_code} onChange={(e) => setFormData({ ...formData, bank_ifsc_code: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bank Name</Label>
										<Input value={formData.bank_name} onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bank Branch</Label>
										<Input value={formData.bank_branch} onChange={(e) => setFormData({ ...formData, bank_branch: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Fixed Fee (₹)</Label>
										<Input type="number" value={formData.fixed_fee} onChange={(e) => setFormData({ ...formData, fixed_fee: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Fee Payment Date</Label>
										<Input type="date" value={formData.fee_payment_date} onChange={(e) => setFormData({ ...formData, fee_payment_date: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Fee Amount Paid (₹)</Label>
										<Input type="number" value={formData.fee_amount_paid} onChange={(e) => setFormData({ ...formData, fee_amount_paid: e.target.value })} className="h-10" />
									</div>
								</div>
							</TabsContent>

							{/* Documents & Reference Tab */}
							<TabsContent value="documents" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Reference Information</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Reference Type</Label>
										<Input value={formData.reference_type} onChange={(e) => setFormData({ ...formData, reference_type: e.target.value })} className="h-10" placeholder="e.g., Alumni, Faculty, Advertisement" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Reference Name</Label>
										<Input value={formData.reference_name} onChange={(e) => setFormData({ ...formData, reference_name: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Reference Contact</Label>
										<Input value={formData.reference_contact} onChange={(e) => setFormData({ ...formData, reference_contact: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">Documents & Certificates</h3>
									</div>

									<div className="space-y-2 md:col-span-2">
										<Label className="text-sm font-semibold">Original Certificates Submitted (JSON Format)</Label>
										<Textarea
											value={formData.original_certificates_submitted}
											onChange={(e) => setFormData({ ...formData, original_certificates_submitted: e.target.value })}
											className="min-h-[80px]"
											placeholder='e.g., ["10th Certificate", "12th Certificate", "Transfer Certificate"]'
										/>
										<p className="text-xs text-muted-foreground">Enter JSON array format</p>
									</div>

									<div className="space-y-2 md:col-span-2">
										<Label className="text-sm font-semibold">Xerox Certificates Submitted (JSON Format)</Label>
										<Textarea
											value={formData.xerox_certificates_submitted}
											onChange={(e) => setFormData({ ...formData, xerox_certificates_submitted: e.target.value })}
											className="min-h-[80px]"
											placeholder='e.g., ["Aadhar Copy", "Community Certificate", "Income Certificate"]'
										/>
										<p className="text-xs text-muted-foreground">Enter JSON array format</p>
									</div>
								</div>
							</TabsContent>

							{/* Other Tab */}
							<TabsContent value="other" className="space-y-4 mt-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1">Demographics</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Nationality</Label>
										<Input value={formData.nationality} onChange={(e) => setFormData({ ...formData, nationality: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Religion</Label>
										<Input value={formData.religion} onChange={(e) => setFormData({ ...formData, religion: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Community</Label>
										<Input value={formData.community} onChange={(e) => setFormData({ ...formData, community: e.target.value })} className="h-10" placeholder="e.g., BC, MBC, SC, ST, OC" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Caste</Label>
										<Input value={formData.caste} onChange={(e) => setFormData({ ...formData, caste: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Sub Caste</Label>
										<Input value={formData.sub_caste} onChange={(e) => setFormData({ ...formData, sub_caste: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Aadhar Number</Label>
										<Input value={formData.aadhar_number} onChange={(e) => setFormData({ ...formData, aadhar_number: e.target.value })} className="h-10" placeholder="12-digit Aadhar" maxLength={12} />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">EMIS Number</Label>
										<Input value={formData.emis_number} onChange={(e) => setFormData({ ...formData, emis_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">Category & Status</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Quota</Label>
										<Input value={formData.quota} onChange={(e) => setFormData({ ...formData, quota: e.target.value })} className="h-10" placeholder="e.g., Government, Management" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Category</Label>
										<Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="h-10" placeholder="e.g., General, OBC, SC, ST" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Disability Type</Label>
										<Input value={formData.disability_type} onChange={(e) => setFormData({ ...formData, disability_type: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Disability Percentage</Label>
										<Input type="number" value={formData.disability_percentage} onChange={(e) => setFormData({ ...formData, disability_percentage: e.target.value })} className="h-10" placeholder="e.g., 40" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Sports Quota</Label>
										<Input value={formData.sports_quota} onChange={(e) => setFormData({ ...formData, sports_quota: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">NCC Number</Label>
										<Input value={formData.ncc_number} onChange={(e) => setFormData({ ...formData, ncc_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">NSS Number</Label>
										<Input value={formData.nss_number} onChange={(e) => setFormData({ ...formData, nss_number: e.target.value })} className="h-10" />
									</div>

									<div className="space-y-2 md:col-span-2">
										<h3 className="text-sm font-bold text-blue-600 border-b pb-1 mt-4">Boolean Flags</h3>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">First Graduate</Label>
										<div className="flex items-center gap-3 h-10">
											<button
												type="button"
												onClick={() => setFormData({ ...formData, first_graduate: !formData.first_graduate })}
												className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.first_graduate ? 'bg-green-500' : 'bg-gray-300'}`}
											>
												<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.first_graduate ? 'translate-x-6' : 'translate-x-1'}`} />
											</button>
											<span className={`text-sm font-medium ${formData.first_graduate ? 'text-green-600' : 'text-gray-500'}`}>
												{formData.first_graduate ? 'Yes' : 'No'}
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Hostelite</Label>
										<div className="flex items-center gap-3 h-10">
											<button
												type="button"
												onClick={() => setFormData({ ...formData, is_hostelite: !formData.is_hostelite })}
												className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_hostelite ? 'bg-green-500' : 'bg-gray-300'}`}
											>
												<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_hostelite ? 'translate-x-6' : 'translate-x-1'}`} />
											</button>
											<span className={`text-sm font-medium ${formData.is_hostelite ? 'text-green-600' : 'text-gray-500'}`}>
												{formData.is_hostelite ? 'Yes' : 'No'}
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bus User</Label>
										<div className="flex items-center gap-3 h-10">
											<button
												type="button"
												onClick={() => setFormData({ ...formData, is_bus_user: !formData.is_bus_user })}
												className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.is_bus_user ? 'bg-green-500' : 'bg-gray-300'}`}
											>
												<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.is_bus_user ? 'translate-x-6' : 'translate-x-1'}`} />
											</button>
											<span className={`text-sm font-medium ${formData.is_bus_user ? 'text-green-600' : 'text-gray-500'}`}>
												{formData.is_bus_user ? 'Yes' : 'No'}
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Bus Required</Label>
										<div className="flex items-center gap-3 h-10">
											<button
												type="button"
												onClick={() => setFormData({ ...formData, bus_required: !formData.bus_required })}
												className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.bus_required ? 'bg-green-500' : 'bg-gray-300'}`}
											>
												<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.bus_required ? 'translate-x-6' : 'translate-x-1'}`} />
											</button>
											<span className={`text-sm font-medium ${formData.bus_required ? 'text-green-600' : 'text-gray-500'}`}>
												{formData.bus_required ? 'Yes' : 'No'}
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Counseling Applied</Label>
										<div className="flex items-center gap-3 h-10">
											<button
												type="button"
												onClick={() => setFormData({ ...formData, counseling_applied: !formData.counseling_applied })}
												className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.counseling_applied ? 'bg-green-500' : 'bg-gray-300'}`}
											>
												<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.counseling_applied ? 'translate-x-6' : 'translate-x-1'}`} />
											</button>
											<span className={`text-sm font-medium ${formData.counseling_applied ? 'text-green-600' : 'text-gray-500'}`}>
												{formData.counseling_applied ? 'Yes' : 'No'}
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<Label className="text-sm font-semibold">Admission Status</Label>
										<Input value={formData.admission_status} onChange={(e) => setFormData({ ...formData, admission_status: e.target.value })} className="h-10" placeholder="e.g., Confirmed, Provisional" />
									</div>
								</div>
							</TabsContent>
						</Tabs>

						<div className="flex justify-end gap-2 mt-6 pt-4 border-t">
							<Button variant="outline" onClick={() => setSheetOpen(false)}>
								Cancel
							</Button>
							<Button onClick={handleSave}>
								{editing ? 'Update' : 'Create'} Learner
							</Button>
						</div>
					</SheetContent>
				</Sheet>

				{/* Delete Confirmation Dialog */}
				<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Are you sure?</AlertDialogTitle>
							<AlertDialogDescription>
								This will permanently delete this learner record. This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>

				<AppFooter />
			</SidebarInset>
		</SidebarProvider>
	)
}
