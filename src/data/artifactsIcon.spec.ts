/**
 * 法宝图标(玩家实报:「法宝的各个 icon 不显示了」)。
 *
 * 症状分两层,这一份钉的是第二层:第一层是组件丢了 import(已由
 * core/uiLayering.spec 的模板标签判据接管),第二层是**图标本身分不出彼此** ——
 * 45 件法宝此前只用了 21 个键,`flame`/`bell`/`flask`/`shield`/`ghost`/`star`/`gem`
 * 各有三到四件共用,而 `iconOf` 有 Sparkles 兜底、写错键只会静默掉成四角星。
 * 名字与图各自成对之后,卡片上一眼认得出是哪一件,而不是「又一张火焰图」。
 *
 * 判据三件:
 *   一 每件法宝的图标键都必须注册(不靠 iconOf 的兜底 —— 那会把死键变成四角星);
 *   二 45 件不许撞图:图标是辨识手段,两件共用等于没有第二件;
 *   三 名字与图要对得上,挑几个手挑过的钉死,防后来者把图标改回同槽清一色。
 */
import { describe, expect, it } from 'vitest'
import { ARTIFACTS, artifactDef, artifactEvictedBy, artifactSlotViews, ARTIFACT_MAX_SLOTS } from './artifacts'
import { ICONS } from '@/ui/icons'

describe('法宝图标', () => {
  it('全部法宝的图标键都已注册,没有死键', () => {
    // 直接在注册表里查成员 —— iconOf 会兜底成 Sparkles、永不抛错,
    // 包在 try/catch 里等于永远测不出死键(会静默掉成四角星)。
    const dead = ARTIFACTS.filter(a => !(a.icon in ICONS)).map(a => `${a.id}:${a.icon}`)
    expect(dead, '以下法宝的图标键未注册').toEqual([])
  })

  it('45 件各有一张图:同一枚图标不许两件共用', () => {
    const byIcon = new Map<string, string[]>()
    for (const a of ARTIFACTS) byIcon.set(a.icon, [...(byIcon.get(a.icon) ?? []), a.name])
    const dupes = [...byIcon.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([icon, names]) => `${icon} ← ${names.join('、')}`)
    expect(
      dupes,
      '这些法宝撞了图 —— 法宝是玩家要一件件认下来的东西,共用一枚图标等于没有第二件'
    ).toEqual([])
    expect(byIcon.size, '图标种数应与法宝件数相等').toBe(ARTIFACTS.length)
  })

  it('名与图对得上:葫芦是坛、镜是镜像、印是印、幡是旗、琴是乐', () => {
    expect(artifactDef('af_muyu')?.icon, '墨玉葫芦 → 坛').toBe('amphora')
    expect(artifactDef('af_xuantian')?.icon, '玄天镜 → 圆镜').toBe('mirror-round')
    expect(artifactDef('af_taixu')?.icon, '太虚镜 → 方镜').toBe('mirror-rectangular')
    expect(artifactDef('af_zhenyue')?.icon, '镇岳印 → 印').toBe('stamp')
    // 幽冥幡走「阴风摄魂」而非「旗」:幡面之下是亡魂,不是战阵;
    // 真灵幡(af_zhenlingfan)才用旗 —— 两面幡靠这一层分家。
    expect(artifactDef('af_youming')?.icon, '幽冥幡 → 幽魂').toBe('ghost')
    expect(artifactDef('af_zhenlingfan')?.icon, '真灵幡 → 旗').toBe('flag')
    expect(artifactDef('af_shenyuling')?.icon, '神域令旗 → 令旗').toBe('flag-triangle-right')
    expect(artifactDef('af_xianqin')?.icon, '仙琴 → 乐').toBe('music')
    expect(artifactDef('af_yunshengu')?.icon, '陨神战鼓 → 鼓').toBe('drum')
    expect(artifactDef('af_shehun')?.icon, '摄魂铃 → 铃').toBe('bell-ring')
    expect(artifactDef('af_leiyin')?.icon, '雷音锤 → 锤').toBe('hammer')
    expect(artifactDef('af_hongmengchi')?.icon, '鸿蒙尺 → 尺').toBe('ruler')
    expect(artifactDef('af_shenmojing')?.icon, '神魔镜 → 窥视之眼').toBe('scan-eye')
  })

  it('同名的另一件不同图:两个「镜」、两个「幡」、两个「钟」各走各的路', () => {
    // 「同槽清一色」的老毛病在装备那边已经修过(见 equipmentIcon.spec);
    // 法宝这边名字本就各不相同,撞图只说明写表的人没看图 —— 这里按住三组反例。
    const mirrors = ['af_xuantian', 'af_taixu'].map(id => artifactDef(id)?.icon)
    const banners = ['af_youming', 'af_zhenlingfan'].map(id => artifactDef(id)?.icon)
    const bells = ['af_hundun', 'af_shenzhong'].map(id => artifactDef(id)?.icon)
    expect(new Set(mirrors).size, '两面镜不该同图').toBe(2)
    expect(new Set(banners).size, '两面幡不该同图').toBe(2)
    expect(new Set(bells).size, '两口钟不该同图').toBe(2)
  })
})

/**
 * 法宝位的**顺序**也是信息 —— 玩家照着槽位做决定,做的必须是那件事。
 *
 * 槽满时替下「最早祭炼的一件」(列表第一件)。界面从前拿「品质降序的法宝行」
 * 过滤出已佩带者来画槽位:高品阶的件永远画在第一格,而实际先让位的可能是另一件。
 * 提示条写「替下最早祭炼的一件」,被替下的却画在第二格 —— 换件像掷骰子。
 *
 * 故障注入:把 `artifactSlotViews` 改回按品质排序(或让 `artifactEvictedBy`
 * 返回末件),下面两条各自转红。
 */
describe('法宝位 · 画出来的第一格就是要让位的那一件', () => {
  /** 故意让「后佩带的」品质更高:旧画法会把它排到第一格,而替下的仍是先佩带的那件 */
  const owned = [
    { defId: 'af_muyu', level: 0 }, // 凡品
    { defId: 'af_xuantian', level: 0 } // 更高品阶
  ]
  const equipped = ['af_muyu', 'af_xuantian']

  it('逐槽视图按佩带顺序,不按品质重排', () => {
    const views = artifactSlotViews(equipped, owned, ARTIFACT_MAX_SLOTS)
    expect(views.map(v => v?.def.id), '第一格必须是最早佩带的那件').toEqual(['af_muyu', 'af_xuantian'])
  })

  it('替下判据与第一格同源:槽满时让位的就是画在第一格的那件', () => {
    const views = artifactSlotViews(equipped, owned, ARTIFACT_MAX_SLOTS)
    expect(artifactEvictedBy(equipped, ARTIFACT_MAX_SLOTS)).toEqual([views[0]!.def.id])
  })

  it('槽未满、槽数非法时,没有「被替下」这回事', () => {
    expect(artifactEvictedBy(['af_muyu'], 2)).toEqual([])
    expect(artifactEvictedBy(equipped, 0)).toEqual([])
    expect(artifactEvictedBy(equipped, Number.NaN)).toEqual([])
  })

  /**
   * 超编的列表让位的是**前端几件**, 按钮得照实全念出来。
   *
   * 境界跌落(元婴位没了), 未经 sanitize 的内存直塞, 都能让佩带列表**本来就超编**。
   * 替换分支会一路裁到 `slots`, 前端几件一起让位。
   *
   * 故障注入: 把 `artifactEvictedBy` 改回只返回 `equipped[0]`
   * (单件), 本条必红 —— 那样按钮只点名了一件,
   * 而真正被替下的是两件。
   */
  it('列表超编时,让位的前端几件要全部报出来', () => {
    expect(artifactEvictedBy(['af_muyu', 'af_lihuo'], 1)).toEqual(['af_muyu', 'af_lihuo'])
    expect(artifactEvictedBy(['af_muyu', 'af_lihuo', 'af_xuantian'], 2)).toEqual(['af_muyu', 'af_lihuo'])
    // 未超编(正好满格)时让位的只是最早那一件
    expect(artifactEvictedBy(['af_muyu', 'af_xuantian'], 2)).toEqual(['af_muyu'])
  })

  it('认不出的 id 不进替下名单(它画不出卡,玩家无从核对是谁)', () => {
    expect(artifactEvictedBy(['af_ghost', 'af_muyu'], 1)).toEqual(['af_muyu'])
  })

  it('认不出的 id 不画幽灵位,空位补 undefined', () => {
    const views = artifactSlotViews(['af_ghost', 'af_muyu'], owned, ARTIFACT_MAX_SLOTS)
    expect(views.map(v => v?.def.id), '认不出的法宝不该占一格').toEqual(['af_muyu', undefined])
  })
})
