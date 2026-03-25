"""
Automated report export workflow.

Supports exporting comprehensive reports, exam registration reports,
marksheet distribution, and semester marksheets.
"""
import asyncio

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_authenticated_page


async def export_report(
	report_type: str = 'comprehensive_reports',
	export_format: str = 'excel',
	role: str = 'super_admin',
):
	"""Export a report to PDF or Excel.

	Args:
		report_type: One of the report route keys (comprehensive_reports, etc.)
		export_format: 'excel' or 'pdf'
		role: Role to login as
	"""
	if report_type not in ROUTES:
		raise ValueError(f'Unknown report type: {report_type}')

	pw, browser, page = await create_authenticated_page(role)

	try:
		await page.goto(
			f'{Settings.BASE_URL}{ROUTES[report_type]}',
			timeout=Settings.NAVIGATION_TIMEOUT,
		)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)

		# Select first available option in each combobox
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

		# Look for export button
		export_text = export_format.upper() if export_format == 'pdf' else 'Excel'
		export_btn = page.locator(f'button:has-text("{export_text}"), button:has-text("Export"), button:has-text("Download")')

		if await export_btn.count() > 0:
			# Set up download handler
			async with page.expect_download(timeout=30000) as download_info:
				await export_btn.first.click()
			download = await download_info.value

			# Save downloaded file
			Settings.ensure_dirs()
			save_path = Settings.DOWNLOADS_DIR / download.suggested_filename
			await download.save_as(str(save_path))

			print(f'Report exported: {save_path}')
			return {'status': 'success', 'file': str(save_path)}

		else:
			Settings.ensure_dirs()
			await page.screenshot(
				path=str(Settings.SCREENSHOTS_DIR / f'report_{report_type}_no_button.png'),
				full_page=True,
			)
			print('No export button found')
			return {'status': 'no_button'}

	except Exception as e:
		Settings.ensure_dirs()
		await page.screenshot(
			path=str(Settings.SCREENSHOTS_DIR / f'report_{report_type}_error.png'),
			full_page=True,
		)
		return {'status': 'error', 'error': str(e)}

	finally:
		await browser.close()
		await pw.stop()


if __name__ == '__main__':
	result = asyncio.run(export_report('comprehensive_reports', 'excel'))
	print(f'Result: {result}')
