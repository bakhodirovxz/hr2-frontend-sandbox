import { useTranslation } from 'react-i18next'

/**
 * Runtime'da hisoblangan i18n kaliti uchun YAGONA teshik.
 *
 * `i18next.d.ts` `t()` ni `uz.ts` shakli bo'yicha tiplaydi — bu juda foydali
 * (yo'q kalit kompilyatsiyada tutiladi), ammo faqat LITERAL kalitni qabul
 * qiladi. Ba'zi joylarda kalitning o'zi MA'LUMOT: administratorlik
 * qo'llanmasining bloklari (`features/help/adminGuide.ts`) va kam ko'ruvchilar
 * rejimining sxema nomlari (`a11y/lowVisionStore.ts`) matnni emas, KALITNI
 * saqlaydi — shunda matn `uz.ts` da qolib, rus/kirill tillari o'zi ishlaydi.
 *
 * Shuning uchun cast bir joyda, izohi bilan turadi — har chaqiruvda `as never`
 * sochilib ketmasin.
 */
export function useDynamicT(): (key: string) => string {
  const { t } = useTranslation()
  return t as unknown as (key: string) => string
}
