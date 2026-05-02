'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function CentralValuationPage() {
	const router = useRouter()
	useEffect(() => {
		router.replace('/post-exam/central-valuation/dates')
	}, [router])
	return null
}
