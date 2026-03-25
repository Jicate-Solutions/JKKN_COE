# Schema Export Queries

This directory contains SQL queries to export the complete database schema from Supabase.

## Quick Start

1. Open [Supabase SQL Editor](https://supabase.com/dashboard/project/qtsuqhduiuagjjtlalbh/sql)
2. Run `MASTER_SCHEMA_EXPORT.sql` queries
3. Copy results to update migration files

## Files

- **MASTER_SCHEMA_EXPORT.sql** - All queries in one file
- **fullSchema.sql** - Complete CREATE TABLE statements
- **columns.sql** - Column details with types and defaults
- **constraints.sql** - Primary keys, foreign keys, unique constraints
- **indexes.sql** - Index definitions
- **triggers.sql** - Trigger definitions
- **policies.sql** - Row Level Security policies

## Most Useful Query

The **fullSchema.sql** query generates ready-to-use CREATE TABLE statements for all tables.
This is the fastest way to update your migration files.

## Generated

2025-11-08T05:08:18.225Z
