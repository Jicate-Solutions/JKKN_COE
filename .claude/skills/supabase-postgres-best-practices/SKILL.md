---
name: supabase-postgres-best-practices
description: Postgres performance optimization and best practices from Supabase. Use when writing, reviewing, or optimizing Postgres queries, schema designs, database configurations, indexes, connection pooling, scaling, or Row-Level Security (RLS). Triggers on 'optimize query', 'slow query', 'index strategy', 'RLS policy', 'connection pooling', 'schema design', 'database performance'.
---

# Supabase Postgres Best Practices

Comprehensive performance optimization guide for Postgres, maintained by Supabase. Contains rules across 8 categories, prioritized by impact.

## Rule Categories by Priority

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | Query Performance | CRITICAL | `query-` |
| 2 | Connection Management | CRITICAL | `conn-` |
| 3 | Security & RLS | CRITICAL | `security-` |
| 4 | Schema Design | HIGH | `schema-` |
| 5 | Concurrency & Locking | MEDIUM-HIGH | `lock-` |
| 6 | Data Access Patterns | MEDIUM | `data-` |
| 7 | Monitoring & Diagnostics | LOW-MEDIUM | `monitor-` |
| 8 | Advanced Features | LOW | `advanced-` |

## How to Use

Read individual rule files in `rules/` for detailed explanations and SQL examples:

```
rules/query-missing-indexes.md
rules/schema-partial-indexes.md
rules/_sections.md
```

Each rule file contains:
- Why it matters
- Incorrect SQL example
- Correct SQL example
- Optional EXPLAIN output or metrics
- Supabase-specific notes
