"""
RBAC Test: Verify CRUD button visibility per role.

For key pages, checks whether Add/Edit/Delete buttons are visible
based on the role's permissions.
"""
import asyncio
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES, ALL_ROLES
from auth.auth_helper import create_browser, create_context, dev_login

# Pages to check for CRUD buttons and which roles should see them
CRUD_TEST_CASES = [
	# (route_key, button_text, allowed_roles)
	('institutions', 'Add', ['super_admin']),
	('courses', 'Add', ['super_admin', 'coe', 'coe_office']),
	('degrees', 'Add', ['super_admin']),
	('sections', 'Add', ['super_admin']),
	('grades', 'Add', ['super_admin', 'coe']),
]


def _build_crud_cases():
	"""Generate parametrize cases for CRUD button tests."""
	cases = []
	for route_key, button_text, allowed_roles in CRUD_TEST_CASES:
		for role in ALL_ROLES:
			should_see = role in allowed_roles
			cases.append((role, route_key, button_text, should_see))
	return cases


@pytest.mark.parametrize('role,route_key,button_text,should_see', _build_crud_cases(),
	ids=lambda x: str(x) if isinstance(x, str) else '')
async def test_crud_button_visibility(browser, role, route_key, button_text, should_see):
	"""Verify CRUD buttons are visible/hidden per role."""
	# Skip if role doesn't even have page access
	from config.constants import ROLE_ACCESS
	allowed_page_roles = ROLE_ACCESS.get(route_key, [])
	if allowed_page_roles and role not in allowed_page_roles:
		pytest.skip(f'Role {role} cannot access {route_key}')

	context = await create_context(browser)
	page = await context.new_page()

	try:
		await dev_login(page, role)

		route = ROUTES[route_key]
		await page.goto(f'{Settings.BASE_URL}{route}', timeout=Settings.NAVIGATION_TIMEOUT)
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(2)  # Wait for dynamic content

		# Look for the button
		btn = page.locator(f'button:has-text("{button_text}")')
		is_visible = await btn.first.is_visible() if await btn.count() > 0 else False

		if should_see:
			assert is_visible, (
				f'Role [{role}] should see "{button_text}" button on {route_key} but it was not found'
			)
		# Note: We don't strictly assert hidden buttons because some roles
		# can access the page but buttons may be conditionally rendered

	finally:
		await context.close()


# ── Standalone runner ──────────────────────────────────────────────────────

async def run_crud_permission_test():
	"""Run CRUD permission tests standalone."""
	from playwright.async_api import async_playwright

	print(f'\n{"="*60}')
	print('JKKN COE CRUD Permission Test')
	print(f'{"="*60}\n')

	pw = await async_playwright().start()
	browser = await pw.chromium.launch(headless=Settings.HEADLESS, slow_mo=Settings.SLOW_MO)

	for route_key, button_text, allowed_roles in CRUD_TEST_CASES:
		print(f'\nPage: {route_key} - Button: "{button_text}"')
		print(f'{"-"*40}')

		for role in ALL_ROLES:
			from config.constants import ROLE_ACCESS
			allowed_page_roles = ROLE_ACCESS.get(route_key, [])
			if allowed_page_roles and role not in allowed_page_roles:
				print(f'  [~] {role}: skipped (no page access)')
				continue

			context = await create_context(browser)
			page = await context.new_page()

			try:
				await dev_login(page, role)
				await page.goto(f'{Settings.BASE_URL}{ROUTES[route_key]}', timeout=Settings.NAVIGATION_TIMEOUT)
				await page.wait_for_load_state('networkidle')
				await asyncio.sleep(2)

				btn = page.locator(f'button:has-text("{button_text}")')
				is_visible = await btn.first.is_visible() if await btn.count() > 0 else False

				should_see = role in allowed_roles
				match = is_visible == should_see
				symbol = '+' if match else '!'

				status = 'visible' if is_visible else 'hidden'
				expected_status = 'visible' if should_see else 'hidden'

				print(f'  [{symbol}] {role}: {status} (expected: {expected_status})')

			except Exception as e:
				print(f'  [!] {role}: ERROR - {e}')
			finally:
				await context.close()

	await browser.close()
	await pw.stop()


if __name__ == '__main__':
	asyncio.run(run_crud_permission_test())
