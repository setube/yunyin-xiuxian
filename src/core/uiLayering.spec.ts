/* eslint-disable no-console -- 分层审计的产出是给人看的清单 */
/**
 * 界面分层审计 —— 浮层只该有一个出处,弹窗只该有一套契约
 *
 * 由来:两个事件弹窗(悟道顿悟 / 洞府巡游)是自己铺的 `fixed inset-0`。
 * 单看截图看不出问题,代价却有三样:**没有 role=dialog / aria-modal**(读屏不知道
 * 有弹窗开了)、**没有焦点管理**(打开后焦点还在背后的按钮上,Tab 会一路跑出去)、
 * 样式自成一套(font-bold / text-sm / rounded,与本作的水墨设计系统两回事)。
 *
 * 而排版自检那两条尺子(控件要有可访问名、不小于 28px)与弹窗焦点契约都挂在
 * BaseModal 上 —— 自己铺浮层就等于同时退出这三套保障,还不会有人发现。
 *
 * 故这里把「浮层只有一个出处」钉成红线,判据是源码级的:
 *   一 全屏浮层只该出现在 BaseModal 里(自己铺 `fixed inset-0` 又带按钮 = 退出契约);
 *   二 每个弹窗都要有可辨识的名字(title 或 aria-label),读屏才念得出是哪一扇;
 *   三 每个弹窗都要关得掉(@close 有人接,或明写 :closable="false" 说明为何不给关)。
 *
 * 故障注入:把 EnlightenmentModal 改回自己铺浮层 → 第一条红;
 * 把某个 title 删掉 → 第二条红;把 @close 删掉 → 第三条红。
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
    // 注释里会提到这些写法(比如「曾经是自己铺的一层 fixed inset-0」),判据只看真代码
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
      // 逐个取 <BaseModal ...> 开标签
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
    // 判据:站内没有上一页时(书签 / deep link / PWA 冷启动恢复路由),
    // history.state.back 为 null,裸 back() 会退到 about:blank,界面整个消失。
    // 统一走 router/goBack.ts 的 goBack(router, 父页)。
    const offenders = FILES.filter(f => /\.back\(\)/.test(f.src))
      .map(f => f.path)
    expect(offenders, '这些视图直接调了 back() —— 改用 @/router/goBack 的 goBack(router, 父页)').toEqual([])
  })

  it('派活说明不许只挂 hover —— 手机上没有 hover,那是谁也看不见的死提示', () => {
    // 道童派活会把弟子锁走 30~90 分钟,而任务说明此前只写在 :title 上。
    // 现在与适配理由 / 天赋芯片同族:点一下展开一行,再点同枚才真派出(aria-expanded 报给读屏)。
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
    // 同族规:不可行就置灰 + 就地列因,别让点下去才知道。
    // ① 丹药详情「服 用」顶满仍可点,按下就真·白吃一颗;修行快捷卡对同一个
    //    buffOverflowOf 判据置灰「已顶」,两处此前相反。
    // ② 兵解转世未达金丹仍可点,点了才 toast 拦。
    const inv = FILES.find(f => f.path === 'views/InventoryView.vue')
    expect(inv, 'InventoryView 不见了').toBeDefined()
    expect(inv!.src, '丹药顶满要置灰(判据 currentPillOverflow)').toContain(
      ':disabled="currentPillOverflow === \'full\'"'
    )
    expect(inv!.src, '丹药顶满拦因要就地摊(白费)').toContain('药力已顶满——这一颗将白费')
    // 顶满判据读游戏时钟:药效到期后按钮要自己亮回来,暂停时又要与结算一起冻住。
    expect(inv!.src, '顶满判据要随游戏时钟刷新').toContain('const now = useNow()')
    expect(inv!.src, '顶满判据不得读暂停仍走的墙钟').not.toContain('useWallNow')
    expect(inv!.src, '顶满判据读 now.value,不读一次性 Date.now()').toContain(
      'buffOverflowOf(cultivation.buffs, def.buffId, now.value)'
    )
    // 修行页的速服快捷栏也必须按同一判据置灰:此前注释说它「已置灰」,实际仍无条件 usePill。
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
    expect(rebirth!.src, '兵解置灰要列门槛境名,不许只有定性').toContain('境方可自行兵解')
  })

  it('问卦与点化付不起就置灰列差 —— 缺哪样、直说,不许点了才弹', () => {
    // 同族规:付不起的按钮当场置灰、内联写出差额(防御臂仍在 core)。
    // 故障注入:把 :disabled 改回只看「卦在身」/删掉点化 disabled → 本条红。
    const codex = FILES.find(f => f.path === 'views/RealmCodexView.vue')
    expect(codex, 'RealmCodexView 不见了').toBeDefined()
    expect(codex!.src, '问卦置灰要合成「卦在身或不足」').toContain(':disabled="askDisabled"')
    expect(codex!.src, '问卦差额与置灰同源').toContain('const askShort = computed(')
    expect(codex!.src, '问卦按钮要直说差几枚悟道').toContain('尚差 ${askShort.value} 悟道点')
    expect(codex!.src, '点化付不起要置灰(已显化那枚仍保留)').toContain(
      ':disabled="player.fateFocus !== s.id && focusShort > 0"'
    )
    expect(codex!.src, '点化差额要走指数感知减法').toContain('subClamp(focusCost, resources.spiritStone)')
    expect(codex!.src, '点化按钮要直说差多少灵石').toContain('灵石尚差 ${formatGN(focusShortGN)}')
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
    const RECEIPT = "reader.onerror = () => ui.toast('这个文件读不出来,换一个再试', 'warn')"
    for (const path of ['views/WelcomeView.vue', 'components/settings/SettingsSaveSection.vue']) {
      const f = FILES.find(x => x.path === path)
      expect(f, `${path} 不见了`).toBeDefined()
      const src = f!.src
      const receiptAt = src.indexOf(RECEIPT)
      const readAt = src.indexOf('reader.readAsText(file)')
      expect(receiptAt, `${path} 读文件失败会静默`).toBeGreaterThan(-1)
      expect(receiptAt, `${path} 要在开始读取前挂好失败回执`).toBeLessThan(readAt)
    }
  })
})

/**
 * 空态只有一个出处。
 *
 * 本仓早就有 `.empty-seal`(单字哑印),用于「这一册还没有东西」—— 章的分量;
 * 但卡片里「尚无快照 / 尚无秘境 / 此世气象尚未凝成」这类**整块留白**一直是裸写
 * 淡字,一行孤字浮在卡中央,读着像出错留下的空白。`.empty-note` 补的是这一档:
 * 顶上一道两端收笔的淡墨短横,块就有了形状,不用加字号也不用加重颜色。
 *
 * 判据分两段:样式本身要真存在且是「两端透明、中线 20% 墨」的收笔横线
 * (被改成一条实心 border 就失了这个出处);已知的四处漏网要真的挂上类,
 * 免得下次改版又退回裸写。故障注入:摘掉任一处的 empty-note,或把渐变改成实心 —— 红。
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
    // 视觉尺度:1px 高、34px 宽 —— 空态多在列表里,不能为了好看长个头
    expect(NOTE_BLOCK).toMatch(/height:\s*1px/)
    expect(NOTE_BLOCK).toMatch(/width:\s*34px/)
  })

  it('已知的块级空态都挂上了 empty-note', () => {
    const SITES: [string, string][] = [
      ['views/BuildView.vue', '道途尚未成路'],
      ['views/BuildView.vue', '尚无快照'],
      ['views/MortalWorldView.vue', '此世气象尚未凝成'],
      ['components/adventure/SecretRealmCard.vue', '尚无秘境可探']
    ]
    const missing: string[] = []
    for (const [path, phrase] of SITES) {
      const f = FILES.find(x => x.path === path)
      if (!f) {
        missing.push(`${path} → 文件不见了`)
        continue
      }
      // 找带这句话的那个空态段落(v-else / v-if 两种写法都算 —— 列表空态常写
      // v-if="list.length === 0"),看它的 class 里有没有 empty-note
      const tag = [...f.src.matchAll(/<p\b[^>]*>/g)].find(m => {
        const after = f.src.slice(m.index! + m[0].length, m.index! + m[0].length + 120)
        return /\bv-(?:else|if)\b/.test(m[0]) && after.includes(phrase)
      })
      if (!tag) missing.push(`${path} → 找不到「${phrase}」那个空态段落`)
      else if (!/class="[^"]*\bempty-note\b/.test(tag[0])) missing.push(`${path} → 「${phrase}」还裸写着淡字`)
    }
    expect(missing, '这些块级空态没收进 .empty-note —— 短横是块级空态的唯一出处').toEqual([])
  })
})
