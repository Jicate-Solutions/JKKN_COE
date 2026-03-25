"""
Shared pytest fixtures for JKKN COE automation tests.
Provides role-parameterized authenticated pages.
"""
import pytest
import pytest_asyncio
from playwright.async_api import async_playwright, Page, Browser, BrowserContext

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.settings import Settings
from auth.auth_helper import create_browser, create_context, dev_login
from auth.role_profiles import ROLE_PROFILES


@pytest_asyncio.fixture
async def browser():
	"""Provide a shared browser instance."""
	pw = await async_playwright().start()
	browser = await pw.chromium.launch(
		headless=Settings.HEADLESS,
		slow_mo=Settings.SLOW_MO,
	)
	yield browser
	await browser.close()
	await pw.stop()


@pytest_asyncio.fixture
async def page_for_role(browser, request):
	"""Create an authenticated page for a specific role.

	Usage with indirect parametrize:
		@pytest.mark.parametrize('page_for_role', ['coe'], indirect=True)
		async def test_something(page_for_role):
			page = page_for_role
			...
	"""
	role = request.param if hasattr(request, 'param') else 'admin'
	context = await create_context(browser)
	page = await context.new_page()
	await dev_login(page, role)
	yield page
	await context.close()


@pytest_asyncio.fixture
async def admin_page(browser):
	"""Convenience fixture for an admin-authenticated page."""
	context = await create_context(browser)
	page = await context.new_page()
	await dev_login(page, 'admin')
	yield page
	await context.close()


@pytest_asyncio.fixture
async def super_admin_page(browser):
	"""Convenience fixture for a super_admin-authenticated page."""
	context = await create_context(browser)
	page = await context.new_page()
	await dev_login(page, 'super_admin')
	yield page
	await context.close()


@pytest_asyncio.fixture
async def coe_page(browser):
	"""Convenience fixture for a coe-authenticated page."""
	context = await create_context(browser)
	page = await context.new_page()
	await dev_login(page, 'coe')
	yield page
	await context.close()
