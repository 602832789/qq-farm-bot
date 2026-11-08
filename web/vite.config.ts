import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { visualizer } from 'rollup-plugin-visualizer'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'
import viteCompression from 'vite-plugin-compression'

function readJson(file: string, fallback: any): any {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'))
  }
  catch {
    return fallback
  }
}

const corePackageJson = readJson(fileURLToPath(new URL('../core/package.json', import.meta.url)), { version: '0.0.0' })
// 版本号单一真源：仓库根 version.json（由 scripts/version.mjs 在每次更新提交后递增）
const versionMeta = readJson(fileURLToPath(new URL('../version.json', import.meta.url)), { version: corePackageJson.version, build: 0 })

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const analyzeBuild = mode === 'analyze'
  const compressedBuild = mode === 'compressed'

  return {
    plugins: [
      UnoCSS() as any,
      vue(),
      ...(compressedBuild
        ? [viteCompression({
            verbose: true,
            threshold: 10240,
            algorithm: 'gzip',
            ext: '.gz',
          })]
        : []),
      ...(analyzeBuild
        ? [visualizer({
            open: false,
            gzipSize: true,
            brotliSize: true,
          })]
        : []),
    ],
    build: {
      // Compressed-size reporting and bundle analysis are useful on demand,
      // but add avoidable CPU work to every Linux/Docker startup build.
      reportCompressedSize: analyzeBuild,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')
            if (!normalizedId.includes('/node_modules/'))
              return undefined

            const matchesPackage = (name: string) => normalizedId.includes(`/node_modules/${name}/`)

            if (['vue', 'vue-router', 'pinia', '@vueuse/core'].some(matchesPackage))
              return 'vendor-vue'

            if ([
              'naive-ui',
              'vueuc',
              'vdirs',
              'vooks',
              'css-render',
              '@css-render/vue3-ssr',
              '@css-render/plugin-bem',
              'seemly',
              'treemate',
              'evtd',
              'date-fns',
              'date-fns-tz',
              'lodash-es',
              'async-validator',
            ].some(matchesPackage)) {
              return 'vendor-ui'
            }

            if (matchesPackage('axios'))
              return 'vendor-axios'

            return 'vendor'
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    define: {
      __APP_VERSION__: JSON.stringify(corePackageJson.version),
      __APP_BUILD__: JSON.stringify(String(versionMeta.build ?? 0)),
      __APP_VERSION_LABEL__: JSON.stringify(`v${corePackageJson.version} · 第 ${versionMeta.build ?? 0} 次更新`),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3007',
          changeOrigin: true,
          ws: true,
        },
        '/api': {
          target: 'http://localhost:3007',
          changeOrigin: true,
        },
        '/game-config': {
          target: 'http://localhost:3007',
          changeOrigin: true,
        },
      },
    },
  }
})
