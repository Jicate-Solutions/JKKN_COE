#!/bin/bash
# Bash-Aggressive MCP Audit
# Identifies MCPs that wrap bash-native operations

set -e

SETTINGS_FILE="$HOME/.claude/settings.local.json"

echo "=============================================="
echo "  MCP AUDIT - Substrate-First Analysis"
echo "=============================================="
echo ""

# Check if settings file exists
if [[ ! -f "$SETTINGS_FILE" ]]; then
    echo "ERROR: Settings file not found at $SETTINGS_FILE"
    exit 1
fi

# Get enabled servers
echo "ENABLED MCPs:"
echo "-------------"
ENABLED=$(cat "$SETTINGS_FILE" 2>/dev/null | grep -A 100 '"enabledServers"' | grep -E '^\s+"[^"]+"' | tr -d ' ",' | grep -v "enabledServers" | head -20)

if [[ -z "$ENABLED" ]]; then
    echo "(none found or unable to parse)"
else
    echo "$ENABLED" | while read -r mcp; do
        [[ -n "$mcp" ]] && echo "  - $mcp"
    done
fi

echo ""

# Get deny list
echo "DENIED MCPs:"
echo "------------"
DENIED=$(cat "$SETTINGS_FILE" 2>/dev/null | grep -A 50 '"deny"' | grep -E '^\s+"[^"]+"' | tr -d ' ",' | grep -v "deny" | head -20)

if [[ -z "$DENIED" ]]; then
    echo "(none)"
else
    echo "$DENIED" | while read -r mcp; do
        [[ -n "$mcp" ]] && echo "  - $mcp"
    done
fi

echo ""
echo "=============================================="
echo "  REDUNDANCY ANALYSIS"
echo "=============================================="
echo ""

REDUNDANT_COUNT=0
KEEP_COUNT=0
UNKNOWN_COUNT=0

# Analyze each enabled MCP
echo "$ENABLED" | while read -r mcp; do
    [[ -z "$mcp" ]] && continue

    case "$mcp" in
        memory|mcp-memory)
            echo "REDUNDANT  $mcp"
            echo "           Reason: Memory = files = bash native"
            echo "           Fix: Add mcp__memory__* to deny list"
            echo ""
            ;;
        MCP_DOCKER|mcp-docker|docker)
            echo "REDUNDANT  $mcp"
            echo "           Reason: Unreliable, use direct tools"
            echo "           Fix: Add mcp__MCP_DOCKER__* to deny list"
            echo ""
            ;;
        obsidian-mcp|obsidian)
            echo "CONDITIONAL  $mcp"
            echo "           Keep IF: You need knowledge graph visualization"
            echo "           Remove IF: Only reading/writing markdown files"
            echo "           Substrate: Markdown files (bash native for content)"
            echo ""
            ;;
        fireflies)
            echo "KEEP  $mcp"
            echo "           Reason: Meeting transcript API (OAuth required)"
            echo ""
            ;;
        whatsapp)
            echo "KEEP  $mcp"
            echo "           Reason: WhatsApp protocol (complex, not bash native)"
            echo ""
            ;;
        google-vision-ocr|vision-ocr|ocr)
            echo "KEEP  $mcp"
            echo "           Reason: Google Vision API (external service)"
            echo ""
            ;;
        context7)
            echo "KEEP  $mcp"
            echo "           Reason: Library documentation index (specialized)"
            echo ""
            ;;
        playwright)
            echo "KEEP  $mcp"
            echo "           Reason: Browser state management (not bash native)"
            echo ""
            ;;
        jkkn-google-chat|google-chat)
            echo "KEEP  $mcp"
            echo "           Reason: Google Chat API (OAuth required)"
            echo ""
            ;;
        skill-manager)
            echo "KEEP  $mcp"
            echo "           Reason: Skill management utility"
            echo ""
            ;;
        *)
            echo "UNKNOWN  $mcp"
            echo "           Check: What is this made of?"
            echo "           If files/text → REDUNDANT"
            echo "           If external API → KEEP"
            echo ""
            ;;
    esac
done

echo "=============================================="
echo "  SUBSTRATE-FIRST PRINCIPLE"
echo "=============================================="
echo ""
echo "Before using an MCP, ask: 'What is X made of?'"
echo ""
echo "  Files/folders    → bash (cat, grep, ls)"
echo "  Text processing  → bash (sed, awk)"
echo "  Git operations   → bash (git CLI)"
echo "  Browser state    → Playwright (KEEP)"
echo "  OAuth APIs       → MCP (KEEP)"
echo "  Protocols        → MCP (KEEP)"
echo ""
