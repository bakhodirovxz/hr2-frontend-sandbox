import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows Tailwind's built-in scales. The design tokens in
 * tailwind.config.js add utilities whose NAMES it cannot classify — `text-control`
 * looks like a text COLOUR to it, `border-ctl` like a border colour — so it
 * treated them as conflicts and silently dropped them (the control border and
 * font size vanished, 2026-09-25). Registering them here keeps each in its
 * real group.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['control', 'btn', 'btn-sm', 'btn-lg'] }],
      'border-w': [{ border: ['ctl'] }],
      'ring-w': [{ ring: ['ctl'] }],
    },
  },
})

/** Merge conditional class names, de-duplicating conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
