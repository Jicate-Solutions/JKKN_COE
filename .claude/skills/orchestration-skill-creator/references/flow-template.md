# Flow Documentation Template

Use this to generate `references/orchestrator-flow.md` for each skill.

```markdown
# Orchestrator Flow Reference

This document details how the {SKILL_NAME} orchestrator manages the multi-phase workflow.

## Phase Execution Order

```
{PHASE_ORDER_LIST}
```

## Data Flow Between Phases

```
User Input: "{EXAMPLE_INPUT}"
    │
    ▼
┌─────────────────────────────────────────┐
│  ORCHESTRATOR                           │
│  1. Create session_dir                  │
│  2. Initialize TodoWrite with {N} phases│
└─────────────────────────────────────────┘
{PHASE_FLOW_BOXES}
```

## Session Directory Structure

```
{OUTPUT_DIR}/
└── {input-slug}/
    └── {YYYY-MM-DD_HH-MM-SS}/
{REPORT_FILES_LIST}
        ├── session-state.json
        └── errors.log (if any)
```

## Error Recovery

### Phase Failure

If a phase returns `status: "error"`:
1. Log error to `{session_dir}/errors.log`
2. Prompt user: "Phase {N} failed. Retry or skip?"
3. If retry: Re-run same phase
4. If skip: Mark skipped, continue

### Session Resume

If session is interrupted:
1. Check for `session-state.json`
2. Read to find last completed phase
3. Offer to resume from Phase {N+1}

## Model Selection

| Phase | Model | Why |
|-------|-------|-----|
{MODEL_TABLE}
```

## Generation Instructions

### PHASE_ORDER_LIST
Generate like:
```
1. {Phase1Name}  ({model}) → {brief description}
2. {Phase2Name}  ({model}) → {brief description}
...
```

### PHASE_FLOW_BOXES
For each phase, generate progressive data flow:

```
┌─────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (Main Skill)                                  │
│  - Creates session directory                                │
│  - Manages TodoWrite state                                  │
│  - Passes context between subagents                         │
│  - Collects and validates reports                           │
└─────────────────────────────────────────────────────────────┘
    │
    │ spawn + {input, session_dir, SKILL_DIR}
    ▼
┌─────────────────────┐
│  Phase 1 Agent      │─→ Returns: report_path + phase1_summary
└─────────────────────┘
    │
    │ spawn + {inputs + phase1_summary (optional)}
    ▼
┌─────────────────────┐
│  Phase 2 Agent      │─→ Returns: report_path + phase2_summary
└─────────────────────┘
    │
    │ spawn + {inputs + phase2_report_path}
    ▼
┌─────────────────────┐
│  Phase 3 Agent      │─→ Returns: report_path + phase3_summary
└─────────────────────┘
    │
    │ spawn + {inputs + phase2_report_path + phase3_report_path + phase3_summary}
    ▼
┌─────────────────────┐
│  Phase 4 Agent      │─→ Returns: report_path + phase4_summary (with revised_action_items)
└─────────────────────┘
    │
    │ spawn + {inputs + phase4_report_path + revised_action_items}
    ▼
┌─────────────────────┐
│  Phase 5 Agent      │─→ Returns: report_path + final_summary
└─────────────────────┘
```

**Key pattern:** Later phases receive MORE context. Phase 4 might need both Phase 2 AND Phase 3 reports. Design your data flow to pass what each phase actually needs.

### REPORT_FILES_LIST
Generate like:
```
        ├── 01-{phase1-name}.md
        ├── 02-{phase2-name}.md
        ...
        └── 0N-{final-phase}.md
```

### MODEL_TABLE
Generate like:
```
| Phase 1: Discovery | Sonnet | Fast search |
| Phase 2: Analysis | Sonnet | Fast extraction |
| Phase 3: Synthesis | Opus | Needs reasoning |
```
