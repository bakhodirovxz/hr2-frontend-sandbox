/**
 * O'ZBEK (lotin) — asosiy til va BARCHA kalitlarning manbasi.
 *
 * Saytdagi har bir static matn shu yerda turadi; komponentlar faqat t('...')
 * chaqiradi.
 *
 * QOLGAN TILLAR SHU DARAXTDAN HOSIL QILINADI (`i18n/index.ts`), ya'ni bu yerga
 * kalit qo'shilsa u boshqa tillarda ham DARHOL paydo bo'ladi:
 *
 *   uz_cyrl — `translit.ts` bilan avtomatik (lug'at kerak emas: bir til, boshqa alifbo)
 *   ru      — `ru.ts` dagi «o'zbekcha matn → ruscha matn» jadvali; tarjimasi
 *             yo'q matn o'zbekcha ko'rinadi, ekran hech qachon bo'sh chiqmaydi
 *
 * Ya'ni yangi matn qo'shganda `ru.ts` ga ham bir qator qo'shish YETARLI —
 * uchta faylni bir xil shaklda ushlab turish shart emas.
 */
import core from './uz.core'
import rest from './uz.rest'

/**
 * ⚠️ BU FAYL ENDI IKKI QISMNING YIG'INDISI. Matn `uz.core.ts` (kirishdan oldin
 * kerak bo'lgan bo'limlar) va `uz.rest.ts` (qolgan hammasi) da turadi — 2026-09-11
 * tezlik raundi, sabab o'sha fayllarning boshida. Bu fayl faqat TO'LIQ daraxt
 * kerak bo'lganda import qilinadi (tiplar, kirill/rus hosil qilish); ish vaqtida
 * `i18n/index.ts` `core` ni statik, `rest` ni dinamik oladi. Buni statik import
 * qilgan har bir modul ikkalasini ham entry'ga qaytarib olib keladi — qilmang.
 */
const uz = { ...core, ...rest }


/** Boshqa tillar shu tipga `satisfies Translation` bilan mos kelishi SHART —
 *  tarjimasiz qolgan kalitni TypeScript darhol ko'rsatadi. */
export type Translation = typeof uz

export default uz
