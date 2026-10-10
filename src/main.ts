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

// 启动前扫描损坏存档 + 结构升级,避免白屏
const corrupted = preflightScan()
migrateLocalSchema()

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

app.use(pinia)
app.use(router)

/**
 * 异常留档 —— 诊断本身不许再抛,故整段包在 try 里。
 *
 * 从前这里只打一行 console.error 再 toast「出现异常,已记录」:手机上根本没有控制台,
 * 那句「已记录」是空话,玩家报问题时我们手上什么都没有。
 */
function noteError(info: string, err: unknown): void {
  try {
    useDiagStore().record({ info, message: summarizeError(err), route: location.hash })
  } catch {
    /* 连留档都失败时不许再抛:诊断不能变成第二个故障源 */
  }
}

app.config.errorHandler = (err, _instance, info) => {
  console.error('[全局异常]', info, err)
  noteError(String(info), err)
  try {
    useUiStore().toast('出现异常,已记入留档(设置页可查)', 'warn')
  } catch {
    // UI 尚未就绪时静默
  }
}

// 未处理的 Promise 拒绝从前完全静默:连 toast 都没有,玩家只会觉得「点了没反应」
window.addEventListener('unhandledrejection', event => {
  console.error('[未处理的 Promise]', event.reason)
  noteError('unhandledrejection', event.reason)
})

// 首次渲染前逐仓自愈:把 hydrate 进来的 malformed 字段(bad 档/导入档的 NaN/负值)当场修平,
// 免得在线会话甚至第一帧就带坏值(engine.start 在 onMounted 也调一遍,这里更早一步、幂等同源)
sanitizeAllStores()

app.mount('#app')

if (corrupted.length > 0) {
  useUiStore().corruptedNotice = corrupted
  useUiStore().toast('检测到部分存档数据异常,已为你隔离修复', 'warn')
}

// PWA 离线缓存:只在生产构建、且只在**真正的网页部署**上注册。
// dev 下 SW 会缓存 HMR 产物、干扰热重载;而 Electron(file://)与 Capacitor(https://localhost)
// 本身就是本地文件,离线缓存毫无意义,反而致命:SW 接管导航后 fetch() 这类本地 URL 会失败,
// 缓存又没有副本,于是第二次启动起就只剩「离线且无缓存副本」—— Windows 版白屏、
// 安卓版卡在加载遮罩(玩家反馈)。第一次启动总是好的,因为那次 SW 还没接管,最会误导排查。
// 注册失败静默 —— 有 SW 是增强(断网可重开),没有也不影响在线游玩。
const isLocalShell = location.protocol === 'file:' || Capacitor.isNativePlatform()
if (import.meta.env.PROD && !isLocalShell && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(reg => {
        // 有新版本就绪时亮横幅;「重新加载」动作注册进 ui store,更新提示那枚关闭按钮在此续命
        const handle = useServiceWorkerUpdate(reg, () => useUiStore().requestPwaUpdate())
        useUiStore().setPwaApplyReload(() => handle.reload())
      })
      .catch(() => {
        /* 注册失败不打扰玩家:功能可降级,见 public/sw.js 注释 */
      })
  })
}
