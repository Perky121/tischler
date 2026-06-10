# MegaTischler Copilot — Electron App

Electron desktop aplikacija za Windows. Komunicira s Replit backendom.

## Struktura

```
electron/
├── main.js               Electron main process
├── preload.js            IPC bridge (contextBridge)
├── package.json          Dependencije i build konfiguracija
├── electron-builder.yml  Windows NSIS x64 installer
└── renderer/
    ├── index.html        Entry point
    ├── App.jsx           React chat UI + Settings panel
    └── styles.css        CSS stilovi (bez Tailwind)
```

## Razvoj

```bash
cd electron
npm install
npm start          # pokretanje u dev modu
npm run dev        # pokretanje s DevTools
```

## Build (Windows .exe)

Build se mora pokrenuti na Windows mašini ili kroz GitHub Actions Windows runner
jer `screenshot-desktop` zahtijeva Windows native module.

```bash
cd electron
npm install
npm run build      # stvara dist/MegaTischler Copilot Setup.exe
```

### GitHub Actions (cross-compile)

Koristiti `.github/workflows/build-electron.yml` s `windows-latest` runnerom.

## Konfiguracija

Backend URL se konfigurira unutar aplikacije kroz Settings panel (ikona ⚙ u headeru).
Default URL: `https://27ff5e4d-ebe8-4d2e-a35c-5769cb600e92-00-2polfw5x5u74l.worf.replit.dev`

Postavke se čuvaju u `%APPDATA%/MegaTischler Copilot/settings.json`.

## Tipkovni prečaci

| Prečac | Akcija |
|--------|--------|
| F9 | Snimi ekran i priloži uz poruku |
| F8 | Push-to-talk (priprema za Fazu 2) |
| Enter | Pošalji poruku |
| Shift+Enter | Novi red |

## Napomene

- `screenshot-desktop` hvata cijeli ekran aktivnog monitora
- `sharp` kompresira sliku na max 1280px širinu, JPEG quality 85%
- MegaTischler detektor provjerava svakih 5s je li `MegaTischler.exe` pokrenut
- Prozor je uvijek vidljiv (alwaysOnTop), bez chrome (frameless)
- Pozicija prozora se pamti između sesija
