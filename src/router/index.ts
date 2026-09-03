import { createRouter, createWebHashHistory } from 'vue-router'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/welcome', name: 'welcome', component: () => import('@/views/WelcomeView.vue') },
    { path: '/create', name: 'create', component: () => import('@/views/CreateView.vue') },
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/cultivation', name: 'cultivation', component: () => import('@/views/CultivationView.vue') },
    { path: '/adventure', name: 'adventure', component: () => import('@/views/AdventureView.vue') },
    { path: '/inventory', name: 'inventory', component: () => import('@/views/InventoryView.vue') },
    { path: '/character', name: 'character', component: () => import('@/views/CharacterView.vue') },
    { path: '/celestial', name: 'celestial', component: () => import('@/views/CelestialView.vue') },
    { path: '/souls', name: 'souls', component: () => import('@/views/SoulsView.vue') },
    { path: '/collection', name: 'collection', component: () => import('@/views/CollectionView.vue') },
    { path: '/build', name: 'build', component: () => import('@/views/BuildView.vue') },
    { path: '/titles', name: 'titles', component: () => import('@/views/TitlesView.vue') },
    { path: '/legacy', name: 'legacy', component: () => import('@/views/LegacyView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ]
})

router.beforeEach(to => {
  const game = useGameStore()
  // 已有存档:欢迎页与建号页都不再展示,直接进游戏
  if (game.started) {
    if (to.name === 'welcome' || to.name === 'create') return { name: 'home' }
    return true
  }
  // 无存档:未同意隐私先到欢迎页,同意后可进建号页
  const settings = useSettingsStore()
  if (to.name === 'welcome') return true
  if (to.name === 'create') return settings.privacyAccepted ? true : { name: 'welcome' }
  return { name: 'welcome' }
})
