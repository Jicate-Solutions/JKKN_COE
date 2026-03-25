#!/bin/bash
# Bash-Aggressive Skills Audit
# Identifies skills that wrap disabled MCPs or bash-native operations

set -e

SKILLS_DIR="$HOME/.claude/skills"
SETTINGS_FILE="$HOME/.claude/settings.local.json"

echo "=============================================="
echo "  SKILLS AUDIT - Substrate-First Analysis"
echo "=============================================="
echo ""

# Check if skills directory exists
if [[ ! -d "$SKILLS_DIR" ]]; then
    echo "ERROR: Skills directory not found at $SKILLS_DIR"
    exit 1
fi

# Count total skills
SKILL_COUNT=$(ls "$SKILLS_DIR" 2>/dev/null | wc -l | tr -d ' ')
echo "Total skills installed: $SKILL_COUNT"
echo ""

# Get deny list for cross-reference
DENIED=""
if [[ -f "$SETTINGS_FILE" ]]; then
    DENIED=$(cat "$SETTINGS_FILE" 2>/dev/null | grep -A 50 '"deny"' | grep -E '^\s+"[^"]+"' | tr -d ' ",' | grep -v "deny" | head -20)
fi

echo "=============================================="
echo "  MCP WRAPPER SKILLS"
echo "=============================================="
echo ""

MCP_SKILLS=$(ls "$SKILLS_DIR" 2>/dev/null | grep "^mcp-" || true)

if [[ -z "$MCP_SKILLS" ]]; then
    echo "(No MCP wrapper skills found)"
else
    echo "$MCP_SKILLS" | while read -r skill; do
        [[ -z "$skill" ]] && continue

        case "$skill" in
            mcp-memory)
                echo "REDUNDANT  $skill"
                echo "           Reason: Memory MCP deprecated, use vault files"
                echo "           Fix: trash ~/.claude/skills/$skill"
                echo ""
                ;;
            mcp-documents)
                echo "REDUNDANT  $skill"
                echo "           Reason: File operations = bash native"
                echo "           Fix: trash ~/.claude/skills/$skill"
                echo ""
                ;;
            mcp-web-research)
                echo "REDUNDANT  $skill"
                echo "           Reason: WebSearch is built-in to Claude Code"
                echo "           Fix: trash ~/.claude/skills/$skill"
                echo ""
                ;;
            mcp-browser)
                echo "REDUNDANT  $skill"
                echo "           Reason: Duplicates dev-browser skill"
                echo "           Fix: trash ~/.claude/skills/$skill"
                echo ""
                ;;
            mcp-maps)
                echo "REDUNDANT  $skill"
                echo "           Reason: Depends on disabled MCP_DOCKER"
                echo "           Fix: trash ~/.claude/skills/$skill"
                echo ""
                ;;
            mcp-youtube)
                echo "REDUNDANT  $skill"
                echo "           Reason: Depends on disabled MCP_DOCKER"
                echo "           Fix: trash ~/.claude/skills/$skill"
                echo ""
                ;;
            mcp-notes)
                echo "CONDITIONAL  $skill"
                echo "           Keep IF: obsidian-mcp enabled for graph viz"
                echo "           Remove IF: obsidian-mcp disabled"
                echo ""
                ;;
            mcp-ocr)
                echo "KEEP  $skill"
                echo "           Reason: google-vision-ocr API (genuine capability)"
                echo ""
                ;;
            mcp-messaging)
                echo "KEEP  $skill"
                echo "           Reason: whatsapp + google-chat protocols"
                echo ""
                ;;
            mcp-meetings)
                echo "KEEP  $skill"
                echo "           Reason: fireflies API (genuine capability)"
                echo ""
                ;;
            *)
                echo "UNKNOWN  $skill"
                echo "           Check: Is underlying MCP enabled?"
                echo "           Check: Is this wrapping bash-native operations?"
                echo ""
                ;;
        esac
    done
fi

echo "=============================================="
echo "  NON-MCP SKILLS (Quick Check)"
echo "=============================================="
echo ""

NON_MCP_COUNT=$(ls "$SKILLS_DIR" 2>/dev/null | grep -v "^mcp-" | wc -l | tr -d ' ')
echo "Non-MCP skills: $NON_MCP_COUNT"
echo ""
echo "These provide domain knowledge/workflows, not MCP wrappers."
echo "Generally KEEP unless they duplicate built-in capabilities."
echo ""

# List categories
echo "Skill categories:"
ls "$SKILLS_DIR" | grep -v "^mcp-" | cut -d'-' -f1 | sort | uniq -c | sort -rn | head -10

echo ""
echo "=============================================="
echo "  SKILL REDUNDANCY RULES"
echo "=============================================="
echo ""
echo "REMOVE if skill:"
echo "  - Wraps a disabled/denied MCP"
echo "  - Duplicates built-in tool (WebSearch, Read, Edit)"
echo "  - Only provides capability, not knowledge"
echo ""
echo "KEEP if skill:"
echo "  - Provides domain expertise"
echo "  - Provides workflow patterns"
echo "  - Wraps an enabled MCP with genuine capability"
echo ""
