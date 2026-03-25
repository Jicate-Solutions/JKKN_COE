/**
 * Logo Upload API Route
 *
 * POST /api/upload/logo - Upload a logo image
 *
 * Handles file uploads for PDF settings logos.
 * Saves files to public/logo directory with auto-generated names based on institution.
 */

import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

// Maximum file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024

// Allowed file types
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml']

// Sanitize filename to remove special characters
function sanitizeFilename(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '')
}

// Get file extension from mime type
function getExtension(mimeType: string): string {
	const extensions: Record<string, string> = {
		'image/png': 'png',
		'image/jpeg': 'jpg',
		'image/jpg': 'jpg',
		'image/gif': 'gif',
		'image/webp': 'webp',
		'image/svg+xml': 'svg',
	}
	return extensions[mimeType] || 'png'
}

export async function POST(request: NextRequest) {
	try {
		const formData = await request.formData()
		const file = formData.get('file') as File | null
		const institutionCode = formData.get('institution_code') as string | null
		const logoType = formData.get('logo_type') as string | null // 'primary' or 'secondary'

		// Validate file presence
		if (!file) {
			return NextResponse.json({ error: 'No file provided' }, { status: 400 })
		}

		// Validate file type
		if (!ALLOWED_TYPES.includes(file.type)) {
			return NextResponse.json(
				{
					error: `Invalid file type. Allowed types: PNG, JPEG, GIF, WebP, SVG`,
				},
				{ status: 400 }
			)
		}

		// Validate file size
		if (file.size > MAX_FILE_SIZE) {
			return NextResponse.json(
				{
					error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
				},
				{ status: 400 }
			)
		}

		// Generate filename
		const timestamp = Date.now()
		const sanitizedInstitution = institutionCode ? sanitizeFilename(institutionCode) : 'default'
		const suffix = logoType === 'secondary' ? '_secondary' : ''
		const extension = getExtension(file.type)
		const filename = `${sanitizedInstitution}${suffix}_${timestamp}.${extension}`

		// Ensure upload directory exists
		const uploadDir = path.join(process.cwd(), 'public', 'logo')
		if (!existsSync(uploadDir)) {
			await mkdir(uploadDir, { recursive: true })
		}

		// Convert file to buffer and save
		const bytes = await file.arrayBuffer()
		const buffer = Buffer.from(bytes)

		const filePath = path.join(uploadDir, filename)
		await writeFile(filePath, buffer)

		// Return the public URL
		const publicUrl = `/logo/${filename}`

		return NextResponse.json({
			success: true,
			url: publicUrl,
			filename,
			size: file.size,
			type: file.type,
		})
	} catch (error) {
		console.error('Logo upload error:', error)
		return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 })
	}
}

// GET endpoint to list available logos
export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url)
		const institutionCode = searchParams.get('institution_code')

		const uploadDir = path.join(process.cwd(), 'public', 'logo')

		if (!existsSync(uploadDir)) {
			return NextResponse.json({ logos: [] })
		}

		const { readdir, stat } = await import('fs/promises')
		const files = await readdir(uploadDir)

		// Filter by institution if provided
		let filteredFiles = files.filter((f) => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f))

		if (institutionCode) {
			const sanitized = sanitizeFilename(institutionCode)
			filteredFiles = filteredFiles.filter((f) => f.startsWith(sanitized))
		}

		// Get file info
		const logos = await Promise.all(
			filteredFiles.map(async (filename) => {
				const filePath = path.join(uploadDir, filename)
				const stats = await stat(filePath)
				return {
					filename,
					url: `/logo/${filename}`,
					size: stats.size,
					createdAt: stats.birthtime,
				}
			})
		)

		// Sort by creation date (newest first)
		logos.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

		return NextResponse.json({ logos })
	} catch (error) {
		console.error('Logo list error:', error)
		return NextResponse.json({ error: 'Failed to list logos' }, { status: 500 })
	}
}
