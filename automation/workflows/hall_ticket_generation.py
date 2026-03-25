"""
Automated hall ticket generation workflow.

Flow: Login -> Select filters -> Generate PDF
Supports both LLM-driven (Browser Use) and deterministic (Playwright) modes.
"""
import asyncio

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_authenticated_page


async def generate_hall_tickets_deterministic(
	institution_name: str | None = None,
	session_name: str | None = None,
	program_name: str | None = None,
	role: str = 'super_admin',
):
	"""Generate hall tickets using deterministic Playwright selectors.

	Args:
		institution_name: Institution to select (None = first available)
		session_name: Exam session to select (None = first available)
		program_name: Program to select (None = first available)
		role: Role to login as
	"""
	pw, browser, page = await create_authenticated_page(role)

	try:
		await page.goto(
			f'{Settings.BASE_URL}{ROUTES["hall_tickets"]}',
			timeout=Settings.NAVIGATION_TIMEOUT,
		)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)

		# Select institution (if combobox exists)
		inst_combobox = page.locator('button[role="combobox"]:has-text("Select institution")')
		if await inst_combobox.count() > 0:
			await inst_combobox.click()
			await asyncio.sleep(1)

			if institution_name:
				option = page.locator(f'[role="option"]:has-text("{institution_name}")')
			else:
				option = page.locator('[role="option"]:not([data-disabled])').first

			if await option.count() > 0:
				await option.click()
				await asyncio.sleep(2)

		# Select exam session
		session_combobox = page.locator('button[role="combobox"]:has-text("Select session"), button[role="combobox"]:has-text("Select exam")')
		if await session_combobox.count() > 0:
			await session_combobox.click()
			await asyncio.sleep(1)

			if session_name:
				option = page.locator(f'[role="option"]:has-text("{session_name}")')
			else:
				option = page.locator('[role="option"]:not([data-disabled])').first

			if await option.count() > 0:
				await option.click()
				await asyncio.sleep(2)

		# Select program
		prog_combobox = page.locator('button[role="combobox"]:has-text("Select program")')
		if await prog_combobox.count() > 0:
			await prog_combobox.click()
			await asyncio.sleep(1)

			if program_name:
				option = page.locator(f'[role="option"]:has-text("{program_name}")')
			else:
				option = page.locator('[role="option"]:not([data-disabled])').first

			if await option.count() > 0:
				await option.click()
				await asyncio.sleep(2)

		# Take screenshot of current state
		Settings.ensure_dirs()
		await page.screenshot(
			path=str(Settings.SCREENSHOTS_DIR / 'hall_ticket_ready.png'),
			full_page=True,
		)

		# Look for generate/download button
		gen_btn = page.locator('button:has-text("Generate"), button:has-text("Download")')
		if await gen_btn.count() > 0:
			print('Generate/Download button found - ready to generate')
			# Uncomment to actually generate:
			# await gen_btn.first.click()
			# await asyncio.sleep(5)
			return {'status': 'ready', 'button_found': True}
		else:
			print('No generate button found - check filter selections')
			return {'status': 'no_button', 'button_found': False}

	finally:
		await browser.close()
		await pw.stop()


if __name__ == '__main__':
	result = asyncio.run(generate_hall_tickets_deterministic())
	print(f'Result: {result}')
