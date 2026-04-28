"use client"

import { ClipboardCheck } from "lucide-react"
import { ExamRegistrationReportsView } from "@/components/reports/exam-registration-reports-view"

export default function BoardWiseReportPage() {
	return (
		<ExamRegistrationReportsView
			category="registration"
			pageTitle="Board Wise Report"
			pageDescription="Board-wise registration counts, course lists, and program-wise exam registration reports"
			breadcrumbLabel="Board Wise Report"
			headerIcon={ClipboardCheck}
			headerGradient="from-emerald-500 to-teal-600"
		/>
	)
}
