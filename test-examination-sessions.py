"""Test Examination Sessions page for loading and infinite refresh issues"""
from playwright.sync_api import sync_playwright
import time

def test_examination_sessions():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Track network requests to detect infinite refresh
        request_count = 0
        api_calls = []

        def on_request(request):
            nonlocal request_count
            request_count += 1
            if '/api/' in request.url:
                api_calls.append(request.url)

        page.on('request', on_request)

        # Track console errors
        console_errors = []
        def on_console(msg):
            if msg.type == 'error':
                console_errors.append(msg.text)

        page.on('console', on_console)

        print("1. Navigating to examination sessions page...")
        page.goto('http://localhost:3000/exam-management/examination-sessions')

        print("2. Waiting for initial load...")
        page.wait_for_load_state('networkidle')

        # Take initial screenshot
        page.screenshot(path='test-screenshot-1.png', full_page=True)
        print(f"   Screenshot saved: test-screenshot-1.png")
        print(f"   Initial request count: {request_count}")
        print(f"   API calls so far: {len(api_calls)}")

        # Wait 5 seconds to check for infinite refresh
        print("3. Waiting 5 seconds to check for infinite refresh...")
        initial_count = request_count
        time.sleep(5)

        # Take another screenshot
        page.screenshot(path='test-screenshot-2.png', full_page=True)
        print(f"   Screenshot saved: test-screenshot-2.png")
        print(f"   Request count after 5s: {request_count}")
        print(f"   New requests during wait: {request_count - initial_count}")

        # Check if there's an infinite loop (many requests during wait)
        new_requests = request_count - initial_count
        if new_requests > 10:
            print(f"   WARNING: Possible infinite refresh detected! ({new_requests} new requests)")
        else:
            print(f"   OK: No infinite refresh detected")

        # Check page content
        print("4. Checking page content...")

        # Check for loading state
        loading_visible = page.locator('text=Loading').is_visible()
        print(f"   Loading indicator visible: {loading_visible}")

        # Check for table
        table_visible = page.locator('table').is_visible()
        print(f"   Table visible: {table_visible}")

        # Check for "No data" message
        no_data_visible = page.locator('text=No data').is_visible()
        print(f"   'No data' message visible: {no_data_visible}")

        # Check for Add button
        add_button = page.locator('button:has-text("Add")')
        add_button_visible = add_button.is_visible()
        print(f"   Add button visible: {add_button_visible}")

        # Check for scorecard stats
        total_sessions_card = page.locator('text=Total Sessions')
        total_sessions_visible = total_sessions_card.is_visible()
        print(f"   Stats cards visible: {total_sessions_visible}")

        # List API calls
        print("\n5. API calls made:")
        unique_apis = list(set(api_calls))
        for api in sorted(unique_apis)[:15]:  # Limit to 15
            count = api_calls.count(api)
            print(f"   [{count}x] {api}")

        # Report console errors
        if console_errors:
            print("\n6. Console errors:")
            for error in console_errors[:10]:
                print(f"   - {error[:100]}...")
        else:
            print("\n6. No console errors detected")

        # Final assessment
        print("\n=== TEST RESULTS ===")
        if new_requests > 10:
            print("FAIL: Infinite refresh detected")
        elif loading_visible and not table_visible:
            print("FAIL: Page stuck on loading")
        elif not table_visible:
            print("WARNING: Table not visible (may need authentication)")
        else:
            print("PASS: Page loads correctly")

        browser.close()

if __name__ == '__main__':
    test_examination_sessions()
