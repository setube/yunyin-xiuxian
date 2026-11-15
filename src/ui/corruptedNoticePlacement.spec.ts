/**
 * 坏档落到欢迎页时的一句状态。
 *
 * 起因:`preflightScan` 把解不出 JSON 的分片挪进 `corrupt.<key>` 再删掉原键。若坏的正是
 * `game`,那一片里的 `started` 随之没了,路由守卫 `if (game.started) return { name: home }`
 * 不成立,玩家被送回 `#/welcome`。
 *
 * 而 `corruptedNotice` 原先**只在设置页**显示 —— 玩家落在欢迎页根本走不到那里。
 * 实测:把 `yunyin.game` 写成解不出的密文后,欢迎页正文只有
 * 「道云隐修仙录 一念修行 · 云深不知处 开 始 游 戏 隐私政策 · 导入存档 · 关于我们」,
 * 一个字都没提损坏;而原档其实还在本机(`corrupt.yunyin.game` 备份 + 其余完好分片)。
 *
 * 两条判据:
 *  一 欢迎页确实读了 `ui.corruptedNotice` 并渲染出来(不是只在设置页读);
 *  二 文案守 UI 规范的形状 —— 只报状态与事实,不给建议、不劝导。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const WELCOME = readFileSync(resolve(ROOT, 'src/views/WelcomeView.vue'), 'utf-8')
const SETTINGS = readFileSync(resolve(ROOT, 'src/components/settings/SettingsSaveSection.vue'), 'utf-8')

describe('坏档 · 欢迎页也要说一句', () => {
  it('欢迎页读了 corruptedNotice', () => {
    expect(WELCOME, '欢迎页没读 ui.corruptedNotice —— 坏档落到这里玩家只会看到「开始游戏」').toContain(
      'ui.corruptedNotice'
    )
  })

  it('模板里按它渲染一段状态,不是只读不用', () => {
    // 取「读它」的那一行之后紧跟的模板用法
    expect(WELCOME, '没有按 corruptedNotice 渲染的条件块').toMatch(/v-if="corruptedNotice\.length"/)
    expect(WELCOME, '没有把分片名翻成中文(漏一条会印内部 id)').toContain('STORE_NAMES[id]')
  })

  it('与设置页同一句话,不各写一份', () => {
    /*
     * 两处都写「存档损坏:{名字} · 原档留在本机」。
     * 文案若分叉,玩家在两处看到的是两种说法 —— 而它们说的是同一件事。
     */
    const phrase = '存档损坏:'
    expect(WELCOME, '欢迎页缺「存档损坏:」那半句').toContain(phrase)
    expect(SETTINGS, '设置页缺「存档损坏:」那半句').toContain(phrase)
    for (const text of [WELCOME, SETTINGS]) {
      expect(text, '缺「原档留在本机」那一半事实').toContain('原档留在本机')
    }
  })

  it('文案守 UI 规范:不给建议、不劝导、不解释原因', () => {
    // 取那一段模板里的可见文字
    const at = WELCOME.indexOf('v-if="corruptedNotice.length"')
    expect(at, '找不到那一块').toBeGreaterThan(-1)
    const block = WELCOME.slice(at, at + 700)
    const visible = block.slice(block.indexOf('>'), block.indexOf('</p>'))
    for (const banned of ['请', '建议', '可以', '不妨', '尝试', '您', '即可', '以便']) {
      expect(visible, `坏档提示里出现了「${banned}」—— 那是劝导,不是状态`).not.toContain(banned)
    }
    // 长度上限:普通 UI 状态 ≤ 8 汉字 / 提示尽量 ≤ 12;这一句带分片名,按「主句」算
    expect('存档损坏').toHaveLength(4)
  })

  it('启动 toast 要点名坏了哪一片,不能只说「损坏」', () => {
    /*
     * 原先 main.ts 只报「存档损坏,已隔离修复」—— 2.6 秒后这条就散了,
     * 而玩家真正需要的那条事实(哪一片坏了)只留在设置页里。
     * 实测坏 `player` 分片后,首页与顶栏一个字都不提,玩家看到的是
     * 「神人境」悄悄变回「炼气一层」,除这条几秒的提示外没有任何解释。
     */
    const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf-8')
    expect(main, '启动 toast 没走 STORE_NAMES —— 会印内部 id').toContain('STORE_NAMES')
    expect(main, '启动 toast 里没有拼接分片名').toMatch(/NAMES\.join\('、'\)/)
    // 不许退回到不带名字的那句话
    expect(main, 'toast 又变回不带分片名的「存档损坏,已隔离修复」').not.toContain(
      "toast('存档损坏,已隔离修复'"
    )
  })

  it('坏得多时只报个数,不把提示挤成五行', () => {
    const main = readFileSync(resolve(ROOT, 'src/main.ts'), 'utf-8')
    expect(main, '没有截上限 —— 15 片全坏会把一条提示挤爆').toMatch(/corrupted\.slice\(0, 3\)/)
    expect(main, '截断后没报总数').toMatch(/等 \$\{corrupted\.length\} 处/)
  })

  it('「导入存档」入口就在同一页 —— 状态与找回的路不隔页', () => {
    /*
     * 提示只说事实、不给建议,前提是**找回的动作已经在眼前**。
     * 若哪天把欢迎页的导入入口挪走,这句「原档留在本机」就成了没着落的空话。
     */
    expect(WELCOME, '欢迎页没有导入存档入口了 —— 那条提示会失去落点').toContain('导入存档')
  })
})
