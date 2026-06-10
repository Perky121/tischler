---
name: Screenshot base64 za Claude
description: Kako ispravno slati slike Claudeu kroz /api/chat endpoint
---

Antropic API zahtijeva čisti base64 string, bez data URL prefixa.

**Pravilo:** Uvijek extraktaj samo base64 dio prije slanja:
```typescript
const extractBase64 = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  return match ? match[1] : dataUrl;
};
```

**Zašto:** Browser FileReader.readAsDataURL() vraća `data:image/jpeg;base64,/9j/...` ali Anthropic messages API očekuje samo `/9j/...` kao `source.data`.

**Gdje se primjenjuje:** `artifacts/app/src/components/chat-panel.tsx` — prije slanja na `/api/chat`.

Backend detektira media type iz prvih znakova base64 stringa (iVBOR=PNG, R0lGOD=GIF, UklGR=WEBP, ostalo=JPEG).
