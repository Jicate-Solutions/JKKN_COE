"""
Scrape results from external university portals.

Uses Browser Use LLM agent to navigate unfamiliar university websites
and extract student results data.
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


async def scrape_results(
	university_url: str,
	register_numbers: list[str],
	headless: bool = True,
) -> list[dict]:
	"""Scrape results from a university portal for given register numbers.

	Args:
		university_url: URL of the university results portal
		register_numbers: List of register numbers to look up
		headless: Whether to run browser headlessly

	Returns:
		List of result dicts with register_number and extracted data
	"""
	if not _browser_use_available:
		raise ImportError('browser-use and langchain-anthropic required. Install with: uv pip install browser-use langchain-anthropic')

	if not Settings.ANTHROPIC_API_KEY:
		raise ValueError('ANTHROPIC_API_KEY must be set in .env.automation')

	llm = ChatAnthropic(
		model=Settings.LLM_MODEL,
		api_key=Settings.ANTHROPIC_API_KEY,
		temperature=0,
	)

	profile = BrowserProfile(headless=headless)
	session = BrowserSession(browser_profile=profile)
	await session.start()

	results = []

	for reg_no in register_numbers:
		print(f'Looking up: {reg_no}')

		agent = Agent(
			task=f"""
			Navigate to {university_url}
			Find a form to look up student results.
			Enter register number: {reg_no}
			Submit the form.
			Extract the results including:
			- Student name
			- Register number
			- All subjects with marks/grades
			- Overall result (Pass/Fail)
			- GPA/CGPA if available

			Return the data as structured JSON.
			If you cannot find results, report the error message shown.
			""",
			llm=llm,
			browser_session=session,
		)

		try:
			result = await agent.run()
			results.append({
				'register_number': reg_no,
				'status': 'success',
				'data': str(result),
			})
		except Exception as e:
			results.append({
				'register_number': reg_no,
				'status': 'error',
				'error': str(e),
			})

	await session.close()

	# Save results
	Settings.ensure_dirs()
	output_file = Settings.DOWNLOADS_DIR / 'scraped_results.json'
	with open(output_file, 'w') as f:
		json.dump(results, f, indent=2)
	print(f'Results saved to {output_file}')

	return results


async def scrape_single_result(university_url: str, register_number: str) -> dict:
	"""Convenience function to scrape a single student's results."""
	results = await scrape_results(university_url, [register_number], headless=False)
	return results[0] if results else {}


if __name__ == '__main__':
	import sys as _sys

	if len(_sys.argv) < 3:
		print('Usage: python university_results.py <university_url> <reg_no1> [reg_no2] ...')
		print('Example: python university_results.py https://results.university.edu 21BCA001 21BCA002')
		_sys.exit(1)

	url = _sys.argv[1]
	reg_numbers = _sys.argv[2:]

	results = asyncio.run(scrape_results(url, reg_numbers, headless=False))
	for r in results:
		print(f'\n{r["register_number"]}: {r["status"]}')
		if r['status'] == 'success':
			print(f'  Data: {r["data"][:200]}...')
