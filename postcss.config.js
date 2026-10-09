import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import lvScale from './postcss/lvScale.js'

export default {
  // Order matters: lv-scale must see Tailwind's generated utilities.
  plugins: [tailwindcss, autoprefixer, lvScale()],
}
