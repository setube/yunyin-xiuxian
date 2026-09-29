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
        'indigo-ink': withAlpha('--color-indigo-ink-rgb'),
        'gold-ink': withAlpha('--color-gold-ink-rgb'),
        jade: withAlpha('--color-jade-rgb'),
        azure: withAlpha('--color-azure-rgb'),
        'violet-ink': withAlpha('--color-violet-ink-rgb'),
        'amber-ink': withAlpha('--color-amber-ink-rgb')
      },
      fontFamily: {
        /*
         * 只做「utility 名 → 变量」这一步;字体栈本体在 style.css 的 --font-kai / --font-song。
         *
         * 原来这里另抄了一份完整字体栈,而 style.css 里 `.font-kai{font-family:var(--font-kai)}`
         * 在产物中排在它后面、把它整个盖掉 —— 于是改这里不生效(改字号字体时真被坑过一次:
         * 配置改了、产物里纹丝不动)。同一样东西两处维护迟早对不上,故只留这一层转发,
         * 事实源归 style.css 一处。
         */
        kai: ['var(--font-kai)'],
        song: ['var(--font-song)']
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
  /*
   * short: —— 高度断点(横屏手机、桌面矮窗)
   *
   * Tailwind 只有宽度断点,而「上下两栏把屏幕吃掉四分之一」这个毛病是按**高度**
   * 现形的:844×390 横屏下内容区只剩 289px,占屏 26%,两栏吃掉 102px。
   *
   * 这里没有走 theme.screens 的 { raw: … } 写法 —— 那条路 Tailwind 会当场警告
   * 「min-* / max-* 变体不可用」,等于为了一个高度断点把任意宽度断点(min-[340px]:)
   * 全废掉;addVariant 只加一个变体,两边都不耽误。
   */
  plugins: [
    ({ addVariant }) => {
      addVariant('short', '@media (max-height: 560px)')
    }
  ]
}
