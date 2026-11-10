/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  base: './',
  esbuild: {
    // console.error/warn 须留在生产构建:drop:['console'] 会删掉 App.vue 全局 errorHandler 的 console.error
    drop: ['debugger'],
    pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
    legalComments: 'none'
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          comments: false
        }
      }
    }),
    legacy({
      targets: ['Chrome >= 51', 'Android >= 7'],
      modernPolyfills: true
    })
  ],
  resolve: {
    alias: {
      // 不用 __dirname:Vite 8 的 configLoader: 'native'(未来版本的默认值)不提供 CJS 那套变量
      '@': resolve(import.meta.dirname, 'src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * 框架与业务分开成 chunk。
         *
         * rolldown 默认把 Vue 运行时与业务代码并进一个 442KB 的公共 chunk,
         * 名字还被取成了 player —— 每次发版业务一改,玩家就要重下整块(gzip 166KB)。
         *
         * 拆开之后框架那块 hash 长期不变,发版只需重下业务。**这不改善首次加载**,
         * 改善的是二次访问:按 gzip 算每版少下约 60KB。
         */
        advancedChunks: {
          groups: [
            {
              name: 'vendor-vue',
              test: /[\\/]node_modules[\\/](@vue|vue|vue-router|pinia|@vueuse)[\\/]/
            },
            {
              /*
               * 业务共享模块并成一块。
               *
               * rolldown 默认把被多处引用的业务模块各自拆成小块,首屏 25 块里有 16 块
               * 不到 5KB。弱网下这些请求要排队:28 个请求 / 6 连接 = 5 轮 RTT,
               * 3G 的 300ms 一乘就是 1.5 秒 —— 比 385KB 的下载时间(1.9s)还接近。
               *
               * 实测(4x CPU + 300ms RTT + 200KBps,各 5 次):
               *   25 块 3202/3317/3313/3324/3318ms,中位 3317
               *    5 块 3155/3159/3165/3160/3151ms,中位 3160
               * 快 157ms,方差也从 122ms 收到 14ms。
               * 代价是 gzip 343 → 372KB(+29KB,约 0.15s 下载),净赚。
               */
              name: 'biz',
              test: /[\\/]src[\\/](core|utils|data|ui|types|composables|stores)[\\/]/
            }
          ]
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 转译结果按插件哈希缓存到 node_modules/.vitest-cache,重跑跳过转译(本地全量 ~21s → ~17-18s);
    // CI 冷启动仍是全新转译,装依赖时缓存自然失效
    fsModuleCache: true,
    // 平衡审计类用例(buildSim / celestialSim / synergyScan / worldGen 等)单跑约 2 秒,
    // 并行抢 CPU 会顶到 5 秒默认上限;放宽的是并行竞争的余量,不是掩盖变慢
    testTimeout: 20000
  }
})
