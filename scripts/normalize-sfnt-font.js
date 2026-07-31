#!/usr/bin/env node
/**
 * Repair a legacy TTF/OTF so Chromium's OpenType Sanitizer (OTS) accepts it.
 *
 * Old Tamil faces (Bamini, and many TSCII fonts of that era) ship a malformed
 * sfnt header — wrong searchRange/entrySelector/rangeShift and tables that are
 * not 4-byte aligned. Chromium silently refuses them ("Failed to decode
 * downloaded font" / "OTS parsing error"), so the text falls back to a Latin
 * face and prints as raw English letters instead of Tamil.
 *
 * This rewrites the table directory with correct binary-search fields, re-lays
 * every table on a 4-byte boundary with zero padding, and recomputes all
 * checksums including head.checkSumAdjustment. Glyph data is untouched — no
 * dependencies, no re-encoding.
 *
 * Usage:  node scripts/normalize-sfnt-font.js public/fonts/tamil/Bamini.ttf [out.ttf]
 */

const fs = require('fs')

const CHECKSUM_MAGIC = 0xb1b0afba

function checksum(buf) {
	let sum = 0
	for (let i = 0; i < buf.length; i += 4) sum = (sum + buf.readUInt32BE(i)) >>> 0
	return sum
}

function pad4(buf) {
	const rem = buf.length % 4
	return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem)])
}

/**
 * Clamp cmap subtable `length` fields that claim more bytes than the cmap table
 * actually holds. Bamini declares 2136 bytes for a format-4 subtable that has 642
 * — OTS reports "Over long cmap subtable" and rejects the whole font. The real
 * segment/glyph data is intact; only the length field lies.
 * Returns the number of subtables repaired.
 */
function repairCmapLengths(cmap) {
	if (cmap.length < 4) return 0
	const numSubtables = cmap.readUInt16BE(2)
	let fixed = 0
	for (let i = 0; i < numSubtables; i++) {
		const rec = 4 + i * 8
		if (rec + 8 > cmap.length) break
		const subOffset = cmap.readUInt32BE(rec + 4)
		if (subOffset + 4 > cmap.length) continue
		const declared = cmap.readUInt16BE(subOffset + 2)
		const available = cmap.length - subOffset
		if (declared > available) {
			cmap.writeUInt16BE(available, subOffset + 2)
			fixed++
		}
	}
	return fixed
}

function normalizeSfnt(input) {
	const version = input.readUInt32BE(0)
	if (version !== 0x00010000 && version !== 0x4f54544f /* OTTO */ && version !== 0x74727565 /* true */) {
		throw new Error(`not a plain sfnt font (version 0x${version.toString(16)})`)
	}
	const numTables = input.readUInt16BE(4)

	const tables = []
	for (let i = 0; i < numTables; i++) {
		const rec = 12 + i * 16
		const tag = input.toString('latin1', rec, rec + 4)
		const offset = input.readUInt32BE(rec + 8)
		const length = input.readUInt32BE(rec + 12)
		if (offset + length > input.length) {
			// Truncated final table (common in these fonts) — take what exists.
			tables.push({ tag, data: pad4(input.subarray(offset, input.length)) })
		} else {
			tables.push({ tag, data: pad4(input.subarray(offset, offset + length)) })
		}
		tables[tables.length - 1].length =
			offset + length > input.length ? input.length - offset : length
	}
	// The spec requires directory entries sorted by tag.
	tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))

	// Repair over-long cmap subtable lengths (checked against the REAL table
	// length, not the 4-byte padding we just added).
	let cmapFixes = 0
	const cmap = tables.find((t) => t.tag === 'cmap')
	if (cmap) {
		cmap.data = Buffer.from(cmap.data)
		cmapFixes = repairCmapLengths(cmap.data.subarray(0, cmap.length))
	}

	// head.checkSumAdjustment must be zero while checksums are computed.
	const head = tables.find((t) => t.tag === 'head')
	if (head) {
		head.data = Buffer.from(head.data)
		head.data.writeUInt32BE(0, 8)
	}

	const entrySelector = Math.floor(Math.log2(numTables))
	const searchRange = 16 * 2 ** entrySelector
	const rangeShift = numTables * 16 - searchRange

	const dir = Buffer.alloc(12 + numTables * 16)
	dir.writeUInt32BE(version, 0)
	dir.writeUInt16BE(numTables, 4)
	dir.writeUInt16BE(searchRange, 6)
	dir.writeUInt16BE(entrySelector, 8)
	dir.writeUInt16BE(rangeShift, 10)

	let offset = dir.length // already a multiple of 4
	tables.forEach((t, i) => {
		const rec = 12 + i * 16
		dir.write(t.tag, rec, 4, 'latin1')
		dir.writeUInt32BE(checksum(t.data), rec + 4)
		dir.writeUInt32BE(offset, rec + 8)
		dir.writeUInt32BE(t.length, rec + 12) // real length, data padded to 4
		offset += t.data.length
	})

	const out = Buffer.concat([dir, ...tables.map((t) => t.data)])

	if (head) {
		const headEntry = tables.findIndex((t) => t.tag === 'head')
		const headOffset = out.readUInt32BE(12 + headEntry * 16 + 8)
		const adjustment = (CHECKSUM_MAGIC - checksum(out)) >>> 0
		out.writeUInt32BE(adjustment, headOffset + 8)
	}
	return { out, tables, searchRange, entrySelector, rangeShift, cmapFixes }
}

const [, , inPath, outPath] = process.argv
if (!inPath) {
	console.error('usage: node scripts/normalize-sfnt-font.js <font.ttf> [out.ttf]')
	process.exit(1)
}
const input = fs.readFileSync(inPath)
const { out, tables, searchRange, entrySelector, rangeShift, cmapFixes } = normalizeSfnt(input)
const target = outPath || inPath
fs.writeFileSync(target, out)
console.log(
	`${inPath}: ${tables.length} tables, ${input.length} → ${out.length} bytes ` +
		`(searchRange=${searchRange}, entrySelector=${entrySelector}, rangeShift=${rangeShift}, ` +
		`cmap subtables repaired: ${cmapFixes}) → ${target}`
)
