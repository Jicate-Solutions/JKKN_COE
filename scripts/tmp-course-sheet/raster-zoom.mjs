import puppeteer from 'puppeteer'
import { readFileSync, writeFileSync } from 'node:fs'
const [pdfPath, outPrefix] = process.argv.slice(2)
const b64 = readFileSync(pdfPath).toString('base64')
const browser = await puppeteer.launch({ headless: true })
const page = await browser.newPage()
await page.setContent(`<html><body></body></html>`)
await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js' })
const result = await page.evaluate(async (b64) => {
	const pdfjsLib = window['pdfjs-dist/build/pdf']
	pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
	const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
	const pdf = await pdfjsLib.getDocument({ data: arr }).promise
	const out = []
	for (let p = 1; p <= pdf.numPages; p++) {
		const pg = await pdf.getPage(p)
		const vp = pg.getViewport({ scale: 5 })
		const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height
		await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise
		const cc = document.createElement('canvas'); cc.width = 1700; cc.height = 900; cc.getContext('2d').drawImage(c, 100, 2300, 1700, 900, 0, 0, 1700, 900); out.push(cc.toDataURL('image/png')); break
	}
	return out
}, b64)
result.forEach((d, i) => writeFileSync(`${outPrefix}-p${i + 1}.png`, Buffer.from(d.split(',')[1], 'base64')))
console.log('pages', result.length)
await browser.close()
