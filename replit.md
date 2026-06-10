# MegaTischler Copilot

An AI assistant that helps furniture manufacturing professionals write parametric formulas in MegaTischler furniture CAD software. Responds in Croatian.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, set PORT=8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — set automatically via Replit AI Integrations

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- AI: Anthropic Claude (via Replit AI Integrations) — model `claude-opus-4-8`
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + TailwindCSS + shadcn/ui

## Where things live

- `lib/api-spec/openapi.yaml` — API contract (source of truth)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle ORM table definitions
- `lib/integrations-anthropic-ai/` — Anthropic client wrapper
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/parse_mac.py` — Python parser for .mac files
- `artifacts/api-server/data/knowledge_base.json` — extracted formula knowledge (generated)
- `artifacts/api-server/data/stipe_rules.txt` — user-defined custom rules
- `artifacts/api-server/uploads/` — temp upload dir (files deleted after parsing)
- `artifacts/app/src/` — React frontend

## Architecture decisions

- Chat endpoint streams via SSE (Server-Sent Events), not consumed by the generated React Query hook — uses raw fetch + ReadableStream on the client
- .mac files are uploaded via multipart/form-data to `/api/upload-mac`, parsed by `parse_mac.py` using Python's regex + latin-1 decoding, and merged into `knowledge_base.json`
- Files are parsed one-by-one with `--merge` flag to incrementally build knowledge base
- Encrypted .mac content (after MTSXENC marker) is skipped automatically
- Conversation history (last 10 messages) is sent with each chat request; Claude receives the full system prompt with injected knowledge base on every request
- Top 50 parameters and 30 most recent formulas are injected into the system prompt

## Product

- Left panel: Upload .mac files to build a formula knowledge base, view stats (formula count, parameter count), manage "Stipe's Rules" (custom instructions injected into AI system prompt)
- Right panel: Chat with Claude about MegaTischler formulas. Can attach screenshots of the parameter dialog — Claude reads parameter names and values from the image. Code blocks in responses have copy buttons. Responses stream in real-time.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The `/api/upload-mac` endpoint uses `multer` for multipart file handling — the OpenAPI spec omits the requestBody to avoid Orval `File`/`Blob` type errors in lib typecheck
- `.mac` files must be parsed with `latin-1` encoding (not UTF-8) and encrypted sections (after MTSXENC marker) must be skipped
- Claude model on AI Integrations: use `claude-opus-4-8` (has vision for screenshots); do not set temperature/top_p/top_k (deprecated on this model)
- `parse_mac.py` is called from Node via `child_process.spawn("python3", ...)` with `--merge` flag to append to existing knowledge base

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
