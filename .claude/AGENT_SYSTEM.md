# JKKN COE Claude Agent System

> A comprehensive multi-agent system for accelerating development of the JKKN COE (Controller of Examination) application.

## Overview

This agent system provides specialized AI assistants that work together to handle complex development tasks. The system follows an orchestrator pattern where a main agent coordinates specialized sub-agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    JKKN COE ORCHESTRATOR                             │
│  Coordinates tasks, delegates to sub-agents, integrates results     │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│   PLANNING    │     │ DEVELOPMENT   │     │   SUPPORT     │
│   AGENTS      │     │   AGENTS      │     │   AGENTS      │
├───────────────┤     ├───────────────┤     ├───────────────┤
│ task-planner  │     │ api-developer │     │ technical-    │
│ code-         │     │ ui-component- │     │   writer      │
│   architecture│     │   builder     │     │ automation-   │
│               │     │ code-reviewer │     │   engineer    │
│               │     │               │     │ database-     │
│               │     │               │     │   optimization│
└───────────────┘     └───────────────┘     └───────────────┘
```

## Agent Catalog

### Main Orchestrator

#### jkkn-coe-orchestrator
**File:** `.claude/agents/jkkn-coe-orchestrator.md`
**Model:** opus
**Color:** blue

Master coordinator that:
- Analyzes user requests
- Creates execution plans
- Delegates to specialized agents
- Integrates and validates results

**When to use:** Complex multi-step tasks requiring multiple specializations

---

### Planning Agents

#### task-planner
**File:** `.claude/agents/task-planner.md`
**Model:** sonnet
**Color:** yellow

Breaks down features into step-by-step plans with:
- Task dependencies
- Time estimates
- Risk assessment
- Resource allocation

**Triggers:** "plan feature", "break down", "create roadmap", "estimate effort"

---

#### code-architecture
**File:** `.claude/agents/code-architecture.md`
**Model:** sonnet
**Color:** purple

Designs system architecture including:
- Database schema
- API structure
- Component hierarchy
- Data flow

**Triggers:** "design architecture", "plan module", "design feature", "refactoring plan"

---

### Development Agents

#### api-developer
**File:** `.claude/agents/api-developer.md`
**Model:** sonnet
**Color:** green

Creates Next.js API routes with:
- CRUD operations
- Foreign key resolution
- Error handling
- Validation

**Triggers:** "create API", "build endpoint", "API route", "backend"

---

#### ui-component-builder
**File:** `.claude/agents/ui-component-builder.md`
**Model:** sonnet
**Color:** orange

Builds React components including:
- CRUD pages
- Forms with validation
- Data tables
- Shadcn UI integration

**Triggers:** "create component", "build page", "create form", "UI"

---

#### code-reviewer
**File:** `.claude/agents/code-reviewer.md`
**Model:** opus
**Color:** yellow

Reviews code for:
- Bugs and logic errors
- Security vulnerabilities
- Performance issues
- Best practices compliance

**Triggers:** After code changes, "review code", "check code", before commits

---

### Support Agents

#### technical-writer
**File:** `.claude/agents/technical-writer.md`
**Model:** sonnet
**Color:** pink

Creates documentation:
- README files
- API documentation
- User guides
- Architecture docs

**Triggers:** "document", "create README", "write docs", "API docs"

---

#### automation-engineer
**File:** `.claude/agents/automation-engineer.md`
**Model:** sonnet
**Color:** cyan

Creates automation including:
- Shell scripts
- CI/CD pipelines
- Database migrations
- Testing automation

**Triggers:** "create script", "automate", "CI/CD", "pipeline"

---

#### database-optimization
**File:** `.claude/agents/database-optimization.md`
**Model:** sonnet
**Color:** (default)

Optimizes database performance:
- Query tuning
- Index analysis
- Execution plans
- Schema optimization

**Triggers:** "slow query", "optimize database", "index", "performance"

---

## Existing Skills (Complementary)

The agent system works alongside these existing skills:

| Skill | Purpose | File |
|-------|---------|------|
| `entity-crud-page-builder` | Standardized CRUD pages | `.claude/skills/entity-crud-page-builder/SKILL.md` |
| `supabase-expert` | Database operations | `.claude/skills/supabase-expert/SKILL.md` |
| `nextjs-module-builder` | Module creation workflow | `.claude/skills/nextjs-module-builder/SKILL.md` |
| `data-validation` | Validation patterns | `.claude/skills/data-validation/SKILL.md` |
| `excel-import-export` | Import/export functionality | `.claude/skills/excel-import-export/SKILL.md` |
| `gpa-cgpa-calculator` | Grading calculations | `.claude/skills/gpa-cgpa-calculator/SKILL.md` |
| `brand-styling` | UI styling standards | `.claude/skills/brand-styling/SKILL.md` |
| `project-structure` | Project organization | `.claude/skills/project-structure/SKILL.md` |

## Usage Guide

### Invoking the Orchestrator

For complex, multi-step tasks:

```
@jkkn-coe-orchestrator Create a new exam registration module with:
- Student registration for exams
- Fee payment tracking
- Hall ticket generation
```

### Invoking Individual Agents

For focused tasks:

```
# Architecture planning
@code-architecture Design the database schema for exam results

# API development
@api-developer Create CRUD endpoints for exam sessions

# UI building
@ui-component-builder Build a form for student exam registration

# Code review
@code-reviewer Review the changes I made to the grading module

# Documentation
@technical-writer Create API documentation for the results endpoints

# Automation
@automation-engineer Create a script to seed test data
```

### Task Tool Invocation

Agents can be invoked via the Task tool:

```typescript
Task({
  subagent_type: "code-architecture",
  prompt: "Design architecture for exam registration module...",
  description: "Architect exam registration"
})
```

## Workflow Examples

### Example 1: New Feature Development

```
User: Create a hall ticket generation feature

Orchestrator Actions:
1. → task-planner: Break down requirements
2. → code-architecture: Design data model and API
3. → api-developer: Implement endpoints (parallel)
   → ui-component-builder: Build UI components (parallel)
4. → code-reviewer: Review all changes
5. → technical-writer: Update documentation
```

### Example 2: Bug Fix

```
User: Fix the GPA calculation error

Orchestrator Actions:
1. Analyze the bug directly
2. → code-reviewer: Identify root cause
3. Apply fix
4. → code-reviewer: Verify fix
```

### Example 3: Performance Optimization

```
User: The results page is slow

Orchestrator Actions:
1. → database-optimization: Analyze queries
2. → code-architecture: Review component structure
3. Apply optimizations
4. → code-reviewer: Verify improvements
```

## Master Prompt Reference

When using the orchestrator, you can provide context using this format:

```markdown
## Task: [Clear task description]

### Requirements
- [Specific requirement 1]
- [Specific requirement 2]

### Constraints
- [Any limitations or preferences]

### Context
- [Relevant existing code or patterns]
- [Related modules or features]

### Expected Output
- [What you expect to receive]
```

## Agent Communication Protocol

Agents communicate through structured formats:

### Request Format (to sub-agent)
```
Task: [Specific task description]
Context: [Relevant background]
Constraints: [Any limitations]
Expected Output: [Format and content expected]
```

### Response Format (from sub-agent)
```
## [Task Name] Complete

### Summary
[Brief overview of what was done]

### Output
[Actual deliverables]

### Files Created/Modified
- [File list with descriptions]

### Notes
[Any important observations or recommendations]
```

## Configuration

### Agent Settings

Agents are configured in their markdown files with frontmatter:

```yaml
---
name: agent-name
description: Agent description for when to use
model: sonnet | opus | haiku
color: blue | green | purple | etc.
tools: Read, Write, Edit, Glob, Grep, Bash, Task, etc.
---
```

### Tool Access

| Agent | Read | Write | Edit | Bash | Task | Glob | Grep |
|-------|------|-------|------|------|------|------|------|
| orchestrator | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| code-architecture | ✓ | - | - | - | ✓ | ✓ | ✓ |
| api-developer | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ |
| ui-component-builder | ✓ | ✓ | ✓ | - | - | ✓ | ✓ |
| code-reviewer | ✓ | - | - | - | - | ✓ | ✓ |
| task-planner | ✓ | - | - | - | ✓ | ✓ | ✓ |
| technical-writer | ✓ | ✓ | ✓ | - | - | ✓ | ✓ |
| automation-engineer | ✓ | ✓ | ✓ | ✓ | - | ✓ | ✓ |

## Best Practices

### 1. Start with Planning
For complex features, always start with `task-planner` or `code-architecture` to ensure a solid foundation.

### 2. Review All Changes
Always invoke `code-reviewer` after significant code changes, especially before commits.

### 3. Document as You Go
Use `technical-writer` to keep documentation in sync with code changes.

### 4. Use Parallel Execution
When tasks are independent, invoke multiple agents in parallel for efficiency.

### 5. Provide Context
Give agents sufficient context about existing patterns and requirements.

### 6. Iterate
Complex features may require multiple rounds of agent collaboration.

## Troubleshooting

### Agent Not Finding Patterns
Ensure the agent has access to reference files through Glob/Grep tools.

### Inconsistent Output
Provide more specific requirements and reference existing implementations.

### Performance Issues
Use `haiku` model for simple tasks, `opus` for complex reasoning.

## Contributing

To add or modify agents:

1. Create/edit agent file in `.claude/agents/`
2. Follow the frontmatter format
3. Include clear instructions and examples
4. Update this AGENT_SYSTEM.md
5. Test with sample tasks

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-12 | Initial agent system release |

---

**Maintained by:** JKKN COE Development Team
**Last Updated:** December 2024
