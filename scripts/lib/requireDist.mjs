/**
 * dist/ 守门:凡是走 `vite preview` 读构建产物的脚本,先确认产物在、且不太旧。
 *
 * 为什么要有这一条:aria-check / focus-check / multitab-check 都不自己构建,
 * 它们 serve 的是**上一次** `bun run build` 的 dist。单独跑
 * `node scripts/focus-check.mjs` 时若 dist 过期,量到的就是旧代码,
 * 改了半天看不到判据变红,或者更糟 —— 判据绿着,而线上代码早已不符。
 *
 * 实测踩过:把底栏整个藏掉后忘记构建,focus-check 仍对着旧 dist 报绿。
 *
 * 这两种情况要分开处理:
 *   · dist 不存在 —— 直接失败,连可量的东西都没有;
 *   · dist 比源码旧 —— 只警告,不失败。构建耗时,本地反复调脚本时不该被拦;
 *     但必须让跑的人看见「你量的可能不是你以为的那份代码」。
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 递归取一棵树下最新文件的 mtime(毫秒);目录不存在返回 0 */
function newestMtime(dir, skip = []) {
  if (!existsSync(dir)) return 0
  let newest = 0
  for (const name of readdirSync(dir)) {
    if (skip.includes(name)) continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) newest = Math.max(newest, newestMtime(full, skip))
    else newest = Math.max(newest, st.mtimeMs)
  }
  return newest
}

/**
 * 断言 dist/ 存在;比源码旧则打印警告。
 *
 * @param {string} label 脚本名,进提示语
 * @returns {boolean} dist 可用则为 true
 */
export function requireDist(label) {
  const indexHtml = join(ROOT, 'dist/index.html')
  if (!existsSync(indexHtml)) {
    console.error(`\n${label}:dist/index.html 不存在 —— 先跑 \`bun run build\``)
    return false
  }

  const distAt = newestMtime(join(ROOT, 'dist'))
  // src 与 index.html 之外的东西改了不影响产物;只看真正会进包的
  const srcAt = Math.max(newestMtime(join(ROOT, 'src')), statSync(join(ROOT, 'index.html')).mtimeMs)
  if (srcAt > distAt) {
    const mins = Math.round((srcAt - distAt) / 60000)
    console.warn(
      `\n⚠ ${label}:dist 比源码旧约 ${mins} 分钟 —— 量到的是上一次构建的代码。` +
        `\n  要验当前源码请先 \`bun run build\`。\n`
    )
  }
  return true
}
