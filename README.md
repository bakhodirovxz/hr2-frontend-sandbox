# HRM — TZ sandbox, v2 interfeysi

«O'zbekgidroenergo» AJ kadrlar boshqaruvi tizimining interfeysi —
**«ТЗ_HRM_Ver 3.2»** da ko'rsatilgan modullar (administrator, ro'yxatdan
o'tish, avtorizatsiya, shaxsiy kabinet, ma'lumotnomalar, shtat tuzilmasi,
kadrlar hisobi, KPI, buyruqlar, vakant o'rinlar, statistik hisobot,
interaktiv xizmatlar, davomat, zaxira nusxa va avariya konsoli) v2 dizayn
tizimida: React + TypeScript + Vite + Tailwind.

Backend, ma'lumotlar bazasi, ekspertiza hisoblari va **TZ muvofiqlik
matritsasi** (har TZ bandi → endpoint + shu interfeysdagi sahifa/tab/tugma →
qanday tekshiriladi) — `hr-backend-sandbox` repozitoriyasining `v2`
tarmog'ida: `docs/TZ_MUVOFIQLIK.md`, `SETUP.md`. Sinov hisoblari va
parollar o'sha hujjatlarda.

> Holat: v1 interfeysidan (`hr-frontend-sandbox`, port 3000) ko'chirish
> yakunlanmoqda; ikkalasi yonma-yon ishlaydi, v2 — **port 3001**. Marshrutlar
> v1 bilan bir xil jadvalda saqlanadi, chunki backend bildirishnoma, qidiruv
> va xatlardagi havolalarda shu yo'llarni yuboradi.

## Texnologiyalar

React 18, TypeScript (strict), Vite 5, Tailwind 3 (CSS-o'zgaruvchi tokenlar),
TanStack Query 5, Zustand, axios, i18next (UZ / ЎЗ / RU), recharts,
lucide-react.

## Ishga tushirish

Talab: Node 20+, ishlab turgan backend (`hr-backend-sandbox`, `v2`).

```bash
npm ci
npm run dev        # http://localhost:3001  (/api → http://localhost:8000)
```

Dev server `/api/*` so'rovlarini backendga proksi qiladi (`vite.config.ts`).
Backend boshqa manzilda bo'lsa:

```bash
VITE_API_PROXY_TARGET=http://localhost:8100 npm run dev
```

Backenddagi `FRONTEND_URL` (CORS, QR va xatlardagi havolalar) shu interfeys
manziliga mos bo'lsin (`http://localhost:3001`).

### Production qurish va Docker

```bash
npm run build                  # tsc -b && vite build → dist/
docker compose build && docker compose up -d     # nginx, http://localhost:3001
```

| O'zgaruvchi | Qachon | Sukut | Vazifasi |
|---|---|---|---|
| `VITE_BASE_URL` | build vaqtida (Docker build argumenti) | `http://localhost:8000` | brauzer ko'radigan API manzili — bundle ichiga yoziladi, o'zgarsa qayta quring |
| `FRONTEND_PORT` | `docker compose up` | `3001` | xostdagi port (konteyner ichida nginx :80) |
| `VITE_API_PROXY_TARGET` | faqat `npm run dev` | `http://localhost:8000` | dev proksi manzili |

`default.conf` — nginx: `index.html` keshlanmaydi, `/assets/` (xeshli
fayllar) uzoq keshlanadi, SPA marshrutlari `index.html` ga qaytadi.

## Tuzilish

| Nima | Qayerda |
|---|---|
| Marshrutlar (sahifalar) | [`src/App.tsx`](src/App.tsx) — lazy sahifalar `src/pages/` |
| Menyu va marshrut darvozalari — yagona manba | [`src/components/layout/navConfig.ts`](src/components/layout/navConfig.ts): guruhlar, bandlar, rol × modul darajasi (`/auth/me`) |
| Gorizontal yuqori menyu + ikkinchi qatordagi pastki menyu (TZ 440–441) | `src/components/layout/TopNav.tsx`; telefon kengligida yon panel — `Sidebar.tsx` |
| Shapka, pastki panel, qayta aloqa, kam ko'ruvchilar rejimi | `src/components/layout/` (`Header`, `Footer`, `FeedbackModal`), `src/a11y/LowVisionPanel.tsx` |
| Modul funksiyalari (hook, oyna, jadval) | `src/features/<modul>/` |
| API mijozi | `src/api/client.ts` (`apiGet/apiPost/…`, xato kodlari → i18n) |
| F1 administratorlik qo'llanmasi (TZ 1745) | `src/features/help/adminGuide.ts` (bo'limlar va marshrutlar) + `HelpButton.tsx`; matn — `guide.*` kalitlari |
| Harakatsizlikda chiqish (TZ U2) | `src/features/auth/IdleGuard.tsx` |

### Dizayn tizimi

Barcha ranglar, shriftlar, radiuslar va soyalar **bir joyda** — CSS
o'zgaruvchilari sifatida [`src/styles/theme.css`](src/styles/theme.css) da
(yorug' va qorong'i). Tailwind (`tailwind.config.js`) semantik utilitalarni
shularga bog'laydi (`bg-surface`, `text-fg`, `border-line`, `text-brand` …).
Komponentlar hex qiymatni to'g'ridan-to'g'ri yozmaydi. Forma boshqaruvlari —
`src/components/ui/control.ts`, jadvallar — `src/components/data/DataTable.tsx`.

## Tillar (i18n, TZ 4.1.7)

Interfeys uch tilda: o'zbek (lotin), o'zbek (kirill), rus.

| Fayl | Nima |
|---|---|
| `src/i18n/uz.core.ts` | kirishdan oldin kerak bo'lgan matnlar (login, ro'yxatdan o'tish, xato kodlari) — statik yuklanadi |
| `src/i18n/uz.rest.ts` | qolgan barcha matnlar — kirgandan keyin dinamik yuklanadi |
| `src/i18n/uz.ts` | ikkalasining yig'indisi — kalitlar va `t()` tiplari manbai (ish vaqtida import qilmang) |
| `src/i18n/ru.ts` | ruscha jadval: kalit — **o'zbekcha matnning o'zi** (yo'l emas); tarjimasi yo'q matn o'zbekcha ko'rinadi |
| `src/i18n/translit.ts` | `uz_cyrl` — lotindan avtomatik transliteratsiya (alohida lug'at yo'q) |

Yangi matn: kalitni `uz.core.ts` yoki `uz.rest.ts` ga qo'shing va `ru.ts` ga
bitta qator yozing. Ish vaqtidagi tuzatishlar (administrator «Tizim lug'ati»
sahifasida kiritadi) backenddan `GET /i18n/overrides` orqali ustiga qo'yiladi.

## Tekshirish skriptlari

```bash
npm run build                                    # tsc -b && vite build — tip xatolari ham shu yerda
scripts/dump_routes.sh [api-konteyner] > /tmp/sandbox_routes.txt   # ishlab turgan backend marshrutlari
node scripts/contract_audit.mjs [/tmp/sandbox_routes.txt]          # frontend ishlatgan har API yo'li va metodi ↔ backend marshruti
node scripts/i18n_coverage.mjs [--list]          # har o'zbekcha matnning ruscha tarjimasi bormi
node scripts/orphans.mjs                         # hech qayerdan import qilinmagan fayllar
```

Uchala skript ham topilma bo'lsa nolga teng bo'lmagan kod bilan chiqadi
(`i18n_coverage` tarjimasiz matnlar sonini chiqaradi, `--list` — ro'yxati;
hozir 3 ta qasddan qoldirilgan qator).
