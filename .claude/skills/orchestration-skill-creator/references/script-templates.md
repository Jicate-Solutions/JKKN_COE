# Script Templates

Scripts automate heavy lifting. Claude executes them, no tokens wasted on repetitive operations.

## When to Use Scripts vs Claude

| Task | Script | Claude |
|------|--------|--------|
| Create folders/files | ✅ Script | |
| Install dependencies | ✅ Script | |
| Run build/test | ✅ Script | |
| Parse command output | | ✅ Claude |
| Generate code | | ✅ Claude |
| Analyze data | ✅ Script for collection, Claude for insight |
| Deploy | ✅ Script (with Claude oversight) |

## Script Categories

### 1. Setup Scripts (Run Once)

```bash
#!/bin/bash
# init-project.sh - Initialize project structure

set -e

PROJECT_DIR="$1"
PROJECT_NAME="$2"

if [ -z "$PROJECT_DIR" ] || [ -z "$PROJECT_NAME" ]; then
    echo "Usage: init-project.sh <project_dir> <project_name>"
    exit 1
fi

echo "=== Creating project: $PROJECT_NAME ==="

mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Add project-specific initialization
# npm init -y
# npx create-next-app@latest . --typescript --tailwind --eslint
# etc.

echo "✅ Project initialized at $PROJECT_DIR"
```

### 2. Verification Scripts (Run by QA Phase)

```bash
#!/bin/bash
# verify-build.sh - Verify project builds successfully

set -e

PROJECT_DIR="$1"

if [ -z "$PROJECT_DIR" ]; then
    echo "Usage: verify-build.sh <project_dir>"
    exit 1
fi

cd "$PROJECT_DIR"

echo "=== TypeScript Check ==="
npx tsc --noEmit 2>&1 || true

echo ""
echo "=== ESLint Check ==="
npm run lint 2>&1 || true

echo ""
echo "=== Build ==="
npm run build 2>&1

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    exit 0
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
```

### 3. Analysis Scripts (Run by Verification Phases)

```bash
#!/bin/bash
# analyze-structure.sh - Analyze and report project structure

PROJECT_DIR="$1"

if [ -z "$PROJECT_DIR" ]; then
    echo "Usage: analyze-structure.sh <project_dir>"
    exit 1
fi

cd "$PROJECT_DIR"

echo "=== Project Structure Analysis ==="
echo ""

echo "## Files by Type"
echo "| Type | Count |"
echo "|------|-------|"
echo "| TypeScript (.ts) | $(find . -name "*.ts" -not -path "./node_modules/*" | wc -l | tr -d ' ') |"
echo "| TSX (.tsx) | $(find . -name "*.tsx" -not -path "./node_modules/*" | wc -l | tr -d ' ') |"
echo "| SQL (.sql) | $(find . -name "*.sql" -not -path "./node_modules/*" | wc -l | tr -d ' ') |"
echo ""

echo "## Routes/Pages"
find ./src/app -name "page.tsx" -not -path "./node_modules/*" 2>/dev/null | while read -r file; do
    route=$(dirname "$file" | sed 's|./src/app||' | sed 's|/page.tsx||')
    [ -z "$route" ] && route="/"
    echo "- $route"
done
```

### 4. Data Collection Scripts (For Analysis Phases)

```bash
#!/bin/bash
# analyze-field-utilization.sh - Analyze field usage in JSON files

OUTPUT_DIR="$1"
SCHEMA_FILE="$2"

if [ -z "$OUTPUT_DIR" ] || [ -z "$SCHEMA_FILE" ]; then
    echo "Usage: analyze-field-utilization.sh <output_dir> <schema_file>"
    exit 1
fi

echo "=== Field Utilization Analysis ==="
echo "Analyzing JSON files in: $OUTPUT_DIR"
echo "Against schema: $SCHEMA_FILE"
echo ""

# Count field occurrences
echo "## Field Counts"
for field in $(jq -r 'keys[]' "$SCHEMA_FILE" 2>/dev/null); do
    count=$(grep -r "\"$field\"" "$OUTPUT_DIR" --include="*.json" 2>/dev/null | wc -l | tr -d ' ')
    echo "- $field: $count occurrences"
done

echo ""
echo "✅ Analysis complete"
```

### 5. Deploy Scripts

```bash
#!/bin/bash
# deploy.sh - Deploy to Vercel

set -e

PROJECT_DIR="$1"

if [ -z "$PROJECT_DIR" ]; then
    echo "Usage: deploy.sh <project_dir>"
    exit 1
fi

cd "$PROJECT_DIR"

echo "=== Deploying to Vercel ==="

# Check if vercel CLI is available
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Deploy
vercel --prod

echo "✅ Deployment complete"
```

## Script Best Practices

### 1. Always Use `set -e`
Exit on first error - don't continue with broken state.

### 2. Always Validate Inputs
```bash
if [ -z "$PROJECT_DIR" ]; then
    echo "Usage: script.sh <project_dir>"
    exit 1
fi
```

### 3. Print Progress
```bash
echo "=== Step 1: Doing thing ==="
# do thing
echo "✅ Step 1 complete"
```

### 4. Return Exit Codes
- `exit 0` = success
- `exit 1` = failure

Claude reads exit codes to determine if phase succeeded.

### 5. Output Machine-Parseable Data
For analysis scripts, output in formats Claude can parse:
- Markdown tables
- JSON
- Key-value pairs

## How Agents Execute Scripts

In agent prompts, include:

```markdown
### 3. Execute the analysis script

Run: `${SKILL_DIR}/scripts/analyze-structure.sh {output_folder_path}`

Parse the output and incorporate findings into your report.
```

**Key insight:** Scripts do the heavy lifting. Claude does the thinking.
