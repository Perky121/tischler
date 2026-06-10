# MegaTischler Copilot — TODO

> Checklist za praćenje napretka. Svaki AI agent (Replit, Cursor) koji radi na ovom projektu
> treba pročitati ovaj dokument i PLAN.md prije nego počne raditi na bilo čemu.
> Označi stavke s [x] kad su gotove. Ne briši gotove stavke — služe kao historija.

---

## FAZA 0 — Baza znanja + browser testing tool
**Platforma:** Replit  
**Status:** 🔄 U tijeku

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
- [ ] Upload testnih .mac datoteka (Gornji elementi/KUTNI.mac — nezaštićen)
- [ ] Provjera da knowledge_base.json ima > 100 formula
- [ ] Test: screenshot dijaloga parametara → Claude ispravno čita parametre
- [ ] Test: "Zašto mi polica ne prati D?" → Claude daje točnu formulu
- [ ] Test: formula s greškom → Claude je debugira
- [ ] Fino podešavanje system prompta dok odgovori nisu konkretni i točni
- [ ] Upisati minimalno 10 Stipinih pravila u stipe_rules.txt kroz UI

### Kriterij završetka Faze 0
- [ ] Claude ispravno identificira otvoreni dijalog s parametrima sa screenshota
- [ ] Claude predlaže valjane MegaTischler formule (ispravan decimalni zarez, točke za hijerarhiju)
- [ ] Claude odgovara na hrvatskom, direktno i konkretno
- [ ] Baza znanja ima > 200 formula iz .mac datoteka

---

## FAZA 1 — Electron desktop aplikacija
**Platforma:** Cursor (SSH → Replit backend)  
**Status:** ⏳ Čeka završetak Faze 0

### Setup
- [ ] Kreirati `/electron` direktorij u projektu
- [ ] `electron/package.json` s dependencijama: electron, electron-builder, screenshot-desktop
- [ ] Cursor SSH konekcija na Replit projekt konfigurirana

### Electron main process (electron/main.js)
- [ ] Kreiranje prozora: 380px širina, always-on-top, bez taskbar ikone opcija
- [ ] Prozor se pamti gdje je bio (position persistence)
- [ ] F9 globalni shortcut → screenshot aktivnog monitora
- [ ] F8 globalni shortcut → push-to-talk (priprema za Fazu 2)
- [ ] IPC kanali: screenshot, chat, voice

### Screenshot modul
- [ ] `screenshot-desktop` paket — hvata aktivni monitor
- [ ] Kompresija slike prije slanja (max 1280px širina, JPEG 85%)
- [ ] Slanje base64 slike na Replit `/api/chat` endpoint

### MegaTischler detektor
- [ ] Polling svakih 5s: `tasklist | findstr MegaTischler`
- [ ] Status u headeru: "MegaTischler aktivan" (zeleno) / "MegaTischler nije pokrenut" (žuto)
- [ ] Upozorenje ako MegaTischler nije aktivan kad user pokuša poslati upit

### Chat UI (electron/renderer/App.jsx — React)
- [ ] Povijest poruka s timestampom
- [ ] Korisničke poruke desno, AI odgovori lijevo
- [ ] Thumbnail screenshota uz poruku kad je priložen
- [ ] Code blokovi s Copy gumbom
- [ ] Sugestivni gumbi ispod AI odgovora ("Objasni sintaksu", "Provjeri opet ekran")
- [ ] Input polje + Send gumb + F9 gumb (Pogledaj ekran) + F8 gumb (Govori)
- [ ] Live status indikator (zelena točka = live mod aktivan)
- [ ] Settings ikona u headeru

### Settings panel
- [ ] Replit backend URL (konfigurabilan)
- [ ] Prečaci (F8, F9 — prikazani, ne mijenjaju se u Fazi 1)
- [ ] Prikaz učitane baze znanja (X formula, Y parametara)
- [ ] Gumb za otvaranje stipe_rules.txt u editoru

### Build i packaging
- [ ] electron-builder konfiguracija za Windows .exe
- [ ] Auto-update priprema (opcija za kasniju fazu)
- [ ] Test instalacije na Windows računalu

### Kriterij završetka Faze 1
- [ ] App se instalira na Windows bez grešaka
- [ ] Prozor stoji uz MegaTischler, uvijek vidljiv
- [ ] F9 uslika ekran i dobije odgovor za < 8 sekundi
- [ ] Formule u odgovorima kopiraju se jednim klikom
- [ ] App radi stabilno 30+ minuta bez pada

---

## FAZA 2 — Glasovni unos (push-to-talk)
**Platforma:** Cursor  
**Status:** ⏳ Čeka završetak Faze 1

### STT (Speech-to-Text)
- [ ] `node-record-lpcm16` — snimanje mikrofona dok je F8 pritisnut
- [ ] Vizualni indikator snimanja (crvena točka, animacija)
- [ ] Na otpuštanje F8: spremi WAV → pošalji OpenAI Whisper API
- [ ] Whisper: language="hr" (hrvatski)
- [ ] Transkripcija se pojavljuje u input polju (korisnik može editirati prije slanja)
- [ ] Auto-trigger screenshota zajedno s glasovnim pitanjem

### TTS (Text-to-Speech) — opcionalno
- [ ] OpenAI TTS endpoint s glasovnim modelom
- [ ] Reprodukcija odgovora kroz Electron audio
- [ ] Toggle u settingsima: TTS uključen/isključen
- [ ] Gumb za zaustavljanje reprodukcije

### Dodaci u Settings
- [ ] OPENAI_API_KEY polje (za Whisper + TTS)
- [ ] Mikrofon odabir (lista dostupnih uređaja)
- [ ] TTS toggle
- [ ] Test gumb za mikrofon

### Kriterij završetka Faze 2
- [ ] Korisnik drži F8, govori pitanje, aplikacija odgovori za < 12 sekundi
- [ ] Transkripcija je točna na hrvatskom
- [ ] Ruke slobodne za rad u MegaTischleru

---

## FAZA 3 — Live mod (proaktivni asistent)
**Platforma:** Cursor  
**Status:** ⏳ Čeka završetak Faze 2

### Screen monitoring
- [ ] Background loop: screenshot svakih 1500ms (samo kad je live mod uključen)
- [ ] `pixelmatch` npm — lokalna usporedba s prethodnim screenshotom
- [ ] Threshold: > 15% razlike piksel → prosljeđuje Claudeu na analizu
- [ ] Cooldown: min 8000ms između dva uzastopna proaktivna poziva
- [ ] Loop se pauzira dok je obrada u tijeku (ne gomila zahtjeve)

### Trigger logika (server.js)
- [ ] Poseban endpoint `POST /api/analyze-screen` za live analizu
- [ ] System prompt za live mod: kraći, fokusiran na "što se promijenilo"
- [ ] Claude vraća: { relevant: bool, message: string | null }
- [ ] Ako relevant=false → ne prikazuje se ništa korisniku
- [ ] Ako relevant=true → prikazuje se kao "proaktivna" poruka u chatu

### UI promjene za live mod
- [ ] Gumb Live u headeru (toggle, zelena točka kad aktivan)
- [ ] Proaktivne poruke vizualno različite od normalnih (lijeva bordura, drugačija boja)
- [ ] Dismiss gumb na proaktivnim porukama
- [ ] Prikaz API poziva: "23 poziva danas"

### Kontrola troškova
- [ ] Dnevni limit API poziva (konfigurabilno u settingsima, default: 200)
- [ ] Upozorenje na 80% limita
- [ ] Automatsko gašenje live moda kad se dostigne limit
- [ ] Prikaz procijenjenog troška u settingsima (broj poziva × ~$0.015)

### Kriterij završetka Faze 3
- [ ] App detektira otvaranje dijaloga parametara i proaktivno nudi savjet
- [ ] App ne šalje više od 1 poziva na 8 sekundi
- [ ] Live mod se može uključiti/isključiti bez restarta
- [ ] Dnevni troškovi ostaju ispod 5€ pri normalnom korištenju

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
