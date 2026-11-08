/**
 * 页面名:给读屏用的「这一页叫什么」。
 *
 * 底栏五页里只有首页有视觉隐藏的 h1(HomeView 的「洞府」),其余十二页的
 * 第一层标题是 h2 —— 无障碍树里没有 h1,读屏用标题跳转(NVDA 的 H、VoiceOver 的转子)
 * 会直接落在二级标题上,页面本身没有名字。
 *
 * 名字统一取底栏那五个词,与玩家看到的一致;不在底栏的页(坊市、洞府营造、天界…)
 * 取各自页面标题里的词。
 *
 * 不在表里的路由返回空串,调用方据此不渲染 h1 —— 欢迎页、建号页、界域页(MortalWorldView)
 * 与修仙录(LegacyView)自带可见 h1,再叠一个就会一页两个。
 */
const PAGE_TITLES: Readonly<Record<string, string>> = {
  home: '洞府',
  cultivation: '修炼',
  adventure: '历练',
  inventory: '背包',
  character: '人物',
  market: '坊市',
  codex: '界域志',
  celestial: '天界',
  souls: '器魂',
  dongfu: '洞府营造',
  collection: '成就',
  build: '流派',
  apprentice: '道童',
  titles: '名号',
  settings: '设置',
  soulsList: '器魂'
}

/** 路由名 → 页面名;认不出返回空串 */
export function pageTitle(name: unknown): string {
  return typeof name === 'string' ? (PAGE_TITLES[name] ?? '') : ''
}
