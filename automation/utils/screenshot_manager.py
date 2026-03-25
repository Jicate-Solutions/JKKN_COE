"""
Screenshot capture and organization utility.
"""
from datetime import datetime
from pathlib import Path
from playwright.async_api import Page

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings


async def capture_screenshot(
	page: Page,
	name: str,
	full_page: bool = True,
	subfolder: str | None = None,
) -> Path:
	"""Capture a screenshot with standardized naming.

	Args:
		page: Playwright page
		name: Base name for the screenshot (e.g., 'exam_sessions_form')
		full_page: Whether to capture the full scrollable page
		subfolder: Optional subfolder within screenshots dir

	Returns:
		Path to the saved screenshot
	"""
	Settings.ensure_dirs()

	timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
	filename = f'{name}_{timestamp}.png'

	if subfolder:
		save_dir = Settings.SCREENSHOTS_DIR / subfolder
		save_dir.mkdir(parents=True, exist_ok=True)
	else:
		save_dir = Settings.SCREENSHOTS_DIR

	path = save_dir / filename
	await page.screenshot(path=str(path), full_page=full_page)
	return path


async def capture_element_screenshot(
	page: Page,
	selector: str,
	name: str,
) -> Path | None:
	"""Capture a screenshot of a specific element.

	Returns None if the element is not found.
	"""
	element = page.locator(selector)
	if await element.count() == 0:
		return None

	Settings.ensure_dirs()
	timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
	path = Settings.SCREENSHOTS_DIR / f'{name}_{timestamp}.png'
	await element.first.screenshot(path=str(path))
	return path
