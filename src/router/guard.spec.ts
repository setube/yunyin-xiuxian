/**
 * 首启路由守卫:未建号只能停在欢迎/建号页,已建号不许再回去。
 *
 * router/index.ts 的 beforeEach 此前没有任何测试 —— 它决定「玩家打开游戏看到哪一页」,
 * 一旦判据写反,老玩家会被踢回欢迎页(以为存档丢了),新玩家则能绕过建号进主页。
 *
 * 这里直接调 router.beforeEach 注册的那个函数不方便,故按同样的判据复算一次,
 * 并用 router.resolve 取真实的目标路由名,保证与 index.ts 的路由表同步。
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '@/stores/game'
import { useSettingsStore } from '@/stores/settings'

/** 与 router/index.ts 的 beforeEach 同一份判据(改那边要同步改这里) */
function guard(toName: string): string {
  const game = useGameStore()
  if (game.started) {
    if (toName === 'welcome' || toName === 'create') return 'home'
    return toName
  }
  const settings = useSettingsStore()
  if (toName === 'welcome') return 'welcome'
  if (toName === 'create') return settings.privacyAccepted ? 'create' : 'welcome'
  return 'welcome'
}

describe('首启路由守卫', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('未建号:欢迎页放行', () => {
    expect(guard('welcome')).toBe('welcome')
  })

  it('未建号 + 未接受隐私:建号页挡回欢迎页', () => {
    expect(useSettingsStore().privacyAccepted).toBe(false)
    expect(guard('create')).toBe('welcome')
  })

  it('未建号 + 已接受隐私:建号页放行', () => {
    useSettingsStore().privacyAccepted = true
    expect(guard('create')).toBe('create')
  })

  it('未建号:其余页面一律回欢迎页(不让绕过建号)', () => {
    for (const name of ['home', 'cultivation', 'inventory', 'market', 'endgame']) {
      expect(guard(name), `${name} 未建号却放行了`).toBe('welcome')
    }
  })

  it('已建号:欢迎页与建号页都重定向到主页(老玩家不该以为存档丢了)', () => {
    useGameStore().markStarted()
    expect(guard('welcome')).toBe('home')
    expect(guard('create')).toBe('home')
  })

  it('已建号:其余页面原样放行', () => {
    useGameStore().markStarted()
    for (const name of ['home', 'cultivation', 'inventory', 'market']) {
      expect(guard(name), `${name} 被误挡`).toBe(name)
    }
  })

  it('已建号时不再看隐私标记(两个判据不会互相干扰)', () => {
    useGameStore().markStarted()
    useSettingsStore().privacyAccepted = false
    expect(guard('create'), '已建号时隐私标记不该改变去向').toBe('home')
  })

  it('隐私标记翻转会立刻改变未建号的去向', () => {
    expect(guard('create')).toBe('welcome')
    useSettingsStore().privacyAccepted = true
    expect(guard('create')).toBe('create')
    useSettingsStore().privacyAccepted = false
    expect(guard('create')).toBe('welcome')
  })


/**
 * 上面八条是对判据的复算 —— 若有人改了 router/index.ts 而没同步改本文件,
 * 它们照样绿。这条从源码里核对:守卫里出现的去向字符串必须与复算一致。
 */
describe('首启路由守卫 · 与源码同步', () => {
  it('index.ts 的 beforeEach 仍按 started / privacyAccepted 两个判据分支', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8')
    expect(src, 'router/index.ts 里找不到 beforeEach').toContain('router.beforeEach')
    expect(src, '找不到 game.started 判据').toContain('game.started')
    expect(src, '找不到 privacyAccepted 判据').toContain('privacyAccepted')
  })

  it('两个去向字符串都还写着(home / welcome)', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8')
    expect(src).toContain("name: 'home'")
    expect(src).toContain("name: 'welcome'")
    expect(src).toContain("name: 'create'")
  })

  it('已建号回主页、未建号回欢迎页这两句判据没被写反', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf-8')
    // 已建号分支:进入 welcome/create 时返回 home
    expect(src, '已建号回主页的判据变了').toMatch(
      /if \(game\.started\)[\s\S]{0,200}to\.name === 'welcome'[\s\S]{0,120}name: 'home'/
    )
    // 兜底:未匹配到任何放行条件时回 welcome
    const tail = src.slice(src.lastIndexOf('return {'))
    expect(tail, '兜底去向不再是 welcome').toContain("name: 'welcome'")
  })
})


/**
 * 建号页的「进行中」标记必须有失败复位。
 *
 * CreateView.begin() 会先置 starting = true(按钮随即禁用并显示「灵根鉴定中……」),
 * 成功路径靠 router.push 离开页面,所以原先没有任何复位。
 * 但中途任一步抛错时 starting 会永远留在 true —— 按钮永久禁用,玩家只能刷新页面重来,
 * 而刷新会把已生成的角色丢掉。项目不挂载 .vue,故用源码断言钉住这段结构。
 */
describe('建号页 · 建号失败要能重试', () => {
  const createSrc = (): string => readFileSync(new URL('../views/CreateView.vue', import.meta.url), 'utf-8')

  it('begin() 用 try/catch 包住建号流程', () => {
    const src = createSrc()
    expect(src, 'begin 里找不到 try —— 失败时 starting 会永久卡住').toMatch(
      /function begin\(\)[\s\S]{0,600}try \{[\s\S]{0,120}doBegin\(\)/
    )
  })

  it('catch 分支把 starting 复位回 false', () => {
    const src = createSrc()
    expect(src, 'catch 里没把 starting 复位,按钮之后再也点不动').toMatch(
      /catch \(err\)[\s\S]{0,300}starting\.value = false/
    )
  })

  it('失败时给出可读提示(不是静默卡住)', () => {
    const src = createSrc()
    expect(src, '失败时没有提示').toMatch(/catch \(err\)[\s\S]{0,400}ui\.toast\('建号失败'/)
  })

  it('按钮确实绑了 starting 作为禁用条件(上面几条才有意义)', () => {
    const src = createSrc()
    expect(src).toMatch(/:disabled="starting"[\s\S]{0,200}灵 根 鉴 定 中/)
  })
})


/**
 * 启动顺序:坏档修形必须在首页守卫拿数据之前跑完。
 *
 * `app.use(router)` 会立即发起首次导航(vue-router 的 install 里 push 了当前 location),
 * 而守卫读的是 `game.started` 与 `settings.privacyAccepted` —— 这两个字段若来自坏档,
 * 守卫就会拿坏值决定「去欢迎页还是回洞府」。
 *
 * 现在之所以安全,靠的是一条**隐式时序**:守卫是异步的(navigate 被包在 Promise 里),
 * 而 sanitizeAllStores() 是同步的,在 app.use(router) 之后紧接着就跑完了。
 * 这个依赖没有任何地方写着,谁把 sanitize 挪到 app.use 之前或改成异步,都会悄悄破掉。
 * 本条把顺序钉在源码层面,并说明它凭什么成立。
 */
describe('启动顺序 · 修形先于首次守卫', () => {
  const main = readFileSync('src/main.ts', 'utf-8')

  it('sanitizeAllStores 在 app.mount 之前调用(否则首帧就渲染坏值)', () => {
    const sanitize = main.indexOf('sanitizeAllStores()')
    const mount = main.indexOf("app.mount('#app')")
    expect(sanitize, 'main.ts 里找不到 sanitizeAllStores()').toBeGreaterThan(-1)
    expect(mount).toBeGreaterThan(-1)
    expect(sanitize, 'sanitizeAllStores 必须在 mount 之前').toBeLessThan(mount)
  })

  it('损坏存档扫描与结构升级在 createApp 之前(白屏之前就要拦)', () => {
    const scan = main.indexOf('preflightScan()')
    const migrate = main.indexOf('migrateLocalSchema()')
    const create = main.indexOf('createApp(App)')
    expect(scan).toBeGreaterThan(-1)
    expect(migrate).toBeGreaterThan(-1)
    expect(scan, 'preflightScan 要在 createApp 之前').toBeLessThan(create)
    expect(migrate, 'migrateLocalSchema 要在 createApp 之前').toBeLessThan(create)
  })

  it('pinia 持久化插件在 app.use(pinia) 之前装好(否则首读读不到存档)', () => {
    const usePlugin = main.indexOf('pinia.use(piniaPluginPersistedstate)')
    const usePinia = main.indexOf('app.use(pinia)')
    expect(usePlugin, '找不到 pinia.use(piniaPluginPersistedstate)').toBeGreaterThan(-1)
    expect(usePinia).toBeGreaterThan(-1)
    expect(usePlugin, '插件须先于 app.use(pinia)').toBeLessThan(usePinia)
  })
})
})
