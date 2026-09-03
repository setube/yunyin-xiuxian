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
    include: ['src/**/*.spec.ts']
  }
})
