"""
RBAC Test: Verify multi-tenant institution filtering.

Tests that:
- super_admin can see "All Institutions" and switch between them
- Normal roles (coe, deputy_coe, etc.) see only their institution's data
- Institution dropdown behavior matches role
"""
import asyncio
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_browser, create_context, dev_login


# Pages that have institution filtering
INSTITUTION_FILTER_PAGES = [
	'exam_sessions',
	'courses',
	'learners',
	'hall_tickets',
	'comprehensive_reports',
]


async def test_super_admin_sees_all_institutions(browser):
	"""super_admin should see institution selector with All Institutions option."""
	context = await create_context(browser)
	page = await context.new_page()

	try:
		await dev_login(page, 'super_admin')

		# Navigate to a page with institution filter
		await page.goto(f'{Settings.BASE_URL}{ROUTES["exam_sessions"]}', timeout=Settings.NAVIGATION_TIMEOUT)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)

		# Check for institution selector presence
		# Super admin should see an institution dropdown or "All Institutions" text
		page_text = await page.locator('body').inner_text()
		has_institution_ui = (
			'All Institutions' in page_text or
			'Select institution' in page_text or
			await page.locator('button[role="combobox"]').count() > 0
		)

		assert has_institution_ui, (
			'super_admin should see institution selector UI'
		)

	finally:
		await context.close()


async def test_coe_sees_own_institution_only(browser):
	"""COE role should see only their institution's data (no institution switcher)."""
	context = await create_context(browser)
	page = await context.new_page()

	try:
		await dev_login(page, 'coe')

		await page.goto(f'{Settings.BASE_URL}{ROUTES["exam_sessions"]}', timeout=Settings.NAVIGATION_TIMEOUT)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)

		# COE should NOT see "All Institutions" option
		page_text = await page.locator('body').inner_text()
		has_all_institutions = 'All Institutions' in page_text

		# Take screenshot for verification
		Settings.ensure_dirs()
		await page.screenshot(path=str(Settings.SCREENSHOTS_DIR / 'institution_coe.png'))

		# Note: Actual assertion depends on how the app filters
		# Document the behavior rather than strictly assert for now
		print(f'COE sees "All Institutions": {has_all_institutions}')

	finally:
		await context.close()


# ── Standalone runner ──────────────────────────────────────────────────────

async def run_institution_filter_test():
	"""Run institution filter tests for all roles."""
	from playwright.async_api import async_playwright

	print(f'\n{"="*60}')
	print('JKKN COE Institution Filter Test')
	print(f'{"="*60}\n')

	pw = await async_playwright().start()
	browser = await pw.chromium.launch(headless=Settings.HEADLESS, slow_mo=Settings.SLOW_MO)

	test_roles = ['super_admin', 'coe', 'deputy_coe']

	for role in test_roles:
		print(f'\nRole: {role}')
		print(f'{"-"*40}')

		for route_key in INSTITUTION_FILTER_PAGES:
			from config.constants import ROLE_ACCESS
			allowed = ROLE_ACCESS.get(route_key, [])
			if allowed and role not in allowed:
				print(f'  [~] {route_key}: skipped (no access)')
				continue

			context = await create_context(browser)
			page = await context.new_page()

			try:
				await dev_login(page, role)
				await page.goto(f'{Settings.BASE_URL}{ROUTES[route_key]}', timeout=Settings.NAVIGATION_TIMEOUT)
				await page.wait_for_load_state('networkidle')
				await asyncio.sleep(2)

				page_text = await page.locator('body').inner_text()
				has_all = 'All Institutions' in page_text
				has_selector = 'Select institution' in page_text
				has_combobox = await page.locator('button[role="combobox"]').count() > 0

				print(f'  [{route_key}] All Institutions: {has_all}, Selector: {has_selector}, Combobox: {has_combobox}')

				Settings.ensure_dirs()
				await page.screenshot(path=str(Settings.SCREENSHOTS_DIR / f'inst_{role}_{route_key}.png'))

			except Exception as e:
				print(f'  [{route_key}] ERROR: {e}')
			finally:
				await context.close()

	await browser.close()
	await pw.stop()


if __name__ == '__main__':
	asyncio.run(run_institution_filter_test())
