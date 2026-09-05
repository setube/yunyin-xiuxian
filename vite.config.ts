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
      '@': resolve(__dirname, 'src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // 平衡审计类用例(buildSim / celestialSim / synergyScan / worldGen 等)
    // 单个要跑上万次模拟,单独执行约 2 秒,但 97 个文件并行时互相抢 CPU 会顶到
    // vitest 的 5 秒默认上限 —— 切到 bun 后并行度更高,synergyScan 实测 5227ms 超时。
    // 放宽的是**并行竞争的余量**,不是掩盖变慢:该用例单跑仍是 1.8~2.0 秒
    testTimeout: 20000
  }
})
