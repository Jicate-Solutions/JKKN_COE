# =============================================================================
# Diagnostic script for: GET /api/v1/institutions returning 404
#
# Run from project root in PowerShell:
#   .\scripts\diagnose-v1-institutions.ps1
#
# Make sure `npm run dev` is running on localhost:3000 first.
# =============================================================================

$BaseUrl = "http://localhost:3000"
$Endpoint = "$BaseUrl/api/v1/institutions"

Write-Host ""
Write-Host "=== JKKN COE — v1/institutions diagnostic ===" -ForegroundColor Cyan
Write-Host ""

# -----------------------------------------------------------------------------
# Test 1: Plain GET without any auth headers
# Expected: 401 with body { error: "Missing API credentials...", code: "MISSING_CREDENTIALS" }
# If 404: route is not registered (build cache or syntax issue)
# -----------------------------------------------------------------------------
Write-Host "[1] Plain GET (no auth headers)" -ForegroundColor Yellow
Write-Host "    Expected: 401 MISSING_CREDENTIALS"
try {
    $r1 = Invoke-WebRequest -Uri $Endpoint -Method Get -SkipHttpErrorCheck
    Write-Host "    Status: $($r1.StatusCode)" -ForegroundColor $(if ($r1.StatusCode -eq 401) { 'Green' } else { 'Red' })
    Write-Host "    Body  : $($r1.Content)"
} catch {
    Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# -----------------------------------------------------------------------------
# Test 2: OPTIONS preflight (simulates browser CORS preflight)
# Expected: 204 with Access-Control-Allow-Origin header present
# -----------------------------------------------------------------------------
Write-Host "[2] OPTIONS preflight (simulating browser CORS)" -ForegroundColor Yellow
Write-Host "    Expected: 204 + Access-Control-Allow-Origin header"
try {
    $r2 = Invoke-WebRequest -Uri $Endpoint -Method Options -Headers @{
        'Origin' = 'https://child-app.example.com'
        'Access-Control-Request-Method' = 'GET'
        'Access-Control-Request-Headers' = 'X-API-Key-Id, X-API-Secret'
    } -SkipHttpErrorCheck
    Write-Host "    Status: $($r2.StatusCode)" -ForegroundColor $(if ($r2.StatusCode -eq 204) { 'Green' } else { 'Red' })
    Write-Host "    Access-Control-Allow-Origin : $($r2.Headers['Access-Control-Allow-Origin'])"
    Write-Host "    Access-Control-Allow-Methods: $($r2.Headers['Access-Control-Allow-Methods'])"
    Write-Host "    Access-Control-Allow-Headers: $($r2.Headers['Access-Control-Allow-Headers'])"
} catch {
    Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# -----------------------------------------------------------------------------
# Test 3: GET with invalid auth headers
# Expected: 401 INVALID_KEY
# -----------------------------------------------------------------------------
Write-Host "[3] GET with fake API key" -ForegroundColor Yellow
Write-Host "    Expected: 401 INVALID_KEY"
try {
    $r3 = Invoke-WebRequest -Uri $Endpoint -Method Get -Headers @{
        'X-API-Key-Id' = 'AKID_FAKE_TEST'
        'X-API-Secret' = 'sk_fake_secret_for_testing_only'
    } -SkipHttpErrorCheck
    Write-Host "    Status: $($r3.StatusCode)" -ForegroundColor $(if ($r3.StatusCode -eq 401) { 'Green' } else { 'Red' })
    Write-Host "    Body  : $($r3.Content)"
} catch {
    Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Diagnosis ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If [1] returned 404:  Route not registered. Run: rm -r .next; npm run dev"
Write-Host "If [1] returned 401:  Route is fine. The 404s you saw must be from a different host (child app misrouting to jkkn.ai instead of your COE server)."
Write-Host "If [2] returned 204:  CORS is now correctly configured."
Write-Host "If [2] returned 404:  Restart dev server to pick up the OPTIONS export."
Write-Host ""
