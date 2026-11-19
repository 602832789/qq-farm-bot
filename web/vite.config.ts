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
// 版本号单一真源：仓库根 version.json（由 scripts/version.mjs 在每次更新提交后递增）。
// 容器构建只 COPY web/ 时根文件不在上下文里，用脚本同步的 web/version.json 镜像兜底。
const rootVersionMeta = readJson(fileURLToPath(new URL('../version.json', import.meta.url)), null)
const webVersionMeta = readJson(fileURLToPath(new URL('./version.json', import.meta.url)), null)
const versionMeta = rootVersionMeta?.version ? rootVersionMeta : (webVersionMeta?.version ? webVersionMeta : null)
const appVersion = String(versionMeta?.version || corePackageJson.version || '0.0.0')
const appBuild = Number(versionMeta?.build)
const hasBuild = Number.isFinite(appBuild) && appBuild > 0
// 完全读不到版本文件时只显示版本号，避免把更新次数回退成 0。
const appVersionLabel = hasBuild ? `v${appVersion} · 第 ${appBuild} 次更新` : `v${appVersion}`

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
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD__: JSON.stringify(hasBuild ? String(appBuild) : ''),
      __APP_VERSION_LABEL__: JSON.stringify(appVersionLabel),
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
