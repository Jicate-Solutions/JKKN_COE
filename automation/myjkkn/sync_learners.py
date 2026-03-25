"""
Sync learner data from MyJKKN portal.

For data that cannot be obtained through the REST API,
uses browser automation to navigate the MyJKKN portal.
"""
import asyncio
import json

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings

_browser_use_available = False
try:
	from browser_use import Agent, BrowserSession
	from browser_use.browser.profile import BrowserProfile
	from langchain_anthropic import ChatAnthropic
	_browser_use_available = True
except ImportError:
	pass


async def sync_learner_photos(
	institution_name: str,
	batch: str,
	program: str,
) -> dict:
	"""Navigate to MyJKKN portal and collect learner photos.

	Args:
		institution_name: Name of the institution
		batch: Batch identifier (e.g., '2023-2027')
		program: Program name or code (e.g., 'BCA')

	Returns:
		Dict with status and collected photo URLs
	"""
	if not _browser_use_available:
		raise ImportError('browser-use required')

	if not Settings.ANTHROPIC_API_KEY:
		raise ValueError('ANTHROPIC_API_KEY must be set')

	llm = ChatAnthropic(
		model=Settings.LLM_MODEL,
		api_key=Settings.ANTHROPIC_API_KEY,
		temperature=0,
	)

	profile = BrowserProfile(headless=False)
	session = BrowserSession(browser_profile=profile)
	await session.start()

	agent = Agent(
		task=f"""
		Navigate to https://www.jkkn.ai

		If login is required:
		- Look for a login form
		- Report that manual login is needed and stop

		If already logged in or no login needed:
		1. Navigate to the learner/student directory or profiles section
		2. Filter by institution: {institution_name}
		3. Filter by batch: {batch}
		4. Filter by program: {program}
		5. For each learner visible, extract:
		   - Learner name
		   - Register number
		   - Photo URL (right-click on photo and copy image address)
		   - Date of birth if visible
		6. Handle pagination if there are multiple pages
		7. Return the collected data as structured JSON

		If any filter is not available, report which one and continue
		with the available filters.
		""",
		llm=llm,
		browser_session=session,
	)

	try:
		result = await agent.run()

		# Save results
		Settings.ensure_dirs()
		output_file = Settings.DOWNLOADS_DIR / f'learner_photos_{program}_{batch}.json'
		with open(output_file, 'w') as f:
			json.dump({'status': 'success', 'data': str(result)}, f, indent=2)

		print(f'Learner data saved to {output_file}')
		return {'status': 'success', 'data': str(result)}

	except Exception as e:
		return {'status': 'error', 'error': str(e)}
	finally:
		await session.close()


async def trigger_api_sync(
	institution_id: str,
	program_code: str | None = None,
):
	"""Trigger the MyJKKN learner profile sync via the COE API endpoint.

	This uses the existing /api/myjkkn/learner-profiles/sync endpoint
	rather than browser automation.
	"""
	import aiohttp

	url = f'{Settings.BASE_URL}/api/myjkkn/learner-profiles/sync'
	payload = {'institutions_id': institution_id}
	if program_code:
		payload['program_code'] = program_code

	async with aiohttp.ClientSession() as session:
		async with session.post(url, json=payload) as response:
			data = await response.json()
			print(f'Sync response: {response.status}')
			return data


if __name__ == '__main__':
	import sys as _sys

	if len(_sys.argv) < 4:
		print('Usage: python sync_learners.py <institution> <batch> <program>')
		print('Example: python sync_learners.py "JKKN College" "2023-2027" "BCA"')
		_sys.exit(1)

	inst = _sys.argv[1]
	batch = _sys.argv[2]
	program = _sys.argv[3]

	result = asyncio.run(sync_learner_photos(inst, batch, program))
	print(f'Result: {result["status"]}')
