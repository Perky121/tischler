# MegaTischler Copilot — Instalacija na Windows

> **Ovaj vodič je napisan za potpunog početnika.**
> Slijedi korake redom. Svaki korak ima screenshotove i objašnjenja što napraviti ako nešto ne radi.

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
- [ ] Besplatni **GitHub račun** (za dobivanje .exe datoteke)
- [ ] Oko **1 sat vremena** za prvi put

---

## KORAK 1 — Kreiraj besplatni GitHub račun

> GitHub je platforma za kod. Koristimo ga samo da izgradimo .exe datoteku — kao "tvornica" koja nam je besplatna.

1. Otvori u pregledniku: **https://github.com**

2. Klikni veliki zeleni gumb **"Sign up"**

3. Unesi:
   - Email adresu
   - Lozinku
   - Korisničko ime (npr. `ivo-horvat` — može biti bilo što)

4. Provjeri email i klikni link za potvrdu

5. Kad se prijaviš, vidiš početnu stranicu GitHub-a — to je to!

> Ako već imaš GitHub račun, preskoči na Korak 2.

---

## KORAK 2 — Kreiraj novi repozitorij

> Repozitorij je kao mapa na GitHubu gdje se čuva kod.

1. Na GitHub početnoj stranici, klikni **"+"** (gore desno) → **"New repository"**

2. Popuni obrazac:
   - **Repository name:** `megatischler-copilot` (bez razmaka!)
   - **Description:** (ostavi prazno)
   - Odaberi **"Public"**
   - **NE** stavljaj kvačicu na "Add a README file"

3. Klikni zeleni gumb **"Create repository"**

4. Vidjet ćeš prazni repozitorij. Kopiraj URL iz adresne trake, izgleda ovako:
   ```
   https://github.com/TVOJE_KORISNIČKO_IME/megatischler-copilot
   ```
   Zapisat ćeš ga za Korak 3.

---

## KORAK 3 — Poveži Replit s GitHubom i pošalji kod

> Sav kod aplikacije je na Replitu. Trebamo ga prebaciti na GitHub da bi GitHub mogao izgraditi .exe.

### 3a. Otvori Replit projekt

1. Otvori: **https://replit.com** i prijavi se
2. Otvori projekt **"megatischler-copilot"** (ili koji je naziv tvog projekta)
3. Uvjeri se da je projekt **pokrenut** (klikni Run ako nije — treba ti za backend)

### 3b. Poveži GitHub i Replit

1. U Replitu, u lijevom izborniku nađi ikonu **"Git"** (izgleda kao razgranato stablo)
2. Klikni **"Connect to GitHub"**
3. Prijavi se sa svojim GitHub računom kad te pita
4. Odaberi repozitorij koji si upravo kreirao: `megatischler-copilot`
5. Klikni **"Connect"**

### 3c. Pošalji kod na GitHub

1. Nakon što se poveže, vidjet ćeš popis datoteka
2. U polje "Commit message" upiši: `Inicijalni upload`
3. Klikni **"Commit & push"**
4. Pričekaj par sekundi dok se upload završi

> Ako Replit Git panel ne radi ili imaš problem, javi — agent može poslati kod direktno.

### Provjeri da je uspjelo

Otvori `https://github.com/TVOJE_KORISNIČKO_IME/megatischler-copilot` u pregledniku. Trebao bi vidjeti puno datoteka (main.js, README.md, electron/ mapa itd.).

---

## KORAK 4 — Pokreni automatski build (.exe)

> GitHub će sada sam instalirati sve potrebno i izgraditi tvoj .exe. To traje ~10 minuta.

1. Na GitHub repozitoriju, klikni tab **"Actions"** (u gornjem meniju)

2. U lijevom stupcu vidiš **"Build Electron (Windows .exe)"** — klikni na to

3. Desno vidis gumb **"Run workflow"** — klikni ga

4. Pojavi se mali prozor. Klikni zeleni gumb **"Run workflow"**

5. Stranica se osvježi i vidiš novi redak s narančastom točkom (znači: u tijeku)

6. **Čekaj 10–15 minuta.** Možeš osvježavati stranicu. Kad završi, točka postaje zelena kvačica ✓

7. Klikni na završeni workflow run

8. Dole na stranici vidiš sekciju **"Artifacts"** i datoteku **"MegaTischler-Copilot-Setup"**

9. Klikni na nju — preuzima se ZIP datoteka na tvoje računalo

---

## KORAK 5 — Instaliraj na Windows

### 5a. Raspakirati ZIP

1. Nađi preuzetu datoteku u **Downloads** mapi (ili gdje ti se pohranjuje)
2. Desni klik → **"Extract All"** (Raspakiraj sve) → **Extract**
3. Unutar raspakirane mape vidiš: **`MegaTischler Copilot Setup.exe`**

### 5b. Pokrenuti installer

1. Dvostruki klik na **`MegaTischler Copilot Setup.exe`**

2. Windows će vjerojatno prikazati upozorenje:
   > "Windows protected your PC" ili "Zaštita sustava Windows..."

   To je normalno — app nije digitalno potpisana (certifikati koštaju).
   
   **Što napraviti:**
   - Klikni **"More info"** (Više informacija)
   - Pojavi se gumb **"Run anyway"** (Svejedno pokreni) — klikni to

3. Pojavi se instalacijski čarobnjak:
   - Klikni **Next** (Dalje)
   - Odaberi mapu (ostavi default — OK)
   - Klikni **Install**
   - Klikni **Finish**

4. Na desktopu se pojavi ikona **"MegaTischler Copilot"**

---

## KORAK 6 — Prvo pokretanje i konfiguracija

### 6a. Pokrenuti app

1. Dvostruki klik na ikonu **"MegaTischler Copilot"** na desktopu
2. Pojavi se mali uski prozor s desne strane ekrana (380px širine)
3. Ako se ne pojavi desno, pogledaj u taskbaru

### 6b. Konfiguracija (samo jednom)

1. Klikni ikonu **⚙** u gornjem desnom dijelu prozora

2. Otvori se Settings panel. Provjeri:
   - **Backend URL** — trebao bi biti već popunjen:
     ```
     https://27ff5e4d-ebe8-4d2e-a35c-5769cb600e92-00-2polfw5x5u74l.worf.replit.dev
     ```
     Ako nije, zalijepi taj URL

   - **OpenAI API Key** — ostavi prazno za sada (nije potreban za chat)

3. Klikni **"Spremi"** gumb

4. Klikni **✕** da zatvoriš Settings

### 6c. Test — radi li?

U input polje (dolje) upiši ovo pitanje i pritisni **Enter**:
```
Što znači formula [.D]-10 u MegaTischleru?
```

Za nekoliko sekundi trebao bi dobiti odgovor od AI agenta. Ako dobije odgovor — sve radi!

---

## KORAK 7 — Testiraj screenshot (F9)

> Ovo je najkorisnija funkcija: pritisneš F9, app fotografira tvoj ekran i AI analizira što vidi.

1. Otvori MegaTischler (ako imaš ga instaliranog)
2. Otvori neki parametarski dijalog u MegaTischleru
3. Pritisni **F9** na tipkovnici
4. U Copilot prozoru vidjet ćeš mali thumbnail (sličicu) ekrana
5. Upiši pitanje npr. "Što znači ovaj parametar?" i pritisni Enter
6. AI će pročitati tvoj ekran i dati odgovor

Ili klikni **📷 gumb** u donjem dijelu prozora za isti efekt.

---

## Česti problemi

### "Nema odgovora" / "HTTP 502"

**Uzrok:** Replit backend nije pokrenut.

**Rješenje:**
1. Otvori Replit projekt na replit.com
2. Klikni **Run** gumb
3. Pričekaj ~30 sekundi da se backend pokrene
4. Pokušaj opet u Copilotu

---

### Windows blokira instalaciju

**Uzrok:** App nema digitalni certifikat (to je normalno za privatne projekte).

**Rješenje:** Klikni "More info" → "Run anyway" kao što opisuje Korak 5b.

---

### App se ne pojavljuje / ne vidi se prozor

**Uzrok:** Prozor je možda izvan ekrana (posebno ako si mijenjao rezoluciju).

**Rješenje:**
1. Desni klik na ikonu u taskbaru
2. Odaberi "Move" (Premjesti)
3. Pritisni strelicu na tipkovnici — prozor bi se trebao pomaknuti

Ili odinstaliraj i ponovo instaliraj — prozor se resetira na desnu stranu ekrana.

---

### "MT nije pokrenut" (žuta točka)

**Uzrok:** MegaTischler.exe nije pokrenut.

**Rješenje:** Pokreni MegaTischler. Copilot ga automatski detektira u roku 5 sekundi i točka postane zelena.

Možeš normalno koristiti chat i F9 čak i bez pokrenuta MegaTischlera — samo neće biti kontekst trenutnog prozora.

---

### Ikona ⚙ ne reagira / app je zamrznuta

**Rješenje:** Desni klik taskbar → "Close window" → pokreni ponovo s desktopa.

---

## Tipkovni prečaci

| Prečac | Što radi |
|--------|---------|
| **F9** | Fotografira ekran i prilaže uz poruku |
| **F8** | Glasovni unos (treba OpenAI ključ — opcionalno) |
| **Enter** | Šalje poruku |
| **Shift+Enter** | Novi red (bez slanja) |

---

## Glasovni unos (F8) — opcionalno, za kasnije

Ako želiš koristiti i glasovni unos (govoriš umjesto tipkanja):

1. Nabavi **OpenAI API Key** na https://platform.openai.com
2. U Copilot Settings → upiši ključ u polje "OpenAI API Key"
3. Pritisni F8 → govori → F8 opet za zaustavljanje
4. Tekst se automatski pojavi u input polju

---

## Ažuriranje na novu verziju

Kad agent napravi izmjene na kodu:

1. U Replit Git panelu → "Commit & push" (kao u Koraku 3c)
2. GitHub → Actions → "Run workflow" (kao u Koraku 4)
3. Preuzmi novi .exe i instaliraj ga (stari se automatski zamijeni)

---

## Kontakt / podrška

Ako bilo što ne radi, javi agentu točno:
1. Koji je korak zapeo
2. Što se prikazuje na ekranu (screenshot je koristan)
3. Poruku greške ako postoji
