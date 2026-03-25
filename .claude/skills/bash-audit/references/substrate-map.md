# Substrate Map

The definitive reference for what things are made of and whether bash can handle them.

## Core Principle

```
WRONG (Tool-First):              RIGHT (Substrate-First):
"I need to save memory"          "What IS memory?"
  → What tool does memory?         → Data to persist
  → Memory MCP                     → Can bash persist data?
  → Use MCP                        → YES: echo >> file
                                   → Use bash
```

## Full Substrate Map

### BASH NATIVE (Abstraction = Waste)

| Thing | Substrate | Bash Tools |
|-------|-----------|------------|
| File read | Files | `cat`, `head`, `tail` |
| File write | Files | `echo`, `cat >`, `tee` |
| File edit | Files | `sed`, `awk` |
| File search | Files | `grep`, `find`, `ls` |
| Directory ops | Folders | `mkdir`, `rm`, `mv`, `cp` |
| Memory/persistence | Files | `echo >>`, `cat` |
| Git operations | Local repo | `git` CLI |
| Text processing | Strings | `sed`, `awk`, `tr`, `cut` |
| JSON parsing | Text | `jq` |
| Counting | Numbers | `wc`, `expr` |
| Sorting | Text | `sort`, `uniq` |
| Date/time | System | `date` |
| Environment | Variables | `export`, `env` |
| Process control | OS | `ps`, `kill`, `jobs` |

### NOT BASH NATIVE (Abstraction = Justified)

| Thing | Substrate | Why Not Bash |
|-------|-----------|--------------|
| Browser state | Running process | Needs state management, DOM access |
| OAuth flow | Token exchange | Multi-step, secure token handling |
| WhatsApp | Protocol | End-to-end encryption, sessions |
| Google Chat | API | OAuth, rate limiting |
| OCR | Vision API | ML model access |
| Meeting transcripts | Fireflies API | OAuth, data storage |
| Library docs | Context7 index | Specialized search |

### CONDITIONAL (Depends on Use Case)

| Thing | When Bash | When MCP |
|-------|-----------|----------|
| Obsidian notes | Reading/writing markdown | Graph visualization |
| Web content | Simple curl/wget | Complex scraping |
| Screenshots | System tools | Browser automation |

## MCP Decision Tree

```
Is it made of files?
  → YES: Use bash

Is it made of text?
  → YES: Use bash

Is it made of git?
  → YES: Use bash

Does it need browser state?
  → YES: Use Playwright MCP

Does it need OAuth/API auth?
  → YES: Use appropriate MCP

Does it need protocol handling?
  → YES: Use appropriate MCP

None of the above?
  → Probably bash can handle it
```

## Common Mistakes

| Mistake | Why Wrong | Correct |
|---------|-----------|---------|
| MCP for file read | Files are bash native | `cat file` |
| MCP for memory | Files are bash native | Vault files |
| MCP for git | Git CLI is bash native | `git status` |
| MCP for JSON | jq handles it | `jq '.key' file` |
| MCP for search | grep/find handle it | `grep pattern file` |

## Adding New Substrates

When you encounter a new tool/MCP, ask:

1. What does this tool operate on?
2. Is that thing made of files/text/git?
3. If yes → bash can probably handle it
4. If no → what external capability is required?
5. Only if genuine external capability → keep the abstraction
