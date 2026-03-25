export function validateExam-roomsData(data: any): Record<string, string> {
	const errors: Record<string, string> = {}

	// TODO: Add validation rules based on your requirements
	// Example:
	// if (!data.name?.trim()) errors.name = "Name is required"
	// if (!data.code?.trim()) errors.code = "Code is required"

	// Email validation example
	// if (data.email && data.email.trim()) {
	//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
	//   if (!emailRegex.test(data.email)) {
	//     errors.email = "Invalid email format"
	//   }
	// }

	return errors
}

export function validateExam-roomsImport(data: any, rowIndex: number): string[] {
	const errors: string[] = []

	// TODO: Add import validation rules
	// Example:
	// if (!data.name || data.name.toString().trim() === '') {
	//   errors.push('Name is required')
	// }

	return errors
}
