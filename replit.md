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
- `artifacts/api-server/src/lib/parse-mac.ts` — TypeScript parser for .mac files with MTSXENC decoder
- `artifacts/api-server/data/knowledge_base.json` — extracted formula knowledge (generated)
- `artifacts/api-server/data/stipe_rules.txt` — user-defined custom rules
- `artifacts/api-server/uploads/` — temp upload dir (files deleted after parsing)
- `artifacts/app/src/` — React frontend

## Architecture decisions

- Chat endpoint streams via SSE (Server-Sent Events), not consumed by the generated React Query hook — uses raw fetch + ReadableStream on the client
- .mac files are uploaded via multipart/form-data to `/api/upload-mac`, parsed by the TypeScript parser `parse-mac.ts` (MTSXENC-aware, latin-1 + XOR decode), and merged into `knowledge_base.json`
- Files are parsed one-by-one and deduplicated by formula string hash
- MTSXENC-encoded sections are decoded in the parser: `byte = (codepoint - 0x0E80) XOR 0x53`
- Knowledge base has 1228+ formulas across 9 modules (KUH_VISOKI, KUTNI, MIKROVALNA, NAPA, KUTNI_VANJSKI, VISECI, PECNICA, PERILICA, OTVORENI)
- Conversation history (last 10 messages) is sent with each chat request
- RAG: top 250 formulas selected by relevance score (moduleHint +20, screen params +5, question params +3), top 80 parameters injected into system prompt
- Chat responses use a structured worklist format: AI outputs intro + ```worklist JSON block with steps (title, where, formula, hint)
- Live analyze (`/api/analyze-screen`) returns `relevant`, `message`, `step` (one concrete action when task active), and `context` (moduleHint, parametersSeen, formulasSeen)
- Live mod state machine: off → running (pixelmatch diff loop 800ms, API cooldown 4s) → paused → resume

## Product

- Electron desktop app for Windows communicating with a Replit backend
- Chat with Claude about MegaTischler parametric formulas; responses include a structured worklist (numbered steps with copy buttons for formulas)
- F9 screenshot: attach current screen to chat message — Claude reads parameter names, values, and formulas from the dialog
- F8 voice input: push-to-talk via OpenAI Whisper (Croatian)
- Live mod: AI watches a selected screen region, detects changes, and sends task-oriented steps in the chat ("Korak prema cilju")
- Live wizard: 3-step setup (region → task/predlošci → start), pause/resume with chat available while paused
- Module bar: Live detects active .mac module and auto-loads its formulas into RAG knowledge base

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The `/api/upload-mac` endpoint uses `multer` for multipart file handling — the OpenAPI spec omits the requestBody to avoid Orval `File`/`Blob` type errors in lib typecheck
- `.mac` files must be parsed with `latin-1` encoding (not UTF-8); MTSXENC blocks use a shifted UTF-8 encoding where each byte is stored as `codepoint = 0x0E80 + (byte XOR 0x53)`
- Claude model on AI Integrations: use `claude-opus-4-8` (has vision for screenshots); do not set temperature/top_p/top_k (deprecated on this model)
- `parse_mac.py` (Python) is NOT used by the server — it exists as a legacy reference only; the active parser is `artifacts/api-server/src/lib/parse-mac.ts`
- Decimal separator in MegaTischler formulas is always a comma (0,5), never a dot — this is injected as a critical instruction in the system prompt
- Screenshot for analyze-screen is sent as raw base64 (no `data:image/...;base64,` prefix) — Anthropic API requirement

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
