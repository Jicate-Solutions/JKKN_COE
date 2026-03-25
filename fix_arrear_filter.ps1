# Fix semester filtering in API route to include arrear papers
$file = "app\api\reports\semester-marksheet\route.ts"
$content = Get-Content $file -Raw

# Fix 1: Comment out semester filter in student-marksheet action (around line 181-183)
$pattern1 = '(\t\t\.eq\(''is_active'', true\))\r?\n\r?\n\t\tif \(semester\) \{\r?\n\t\t\tquery = query\.eq\(''course_offerings\.semester'', parseInt\(semester\)\)\r?\n\t\t\}'
$replacement1 = '$1

		// ✅ REMOVED: Fetch ALL courses (current + arrears) - DO NOT filter by semester!
		// if (semester) {
		// 	query = query.eq(''course_offerings.semester'', parseInt(semester))
		// }'

$content = $content -replace $pattern1, $replacement1

# Fix 2: Comment out semester filter in batch-marksheet action (around line 767-769)
$pattern2 = '(\t\t\.eq\(''is_active'', true\))\r?\n\r?\n\t\tif \(programCode\) \{([\s\S]*?)\r?\n\r?\n\t\tif \(semester\) \{\r?\n\t\t\tquery = query\.eq\(''course_offerings\.semester'', parseInt\(semester\)\)\r?\n\t\t\}'
$replacement2 = '$1

		if (programCode) {$2

		// ✅ REMOVED: Fetch ALL courses (current + arrears) - DO NOT filter by semester!
		// if (semester) {
		// 	query = query.eq(''course_offerings.semester'', parseInt(semester))
		// }'

$content = $content -replace $pattern2, $replacement2

# Save the file
$content | Set-Content $file -NoNewline

Write-Host "✅ Fixed semester filtering in $file"
Write-Host "Changes made:"
Write-Host "1. Commented out semester filter in student-marksheet action"
Write-Host "2. Commented out semester filter in batch-marksheet action"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Restart your dev server (Ctrl+C and npm run dev)"
Write-Host "2. Refresh the browser (Ctrl+F5)"
Write-Host "3. Generate the marksheet again - should now show all 13 courses!"
