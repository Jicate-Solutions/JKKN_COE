"""
Automated marks bulk upload workflow.

Navigates to the bulk upload page, selects filters, and uploads a file.
"""
import asyncio

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_authenticated_page


async def upload_marks(
	file_path: str,
	marks_type: str = 'internal',
	role: str = 'coe',
):
	"""Upload marks file to the bulk upload page.

	Args:
		file_path: Path to the Excel/CSV file to upload
		marks_type: 'internal' for bulk internal marks, 'external' for external mark bulk
		role: Role to login as
	"""
	route_key = 'bulk_internal_marks' if marks_type == 'internal' else 'external_mark_bulk'

	pw, browser, page = await create_authenticated_page(role)

	try:
		await page.goto(
			f'{Settings.BASE_URL}{ROUTES[route_key]}',
			timeout=Settings.NAVIGATION_TIMEOUT,
		)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)

		# Select first available option in each combobox filter
		comboboxes = page.locator('button[role="combobox"]')
		count = await comboboxes.count()

		for i in range(count):
			cb = comboboxes.nth(i)
			cb_text = await cb.inner_text()
			if 'Select' in cb_text:
				await cb.click()
				await asyncio.sleep(1)

				option = page.locator('[role="option"]:not([data-disabled])').first
				if await option.count() > 0:
					await option.click()
					await asyncio.sleep(2)

		# Look for file input
		file_input = page.locator('input[type="file"]')
		if await file_input.count() > 0:
			await file_input.set_input_files(file_path)
			print(f'File selected: {file_path}')
			await asyncio.sleep(2)

			# Look for upload/submit button
			upload_btn = page.locator('button:has-text("Upload"), button:has-text("Import"), button:has-text("Submit")')
			if await upload_btn.count() > 0:
				# Take screenshot before upload
				Settings.ensure_dirs()
				await page.screenshot(
					path=str(Settings.SCREENSHOTS_DIR / f'marks_upload_{marks_type}_ready.png'),
					full_page=True,
				)
				print('Upload button found - ready to upload')
				# Uncomment to actually upload:
				# await upload_btn.first.click()
				return {'status': 'ready'}

		print('No file input found on page')
		Settings.ensure_dirs()
		await page.screenshot(
			path=str(Settings.SCREENSHOTS_DIR / f'marks_upload_{marks_type}_no_input.png'),
			full_page=True,
		)
		return {'status': 'no_file_input'}

	finally:
		await browser.close()
		await pw.stop()


if __name__ == '__main__':
	import sys as _sys
	if len(_sys.argv) < 2:
		print('Usage: python marks_bulk_upload.py <file_path> [internal|external]')
		_sys.exit(1)

	file_path = _sys.argv[1]
	marks_type = _sys.argv[2] if len(_sys.argv) > 2 else 'internal'
	result = asyncio.run(upload_marks(file_path, marks_type))
	print(f'Result: {result}')
