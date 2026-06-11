# MegaTischler Copilot — Instalacija na Windows

> **Ovaj vodič je napisan za potpunog početnika.**
> Slijedi korake redom. Objašnjenja što napraviti ako nešto ne radi su na kraju.

GitHub repozitorij: **https://github.com/Perky121/tischler**

---

## Što instaliraš?

**MegaTischler Copilot** je mali prozor koji stoji uz tvoj MegaTischler program. Postaviš mu pitanje (tekst ili glasom), on fotografira tvoj ekran i daje ti odgovor o formulama i parametrima.

Aplikacija se sastoji od dva dijela:
- **Desktop app** (Windows .exe) — instaliraš ga na svom računalu
- **Backend** (cloud) — već radi na internetu, ne trebaš ništa posebno raditi

```
Tvoje računalo                        Internet (Replit cloud)
┌────────────────────┐                ┌──────────────────────┐
│  MegaTischler      │                │                      │
│  Copilot (.exe)    │ ←── chat ────→ │  AI backend          │
│                    │                │  (uvijek pokrenut)   │
└────────────────────┘                └──────────────────────┘
```

---

## Što trebaš

- [ ] Računalo s **Windows 10 ili Windows 11** (64-bit)
- [ ] Pristup internetu
- [ ] GitHub račun `Perky121` (već kreiran)
- [ ] Oko **30 minuta** za instalaciju

---

## KORAK 1 — Pokreni automatski build (.exe)

> GitHub Actions automatski gradi .exe datoteku na Windows serveru. Traje ~10-15 minuta.

1. Otvori: **https://github.com/Perky121/tischler/actions**

2. U lijevom stupcu klikni **"Build Electron (Windows .exe)"**

3. Desno se pojavi gumb **"Run workflow"** — klikni ga

4. U malom prozoru koji se otvori klikni zeleni gumb **"Run workflow"**

5. Stranica se osvježi — vidiš novi redak s narančastom točkom (znači: u tijeku)

6. **Čekaj 10–15 minuta.** Osvježi stranicu povremeno. Kad završi, točka postane zelena kvačica ✓

7. Klikni na završeni workflow run

8. Dole na stranici vidiš sekciju **"Artifacts"** — klikni na **"MegaTischler-Copilot-Setup"**

9. ZIP datoteka se preuzima na tvoje računalo

> Ako ne vidiš "Run workflow" gumb, prijavi se na GitHub s računom `Perky121` pa pokušaj opet.

---

## KORAK 2 — Instaliraj na Windows

### 2a. Raspakirati ZIP

1. Nađi preuzetu datoteku u **Downloads** mapi
2. Desni klik → **"Extract All"** (Raspakiraj sve) → **Extract**
3. Unutar raspakirane mape vidiš: **`MegaTischler Copilot Setup.exe`**

### 2b. Pokrenuti installer

1. Dvostruki klik na **`MegaTischler Copilot Setup.exe`**

2. Windows će vjerojatno prikazati upozorenje:
   > "Windows protected your PC" ili "Zaštita sustava Windows..."

   To je normalno — app nije digitalno potpisana.

   **Što napraviti:**
   - Klikni **"More info"** (Više informacija)
   - Klikni **"Run anyway"** (Svejedno pokreni)

3. Pojavi se instalacijski čarobnjak:
   - Klikni **Next** (Dalje)
   - Odaberi mapu (ostavi default — OK)
   - Klikni **Install**
   - Klikni **Finish**

4. Na desktopu se pojavi ikona **"MegaTischler Copilot"**

---

## KORAK 3 — Prvo pokretanje i konfiguracija

### 3a. Pokrenuti app

1. Dvostruki klik na ikonu **"MegaTischler Copilot"** na desktopu
2. Pojavi se mali uski prozor s desne strane ekrana (380px širine)
3. Ako se ne pojavi odmah, pogledaj u taskbaru

### 3b. Konfiguracija (samo jednom)

1. Klikni ikonu **⚙** u gornjem desnom dijelu prozora

2. Otvori se Settings panel. Provjeri:
   - **Backend URL** — trebao bi biti već popunjen:
     ```
     https://27ff5e4d-ebe8-4d2e-a35c-5769cb600e92-00-2polfw5x5u74l.worf.replit.dev
     ```
     Ako nije, zalijepi taj URL

   - **OpenAI API Key** — ostavi prazno za sada

3. Klikni **"Spremi"** gumb

4. Klikni **✕** da zatvoriš Settings

### 3c. Test — radi li?

U input polje (dolje) upiši ovo pitanje i pritisni **Enter**:
```
Što znači formula [.D]-10 u MegaTischleru?
```

Za nekoliko sekundi trebao bi dobiti odgovor. Ako dobije odgovor — sve radi!

---

## KORAK 4 — Testiraj screenshot (F9)

> Najkorisnija funkcija: pritisneš F9, app fotografira tvoj ekran i AI analizira što vidi.

1. Otvori MegaTischler
2. Otvori neki parametarski dijalog
3. Pritisni **F9** na tipkovnici
4. U Copilot prozoru vidjet ćeš mali thumbnail (sličicu) ekrana
5. Upiši pitanje npr. "Što znači ovaj parametar?" i pritisni Enter
6. AI čita tvoj ekran i daje odgovor

---

## Česti problemi

### "Nema odgovora" / "HTTP 502" / sporo

**Uzrok:** Replit backend nije pokrenut (automatski se uspava nakon neaktivnosti).

**Rješenje:**
1. Otvori **https://replit.com** i prijavi se
2. Otvori Replit projekt
3. Klikni **Run** gumb
4. Pričekaj ~30 sekundi da se backend pokrene
5. Pokušaj opet u Copilotu

---

### Windows blokira instalaciju (SmartScreen)

**Uzrok:** App nema digitalni certifikat (normalno za privatne projekte).

**Rješenje:** Klikni "More info" → "Run anyway" (Korak 2b).

---

### Crni ekran umjesto UI-a

**Uzrok:** Bila je greška u starijoj verziji — sada je ispravljena.

**Rješenje:** Pokreni novi build (Korak 1) i instaliraj novu verziju.

---

### App se ne pojavljuje / ne vidi se prozor

**Uzrok:** Prozor je možda izvan vidljivog područja ekrana.

**Rješenje:** Odinstaliraj i ponovo instaliraj — prozor se resetira na desnu stranu.

---

### "MT nije pokrenut" (žuta točka u headeru)

**Uzrok:** MegaTischler.exe nije pokrenut.

**Rješenje:** Pokreni MegaTischler. Copilot ga detektira automatski za 5 sekundi.

Chat i F9 rade i bez pokrenuta MegaTischlera.

---

## Tipkovni prečaci

| Prečac | Što radi |
|--------|---------|
| **F9** | Fotografira ekran i prilaže uz poruku |
| **F8** | Glasovni unos — treba OpenAI API key (opcionalno) |
| **Enter** | Šalje poruku |
| **Shift+Enter** | Novi red (bez slanja) |

---

## Glasovni unos (F8) — opcionalno

Ako želiš koristiti glasovni unos i glasovne odgovore:

1. Nabavi **OpenAI API Key** na https://platform.openai.com/api-keys
2. U Copilot Settings → upiši ključ u polje "OpenAI API Key"
3. Spremi postavke
4. Pritisni **F8** → govori → **F8** opet za zaustavljanje
5. Tekst se pojavi u input polju; možeš ga editirati prije slanja

Za glasovne odgovore (TTS): Settings → uključi "Glasovni odgovor (TTS)" → odaberi glas.

---

## Ažuriranje na novu verziju

Kad agent napravi izmjene na kodu, za ažuriranje:

1. GitHub → **https://github.com/Perky121/tischler/actions**
2. "Build Electron (Windows .exe)" → **Run workflow**
3. Čekaj build, preuzmi novi ZIP iz Artifacts
4. Pokreni novi `Setup.exe` — automatski zamijeni staru verziju

---

## Podrška

Ako bilo što ne radi, javi agentu:
1. Koji je korak zapeo
2. Što se prikazuje na ekranu (screenshot pomaže)
3. Poruku greške ako postoji
