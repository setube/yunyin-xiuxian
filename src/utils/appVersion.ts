/**
 * 版本工具 —— 应用版本的唯一来源 + 一个无依赖的 semver 式比较器。
 *
 * 「当前版本」与那个「该不该给玩家看发布说明」的判断都要以同一份数字为准,
 * 否则设置页写着 v1.37.0、发布说明却还盖着 v1.36.0 的戳,两件事就分叉了。
 */
import pkg from '../../package.json'

/** 应用当前版本(随 package.json 单一维护,发布时只改一处) */
export const APP_VERSION: string = pkg.version

/**
 * 比较两个 "x.y.z" 版本串。
 * @returns <0 表示 a 旧于 b;0 表示相等;>0 表示 a 新于 b。
 *
 * 段数允许不一致(缺段按 0 看待):'1.37' 即 '1.37.0'。
 * 非数字段(如 'beta'、'next')按 0 处理,绝不抛错 —— 宁可保守,不可让
 * 一次版本判断把整页崩掉。
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseParts(a)
  const pb = parseParts(b)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i += 1) {
    const va = pa[i] ?? 0
    const vb = pb[i] ?? 0
    if (va !== vb) return va < vb ? -1 : 1
  }
  return 0
}

function parseParts(v: string): number[] {
  return String(v)
    .split('.')
    .map(seg => {
      const n = Number.parseInt(seg, 10)
      return Number.isFinite(n) ? n : 0
    })
}
