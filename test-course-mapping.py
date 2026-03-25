from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, slow_mo=100)
    page = browser.new_page()

    print('=== Step 1: Login with Google OAuth ===')
    page.goto('http://localhost:3000/login', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    time.sleep(2)

    # Click "Continue with Google" button
    print('Clicking Continue with Google...')
    google_btn = page.locator('button:has-text("Continue with Google")')
    if google_btn.count() > 0:
        google_btn.click()
        print('')
        print('*** PLEASE COMPLETE GOOGLE LOGIN IN THE BROWSER ***')
        print('*** You have 3 minutes to complete authentication ***')
        print('')

        try:
            page.wait_for_url('**/dashboard**', timeout=180000)
            print('Login successful!')
        except:
            current_url = page.url
            if 'dashboard' in current_url or ('localhost:3000' in current_url and 'login' not in current_url):
                print('Authentication successful!')
            else:
                print('Check browser for login status')

    time.sleep(3)

    print('\n=== Step 2: Navigate to Course Mapping ===')
    page.goto('http://localhost:3000/course-management/course-mapping/add', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=60000)
    time.sleep(10)

    print(f'URL: {page.url}')
    page.screenshot(path='test-step1-initial.png', full_page=True)

    if 'login' in page.url:
        print('Auth failed - stopping')
        time.sleep(30)
        browser.close()
        exit(1)

    print('Page loaded!')

    # Step 3: Institution
    print('\n=== Step 3: Select Institution ===')
    time.sleep(3)

    # Look for institution dropdown
    inst_dropdown = page.locator('button[role="combobox"]:has-text("Select institution")')
    if inst_dropdown.count() > 0:
        print('Opening institution dropdown...')
        inst_dropdown.first.click()
        time.sleep(3)

        # Find enabled options only (skip "No institutions found" type)
        all_options = page.locator('[role="option"]')
        print(f'Total options: {all_options.count()}')

        selected = False
        for i in range(all_options.count()):
            opt = all_options.nth(i)
            is_disabled = opt.get_attribute('data-disabled')
            aria_disabled = opt.get_attribute('aria-disabled')
            text = opt.text_content() or ""

            if is_disabled == '' or aria_disabled == 'true':
                print(f'  Option {i}: "{text[:30]}" - DISABLED, skipping')
                continue

            print(f'  Option {i}: "{text[:30]}" - ENABLED')
            opt.click()
            print(f'Selected institution: {text}')
            selected = True
            break

        if not selected:
            print('No enabled institution options found')
            page.keyboard.press('Escape')

        # Wait for programs to load
        print('Waiting for programs (up to 45s)...')
        for i in range(45):
            time.sleep(1)
            prog = page.locator('button[role="combobox"]:has-text("Select program")')
            if prog.count() > 0:
                is_disabled = prog.first.get_attribute('disabled')
                if is_disabled is None:
                    print(f'  Programs ready after {i+1}s!')
                    break
            if i % 10 == 0 and i > 0:
                print(f'  Still waiting... ({i}s)')
    else:
        print('Institution dropdown not visible')

    page.screenshot(path='test-step2-institution.png', full_page=True)

    # Step 4: Program
    print('\n=== Step 4: Select Program ===')
    prog_dropdown = page.locator('button[role="combobox"]:has-text("Select program")')

    if prog_dropdown.count() > 0:
        is_disabled = prog_dropdown.first.get_attribute('disabled')
        if is_disabled is None:
            print('Opening program dropdown...')
            prog_dropdown.first.click()
            time.sleep(3)

            all_options = page.locator('[role="option"]')
            print(f'Total options: {all_options.count()}')

            selected = False
            for i in range(all_options.count()):
                opt = all_options.nth(i)
                is_disabled = opt.get_attribute('data-disabled')
                aria_disabled = opt.get_attribute('aria-disabled')
                text = opt.text_content() or ""

                if is_disabled == '' or aria_disabled == 'true':
                    print(f'  Option {i}: "{text[:30]}" - DISABLED')
                    continue

                print(f'  Option {i}: "{text[:30]}" - ENABLED')
                opt.click()
                print(f'Selected program: {text}')
                selected = True
                break

            if not selected:
                print('No enabled program options')
                page.keyboard.press('Escape')
            else:
                # Wait for regulations
                print('Waiting for regulations (up to 30s)...')
                for i in range(30):
                    time.sleep(1)
                    reg = page.locator('button[role="combobox"]:has-text("Select regulation")')
                    if reg.count() > 0 and reg.first.get_attribute('disabled') is None:
                        print(f'  Regulations ready after {i+1}s!')
                        break
        else:
            print('Program dropdown DISABLED')
    else:
        print('Program dropdown not found')

    page.screenshot(path='test-step3-program.png', full_page=True)

    # Step 5: Regulation
    print('\n=== Step 5: Select Regulation ===')
    reg_dropdown = page.locator('button[role="combobox"]:has-text("Select regulation")')

    if reg_dropdown.count() > 0:
        is_disabled = reg_dropdown.first.get_attribute('disabled')
        if is_disabled is None:
            print('Opening regulation dropdown...')
            reg_dropdown.first.click()
            time.sleep(3)

            all_options = page.locator('[role="option"]')
            print(f'Total options: {all_options.count()}')

            selected = False
            for i in range(all_options.count()):
                opt = all_options.nth(i)
                is_disabled = opt.get_attribute('data-disabled')
                aria_disabled = opt.get_attribute('aria-disabled')
                text = opt.text_content() or ""

                if is_disabled == '' or aria_disabled == 'true':
                    print(f'  Option {i}: "{text[:30]}" - DISABLED')
                    continue

                print(f'  Option {i}: "{text[:30]}" - ENABLED')
                opt.click()
                print(f'Selected regulation: {text}')
                selected = True
                break

            if not selected:
                print('No enabled regulation options')
                page.keyboard.press('Escape')
            else:
                # Wait for semesters
                print('Waiting for semesters (up to 20s)...')
                for i in range(20):
                    time.sleep(1)
                    sem = page.locator('h3:has-text("Semester")')
                    if sem.count() > 0:
                        print(f'  Semesters loaded after {i+1}s!')
                        break
        else:
            print('Regulation dropdown DISABLED')
    else:
        print('Regulation dropdown not found')

    page.screenshot(path='test-step4-regulation.png', full_page=True)

    # Step 6: Semesters
    print('\n=== Step 6: Semester Tables ===')
    time.sleep(3)
    sem = page.locator('h3:has-text("Semester")')
    print(f'Found {sem.count()} semesters')

    if sem.count() > 0:
        print('Expanding first semester...')
        sem.first.click()
        time.sleep(1)
        page.screenshot(path='test-step5-semesters.png', full_page=True)

        # Step 7: Add course
        print('\n=== Step 7: Add Course ===')
        add_btn = page.locator('button:has-text("Add Course")').first
        if add_btn.count() > 0:
            add_btn.click()
            time.sleep(1)

            for cb in page.locator('button[role="combobox"]').all():
                text = cb.text_content() or ""
                if "Select course" in text or "No courses" in text:
                    print(f'Course selector: {text[:40]}')
                    cb.click()
                    time.sleep(2)

                    opts = page.locator('[role="option"]:not([data-disabled]):not([aria-disabled="true"])')
                    print(f'Found {opts.count()} enabled courses')

                    if opts.count() > 0:
                        course_name = opts.first.text_content()
                        print(f'Selecting: {course_name[:50] if course_name else "?"}')
                        opts.first.click()
                        time.sleep(1)
                    else:
                        page.keyboard.press('Escape')
                        print('No enabled courses')
                    break

        page.screenshot(path='test-step6-course.png', full_page=True)

        # Step 8: Save
        print('\n=== Step 8: Save ===')
        save_btn = page.locator('button:has-text("Save All")')
        if save_btn.count() > 0:
            print('Clicking Save All...')
            save_btn.click()
            time.sleep(5)
            page.screenshot(path='test-step7-saved.png', full_page=True)

            toast = page.locator('[data-sonner-toast], li[role="status"]')
            if toast.count() > 0:
                print(f'Result: {toast.first.text_content()[:100] if toast.first.text_content() else ""}')
    else:
        print('No semesters - form incomplete')
        page.screenshot(path='test-no-semesters.png', full_page=True)

    page.screenshot(path='test-final.png', full_page=True)

    print('\n' + '='*50)
    print('TEST COMPLETE')
    print('='*50)
    print('Browser open for 60s...')
    time.sleep(60)
    browser.close()
