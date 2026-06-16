---
name: Rudarenje pravila iz knowledge_base.json
description: Kako sigurno izvoditi pravila o MegaTischler formulama iz baze (i koje zamke izbjeći)
---

# Rudarenje sigurnih pravila iz baze formula

Cilj: naći zaključke ≥90% (idealno ≥99%) sigurnosti iz `artifacts/api-server/data/knowledge_base.json` (3438 formula). Potvrđena pravila idu u system prompt (`chat/index.ts`) I u prikaz (`formula-rules.ts` + `formula-rules-panel.tsx`) — oba moraju ostati usklađena.

## Metodologija (korisnikova pravila)
- Min 10 uzoraka za pravilo.
- Max ~1/10 iznimki = greška. Što veći N, to manji dopušteni % iznimki.
- Velik uzorak s ~10% "iznimki" NIJE jedno 90% pravilo — to su vjerojatno DVA valjana stila/istine. Razdvoji ih, ne tvrdi jedno pravilo.

## Ključne zamke (provjereno)
- **`inferFormulaType` u parse-mac.ts je heuristika → tip je TAUTOLOŠKI.** "rotacija" se dodjeljuje AKO ima sin/cos/tan; "ukljucenje" po 0/1 listovima. Pravila izvodi NEOVISNO o `type` polju, iz sirovog teksta formule.
- **`typical_values` u parametrima je nepouzdan uzorak.** B-zastavice (BU, BDN, BSL…) imaju 0% čistih 0/1 u typical_values iako se koriste kao zastavice. Dokazuj kroz UPORABU u tekstu, ne kroz vrijednosti.
- **Regex artefakti:** and/or lanci kvare naivne RHS regexe. Tokeniziraj usporedbe (`[ref] OP vrijednost`) umjesto grubog hvatanja do `;`/`)`.
- **Jedinica brojanja:** razlikuj "broj formula koje sadrže X" od "broj poziva/blokova X" (jedna formula ima više if()). Uvijek označi jedinicu u prikazu/promptu da ne izgleda kontradiktorno (tablica funkcija broji formule; pravila uvjeta broje pozive).

## Potvrđene istine (lipanj 2026)
- Jednakost (==, =): desna strana je UVIJEK cijeli broj ili [ref], nikad decimala (1791/1791); vrijednost gotovo uvijek kod 0–9 (1789/1791). == testira kategoriju, ne mjeru.
- U cijeloj bazi samo 1/2420 usporedbi koristi decimalni prag (POSH<738,1).
- if() ima točno 3 argumenta (1170/1171 poziva); ifelse() neparan broj argumenata (199/199 poziva).
- Koordinatni nizovi `x;y;z@…` su SAMOSTALNE sirove vrijednosti, NISU argument euler() (29/29 samostalno, 0/18 euler() sadrži @). euler() = fiksni niz rotacijske matrice + os X:/Y:/Z:.
- neg() argument = jedna 0/1 zastavica u [ ] (175/176).

## Odbačeno / preslabo
- POSW/POSD/POSH "uvijek u usporedbi": samo 45.9% (koriste se i aritmetički).
- "Svaki and/or operand u svojim zagradama": samo 503/679 = 74% → dva stila; lanac istih usporedbi (A==1 and B==1) legitimno izostavlja unutarnje zagrade (~26%).
- Decimal u tijelu zarez vs točka: 73%/27% → nije čisto pravilo (ostaje kao nijansa, ne tvrdi "uvijek zarez").
