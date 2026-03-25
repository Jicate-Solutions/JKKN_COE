# Common Orchestration Patterns

These are **examples**, not constraints. Any workflow can be orchestrated.

**Think of these as inspiration.** If your workflow doesn't match these exactly, describe what you need and the skill creator will build it.

---

## Part 1: Structural Archetypes (HOW Work Flows)

Before looking at domain patterns, understand HOW phases can connect:

### Archetype 1: Linear Chain
```
A → B → C → D
```
Each phase feeds the next. Most common, simplest.

**Use when:** Work naturally progresses through stages.
**Examples:** Research → Analyze → Write, Design → Build → Test

### Archetype 2: Convergent (Fan-In)
```
A ──┐
B ──┼→ D (Synthesize)
C ──┘
```
Multiple parallel streams combine into one synthesis phase.

**Use when:** Gathering from multiple sources before combining.
**Examples:** Research 3 competitors separately → Compare all

### Archetype 3: Divergent (Fan-Out)
```
    ┌→ B (Option 1)
A ──┼→ C (Option 2)
    └→ D (Option 3)
```
One input spawns multiple parallel explorations.

**Use when:** Exploring alternatives before choosing.
**Examples:** Brainstorm → Generate 3 approaches → Evaluate each

### Archetype 4: Iterative (Loop)
```
A → B → Check ──┐
      ↑         │ (not good enough)
      └─────────┘
          │ (good enough)
          ▼
          C
```
Repeat until quality threshold met.

**Use when:** Output needs refinement cycles.
**Examples:** Write → Review → Rewrite until quality

### Archetype 5: Conditional (Branch)
```
A → Check → if good: B
          → if bad:  C
```
Different paths based on results.

**Use when:** Next step depends on what you find.
**Examples:** Audit → if issues: Fix → Re-audit

### Archetype 6: Accumulative (Pool)
```
Pass 1: Add findings to pool
Pass 2: Add more to pool
Pass 3: Synthesize entire pool
```
Building knowledge over multiple passes.

**Use when:** Complex topic needs multiple angles.
**Examples:** Research tech, then market, then competitors, then synthesize

---

## Part 2: Domain Patterns (10 Patterns)

### Pattern 1: Research Pipeline

**Phases:** Discovery → Analysis → Synthesis → Report
**Use for:** Topic research, competitive analysis, market research
**Archetype:** Linear Chain

```
Phase 1: Discovery (sonnet)
  - WebSearch for sources
  - Collect URLs and metadata

Phase 2: Analysis (sonnet)
  - WebFetch each source
  - Extract key claims/data

Phase 3: Synthesis (opus)
  - Find patterns
  - Identify consensus/debate

Phase 4: Report (opus)
  - Generate final output
```

---

### Pattern 2: Content Pipeline

**Phases:** Outline → Draft → Edit → Polish → Publish
**Use for:** Blog posts, documentation, marketing content
**Archetype:** Linear Chain with optional Iteration on Edit

```
Phase 1: Outline (sonnet)
  - Structure the content
  - Define sections

Phase 2: Draft (opus)
  - Write first draft
  - Focus on completeness

Phase 3: Edit (opus)
  - Improve clarity
  - Fix structure issues

Phase 4: Polish (opus)
  - Final refinements
  - Tone consistency

Phase 5: Publish (sonnet)
  - Format for target platform
  - Generate metadata
```

---

### Pattern 3: Document Analysis

**Phases:** Extract → Categorize → Summarize → Insights
**Use for:** Report analysis, document review, compliance checking
**Archetype:** Linear Chain

```
Phase 1: Extract (sonnet)
  - Read document(s)
  - Pull out key elements

Phase 2: Categorize (sonnet)
  - Organize by type/topic
  - Tag and classify

Phase 3: Summarize (opus)
  - Condense each category
  - Highlight important items

Phase 4: Insights (opus)
  - Generate actionable findings
  - Recommendations
```

---

### Pattern 4: Verification Pipeline

**Phases:** Collect → Check → Verify → Report
**Use for:** Fact-checking, audit, quality assurance
**Archetype:** Linear Chain (often with Conditional branching)

```
Phase 1: Collect (sonnet)
  - Gather claims/items to verify
  - Note sources

Phase 2: Check (sonnet)
  - Cross-reference each item
  - Find supporting/contradicting evidence

Phase 3: Verify (opus)
  - Assess confidence levels
  - Identify issues

Phase 4: Report (opus)
  - Verification summary
  - Action items
```

---

### Pattern 5: Planning Pipeline

**Phases:** Research → Options → Evaluate → Plan
**Use for:** Decision making, project planning, strategy
**Archetype:** Linear Chain (can be Divergent for options)

```
Phase 1: Research (sonnet)
  - Gather context
  - Understand constraints

Phase 2: Options (opus)
  - Generate alternatives
  - Explore possibilities

Phase 3: Evaluate (opus)
  - Compare options
  - Assess tradeoffs

Phase 4: Plan (opus)
  - Recommend approach
  - Define next steps
```

---

### Pattern 6: App Building Pipeline

**Phases:** Architecture → Database → Backend → Frontend → Auth → QA → Deploy
**Use for:** Full-stack app generation, Next.js + Supabase projects
**Archetype:** Linear Chain with Iterative QA

```
Phase 1: Architecture (opus)
  - Design entities, relationships
  - Plan routes and components

Phase 2: Database (sonnet)
  - Create Supabase schema
  - Write migrations, types

Phase 3: Backend (sonnet)
  - Data Access Layer
  - API routes, Server actions

Phase 4: Frontend (sonnet)
  - Pages, layouts, components
  - Forms with shadcn/ui

Phase 5: Auth (sonnet)
  - Auth setup (Supabase)
  - Middleware, RLS policies

Phase 6: QA (sonnet) [ITERATIVE]
  - TypeScript check, Lint, Build
  - Fix errors, repeat until clean

Phase 7: Deploy (haiku)
  - Vercel deployment
  - Environment setup
```

**Reference:** See `fullstack-app-builder` skill for implementation

---

### Pattern 7: Meeting/Communication Pipeline

**Phases:** Transcribe → Extract → Summarize → Actions → Follow-up
**Use for:** Meeting analysis, call reviews, communication processing
**Archetype:** Linear Chain

```
Phase 1: Transcribe (sonnet)
  - Get transcript (Fireflies, manual, or audio)
  - Clean up text, identify speakers

Phase 2: Extract (sonnet)
  - Pull out decisions made
  - Identify action items mentioned
  - Note questions raised
  - Flag commitments/promises

Phase 3: Summarize (opus)
  - Create executive summary
  - Highlight key discussion points
  - Note areas of agreement/disagreement

Phase 4: Actions (opus)
  - Format action items with owners
  - Set priorities
  - Suggest deadlines based on context

Phase 5: Follow-up (sonnet)
  - Draft follow-up email
  - Create calendar items
  - Suggest check-in schedule
```

**Why orchestrate:** Extraction is mechanical (sonnet), but summarization and action prioritization need judgment (opus). Fresh context for follow-up drafting produces better emails.

---

### Pattern 8: Debugging Pipeline

**Phases:** Reproduce → Isolate → Diagnose → Fix → Verify
**Use for:** Bug fixing, troubleshooting, technical support
**Archetype:** Linear Chain with Iterative verify

```
Phase 1: Reproduce (sonnet)
  - Confirm the bug exists
  - Document exact steps to trigger
  - Capture error messages
  - Note environment details

Phase 2: Isolate (sonnet)
  - Narrow down to specific file/function
  - Find minimal reproduction case
  - Identify relevant code sections
  - Rule out red herrings

Phase 3: Diagnose (opus)
  - Understand root cause
  - Research similar issues (WebSearch)
  - Identify fix options
  - Assess impact of each option

Phase 4: Fix (sonnet)
  - Implement chosen solution
  - Handle edge cases
  - Add defensive code if needed

Phase 5: Verify (sonnet) [ITERATIVE]
  - Test the fix
  - Run related tests
  - If still broken → return to Diagnose
  - Check for regressions
```

**Why orchestrate:** Isolation needs systematic search (sonnet), diagnosis needs deep reasoning (opus), fixing is execution (sonnet). Each phase has different cognitive demands.

---

### Pattern 9: Translation/Localization Pipeline

**Phases:** Extract → Translate → Adapt → Review → Finalize
**Use for:** Multi-language content, localization, international docs
**Archetype:** Linear Chain (can be Convergent for multiple languages)

```
Phase 1: Extract (sonnet)
  - Identify text to translate
  - Note context for each segment
  - Flag culturally-sensitive content
  - Create translation memory reference

Phase 2: Translate (opus)
  - Translate maintaining meaning
  - Preserve tone and register
  - Handle idioms appropriately
  - Note uncertain translations

Phase 3: Adapt (opus)
  - Localize cultural references
  - Adjust examples for target market
  - Modify formatting conventions
  - Handle measurement/currency/date formats

Phase 4: Review (sonnet)
  - Check consistency
  - Verify terminology
  - Flag awkward phrasing
  - Compare against style guide

Phase 5: Finalize (sonnet)
  - Format for target platform
  - Generate bilingual reference
  - Create glossary updates
```

**Why orchestrate:** Translation needs deep language understanding (opus), but extraction and review are systematic (sonnet). Adaptation is creative judgment (opus).

---

### Pattern 10: Creative/Concept Pipeline

**Phases:** Brief → Research → Ideate → Develop → Refine
**Use for:** Creative concepts, campaign ideas, design direction (NOT visual execution)
**Archetype:** Linear Chain, often Divergent during Ideate

```
Phase 1: Brief (sonnet)
  - Understand objectives
  - Define constraints
  - Identify target audience
  - Note success criteria

Phase 2: Research (sonnet)
  - Study competitors/references
  - Gather inspiration
  - Identify trends
  - Note what works/doesn't

Phase 3: Ideate (opus)
  - Generate multiple concepts (divergent)
  - Explore different angles
  - Push beyond obvious ideas
  - Document each concept clearly

Phase 4: Develop (opus)
  - Expand top concepts
  - Add detail and rationale
  - Consider execution implications
  - Create concept presentations

Phase 5: Refine (opus)
  - Polish chosen direction
  - Address weaknesses
  - Prepare final recommendation
  - Create brief for execution team
```

**Why orchestrate:** Research is gathering (sonnet), but ideation and development need creative insight (opus). Each concept benefits from fresh context in Ideate phase.

**Note:** This pattern generates CONCEPTS and DIRECTION, not finished visual designs. Visual execution requires human designers or specialized tools.

---

## Part 3: Build Your Own Pattern

Don't see your workflow? Here's how to design it:

### Step 1: Identify the Stages

Ask:
- What's the FIRST thing that needs to happen?
- What naturally comes NEXT?
- When is it DONE?

### Step 2: Choose the Archetype

| If your workflow... | Use archetype... |
|---------------------|------------------|
| Progresses through stages | Linear Chain |
| Gathers from multiple sources | Convergent |
| Explores alternatives | Divergent |
| Needs refinement cycles | Iterative |
| Has different paths based on findings | Conditional |
| Builds knowledge over passes | Accumulative |

### Step 3: Assign Models

| Phase needs... | Model |
|----------------|-------|
| Complex reasoning, design | Opus |
| Speed, systematic work | Sonnet |
| Simple execution | Haiku |

### Step 4: Define Handoffs

For each phase:
- What does it RECEIVE?
- What does it PRODUCE?

---

## Model Selection Guide

**Principle:** Use the BEST model for each task. Cost is irrelevant with Claude Max.

| Task Type | Model | Why This Model |
|-----------|-------|----------------|
| Architecture/Design | **Opus** | Complex reasoning, strategic decisions |
| Analyze, reason | **Opus** | Deep insight required |
| Synthesize patterns | **Opus** | Connecting disparate ideas |
| Write final output | **Opus** | Quality and nuance matter |
| Creative ideation | **Opus** | Novel thinking, pushing boundaries |
| Search, fetch, extract | Sonnet | Speed advantage, depth not critical |
| Categorize, tag | Sonnet | Systematic work, clear criteria |
| Code generation | Sonnet | Reliable patterns, faster iteration |
| Verify, check | Sonnet | Systematic checking |
| Simple formatting | Sonnet or Haiku | Execution with clear instructions |
| Deploy, file ops | Haiku | Pure execution, no reasoning |

**Default to Opus** for any phase where quality matters. Only use Sonnet/Haiku where speed advantage outweighs depth.

---

## Naming Conventions

### Phase Names
Use action-oriented: `discovery` not `phase1`, `analyze` not `processing`

### Report Files
```
0{N}-{phase-name}.md
```

### Session Directories
```
{skill}/reports/{input-slug}/{YYYY-MM-DD_HH-MM-SS}/
```

---

## Reference Doc Linking

```
references/
├── 00-general-patterns.md      # All agents
├── 01-phase1-patterns.md       # Phase 1 only
├── 02-phase2-patterns.md       # Phase 2 only
└── output-templates.md         # JSON contracts
```

---

## Scripts for Heavy Lifting

| Task | Script vs Claude |
|------|------------------|
| Create folders | Script |
| Install dependencies | Script |
| Run build/test | Script |
| Parse output | Claude |
| Generate code | Claude |
| Deploy | Script |

---

*Remember: These 10 patterns are starting points. Describe ANY workflow and the skill creator will build it.*
