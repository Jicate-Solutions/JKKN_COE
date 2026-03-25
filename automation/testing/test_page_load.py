"""
Test page loading across key routes.
Detects infinite refresh loops, console errors, and stuck loading states.
Can run standalone or via pytest.
"""
import asyncio
import time

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_authenticated_page


# Key routes to test (representative pages from each module)
TEST_ROUTES = [
	'dashboard',
	'exam_sessions',
	'hall_tickets',
	'courses',
	'learners',
	'generate_final_marks',
	'semester_results',
	'comprehensive_reports',
	'institutions',
]


async def test_page_load(route_key: str, role: str = 'super_admin') -> dict:
	"""Test a single page for loading issues."""
	pw, browser, page = await create_authenticated_page(role)

	try:
		route = ROUTES[route_key]
		full_url = f'{Settings.BASE_URL}{route}'

		api_calls: list[str] = []
		console_errors: list[str] = []

		page.on('request', lambda req: api_calls.append(req.url) if '/api/' in req.url else None)
		page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' else None)

		await page.goto(full_url, timeout=Settings.NAVIGATION_TIMEOUT)
		await page.wait_for_load_state('networkidle')

		initial_api_count = len(api_calls)

		# Wait 5 seconds to detect infinite refresh
		await asyncio.sleep(5)

		new_api_calls = len(api_calls) - initial_api_count
		infinite_refresh = new_api_calls > 10

		# Check page state
		loading_visible = await page.locator('text=Loading').first.is_visible() if await page.locator('text=Loading').count() > 0 else False
		table_visible = await page.locator('table').first.is_visible() if await page.locator('table').count() > 0 else False

		# Take screenshot
		Settings.ensure_dirs()
		screenshot_path = Settings.SCREENSHOTS_DIR / f'pageload_{route_key}.png'
		await page.screenshot(path=str(screenshot_path), full_page=True)

		return {
			'route': route,
			'role': role,
			'api_calls_total': len(api_calls),
			'api_calls_during_wait': new_api_calls,
			'infinite_refresh': infinite_refresh,
			'stuck_loading': loading_visible and not table_visible,
			'console_errors': console_errors[:5],
			'screenshot': str(screenshot_path),
			'passed': not infinite_refresh and not (loading_visible and not table_visible),
		}
	finally:
		await browser.close()
		await pw.stop()


async def run_all_page_load_tests():
	"""Run page load tests for all key routes."""
	print(f'\n{"="*60}')
	print('JKKN COE Page Load Tests')
	print(f'{"="*60}\n')

	passed = 0
	failed = 0
	errors = 0

	for route_key in TEST_ROUTES:
		try:
			result = await test_page_load(route_key)
			status = 'PASS' if result['passed'] else 'FAIL'
			symbol = '+' if result['passed'] else '-'

			if result['passed']:
				passed += 1
			else:
				failed += 1

			print(f'  [{symbol}] {status}: {route_key} ({result["route"]})')

			if result['infinite_refresh']:
				print(f'      ! Infinite refresh detected ({result["api_calls_during_wait"]} API calls in 5s)')
			if result['stuck_loading']:
				print(f'      ! Page stuck in loading state')
			if result['console_errors']:
				print(f'      ! Console errors: {result["console_errors"][:2]}')

		except Exception as e:
			errors += 1
			print(f'  [!] ERROR: {route_key} - {e}')

	print(f'\n{"="*60}')
	print(f'Results: {passed} passed, {failed} failed, {errors} errors')
	print(f'{"="*60}\n')


if __name__ == '__main__':
	asyncio.run(run_all_page_load_tests())
