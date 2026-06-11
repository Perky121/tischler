# MegaTischler Copilot — Electron App

Electron desktop aplikacija za Windows. Komunicira s Replit backendom.

GitHub repozitorij: `https://github.com/Perky121/tischler`

## Struktura

```
electron/
├── main.js               Electron main process
├── preload.js            IPC bridge (contextBridge)
├── package.json          Dependencije i build konfiguracija (uključuje electron-builder config)
└── renderer/
    ├── index.html        Entry point
    ├── App.jsx           React chat UI + Settings panel
    ├── styles.css        CSS stilovi (bez Tailwind)
    └── lib/              React 18 + ReactDOM + Babel — bundlani lokalno (bez CDN ovisnosti)
```

## Razvoj

```bash
cd electron
npm install
npm start          # pokretanje u dev modu
npm run dev        # pokretanje s DevTools otvorenim
```

## Build (Windows .exe)

Build se mora pokrenuti na Windows mašini ili kroz GitHub Actions Windows runner
jer `screenshot-desktop` i `sharp` zahtijevaju Windows native module.

```bash
cd electron
npm install
npm run build      # stvara dist/MegaTischler Copilot Setup.exe
```

### GitHub Actions (preporučeno)

Workflow: `.github/workflows/build-electron.yml` s `windows-2022` runnerom.

Pokretanje: GitHub → Actions → "Build Electron (Windows .exe)" → Run workflow

## Konfiguracija

Backend URL se konfigurira unutar aplikacije kroz Settings panel (ikona ⚙ u headeru).
Default URL: `https://27ff5e4d-ebe8-4d2e-a35c-5769cb600e92-00-2polfw5x5u74l.worf.replit.dev`

Postavke se čuvaju u `%APPDATA%\MegaTischler Copilot\settings.json`.

## Tipkovni prečaci

| Prečac | Akcija |
|--------|--------|
| F9 | Snimi ekran i priloži uz poruku |
| F8 | Glasovni unos (push-to-talk, treba OpenAI API key) |
| Enter | Pošalji poruku |
| Shift+Enter | Novi red |

## Implementirane faze

- **Faza 1** — Electron app, F9 screenshot, MegaTischler detektor, sugestivni gumbi
- **Faza 2 STT** — F8 glasovni unos (Web Audio API → OpenAI Whisper)
- **Faza 2 TTS** — glasovni odgovor (OpenAI TTS, 6 glasova, toggle u Settings)
- **Faza 3** — live mod (kod u main.js, isključen po defaultu, zahtijeva `/api/analyze-screen` endpoint)

## Napomene

- `screenshot-desktop` hvata cijeli ekran aktivnog monitora
- `sharp` kompresira sliku na max 1280px širinu, JPEG quality 85%
- MegaTischler detektor provjerava svakih 5s je li `MegaTischler.exe` pokrenut
- Prozor je uvijek vidljiv (alwaysOnTop), bez chrome (frameless)
- Pozicija prozora se pamti između sesija
- `renderer/lib/` sadrži React/Babel lokalno — app radi bez interneta pri pokretanju
- CSP uključuje `unsafe-eval` (potrebno za Babel JSX runtime transformaciju)
