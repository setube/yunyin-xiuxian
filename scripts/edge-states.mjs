/**
 * 异常路径的界面检查:把玩家能撞到的边缘状态逐个造出来,看界面有没有解释清楚。
 *
 * 为什么单独一份:巡页(aria-check / detail-geometry 的十页触控)、弹窗巡逻、
 * 静态 spec 拿的都是**好人存档**。凡是只在异常状态下才渲染的 UI,它们永远碰不到 ——
 * 前几轮修的三处触控缺陷里有两处就是这么漏掉的:
 *   · 设置页「存档损坏 … 知道了」:坏档才出现(实测 17.9px,低于 28px 下限);
 *   · 道童名额满时的拒因:满员才出现(原先只报灵石差额,玩家攒够钱照样收不了)。
 *
 * 结构上刻意分成两段:页面里只**取原始数据**(文字、盒高、禁用态),
 * 判断放在 Node 侧做。原因:检查逻辑若写成字符串塞进 page.evaluate,
 * 正斜杠、反斜杠、全角空格、模板字面量会互相打架 —— 这一份为此返工过三次。
 *
 * 用法(需先 `bun run build`):
 *   node scripts/edge-states.mjs
 *   node scripts/edge-states.mjs --shots    # 另存图到 /tmp/edge-states
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lateSlices, seedSave } from './lib/saveFixture.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const INDEX = `file://${join(ROOT, 'dist/index.html')}`
const SHOTS = process.argv.includes('--shots')
const SHOTS_DIR = '/tmp/edge-states'

const failures = []
const fail = msg => failures.push(msg)

const browser = await chromium.launch({
  args: [
    '--allow-file-access-from-files',
    '--disable-web-security',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--host-resolver-rules=MAP sdk.51.la ~NOTFOUND'
  ]
})

/** 开局白送的入门弟子;archId 必须真实存在,否则 sanitize 静默丢弃整条 */
const ap = uid => ({ uid, archId: 'ap_lingtong', task: null, level: 1, bornAt: 0, taskEndsAt: 0 })

const broke = base => ({ ...base, resources: { ...base.resources, spiritStone: { m: 0, e: 0 }, dust: 0 } })

const stuffedBag = base => ({
  ...base,
  inventory: {
    ...base.inventory,
    items: Array.from({ length: 60 }, (_, i) => ({
      uid: `bag_${i}`,
      templateId: 'w_zhuqing',
      quality: 'fine',
      tier: 1,
      level: 0,
      affixes: []
    })),
    equipped: {}
  }
})

/**
 * 让存档写不进去:覆写 localStorage.setItem,对 `yunyin.*` 抛 QuotaExceededError。
 * 游戏每 5 秒把待落盘分片 flush 一次(SAVE_FLUSH_MS),故这一档要多等一会儿才出现提示。
 */
const breakWrites = async context => {
  await context.addInitScript(() => {
    const real = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith('yunyin.')) {
        const err = new Error('quota exceeded')
        err.name = 'QuotaExceededError'
        throw err
      }
      return real.call(this, key, value)
    }
  })
}

/** 去掉空白与全角空格 —— 排版空格在各字体下渲染不同,比较时一律略过 */
const strip = t => t.replace(/[\s\u3000]/g, '')

/** 拒因词表:禁用钮的正文或 aria 里须出现其中之一 */
const REASON = /尚差|不足|已|无|未|中|满|上限|不可|无法|锁定|在途|需|缺|先/

/* ---------- 取数:只回原始事实,不在这里做判断 ---------- */

const GRAB_PAGE = () => {
  const btns = [...document.querySelectorAll('main button')]
    .filter(b => b.getBoundingClientRect().width > 0)
    .map(b => ({
      text: (b.textContent || '').trim().replace(/\s+/g, ' '),
      aria: b.getAttribute('aria-label') || '',
      disabled: b.disabled,
      h: b.getBoundingClientRect().height
    }))
  return {
    text: document.querySelector('main')?.innerText ?? '',
    buttons: btns
  }
}

/** 师承卡:取卡内各行文字与有无箭头 */
const GRAB_MENTOR = () => {
  const cards = [...document.querySelectorAll('main button')]
  const card = cards.find(b => {
    const t = (b.textContent || '').replace(/[\s\u3000]/g, '')
    return t.startsWith('师承')
  })
  if (!card) return null
  return {
    lines: [...card.querySelectorAll('span')].map(e => (e.textContent || '').trim()),
    hasArrow: (card.textContent || '').includes('→')
  }
}

/* ---------- 场景表 ---------- */

const SCENES = [
  {
    name: '坏档提示',
    route: '/settings',
    slices: () => lateSlices(),
    /** 夹具之后覆写一枚非法分片 —— preflightScan 会判它损坏 */
    prep: async context => {
      await context.addInitScript(() => {
        if (localStorage.getItem('__corruptDone')) return
        localStorage.setItem('yunyin.inventory', 'NOT_VALID_CIPHERTEXT')
        localStorage.setItem('__corruptDone', '1')
      })
    },
    judge: page => {
      if (!/存档损坏/.test(page.text)) {
        return ['提示没渲染出来(夹具没生效?判据没跑到东西)']
      }
      const btn = page.buttons.find(b => b.text === '知道了')
      if (!btn) return ['提示在,但找不到「知道了」那颗钮']
      return btn.h >= 27.5 ? [] : [`「知道了」盒高 ${btn.h.toFixed(1)}px,低于 28px 触控下限`]
    }
  },
  {
    name: '道童名额满',
    route: '/apprentice',
    slices: () => ({
      ...lateSlices(),
      apprentice: { apprentices: [ap('e1'), ap('e2'), ap('e3'), ap('e4')], rebirthKarma: 0 }
    }),
    judge: page => {
      const btn = page.buttons.find(b => b.text.includes('收道童'))
      if (!btn) return ['找不到「收道童」钮']
      /*
       * 先确认槽位真的满了再看钮面:两件事会给出同一表象而原因不同 ——
       * 一是夹具没铺出来(sanitize 丢弃),二是代码里根本没写这条拒因。
       */
      const full = /4\s*\/\s*4/.test(page.text) || btn.text.includes('门中已满')
      if (!full) return ['满员档没铺出来(夹具被 sanitize 丢弃?页上槽位对不上)']
      return btn.text.includes('门中已满')
        ? []
        : [`名额满了,钮面却没写拒因(只写「${btn.text}」)—— 玩家会以为攒够灵石就能收`]
    }
  },
  {
    name: '资源归零',
    route: '/market',
    slices: () => broke(lateSlices()),
    judge: page => {
      if (!page.text.trim()) return ['页面空白(归零档渲染失败?)']
      const silent = page.buttons.filter(b => b.disabled && !REASON.test(b.text + b.aria))
      return silent.length === 0
        ? []
        : [`${silent.length} 颗禁用钮没写拒因:${silent.slice(0, 2).map(s => `«${s.text}»`).join(' ')}`]
    }
  },
  {
    name: '行囊塞满',
    route: '/inventory',
    slices: () => stuffedBag(lateSlices()),
    judge: page => {
      const out = []
      if (!/满包|已满/.test(page.text)) out.push('行囊塞满后没有「满包」提示 —— 玩家不知道掉落会化尘')
      if (!/\d+\s*\/\s*\d+/.test(page.text)) out.push('行囊塞满后看不到「当前/上限」读数')
      return out
    }
  },
  {
    name: '存档写不进去',
    route: '/settings',
    slices: () => lateSlices(),
    prep: breakWrites,
    /*
     * 写入失败要到下一轮 flush 才被感知:SAVE_FLUSH_MS 是 5 秒,而页面自己加载还要 2~3 秒 ——
     * 实测提示在 +7 秒左右出现,故留 9 秒。只等 6.5 秒会误报「没报失败」。
     */
    settleMs: 9000,
    judge: page => {
      if (!/存档写入失败/.test(page.text)) {
        return ['写盘一直失败,设置页却没报「存档写入失败」—— 玩家不知道进度保不住']
      }
      return []
    }
  },
  {
    name: '未拜师',
    route: '/character',
    slices: () => lateSlices(),
    grab: GRAB_MENTOR,
    judge: mentor => {
      if (!mentor) return ['找不到师承卡']
      /*
       * 状态行:卡内去掉「师 承」标题与「拜师 →」入口之后剩下的那行短注。
       * 未拜师时它必须写「未拜师」,不能空着 —— 空着玩家就看不出自己有没有师承,
       * 而这张卡的可点区域就只有那一整行。
       */
      const status = mentor.lines.find(t => t && strip(t) !== '师承' && !t.includes('→'))
      if (!status) return ['师承卡上的状态行是空的 —— 玩家看不出自己有没有拜师']
      const out = []
      if (!mentor.hasArrow) out.push('师承卡没有入口箭头,点不开')
      return out
    }
  }
]

for (const scene of SCENES) {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 } })
  await context.route('**/*', r => {
    const url = r.request().url()
    if (/^(file|data|blob):/.test(url)) return r.continue()
    return r.abort()
  })
  await seedSave(context, scene.slices())
  if (scene.prep) await scene.prep(context)
  const page = await context.newPage()
  page.on('pageerror', e => fail(`[${scene.name}] 运行时异常:${String(e.message).slice(0, 120)}`))
  await page.goto(`${INDEX}#${scene.route}`, { waitUntil: 'load' })
  // 各档页面加载耗时不同;「存档写不进去」那档要等 flush 跑一轮,自己给 settleMs
  await page.waitForTimeout(scene.settleMs ?? 3000)
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('.pointer-events-none.fixed button')) b.click()
    Math.random = () => 1
  })
  for (let i = 0; i < 10; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(220)
    } else break
  }
  if (SHOTS) {
    mkdirSync(SHOTS_DIR, { recursive: true })
    await page.screenshot({ path: join(SHOTS_DIR, `${scene.name}.png`) }).catch(() => {})
  }

  const grabbed = await page.evaluate(scene.grab ?? GRAB_PAGE)
  const problems = scene.judge(grabbed) ?? []
  if (problems.length) {
    for (const p of problems) fail(`[${scene.name}] ${p}`)
  } else {
    console.log(`  ✓ ${scene.name}`)
  }
  await context.close()
}

await browser.close()

if (failures.length) {
  console.error('\n异常路径:以下地方不对')
  for (const f of failures) console.error(`  ✗ ${f}`)
  process.exit(1)
}
console.log('\n异常路径通过:坏档 / 满员 / 归零 / 满包 / 写盘失败 / 未拜师六档都解释得清')
