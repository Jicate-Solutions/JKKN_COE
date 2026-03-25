#!/bin/bash
# Full Bash-Aggressive Audit
# Combines MCP and Skills audit with actionable report

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$HOME/.claude/skills"
SETTINGS_FILE="$HOME/.claude/settings.local.json"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

echo "############################################################"
echo "#                                                          #"
echo "#         BASH-AGGRESSIVE AUDIT REPORT                     #"
echo "#         Substrate-First Analysis                         #"
echo "#                                                          #"
echo "############################################################"
echo ""
echo "Generated: $TIMESTAMP"
echo ""

# Run MCP audit
echo ""
"$SCRIPT_DIR/audit-mcps.sh"

echo ""
echo ""

# Run Skills audit
"$SCRIPT_DIR/audit-skills.sh"

echo ""
echo ""

# Run CLAUDE.md audit
"$SCRIPT_DIR/audit-claude-md.sh"

echo ""
echo "############################################################"
echo "#  SUMMARY & ACTION ITEMS                                  #"
echo "############################################################"
echo ""

# Count MCPs
if [[ -f "$SETTINGS_FILE" ]]; then
    ENABLED_COUNT=$(cat "$SETTINGS_FILE" 2>/dev/null | grep -A 100 '"enabledServers"' | grep -E '^\s+"[^"]+"' | grep -v "enabledServers" | wc -l | tr -d ' ')
    DENIED_COUNT=$(cat "$SETTINGS_FILE" 2>/dev/null | grep -A 50 '"deny"' | grep -E '^\s+"[^"]+"' | grep -v "deny" | wc -l | tr -d ' ')
else
    ENABLED_COUNT=0
    DENIED_COUNT=0
fi

# Count skills
SKILL_COUNT=$(ls "$SKILLS_DIR" 2>/dev/null | wc -l | tr -d ' ')
MCP_SKILL_COUNT=$(ls "$SKILLS_DIR" 2>/dev/null | grep "^mcp-" | wc -l | tr -d ' ')

echo "COUNTS:"
echo "  MCPs enabled:    $ENABLED_COUNT"
echo "  MCPs denied:     $DENIED_COUNT"
echo "  Skills total:    $SKILL_COUNT"
echo "  MCP-wrapper skills: $MCP_SKILL_COUNT"
echo ""

echo "############################################################"
echo "#  FIX COMMANDS (Copy-Paste Ready)                         #"
echo "############################################################"
echo ""

# Check for common redundant items
echo "# Remove redundant MCP-wrapper skills (if they exist):"
for skill in mcp-memory mcp-documents mcp-web-research mcp-browser mcp-maps mcp-youtube; do
    if [[ -d "$SKILLS_DIR/$skill" ]]; then
        echo "trash ~/.claude/skills/$skill"
    fi
done

echo ""
echo "# Add MCPs to deny list (edit ~/.claude/settings.local.json):"
echo "# Add these patterns to the \"deny\" array:"
echo "#   \"mcp__memory__*\""
echo "#   \"mcp__MCP_DOCKER__*\""
echo ""

echo "# Verify after fixes:"
echo "ls ~/.claude/skills/ | wc -l"
echo "cat ~/.claude/settings.local.json | grep -A 10 '\"deny\"'"
echo ""

echo "############################################################"
echo "#  SUBSTRATE-FIRST CHECKLIST                               #"
echo "############################################################"
echo ""
echo "[ ] No MCPs for file operations (use bash)"
echo "[ ] No MCPs for memory (use vault files)"
echo "[ ] No skills wrapping disabled MCPs"
echo "[ ] No duplicate functionality"
echo "[ ] Only MCPs for genuine external capabilities"
echo "[ ] Bash used for all verifiable operations"
echo ""
echo "############################################################"
echo "#  END OF AUDIT                                            #"
echo "############################################################"
