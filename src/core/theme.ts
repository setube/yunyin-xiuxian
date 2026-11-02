/** 主题服务:夜间由 html[data-theme='dark'] 覆盖 style.css 调色板变量。 */
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** 浏览器 chrome(地址栏 / PWA 标题栏)颜色,须随页面底色 */
const THEME_CHROME = { light: '#F3EFE4', dark: '#211F1C' } as const

/**
 * 首帧用的明文主题标记。
 *
 * 存档本身是加密的,`index.html` 的内联脚本解不开;而主题要赶在首帧前挂上,
 * 不然暗色用户会先看到一屏亮底(实测约 200ms,慢设备更久)。
 * 故另存一个非敏感的小键:只写 'light' / 'dark',不含任何玩家数据,
 * 与 `yunyin.__live` 心跳同规。
 */
export const THEME_HINT_KEY = 'yunyin.__theme'

function writeThemeHint(dark: boolean): void {
  try {
    localStorage.setItem(THEME_HINT_KEY, dark ? 'dark' : 'light')
  } catch {
    // 私密模式 / 配额满:首帧退回系统偏好,不影响本局
  }
}

export function syncChromeColor(dark: boolean): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'theme-color'
    document.head.appendChild(meta)
  }
  meta.content = dark ? THEME_CHROME.dark : THEME_CHROME.light
  writeThemeHint(dark)
}

export function applyTheme(theme: 'auto' | 'light' | 'dark'): void {
  const dark = theme === 'dark' || (theme === 'auto' && typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(DARK_QUERY).matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  syncChromeColor(dark)
}

type ThemeMode = 'auto' | 'light' | 'dark'

/** 立即应用一次;auto 下跟随系统深浅切换 */
export function initTheme(getTheme: () => ThemeMode): () => void {
  const noop = (): void => undefined
  applyTheme(getTheme())
  if (typeof globalThis.matchMedia !== 'function') return noop
  const mq = globalThis.matchMedia(DARK_QUERY)
  const onChange = (): void => {
    if (getTheme() === 'auto') applyTheme('auto')
  }
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
