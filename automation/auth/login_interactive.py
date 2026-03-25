"""
One-time interactive login script.

Opens a headful browser, lets the user complete Google OAuth manually,
then saves the authentication state for future automated use.
"""
import asyncio

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from auth.auth_helper import create_browser, create_context, save_auth_state


async def interactive_login():
	"""Run interactive login and save auth state."""
	pw, browser = await create_browser(headless=False)
	context = await create_context(browser)
	page = await context.new_page()

	try:
		await page.goto(f'{Settings.BASE_URL}/login')
		await page.wait_for_load_state('networkidle')

		print('=' * 60)
		print('INTERACTIVE LOGIN')
		print('=' * 60)
		print(f'Browser opened at {Settings.BASE_URL}/login')
		print('Please complete the Google OAuth login.')
		print('You have 3 minutes to authenticate.')
		print('=' * 60)

		# Wait for successful login (redirect to dashboard)
		try:
			await page.wait_for_url('**/dashboard**', timeout=Settings.AUTH_TIMEOUT)
			print('\nLogin successful! Saving auth state...')
			await save_auth_state(context)
			print('You can now use storage_state auth strategy in automation scripts.')

		except Exception as e:
			current_url = page.url
			if 'login' not in current_url and Settings.BASE_URL in current_url:
				print('\nAuthentication appears successful.')
				await save_auth_state(context)
			else:
				print(f'\nLogin may have timed out or failed: {e}')
				print(f'Current URL: {current_url}')

	finally:
		await context.close()
		await browser.close()
		await pw.stop()


if __name__ == '__main__':
	asyncio.run(interactive_login())
