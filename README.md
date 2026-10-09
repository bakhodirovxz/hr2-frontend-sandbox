# HRM — TZ sandbox, v2 interfeysi

«O'zbekgidroenergo» AJ kadrlar boshqaruvi tizimining interfeysi —
**«ТЗ_HRM_Ver 3.2»** da ko'rsatilgan modullar, v2 dizayn tizimida
(React + TypeScript + Vite + Tailwind). Backend va ma'lumotlar bazasi:
`hr-backend-sandbox` repozitoriyasi (`v2` tarmog'i).

> Holat: **ko'chirish jarayonida.** Funksional referens — `hr-frontend-sandbox`
> (v1 interfeysi). Marshrutlar o'sha jadvalda saqlanadi, chunki backend
> bildirishnoma, qidiruv va xatlarda shu yo'llarni yuboradi.

## Texnologiyalar

React 18, TypeScript (strict), Vite 5, Tailwind 3 (CSS-o'zgaruvchi tokenlar),
TanStack Query 5, Zustand, axios, i18next (UZ / ЎЗ / RU), recharts,
lucide-react.

## Dizayn tizimi

Barcha ranglar, shriftlar, radiuslar va soyalar **bir joyda** — CSS
o'zgaruvchilari sifatida [`src/styles/theme.css`](src/styles/theme.css) da
(yorug' va qorong'i). Tailwind (`tailwind.config.js`) semantik utilitalarni
shularga bog'laydi (`bg-surface`, `text-fg`, `border-line`, `text-brand` …).
Komponentlar hech qachon hex qiymatni to'g'ridan-to'g'ri yozmaydi. Forma
boshqaruvlari — `src/components/ui/control.ts`, jadvallar —
`src/components/data/DataTable.tsx`.

## Ishga tushirish

```bash
npm ci
npm run dev        # http://localhost:3001  (/api → http://localhost:8000)
```

Backend boshqa manzilda bo'lsa: `VITE_API_PROXY_TARGET=http://host:8000 npm run dev`.

## Qurish va tekshirish

```bash
npm run build                                    # tsc -b && vite build → dist/
scripts/dump_routes.sh > /tmp/sandbox_routes.txt # backend marshrutlari (jonli)
node scripts/contract_audit.mjs                  # har API yo'li ↔ backend marshruti
node scripts/orphans.mjs                         # hech qayerdan import qilinmagan fayllar
```

## Docker

```bash
docker compose build && docker compose up -d     # http://localhost:3001
```

`VITE_BASE_URL` (brauzer ko'radigan API manzili) build vaqtida yoziladi,
sukut bo'yicha `http://localhost:8000`.
