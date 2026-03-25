#!/bin/bash
# Audit CLAUDE.md for substrate-first compliance
# Checks both global and project CLAUDE.md files

set -e

GLOBAL_CLAUDE_MD="$HOME/.claude/CLAUDE.md"
PROJECT_CLAUDE_MD=""

# Find project CLAUDE.md if in a project
if [[ -f "./CLAUDE.md" ]]; then
    PROJECT_CLAUDE_MD="./CLAUDE.md"
elif [[ -f "./.claude/CLAUDE.md" ]]; then
    PROJECT_CLAUDE_MD="./.claude/CLAUDE.md"
fi

echo "=============================================="
echo "  CLAUDE.MD AUDIT - Substrate-First Check"
echo "=============================================="
echo ""

audit_claude_md() {
    local file="$1"
    local name="$2"

    if [[ ! -f "$file" ]]; then
        echo "MISSING: $name at $file"
        echo "         Create one with substrate-first principles"
        echo ""
        return
    fi

    echo "CHECKING: $name"
    echo "Path: $file"
    echo "Lines: $(wc -l < "$file" | tr -d ' ')"
    echo ""

    # Check for key sections
    echo "--- Required Sections ---"

    # Bash hierarchy
    if grep -qi "bash.*hierarchy\|bash.*first\|bash over mcp" "$file"; then
        echo "FOUND: Bash hierarchy section"
    else
        echo "MISSING: No bash hierarchy mentioned"
        echo "         ADD: Section on bash-first tool selection"
    fi

    # Substrate-first thinking
    if grep -qi "substrate.*first\|what is.*made of\|substrate.*thinking" "$file"; then
        echo "FOUND: Substrate-first thinking"
    else
        echo "MISSING: No substrate-first principle"
        echo "         ADD: 'Before asking what tool does X, ask what is X made of'"
    fi

    # Memory approach
    if grep -qi "vault.*files\|vault.*memory\|bash.*memory" "$file"; then
        echo "FOUND: Vault-based memory approach"
    else
        echo "CHECK: Memory approach not specified"
        echo "         RECOMMEND: Document using vault files instead of Memory MCP"
    fi

    echo ""
    echo "--- Anti-Patterns Check ---"

    # Check for anti-patterns
    if grep -qi "memory mcp\|use memory mcp" "$file" | grep -vi "deprecated\|disabled\|don't use"; then
        echo "WARNING: References Memory MCP without deprecation notice"
        echo "         FIX: Mark Memory MCP as deprecated, recommend vault files"
    else
        echo "OK: No problematic Memory MCP references"
    fi

    if grep -qi "mcp_docker\|mcp docker" "$file" | grep -vi "disabled\|unreliable\|don't use"; then
        echo "WARNING: References MCP_DOCKER without warning"
        echo "         FIX: Mark MCP_DOCKER as disabled/unreliable"
    else
        echo "OK: No problematic MCP_DOCKER references"
    fi

    echo ""
    echo "--- Recommendations ---"

    # Check file size
    local lines=$(wc -l < "$file" | tr -d ' ')
    if [[ $lines -gt 500 ]]; then
        echo "CONSIDER: File is large ($lines lines)"
        echo "          Break into sections or use references/"
    fi

    # Check for decision tree
    if grep -qi "decision tree\|tool selection order" "$file"; then
        echo "GOOD: Has decision tree for tool selection"
    else
        echo "ADD: Decision tree for Bash > Built-in > Skills > MCPs"
    fi

    echo ""
}

# Audit global CLAUDE.md
audit_claude_md "$GLOBAL_CLAUDE_MD" "Global CLAUDE.md"

# Audit project CLAUDE.md if exists
if [[ -n "$PROJECT_CLAUDE_MD" ]]; then
    audit_claude_md "$PROJECT_CLAUDE_MD" "Project CLAUDE.md"
fi

echo "=============================================="
echo "  RECOMMENDED CLAUDE.MD SECTIONS"
echo "=============================================="
echo ""
cat << 'TEMPLATE'
Add these sections to your CLAUDE.md if missing:

## Bash-First Tool Hierarchy

1. CAN BASH DO IT? → YES: Use bash
2. CAN BUILT-IN TOOLS DO IT? → YES: Use Read, Edit, Glob, Grep
3. WOULD A SKILL SAVE TIME? → Check if provides domain expertise
4. DO I NEED EXTERNAL CAPABILITY? → Only then use MCP

## Substrate-First Thinking

Before asking "what tool does X?", ask "what is X made of?"

| Thing | Substrate | Use |
|-------|-----------|-----|
| Files | Filesystem | bash (cat, grep, sed) |
| Memory | Files | vault files |
| Git | Local repo | git CLI |
| Browser | Process | Playwright MCP |
| APIs | OAuth/tokens | appropriate MCP |

## Memory Approach

- Global: ~/Vaults/Claude Setup/Memory/
- Project: .claude/memory/
- Access: bash native (cat, echo, grep)
- NOT: Memory MCP (deprecated)

## Disabled/Denied MCPs

| MCP | Status | Reason |
|-----|--------|--------|
| memory | DENIED | Use vault files |
| MCP_DOCKER | DENIED | Unreliable |
TEMPLATE

echo ""
