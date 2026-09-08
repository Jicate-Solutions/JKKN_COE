'use client'

// Signature capture for the submission wizard.
//
// The examiner signs with a mouse, a stylus or a finger. Pointer events are used
// rather than separate mouse/touch handlers so a tablet — the likeliest device
// for actually signing — behaves the same as a laptop with no extra code.
//
// The specimen signature already on the examiner's profile can be adopted with
// one click, so someone who has uploaded a scan is not made to draw again. An
// image of the signature (a scan or a photo) can also be attached directly —
// it is fitted onto the pad and leaves through the same PNG export, so the
// server sees no difference between a drawn and an uploaded signature.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Eraser, PenLine, ImageIcon, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
	/** Called with a PNG data URL whenever the drawing changes, null when cleared. */
	onChange: (dataUrl: string | null) => void
	/** Specimen signature on the profile, offered as "use my saved signature". */
	savedSignatureUrl?: string | null
	disabled?: boolean
	className?: string
}

/** Canvas backing-store size. Fixed so the exported PNG is the same everywhere. */
const WIDTH = 900
const HEIGHT = 300

const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** Raw upload cap. The pad re-encodes to a 900×300 PNG, so this only bounds decode work. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export function SignaturePad({ onChange, savedSignatureUrl, disabled, className }: Props) {
	const canvasRef = useRef<HTMLCanvasElement | null>(null)
	const drawing = useRef(false)
	const dirty = useRef(false)
	const [hasInk, setHasInk] = useState(false)
	const [source, setSource] = useState<'drawn' | 'saved' | 'uploaded' | null>(null)
	const [uploadError, setUploadError] = useState<string | null>(null)
	const [dragOver, setDragOver] = useState(false)
	const fileInputRef = useRef<HTMLInputElement | null>(null)

	const ctx = useCallback(() => {
		const c = canvasRef.current
		if (!c) return null
		const g = c.getContext('2d')
		if (!g) return null
		g.lineCap = 'round'
		g.lineJoin = 'round'
		g.lineWidth = 3
		g.strokeStyle = '#111827'
		return g
	}, [])

	// A canvas is transparent until painted; exporting that gives a PNG that
	// disappears on the claim form's white paper. Paint the sheet white once.
	useEffect(() => {
		const g = ctx()
		if (!g) return
		g.fillStyle = '#ffffff'
		g.fillRect(0, 0, WIDTH, HEIGHT)
	}, [ctx])

	/** Pointer position in BACKING-STORE pixels, not CSS pixels. */
	const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const c = canvasRef.current!
		const rect = c.getBoundingClientRect()
		return {
			x: ((e.clientX - rect.left) / rect.width) * WIDTH,
			y: ((e.clientY - rect.top) / rect.height) * HEIGHT,
		}
	}

	const emit = useCallback(() => {
		const c = canvasRef.current
		if (!c) return
		onChange(dirty.current ? c.toDataURL('image/png') : null)
	}, [onChange])

	const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (disabled) return
		const g = ctx()
		if (!g) return
		// Capture the pointer so a stroke that wanders off the canvas still ends
		// cleanly instead of leaving the pad stuck in drawing mode.
		e.currentTarget.setPointerCapture(e.pointerId)
		drawing.current = true
		const { x, y } = pointAt(e)
		g.beginPath()
		g.moveTo(x, y)
	}

	const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!drawing.current || disabled) return
		const g = ctx()
		if (!g) return
		const { x, y } = pointAt(e)
		g.lineTo(x, y)
		g.stroke()
		if (!dirty.current) {
			dirty.current = true
			setHasInk(true)
			setSource('drawn')
		}
	}

	const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!drawing.current) return
		drawing.current = false
		try {
			e.currentTarget.releasePointerCapture(e.pointerId)
		} catch {
			/* the pointer may already be gone */
		}
		emit()
	}

	const clear = () => {
		const g = ctx()
		if (!g) return
		g.fillStyle = '#ffffff'
		g.fillRect(0, 0, WIDTH, HEIGHT)
		dirty.current = false
		setHasInk(false)
		setSource(null)
		setUploadError(null)
		if (fileInputRef.current) fileInputRef.current.value = ''
		onChange(null)
	}

	/** Paint an image onto a fresh white sheet, fitted and centred, then export. */
	const placeImage = useCallback(
		(img: HTMLImageElement, from: 'saved' | 'uploaded') => {
			const g = ctx()
			if (!g) return
			g.fillStyle = '#ffffff'
			g.fillRect(0, 0, WIDTH, HEIGHT)
			// Fit inside the pad without distorting the signature. Small scans are
			// enlarged a little so a phone photo does not end up as a thumbnail.
			const scale = Math.min(WIDTH / img.width, HEIGHT / img.height, 2)
			const w = img.width * scale
			const h = img.height * scale
			g.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h)
			dirty.current = true
			setHasInk(true)
			setSource(from)
			setUploadError(null)
			emit()
		},
		[ctx, emit]
	)

	/** Attach an image file of the signature (scan or photo). */
	const loadFile = (file: File | null | undefined) => {
		if (!file || disabled) return
		if (!ACCEPTED_TYPES.includes(file.type)) {
			setUploadError('Use a PNG, JPG or WebP image of your signature.')
			return
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			setUploadError('That image is larger than 5 MB. Use a smaller scan or photo.')
			return
		}
		const url = URL.createObjectURL(file)
		const img = new window.Image()
		img.onload = () => {
			placeImage(img, 'uploaded')
			URL.revokeObjectURL(url)
		}
		img.onerror = () => {
			URL.revokeObjectURL(url)
			setUploadError('That image could not be read. Try another file.')
		}
		img.src = url
	}

	/**
	 * Draw the profile's specimen signature onto the pad.
	 *
	 * The signed URL is same-origin Supabase storage, so the canvas is not
	 * tainted and toDataURL still works; crossOrigin is set anyway so a CDN in
	 * front of it would not silently break the export.
	 */
	const useSaved = () => {
		if (!savedSignatureUrl) return
		const img = new window.Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => placeImage(img, 'saved')
		img.onerror = () => {
			// Leave the pad as it was; the examiner can still sign by hand.
			console.warn('[Examiner portal] saved signature could not be loaded')
		}
		img.src = savedSignatureUrl
	}

	return (
		<div className={cn('space-y-2', className)}>
			<div
				className={cn(
					'relative rounded-md border-2 border-dashed bg-white transition-colors',
					disabled ? 'opacity-60' : dragOver ? 'border-emerald-500 bg-emerald-50/40' : 'border-slate-300'
				)}
				onDragOver={e => {
					if (disabled) return
					e.preventDefault()
					setDragOver(true)
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={e => {
					e.preventDefault()
					setDragOver(false)
					loadFile(e.dataTransfer.files?.[0])
				}}
			>
				<canvas
					ref={canvasRef}
					width={WIDTH}
					height={HEIGHT}
					onPointerDown={start}
					onPointerMove={move}
					onPointerUp={end}
					onPointerLeave={end}
					onPointerCancel={end}
					className={cn(
						'w-full h-[150px] sm:h-[180px] rounded-md',
						// touch-none stops the browser scrolling the page while a finger
						// is drawing — without it a signature on a phone is impossible.
						'touch-none',
						disabled ? 'cursor-not-allowed' : 'cursor-crosshair'
					)}
				/>
				{!hasInk && (
					<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-slate-400">
						<PenLine className="h-5 w-5 mb-1" />
						<span className="text-xs">Sign here, or drop an image of your signature</span>
					</div>
				)}
				{/* Signature rule, the way a printed form has one. */}
				<div className="pointer-events-none absolute inset-x-8 bottom-7 border-b border-slate-200" />
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<Button type="button" variant="outline" size="sm" onClick={clear} disabled={disabled || !hasInk}>
					<Eraser className="h-4 w-4 mr-1.5" />
					Clear
				</Button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => fileInputRef.current?.click()}
					disabled={disabled}
				>
					<Upload className="h-4 w-4 mr-1.5" />
					Attach signature image
				</Button>
				<input
					ref={fileInputRef}
					type="file"
					accept={ACCEPTED_TYPES.join(',')}
					className="hidden"
					onChange={e => loadFile(e.target.files?.[0])}
				/>
				{savedSignatureUrl && (
					<Button type="button" variant="outline" size="sm" onClick={useSaved} disabled={disabled}>
						<ImageIcon className="h-4 w-4 mr-1.5" />
						Use my saved signature
					</Button>
				)}
				{source === 'saved' && (
					<span className="text-xs text-muted-foreground">Your specimen signature has been placed above.</span>
				)}
				{source === 'uploaded' && (
					<span className="text-xs text-muted-foreground">Your signature image has been placed above.</span>
				)}
			</div>
			{uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
			<p className="text-xs text-muted-foreground">
				PNG, JPG or WebP up to 5 MB. A clear signature on a plain white background scans best.
			</p>
		</div>
	)
}
