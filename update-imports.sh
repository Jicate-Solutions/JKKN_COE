#!/bin/bash

# Update auth-context imports
echo "Updating auth-context imports..."
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/auth-context|@/context/auth-context|g' {} \; 2>/dev/null

# Update auth service imports
echo "Updating auth service imports..."
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/google-auth-service|@/services/auth/google-auth-service|g' {} \; 2>/dev/null
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/parent-auth-service|@/services/auth/parent-auth-service|g' {} \; 2>/dev/null
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/supabase-auth-service|@/services/auth/supabase-auth-service|g' {} \; 2>/dev/null
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/session-timeout-service|@/services/auth/session-timeout-service|g' {} \; 2>/dev/null
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/session-validator|@/services/auth/session-validator|g' {} \; 2>/dev/null
find app components middleware.ts -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/dev-auth-bypass|@/services/auth/dev-auth-bypass|g' {} \; 2>/dev/null

# Update hook imports
echo "Updating hook imports..."
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/use-permission-sync|@/hooks/use-permission-sync|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/auth/use-session-timeout|@/hooks/use-session-timeout|g' {} \; 2>/dev/null

# Update other service imports
echo "Updating other service imports..."
find app -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/email-service|@/services/email-service|g' {} \; 2>/dev/null
find app -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/lib/myjkkn-api|@/services/myjkkn-api|g' {} \; 2>/dev/null

# Update layout component imports
echo "Updating layout component imports..."
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/app-header|@/components/layout/app-header|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/app-sidebar|@/components/layout/app-sidebar|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/app-footer|@/components/layout/app-footer|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/nav-main|@/components/layout/nav-main|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/nav-user|@/components/layout/nav-user|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/nav-documents|@/components/layout/nav-documents|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/nav-projects|@/components/layout/nav-projects|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/team-switcher|@/components/layout/team-switcher|g' {} \; 2>/dev/null

# Update common component imports
echo "Updating common component imports..."
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/data-table|@/components/common/data-table|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/google-sign-in-button|@/components/common/google-sign-in-button|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/mode-toggle|@/components/common/mode-toggle|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/protected-route|@/components/common/protected-route|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/session-timeout-provider|@/components/common/session-timeout-provider|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/session-timeout-warning|@/components/common/session-timeout-warning|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/theme-provider|@/components/common/theme-provider|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/chart-area-interactive|@/components/common/chart-area-interactive|g' {} \; 2>/dev/null
find app components -type f \( -name "*.tsx" -o -name "*.ts" \) -exec sed -i 's|@/components/mobile-optimized-layout|@/components/common/mobile-optimized-layout|g' {} \; 2>/dev/null

echo "Import paths updated successfully!"
