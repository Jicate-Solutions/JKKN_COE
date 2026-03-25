"""
Central configuration for JKKN COE automation.
Reads from the project root .env.local and automation/.env.automation.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
AUTOMATION_ROOT = Path(__file__).parent.parent

# Load project .env.local first, then automation overrides
load_dotenv(PROJECT_ROOT / '.env.local', override=False)
load_dotenv(AUTOMATION_ROOT / '.env.automation', override=True)


class Settings:
	# App URLs
	BASE_URL = os.getenv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
	PARENT_APP_URL = os.getenv('NEXT_PUBLIC_PARENT_APP_URL', 'https://auth.jkkn.ai')

	# LLM Configuration
	ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')
	LLM_MODEL = os.getenv('AUTOMATION_LLM_MODEL', 'claude-sonnet-4-20250514')

	# MyJKKN API
	MYJKKN_API_KEY = os.getenv('MYJKKN_API_KEY', '')
	MYJKKN_BASE_URL = os.getenv('MYJKKN_API_URL', 'https://www.jkkn.ai/api')

	# Supabase (for direct DB queries in tests)
	SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
	SUPABASE_ANON_KEY = os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
	SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

	# Browser settings
	HEADLESS = os.getenv('AUTOMATION_HEADLESS', 'true').lower() == 'true'
	SLOW_MO = int(os.getenv('AUTOMATION_SLOW_MO', '0'))
	VIEWPORT_WIDTH = int(os.getenv('AUTOMATION_VIEWPORT_WIDTH', '1280'))
	VIEWPORT_HEIGHT = int(os.getenv('AUTOMATION_VIEWPORT_HEIGHT', '720'))

	# Auth state
	AUTH_STATE_PATH = AUTOMATION_ROOT / 'storage' / 'auth_state.json'

	# Output directories
	SCREENSHOTS_DIR = AUTOMATION_ROOT / 'output' / 'screenshots'
	DOWNLOADS_DIR = AUTOMATION_ROOT / 'output' / 'downloads'
	LOGS_DIR = AUTOMATION_ROOT / 'output' / 'logs'

	# Timeouts (ms)
	DEFAULT_TIMEOUT = 30_000
	NAVIGATION_TIMEOUT = 60_000
	AUTH_TIMEOUT = 180_000  # 3 min for manual auth

	@classmethod
	def ensure_dirs(cls):
		"""Create output directories if they don't exist."""
		for d in [cls.SCREENSHOTS_DIR, cls.DOWNLOADS_DIR, cls.LOGS_DIR, cls.AUTH_STATE_PATH.parent]:
			d.mkdir(parents=True, exist_ok=True)
