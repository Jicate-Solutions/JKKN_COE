# JSON Response Format Template

Use this to generate `references/json-response-format.md` for each skill.

```markdown
# JSON Response Format Reference

All phase agents must return a JSON response so the orchestrator can validate and extract data.

## Standard Response Structure

```json
{
  "status": "complete|partial|error",
  "report_path": "/absolute/path/to/report.md",
  "{phase_name}_summary": { ... }
}
```

## Phase-Specific Formats

{PHASE_JSON_SECTIONS}

## Error Responses

### Partial Completion

```json
{
  "status": "partial",
  "report_path": "{session_dir}/0N-phase.md",
  "{phase_name}_summary": {
    "completed": false,
    "note": "Description of limitation"
  }
}
```

### Complete Failure

```json
{
  "status": "error",
  "error": "Description of what went wrong",
  "suggestions": ["Fix 1", "Fix 2"]
}
```

## Validation Rules

The orchestrator validates each response:

1. **Must have `status`** - complete, partial, or error
2. **If complete/partial, must have `report_path`**
3. **Report file must exist at that path**
4. **Summary field should be present**
```

## Generating Phase JSON Sections

For each phase, generate a section like:

```markdown
### Phase {N}: {Name}

```json
{
  "status": "complete",
  "report_path": "{session_dir}/0{N}-{phase-name}.md",
  "{phase_name}_summary": {
    {METRICS_FOR_THIS_PHASE}
  }
}
```
```

## Metrics by Phase Type

### Discovery/Search Phase
```json
"{phase_name}_summary": {
  "items_found": 8,
  "item_types": {"type1": 3, "type2": 5},
  "quality_breakdown": {"high": 5, "medium": 2, "low": 1},
  "key_themes": ["theme1", "theme2"]
}
```

### Analysis/Extraction Phase
```json
"{phase_name}_summary": {
  "items_analyzed": 8,
  "items_failed": 0,
  "total_extracted": 24,
  "extraction_breakdown": {"category1": 10, "category2": 14}
}
```

### Synthesis/Reasoning Phase
```json
"{phase_name}_summary": {
  "themes_identified": 4,
  "consensus_items": 8,
  "debate_areas": 2,
  "gaps_found": 3,
  "confidence_level": "medium-high",
  "key_insight": "One sentence summary"
}
```

### Verification Phase
```json
"{phase_name}_summary": {
  "items_reviewed": 24,
  "verified": 10,
  "likely": 8,
  "uncertain": 4,
  "issues_found": 2,
  "overall_confidence": "medium-high"
},
"revised_action_items": ["action1", "action2"]
```

### Report Generation Phase
```json
"{phase_name}_summary": {
  "report_generated": true,
  "word_count": 2500,
  "sections": 8,
  "confidence_level": "medium-high"
},
"executive_summary": "2-3 sentence summary"
```

## Customization

Adjust the summary fields based on:
- What the phase actually produces
- What the orchestrator needs to track
- What's useful for progress reporting
