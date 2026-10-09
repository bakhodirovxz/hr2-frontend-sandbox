/* Typed t(): kalitlar avtoto'ldiriladi, mavjud bo'lmagan kalit — kompilyatsiya
 * xatosi. Manba — uz.ts lug'ati. */
import 'i18next'
import type uz from './uz'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: typeof uz }
    returnNull: false
  }
}
