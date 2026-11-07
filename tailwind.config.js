/** @type {import('tailwindcss').Config} */

/**
 * 颜色走「RGB 通道值变量 + <alpha-value>」:变量存裸通道值 "41 39 34",由这里补上 rgb() 与 alpha。
 * 不能直接用 var(--color-ink):斜杠透明度会合成非法的 rgb(#292722 / 0.1),整条声明被浏览器丢弃。
 * 通道值(--color-ink-rgb)定义在 style.css,暗色主题只需覆盖通道值一处。
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
          faint: withAlpha('--color-ink-faint-rgb')
        },
        cinnabar: {
          DEFAULT: withAlpha('--color-cinnabar-rgb'),
          deep: withAlpha('--color-cinnabar-deep-rgb')
        },
        'indigo-ink': withAlpha('--color-indigo-ink-rgb'),
        'gold-ink': withAlpha('--color-gold-ink-rgb'),
        jade: withAlpha('--color-jade-rgb'),
        azure: withAlpha('--color-azure-rgb'),
        'violet-ink': withAlpha('--color-violet-ink-rgb'),
        'amber-ink': withAlpha('--color-amber-ink-rgb'),
        /* 品阶色当文字用时的暗/亮版;装饰那一层仍用 data/qualities.ts 的原色 */
        'quality-profound-text': withAlpha('--color-quality-profound-text-rgb'),
        'quality-heaven-text': withAlpha('--color-quality-heaven-text-rgb'),
        'quality-immortal-text': withAlpha('--color-quality-immortal-text-rgb'),
        'quality-divine-text': withAlpha('--color-quality-divine-text-rgb'),
        'quality-dao-text': withAlpha('--color-quality-dao-text-rgb'),
        /* 天赋 / 器魂品阶色当文字用时的暗/亮版;装饰那一层仍用 data 里的原色 */
        'talent-mortal-text': withAlpha('--color-talent-mortal-text-rgb'),
        'talent-dao-text': withAlpha('--color-talent-dao-text-rgb')
      },
      fontFamily: {
        /* 只做「utility 名 → 变量」;字体栈事实源在 style.css 的 --font-kai / --font-song。
           这里另写字体栈不生效:产物里 style.css 的 `.font-kai{font-family:var(--font-kai)}` 排在后面盖掉它 */
        kai: ['var(--font-kai)'],
        song: ['var(--font-song)']
      },
      /* v3 只有固定 scale,缺的须显式补齐;值按 calc(0.25rem * N) 换算。maxWidth 默认已继承 theme.spacing */
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
      /* 斜杠透明度走 theme.opacity,v3.4 默认步长 5;更淡的几档须补 */
      opacity: {
        4: '0.04',
        6: '0.06',
        7: '0.07',
        8: '0.08'
      },
      /* @keyframes 本体在 style.css;这里只做「工具类名 → animation 简写」映射 */
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
  /*
   * short: 高度断点(横屏手机、桌面矮窗)。
   * 不走 theme.screens 的 { raw: … }:那样 min-* / max-* 变体不可用(如 min-[340px]:)。
   */
  plugins: [
    ({ addVariant }) => {
      addVariant('short', '@media (max-height: 560px)')
    }
  ]
}
