/**
 * 提交信息与 PR 标题的 conventional 闸门
 *
 * 背景:主分支最近一次是 squash 合并的主题行(round 254: …),并非 conventional;
 * 而 squash 合并会直接把 PR 标题带进主分支。故此处两处都拦 —— 提交信息(husky + CI)
 * 与 PR 标题(CI),任一不合规就红。
 *
 * 本仓库提交体量大、标题常带长款中文(近 60 条中位 97、P90 117 字符),故放开
 * header-max-length(200)与 body/footer 行长,不拿长度卡风格;真正卡的是「形」:
 * `<type>(<scope>): <subject>` 且 type 属于 conventional 枚举。
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 仓库中文标题普遍偏长,200 是「离谱的上限」而非「常见长度」;
    // 长度不是本次要治的病(要治的是 round 254 那种没有 type 的行)。
    'header-max-length': [2, 'always', 200],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    // 标题里常带拉丁词首字母大写(CI / Sourcery / vitest / PWA…),
    // sentence-case 会把这类既有写法打成红 —— 禁用,归档《类型: 描述》本身。
    'subject-case': [0]
  }
}
