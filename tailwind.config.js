/** @type {import('tailwindcss').Config} */

/**
 * 颜色统一走「RGB 通道值变量 + <alpha-value>」模式。
 *
 * 为什么不能直接写 var(--color-ink):Tailwind 的斜杠透明度(bg-ink/10)是把
 * 颜色塞进 rgb(<通道> / <alpha>) 里合成的,变量若是 #292722 这种完整颜色,
 * 合成出来就是非法的 rgb(#292722 / 0.1),整条声明被浏览器丢弃。
 * 所以变量存裸通道值 "41 39 34",由这里的函数补上 rgb() 与 alpha。
 *
 * 与 style.css 的分工:那边定义 --color-ink-rgb(通道值)并派生出
 * --color-ink(完整颜色,供 color-mix 和模板里的 var(--color-*) 使用),
 * 暗色主题只需覆盖通道值一处,两条路径同时换肤。
 */
const withAlpha = variable => `rgb(var(${variable}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: withAlpha('--color-paper-rgb'),
          deep: withAlpha('--color-paper-deep-rgb'),
          dark: withAlpha('--color-paper-dark-rgb')
        },
        ink: {
          DEFAULT: withAlpha('--color-ink-rgb'),
          soft: withAlpha('--color-ink-soft-rgb'),
          faint: withAlpha('--color-ink-faint-rgb'),
          ghost: withAlpha('--color-ink-ghost-rgb')
        },
        cinnabar: {
          DEFAULT: withAlpha('--color-cinnabar-rgb'),
          deep: withAlpha('--color-cinnabar-deep-rgb')
        },
        qinghua: {
          DEFAULT: withAlpha('--color-qinghua-rgb'),
          light: withAlpha('--color-qinghua-light-rgb')
        },
        'indigo-ink': withAlpha('--color-indigo-ink-rgb'),
        'gold-ink': withAlpha('--color-gold-ink-rgb'),
        jade: withAlpha('--color-jade-rgb'),
        azure: withAlpha('--color-azure-rgb'),
        'violet-ink': withAlpha('--color-violet-ink-rgb'),
        'amber-ink': withAlpha('--color-amber-ink-rgb')
      },
      fontFamily: {
        kai: ['Kaiti SC', 'STKaiti', 'KaiTi', 'LXGW WenKai', 'Noto Serif SC', 'serif'],
        song: ['Noto Serif SC', 'Source Han Serif SC', 'STSong', 'SimSun', 'Kaiti SC', 'serif']
      },
      /* v4 的 @theme 按需生成任意数值,v3 只有固定 scale,缺的须显式补齐。
         v4 的 spacing 公式是 calc(0.25rem * N),下面的值据此换算。
         maxWidth 不必单列:v3.4 的 maxWidth 默认已继承 theme.spacing */
      spacing: {
        0.75: '0.1875rem',
        1.25: '0.3125rem',
        5.25: '1.3125rem',
        35: '8.75rem',
        90: '22.5rem',
        100: '25rem',
        107.5: '26.875rem'
      },
      /* 弹窗遮罩层级,v3 默认 zIndex 到 50 为止 */
      zIndex: {
        60: '60',
        70: '70'
      },
      /* 按压回弹幅度,v3 默认 scale 在 95 与 100 之间没有档位 */
      scale: {
        97: '.97',
        98: '.98',
        99: '.99'
      },
      /* 斜杠透明度走 theme.opacity,v3.4 默认是步长 5(0/5/10/…/100),
         这几档更淡的底色和分隔线不在其中,须补 */
      opacity: {
        4: '0.04',
        6: '0.06',
        7: '0.07',
        8: '0.08'
      },
      /* @keyframes 本体保留在 style.css(标准 CSS,v3 直接识别),这里只做
         「工具类名 → animation 简写」的映射,避免同一份帧定义两处维护 */
      animation: {
        mist: 'mist 26s ease-in-out infinite alternate',
        'mist-slow': 'mist 40s ease-in-out infinite alternate-reverse',
        breathe: 'breathe 4.5s ease-in-out infinite',
        'float-dmg': 'float-dmg 0.9s ease-out forwards',
        'float-crit': 'float-crit 0.9s ease-out forwards',
        'ink-pop': 'ink-pop 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        'spin-slow': 'spin-slow 14s linear infinite',
        'spin-slower': 'spin-slower 22s linear infinite'
      }
    }
  },
  plugins: []
}
