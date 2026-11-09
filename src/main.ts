import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { Capacitor } from '@capacitor/core'
import App from './App.vue'
import { router } from './router'
import { migrateLocalSchema, preflightScan } from './utils/storage'
import { sanitizeAllStores } from './stores/sanitizeAll'
import { useUiStore } from './stores/ui'
import { summarizeError, useDiagStore } from './stores/diag'
import { useServiceWorkerUpdate } from './composables/useServiceWorkerUpdate'
import './style.css'

/*
 * 启动分段计时。
 *
 * 实测进任何页面时都有一块约 68ms 的挂载期长任务,与页面节点数无关(158 节点的页
 * 与 703 节点的页读数只差 3ms)—— 那是**启动固定开销**,不是页面渲染。
 * 用 performance.mark 把它拆开,perf-profile 用 `--startup` 读这几段。
 *
 * 标记极廉价(仅压一条 record 进 buffer),生产开着也不影响首屏。
 */
performance.mark('boot:start')
// 启动前扫描损坏存档 + 结构升级,避免白屏
const corrupted = preflightScan()
performance.mark('boot:preflight')
migrateLocalSchema()

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)

function noteError(info: string, err: unknown): void {
  try {
    useDiagStore().record({ info, message: summarizeError(err), route: location.hash })
  } catch {
    /* 留档自身不许再抛 */
  }
}

app.config.errorHandler = (err, _instance, info) => {
  console.error('[全局异常]', info, err)
  noteError(String(info), err)
  try {
    useUiStore().toast('异常已留档', 'warn')
  } catch {
    // UI 尚未就绪时静默
  }
}

window.addEventListener('unhandledrejection', event => {
  console.error('[未处理的 Promise]', event.reason)
  noteError('unhandledrejection', event.reason)
})

// 须在首次渲染前逐仓自愈 hydrate 进来的坏值;幂等,engine.start 在 onMounted 再调一遍
sanitizeAllStores()
performance.mark('boot:sanitize')

app.mount('#app')
performance.mark('boot:mounted')

if (corrupted.length > 0) {
  useUiStore().corruptedNotice = corrupted
  useUiStore().toast('存档损坏,已隔离修复', 'warn')
}

// SW 只在生产构建的网页部署上注册。dev 下会缓存 HMR 产物;
// Electron(file://)/ Capacitor(https://localhost)里 SW 接管导航后本地 fetch 失败,第二次启动起 Windows 版白屏、安卓版卡加载遮罩(首次正常)。
const isLocalShell = location.protocol === 'file:' || Capacitor.isNativePlatform()
if (import.meta.env.PROD && !isLocalShell && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(reg => {
        const handle = useServiceWorkerUpdate(reg, () => useUiStore().requestPwaUpdate())
        useUiStore().setPwaApplyReload(() => handle.reload())
      })
      .catch(() => {
        /* 注册失败静默:可降级,见 public/sw.js */
      })
  })
}
