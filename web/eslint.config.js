import antfu from '@antfu/eslint-config'

export default antfu(
  {
    vue: true,
    typescript: true,
    unocss: true,
    formatters: true,
    rules: {
      'no-alert': 'off',
    },
  },
  {
    // 本仓库的单测统一用 node:test（`node --test tests/*.test.mjs`），不接 vitest；
    // 且常靠 new Function / vm 把 TS 源码跑起来做静态断言，这里没有代码注入面。
    files: ['tests/**'],
    rules: {
      'test/no-import-node-test': 'off',
      'no-new-func': 'off',
    },
  },
)
