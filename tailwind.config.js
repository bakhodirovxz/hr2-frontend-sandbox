/**
 * Tailwind is only a mapping layer here — every color/font/radius/shadow resolves
 * to a CSS variable defined ONCE in src/styles/theme.css. Change a token there and
 * the whole app (light + dark) follows. Never hardcode hex values in components;
 * use these semantic utilities (bg-surface, text-fg-muted, border-line, text-brand…).
 *
 * Colors are stored as space-separated RGB channels ("79 70 229") so Tailwind's
 * opacity modifiers work everywhere: bg-brand/10, text-danger/70, etc.
 *
 * ⚠️ Bare OKLCH components were tried and reverted — see the warning at the top
 * of theme.css. Raw CSS must write `rgb(var(--x))`.
 */

/** @param {string} v */
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces & structure
        bg: withAlpha('--bg'),
        surface: withAlpha('--surface'),
        'surface-2': withAlpha('--surface-2'),
        elevated: withAlpha('--elevated'),
        line: withAlpha('--border'),
        'line-strong': withAlpha('--border-strong'),

        // Text
        fg: withAlpha('--fg'),
        'fg-muted': withAlpha('--fg-muted'),
        'fg-subtle': withAlpha('--fg-subtle'),
        'fg-on-brand': withAlpha('--fg-on-brand'),

        // Brand + accent
        brand: withAlpha('--brand'),
        'brand-strong': withAlpha('--brand-strong'),
        'brand-soft': withAlpha('--brand-soft'),
        'brand-deep': withAlpha('--brand-deep'),
        accent: withAlpha('--accent'),

        // Semantic
        success: withAlpha('--success'),
        'success-soft': withAlpha('--success-soft'),
        warning: withAlpha('--warning'),
        'warning-soft': withAlpha('--warning-soft'),
        danger: withAlpha('--danger'),
        'danger-soft': withAlpha('--danger-soft'),
        info: withAlpha('--info'),
        'info-soft': withAlpha('--info-soft'),

        // Sidebar (own tokens so it can diverge from the content surface)
        sidebar: withAlpha('--sidebar'),
        'sidebar-fg': withAlpha('--sidebar-fg'),
        'sidebar-muted': withAlpha('--sidebar-muted'),
        'sidebar-active': withAlpha('--sidebar-active'),
        'sidebar-active-fg': withAlpha('--sidebar-active-fg'),

        // Form controls — theme.css «FORM CONTROLS: THE ONE PLACE»
        'ctl-bg': withAlpha('--ctl-bg'),
        'ctl-line': withAlpha('--ctl-border'),
        'ctl-focus': withAlpha('--ctl-focus'),
        'sidebar-accent': withAlpha('--sidebar-accent'),
        'sidebar-border': withAlpha('--sidebar-border'),

        // Data-viz series
        'chart-1': withAlpha('--chart-1'),
        'chart-2': withAlpha('--chart-2'),
        'chart-3': withAlpha('--chart-3'),
        'chart-4': withAlpha('--chart-4'),
        'chart-5': withAlpha('--chart-5'),
        'chart-6': withAlpha('--chart-6'),

        ring: withAlpha('--ring'),

        /* Doim-oq yuza (QR paneli) — mavzu bilan ag'darilmaydi. */
        'on-white': withAlpha('--on-white-fg'),
        'on-white-success': withAlpha('--on-white-success'),
        // Xarita ustidagi panel/qatlamlar — mavzudan qat'i nazar bir xil.
        'map-scrim': withAlpha('--map-scrim'),
        'map-ink': withAlpha('--map-ink'),
        'map-live': withAlpha('--map-live'),
        'map-track': withAlpha('--map-track'),
        'map-glow': withAlpha('--map-glow'),
        'on-white-danger': withAlpha('--on-white-danger'),
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        display: 'var(--font-display)',
        /* Measurement only — times, counts, registration numbers. */
        mono: 'var(--font-mono)',
      },
      /* Role names, so a component asks for the SHAPE ROLE it needs rather
       * than a size: rounded-control, rounded-inner, rounded-card, rounded-panel.
       * The t-shirt aliases stay for existing markup. */
      borderRadius: {
        sm: 'var(--r-xs)',
        DEFAULT: 'var(--r-sm)',
        md: 'var(--r-sm)',
        lg: 'var(--r-sm)',
        xl: 'var(--r-lg)',
        '2xl': 'var(--r-xl)',
        tag: 'var(--r-xs)',
        control: 'var(--ctl-radius)',
        popover: 'var(--pop-radius)',
        btn: 'var(--btn-radius)',
        seg: 'var(--seg-radius)',
        inner: 'var(--r-md)',
        card: 'var(--r-lg)',
        panel: 'var(--r-xl)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        pop: 'var(--shadow-pop)',
      },
      screens: {
        xs: '480px',
      },
      /* O'lcham ROLLARI — qiymatlar theme.css dagi GLOBAL SIZING blokida.
       * Komponent `h-control`, `size-icon`, `px-page`, `gap-ui` deb so'raydi;
       * qattiq `h-[38px]` / `px-3 sm:px-5` yozilmaydi. */
      spacing: {
        page: 'var(--page-px)',
        'page-y': 'var(--page-py)',
        card: 'var(--card-p)',
        ui: 'var(--gap-ui)',
        'ui-sm': 'var(--gap-ui-sm)',
        icon: 'var(--icon-btn)',
        'icon-xs': 'var(--icon-btn-xs)',
        control: 'var(--ctl-h)',
        'control-sm': 'var(--ctl-h-sm)',
        'control-lg': 'var(--ctl-h-lg)',
        'ctl-x': 'var(--ctl-px)',
        btn: 'var(--btn-h)',
        'btn-sm': 'var(--btn-h-sm)',
        'btn-lg': 'var(--btn-h-lg)',
        'btn-icon': 'var(--btn-icon)',
        seg: 'var(--seg-h)',
        'seg-sm': 'var(--seg-h-sm)',
        header: 'var(--header-h)',
        sidebar: 'var(--sidebar-w)',
      },
      maxWidth: {
        branch: 'var(--branch-max)',
      },
      fontSize: {
        control: 'var(--ctl-font)',
        btn: 'var(--btn-font)',
        'btn-sm': 'var(--btn-font-sm)',
        'btn-lg': 'var(--btn-font-lg)',
      },
      borderWidth: {
        ctl: 'var(--ctl-border-w)',
      },
      ringWidth: {
        ctl: 'var(--ctl-ring-w)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
        'feed-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-up': 'slide-up 0.22s cubic-bezier(0.22,1,0.36,1)',
        'scale-in': 'scale-in 0.16s ease-out',
        'slide-in-right': 'slide-in-right 0.28s cubic-bezier(0.32,0.72,0,1)',
        'feed-in': 'feed-in 0.4s ease-out both',
      },
    },
  },
  plugins: [],
}
