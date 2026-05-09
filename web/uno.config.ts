import { defineConfig, presetAttributify, presetIcons, presetUno, presetWebFonts } from 'unocss'

export default defineConfig({
  shortcuts: {
    'cartoon-card': 'rounded-2xl border-3 border-black/8 transition-all duration-250 hover:-translate-y-0.5 active:translate-y-0',
    'cartoon-btn': 'rounded-2xl font-bold px-6 py-2.5 border-3 border-black/10 cursor-pointer transition-all duration-150 active:translate-y-0.5',
    'farm-gradient': 'bg-gradient-to-br from-[#6dbf5b] to-[#4a8c3f]',
    'farm-gradient-warm': 'bg-gradient-to-br from-[#f0c040] to-[#8b6914]',
    'soil-bg': 'bg-gradient-to-b from-[#8b6914] to-[#6b4f0e]',
    'grass-bg': 'bg-gradient-to-b from-[#6dbf5b] to-[#4a8c3f]',
    'sky-bg': 'bg-gradient-to-b from-[#b8e4f7] to-[#87ceeb]',
    'farm-card': 'cartoon-card bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm p-4',
    'farm-panel': 'cartoon-card bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm p-5',
    'farm-input': 'rounded-xl border-3 border-black/10 px-4 py-2.5 focus:border-[#4a8c3f] focus:ring-2 focus:ring-[#4a8c3f]/30 transition-all outline-none bg-white dark:bg-gray-700',
    'farm-badge': 'inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border-2 border-black/10',
    'farm-title': 'font-display text-2xl text-[#3d2b1f] dark:text-[#f0c040]',
    'farm-text': 'font-body text-[#3d2b1f] dark:text-[#d4e8d4]',
    'wood-frame': 'border-4 border-[#8b6914] rounded-2xl shadow-[0_4px_0_#6b4f0e,0_4px_12px_rgba(0,0,0,0.15)]',
    'grass-land': 'bg-[#4a8c3f] border-3 border-[#3a6b2e] rounded-xl',
    'soil-land': 'bg-[#8b6914] border-3 border-[#6b4f0e] rounded-xl',
  },
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        'src/**/*.{js,ts}',
      ],
    },
  },
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true,
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
        fas: () => import('@iconify-json/fa-solid/icons.json').then(i => i.default),
        'svg-spinners': () => import('@iconify-json/svg-spinners/icons.json').then(i => i.default),
      },
    }),
    presetWebFonts({
      fonts: {
        sans: 'Nunito',
        serif: 'DM Serif Display',
        mono: 'DM Mono',
        display: 'ZCOOL KuaiLe',
      },
    }),
  ],
})
