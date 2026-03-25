# Assets Directory

This directory is reserved for files that are used in the output of the entity CRUD page builder skill but are not meant to be loaded into context.

## Purpose

Assets are files that will be:
- Copied or modified in the final output
- Used as templates for generated code
- Referenced in the generated pages

## Potential Assets

Future assets that could be added here:

1. **entity-page-template.tsx**: Full template file for a new entity page
2. **api-route-template.ts**: Template for standardized API routes
3. **test-template.spec.ts**: Template for entity page tests
4. **type-definitions.ts**: Reusable TypeScript type definitions
5. **icons/**: Icon files for different entity types

## Usage

Assets should be:
- Well-organized with clear naming conventions
- Documented with usage instructions
- Version-controlled with the skill
- Ready to use without modification when possible

## Note

Currently, this skill does not include asset files. The implementation patterns are fully documented in SKILL.md and reference files, which is sufficient for Claude to generate complete entity pages from scratch. Assets will be added if repetitive boilerplate becomes excessive.
