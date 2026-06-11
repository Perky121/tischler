# MegaTischler Copilot — TODO

> Checklist za praćenje napretka. Svaki AI agent (Replit, Cursor) koji radi na ovom projektu
> treba pročitati ovaj dokument i PLAN.md prije nego počne raditi na bilo čemu.
> Označi stavke s [x] kad su gotove. Ne briši gotove stavke — služe kao historija.

---

## FAZA 0 — Baza znanja + browser testing tool
**Platforma:** Replit  
**Status:** ✅ Završeno

### Backend
- [x] Express server s relevantnim rutama
- [x] `POST /api/upload-mac` — multer upload, poziva parse_mac.py, ažurira knowledge_base.json
- [x] `POST /api/chat` — prima { message, screenshot_base64, history[] }, gradi prompt, poziva Claude API (SSE streaming)
- [x] `GET /api/knowledge` — vraća knowledge_base.json sadržaj (statistike: broj formula, parametara)
- [x] `GET /api/rules` + `POST /api/rules` — čita/sprema stipe_rules.txt sadržaj

### Parser
- [x] `parse_mac.py` — čita .mac binarno, dekodira latin-1
- [x] Detekcija i preskakanje MTSXENC enkriptiranih blokova
- [x] Ekstrakcija `<Formula>` tagova s nazivom source datoteke
- [x] Ekstrakcija `<ParFloat>`, `<ParEnum>`, `<ParString>`, `<ParInt>` s Name i Value
- [x] Deduplikacija formula
- [x] Output: `knowledge_base.json` s poljima formulas[], parameters[], syntax_rules[]

### System prompt
- [x] Bazni system prompt na hrvatskom (inline u route handleru)
- [x] Injekcija syntax_rules iz knowledge_base.json
- [x] Injekcija top 50 parametara iz knowledge_base.json
- [x] Injekcija 30 formula primjera iz knowledge_base.json
- [x] Injekcija stipe_rules.txt sadržaja (ako postoji)
- [x] Injekcija zadnjih 10 poruka iz history[]

### Browser UI (artifacts/app)
- [x] Dva stupca: lijevo knowledge panel, desno chat
- [x] Upload zona za .mac datoteke
- [x] Drag & drop za upload .mac datoteka
- [x] Prikaz statistike baze znanja (formule, parametri, broj datoteka)
- [x] Textarea za Stipina pravila s gumbom Spremi (s potvrdom "Spremljeno")
- [x] Chat: prikaz poruka, input, Send gumb (Pošalji)
- [x] "Priloži screenshot" gumb — file picker za sliku (Pogledaj ekran)
- [x] Thumbnail preview screenshota u input zoni i u korisničkoj poruci
- [x] Code blokovi u AI odgovorima imaju Copy gumb
- [x] Prikaz koji screenshot je korišten za koji AI odgovor (thumbnail unutar mjehurića)
- [x] Ispravak: screenshot se šalje kao čisti base64 (bez data URL prefixa) — Claude to zahtijeva

### Testiranje i fino podešavanje
- [x] Upload testnih .mac datoteka — 13 datoteka uploadano, pohranjeno u data/source_macs/
- [x] Provjera da knowledge_base.json ima > 100 formula — 432 formula ✓
- [ ] Test: screenshot dijaloga parametara → Claude ispravno čita parametre
- [ ] Test: "Zašto mi polica ne prati D?" → Claude daje točnu formulu
- [ ] Test: formula s greškom → Claude je debugira
- [x] Fino podešavanje system prompta — povećani limiti (80 param, 50 formula), reminder za decimalni zarez
- [ ] Upisati minimalno 10 Stipinih pravila u stipe_rules.txt kroz UI

### Nadogradnje parsera (dodano)
- [x] ZIP upload podrška — .zip s više .mac datoteka
- [x] XML entity dekodiranje formula (&lt; → <, &gt; → > itd.)
- [x] Ekstrakcija parametara iz [IME] referenci u formulama (155 parametara)
- [x] Čuvanje source .mac datoteka u data/source_macs/
- [x] POST /api/reparse — rebuild baze iz sačuvanih datoteka
- [x] Gumb "Ponovno parsiraj" u UI

### Kriterij završetka Faze 0
- [ ] Claude ispravno identificira otvoreni dijalog s parametrima sa screenshota
- [ ] Claude predlaže valjane MegaTischler formule (ispravan decimalni zarez, točke za hijerarhiju)
- [ ] Claude odgovara na hrvatskom, direktno i konkretno
- [x] Baza znanja ima > 200 formula iz .mac datoteka — 432 formula ✓

---

## FAZA 1 — Electron desktop aplikacija
**Platforma:** Cursor (SSH → Replit backend)  
**Status:** ✅ Kod završen — čeka test na Windowsu

### Setup
- [x] Kreirati `/electron` direktorij u projektu
- [x] `electron/package.json` s dependencijama: electron, electron-builder, screenshot-desktop, sharp
- [x] `electron/electron-builder.yml` — Windows NSIS x64 konfiguracija
- [x] `.github/workflows/build-electron.yml` — GitHub Actions Windows build workflow

### Electron main process (electron/main.js)
- [x] Kreiranje prozora: 380px širina, always-on-top, frameless
- [x] Prozor se pamti gdje je bio (position persistence u userData)
- [x] F9 globalni shortcut → screenshot aktivnog monitora
- [x] F8 globalni shortcut → toggle glasovnog snimanja
- [x] IPC kanali: screenshot, transcribe-audio, settings, window-controls, mt-status, toggle-recording

### Screenshot modul
- [x] `screenshot-desktop` paket — hvata aktivni monitor
- [x] `sharp` kompresija: max 1280px širina, JPEG 85%
- [x] Slanje base64 slike na Replit `/api/chat` endpoint

### MegaTischler detektor
- [x] Polling svakih 5s: `tasklist | findstr megatischler`
- [x] Status u headeru: "MT aktivan" (zelena točka) / "MT nije pokrenut" (žuta točka)
- [x] Upozorenje (žuti banner) ako MegaTischler nije aktivan kad user šalje upit

### Chat UI (electron/renderer/App.jsx — React)
- [x] Povijest poruka s mjehurićima (user desno, AI lijevo)
- [x] Thumbnail screenshota uz korisničku poruku
- [x] Code blokovi s Copy gumbom
- [x] Input polje + Send gumb + F9 gumb (📷 Snimi ekran) + F8 gumb (🎤 Glasovni unos)
- [x] MegaTischler status indikator u headeru
- [x] Settings ikona u headeru
- [x] Minimiziranje i zatvaranje prozora iz headera
- [x] Sugestivni gumbi ispod AI odgovora (Objasni sintaksu, Provjeri ekran, Alternativa)

### Settings panel
- [x] Replit backend URL (konfigurabilan, sprema se u userData)
- [x] OpenAI API Key polje (za Whisper + TTS)
- [x] Mikrofon odabir (lista dostupnih uređaja)
- [x] Prečaci (F8, F9 — prikazani)
- [x] Prikaz učitane baze znanja (X formula, Y parametara, Z datoteka)

### Build i packaging
- [x] electron-builder konfiguracija za Windows .exe (NSIS x64)
- [ ] Test instalacije na Windows računalu
- [ ] Auto-update priprema (opcija za kasniju fazu)

### Kriterij završetka Faze 1
- [ ] App se instalira na Windows bez grešaka
- [ ] Prozor stoji uz MegaTischler, uvijek vidljiv
- [ ] F9 uslika ekran i dobije odgovor za < 8 sekundi
- [ ] Formule u odgovorima kopiraju se jednim klikom
- [ ] App radi stabilno 30+ minuta bez pada

---

## FAZA 2 — Glasovni unos (push-to-talk)
**Platforma:** Cursor  
**Status:** ✅ Kod završen — čeka test na Windowsu

### STT (Speech-to-Text)
- [x] Web Audio API MediaRecorder — snimanje mikrofona (F8 toggle, bez native dependencija)
- [x] Vizualni indikator snimanja (crvena pulsating točka, timer, "Snimam..." banner)
- [x] Na zaustavljanje: WebM blob → base64 → IPC → backend → OpenAI Whisper API
- [x] Whisper: language="hr" (hrvatski)
- [x] Transkripcija se pojavljuje u input polju (korisnik može editirati prije slanja)
- [x] `POST /api/transcribe` endpoint na backendu (OpenAI SDK, toFile helper)

### TTS (Text-to-Speech) — opcionalno
- [x] OpenAI TTS endpoint `/api/tts` s glasovnim modelom (onyx, nova, shimmer, echo, alloy, fable)
- [x] Reprodukcija odgovora kroz Electron Audio API (base64 mp3)
- [x] Toggle u settingsima: TTS uključen/isključen + odabir glasa
- [x] Gumb za zaustavljanje reprodukcije (banner + "■ Stop")
- [x] Test gumb za glas u Settings panelu

### Dodaci u Settings (gotovi)
- [x] OPENAI_API_KEY polje (za Whisper + TTS)
- [x] Mikrofon odabir (lista dostupnih uređaja)
- [x] TTS toggle + odabir glasa
- [x] Test gumb za glas

### Kriterij završetka Faze 2
- [ ] Korisnik pritisne F8, govori pitanje, aplikacija odgovori za < 12 sekundi
- [ ] Transkripcija je točna na hrvatskom
- [ ] Ruke slobodne za rad u MegaTischleru

---

## FAZA 3 — Live mod (proaktivni asistent)
**Platforma:** Cursor  
**Status:** ✅ Kod završen — čeka test na Windowsu

### Screen monitoring
- [x] Background loop: screenshot svakih 1500ms (samo kad je live mod uključen)
- [x] `pixelmatch` npm — lokalna usporedba s prethodnim screenshotom
- [x] Threshold: > 15% razlike piksel → prosljeđuje Claudeu na analizu
- [x] Cooldown: min 8000ms između dva uzastopna proaktivna poziva
- [x] Loop se pauzira dok je obrada u tijeku (guard flag, ne gomila zahtjeve)

### Trigger logika
- [x] Poseban endpoint `POST /api/analyze-screen` (artifacts/api-server/src/routes/analyze-screen/)
- [x] System prompt za live mod: kraći, fokusiran na "što se promijenilo"
- [x] Claude vraća: { relevant: bool, message: string | null }
- [x] Ako relevant=false → ne prikazuje se ništa korisniku
- [x] Ako relevant=true → prikazuje se kao "proaktivna" poruka u chatu

### UI promjene za live mod
- [x] Gumb Live u headeru (toggle: "● LIVE" zeleno kad aktivan, "○ Live" sivo kad isključen)
- [x] Proaktivne poruke vizualno različite od normalnih (zelena lijeva bordura, ikona 👁, label "Copilot primjetio")
- [x] Dismiss gumb na proaktivnim porukama (× uklanja iz liste)
- [x] Prikaz API poziva i procijenjenog troška u Settings panelu

### Kontrola troškova
- [x] Dnevni limit API poziva (konfigurabilno u settingsima, default: 200)
- [x] Upozorenje na 80% limita (žuti banner u Settings)
- [x] Automatsko gašenje live moda kad se dostigne limit (loop se zaustavlja, liveEnabled=false sprema se na disk)
- [x] Prikaz procijenjenog troška u settingsima (broj poziva × ~$0.015)

### Kriterij završetka Faze 3
- [ ] App detektira otvaranje dijaloga parametara i proaktivno nudi savjet — ČEKA WINDOWS TEST
- [x] App ne šalje više od 1 poziva na 8 sekundi
- [x] Live mod se može uključiti/isključiti bez restarta
- [ ] Dnevni troškovi ostaju ispod 5€ pri normalnom korištenju — ČEKA WINDOWS TEST

---

## Backlog — ideje za kasniju fazu

- [ ] "Učitaj trenutni .mac" gumb — parsira datoteku na kojoj korisnik trenutno radi i dodaje je u kontekst sesije
- [ ] Povijest sesija — pretraživanje starih razgovora
- [ ] Biblioteka formula — korisnik može označiti korisne formule za brzi pristup
- [ ] Export: kopiranje cijelog razgovora u PDF/Word za dokumentaciju
- [ ] Multi-monitor podrška (odabir monitora na kojem je MegaTischler)
- [ ] Automatski update aplikacije
- [ ] Podrška za MegaTischler v2.x ako se sintaksa promijeni

---

## Poznate ograničenja i napomene

- `.mac` datoteke s `MTSXENC` blokom su enkriptirane (Tosenbergerove zaštićene konstrukcije) — parser ih preskače, to je očekivano ponašanje
- MegaTischler koristi **decimalni zarez** (0,5), ne točku — ovo je kritično, uvijek provjeri u odgovorima
- Electron app mora biti buildana za Windows x64 (korisnik nema ARM)
- Replit backend mora biti na `Always On` planu da ne bi spao u sleep dok korisnik radi
- OpenAI Whisper language="hr" daje dobre rezultate ali ponekad zamijeni stručne termine — korisnik može editirati transkripciju prije slanja
- Screenshot se šalje kao čisti base64 string (bez `data:image/...;base64,` prefixa) — Anthropic API to zahtijeva
- Endpoint `/api/upload-mac` koristi multer za multipart — OpenAPI spec nema requestBody za taj endpoint da bi se izbjeglo Orval `File`/`Blob` type greška u lib typecheck

---

## FAZA 4 — Live mod 2.0 (regija, budžet, kontekst, učenje)
**Platforma:** Cursor  
**Status:** ✅ Implementirano — čeka Windows test

### Faza A — Regija ekrana + brzina
- [x] Region picker overlay (`region-picker.html`, `region-picker.js`, `region-picker.css`)
- [x] `openRegionPicker()` — fullscreen transparent BrowserWindow za crtanje pravokutnika
- [x] `liveRegion` se sprema u settings.json `{x, y, width, height}`
- [x] `captureForLive()` cropa na `liveRegion` (sharp.extract) ako je postavljena
- [x] F9 screenshot poštuje `useRegionForF9` postavku
- [x] Live gumb → region picker → potvrdi → Live uključen; Esc = odustani
- [x] LIVE_INTERVAL_MS: 1500ms → **800ms**
- [x] LIVE_API_COOLDOWN_MS: 8000ms → **4000ms**
- [x] LIVE_DIFF_THRESHOLD: 0.15 → **0.10**

### Faza B — Budžet 100 USD/dan
- [x] `dailyBudgetUsd` (default 100), `dailySpentUsd`, `dailyCallCount` u settings.json
- [x] Dnevni reset: pri pokretanju app provjeri je li `budgetResetDate` danas
- [x] analyze-screen vraća `usage: { input_tokens, output_tokens, cost_usd }` iz Anthropic API
- [x] main.js akumulira `dailySpentUsd` iz stvarnih tokena (ne fiksna procjena)
- [x] Fallback estimate ako usage nije dostupan (1600 vision + 200 input + 80 output tokena)
- [x] Auto-stop Live kad `dailySpentUsd >= dailyBudgetUsd`
- [x] Settings UI: "12,40 $ / 100 $ danas", progress bar, upozorenje na 80%, reset gumb
- [x] `live-set-budget` IPC handler za promjenu budžeta

### Faza C — Kontekst sesije
- [x] `analyze-screen` vraća i `context: { dialogType, parametersSeen, formulasSeen, moduleHint, summary }` u istom pozivu (nema duplih API poziva)
- [x] `sessionContext` in-memory u main.js, šalje `live-context-updated` event rendereru
- [x] Renderer čuva `sessionContext` u state
- [x] `/api/chat` prima `session_context` u body i injektira ga u system prompt
- [x] Chat odgovori relevantniji bez ponovnog F9 dok je Live aktivan

### Faza D — Učenje u bazu znanja
- [x] `learned: { formulas, parameters, observations }` sekcija u knowledge_base.json
- [x] `POST /api/knowledge/learn` — merge s deduplikacijom (po formula stringu / param imenu / obs tekstu)
- [x] chat/index.ts uključuje `learned` zapise (do 20 formula, 20 param, 10 obs) u system prompt
- [x] Dedup hash za parametre → `live-kb-suggest` event kad se detektira novi dijalog
- [x] "📚 Spremi u bazu" gumb na proaktivnim porukama s kontekstom
- [x] kb-suggest tip poruke s potvrdom (nije automatski upis)

### Faza E — Veza s .mac datotekom
- [x] `moduleHint` iz `sessionContext.moduleHint` (Claude čita iz title bara)
- [x] Module hint banner u UI: "📄 Aktivan modul: KUTNI.mac"
- [x] Gumb "Učitaj u bazu" → `POST /api/knowledge/reparse-one` s filename
- [x] `reparse-one` endpoint: parser cropa samo tu datoteku (`--merge`)
- [x] Ako datoteka nije u source_macs/ → poruka korisniku da uploada

### Kriteriji završetka Faze 4
- [ ] Klik Live → odaberi MegaCAD regiju → ● LIVE — ČEKA WINDOWS TEST
- [ ] Otvori dijalog parametara → proaktivna poruka u ~5–7 s — ČEKA WINDOWS TEST
- [ ] Chat bez F9 koristi session kontekst — ČEKA WINDOWS TEST
- [ ] Klik "Spremi u bazu" → formula u learned sekciji — ČEKA WINDOWS TEST
- [ ] Settings: prikaz 100 $ budžeta, potrošnja raste s pozivima — ČEKA WINDOWS TEST
- [ ] Live se gasi kad se dostigne dnevni budžet — ČEKA WINDOWS TEST
