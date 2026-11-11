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
import { mkdirSync, writeFileSync } from 'node:fs'
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
  const panel = [...document.querySelectorAll('.modal-panel')].filter(e => e.getBoundingClientRect().width > 0).pop()
  const btns = [...document.querySelectorAll('main button')]
    .filter(b => b.getBoundingClientRect().width > 0)
    .map(b => ({
      text: (b.textContent || '').trim().replace(/\s+/g, ' '),
      aria: b.getAttribute('aria-label') || '',
      disabled: b.disabled,
      h: b.getBoundingClientRect().height,
      w: b.getBoundingClientRect().width
    }))
  return {
    text: document.querySelector('main')?.innerText ?? '',
    buttons: btns,
    /** 页面标题数(读屏靠它跳转);欢迎页与建号页只有本脚本进得来,别的脚本量不到 */
    headings: document.querySelectorAll('h1,h2,h3').length,
    /**
     * 没有可访问名的表单元素。
     * 「输入框有没有名字」只能在这一层验 —— aria-check 铺的是有存档的夹具,
     * 进不了 /welcome 与 /create,那两页的输入框从未被量过。
     */
    unnamedInputs: [...document.querySelectorAll('input, select, textarea')]
      .filter(e => {
        const rc = e.getBoundingClientRect()
        if (rc.width === 0 && rc.height === 0) return false
        if (e.type === 'hidden') return false
        const hasAria = Boolean(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby'))
        const hasLabel = Boolean(e.labels && e.labels.length > 0)
        return !hasAria && !hasLabel
      })
      .map(e => `${e.tagName.toLowerCase()}[type=${e.type}] placeholder=«${e.getAttribute('placeholder') ?? ''}»`),
    panel: Boolean(panel),
    panelText: panel ? panel.innerText : '',
    panelButtons: panel
      ? [...panel.querySelectorAll('button')].map(b => ({
          text: (b.textContent || '').trim().replace(/\s+/g, ' '),
          disabled: b.disabled
        }))
      : [],
    /* 提示条:text 里查不到时,拒因常常只在这一层(如闭关中拦下「出发」) */
    /*
     * 提示条:挂在 fixed 层,结构里常有嵌套节点,故不限「叶子」——
     * 只取「文字短、且所在层是 fixed/absolute」的那几块。
     */
    toasts: [...document.querySelectorAll('div,span,p')]
      .filter(el => {
        const t = (el.textContent || '').trim()
        if (!t || t.length > 30) return false
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) return false
        const pos = getComputedStyle(el).position
        const inFixedLayer = pos === 'fixed' || Boolean(el.closest('[class*="pointer-events-none"]'))
        return inFixedLayer
      })
      .map(el => (el.textContent || '').trim())
      .filter((t, i, a) => a.indexOf(t) === i)
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
    name: '导入版本过新',
    route: '/settings',
    slices: () => lateSlices(),
    /**
     * 造一份 version 高于 SAVE_VERSION 的备份,直接喂给设置页那个隐藏的 file input。
     * 走不了「点按钮再选文件」——浏览器文件选择器在无头里无法交互,
     * 但 setInputFiles 可以直接把文件放进 input。
     */
    prep: async () => {
      writeFileSync(
        '/tmp/edge-too-new.save',
        JSON.stringify({ version: 99, exportedAt: Date.now(), data: { player: { name: '未来修士', major: 6, sub: 0 } } })
      )
    },
    after: async page => {
      await page.locator('input[type=file]').setInputFiles('/tmp/edge-too-new.save')
      await page.waitForTimeout(1800)
    },
    judge: page => {
      if (!page.panel) return ['导入确认弹窗没打开(setInputFiles 没生效?判据没跑到东西)']
      const out = []
      /* 版本高于本机这个事实必须写出来,否则玩家只看到一颗灰钮,不知道为什么不让导 */
      if (!/高于当前/.test(page.panelText)) out.push('备份版本高于本机,却没在弹窗里写明')
      const confirm = page.panelButtons.find(b => b.disabled)
      if (!confirm) out.push('版本过新的备份,确认钮却仍是可点的 —— 点下去会覆盖本机存档')
      else if (!/无法导入/.test(confirm.text)) {
        out.push(`确认钮被禁用了,但没写原因(只写「${confirm.text}」)`)
      }
      return out
    }
  },
  {
    name: '闭关中不许历练',
    route: '/adventure',
    slices: () => ({
      ...lateSlices(),
      // 闭关是持久化的 retreat buff(时长由 data/buffs 的 durationSec 承载),endsAt 在未来即闭关中
      cultivation: {
        learned: {},
        mainGongfa: null,
        subGongfa: [],
        gongfaBranch: {},
        buffs: [{ defId: 'retreat', endsAt: Date.now() + 4 * 60 * 1000, added: 5 * 60 * 1000 }]
      }
    }),
    /**
     * 点「出发」:闭关期间不许外出历练,须**拦下并说出原因**,不能点了没反应。
     * 拦在 chooseMode 里(ui.toast('闭关中')),startExploration 只兜底 ——
     * 故拒因在提示条上,不在按钮上,也不在弹窗里。
     */
    after: async page => {
      const go = page.locator('main button').filter({ hasText: /出\s*发/ }).first()
      if ((await go.count()) === 0) return
      if (await go.isDisabled()) return
      await go.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(400)
    },
    judge: page => {
      const out = []
      // 出行弹窗不许打开
      if (page.panel) out.push('闭关中点「出发」竟打开了出行弹窗 —— 应当直接拦下')
      // 必须给出原因
      const said = page.toasts.some(t => /闭关/.test(t)) || /闭关中/.test(page.text)
      if (!said) out.push('闭关中点「出发」既没打开弹窗、也没说「闭关中」—— 玩家只看到点了没反应')
      return out
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
  },
  {
    /*
     * 欢迎页。
     *
     * 与建号页同一条理由:它是 game.started 为 false 时的默认落地页,
     * 而所有巡页脚本拿的都是已有存档 —— 守卫第一句 `if (game.started) return { name: 'home' }`
     * 会把 /welcome 也弹回首页,所以它同样从未进过真浏览器检查。
     *
     * 这里顺带量隐私确认弹窗:那颗「同意并开始」必须初始置灰(没勾同意就不许走),
     * 且「再想想 / 同意并开始」要等宽 —— 同族的两步确认在别处都踩过宽度不一的问题。
     */
    name: '欢迎页',
    route: '/welcome',
    slices: () => ({
      game: {
        started: false,
        saveVersion: 2,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        totalPlaySec: 0,
        createRerolls: null,
        createProfile: null
      },
      settings: {
        privacyAccepted: false,
        sfxOn: false,
        musicOn: false,
        musicVol: 0,
        sfxVol: 0,
        reduceMotion: true,
        battleSpeed: 4,
        decomposeRanks: [],
        smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
        theme: 'dark'
      }
    }),
    judge: page => {
      if (!/隐私政策|导入存档/.test(page.text)) {
        return ['欢迎页没渲染出来(被路由守卫弹回首页?)—— 本档空转']
      }
      const out = []
      for (const label of [/开\s*始\s*游\s*戏/, /隐私政策/, /导入存档/]) {
        if (!page.buttons.some(b => label.test(b.text))) out.push(`欢迎页缺「${label.source}」入口`)
      }
      // 读屏:aria-check 进不来这页(它铺有存档),标题与字段名只能在这里验
      if (page.headings === 0) out.push('欢迎页没有任何标题元素(h1/h2/h3),读屏无法按标题定位')
      if (page.unnamedInputs.length > 0) out.push(`欢迎页有 ${page.unnamedInputs.length} 个无名字段:${page.unnamedInputs.join(' | ')}`)
      /*
       * 触控下限:这三颗是首屏唯一可点的东西。
       * 只说高度 —— 首页那颗「隐私政策」是文字链宽度够高不够(30px),
       * 而宽度本就都 >28,量宽度只会让判据看起来更严而实际没多验到东西。
       */
      const low = page.buttons.filter(b => b.h < 28)
      if (low.length) out.push(`${low.length} 颗按钮低于 28px 触控下限:${low.map(b => `${b.text}(${b.h.toFixed(1)}px)`).join(' | ')}`)
      return out
    }
  },
  {
    /*
     * 首启全流程:欢迎页 → 勾同意 → 「同意并开始」→ 传送动画 → 建号页。
     *
     * 上面两档只验**静态渲染**(页面画出来对不对);这条验**流程能不能走通**。
     * 差别在于:动画、定时器、路由守卫三者串起来才决定玩家到底走不走得下去,
     * 而它们只在真实点击序列里才一起生效。
     *
     * 实测踩过:第一次量时点完「同意并开始」只等 2 秒就看路由,停在 #/welcome ——
     * 差一点当成「点了没反应」去修。查 `confirmStart()` 才看到中间有 2500ms 的传送动画
     * (`enterTimer`),3 秒后才 router.push('/create')。**那不是缺陷,是我的等待太短。**
     * 该等待时长写死在这里,免得后人重踩。
     */
    name: '首启全流程走到建号页',
    route: '/welcome',
    slices: () => ({
      game: {
        started: false,
        saveVersion: 2,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        totalPlaySec: 0,
        createRerolls: null,
        createProfile: null
      },
      settings: { privacyAccepted: false, sfxOn: false, musicOn: false, musicVol: 0, sfxVol: 0, reduceMotion: true, battleSpeed: 4, decomposeRanks: [], smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true }, theme: 'dark' }
    }),
    after: async page => {
      // 一、点「开始游戏」应弹出隐私确认,不是直接跳走
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find(x => /开\s*始\s*游\s*戏/.test(x.textContent || ''))
        b?.click()
      })
      await page.waitForTimeout(900)
      const asked = await page.evaluate(() => !!document.querySelector('.modal-panel'))
      // 二、不勾同意时确认钮必须置灰
      const blockedBefore = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.modal-panel button')].find(x => /同意并开始/.test(x.textContent || ''))
        return b ? b.disabled : null
      })
      // 三、勾上同意再确认
      await page.evaluate(() => {
        const cb = document.querySelector('.modal-panel input[type=checkbox]')
        if (cb && !cb.checked) cb.click()
      })
      await page.waitForTimeout(300)
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.modal-panel button')].find(x => /同意并开始/.test(x.textContent || ''))
        b?.click()
      })
      // 传送动画 2500ms,等 3.2s 留余量
      await page.waitForTimeout(3200)
      const landed = await page.evaluate(() => location.hash)
      const onCreate = await page.evaluate(() => /道\s*号|灵\s*根|踏\s*入\s*仙\s*途/.test(document.body.innerText))
      await page.evaluate(
        r => {
          window.__firstRun = r
        },
        { asked, blockedBefore, landed, onCreate }
      )
    },
    grab: () => ({ text: '', buttons: [], panel: false, firstRun: window.__firstRun }),
    judge: page => {
      const r = page.firstRun
      if (!r) return ['首启流程没跑起来(场景 after 未执行)']
      const out = []
      if (!r.asked) out.push('点「开始游戏」没弹隐私确认窗 —— 没同意就放行?')
      if (r.blockedBefore !== true) out.push('没勾同意时「同意并开始」不是置灰的')
      if (r.landed !== '#/create') out.push(`同意后落在 ${r.landed},不是 #/create(传送动画约 2.5s,本判据等 3.2s)`)
      if (!r.onCreate) out.push('落在建号页但没渲染出道号/灵根/踏入仙途')
      return out
    }
  },
  {
    /*
     * 建号页。
     *
     * 这是玩家必经的首屏流程,却一直不在任何真浏览器检查里:
     * layout-check / ui-smoke / focus-check 的 ROUTES 都不含 /create —— 那些脚本跑的是
     * 已有存档,而路由守卫 `if (game.started) return { name: 'home' }` 会把 /create 弹回首页。
     * aria-check 的 FORM_ROUTES 里写了 /create,但同样被弹走,于是那条判据第 49 轮就发现是空转的。
     *
     * 本档用「未开局 + 已同意隐私」两个条件才进得去(守卫:started 为 false 且 privacyAccepted)。
     */
    name: '建号页',
    route: '/create',
    slices: () => ({
      game: {
        started: false,
        saveVersion: 2,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        totalPlaySec: 0,
        createRerolls: null,
        createProfile: null
      },
      settings: {
        privacyAccepted: true,
        sfxOn: false,
        musicOn: false,
        musicVol: 0,
        sfxVol: 0,
        reduceMotion: true,
        battleSpeed: 4,
        decomposeRanks: [],
        smartKeep: { enabled: true, minQuality: 3, keepCoreAffix: true, keepComboPiece: true },
        theme: 'dark'
      }
    }),
    judge: page => {
      // 被守卫弹回首页 = 夹具没生效,本档等于没跑
      if (/修行|洞府|宗门/.test(page.text) && !/道\s*号/.test(page.text)) {
        return ['建号页没渲染出来(被路由守卫弹回了首页?)—— 本档空转']
      }
      const out = []
      if (!/道\s*号/.test(page.text)) out.push('建号页缺「道 号」输入区')
      if (!/灵\s*根/.test(page.text)) out.push('建号页缺灵根一栏')
      if (!page.buttons.some(b => /踏\s*入|开始/.test(b.text))) out.push('建号页没有开始按钮')
      // 读屏两条:aria-check 进不来这页(它铺有存档),只能在这里验
      if (page.headings === 0) out.push('建号页没有任何标题元素(h1/h2/h3),读屏无法按标题定位')
      if (page.unnamedInputs.length > 0) out.push(`建号页有 ${page.unnamedInputs.length} 个无名字段:${page.unnamedInputs.join(' | ')}`)
      return out
    }
  },
  {
    /*
     * 单字段畸形:整片损坏已有「坏档提示」那档管,但存档能解开、只有个别字段是 NaN/Infinity/
     * -1 的情形没有覆盖 —— 那种档 sanitize 会逐字段修,界面不该再去显示坏值。
     *
     * 这一档同时灌坏多个字段,然后走遍主路由,检查可见文案里有没有坏值漏出来。
     * 逐个路由跳完把结果攒在 window 上,最后用 grab 取回来判。
     *
     * **扫整页而不只是 main**(2026-11 修):寿元/灵石那几格在顶栏,不在 main 里 ——
     * 而 `1.7976931348623157e+308/1.013京 载` 正是只在顶栏露出来的。
     *
     * **五类坏值,不只是 NaN/Infinity/undefined**:
     *   · 有限的巨值:`age: MAX_VALUE` 过得了 `Number.isFinite`/`asFiniteNumber`,
     *     裸插值印成 `1.7976931348623157e+308`、经 formatGN 印成 `1.80e308`;
     *   · 超范围时间戳:`8640000000000001` 让 toLocaleString 吐出**英文** `Invalid Date`,
     *     `getMonth()` 返回 NaN 于是印成 `NaN月NaN日`;
     *   · `[object Object]`:字段被灌成对象而不是数字。
     */
    name: '单字段畸形走遍主路由',
    route: '/',
    slices: () => {
      const s = lateSlices()
      /*
       * age 用**有限巨值**而不是 NaN:NaN 被 `isFinite` 挡下,MAX_VALUE 不会 ——
       * 后者才是「过得了守卫、印得出来」的那一类。原先这里灌的是 NaN,
       * 于是新加的正则永远没有输入可抓(实测:拆掉上界+换回裸插值后仍然全绿)。
       */
      s.player.age = Number.MAX_VALUE
      s.player.lifespanBonusYears = Number.MAX_VALUE
      s.player.reincarnation = { ...(s.player.reincarnation ?? {}), count: Number.MAX_VALUE, daoFruit: Number.MAX_VALUE }
      s.settings.lastExportAt = 8_640_000_000_000_001
      s.game = { ...(s.game ?? {}), totalPlaySec: Number.MAX_VALUE }
      s.adventure = {
        ...(s.adventure ?? {}),
        eventMemories: { ev_spring: { eventId: 'ev_spring', times: 3, lastAt: 8_640_000_000_000_001, lastChoiceIdx: 0 } }
      }
      s.player.major = -5
      s.player.exp = { m: NaN, e: Infinity }
      s.resources.spiritStone = { m: NaN, e: 0 }
      s.resources.qi = -999
      s.resources.wudao = NaN
      s.inventory.items = [
        { uid: 'bad1', templateId: 'no_such_template', quality: 'bogus', tier: NaN, level: -3, affixes: [{ id: 'nope', roll: NaN }] }
      ]
      s.inventory.equipped = { weapon: 'ghost_uid' }
      return s
    },
    after: async page => {
      const routes = [
        // 须与 src/router/index.ts 的真实路由逐项对齐。首启两页(/welcome /create)不在其列:
        // 这一档铺的是坏档夹具,路由守卫会把它们弹回首页。
        // 原写 `/endgame` —— 路由表里没有这条,通配兜底把它重定向到 `/`,
        // 于是首页被扫了两遍,而那一项看着像在扫一个终局页(实测 hash 落到 `#/`)。
        '/', '/cultivation', '/adventure', '/inventory', '/character', '/build',
        '/codex', '/souls', '/titles', '/collection', '/market', '/dongfu',
        '/settings', '/celestial', '/world', '/apprentice', '/legacy'
      ]
      const hits = []
      for (const r of routes) {
        await page.evaluate(rt => {
          location.hash = '#' + rt
        }, r)
        await page.waitForTimeout(280)
        const leaked = await page.evaluate(() => {
          const t = document.body?.innerText ?? ''
          /*
           * 科学计数那一段要盖住两种写法:
           *   `1e+300` 来自 JS 的 Number→String(裸插值);
           *   `1.7976931348623157e+308` 同样是裸插值,指数三位;
           *   `1.80e308` 来自 formatGN 的兜底(mantissa 两位 + `e` + 无符号指数)。
           * 只写 `e\+` 会漏掉最后一种 —— 那正是「经 formatGN 渲染」的形态。
           */
          const re = /\bNaN\b|\bInfinity\b|\bundefined\b|\bInvalid Date\b|[0-9]e\+?[0-9]{2,}|\[object Object\]/g
          return (t.match(re) || []).slice(0, 3)
        })
        if (leaked.length) hits.push(`${r}:${leaked.join('/')}`)
      }
      await page.evaluate(h => {
        window.__leaks = h
      }, hits)
    },
    grab: () => ({ text: '', buttons: [], panel: false, leaks: window.__leaks ?? [] }),
    judge: page => {
      const leaks = page.leaks ?? []
      if (!page.text && leaks.length === 0) return []
      return leaks.length === 0
        ? []
        : [`${leaks.length} 个路由把坏值漏到界面上:${leaks.slice(0, 3).join(' | ')}`]
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
  /*
   * 先收掉开局自动浮上来的提示条与教学窗,再跑 after。
   * 顺序不能反:after 里可能要**打开**一扇弹窗(导入确认),先 after 再清理会把它关掉 ——
   * 这一版写错过,报出的是「弹窗没打开」,而实际是刚打开就被自己的清理循环关了。
   */
  for (let i = 0; i < 10; i += 1) {
    if ((await page.locator('.modal-panel').count()) > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(220)
    } else break
  }
  if (scene.after) await scene.after(page)
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
/*
 * 档数由 SCENES.length 数出来,不手写 ——
 * 上一版写死「十一档」,加了「首启全流程」之后仍印十一,而实际跑了十二档。
 * 手写的计数会一直这么说下去,读的人无从发现少算了一档。
 */
console.log(`\n异常路径通过:${SCENES.length} 档(${SCENES.map(s => s.name).join(' / ')})都解释得清`)
