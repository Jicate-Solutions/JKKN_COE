import type { Institution, InstitutionFormData, MergedInstitution } from '@/types/institutions'

// Fetch institutions with MyJKKN data merged (filtered to only show matched institutions)
export async function fetchInstitutions(): Promise<MergedInstitution[]> {
  const response = await fetch('/api/master/institutions')
  if (!response.ok) {
    throw new Error('Failed to fetch institutions')
  }
  return response.json()
}

// Fetch only local institutions without MyJKKN merge (for internal use)
export async function fetchLocalInstitutions(): Promise<Institution[]> {
  const response = await fetch('/api/master/institutions?local_only=true')
  if (!response.ok) {
    throw new Error('Failed to fetch local institutions')
  }
  return response.json()
}

export async function createInstitution(data: InstitutionFormData): Promise<Institution> {
  const response = await fetch('/api/master/institutions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to create institution')
  }

  return response.json()
}

export async function updateInstitution(id: string, data: InstitutionFormData): Promise<Institution> {
  const response = await fetch('/api/master/institutions', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id,
      ...data
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to update institution')
  }

  return response.json()
}

export async function deleteInstitution(id: string): Promise<void> {
  const response = await fetch(`/api/master/institutions?id=${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Failed to delete institution')
  }
}
