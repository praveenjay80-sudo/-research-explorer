# Research Explorer — Claude Code Instructions

## What this is
An academic research tool with two main features:
1. **Paper Search** — search millions of papers/books via Semantic Scholar & OpenAlex, with interactive concept maps
2. **Stanford Top 2% Rankings** — import and browse the official Stanford/Elsevier most-cited scientists dataset, with AI-generated scientist profiles

Live URL: https://research-explorer-production.up.railway.app

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind CSS · Railway deployment (Docker standalone)

## Key files

### Rankings feature
- `app/rankings/import/page.tsx` — main import page (file upload, multi-year tabs, field/subfield filter, scientist cards)
- `app/api/rankings/explain/route.ts` — POST: looks up scientist on OpenAlex, generates structured 5-section profile via Claude Sonnet
- `app/api/rankings/bio/route.ts` — POST: shorter bio from full OpenAlex profile (used on profile detail pages)
- `app/rankings/[authorId]/page.tsx` — individual scientist profile page (OpenAlex authors)
- `lib/rankings.ts` — OpenAlex data fetching helpers (fields, subfields, ranked scientists, profiles, works)
- `types/rankings.ts` — all TypeScript types for rankings
- `components/rankings/ScientistCard.tsx` — ranked scientist card component

### Paper search
- `app/api/search/route.ts` — main search endpoint (Semantic Scholar + OpenAlex)
- `components/SearchBar.tsx`, `components/PaperList.tsx`, `components/ConceptMap.tsx`

### Infrastructure
- `app/rankings/page.tsx` — redirects to /rankings/import
- `data/stanford/` — gitignored; drop YYYY.json files here for official Stanford data
- `data/snapshots/` — gitignored; OpenAlex snapshots saved by users

## Stanford dataset format (Table 1 — individual scientists)
Key columns auto-detected across all years:
- `authfull` — full name (Lastname, Firstname format)
- `inst_name` — institution
- `cntry` — ISO 2-letter country code
- `sm-field` / `sm-subfield-1` — Stanford Science-Metrix field/subfield (22 fields, 174 subfields)
- `c` — total career citations
- `h23` (or h22, h21…) — h-index
- `np6023` (or np variants) — total papers
- `cns23` (or cns variants) — c-score (composite ranking metric)
- `firstyr` / `lastyr` — career span
- `self_share` — self-citation fraction
- `rank_ns` — rank by normalised score within subfield

Table 2 (field statistics) also supported: Domain, Field, #Auth, Cites@percentile, c@percentile columns.

## AI explain endpoint notes
`/api/rankings/explain` enriches profiles by searching OpenAlex for the scientist.
Match validation: name token overlap ≥ 0.4 AND citation ratio ≥ 0.25 (to avoid wrong-person matches).
Uses `claude-sonnet-4-6`, max_tokens 1200.
Returns structured 5-section text: Who / Problems / Most Influential Work / Key Contributions / Why It Matters.
Requires `ANTHROPIC_API_KEY` env var (set in Railway Variables).

## Deployment
- Railway project: research-explorer
- Service: research-explorer
- Deploy: `railway up --service "research-explorer" --detach`
- Always push to git first: `git push origin master`

## Env vars needed in Railway
- `ANTHROPIC_API_KEY` — required for AI explain and bio features

## Important patterns
- OpenAlex filter URLs must NOT be URLSearchParams-encoded (colons would get encoded breaking the API).
  Build filter as raw string: `\`${BASE}/works?filter=${filter}&${rest.toString()}\``
- Next.js 15: dynamic route params must be awaited: `const { authorId } = await params`
- xlsx library used client-side (dynamic import) to parse Excel files in the browser
- `dense: true` mode required when reading xlsx to get raw cell objects (avoids empty-string issue with defval)
