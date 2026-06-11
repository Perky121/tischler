# MegaTischler Copilot — Project Plan

## What is this?

A desktop AI assistant that sits alongside MegaTischler (Windows CAD/CAM software for custom furniture) and helps the user write parametric formulas in real time. The user is a furniture manufacturing expert who knows everything about construction but needs help with formula syntax.

The assistant:
- Watches the screen (on demand or live)
- Reads open parameter dialogs from screenshots
- Suggests exact formulas to type, explains where to type them
- Debugs formula errors
- Responds in Croatian

---

## Architecture

```
Replit (cloud backend)          Local Windows machine
─────────────────────           ──────────────────────
Express API (cloud)    ←───→   Electron app (Phase 1+)
Claude API calls                  - Always-on-top window
knowledge_base.json               - Screenshot capture
stipe_rules.txt                   - Chat UI
                                  - Voice input (Phase 2)
                                  - Live screen monitor (Phase 3)
```

**Phase 0 (Replit only):** Browser-based testing tool — no Electron yet.
**Phase 1+:** Electron app connects to Replit backend via HTTP.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express (Replit, `artifacts/api-server`) |
| AI | Anthropic Claude API — model `claude-opus-4-8` (vision) |
| MAC parser | Python (`artifacts/api-server/parse_mac.py`) |
| Desktop app | Electron (Phase 1+, `/electron` dir) |
| Frontend Phase 0 | React + Vite + TailwindCSS (`artifacts/app`) |
| Frontend Phase 1+ | React inside Electron |
| Voice | OpenAI Whisper (STT) + OpenAI TTS |
| Screen diff | pixelmatch npm package |

---

## Knowledge Base — How It Works

Every API call to Claude includes three layers of context:

1. **knowledge_base.json** — auto-generated from user's .mac files
   - 400+ real formulas extracted from MegaTischler project files
   - Parameter catalog (W, D, H, GLU, SUT, ZHS, ZHV, BU, HDT...)
   - MegaTischler formula syntax rules

2. **stipe_rules.txt** — manually written by the user
   - Furniture construction rules specific to this business
   - Standard dimensions, edge cases, material preferences
   - Things only the user knows — not in any documentation

3. **Conversation history** — last 10 messages in session
   - Maintains context within a working session

### MegaTischler Formula Syntax (critical — always inject into prompts)
```
[W]              → own parameter
[.W]             → parent parameter (1 level up)
[....W]          → 4 dots = root/position level
[...Child.Sub.W] → navigate into named child object
if(cond;true;false)
ifelse(c1;v1;c2;v2;default)
cos() sin() tan() neg()
0,5              → COMMA as decimal separator, never dot
```

---

## File Structure

```
/
├── PLAN.md                          ← this file
├── TODO.md                          ← progress checklist (read before working!)
├── artifacts/
│   ├── api-server/                  ← Express backend
│   │   ├── src/routes/              ← route handlers (chat, knowledge, rules, upload)
│   │   ├── parse_mac.py             ← MAC file parser
│   │   ├── data/
│   │   │   ├── knowledge_base.json  ← generated, do not edit manually
│   │   │   └── stipe_rules.txt      ← user's furniture rules, edit freely
│   │   └── uploads/                 ← temp dir, files deleted after parsing
│   └── app/                         ← React + Vite frontend (Phase 0 browser UI)
│       └── src/
│           ├── components/
│           │   ├── knowledge-panel.tsx
│           │   └── chat-panel.tsx
│           └── pages/home.tsx
├── lib/
│   ├── api-spec/openapi.yaml        ← API contract (source of truth)
│   ├── api-client-react/            ← generated React Query hooks
│   ├── api-zod/                     ← generated Zod validation schemas
│   ├── db/                          ← Drizzle ORM schemas
│   └── integrations-anthropic-ai/   ← Anthropic client wrapper
└── electron/                        ← Phase 1+, created later
    ├── main.js
    ├── preload.js
    └── renderer/
        └── App.jsx
```

---

## Phase Details

### Phase 0 — Knowledge Base + Browser Testing Tool
**Where:** Replit only  
**Goal:** Validate that the AI gives useful, accurate formula suggestions before building the desktop app.

Components:
- `parse_mac.py` — parses .mac files, outputs knowledge_base.json
- `POST /api/upload-mac` — upload endpoint for .mac files (multer, multipart/form-data)
- `POST /api/chat` — Claude API call with full context injection (SSE streaming)
- `GET /api/knowledge` — inspect current knowledge base + stats
- `GET /api/rules` + `POST /api/rules` — read/save stipe_rules.txt
- `artifacts/app` — React browser UI for testing chat + screenshot upload

Done when: Claude correctly identifies parameter dialogs from screenshots and suggests valid MegaTischler formulas.

---

### Phase 1 — Electron Desktop App (Chat + Screenshot on Demand)
**Where:** Cursor (SSH to Replit backend)  
**Goal:** Replace browser UI with a real desktop app that sits next to MegaTischler.

Components:
- Electron window: 380px wide, always-on-top, borderless
- F9 global shortcut → capture screenshot of active window → send to backend
- Chat UI in React (history, copy buttons for formulas, screenshot thumbnails)
- MegaTischler process detector (polls tasklist every 5s, shows status)
- Packaged as .exe installer (electron-builder)

Backend URL: the Replit deployed domain (from `$REPLIT_DOMAINS`)

Done when: User can use the app alongside MegaTischler without switching windows.

---

### Phase 2 — Voice Input (Push-to-Talk)
**Where:** Cursor  
**Goal:** Hands-free operation while working in MegaTischler.

Components:
- F8 global shortcut → hold to record microphone (node-record-lpcm16)
- On release: send WAV to OpenAI Whisper API → Croatian transcription
- Auto-trigger screenshot on voice release
- Optional TTS: Claude response read aloud (OpenAI TTS, Croatian)
- Toggle in settings: voice on/off, TTS on/off

Done when: User can ask a question by voice, hands stay on mouse.

---

### Phase 3 — Live Mode (Proactive Assistant)
**Where:** Cursor  
**Goal:** Assistant speaks up without being asked when it sees something relevant.

Components:
- Background screenshot loop every 1.5s (when live mode enabled)
- pixelmatch local diff — only triggers Claude when significant change detected
- Trigger conditions: new dialog opened, error message appeared
- Cooldown: minimum 8s between proactive calls
- Daily API call limit + cost display in settings
- Proactive message style: brief, dismissible notification in chat

Endpoint `POST /api/analyze-screen` — implementiran u `artifacts/api-server/src/routes/analyze-screen/`
- Kraći system prompt fokusiran na "što se promijenilo"
- Vraća `{ relevant: bool, message: string | null }`

Done when: App detects opening of a parameter dialog and suggests relevant formula without user asking.

---

## Environment Variables

Managed via Replit Secrets (never hardcode):

```
AI_INTEGRATIONS_ANTHROPIC_BASE_URL  → auto-set by Replit AI Integrations
AI_INTEGRATIONS_ANTHROPIC_API_KEY   → auto-set by Replit AI Integrations
DATABASE_URL                         → auto-set by Replit PostgreSQL
OPENAI_API_KEY                       → needed for Phase 2 (Whisper + TTS)
```

---

## Key Decisions & Rationale

**Why Electron, not a web extension?**
Electron can capture the screen, detect running processes, and use global keyboard shortcuts. Browser extensions cannot do any of these reliably.

**Why not auto-click/type in MegaTischler?**
Fragile and dangerous on production projects. One wrong edit costs more than automation saves. The user types, the assistant guides.

**Why Replit as backend, not fully local?**
Simplifies API key management and allows future multi-device use. All sensitive data (keys, rules) stays on Replit, not bundled in the .exe.

**Why push-to-talk, not continuous voice?**
Continuous listening is expensive and privacy-invasive. Push-to-talk matches the natural work rhythm — hands on mouse, press button, ask question, release.

**Why SSE streaming for chat?**
Lower perceived latency — user sees response appear word by word instead of waiting for the full answer. Critical for longer formula explanations.

**Why screenshot as pure base64 (not data URL)?**
Anthropic API requires raw base64 in `source.data`. The `data:image/...;base64,` prefix causes a 400 error. Strip it before sending.
