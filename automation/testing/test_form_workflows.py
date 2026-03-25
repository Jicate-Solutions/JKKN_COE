"""
E2E Form Workflow Tests using Browser Use LLM Agent.

These tests use Claude to intelligently interact with complex forms
and multi-step workflows.
"""
import asyncio

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from config.constants import ROUTES
from auth.auth_helper import create_authenticated_page

# Only import browser-use when actually running LLM tests
_browser_use_available = False
try:
	from browser_use import Agent
	from langchain_anthropic import ChatAnthropic
	_browser_use_available = True
except ImportError:
	pass


def _get_llm():
	"""Create the LLM instance for browser-use agents."""
	if not _browser_use_available:
		raise ImportError('browser-use and langchain-anthropic are required for LLM tests')
	if not Settings.ANTHROPIC_API_KEY:
		raise ValueError('ANTHROPIC_API_KEY must be set in .env.automation')
	return ChatAnthropic(
		model=Settings.LLM_MODEL,
		api_key=Settings.ANTHROPIC_API_KEY,
		temperature=0,
	)


async def test_exam_session_form_discovery():
	"""Use LLM agent to discover and report exam session form fields."""
	pw, browser, page = await create_authenticated_page('super_admin', headless=False)

	try:
		llm = _get_llm()

		from browser_use import BrowserSession
		from browser_use.browser.profile import BrowserProfile

		# Create a browser-use session
		profile = BrowserProfile(headless=False)
		session = BrowserSession(browser_profile=profile)
		await session.start()

		# Navigate to exam sessions
		bu_page = await session.get_current_page()
		await bu_page.goto(f'{Settings.BASE_URL}/dev-login?role=super_admin&auto=true')
		await bu_page.wait_for_url('**/dashboard**', timeout=30000)

		agent = Agent(
			task=f"""
			Navigate to {Settings.BASE_URL}/exam-management/examination-sessions
			Wait for the page to fully load.

			1. Look for an "Add" or "Create" button and click it
			2. Wait for the form/sheet to appear
			3. Take note of ALL form fields you can see, including:
			   - Field labels
			   - Field types (text, dropdown, date picker, checkbox, etc.)
			   - Whether fields are required (look for asterisks or required indicators)
			4. Report the complete list of form fields

			Do NOT submit the form - just report what you see.
			""",
			llm=llm,
			browser_session=session,
		)

		result = await agent.run()
		print(f'Exam Session Form Discovery:\n{result}')
		await session.close()
		return result

	finally:
		await browser.close()
		await pw.stop()


async def test_hall_ticket_workflow():
	"""Use LLM agent to test the hall ticket generation workflow."""
	if not _browser_use_available:
		print('Skipping: browser-use not available')
		return

	from browser_use import BrowserSession
	from browser_use.browser.profile import BrowserProfile

	llm = _get_llm()

	profile = BrowserProfile(headless=False)
	session = BrowserSession(browser_profile=profile)
	await session.start()

	bu_page = await session.get_current_page()
	await bu_page.goto(f'{Settings.BASE_URL}/dev-login?role=super_admin&auto=true')
	await bu_page.wait_for_url('**/dashboard**', timeout=30000)

	agent = Agent(
		task=f"""
		Navigate to {Settings.BASE_URL}/pre-exam/hall-tickets
		Wait for the page to fully load.

		1. Look for dropdown filters (institution, exam session, program, semester)
		2. Select the first available option in each dropdown
		3. Wait for data to load after each selection
		4. Look for a "Generate" or "Download" button
		5. Report:
		   - What filters are available
		   - What options were selected
		   - Whether any data/table appeared after selections
		   - Whether a generate/download button appeared

		Do NOT click generate - just report the state.
		""",
		llm=llm,
		browser_session=session,
	)

	result = await agent.run()
	print(f'Hall Ticket Workflow:\n{result}')
	await session.close()
	return result


if __name__ == '__main__':
	print('Running LLM-driven form workflow tests...')
	print('Note: These tests require ANTHROPIC_API_KEY in .env.automation\n')

	if not _browser_use_available:
		print('ERROR: browser-use not installed. Run: uv pip install browser-use langchain-anthropic')
	elif not Settings.ANTHROPIC_API_KEY:
		print('ERROR: ANTHROPIC_API_KEY not set. Add it to automation/.env.automation')
	else:
		asyncio.run(test_exam_session_form_discovery())
