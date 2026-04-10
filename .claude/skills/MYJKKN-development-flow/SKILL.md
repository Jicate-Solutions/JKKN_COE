---
name: myjkkn-development-flow
description: Development workflow guide for building modules in the MyJKKN platform. Use when creating new feature modules, understanding the MyJKKN codebase structure, or following the 5-layer architecture (Types → Services → Hooks → Components → Pages). Triggers on 'new MyJKKN module', 'MyJKKN development', 'MyJKKN codebase', 'create MyJKKN feature'.
---

# MyJKKN Development Flow

Guide for building new modules following the MyJKKN 5-layer architecture.

## Five Core Layers

1. **Types** — TypeScript definitions (`types/[module].ts`)
2. **Services** — Business logic (`lib/services/[module]/[entity]-service.ts`)
3. **Hooks** — State management (`hooks/[module]/use-[entity].ts`)
4. **Components** — UI building blocks (`app/(routes)/[module]/_components/*`)
5. **Pages** — Route handlers (`app/(routes)/[module]/page.tsx`)

## References

- [Codebase structure](references/CODEBASE_STRUCTURE.md) — Directory organization and technology stack
- [Module creation quick start](references/MODULE_CREATION_QUICK_START.md) — Step-by-step module creation guide
- [Implementation checklist](references/IMPLEMENTATION_CHECKLIST.md) — Complete pre/during/post implementation checklist

## Workflow

1. Define module scope, entities, and permissions
2. Plan database schema with FK constraints and RLS
3. Create types following interface + DTO + filter pattern
4. Implement services with Supabase queries
5. Build hooks wrapping services with React state
6. Create reusable components
7. Wire up pages with routing and navigation
8. Add permissions and sidebar entries
