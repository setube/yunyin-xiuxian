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
import { ARTIFACTS, artifactDef } from './artifacts'
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
