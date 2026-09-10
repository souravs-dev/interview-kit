# The AI Interview Prep Kit

Turns a job description + company URL into a personalised interview prep kit: a company brief,
role breakdown, categorised question bank, flashcards, and a day-by-day study schedule — researched,
generated, and checked for coverage through a multi-step pipeline, then editable in-app.

Built for the Trao Full-Stack Engineering Assessment.

> **Status: work in progress.** This README will be filled in per the submission requirements
> (tech stack justification, setup, architecture, retrieval approach, sequencing, state
> representation, schedule allocation, design tradeoffs, known limitations) as implementation
> proceeds. See `.claude/rfcs/RFC-001-ai-interview-prep-kit/` for the full design (rfc.md) and
> QA plan (qa-plan.md) driving this build.

## Tech stack

- Frontend: Next.js + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB
- Language: TypeScript
- LLM: Anthropic Claude (Sonnet)
- Public-discussion search: DuckDuckGo HTML scrape

## Repo layout

```
backend/    Express API + the pipeline/orchestration layer + the batch CLI
frontend/   Next.js app (Builder UI, Practice Mode)
shared/     The Appendix A/B schema (zod) — single source of truth for both
```

## Setup

```
pnpm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY, ANTHROPIC_MODEL, MONGODB_URI, SESSION_SECRET
```

## Batch entry point

```
npm run evaluate -- --input <cases.json> --output <kits.json>
```

(details to be filled in once `scripts/evaluate.ts` lands — milestone M6)
