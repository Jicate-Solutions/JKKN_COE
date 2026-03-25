"""
Centralized selector helpers for JKKN COE UI components.

Based on Shadcn UI (Radix primitives):
- Combobox dropdowns use role="combobox" buttons
- Options use role="option"
- Sheets/Dialogs use role="dialog"
- Toast notifications use data-sonner-toast
"""


class ShadcnSelectors:
	"""Selectors for Shadcn UI components used in JKKN COE."""

	@staticmethod
	def combobox(label: str) -> str:
		"""Selector for a combobox dropdown by its placeholder text."""
		return f'button[role="combobox"]:has-text("{label}")'

	@staticmethod
	def enabled_option() -> str:
		"""Selector for enabled dropdown options."""
		return '[role="option"]:not([data-disabled]):not([aria-disabled="true"])'

	@staticmethod
	def option_with_text(text: str) -> str:
		"""Selector for a specific dropdown option."""
		return f'[role="option"]:has-text("{text}")'

	@staticmethod
	def table_row(text: str | None = None) -> str:
		"""Selector for table rows, optionally containing text."""
		if text:
			return f'tbody tr:has-text("{text}")'
		return 'tbody tr'

	@staticmethod
	def button(text: str) -> str:
		"""Selector for a button by text content."""
		return f'button:has-text("{text}")'

	@staticmethod
	def toast() -> str:
		"""Selector for toast notifications."""
		return '[data-sonner-toast], li[role="status"]'

	@staticmethod
	def search_input() -> str:
		"""Selector for search input fields."""
		return 'input[placeholder*="Search"], input[placeholder*="search"]'

	@staticmethod
	def dialog() -> str:
		"""Selector for sheet/dialog content."""
		return '[role="dialog"]'

	@staticmethod
	def tab(text: str) -> str:
		"""Selector for a tab trigger."""
		return f'[role="tab"]:has-text("{text}")'

	@staticmethod
	def checkbox(label: str) -> str:
		"""Selector for a checkbox by its label."""
		return f'label:has-text("{label}") input[type="checkbox"], button[role="checkbox"]:near(label:has-text("{label}"))'
