/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  base: './',
  esbuild: {
    // 只丢 debugger 与调试级 console:console.error/warn 必须留在生产构建里。
    // 全量 drop:['console'] 会把 App.vue 全局 errorHandler 的 console.error 一并删掉,
    // 玩家侧只剩「出现异常,已记录」的 toast 而没有任何堆栈,线上问题无从查起
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
      // 用 import.meta.dirname 而非 __dirname:Vite 8 的 configLoader: 'native'
      // (未来版本的默认值)不提供 CJS 那套变量,继续用 __dirname 会在切换后报错
      '@': resolve(import.meta.dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 全量 `vitest run` 冷启动时 ~77% 的时间花在把 src 模块图转译成 JS 上
    // (node 环境下 node_modules 已 externalize,不受 optimizeDeps 影响,且 Vite 8 无
    // 进程内 transform 落盘缓存)。`fsModuleCache` 把转译结果按插件哈希缓存到
    // node_modules/.vitest-cache,重跑(本地迭代最频繁的路径)直接跳过转译,
    // 本地全量从 ~21s 压到 ~17-18s;它是 worker 数无关的,CI 冷启动仍是全新转译,
    // 跟改前一致(不拖慢 CI)。缓存位于 node_modules 内,装依赖时自然失效。
    fsModuleCache: true,
    // 平衡审计类用例(buildSim / celestialSim / synergyScan / worldGen 等)
    // 单个要跑上万次模拟,单独执行约 2 秒,但 97 个文件并行时互相抢 CPU 会顶到
    // vitest 的 5 秒默认上限 —— 切到 bun 后并行度更高,synergyScan 实测 5227ms 超时。
    // 放宽的是**并行竞争的余量**,不是掩盖变慢:该用例单跑仍是 1.8~2.0 秒
    testTimeout: 20000
  }
})
