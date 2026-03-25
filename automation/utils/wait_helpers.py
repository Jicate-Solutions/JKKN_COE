"""
Custom wait conditions for JKKN COE pages.
"""
import asyncio
from playwright.async_api import Page


async def wait_for_page_ready(page: Page, timeout: int = 30000):
	"""Wait for a page to be fully loaded and stable.

	Waits for:
	1. Network idle state
	2. No "Loading" text visible
	3. Content visible (table, cards, or form)
	"""
	await page.wait_for_load_state('networkidle', timeout=timeout)

	# Wait for loading indicators to disappear
	loading = page.locator('text=Loading')
	if await loading.count() > 0:
		try:
			await loading.first.wait_for(state='hidden', timeout=10000)
		except Exception:
			pass  # Loading text may not disappear on all pages


async def wait_for_table_data(page: Page, timeout: int = 15000) -> bool:
	"""Wait for table data to appear. Returns True if data found."""
	try:
		await page.locator('tbody tr').first.wait_for(state='visible', timeout=timeout)
		return True
	except Exception:
		return False


async def wait_for_toast(page: Page, timeout: int = 10000) -> str | None:
	"""Wait for a toast notification and return its text."""
	toast = page.locator('[data-sonner-toast], li[role="status"]')
	try:
		await toast.first.wait_for(state='visible', timeout=timeout)
		return await toast.first.inner_text()
	except Exception:
		return None


async def wait_for_dialog(page: Page, timeout: int = 5000) -> bool:
	"""Wait for a dialog/sheet to appear."""
	dialog = page.locator('[role="dialog"]')
	try:
		await dialog.first.wait_for(state='visible', timeout=timeout)
		return True
	except Exception:
		return False


async def select_combobox_option(
	page: Page,
	combobox_text: str,
	option_text: str | None = None,
	timeout: int = 5000,
) -> bool:
	"""Select an option from a Shadcn combobox.

	Args:
		page: Playwright page
		combobox_text: Text in the combobox button (e.g., "Select institution")
		option_text: Specific option to select (None = first enabled option)
		timeout: Timeout in ms

	Returns:
		True if an option was selected
	"""
	combobox = page.locator(f'button[role="combobox"]:has-text("{combobox_text}")')
	if await combobox.count() == 0:
		return False

	await combobox.click()
	await asyncio.sleep(0.5)

	if option_text:
		option = page.locator(f'[role="option"]:has-text("{option_text}")')
	else:
		option = page.locator('[role="option"]:not([data-disabled]):not([aria-disabled="true"])').first

	if await option.count() > 0:
		await option.click()
		await asyncio.sleep(1)
		return True

	# Close the dropdown if no option was selected
	await page.keyboard.press('Escape')
	return False
