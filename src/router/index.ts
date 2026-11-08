import { createRouter, createWebHashHistory } from 'vue-router'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import { resetModalStack } from '@/composables/useModalStack'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/welcome', name: 'welcome', component: () => import('@/views/WelcomeView.vue') },
    { path: '/create', name: 'create', component: () => import('@/views/CreateView.vue') },
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/cultivation', name: 'cultivation', component: () => import('@/views/CultivationView.vue') },
    { path: '/codex', name: 'codex', component: () => import('@/views/RealmCodexView.vue') },
    { path: '/adventure', name: 'adventure', component: () => import('@/views/AdventureView.vue') },
    { path: '/world', name: 'world', component: () => import('@/views/MortalWorldView.vue') },
    { path: '/inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue') },
    { path: '/character', name: 'character', component: () => import('@/views/CharacterView.vue') },
    { path: '/celestial', name: 'celestial', component: () => import('@/views/CelestialView.vue') },
    { path: '/souls', name: 'souls', component: () => import('@/views/SoulsView.vue') },
    { path: '/dongfu', name: 'dongfu', component: () => import('@/views/DongfuView.vue') },
    { path: '/collection', name: 'collection', component: () => import('@/views/CollectionView.vue') },
    { path: '/build', name: 'build', component: () => import('@/views/BuildView.vue') },
    { path: '/market', name: 'market', component: () => import('@/views/MarketView.vue') },
    { path: '/apprentice', name: 'apprentice', component: () => import('@/views/ApprenticeView.vue') },
    { path: '/titles', name: 'titles', component: () => import('@/views/TitlesView.vue') },
    { path: '/legacy', name: 'legacy', component: () => import('@/views/LegacyView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

/**
 * 视图是懒加载的(`() => import(...)`),断网且该页的 chunk 不在缓存里时,import 会 reject。
 *
 * 现状:hash 已经变了、页面还是旧的那一页,只有控制台报
 * `Failed to fetch dynamically imported module`,玩家看到的只是「点底栏没反应」——
 * 不知道自己点了、也不知道为什么没动。
 *
 * 这里把它变成一句可读的状态,并把 hash 退回上一页:
 * 留着新 hash 更糟 —— 再点一次同一个入口不会触发导航,玩家会以为整个应用卡死了。
 */
/** 最近一次**成功**渲染的路径:失败时退回去。vue-router 的 history.state.back 在这里拿不到 —— hash 变更走的是 replace,back 恒为 null */
let lastGoodPath = '/'

router.afterEach(to => {
  lastGoodPath = to.fullPath
  /*
   * 切页时清掉弹窗栈。
   *
   * 原先只在 App.vue 的 onUnmounted 里清 —— 那是「整个应用卸载」,SPA 内切页不会触发。
   * 于是浏览器/安卓返回键从背包跳回首页时,背包页那扇装备详情还挂在屏幕上,
   * 底下已经是另一页的内容(实测:hash 变 #/ 、.modal-panel 仍是 1)。
   *
   * 只清栈顶状态不行:各页的详情弹窗读的是自己的 `xxxDetailUid`,那些也要一并复位 ——
   * resetModalStack 只处理栈,具体开哪扇由各 store 的 ref 决定,
   * 故这里连 ui store 的详情态一起清。
   */
  resetModalStack()
  useUiStore().clearDetail()
})

router.onError((err, to) => {
  const msg = String((err as Error)?.message ?? err)
  if (!/dynamically imported module|Importing a module script failed|Failed to fetch/i.test(msg)) return
  /*
   * 退回最近一次成功的页面。留着新 hash 更糟 —— 再点一次同一个入口不会触发导航
   * (vue-router 认为已经在那一页了),玩家会以为整个应用卡死了。
   */
  /*
   * 回退不能用 router.replace —— 它本身也要重新解析那条路由的组件,
   * 断网时同样走懒加载、同样会失败,于是原地不动(实测 hash 停在失败的 /titles)。
   * 直接改 location.hash:上一页的组件早就挂在内存里,vue-router 会把它换回来,
   * 不需要再下载任何 chunk。
   */
  const back = lastGoodPath
  if (back !== to.fullPath) {
    window.location.hash = `#${back}`
  }
  useUiStore().toast('页面加载失败 · 需联网', 'warn')
})

router.beforeEach(to => {
  const game = useGameStore()
  if (game.started) {
    if (to.name === 'welcome' || to.name === 'create') return { name: 'home' }
    return true
  }
  const settings = useSettingsStore()
  if (to.name === 'welcome') return true
  if (to.name === 'create') return settings.privacyAccepted ? true : { name: 'welcome' }
  return { name: 'welcome' }
})
