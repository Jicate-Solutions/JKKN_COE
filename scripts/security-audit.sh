#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# JKKN COE Security Self-Audit Script
# Run this before deployments to catch common security issues.
#
# Usage: bash scripts/security-audit.sh [base_url]
# Default base_url: http://localhost:3000
# ═══════════════════════════════════════════════════════════════

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
WARN=0

green() { echo -e "\033[32m  PASS\033[0m $1"; PASS=$((PASS+1)); }
red()   { echo -e "\033[31m  FAIL\033[0m $1"; FAIL=$((FAIL+1)); }
yellow(){ echo -e "\033[33m  WARN\033[0m $1"; WARN=$((WARN+1)); }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " JKKN COE Security Audit"
echo " Target: $BASE_URL"
echo " Date:   $(date -u +"%Y-%m-%d %H:%M UTC")"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ─── 1. Security Headers ────────────────────────────────────
echo "--- Security Headers ---"

HEADERS=$(curl -sI "$BASE_URL" 2>/dev/null)

check_header() {
  local name="$1"
  local expected="$2"
  if echo "$HEADERS" | grep -qi "$name"; then
    if [ -n "$expected" ]; then
      if echo "$HEADERS" | grep -qi "$name.*$expected"; then
        green "$name contains '$expected'"
      else
        yellow "$name present but unexpected value"
      fi
    else
      green "$name present"
    fi
  else
    red "$name missing"
  fi
}

check_header "Content-Security-Policy"
check_header "X-Content-Type-Options" "nosniff"
check_header "X-Frame-Options" "SAMEORIGIN"
check_header "Referrer-Policy"
check_header "Permissions-Policy"
check_header "X-XSS-Protection"

# Check for nonce in CSP
if echo "$HEADERS" | grep -q "nonce-"; then
  green "CSP contains nonce (script nonce active)"
else
  yellow "CSP missing nonce — unsafe-inline fallback only"
fi

echo ""

# ─── 2. CSRF Protection ─────────────────────────────────────
echo "--- CSRF Protection ---"

# Check that CSRF cookie is set
CSRF_COOKIE=$(curl -sI "$BASE_URL" 2>/dev/null | grep -i "set-cookie.*csrf_token")
if [ -n "$CSRF_COOKIE" ]; then
  green "CSRF cookie set on page load"
else
  yellow "CSRF cookie not set (may need page visit first)"
fi

# Test POST without CSRF token — should return 403
CSRF_TEST=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/master/courses" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' 2>/dev/null)

if [ "$CSRF_TEST" = "403" ]; then
  green "POST without CSRF token blocked (403)"
elif [ "$CSRF_TEST" = "401" ]; then
  green "POST blocked by auth before reaching CSRF (401)"
else
  red "POST without CSRF token returned $CSRF_TEST (expected 403)"
fi

echo ""

# ─── 3. Rate Limiting ───────────────────────────────────────
echo "--- Rate Limiting ---"

# Send 15 rapid requests to auth endpoint
echo -n "  Testing rate limit on /api/auth (15 rapid requests)... "
RATE_RESULT="pass"
for i in $(seq 1 15); do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/verify" 2>/dev/null)
  if [ "$CODE" = "429" ]; then
    green "Rate limit triggered after $i requests (429)"
    RATE_RESULT="done"
    break
  fi
done
if [ "$RATE_RESULT" = "pass" ]; then
  yellow "Rate limit not triggered in 15 requests (may need more)"
fi

echo ""

# ─── 4. Authentication ──────────────────────────────────────
echo "--- Authentication ---"

# Test protected route without auth
AUTH_TEST=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/admin/role-management" 2>/dev/null)
if [ "$AUTH_TEST" = "401" ]; then
  green "Admin API returns 401 without auth"
elif [ "$AUTH_TEST" = "403" ]; then
  green "Admin API returns 403 without auth"
else
  red "Admin API returned $AUTH_TEST without auth (expected 401/403)"
fi

# Test protected page redirect
PAGE_TEST=$(curl -s -o /dev/null -w "%{http_code}" -L "$BASE_URL/dashboard" 2>/dev/null)
if [ "$PAGE_TEST" = "200" ]; then
  # Check if it redirected to login
  FINAL_URL=$(curl -s -o /dev/null -w "%{url_effective}" -L "$BASE_URL/dashboard" 2>/dev/null)
  if echo "$FINAL_URL" | grep -q "login"; then
    green "Protected page redirects to login"
  else
    yellow "Protected page returned 200 (may be SSR rendering login)"
  fi
else
  green "Protected page returned $PAGE_TEST"
fi

echo ""

# ─── 5. npm Audit ────────────────────────────────────────────
echo "--- Dependency Vulnerabilities ---"

if command -v npm &> /dev/null; then
  AUDIT=$(npm audit 2>/dev/null | tail -1)
  if echo "$AUDIT" | grep -q "found 0"; then
    green "npm audit: 0 vulnerabilities"
  else
    red "npm audit: $AUDIT"
  fi
else
  yellow "npm not available — skip dependency check"
fi

echo ""

# ─── 6. Sensitive File Exposure ──────────────────────────────
echo "--- Sensitive File Exposure ---"

for path in "/.env" "/.env.local" "/.git/config" "/api/debug-oauth" "/supabase/.temp"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path" 2>/dev/null)
  if [ "$CODE" = "200" ]; then
    red "$path accessible (returned 200)"
  else
    green "$path not accessible ($CODE)"
  fi
done

echo ""

# ─── 7. IP Allowlist (Admin) ─────────────────────────────────
echo "--- IP Allowlist ---"

if [ -n "$ADMIN_ALLOWED_IPS" ]; then
  green "ADMIN_ALLOWED_IPS is configured"
else
  yellow "ADMIN_ALLOWED_IPS not set (IP allowlisting disabled)"
fi

echo ""

# ─── Summary ─────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
echo " Results: $PASS passed, $FAIL failed, $WARN warnings"
echo "═══════════════════════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo " ACTION REQUIRED: Fix $FAIL failing checks before deployment."
  exit 1
fi

exit 0
