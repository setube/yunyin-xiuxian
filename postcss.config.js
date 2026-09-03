/**
 * PostCSS 配置
 *
 * Tailwind v3 不像 v4 那样自带 Vite 插件,须走 PostCSS 管线接入。
 * autoprefixer 负责补厂商前缀——v4 内置了这一步,降级后必须显式配上,
 * 否则 Android WebView 与旧版 Safari 上 backdrop-filter、mask 等属性会失效。
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
