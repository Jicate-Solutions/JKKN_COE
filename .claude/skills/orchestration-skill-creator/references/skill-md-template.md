# SKILL.md Template

Use this template to generate the orchestrator SKILL.md file.

```markdown
---
name: {SKILL_NAME}
description: {DESCRIPTION} Triggers on "{TRIGGER_PHRASES}".
---

# {SKILL_NAME_TITLE} Orchestrator

{PURPOSE_EXPANDED}

## When to Use

- {USE_CASE_1}
- {USE_CASE_2}
- {USE_CASE_3}

## Workflow Overview

```
User: "{EXAMPLE_TRIGGER}"
    │
    ▼
{PHASE_FLOW_DIAGRAM}
```

## On Invocation

### Step 1: Parse Input

Extract the main input from the user's request.

### Step 2: Create Session Directory

```
TOPIC_SLUG = lowercase, hyphenated version of input
TIMESTAMP = YYYY-MM-DD_HH-MM-SS
SESSION_DIR = {OUTPUT_DIR}/{TOPIC_SLUG}/{TIMESTAMP}/
```

Create this directory before spawning any agents.

### Step 3: Initialize Progress Tracking

Use TodoWrite to set up phases:
```
{TODO_LIST}
```

### Step 4: Execute Phases Sequentially

{PHASE_EXECUTION_INSTRUCTIONS}

### Step 5: Present Results

Display to user:
```
## {SKILL_NAME_TITLE} Complete

**Session:** {session_dir}

**Summary:**
{executive_summary from final phase}

**Reports Generated:**
{REPORT_LIST}

Open the final report to see the full output.
```

## Error Handling

### Phase Fails

If a subagent returns `status: "error"`:
1. Log error to `{session_dir}/errors.log`
2. Ask user: "Phase {N} encountered an issue. Retry or skip?"
3. If retry: Re-spawn the same agent
4. If skip: Mark as skipped, continue

### Session Interrupted

On resuming:
1. Check for existing `session-state.json`
2. Offer to resume from last completed phase

## File References

{FILE_REFERENCES}
```

## Placeholders to Fill

| Placeholder | Source |
|-------------|--------|
| `{SKILL_NAME}` | Q1 answer (hyphen-case) |
| `{SKILL_NAME_TITLE}` | Q1 answer (Title Case) |
| `{DESCRIPTION}` | Q2 answer + trigger info |
| `{TRIGGER_PHRASES}` | Q3 answer |
| `{PURPOSE_EXPANDED}` | Expand Q2 into 2-3 sentences |
| `{USE_CASE_1-3}` | Infer from Q2 |
| `{EXAMPLE_TRIGGER}` | First trigger phrase + example input |
| `{PHASE_FLOW_DIAGRAM}` | Generate from phase list |
| `{OUTPUT_DIR}` | Q7 answer |
| `{TODO_LIST}` | Generate from phases |
| `{PHASE_EXECUTION_INSTRUCTIONS}` | Generate for each phase |
| `{REPORT_LIST}` | Generate from phases |
| `{FILE_REFERENCES}` | List all agent files |
