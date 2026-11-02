/* eslint-disable no-console -- 分层审计的产出是给人看的清单 */
/**
 * 界面分层审计:全屏浮层只出自 BaseModal(dialog 语义、焦点陷阱、控件尺子都挂在它上面)。
 * 故障注入:把 EnlightenmentModal 改回自己铺浮层 / 删掉某个 title / 删掉 @close,对应用例红。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.vue$/.test(entry)) out.push(full)
  }
  return out
}

const FILES = walk(SRC)
  .filter(f => f.includes(`${join('src', 'components')}`) || f.includes(`${join('src', 'views')}`))
  .map(f => ({
    path: relative(SRC, f).replace(/\\/g, '/'),
    // 剥掉注释,判据只看代码
    src: readFileSync(f, 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
  }))

const BASE_MODAL = 'components/common/BaseModal.vue'

describe('界面分层 · 浮层只有一个出处', () => {
  it('自己铺满屏又带可点控件的浮层,必须走 BaseModal', () => {
    const offenders = FILES.filter(f => f.path !== BASE_MODAL)
      .filter(f => /fixed inset-0/.test(f.src) && /<button/.test(f.src))
      .map(f => f.path)
    console.log(`\n全屏浮层出处:${BASE_MODAL}${offenders.length ? ` + 越界的 ${offenders.length} 个` : ''}`)
    expect(
      offenders,
      '这些文件自己铺了全屏浮层 —— 会一并退出 dialog 语义、焦点陷阱与控件尺子;改用 BaseModal,或说明为何它必须自己铺'
    ).toEqual([])
  })

  it('每个弹窗都有可辨识的名字 —— 读屏要念得出是哪一扇', () => {
    const nameless: string[] = []
    for (const f of FILES) {
      for (const m of f.src.matchAll(/<BaseModal\b[^>]*>/g)) {
        const tag = m[0]
        const title = /(?<![:\w-])title="([^"]*)"/.exec(tag)?.[1]
        const boundTitle = /:title="([^"]*)"/.exec(tag)?.[1]
        const aria = /aria-label="([^"]*)"/.exec(tag)?.[1]
        if (title !== undefined && title.trim() !== '') continue
        if (boundTitle !== undefined && boundTitle.trim() !== '' && !/^\s*(['"])\1?\s*$/.test(boundTitle)) continue
        if (aria !== undefined && aria.trim() !== '') continue
        nameless.push(`${f.path} → ${tag.slice(0, 60)}`)
      }
    }
    expect(nameless, '这些弹窗没有名字 —— role=dialog 读出来是光秃秃一句「对话框」').toEqual([])
  })

  it('每个弹窗都关得掉 —— 关闭键挂上去必须有人接', () => {
    const stuck: string[] = []
    for (const f of FILES) {
      for (const m of f.src.matchAll(/<BaseModal\b[^>]*>/g)) {
        const tag = m[0]
        if (/@close=/.test(tag)) continue
        if (/:closable="false"/.test(tag)) continue
        stuck.push(`${f.path} → ${tag.slice(0, 60)}`)
      }
    }
    expect(stuck, '这些弹窗既没有 @close 也没写明 :closable="false" —— 关闭键与 Esc 都会静默失效').toEqual([])
  })

  it('视图里不许裸 back() —— 冷启动时它会把人送出游戏', () => {
    // 冷启动(书签 / deep link / PWA 恢复路由)时 history.state.back 为 null,裸 back() 退到 about:blank
    const offenders = FILES.filter(f => /\.back\(\)/.test(f.src))
      .map(f => f.path)
    expect(offenders, '这些视图直接调了 back() —— 改用 @/router/goBack 的 goBack(router, 父页)').toEqual([])
  })

  it('派活说明不许只挂 hover —— 手机上没有 hover,那是谁也看不见的死提示', () => {
    // 故障注入:把 tapTask 改回 dispatcher、或把说明改回 :title → 红。
    const f = FILES.find(x => x.path === 'views/ApprenticeView.vue')
    expect(f, 'ApprenticeView 不见了').toBeDefined()
    const src = f!.src
    expect(src, '派活说明不许再挂 :title').not.toContain(':title="t.desc"')
    expect(src, '说明要能点开').toContain('@click="tapTask(a.uid, t.spec)"')
    expect(src, '读屏要报展开态').toContain(':aria-expanded="taskTap === `${a.uid}:${t.spec}`"')
    expect(src, '再点同枚才派出').toContain('dispatcher(uid, spec)')
    expect(src, '等级来源要摊明:每完工一趟升一层').toContain('每完工一趟升一层')
    expect(src, '封顶要读真实常量,不许另写死数字').toContain('{{ APPRENTICE_MAX_LEVEL }}')
  })

  it('白费/未达门槛要置灰 —— 丹药顶满、兵解未达境,不许点了才 toast', () => {
    // 丹药详情与修行速服同读 buffOverflowOf 判据
    const inv = FILES.find(f => f.path === 'views/InventoryView.vue')
    expect(inv, 'InventoryView 不见了').toBeDefined()
    expect(inv!.src, '丹药顶满要置灰(判据 currentPillOverflow)').toContain(
      ':disabled="currentPillOverflow === \'full\'"'
    )
    expect(inv!.src, '丹药顶满拦因要就地摊').toContain("text: '药力已顶满'")
    expect(inv!.src, '顶满判据要随游戏时钟刷新').toContain('const now = useNow()')
    expect(inv!.src, '顶满判据不得读暂停仍走的墙钟').not.toContain('useWallNow')
    expect(inv!.src, '顶满判据读 now.value,不读一次性 Date.now()').toContain(
      'buffOverflowOf(cultivation.buffs, def.buffId, now.value)'
    )
    const cultivation = FILES.find(f => f.path === 'views/CultivationView.vue')
    expect(cultivation, 'CultivationView 不见了').toBeDefined()
    expect(cultivation!.src, '修行速服顶满要置灰').toContain(':disabled="p.overflow === \'full\'"')
    expect(cultivation!.src, '修行速服要报出「已顶」').toContain("p.overflow === 'full' ? '已顶' : '服用'")
    expect(cultivation!.src, '修行速服判据读同一把游戏时钟').toContain(
      'buffOverflowOf(cultivation.buffs, def.buffId, now.value)'
    )
    const rebirth = FILES.find(f => f.path === 'components/character/RebirthDialog.vue')
    expect(rebirth, 'RebirthDialog 不见了').toBeDefined()
    expect(rebirth!.src, '兵解未达境要置灰(canRebirth)').toContain(':disabled="!canRebirth"')
    expect(rebirth!.src, '兵解置灰要列门槛境名,不许只有定性').toContain('兵解需${REALMS[MANUAL_REBIRTH_MIN_MAJOR]?.name')
  })

  it('问卦与点化付不起就置灰列差 —— 缺哪样、直说,不许点了才弹', () => {
    // 防御臂仍在 core。故障注入:把 :disabled 改回只看「卦在身」/删掉点化 disabled → 本条红。
    const codex = FILES.find(f => f.path === 'views/RealmCodexView.vue')
    expect(codex, 'RealmCodexView 不见了').toBeDefined()
    expect(codex!.src, '问卦置灰要合成「卦在身或不足」').toContain(':disabled="askDisabled"')
    expect(codex!.src, '问卦差额与置灰同源').toContain('const askShort = computed(')
    expect(codex!.src, '问卦按钮要直说差几枚悟道').toContain('悟道点尚差 ${askShort.value}')
    expect(codex!.src, '点化付不起要置灰(已显化那枚仍保留)').toContain(
      ':disabled="player.fateFocus !== s.id && focusShort > 0"'
    )
    expect(codex!.src, '点化差额要走指数感知减法').toContain('subClamp(focusCost, resources.spiritStone)')
    expect(codex!.src, '点化按钮要直说差多少灵石').toContain('灵石尚差 ${formatGap(focusShortGN)}')
  })

  it('到期倒计时按 1 秒游戏钟走,不借 5 秒修行心跳', () => {
    // 故障注入:把 BreakthroughCard 的 breakthroughInfo(now.value) 改回无参调用,
    // 或把 RealmCodexView 的 useNow/formatCountdown 拆回 totalPlaySec 手算 → 本条红。
    const breakthrough = FILES.find(f => f.path === 'components/cultivation/BreakthroughCard.vue')
    expect(breakthrough, 'BreakthroughCard 不见了').toBeDefined()
    expect(breakthrough!.src, '突破准备要读每秒游戏钟').toContain('const now = useNow()')
    expect(breakthrough!.src, '突破准备状态要接收当前时刻').toContain('breakthroughInfo(now.value)')

    const codex = FILES.find(f => f.path === 'views/RealmCodexView.vue')
    expect(codex, 'RealmCodexView 不见了').toBeDefined()
    expect(codex!.src, '在身之卦要读每秒游戏钟').toContain('const now = useNow()')
    expect(codex!.src, '卦象到期与服务端共用同一判据').toContain('divinationActiveAt(player.divination, now.value)')
    expect(codex!.src, '卦象倒计时要走定宽格式').toContain('formatCountdown(')
    expect(codex!.src, '卦象倒计时不得再借修行时长刷新').not.toContain('game.totalPlaySec')
  })

  it('存档导入读取失败要当场回执 —— 两处入口同一条退路', () => {
    const RECEIPT = "ui.toast('文件无法读取', 'warn')"
    for (const path of ['views/WelcomeView.vue', 'components/settings/SettingsSaveSection.vue']) {
      const f = FILES.find(x => x.path === path)
      expect(f, `${path} 不见了`).toBeDefined()
      const src = f!.src
      const readAt = src.indexOf('readSaveFile(file')
      const receiptAt = src.indexOf(RECEIPT, readAt)
      expect(receiptAt, `${path} 读文件失败会静默`).toBeGreaterThan(-1)
      expect(readAt, `${path} 导入读取要走可撤销句柄`).toBeGreaterThan(-1)
      expect(receiptAt, `${path} 失败回执要挂在读取句柄的 error 回调里`).toBeGreaterThan(readAt)
      expect(src, `${path} 离页要撤销读取句柄`).toContain('saveRead?.abort()')
      expect(src, `${path} 离页后回调不许再暂停引擎`).toContain('if (unmounted) return')
    }
  })

  it('首页法球的断点监听随组件卸载 —— 重进首页不许累积闭包', () => {
    const f = FILES.find(x => x.path === 'views/HomeView.vue')
    expect(f, 'HomeView 不见了').toBeDefined()
    const src = f!.src
    expect(src, '断点监听要留名,匿名回调卸不掉').toContain(
      "orbMq.addEventListener('change', onOrbMqChange)"
    )
    expect(src, '离页要解绑同一条回调').toContain(
      "orbMq.removeEventListener('change', onOrbMqChange)"
    )
    expect(src, '解绑挂在卸载钩子上').toMatch(
      /onUnmounted\(\(\) => orbMq\.removeEventListener\('change', onOrbMqChange\)\)/
    )
  })

  it('事件叙事掷骰归属「这一件事」—— 不许组件级锁死,也不许在 computed 里重掷', () => {
    const f = FILES.find(x => x.path === 'components/adventure/EventDialog.vue')
    expect(f, 'EventDialog 不见了').toBeDefined()
    const src = f!.src
    expect(src, '叙事要由事件 id 变化时重掷').toContain(
      'rollEventNarrative(id, def.title, adventure.eventMemories, () => rng.float(0, 1))'
    )
    expect(src, '重渲染只读快照').toContain('narrative.echo')
    expect(src, '组件级 echoRolled 会跨事件锁死').not.toContain('echoRolled')
    expect(src, '余波不许在组件里另算').not.toContain('shouldTriggerAftermath')
    expect(src, '叙事不许在组件里另算').not.toContain('aftermathText')
  })

  it('Esc 层级收在全站单栈 —— 每个弹窗各持一份会把两层一起关掉', () => {
    const f = FILES.find(x => x.path === BASE_MODAL)
    expect(f, 'BaseModal 不见了').toBeDefined()
    const src = f!.src
    expect(src, 'Esc 栈要交给模块级 useModalStack').toContain("from '@/composables/useModalStack'")
    expect(src, '打开时压入全站栈').toContain('pushModal(entry)')
    expect(src, '关闭时摘除').toContain('removeModal(entry)')
    expect(src, '组件作用域不得再持有一份 activeModals').not.toContain('const activeModals')
    expect(src, '不得每实例各挂一份 window keydown').not.toContain("window.addEventListener('keydown', onWindowKey)")
  })

  it('弹窗叠放跟 Esc 栈走 —— 按挂载先后叠,后弹出的际遇、顿悟会被页内弹窗盖住', () => {
    const f = FILES.find(x => x.path === BASE_MODAL)
    expect(f, 'BaseModal 不见了').toBeDefined()
    const src = f!.src
    expect(src, '叠放次序取自全站栈').toContain('stackedZ(entry)')
    expect(src, '不许按档位写死 z 类').not.toMatch(/'z-(50|60|70)'/)
  })

  it('战斗回放派生的计时与逐帧任务随离页撤销 —— 不向已销毁组件回写', () => {
    const f = FILES.find(x => x.path === 'components/adventure/CombatPanel.vue')
    expect(f, 'CombatPanel 不见了').toBeDefined()
    const src = f!.src
    expect(src, '浮字计时与逐帧任务要收进可撤销集合').toContain('pendingTimers')
    expect(src, '逐帧任务要收进可撤销集合').toContain('pendingFrames')
    expect(src, '收表时撤销浮字计时').toContain('clearTimeout(timer)')
    expect(src, '收表时撤销逐帧任务').toContain('cancelAnimationFrame(frame)')
    expect(src, '浮字回调要经登记出口').toContain('scheduleFloatRemoval(id)')
    expect(src, '滚动与震颤要经登记出口').toContain('nextFrame(() => {')
    expect(src, '回放回调里不许裸起 setTimeout').not.toMatch(/playTimer = gameClock\([\s\S]*?\n\s*setTimeout\(/)
    expect(src, '回放回调里不许裸起 requestAnimationFrame').not.toMatch(
      /playTimer = gameClock\([\s\S]*?\n\s*requestAnimationFrame\(/
    )
  })
})

/**
 * 块级空态只有一个出处:`.empty-note`(两端透明收笔的淡墨短横);`.empty-seal` 是单字哑印,另一档。
 * 故障注入:摘掉任一处的 empty-note,或把渐变改成实心 —— 红。
 */
describe('界面分层 · 块级空态只有一个出处', () => {
  const STYLE = readFileSync(resolve(SRC, 'style.css'), 'utf8')
  /** 空态短横的样式块(到下一个顶层规则为止) */
  const NOTE_BLOCK = /\.empty-note::before\s*\{([\s\S]*?)\n\}/.exec(STYLE)?.[1] ?? ''

  it('.empty-note 的短横是两端收笔的淡墨线,不是一条实心分隔', () => {
    expect(NOTE_BLOCK, 'style.css 里找不到 .empty-note::before').not.toBe('')
    expect(NOTE_BLOCK, '短横要走墨的透明度,不写裸 hex').toContain('rgb(var(--color-ink-rgb) /')
    expect(NOTE_BLOCK, '两端须透明收笔,齐口的线读作分隔符').toContain('linear-gradient')
    expect(NOTE_BLOCK, '两头透明才叫收笔').toContain('transparent')
    expect(NOTE_BLOCK).toMatch(/height:\s*1px/)
    expect(NOTE_BLOCK).toMatch(/width:\s*34px/)
  })

  it('已知的块级空态都挂上了 empty-note', () => {
    const SITES: [string, string][] = [
      ['views/BuildView.vue', '未成流派'],
      ['views/BuildView.vue', '暂无快照'],
      ['views/MortalWorldView.vue', '此世未成'],
      ['components/adventure/SecretRealmCard.vue', '暂无秘境']
    ]
    const missing: string[] = []
    for (const [path, phrase] of SITES) {
      const f = FILES.find(x => x.path === path)
      if (!f) {
        missing.push(`${path} → 文件不见了`)
        continue
      }
      // 空态段落 v-else / v-if 两种写法都算
      const tag = [...f.src.matchAll(/<p\b[^>]*>/g)].find(m => {
        const after = f.src.slice(m.index! + m[0].length, m.index! + m[0].length + 120)
        return /\bv-(?:else|if)\b/.test(m[0]) && after.includes(phrase)
      })
      if (!tag) missing.push(`${path} → 找不到「${phrase}」那个空态段落`)
      else if (!/class="[^"]*\bempty-note\b/.test(tag[0])) missing.push(`${path} → 「${phrase}」还裸写着淡字`)
    }
    expect(missing, '这些块级空态没收进 .empty-note —— 短横是块级空态的唯一出处').toEqual([])
  })

  /**
   * 另一档:`.empty-seal` 单字哑印,用于「这一册还没有东西」。
   *
   * 背包四册的空态原先只有一行灰字,而且三处位置各不相同(mt-8 / mt-10 / mt-16);
   * 同为零件的名号册、灵兽册早有哑印 + 楷体标签。这不是文案问题 ——
   * 「暂无藏品」本身就是规范点名的状态词,缺的是那一档视觉。
   * 故障注入:把任一处改回裸淡字,本条红。
   */
  it('册页级空态挂 empty-seal(哑印),与名号/灵兽册同一套', () => {
    const SITES: [string, string][] = [
      ['views/InventoryView.vue', '暂无藏品'],
      ['views/InventoryView.vue', '暂无丹药'],
      ['components/inventory/ArtifactPanel.vue', '暂无法宝'],
      ['views/TitlesView.vue', '暂无灵兽']
    ]
    const missing: string[] = []
    for (const [path, phrase] of SITES) {
      const f = FILES.find(x => x.path === path)
      if (!f) {
        missing.push(`${path} → 文件不见了`)
        continue
      }
      const tag = [...f.src.matchAll(/<p\b[^>]*>/g)].find(m => {
        const after = f.src.slice(m.index! + m[0].length, m.index! + m[0].length + 260)
        return /\bv-(?:else|if)\b/.test(m[0]) && after.includes(phrase)
      })
      if (!tag) missing.push(`${path} → 找不到「${phrase}」那个空态段落`)
      else {
        const block = f.src.slice(tag.index!, tag.index! + 320)
        if (!block.includes('empty-seal')) missing.push(`${path} → 「${phrase}」还是裸淡字,没挂哑印`)
      }
    }
    expect(missing, '这些册页级空态没有哑印 —— 这一册还没有东西,要给得出「空」的形状').toEqual([])
  })
})

/**
 * 法宝换件的让位名单须在 inventory.toggleArtifact 之前取(它会改写 equippedArtifacts)。
 * 判据只在 toggleArtifact 函数体内比先后:整文件 indexOf 会先撞上 artifactRows 里的同一调用,恒真。
 * 故障注入:把 ArtifactPanel 那两行的先后调换,本条必红。
 */
describe('界面分层 · 换件提示的让位名单取在动手之前', () => {
  const PANEL = resolve(SRC, 'components/inventory/ArtifactPanel.vue')

  it('toggleArtifact 函数体里,取名单写在换件之前', () => {
    const src = readFileSync(PANEL, 'utf8')
    const start = src.indexOf('function toggleArtifact(defId: string): void {')
    expect(start, 'ArtifactPanel 里找不到 toggleArtifact —— 判据失效了').toBeGreaterThan(-1)
    // 按花括号配平圈出函数体
    const open = src.indexOf('{', start)
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const body = src.slice(open, end)
    expect(body.length, '没圈出 toggleArtifact 的函数体').toBeGreaterThan(20)

    const evictAt = body.indexOf('artifactEvictedBy(inventory.equippedArtifacts')
    const toggleAt = body.indexOf('inventory.toggleArtifact(defId')
    expect(evictAt, 'toggleArtifact 里没有取让位名单 —— toast 只能念空名单').toBeGreaterThan(-1)
    expect(toggleAt, 'toggleArtifact 里没有真的换件').toBeGreaterThan(-1)
    expect(
      evictAt,
      '让位名单取在了换件之后 —— toast 会念刚戴上来的那一件,而不是真正让位的那一件'
    ).toBeLessThan(toggleAt)
  })

  /**
   * 祭炼与收回是同一颗钮,没有回执就看不出点成哪一种 ——
   * 原先只处理了 `replaced`,正常祭炼与收回都静默生效。
   * 称号的佩/卸、灵兽的唤来/暂别、行囊的一键换装都有回执,此处补齐同一套。
   * 故障注入:删掉 else-if 那一支,本条红。
   */
  it('祭炼与收回都报回执,不只报「替下」那一种', () => {
    const src = readFileSync(PANEL, 'utf8')
    const start = src.indexOf('function toggleArtifact(defId: string): void {')
    expect(start).toBeGreaterThan(-1)
    const open = src.indexOf('{', start)
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    const body = src.slice(open, end)
    expect(body, '正常祭炼没有回执').toContain("result === 'equipped'")
    expect(body, '收回没有回执').toContain("result === 'unequipped'")
    expect(body, '回执文案应走 ui/inventoryText(不在组件里手拼)').toContain('artifactToggleToast(')
  })
})

/**
 * 模板里的大写标签须在本文件 script 里出现(import / `components:` / `defineAsyncComponent` 任一写法)。
 * vue-tsc 与 eslint 都不查模板里的未注册标签,Vue 将其原样渲染成空元素,不抛错。
 * 故障注入:删掉 ArtifactPanel 的 `import GameIcon` → 本条红并点名 GameIcon。
 */
describe('界面分层 · 模板用到的组件必须在本文件里有来路', () => {
  /** 免 import 的组件:Vue 内置与 vue-router 全局组件(main.ts 注册);自有组件不得加入 */
  const BUILTIN = new Set([
    'Transition',
    'TransitionGroup',
    'Teleport',
    'KeepAlive',
    'Suspense',
    'Component',
    'RouterLink',
    'RouterView'
  ])

  it('模板里的每个大写标签都能在本文件的 script 里找到', () => {
    const missing: string[] = []
    for (const f of FILES) {
      // 标签只从模板取,不拿 script 自证
      const scriptAt = f.src.indexOf('<script')
      if (scriptAt < 0) continue
      const template = f.src.slice(0, scriptAt)
      const script = f.src.slice(scriptAt)
      const used = new Set([...template.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map(m => m[1]!))
      for (const name of used) {
        if (BUILTIN.has(name)) continue
        if (new RegExp(`\\b${name}\\b`).test(script)) continue
        missing.push(`${f.path} → <${name}>`)
      }
    }
    expect(
      missing,
      '这些模板标签在本文件里没有来路 —— 未注册组件会被原样渲染成一个空标签(图标/标签整块消失),且不抛错'
    ).toEqual([])
  })

  it('判据自家不是空转:名单里的全局组件确实不许写进 import,是自有组件就必须写', () => {
    // 阳性对照:用到 GameIcon 的文件须有 import 语句,而非碰巧撞上同名标识符
    const iconUsers = FILES.filter(f => /<GameIcon\b/.test(f.src))
    expect(iconUsers.length, '全仓一处 <GameIcon> 都没有,说明 glob 或解析坏了').toBeGreaterThan(5)
    const rawImportMissing = iconUsers
      .filter(f => !/import\s+GameIcon\s+from/.test(f.src))
      .map(f => f.path)
    expect(rawImportMissing, '这些文件用了 GameIcon 却没有 import 语句').toEqual([])
  })
})

/**
 * 动态状态区须对读屏可播报。
 * toast 是「存档写入失败」「导出失败」「行囊已满」这类关键状态的唯一通道,
 * 原模板上没有任何 aria-live / role=status,读屏用户完全听不到 —— 而这些恰恰是必须知道的。
 * 故障注入:把 ToastHost 上的 role/aria-live 删掉,本条红。
 */
describe('可访问性 · 状态播报', () => {
  it('ToastHost 挂 role=status 且 aria-live,逐条播报', () => {
    const host = readFileSync(resolve(SRC, 'components/common/ToastHost.vue'), 'utf-8')
    expect(host, 'toast 容器没有 role=status:读屏不会播报').toMatch(/role="status"/)
    expect(host, 'toast 容器没有 aria-live:读屏不会播报').toMatch(/aria-live="polite"/)
    // 逐条播报:合并成一句会把同帧多条提示念成一坨
    expect(host, 'aria-atomic 应为 false,否则整批提示被拼成一句重复念').toMatch(/aria-atomic="false"/)
    // toast 会自己消失(2.6s),进 Tab 序会让键盘焦点落到一条随时没影的元素上
    expect(host, 'toast 按钮不该进 Tab 序:键盘焦点会落到一条即将消失的元素上').toMatch(/tabindex="-1"/)
  })

  /**
   * PWA 更新横幅的触控尺子。
   *
   * 它只在 Service Worker 装上新版本后出现 —— `layout-check` 的巡页摸不到,
   * `ui-smoke` 也不会触发,是唯一一块「没人量过」的界面。
   * 实测修前「重新加载」盒高 24.5px、关闭钮 21.4×32px,都低于 28px 触控线。
   * 判据取静态类名(py / h-w),不依赖运行时。
   */
  /**
   * 横幅不能变成遮罩。
   *
   * 外层是 `inset-0` 的 flex,`align-items` 缺省为 `stretch` —— 内层卡片会被拉满整屏。
   * 实测修前 390×844 下卡片 788px 高、`pointer-events-auto`,整页点不动;
   * 它却只在 SW 更新后出现,巡页与 layout-check 都永远看不到。
   * 判据:外层必须写 `items-start`,且内层不得再写 `h-full` 之类的拉伸。
   */
  it('PWA 更新横幅只占一行,不铺满整屏吞掉点击', () => {
    const src = readFileSync(resolve(SRC, 'components/common/UpdatePrompt.vue'), 'utf-8')
    const outer = /<div v-if="ui\.pwaUpdatePending"[^>]*class="([^"]*)"/.exec(src)?.[1] ?? ''
    expect(outer, '找不到横幅外层').not.toBe('')
    expect(outer, '外层缺 items-start,align-items 缺省 stretch 会把卡片拉满整屏').toContain('items-start')
    // class 写在 role 之前(多行标签),两段分别取再合看
    const cardTag = /<div\s+class="[^"]*"\s+role="status"/.exec(src)?.[0] ?? ''
    expect(cardTag, '找不到横幅卡片').not.toBe('')
    expect(cardTag, '卡片不该自己再撑高').not.toContain('h-full')
  })

  it('PWA 更新横幅的两颗钮都过 28px 触控线', () => {
    const src = readFileSync(resolve(SRC, 'components/common/UpdatePrompt.vue'), 'utf-8')
    // 只看按钮标签本身:注释里写着「不可降回 !py-1」,整文件正则会把那句也算进来
    const reload = /<button\b[^>]*>\s*重新加载/.exec(src)?.[0] ?? ''
    expect(reload, '找不到「重新加载」那颗钮').not.toBe('')
    // 11px 字 + !py-1 只有 24.5px;!py-1.5 是 28.5px
    expect(reload, '「重新加载」的竖向 padding 低于 28px 触控线').toContain('!py-1.5')
    const close = /<button\b[^>]*aria-label="关闭"[^>]*>/.exec(src)?.[0] ?? ''
    expect(close, '找不到关闭钮').not.toBe('')
    expect(close, '关闭钮须给 28px 见方的触面').toContain('h-7 w-7')
  })

  it('其它动态区已有播报的不许回退', () => {
    const anchors: Array<[string, RegExp]> = [
      ['src/components/common/SpiritRootReveal.vue', /role="status"/],
      ['src/components/common/UpdatePrompt.vue', /role="status"/],
      ['src/components/cultivation/EnlightenmentModal.vue', /aria-live="polite"/]
    ]
    for (const [file, pat] of anchors) {
      const src = readFileSync(resolve(SRC, file.replace('src/', '')), 'utf-8')
      expect(pat.test(src), `${file} 的读屏播报被删了`).toBe(true)
    }
  })
})

/**
 * 表单控件须有可访问名:要么被 <label> 包着,要么自己带 aria-label / placeholder。
 * 实测漏过 AutoReforgePanel 的 range 与 number 两个输入 —— 读屏只念「滑块」「数字输入框」,
 * 玩家不知道在调哪个词条的下限、也不知道那是洗炼次数。
 * 隐藏的 input[type=file] 不算:它由同名按钮触发,本身不进焦点序。
 * 故障注入:删掉任一 aria-label,本条红。
 */
describe('可访问性 · 表单控件有名字', () => {
  it('每个非隐藏表单控件都能被读屏叫出名字', () => {
    const nameless: string[] = []
    for (const f of FILES) {
      // 被 <label> 包住的控件已有名字
      const labeled = new Set<string>()
      for (const m of f.src.matchAll(/<label\b[\s\S]*?<\/label>/g)) {
        for (const im of m[0].matchAll(/<input\b[^>]*>/g)) labeled.add(im[0])
      }
      for (const m of f.src.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)) {
        const tag = m[0]
        if (tag.includes('type="file"')) continue
        if (/aria-label|aria-labelledby|placeholder|\bhidden\b/.test(tag)) continue
        if (labeled.has(tag)) continue
        nameless.push(`${f.path} → ${tag.replace(/\s+/g, ' ').slice(0, 70)}`)
      }
    }
    expect(nameless, '这些表单控件没有可访问名:读屏只念得出控件类型').toEqual([])
  })
})

/**
 * 图标是装饰,不该进读屏的事件流。
 * GameIcon 被引 111 处,lucide 生成的 <svg> 默认无 aria-hidden —— 若在每处补,漏一处就多一段噪音;
 * 收在 GameIcon 一处,新增用法自动继承。
 * 故障注入:删掉 GameIcon 上的 aria-hidden,本条红。
 */
describe('可访问性 · 装饰图标不进读屏', () => {
  it('GameIcon 统一 aria-hidden 且不进焦点序', () => {
    const icon = readFileSync(resolve(SRC, 'components/common/GameIcon.vue'), 'utf-8')
    expect(icon, 'GameIcon 没挂 aria-hidden:读屏会把每个图标念一遍').toMatch(/aria-hidden="true"/)
    expect(icon, 'SVG 在旧 Edge/IE 下会进 Tab 序,须 focusable="false"').toMatch(/focusable="false"/)
  })

  it('装饰性内联 SVG/符号也不进读屏', () => {
    // 抽查几处纯装饰元素:已有 aria-hidden 的不许回退
    const decor: Array<[string, RegExp]> = [
      ['src/components/common/BaseModal.vue', /class="modal-edge[^"]*" aria-hidden="true"/],
      ['src/components/celestial/MarksPanel.vue', /class="empty-seal" aria-hidden="true"/]
    ]
    for (const [file, pat] of decor) {
      const src = readFileSync(resolve(SRC, file.replace('src/', '')), 'utf-8')
      expect(pat.test(src), `${file} 的装饰元素丢了 aria-hidden`).toBe(true)
    }
  })
})

/**
 * 切页后焦点要回到内容区。
 * 不挪焦点:旧页那个链接已不在 DOM,浏览器把焦点甩回 body,下一次 Tab 从文档头重新数,
 * 读屏也不播报换页。main 上的 tabindex=-1 让它可编程聚焦、但不进 Tab 序。
 * 故障注入:删掉 main 的 tabindex 或 resetScroll 里的 focus(),本条红。
 */
describe('可访问性 · 切页后焦点回到内容区', () => {
  it('main 可编程聚焦,且切页时调用 focus', () => {
    const app = readFileSync(resolve(SRC, 'App.vue'), 'utf-8')
    expect(app, 'main 缺 tabindex=-1:无法用脚本把焦点移过去').toMatch(/<main\b[^>]*tabindex="-1"/)
    expect(app, '切页时没有把焦点移到内容区:键盘/读屏焦点会掉回 body').toMatch(/scrollHost\.value\?\.focus\(/)
    // 须挂 after-enter:out-in 下 beforeEnter 时旧页仍在离场、新页未插入,此刻 focus() 会被离场收尾抢回
    expect(app, '焦点须挂在 @after-enter:挂 before-enter 会被 out-in 的离场收尾抢回').toMatch(/@after-enter="focusContent"/)
    // preventScroll 必须给:否则浏览器会为「滚动到该元素」再算一次,和手动 scrollTop=0 打架
    expect(app, 'focus 缺 preventScroll,会和 scrollTop=0 打架').toMatch(/focus\(\{\s*preventScroll:\s*true\s*\}\)/)
  })
})

/**
 * 进程被终结前的最后一步必须是显式刷盘。
 * 落盘有 SAVE_FLUSH_MS(5 秒)节流,排队中的整批进度要等定时器;exitApp()/进程退出一执行,
 * 排队的就没了。等微任务(nextTick)等不到 setTimeout。
 * 故障注入:去掉 ExitConfirmDialog 里的 flushSaveWrites(),本条红。
 */
describe('存档 · 退出前须刷盘', () => {
  it('安卓返回键退出确认:exitApp 之前先 flushSaveWrites', () => {
    const src = readFileSync(resolve(SRC, 'components/common/ExitConfirmDialog.vue'), 'utf-8')
    // 取整个 confirm 函数体:从函数头到下一个顶层函数(onMounted)
    const from = src.indexOf('async function confirm')
    const confirmBody = src.slice(from, src.indexOf('onMounted', from))
    // 只认真正的调用点:注释里也提到过这两个名字,须排除
    const calls = (name: string): number => {
      for (const m of confirmBody.matchAll(new RegExp(`^\\s*${name}`, 'gm'))) return m.index ?? -1
      return -1
    }
    const flushAt = calls('flushSaveWrites\\(\\)')
    const exitAt = calls('await CapacitorApp\\.exitApp')
    expect(flushAt, 'confirm() 里没有 flushSaveWrites:排队的进度会随进程退出丢掉').toBeGreaterThan(-1)
    expect(exitAt, 'confirm() 里找不到 exitApp()').toBeGreaterThan(-1)
    expect(flushAt, 'flushSaveWrites 必须排在 exitApp 之前').toBeLessThan(exitAt)
  })

  it('引擎停止时同样先刷盘再停', () => {
    const src = readFileSync(resolve(SRC, 'core/engine.ts'), 'utf-8')
    expect(src, 'engine 停止路径没有刷盘').toMatch(/flushSaveWrites\(\)/)
  })
})
