"""
Generic data collector for external education portals.

Uses Browser Use LLM agent to navigate and extract structured data
from arbitrary web portals.
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


async def collect_data(
	url: str,
	task_description: str,
	headless: bool = False,
) -> dict:
	"""Collect data from a web portal using LLM-guided navigation.

	Args:
		url: Starting URL for data collection
		task_description: Natural language description of what data to collect
		headless: Whether to run browser headlessly

	Returns:
		Dict with status and collected data
	"""
	if not _browser_use_available:
		raise ImportError('browser-use and langchain-anthropic required')

	if not Settings.ANTHROPIC_API_KEY:
		raise ValueError('ANTHROPIC_API_KEY must be set')

	llm = ChatAnthropic(
		model=Settings.LLM_MODEL,
		api_key=Settings.ANTHROPIC_API_KEY,
		temperature=0,
	)

	profile = BrowserProfile(headless=headless)
	session = BrowserSession(browser_profile=profile)
	await session.start()

	agent = Agent(
		task=f"""
		Navigate to {url}

		Task: {task_description}

		Instructions:
		- Navigate through the portal to find the requested data
		- Handle any pagination if there are multiple pages
		- Extract all relevant data in a structured format
		- If login is required, report that authentication is needed and stop
		- Return the collected data as structured JSON
		""",
		llm=llm,
		browser_session=session,
	)

	try:
		result = await agent.run()
		return {'status': 'success', 'data': str(result)}
	except Exception as e:
		return {'status': 'error', 'error': str(e)}
	finally:
		await session.close()


if __name__ == '__main__':
	import sys as _sys

	if len(_sys.argv) < 3:
		print('Usage: python portal_data_collector.py <url> "<task description>"')
		_sys.exit(1)

	url = _sys.argv[1]
	task = _sys.argv[2]

	result = asyncio.run(collect_data(url, task))
	print(json.dumps(result, indent=2))
