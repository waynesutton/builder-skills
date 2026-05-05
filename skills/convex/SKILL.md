---
name: convex
displayName: Convex Development
description: Umbrella skill for all Convex development patterns. Routes to specific skills like convex-functions, convex-realtime, convex-schema-validator, etc.
version: 1.37.0
author: Convex
tags: [convex, backend, database, realtime]
last-updated: 2026-05-04
---

# Convex Development Skills

This is an index skill for Convex development. Use specific skills for detailed guidance:

## Core Development

| Skill | Command | Use When |
|-------|---------|----------|
| Functions | `/convex-functions` | Writing queries, mutations, actions, and HTTP endpoints |
| Schema | `/convex-schema-validator` | Defining schemas with proper typing, indexes, and validators |
| Realtime | `/convex-realtime` | Building reactive subscriptions with optimistic updates and pagination |
| HTTP Actions | `/convex-http-actions` | Webhooks, external API integrations, and custom routes |

## Data & Storage

| Skill | Command | Use When |
|-------|---------|----------|
| File Storage | `/convex-file-storage` | File uploads, serving, storage, and metadata management |
| Migrations | `/convex-migrations` | Schema evolution with field additions, data backfills, and zero-downtime patterns |

## Advanced Patterns

| Skill | Command | Use When |
|-------|---------|----------|
| Cron Jobs | `/convex-cron-jobs` | Scheduled background tasks with interval and cron-based scheduling |
| Components | `/convex-component-authoring` | Creating self-contained, reusable Convex components with proper isolation |

## Security

| Skill | Command | Use When |
|-------|---------|----------|
| Security Check | `/convex-security-check` | Quick security audit checklist for authentication and function exposure |
| Security Audit | `/convex-security-audit` | Deep security review of authorization, data access, and rate limiting |

## Guidelines

| Skill | Command | Use When |
|-------|---------|----------|
| Best Practices | `/convex-best-practices` | General patterns for function organization, query optimization, and the Zen of Convex |

## Quick Start

For most tasks:
1. Start with `/convex-best-practices` for general patterns
2. Use `/convex-functions` for writing backend logic
3. Use `/convex-schema-validator` for data modeling
4. Use specific skills as needed for your use case

## Documentation

- Primary: https://docs.convex.dev
- LLM-optimized: https://docs.convex.dev/llms.txt
