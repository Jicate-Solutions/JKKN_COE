#!/bin/bash
# Template for init-session.sh
# Replace {SKILL_NAME} with actual skill name

# Initialize a new {SKILL_NAME} session directory

# Usage: init-session.sh "input description"

INPUT="$1"
if [ -z "$INPUT" ]; then
    echo "Usage: init-session.sh \"input description\""
    exit 1
fi

# Create input slug (lowercase, hyphenated)
INPUT_SLUG=$(echo "$INPUT" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd '[:alnum:]-')

# Create timestamp
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")

# Base directory - UPDATE THIS PATH
SKILL_DIR="$HOME/.claude/skills/{SKILL_NAME}"
SESSION_DIR="$SKILL_DIR/reports/$INPUT_SLUG/$TIMESTAMP"

# Create session directory
mkdir -p "$SESSION_DIR"

# Copy session template
cp "$SKILL_DIR/assets/templates/session-init.json" "$SESSION_DIR/session-state.json"

# Update session state with actual values (requires jq)
if command -v jq &> /dev/null; then
    jq --arg input "$INPUT" \
       --arg slug "$INPUT_SLUG" \
       --arg started "$TIMESTAMP" \
       --arg dir "$SESSION_DIR" \
       '.session.input = $input | .session.input_slug = $slug | .session.started_at = $started | .session.session_dir = $dir' \
       "$SESSION_DIR/session-state.json" > "$SESSION_DIR/session-state.tmp" && \
       mv "$SESSION_DIR/session-state.tmp" "$SESSION_DIR/session-state.json"
fi

# Output the session directory path
echo "$SESSION_DIR"
