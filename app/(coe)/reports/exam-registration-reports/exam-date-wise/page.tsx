"use client"

import { CalendarDays } from "lucide-react"
import { ExamRegistrationReportsView } from "@/components/reports/exam-registration-reports-view"

export default function ExamDateWiseReportPage() {
	return (
		<ExamRegistrationReportsView
			category="exam-date"
			pageTitle="Exam Date Wise Report"
			pageDescription="Date-wise exam timetable, QP packing list, registration and attendance counts grouped by exam date and session"
			breadcrumbLabel="Exam Date Wise Report"
			headerIcon={CalendarDays}
			headerGradient="from-blue-500 to-indigo-600"
		/>
	)
}
