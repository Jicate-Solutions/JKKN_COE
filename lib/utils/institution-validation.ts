export function validateInstitutionData(data: any, rowIndex: number): string[] {
  const errors: string[] = []

  // Required field validations
  if (!data.institution_code || data.institution_code.trim() === '') {
    errors.push('Institution Code is required')
  } else if (data.institution_code.length > 50) {
    errors.push('Institution Code must be 50 characters or less')
  }

  if (!data.name || data.name.trim() === '') {
    errors.push('Institution Name is required')
  } else if (data.name.length > 200) {
    errors.push('Institution Name must be 200 characters or less')
  }

  // Email validation
  if (data.email && data.email.trim() !== '') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      errors.push('Email format is invalid')
    } else if (data.email.length > 100) {
      errors.push('Email must be 100 characters or less')
    }
  }

  // Phone validation
  if (data.phone && data.phone.trim() !== '') {
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,15}$/
    if (!phoneRegex.test(data.phone)) {
      errors.push('Phone number format is invalid (use 10-15 digits with optional +, spaces, hyphens, parentheses)')
    }
  }

  // Website validation
  if (data.website && data.website.trim() !== '') {
    try {
      new URL(data.website)
    } catch {
      errors.push('Website URL format is invalid')
    }
    if (data.website.length > 255) {
      errors.push('Website URL must be 255 characters or less')
    }
  }

  // PIN Code validation
  if (data.pin_code && data.pin_code.trim() !== '') {
    const pinRegex = /^[0-9]{6}$/
    if (!pinRegex.test(data.pin_code)) {
      errors.push('PIN Code must be exactly 6 digits')
    }
  }

  // Institution Type validation
  if (data.institution_type && data.institution_type.trim() !== '') {
    const validTypes = ['university', 'college', 'school', 'institute']
    if (!validTypes.includes(data.institution_type)) {
      errors.push(`Institution Type must be one of: ${validTypes.join(', ')}`)
    }
  }

  // Timetable Type validation
  if (data.timetable_type && data.timetable_type.trim() !== '') {
    const validTypes = ['week_order', 'day_order', 'custom']
    if (!validTypes.includes(data.timetable_type)) {
      errors.push(`Timetable Type must be one of: ${validTypes.join(', ')}`)
    }
  }

  // Status validation
  if (data.is_active !== undefined && data.is_active !== null) {
    if (typeof data.is_active !== 'boolean') {
      const statusValue = String(data.is_active).toLowerCase()
      if (statusValue !== 'true' && statusValue !== 'false' && statusValue !== 'active' && statusValue !== 'inactive') {
        errors.push('Status must be true/false or Active/Inactive')
      }
    }
  }

  // String length validations
  const stringFields = [
    { field: 'counselling_code', maxLength: 50, name: 'Counselling Code' },
    { field: 'accredited_by', maxLength: 100, name: 'Accredited By' },
    { field: 'address_line1', maxLength: 255, name: 'Address Line 1' },
    { field: 'address_line2', maxLength: 255, name: 'Address Line 2' },
    { field: 'address_line3', maxLength: 255, name: 'Address Line 3' },
    { field: 'city', maxLength: 100, name: 'City' },
    { field: 'state', maxLength: 100, name: 'State' },
    { field: 'country', maxLength: 100, name: 'Country' },
    { field: 'logo_url', maxLength: 500, name: 'Logo URL' }
  ]

  stringFields.forEach(({ field, maxLength, name }) => {
    if (data[field] && data[field].length > maxLength) {
      errors.push(`${name} must be ${maxLength} characters or less`)
    }
  })

  return errors
}
