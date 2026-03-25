"""
End-to-end examination session management workflow.

Covers: Create session -> Configure timetable -> Register learners
"""
import asyncio

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_authenticated_page


async def discover_exam_session_form(role: str = 'super_admin'):
	"""Navigate to exam sessions and discover form structure.

	This is a reconnaissance step before automating creation.
	"""
	pw, browser, page = await create_authenticated_page(role)

	try:
		await page.goto(
			f'{Settings.BASE_URL}{ROUTES["exam_sessions"]}',
			timeout=Settings.NAVIGATION_TIMEOUT,
		)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)

		# Count existing sessions
		table_rows = page.locator('tbody tr')
		row_count = await table_rows.count()
		print(f'Existing exam sessions: {row_count}')

		# Click Add button to open form
		add_btn = page.locator('button:has-text("Add"), button:has-text("Create")')
		if await add_btn.count() > 0:
			await add_btn.first.click()
			await asyncio.sleep(2)

			# Wait for dialog/sheet
			dialog = page.locator('[role="dialog"]')
			if await dialog.count() > 0:
				# Discover form fields
				labels = await dialog.locator('label').all_inner_texts()
				inputs = await dialog.locator('input').count()
				selects = await dialog.locator('button[role="combobox"]').count()
				textareas = await dialog.locator('textarea').count()

				print(f'\nForm Fields:')
				print(f'  Labels: {labels}')
				print(f'  Text inputs: {inputs}')
				print(f'  Dropdowns: {selects}')
				print(f'  Textareas: {textareas}')

				Settings.ensure_dirs()
				await page.screenshot(
					path=str(Settings.SCREENSHOTS_DIR / 'exam_session_form.png'),
					full_page=True,
				)

				return {
					'labels': labels,
					'inputs': inputs,
					'selects': selects,
					'textareas': textareas,
					'existing_sessions': row_count,
				}
			else:
				print('Form dialog did not open')
				return {'error': 'dialog_not_opened'}
		else:
			print('No Add button found')
			return {'error': 'no_add_button'}

	finally:
		await browser.close()
		await pw.stop()


if __name__ == '__main__':
	result = asyncio.run(discover_exam_session_form())
	print(f'\nResult: {result}')
