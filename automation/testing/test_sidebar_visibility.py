"""
RBAC Test: Verify sidebar navigation items visible to each role.

For each role, logs in and checks which sidebar sections are visible,
comparing against the expected sections defined in role_profiles.py.
"""
import asyncio
import pytest

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ALL_ROLES, SIDEBAR_SECTIONS
from auth.auth_helper import create_browser, create_context, dev_login
from auth.role_profiles import EXPECTED_SIDEBAR_SECTIONS


def _build_sidebar_cases():
	"""Generate (role, section, should_be_visible) tuples."""
	cases = []
	for role in ALL_ROLES:
		expected_sections = EXPECTED_SIDEBAR_SECTIONS.get(role, ['Dashboard'])
		for section_name in SIDEBAR_SECTIONS:
			should_be_visible = section_name in expected_sections
			cases.append((role, section_name, should_be_visible))
	return cases


@pytest.mark.parametrize('role,section,should_be_visible', _build_sidebar_cases(),
	ids=lambda x: str(x) if isinstance(x, str) else '')
async def test_sidebar_section_visibility(browser, role, section, should_be_visible):
	"""Verify sidebar section visibility per role."""
	context = await create_context(browser)
	page = await context.new_page()

	try:
		await dev_login(page, role)

		# Wait for sidebar to render
		await page.wait_for_load_state('networkidle')
		await asyncio.sleep(1)  # Allow React to render sidebar

		# Check if the sidebar section text is visible
		# Sidebar items use data-sidebar="menu-button" with text content
		sidebar_text = await page.locator('nav').all_inner_texts()
		sidebar_content = ' '.join(sidebar_text)

		is_visible = section in sidebar_content

		if should_be_visible:
			assert is_visible, (
				f'Role [{role}] should see sidebar section "{section}" but it was not found. '
				f'Visible content: {sidebar_content[:200]}'
			)
		else:
			assert not is_visible, (
				f'Role [{role}] should NOT see sidebar section "{section}" but it was visible'
			)

	finally:
		await context.close()


# ── Standalone runner ──────────────────────────────────────────────────────

async def run_sidebar_visibility_test():
	"""Run sidebar visibility test for all roles."""
	from playwright.async_api import async_playwright

	print(f'\n{"="*60}')
	print('JKKN COE Sidebar Visibility Test')
	print(f'{"="*60}\n')

	pw = await async_playwright().start()
	browser = await pw.chromium.launch(headless=Settings.HEADLESS, slow_mo=Settings.SLOW_MO)

	for role in ALL_ROLES:
		print(f'\nRole: {role}')
		print(f'{"-"*40}')

		expected = EXPECTED_SIDEBAR_SECTIONS.get(role, ['Dashboard'])

		context = await create_context(browser)
		page = await context.new_page()

		try:
			await dev_login(page, role)
			await page.wait_for_load_state('networkidle')
			await asyncio.sleep(1)

			sidebar_text = await page.locator('nav').all_inner_texts()
			sidebar_content = ' '.join(sidebar_text)

			# Take screenshot
			Settings.ensure_dirs()
			screenshot_path = Settings.SCREENSHOTS_DIR / f'sidebar_{role}.png'
			await page.screenshot(path=str(screenshot_path))

			for section_name in SIDEBAR_SECTIONS:
				is_visible = section_name in sidebar_content
				should_be = section_name in expected
				match = is_visible == should_be
				symbol = '+' if match else '!'

				status = 'visible' if is_visible else 'hidden'
				expected_status = 'visible' if should_be else 'hidden'

				if not match:
					print(f'  [{symbol}] {section_name}: {status} (expected: {expected_status})')
				else:
					print(f'  [{symbol}] {section_name}: {status}')

		except Exception as e:
			print(f'  [!] ERROR: {e}')
		finally:
			await context.close()

	await browser.close()
	await pw.stop()


if __name__ == '__main__':
	asyncio.run(run_sidebar_visibility_test())
