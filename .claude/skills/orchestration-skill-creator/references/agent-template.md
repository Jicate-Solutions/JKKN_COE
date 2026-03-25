# Agent Template

Use this template to generate phase agent files.

**Important conventions:**
- File naming: `phase-{N}-{name}.md` (with hyphen between phase and number)
- Model options: `opus` (complex reasoning), `sonnet` (balanced), `haiku` (simple execution)
- Each agent gets fresh 200k context - don't worry about previous phases polluting

```markdown
---
name: {SKILL_NAME}-phase-{PHASE_NUM}
model: {MODEL}
tools:
{TOOLS_LIST}
---

# Phase {PHASE_NUM}: {PHASE_NAME_TITLE} Agent

You are executing Phase {PHASE_NUM} of the {SKILL_NAME} workflow. {PHASE_PURPOSE}

**Context:** You have fresh 200k tokens. Use them fully for this phase. Don't hold back.

## Inputs You Receive

- `input`: The main input/topic
- `session_dir`: Directory path to save your report
- `SKILL_DIR`: Path to skill folder (for accessing references/)
{PREV_PHASE_INPUTS}

## Before Starting

Read these reference docs using SKILL_DIR:
1. `${SKILL_DIR}/references/00-{general-patterns}.md` - Common patterns
2. `${SKILL_DIR}/references/0{PHASE_NUM}-{phase-patterns}.md` - Patterns for this phase
3. `${SKILL_DIR}/references/output-templates.md` - Your JSON output format

## Your Task

### 1. {TASK_STEP_1}

{TASK_1_DETAILS}

### 2. {TASK_STEP_2}

{TASK_2_DETAILS}

### 3. Save Your Report

Create file: `{session_dir}/{REPORT_FILENAME}`

Format:
```markdown
# Phase {PHASE_NUM}: {PHASE_NAME_TITLE} Report

**Input:** {input}
**Timestamp:** {current datetime}

## {SECTION_1_TITLE}

{SECTION_1_CONTENT_GUIDANCE}

## {SECTION_2_TITLE}

{SECTION_2_CONTENT_GUIDANCE}

## Notes for Next Phase

{NOTES_GUIDANCE}
```

### 4. Return JSON Response

After saving the report, return:

```json
{
  "status": "complete",
  "report_path": "{session_dir}/{REPORT_FILENAME}",
  "{PHASE_NAME}_summary": {
    {SUMMARY_FIELDS}
  }
}
```

## DO NOT

**CRITICAL: DO NOT use the TodoWrite tool.** The orchestrator manages all progress tracking. Just complete your analysis and return the JSON response.

- ❌ Use TodoWrite (orchestrator manages progress)
- ❌ Proceed to Phase {NEXT_PHASE_NUM} (that's a different agent)
- ❌ Try to coordinate with other phases
- ❌ Save state outside your report file
- {PHASE_SPECIFIC_DONT_1}
- {PHASE_SPECIFIC_DONT_2}

## If Something Goes Wrong

If you cannot complete the task:
```json
{
  "status": "partial",
  "report_path": "{session_dir}/{REPORT_FILENAME}",
  "{PHASE_NAME}_summary": {
    "completed": false,
    "note": "Description of what was incomplete"
  }
}
```

If task fails completely:
```json
{
  "status": "error",
  "error": "Description of what went wrong",
  "suggestions": ["Possible fix 1", "Possible fix 2"]
}
```
```

## Placeholders to Fill

| Placeholder | Source |
|-------------|--------|
| `{SKILL_NAME}` | From Q1 |
| `{PHASE_NUM}` | 1, 2, 3... |
| `{PHASE_NAME}` | From Q5 (lowercase-hyphen) |
| `{PHASE_NAME_TITLE}` | From Q5 (Title Case) |
| `{MODEL}` | From Q6 (sonnet or opus) |
| `{TOOLS_LIST}` | Inferred from phase type |
| `{PHASE_PURPOSE}` | From Q5 description |
| `{PREV_PHASE_INPUTS}` | Empty for phase 1, paths for others |
| `{TASK_STEP_1}` | Inferred from phase type |
| `{TASK_1_DETAILS}` | Specific instructions |
| `{REPORT_FILENAME}` | 0{N}-{phase-name}.md |
| `{SECTION_1_TITLE}` | Based on phase output |
| `{SUMMARY_FIELDS}` | Based on phase output |
| `{NEXT_PHASE_NUM}` | N+1 |
| `{PHASE_SPECIFIC_DONT}` | What this phase shouldn't do |

## Tool Assignment Reference

### Discovery/Search Phase
```yaml
tools:
  - WebSearch
  - WebFetch
  - Write
  - Read
```

### Analysis/Extraction Phase
```yaml
tools:
  - WebFetch
  - Write
  - Read
```

### Synthesis/Reasoning Phase
```yaml
tools:
  - Write
  - Read
```

### Verification Phase
```yaml
tools:
  - WebSearch
  - Write
  - Read
```

### Report Generation Phase
```yaml
tools:
  - Write
  - Read
```

## Previous Phase Input Patterns (Progressive Context)

Each phase receives MORE context as the workflow progresses:

### Phase 1 (no previous)
```
spawn + {input, session_dir, SKILL_DIR}
Returns: report_path + phase1_summary
```

### Phase 2
```
spawn + {input, session_dir, SKILL_DIR, phase1_summary (optional)}
Returns: report_path + phase2_summary
```

### Phase 3
```
spawn + {input, session_dir, SKILL_DIR, phase2_report_path}
Returns: report_path + phase3_summary
```

### Phase 4+
```
spawn + {input, session_dir, SKILL_DIR, phase2_report_path, phase3_report_path, phase3_summary}
Returns: report_path + phase4_summary (+ any revised_action_items)
```

### Final Phase
```
spawn + {input, session_dir, SKILL_DIR, phaseN-1_report_path, revised_action_items}
Returns: report_path + final_summary
```

**Key insight:** Later phases may need to read MULTIPLE previous reports, not just the immediate previous one. Design your data flow accordingly.
