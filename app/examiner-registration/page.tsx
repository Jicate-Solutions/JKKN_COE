import { redirect } from 'next/navigation'

// Redirect old URL to institution-specific URL
export default function ExaminerRegistrationRedirect() {
	redirect('/arts-examiner-registration')
}
