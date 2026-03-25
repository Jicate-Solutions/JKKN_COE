# Bash-Audit Skill

Audit your Claude Code setup for bash-native redundancy following the substrate-first philosophy.

## What It Does

Identifies MCPs and skills that wrap operations bash can do natively:
- **MCP Audit**: Flags MCPs that wrap file operations, memory, or other bash-native substrates
- **Skills Audit**: Flags skills that depend on disabled MCPs or duplicate built-in tools
- **Fix Commands**: Generates copy-paste commands to remove redundancies

## Philosophy

> **Substrate-First Thinking**: Before asking "what tool does X?", ask "what is X made of?"

If the substrate is bash-native (files, folders, text, git), the abstraction is waste.
If the substrate requires external capability (browser state, OAuth, APIs), the abstraction is justified.

## Installation

### From Marketplace
```bash
# Download and extract to skills directory
unzip bash-audit.zip -d ~/.claude/skills/
```

### Manual
```bash
# Clone or copy the bash-audit folder to:
~/.claude/skills/bash-audit/
```

## Usage

### Via Claude
Just say:
- "audit my setup"
- "check for redundancy"
- "bash audit"
- "substrate audit"

### Via Command Line
```bash
# Full audit
~/.claude/skills/bash-audit/scripts/full-audit.sh

# MCP audit only
~/.claude/skills/bash-audit/scripts/audit-mcps.sh

# Skills audit only
~/.claude/skills/bash-audit/scripts/audit-skills.sh
```

## Output

The audit generates a report showing:
1. **REDUNDANT** items (remove these)
2. **KEEP** items (genuine capability)
3. **CONDITIONAL** items (depends on your needs)
4. **FIX COMMANDS** (copy-paste ready)

## Substrate Map

| Thing | Substrate | Bash Native? |
|-------|-----------|--------------|
| File operations | Files | YES |
| Memory/persistence | Files | YES |
| Git operations | Local repo | YES |
| Browser state | Running process | NO |
| OAuth APIs | Token exchange | NO |
| WhatsApp | Protocol | NO |

## Contributing

Found a new redundancy pattern? Submit a PR to add it to the audit scripts.

## License

MIT - Use freely, share widely.
