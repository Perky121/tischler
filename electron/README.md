# MegaTischler Copilot — Electron App

Electron desktop aplikacija za Windows. Komunicira s Replit backendom.

GitHub repozitorij: `https://github.com/Perky121/tischler`

## Struktura

```
electron/
├── main.js               Electron main process
├── preload.js            IPC bridge (contextBridge)
├── package.json          Dependencije i build konfiguracija (electron-builder)
└── renderer/
    ├── index.html        Entry point
    ├── App.jsx           React chat UI + Settings panel (source)
    ├── App.js            Precompiliran output (esbuild, u commitu)
    ├── styles.css        CSS stilovi (bez Tailwind)
    └── lib/              React 18 + ReactDOM — bundlani lokalno (bez CDN ovisnosti)
```

## Razvoj

```bash
cd electron
npm install
npm start          # compile + pokretanje
npm run dev        # compile + pokretanje s DevTools
```

## Build (Windows .exe)

Build se mora pokrenuti na Windows mašini ili kroz GitHub Actions Windows runner
jer `screenshot-desktop` i `sharp` zahtijevaju Windows native module.

```bash
cd electron
npm install
npm run build      # stvara dist/MegaTischler-Copilot-Setup.exe
```

### GitHub Actions (preporučeno)

Workflow: `.github/workflows/build-electron.yml` s `windows-2022` runnerom.

Automatski se pokreće na svaki `push` na `main` kad se promijeni bilo što u `electron/`.
Download: GitHub → Releases → "Latest Build" → `MegaTischler-Copilot-Setup.exe`.

## Konfiguracija

Backend URL se konfigurira kroz Settings panel (⚙ u headeru).
Default URL: `https://27ff5e4d-ebe8-4d2e-a35c-5769cb600e92-00-2polfw5x5u74l.worf.replit.dev`

Postavke se čuvaju u `%APPDATA%\MegaTischler Copilot\settings.json`:
- `backendUrl` — URL Replit backenda
- `openaiKey` — OpenAI API ključ (STT + TTS)
- `dailyBudgetUsd` — dnevni budžet za Live mod (default 100 $)
- `autoLoadModule` — automatski učitaj modul kad Live ga prepozna (default uključeno)
- `liveRegion` — koordinate praćene regije ekrana
- `useRegionForF9` — koristi istu regiju i za F9 screenshot

## Tipkovni prečaci

| Prečac | Akcija |
|--------|--------|
| F9 | Snimi ekran i priloži uz poruku (blokiran dok Live radi) |
| F8 | Glasovni unos push-to-talk, OpenAI Whisper (blokiran dok Live radi) |
| Enter | Pošalji poruku |
| Shift+Enter | Novi red |

## Implementirane faze

- **Faza 1** — Electron app, F9 screenshot, MegaTischler detektor, sugestivni gumbi, višestruki razgovori
- **Faza 2 STT** — F8 glasovni unos (Web Audio API → OpenAI Whisper)
- **Faza 2 TTS** — glasovni odgovor (OpenAI TTS, 6 glasova, toggle u Settings)
- **Faza 3** — Live mod: pixelmatch diff loop, `/api/analyze-screen`, proaktivne poruke u chatu
- **Faza 4** — Live mod 2.0: region picker, budžet praćenje (USD), session context (moduleHint, parametri, formule), KB suggest, učenje iz screenshota
- **Faza 5** — Radni list (WorklistCard s Kopiraj), Live wizard (3 koraka + predlošci zadatka), auto-učitavanje modula, "Korak prema cilju" labele

## Arhitektura Live moda

```
Live off → [klik Live] → region picker → wizard (zadatak + predlošci) → [Pokreni Live]
             ↓
         running: pixelmatch diff loop (800ms) → diff > 10% → analyze-screen API (4s cooldown)
             ↓                                              ↓
         AI vidi moduleHint → auto reparse-one        AI vraća step → WorklistCard u chatu
             ↓
         [Pauziraj] → paused: chat slobodan → [Nastavi] → resume_mode analyze
             ↓
         [✕] → off
```

## Backend (Replit)

- Chat: `POST /api/chat` — SSE streaming, RAG 250 formula, top 80 parametara
- Live: `POST /api/analyze-screen` — JSON s `relevant`, `message`, `step`, `context`
- Baza znanja: `POST /api/knowledge/reparse-one` — parsira jednu .mac datoteku u KB
- Upload: `POST /api/upload-mac` — multer multipart upload

## Napomene

- `screenshot-desktop` hvata cijeli ekran (aktivni monitor)
- `sharp` kompresira na max 1280px širinu, JPEG quality 85% (za Live), PNG (za F9)
- MegaTischler detektor provjerava svakih 5s je li `MegaTischler.exe` pokrenut
- Prozor je uvijek vidljiv (`alwaysOnTop`), frameless, pozicija se pamti
- `renderer/App.jsx` mora biti kompajliran s `npm run compile` → generira `App.js`
- `renderer/lib/` sadrži React lokalno — app radi bez interneta pri pokretanju
