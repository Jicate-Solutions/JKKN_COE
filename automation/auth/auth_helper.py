"""
Authentication helper for JKKN COE browser automation.

Provides three strategies:
1. Dev login bypass (navigate to /dev-login?role=X&auto=true)
2. Storage state persistence (login once, reuse cookies/localStorage)
3. Direct cookie injection (for CI environments)
"""
import json
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright, Browser, Page, BrowserContext

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from auth.role_profiles import ROLE_PROFILES


async def create_browser(headless: bool | None = None) -> tuple:
	"""Create a Playwright browser instance.

	Returns (playwright, browser) tuple. Caller must close both.
	"""
	pw = await async_playwright().start()
	browser = await pw.chromium.launch(
		headless=headless if headless is not None else Settings.HEADLESS,
		slow_mo=Settings.SLOW_MO,
	)
	return pw, browser


async def create_context(browser: Browser, downloads_path: str | None = None) -> BrowserContext:
	"""Create a browser context with standard viewport."""
	Settings.ensure_dirs()
	return await browser.new_context(
		viewport={'width': Settings.VIEWPORT_WIDTH, 'height': Settings.VIEWPORT_HEIGHT},
		accept_downloads=True,
	)


async def dev_login(page: Page, role: str = 'admin') -> Page:
	"""Authenticate via the dev-login page with a specific role.

	Args:
		page: Playwright page instance
		role: One of super_admin, admin, coe, deputy_coe, coe_office, faculty_coe

	Returns:
		The same page, now authenticated and at /dashboard
	"""
	if role not in ROLE_PROFILES:
		raise ValueError(f'Unknown role: {role}. Must be one of: {list(ROLE_PROFILES.keys())}')

	url = f'{Settings.BASE_URL}/dev-login?role={role}&auto=true'
	await page.goto(url, timeout=Settings.NAVIGATION_TIMEOUT)

	# Wait for redirect to dashboard (auto=true triggers immediate login)
	try:
		await page.wait_for_url('**/dashboard**', timeout=Settings.DEFAULT_TIMEOUT)
	except Exception:
		# If auto-login didn't work, click the login button manually
		btn = page.locator('button:has-text("Login as")')
		if await btn.count() > 0:
			await btn.click()
			await page.wait_for_url('**/dashboard**', timeout=Settings.DEFAULT_TIMEOUT)
		else:
			raise RuntimeError(f'Dev login failed for role {role}. Page URL: {page.url}')

	# Wait for page to stabilize
	await page.wait_for_load_state('networkidle')
	return page


async def create_authenticated_page(
	role: str = 'admin',
	headless: bool | None = None,
) -> tuple:
	"""Create a fully authenticated page for a given role.

	Returns (playwright, browser, page) tuple. Caller must close all three.

	Usage:
		pw, browser, page = await create_authenticated_page('coe')
		# ... do stuff with page ...
		await browser.close()
		await pw.stop()
	"""
	pw, browser = await create_browser(headless)
	context = await create_context(browser)
	page = await context.new_page()
	await dev_login(page, role)
	return pw, browser, page


async def save_auth_state(context: BrowserContext, path: Path | None = None):
	"""Save the current browser auth state for reuse."""
	state_path = path or Settings.AUTH_STATE_PATH
	state_path.parent.mkdir(parents=True, exist_ok=True)
	await context.storage_state(path=str(state_path))
	print(f'Auth state saved to {state_path}')


async def load_auth_state(browser: Browser, path: Path | None = None) -> BrowserContext:
	"""Create a context from a previously saved auth state."""
	state_path = path or Settings.AUTH_STATE_PATH
	if not state_path.exists():
		raise FileNotFoundError(
			f'No auth state found at {state_path}. '
			'Run `python -m automation.auth.login_interactive` first.'
		)
	return await browser.new_context(
		storage_state=str(state_path),
		viewport={'width': Settings.VIEWPORT_WIDTH, 'height': Settings.VIEWPORT_HEIGHT},
		accept_downloads=True,
	)


# ── Convenience runner ──────────────────────────────────────────────────────

async def _test_dev_login():
	"""Quick test to verify dev login works for all roles."""
	pw, browser = await create_browser(headless=False)
	try:
		for role in ROLE_PROFILES:
			context = await create_context(browser)
			page = await context.new_page()
			try:
				await dev_login(page, role)
				print(f'  [{role}] Login OK - URL: {page.url}')
			except Exception as e:
				print(f'  [{role}] FAILED: {e}')
			finally:
				await context.close()
	finally:
		await browser.close()
		await pw.stop()


if __name__ == '__main__':
	asyncio.run(_test_dev_login())
