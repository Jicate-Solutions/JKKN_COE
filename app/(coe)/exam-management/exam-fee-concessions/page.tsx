import { redirect } from 'next/navigation'

// Fee concessions are a tab of Final Exam Registration Approval
export default function ExamFeeConcessionsPage() {
	redirect('/exam-management/exam-registration-final-approval?tab=concession')
}
