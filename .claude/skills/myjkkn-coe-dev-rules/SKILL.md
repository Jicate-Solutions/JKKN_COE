---
name: myjkkn-coe-dev-rules
description: Complete reference for MyJKKN API integration, institution filtering, role-based access control, CRUD operations, and field mappings between MyJKKN and COE local database. Use when implementing MyJKKN data fetching, institution-based filtering, handling super_admin vs normal user access, mapping field names between systems, building upload/download with institution context, or implementing dependent dropdown cascades. Triggers on 'MyJKKN mapping', 'field mapping', 'institution filter', 'super_admin access', 'global select', 'myjkkn_institution_ids', 'counselling_code', 'useInstitutionFilter', 'mustSelectInstitution', 'course_name vs course_title', 'program_id vs program_code'.
version: 2.0.0
---

# MyJKKN-COE Dev Rules

## Quick Reference

### Key Hooks

| Hook | Purpose | Location |
|------|---------|----------|
| `useInstitutionFilter` | Filter data by institution, UI visibility control | `hooks/use-institution-filter.ts` |
| `useInstitutionField` | Form field management (show/hide, auto-fill) | `hooks/use-institution-field.ts` |
| `useMyJKKNInstitutionFilter` | Fetch & filter MyJKKN data | `hooks/use-myjkkn-institution-filter.ts` |

### Key Properties

| Property | Description |
|----------|-------------|
| `mustSelectInstitution` | `true` when super_admin views "All Institutions" |
| `shouldFilter` | `true` when filtering should be applied |
| `myjkkn_institution_ids` | Array of MyJKKN UUIDs — use directly, no lookup needed |

### Critical Rules (Memorize These)

1. **Never two-step lookup** — use `myjkkn_institution_ids` array directly from COE institution
2. **Always filter client-side** — MyJKKN server-side `institution_id` filtering is unreliable
3. **Deduplicate by CODE** — programs by `program_id`, regulations by `regulation_code`
4. **Response shape** — always: `const data = response.data || response || []`
5. **`program_id` in MyJKKN is a CODE** ("BCA"), not a UUID — maps to COE's `program_code`
6. **`course_name` (MyJKKN) → `course_title` (COE)** — different field names
7. **`institution_id` (MyJKKN) → `institutions_id` (COE)** — COE uses plural
8. **Never change `institutions_id`** on UPDATE — preserve the original

### Common Mistakes

| Mistake | Correct Approach |
|---------|-----------------|
| Fetching before `isReady` | Always check `isReady` first |
| Not using `appendToUrl()` | Use it to add institution params to every API call |
| Blocking Add button when mustSelectInstitution | Add button always works — user selects institution in form |
| Hardcoding table `colSpan` | Adjust based on `mustSelectInstitution` |
| Trusting MyJKKN server-side filtering | Always filter client-side by `institution_id` |
| Deduplicating programs by `id` | Deduplicate by `program_code` (CODE field) |
| Not clearing dependent fields | Clear child fields when parent changes |
| Missing `myjkkn_institution_ids` in institution fetch | Always include this field |
| Using `counselling_code` to look up MyJKKN IDs | Use `myjkkn_institution_ids` directly |

---

## Reference Files

Load these when implementing the relevant area:

| When you need… | Read |
|----------------|------|
| Institution filter rules, UI patterns, CRUD access control, upload/download by role | [references/institution-filter.md](references/institution-filter.md) |
| MyJKKN data fetching, deduplication, dependent dropdowns, full page pattern | [references/myjkkn-integration.md](references/myjkkn-integration.md) |
| Field name mapping tables (course, program, institution, learner, semester, batch) | [references/field-mappings.md](references/field-mappings.md) |

### Source Files to Read When Debugging

| Purpose | File |
|---------|------|
| Institution context | `context/institution-context.tsx` |
| Filter hook | `hooks/use-institution-filter.ts` |
| Form field hook | `hooks/use-institution-field.ts` |
| MyJKKN filtering | `hooks/use-myjkkn-institution-filter.ts` |
| MyJKKN types | `types/myjkkn.ts` |
| Adapter service | `services/myjkkn/myjkkn-adapter-service.ts` |
| Institution API | `app/api/master/institutions/route.ts` |
| Example page | `app/(coe)/master/degrees/page.tsx` |
