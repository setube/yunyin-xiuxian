/**
 * 死导出审计 —— 「导出」也是一种承诺
 *
 * 一个顶层导出活着的判据只有一条:**除声明处之外,src 里还有别人用**。
 * 没有别人的导出,读者会以为它被接上了,于是:
 *
 *   - isSoftCapped 写了半年没人调,软阈值就成了"面板暗改";
 *   - RULESET_CHANGELOG 写好了没人读,玩家问不到"天道变了什么";
 *   - 早先的 CHAIN_EVENT_IDS 列着五个连锁事件的 id,而那五个事件根本不存在
 *     (现已实装为 data/chains.ts,旧的死导出随之删除)。
 *
 * 这三条都是本轮清扫出来的真事,共同点不是"代码写得差",而是
 * **没有任何机制阻止死导出继续躺在那里**。故本文件把这件事变成红线:
 *
 *   每个顶层导出,要么有人接,要么删掉;确有理由先留的,登记在 ALLOWLIST
 *   里写明原因和去处 —— 名单不常驻,一旦有人接上,这里立刻变红提醒销账。
 *
 * 故障注入:任意把 ALLOWLIST 里的一项接上(或删掉某个真导出的来源)都会变红;
 * 往 src 里加一个没人用的 `export const x = 1` 也会变红。
 *
 * 判据用 TypeScript 语法树,不是正则 —— 注释与字符串里的名字不算使用,
 * `obj.foo` 的属性名 / 接口字段名也不算,免得"提过一嘴"冒充"接线"。
 */
import { describe, expect, it } from 'vitest'
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(__dirname, '..')

/**
 * 有理由先留、暂不接线的导出。
 *
 * 每一项都必须写清「为什么留」和「什么时候销账」,
 * 写不出这两句的,就是一具应该删掉的尸体。
 */
const ALLOWLIST: Record<string, string> = {
  // 已被别的审计钉住的两端
  studyBlueprint: '炼器图纸骨架:contentReachabilityAudit 已钉"读与给必须一起接",此处不重复扣押'
}

/**
 * 审计/分析模块 —— 它们的导出本就不是给游戏运行时用的,而是给用例读的
 * (模拟、曲线、回归基线、审计表)。这些模块整份豁免"spec-only"红线。
 *
 * 为什么不用自动判据:试过两次都不干净 ——
 *   ① "有导出被运行时用过" ⇒ 审计模块常有一两个导出被界面借用,误报上百;
 *   ② "从 main 沿 import 传递可达" ⇒ 只要审计模块里有一个导出进了界面
 *      (如 samsaraAudit.heritageGroups 被轮回弹窗用),它 import 的整棵分析树
 *      都成了"运行时",照样误报。
 * 于是改为**具名清单**:新增分析模块时在此登记,一眼可审。
 */
const AUDIT_MODULES = new Set([
  'core/buildSearch.ts',
  'core/buildSim.ts',
  'core/celestialSim.ts',
  'core/compoundingAudit.ts',
  'core/daoFruitCurve.ts',
  'core/daoFruitRoles.ts',
  'core/deepCultivationRoi.ts',
  'core/ecosystemHealth.ts',
  'core/fingerprints.ts',
  'core/fruitOutlets.ts',
  'core/impactSurface.ts',
  'core/inflationAudit.ts',
  'core/lootSim.ts',
  'core/mortalGate.ts',
  'core/mortalIdentity.ts',
  'core/mortalWorldGen.ts',
  'core/motivationType.ts',
  'core/narrowingImpact.ts',
  'core/overviewNecessity.ts',
  'core/progressionSim.ts',
  'core/rebirthRoi.ts',
  'core/ruleBudget.ts',
  'core/samsaraAudit.ts',
  'core/shallowRebirthGains.ts',
  'core/trialMotivation.ts'
])

/**
 * 全扫描统一用正斜杠路径(Win 上 join 产出 `\`,会打不中机制表里的正斜杠键)。
 * 文件系统操作仍用各自平台的 join,只有进比较的字符串归一。
 */
const posix = (p: string): string => p.replace(/\\/g, '/')

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(posix(full))
  }
  return out
}

/** .vue 只取 <script> 块;返回可解析的源码 */
function scriptOf(path: string): string {
  const text = readFileSync(path, 'utf8')
  if (!path.endsWith('.vue')) return text
  return /<script[^>]*>([\s\S]*?)<\/script>/.exec(text)?.[1] ?? ''
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && !!ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
}

/** 属性名/字段名/枚举成员不是"使用":`obj.foo`、`{ foo: 1 }`、`interface { foo: T }` 都不算 */
function isNonUseIdentifier(node: ts.Identifier, parent: ts.Node): boolean {
  return (
    /**
     * 光 import 不算接线:真正的接线是有人调用它(未使用的 import 由 eslint 兜)。
     * 例外:别名导入 `import { recordWin as recordStreakWin }` —— 左边的原名是真被引用了,
     * 右边只是本地别名,所以 `propertyName` 那一侧要算使用(本轮就漏判了连胜的记录点)。
     */
    (ts.isImportSpecifier(parent) && parent.propertyName !== node) ||
    ts.isImportClause(parent) ||
    ts.isExportSpecifier(parent) ||
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isPropertyDeclaration(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isMethodSignature(parent) && parent.name === node) ||
    (ts.isEnumMember(parent) && parent.name === node)
  )
}

interface DeadExport {
  name: string
  file: string
}

/** 全量扫描:顶层导出名 → 出现次数(声明处各计一次;spec 与运行时分开计) */
function scanExports(): { dead: DeadExport[]; specOnly: DeadExport[]; scanned: number; exports: number } {
  const files = walk(SRC)
  const declarations = new Map<string, number>()
  const declFile = new Map<string, string>()
  /** 导出名 → 声明所在的绝对路径(判定"运行时模块"用) */
  const declPath = new Map<string, string>()
  const uses = new Map<string, number>()
  const specUses = new Map<string, number>()
  const bump = (m: Map<string, number>, k: string): void => void m.set(k, (m.get(k) ?? 0) + 1)

  for (const file of files) {
    const text = scriptOf(file)
    if (!text.trim()) continue
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const visit = (node: ts.Node): void => {
      const name =
        'name' in node && node.name && ts.isIdentifier(node.name as ts.Node) ? (node.name as ts.Identifier).text : null
      if (name && hasExportModifier(node)) {
        bump(declarations, name)
        if (!declFile.has(name)) declFile.set(name, posix(relative(SRC, file)))
        if (!declPath.has(name)) declPath.set(name, file)
      }
      if (ts.isVariableStatement(node) && hasExportModifier(node)) {
        for (const d of node.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) {
            bump(declarations, d.name.text)
            if (!declFile.has(d.name.text)) declFile.set(d.name.text, posix(relative(SRC, file)))
            if (!declPath.has(d.name.text)) declPath.set(d.name.text, file)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    /**
     * .vue 的模板也要算:template 里的 {{ formatDate(...) }} 是真实使用,
     * 只解析 <script> 会把它们误判成"没人用"(本轮把 import 排除出"使用"后就暴露了这一点)。
     */
    if (file.endsWith('.vue')) {
      const template = readFileSync(file, 'utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g, '')
      /**
       * 只数**表达式里**的词 —— 整篇扫词会把 HTML 标签名当成标识符
       * (`<div>` 会让 gnum.div 看起来"有人在用",本轮就撞上了这一下)。
       */
      const exprs: string[] = []
      for (const m of template.matchAll(/\{\{([\s\S]*?)\}\}/g)) exprs.push(m[1]!)
      for (const m of template.matchAll(/(?::|@|v-)[\w.-]*="([^"]*)"/g)) exprs.push(m[1]!)
      for (const word of exprs.join('\n').match(/[A-Za-z_$][\w$]*/g) ?? []) bump(uses, word)
    }
  }

  for (const file of files) {
    const text = scriptOf(file)
    if (!text.trim()) continue
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const isSpec = file.endsWith('.spec.ts')
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && !(node.parent && isNonUseIdentifier(node, node.parent))) {
        bump(uses, node.text)
        if (isSpec) bump(specUses, node.text)
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }

  const dead: DeadExport[] = []
  const specOnly: DeadExport[] = []
  /**
   * 哪些模块是"运行时模块":从入口(main.ts)出发、沿 import 传递可达的那些。
   *
   * 两条走过的弯路:
   *   ① 用"某个导出被运行时用过"当判据 —— 审计模块常有一两个导出被界面借用,其余全是 spec-only,误报上百;
   *   ② 用"被非 spec 文件 import 过" —— `samsaraAudit` 这类只被 spec 引的模块会把它 import 的
   *      `progressionSim` 也带成"运行时",仍是误报。
   * 传递可达才算数:只从 spec 能被够到的模块,整份都是审计工具,不进这条红线。
   */
  function resolveImport(from: string, spec: string): string | null {
    const base = spec.startsWith('@/')
      ? join(SRC, spec.slice(2))
      : spec.startsWith('.')
        // Win 路径是 `\`,`lastIndexOf('/')` 恒为 -1 会把目录切成坏路径 —— 两种分隔符都找
        ? join(from.slice(0, Math.max(from.lastIndexOf('/'), from.lastIndexOf('\\'))), spec)
        : null
    if (!base) return null
    for (const cand of [base, `${base}.ts`, `${base}.vue`, join(base, 'index.ts')].map(posix)) {
      if (files.includes(cand)) return cand
    }
    return null
  }
  function importsOf(file: string): string[] {
    const sf = ts.createSourceFile(file, scriptOf(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const out: string[] = []
    for (const stmt of sf.statements) {
      if (ts.isImportDeclaration(stmt) && stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        const target = resolveImport(file, stmt.moduleSpecifier.text)
        if (target) out.push(target)
      }
    }
    return out
  }
  const runtimeModules = new Set<string>()
  const entry = posix(join(SRC, 'main.ts'))
  const queue = files.includes(entry) ? [entry] : []
  while (queue.length > 0) {
    const cur = queue.pop()!
    if (runtimeModules.has(cur)) continue
    runtimeModules.add(cur)
    for (const next of importsOf(cur)) if (!runtimeModules.has(next)) queue.push(next)
  }
  for (const [name, count] of declarations) {
    // 声明处自己占一次;≤ 声明次数 ⇒ 除此之外无人提及
    const total = uses.get(name) ?? 0
    const file = declFile.get(name) ?? '?'
    if (total <= count) {
      dead.push({ name, file })
      continue
    }
    // 只在 spec 里被用到(除声明外运行时零引用):若这个模块本身是运行时模块,就是"骨架信号"
    const specOnlyCount = specUses.get(name) ?? 0
    const runtimeUses = total - specOnlyCount
    const declRel = declFile.get(name) ?? ''
    if (runtimeModules.has(declPath.get(name) ?? '') && !AUDIT_MODULES.has(declRel) && runtimeUses <= count && specOnlyCount > 0) {
      specOnly.push({ name, file })
    }
  }
  const byName = (a: DeadExport, b: DeadExport): number => a.name.localeCompare(b.name)
  return {
    dead: dead.sort(byName),
    specOnly: specOnly.sort(byName),
    scanned: files.length,
    exports: declarations.size
  }
}

describe('死导出审计', () => {
  const { dead, specOnly, scanned, exports } = scanExports()
  const deadNames = dead.map(d => d.name)

  it('扫描确实跑起来了(空库不算通过)', () => {
    expect(scanned).toBeGreaterThan(200)
    expect(exports).toBeGreaterThan(500)
  })

  it('不新增死导出:写下的每个导出都得有人接', () => {
    const unexpected = dead.filter(d => !(d.name in ALLOWLIST))
    expect(
      unexpected.map(d => `${d.file} → ${d.name}`),
      '这些导出在 src 里除声明处外无人引用:接上它,或删掉它;确要保留请在 ALLOWLIST 写明原因'
    ).toEqual([])
  })

  it('豁免不常驻:已被接上的条目必须立即销账', () => {
    const stale = Object.keys(ALLOWLIST).filter(name => !deadNames.includes(name))
    expect(stale, '这些名字已经有人接了(或已删除):请从 ALLOWLIST 里删掉,名单不是博物馆').toEqual([])
  })

  /**
   * 「骨架空转」的判据:运行时模块里,只被 spec 用到的导出 = 声明在前、实现没跟。
   * 这一条要是早点有,短期秘境的骨架(createSecretRealm 只有 spec 在用)就不会躺四十轮,
   * 机缘弹窗、灵兽性格、装备共鸣那几处"活得却看不见"也会当场现形。
   *
   * 例外必须写明理由 —— 注意这些是**运行时模块**里的例外,纯审计模块不进这张表:
   * 一个模块若从没被运行时引用过,它整份都是审计工具,自然全是 spec-only。
   */
  const SPEC_ONLY_ALLOWLIST: Record<string, string> = {
    weatherDef: '查表原语:运行时用 todayWeather() 直接取对象,按 id 查表服务于数据自检与联动审计',
    reliefKinds: '审计汇总:把灵根的劫型解法通道列出来,供渡劫审计与灵根角色审计读',
    winChanceFromRatio: '审计公式:胜率换算只作审计口径,不进战斗结算',
    tribulationSuccessRate: '审计口径:五种劫型的抽样成功率,界面走劫势推演,不展示这一条单一概率',
    div: '数值原语:gNum 库的除法(含零除分支),gnum.spec 覆盖;库完整性优先于"当前无人调"',
    lt: '数值原语:gNum 比较,供公式单调性用例读',
    gt: '数值原语:gNum 比较,与 lt 成对',
    parseClassicalDuration: '反查原语:classicalDuration 把时长渲染成古语时制后,由它对文案做 round-trip 自检(timeUnits.spec 守卫),运行时从不解析古语文案'
  }

  it('运行时模块里的导出,不能只被 spec 用到 —— 那是骨架空转的样子', () => {
    const unexpected = specOnly.filter(d => !(d.name in SPEC_ONLY_ALLOWLIST))
    expect(
      unexpected.map(d => `${d.file} → ${d.name}`),
      '这些导出只在 spec 里出现:要么接进游戏(像本轮的道侣因果、技艺表),要么删掉;确要保留请写明理由'
    ).toEqual([])
  })

  it('骨架豁免同样不常驻:已接上或已删除的,从名单销账', () => {
    const names = specOnly.map(d => d.name)
    const stale = Object.keys(SPEC_ONLY_ALLOWLIST).filter(n => !names.includes(n))
    expect(stale, '这些已经不再是"只在 spec 里出现"了:请从 SPEC_ONLY_ALLOWLIST 删掉').toEqual([])
  })
})
