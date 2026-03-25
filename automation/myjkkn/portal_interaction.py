"""
General MyJKKN portal interaction via browser automation.

For operations not available through the REST API.
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


async def interact_with_portal(
	task_description: str,
	headless: bool = False,
) -> dict:
	"""Execute a task on the MyJKKN portal using LLM guidance.

	Args:
		task_description: What to do on the portal
		headless: Whether to run headlessly

	Returns:
		Dict with status and result
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

	profile = BrowserProfile(headless=headless)
	session = BrowserSession(browser_profile=profile)
	await session.start()

	agent = Agent(
		task=f"""
		Navigate to https://www.jkkn.ai

		{task_description}

		Important:
		- If login is required, report that authentication is needed
		- Be careful not to modify any data unless explicitly instructed
		- Take note of any errors or issues encountered
		- Return results as structured data
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

	if len(_sys.argv) < 2:
		print('Usage: python portal_interaction.py "<task description>"')
		print('Example: python portal_interaction.py "Find the regulation details for 2023 batch BCA program"')
		_sys.exit(1)

	task = _sys.argv[1]
	result = asyncio.run(interact_with_portal(task))
	print(json.dumps(result, indent=2))
