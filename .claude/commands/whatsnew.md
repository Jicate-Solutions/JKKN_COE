# What's New in Claude Code

Check for updates and decode them automatically.

## Instructions

Execute these steps in order:

### 1. Check versions
```bash
echo "Current: $(claude --version)" && echo "Latest: $(npm view @anthropic-ai/claude-code version)"
```

### 2. Fetch changelog
Use WebFetch to get: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
Extract the 2 most recent version entries.

### 3. Invoke skill
```
skill: "release-decoder"
```

### 4. Process the changelog
Apply the full 8-step release-decoder pipeline:
- Categorize each change (bug fix, feature, settings, etc.)
- Translate to plain English
- Check user's CLAUDE.md to assess relevance
- Detect integrations that might be affected
- Generate actions (update CLAUDE.md, try feature, etc.)
- Save insights to Memory MCP

### 5. Offer update if newer version available
If current < latest, ask user if they want to run `claude update`

DO NOT just describe what you'll do. Actually execute each step and show results.
