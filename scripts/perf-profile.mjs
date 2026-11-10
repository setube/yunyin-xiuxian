/* eslint-disable no-console -- 自检报告 */
/**
 * 运行时回归门:每个视图采几秒 rAF 帧间隔,量 jank。冷启动归 first-paint。
 *
 * 用法(需已 bun run build,playwright chromium 已装):
 *   bun scripts/perf-profile.mjs               # 全视图
 *   bun scripts/perf-profile.mjs --seconds 4   # 每视图采 4 秒(默认 3)
 *   bun scripts/perf-profile.mjs --view home   # 只量一个视图
 *   bun scripts/perf-profile.mjs --no-gate     # 只报数字,不判红
 *
 * · 每视图独立 context、独立存档,路由写进载入 URL(哈希路由);
 * · 相邻两帧间隔 >50ms 计长帧(Long Task 口径);headless 无 vsync,按 ~60fps 节流。
 */
import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { lateSlices, seedSave, stressSlices, withActiveRun } from "./lib/saveFixture.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
const extOf = (p) => p.slice(p.lastIndexOf("."));

const args = process.argv.slice(2);
/*
 * 不传 --seconds 时 indexOf 返回 -1,args[-1+1] = args[0] 会被当成秒数 ——
 * 而 `--view home` 下 args[0] 是 "--view",Number("--view") 得到 NaN,
 * 于是调度器收到 NaN 超时(node 直接告警 TimeoutNaNWarning),采样只跑了 1 帧。
 * 这也是本门此前「注入卡顿仍报绿」的一半原因。
 */
const si = args.indexOf("--seconds");
const secs = si >= 0 ? Number(args[si + 1] ?? 3) : 3;
const vi = args.indexOf("--view");
const only = vi >= 0 ? args[vi + 1] : undefined;
const gate = !args.includes("--no-gate");
/*
 * 满行囊档:夹具默认只放 2 件装,而玩家真实上限是 BAG_CAPACITY=120 件满词条神品。
 * 性能门的读数因此来自一份「几乎空的行囊」—— 行囊页、构筑页、图鉴页在小档与满档下
 * 的渲染量差一个数量级,小档过线不代表满档过线。
 * 用法:`node scripts/perf-profile.mjs --stress`
 *
 * 两档共用 dist/:两个 perf 命令并行跑时,后启动的那个会先 `bun run build` 重写 dist,
 * 而前者正按需从该目录取资源 —— 读数会混杂甚至 404。故须串行跑,不要同时开两个。
 */
const stress = args.includes("--stress");
/**
 * `--cpu=N`:把 CPU 限速到 1/N。
 *
 * 此前所有读数都是**未限速的桌面 CPU**,而玩家很可能在低端手机上跑。
 * 4x 大致对应中低端安卓机,6x 更接近入门机 —— 限速之后留白会放大,
 * 从这里能看出「桌面看着过关、手机上会不会卡」。
 */
const cpuArg = args.find((a) => /^--cpu=/.test(a));
const cpuRate = cpuArg === undefined ? 1 : Number(cpuArg.slice(6));
if (!Number.isFinite(cpuRate) || cpuRate < 1 || cpuRate > 20) {
  console.error("--cpu 须是 1~20 的数(1 为不限速)");
  process.exit(1);
}
/**
 * `--rtt=MS --bw=KBPS`:模拟网络往返与带宽。
 *
 * 本地服务器没有延迟,20 个请求几乎免费 —— 只在本机测 chunk 数,会得出
 * 「拆多拆少都一样」的结论,而真实网络不是。这两个参数把请求数的影响测出来。
 * 都不给时不动网络(保持本地直连)。
 */
const rttArg = args.find((a) => /^--rtt=/.test(a));
const bwArg = args.find((a) => /^--bw=/.test(a));
const rttMs = rttArg === undefined ? 0 : Number(rttArg.slice(6));
const bwKbps = bwArg === undefined ? 0 : Number(bwArg.slice(5));

/**
 * 开一页,并按 `--cpu` 装好限速。
 *
 * **所有取页面的地方都必须走这里,不要直接 `context.newPage()`。**
 * 上一轮加限速时,三个分支(巡页 / --memory / --startup)各写一遍 `throttle()`,
 * 结果漏了 `--startup` 那处 —— 4x 限速下启动分段读出来和未限速一模一样,
 * 而同一轮的挂载期长任务是 340ms,两个数对不上才发现。
 *
 * 收成一个入口之后,再加新分支也不会漏。
 */
async function openPage(context) {
  const page = await context.newPage();
  if (cpuRate > 1 || rttMs > 0 || bwKbps > 0) {
    const cdp = await context.newCDPSession(page);
    if (cpuRate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });
    if (rttMs > 0 || bwKbps > 0) {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: rttMs,
        // CDP 的吞吐单位是 bytes/s;--bw 用 KB/s 更顺手,-1 表示不限
        downloadThroughput: bwKbps > 0 ? bwKbps * 1024 : -1,
        uploadThroughput: bwKbps > 0 ? bwKbps * 1024 : -1,
      });
    }
  }
  return page;
}
/**
 * `--no-save`:不注入存档,走欢迎页。
 *
 * 用来把「启动固定开销」拆成两半:有存档时要跑 settleOffline(离线整段结算)
 * 与 checkStateAchievements(补扫全部成就),无存档时两者都不跑。
 * 两次读数之差就是这两件事的代价。
 */
const noSave = args.includes("--no-save");
/**
 * `--startup`:只跑一次启动,把 main.ts / engine.ts 里那几处 performance.mark
 * 之间的间隔打出来。用来回答「进任何页面都有的那块长任务花在哪」。
 */
const startupOnly = args.includes("--startup");
/**
 * `--memory`:长会话内存那档。
 *
 * 进首页后每隔一段时间强制 GC 再读堆,看驻留内存是否持续爬升。
 * 三个时间点足够分出「一次性初始化」与「每 tick 泄漏」:
 *   · 三次数值持平 → 没有累积
 *   · 单调上升     → 每次采样之间都在攒东西
 *
 * 采样前必须 gc():不回收的话量到的是待回收垃圾,任何页面看起来都在涨。
 */
const memoryOnly = args.includes("--memory");
/** `--curve`:空包 vs 满包的启动增量(存档变大的代价),判据见下方 curveOnly 分支 */
const curveOnly = args.includes("--curve");
/**
 * `--active`:给内存档挂一场在途历练,让引擎每 tick 真的打一场。
 *
 * 不加这个开关时页面是空闲的 —— 空闲心跳几乎不分配,量出来必然平,
 * 那样「没有泄漏」证明不了什么。加了才有真实负载(战斗、掉落、事件、战报)。
 */
const activeLoad = args.includes("--active");
/** 内存采样点数与间隔:`--memory-rounds=N --memory-gap=MS`,长时档调大两者 */
const roundsArg = args.find((a) => /^--memory-rounds=/.test(a));
const gapArg = args.find((a) => /^--memory-gap=/.test(a));
const memoryRounds = roundsArg === undefined ? 4 : Number(roundsArg.slice(16));
const memoryGapMs = gapArg === undefined ? 3000 : Number(gapArg.slice(13));
/**
 * `--items=N`:stress 夹具的行囊件数(默认 120 = BAG_CAPACITY)。
 * 配合 `--startup` 可以画出「启动开销 × 存档大小」的增长曲线。
 */
const itemsArg = args.find((a) => /^--items=/.test(a));
const itemCount = itemsArg === undefined ? 120 : Number(itemsArg.slice(8));
if (!Number.isInteger(itemCount) || itemCount < 0 || itemCount > 120) {
  console.error("--items 须是 0~120 的整数(行囊上限 120)");
  process.exit(1);
}

/**
 * 判据上限:本机读数留数倍余量(机型/负载差异),只拦成倍回退。
 * 显著改动渲染量后须重校,并同步 README「性能自检」一节。
 */
const BUDGET = {
  /** 单视图最差帧间隔上限,单位 ms;无头基准 ~16-17ms,留到 5 倍 */
  maxFrameMs: Number(process.env.PERF_MAX_FRAME_MS ?? 100),
  /** 单视图 >50ms 长帧数量上限 */
  longFramesMax: Number(process.env.PERF_LONG_FRAMES ?? 2),
  /** 单视图 DOM 节点下限:防量到空白/被重定向的页而空转 */
  minNodes: Number(process.env.PERF_MIN_NODES ?? 20),
  /**
   * 挂载期长任务总耗时上限,单位 ms。
   *
   * 帧间隔那一列在所有页面恒为 17ms(浏览器稳定 60fps),158 个节点的页与 703 个
   * 节点的页读出来一模一样,分不出谁更贵。挂载期长任务才有区分度:
   * 实测其余页面各 1 块 ~68ms,而 /world 是 2 块 120ms —— 它要现场凝界。
   *
   * 定 250ms:比当前最贵的 /world(120ms) 留一倍余量,又不至于放到「随便卡都过」。
   */
  /*
   * 挂载期长任务预算。
   *
   * 250ms 是给**不限速**基线定的(实测最贵 66ms,留近四倍)。`--cpu=N` 限速时
   * 同一条链路会按 N 倍放大 —— 2x 下实测 129~206ms,偶发一次 GC 抖动就到 347ms。
   * 故限速档按倍数放宽:不是把绝对阈值改大,而是让它在各自基准上保留同样的余量。
   * 上限封 1000ms,再高就没有约束意义了。
   */
  mountLongTaskMs: Math.min(
    1000,
    Number(process.env.PERF_MOUNT_LONG_TASK_MS ?? 250) * Math.max(1, Math.min(cpuRate, 4))
  ),
  /**
   * 单视图采样帧数下限:防「页面被长任务卡死,几乎采不到帧」被判成通过。
   *
   * 实测踩过:在 App.vue 里注入一个每 100ms 占 80ms 的忙循环后,
   * home 视图只采到 frames=1、max=-13ms(负数),而本门照样报 ✓ ——
   * 因为判据只查 DOM 节点数、最差帧与长帧数,唯独不查「到底采了几帧」。
   * 帧数不足时 max/median 全是无意义读数,拿它判红判绿都是在赌。
   *
   * 下限取每视图采样秒数 × 20:headless 按 ~60fps 节流,正常档实测约 60fps;
   * 留到 1/3 是容许首帧冷启动与 gc 抖动。
   */
  minFramesPerSecond: Number(process.env.PERF_MIN_FPS ?? 20),
};

function startServer() {
  return new Promise((res) => {
    const server = createServer((req, r) => {
      const url = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
      if (rel.includes("..")) return r.writeHead(400).end("bad");
      try {
        const body = readFileSync(join(DIST, rel));
        const type = MIME[extOf(rel)] ?? "application/octet-stream";
        /*
         * 按真实部署的行为压缩。
         *
         * 不压缩时首屏要传 918KB(未压缩的 28 个 JS 模块),而 Pages/Nginx 上只有
         * 343KB —— 差了 2.7 倍。之前模拟弱网测出的 6.2s 就是这个失真放大出来的:
         * 918KB / 200KBps = 4.6s,而真实该是 1.7s。
         * 只压文本类,woff2/png 本身就是压缩格式,再压反而变大。
         */
        const compressible = /\.(js|css|html|json|svg|txt)$/i.test(rel);
        if (compressible && /gzip/.test(req.headers["accept-encoding"] ?? "")) {
          const gz = gzipSync(body);
          r.writeHead(200, { "content-type": type, "content-encoding": "gzip", "content-length": gz.length });
          r.end(gz);
          return;
        }
        r.writeHead(200, { "content-type": type, "content-length": body.length });
        r.end(body);
      } catch {
        r.writeHead(404).end("nf");
      }
    });
    server.listen(0, "127.0.0.1", () => res(server));
  });
}

/** 欢迎页与建号页有档即被路由重定向,不列入 */
const VIEWS = [
  { route: "/", name: "home" },
  { route: "/cultivation", name: "cultivation" },
  { route: "/adventure", name: "adventure" },
  { route: "/inventory", name: "inventory" },
  { route: "/character", name: "character" },
  { route: "/codex", name: "codex" },
  { route: "/souls", name: "souls" },
  { route: "/titles", name: "titles" },
  { route: "/settings", name: "settings" },
  { route: "/build", name: "build" },
  { route: "/collection", name: "collection" },
  { route: "/legacy", name: "legacy" },
  { route: "/dongfu", name: "dongfu" },
  { route: "/world", name: "world" },
  { route: "/celestial", name: "celestial" },
];

/** 页内 rAF 采样器,`__perfStop()` 汇总;IIFE 套 void,`evaluate(SAMPLER)` 才不等未 resolve 的 Promise */
const SAMPLER = `
  void (() => {
    let resolveFn;
    window.__perf = new Promise((r) => { resolveFn = r; });
    const frames = [];
    let last = performance.now();
    let raf;
    function step(now) {
      frames.push(now - last);
      last = now;
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    /*
     * 长任务只统计「主线程被独占 50ms 以上」的块 —— 这是渲染开销的直接量度。
     *
     * 帧间隔读数在所有页面都相同(浏览器稳定 60fps 时恒为 17ms),158 个节点的页
     * 与 703 个节点的页读出来一模一样,分不出谁更贵。长任务才能分出高低。
     */
    const longTasks = [];
    let ltObserver = null;
    try {
      ltObserver = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) longTasks.push(e.duration);
      });
      ltObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      // 浏览器不支持 longtask(旧 WebKit / 未开启实验标志):留空数组,报告里标 n/a
    }
    window.__perfStop = () => {
      cancelAnimationFrame(raf);
      if (ltObserver) ltObserver.disconnect();
      const n = frames.length;
      const s = [...frames].sort((a, b) => a - b);
      const p = (q) => s[Math.min(n - 1, Math.floor(q * n))];
      const long = frames.filter((f) => f > 50).length;
      resolveFn({
        frames: n,
        max: Math.round(p(1)),
        p95: Math.round(p(0.95)),
        median: Math.round(p(0.5)),
        over50ms: long,
        nodes: document.querySelectorAll('*').length,
        title: document.title,
        // 长任务:块数 / 总耗时 / 最久一块。不支持 longtask 时为 null,与「零长任务」区分开
        longTaskCount: ltObserver ? longTasks.length : null,
        longTaskTotalMs: ltObserver ? Math.round(longTasks.reduce((a, b) => a + b, 0)) : null,
        longTaskMaxMs: ltObserver && longTasks.length > 0 ? Math.round(Math.max(...longTasks)) : 0,
      });
      return window.__perf;
    };
  })();
`;

const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  // --expose-gc:长会话内存那档要在采样前强制回收,否则量到的是待回收垃圾而非驻留
  args: ["--disable-dev-shm-usage", "--no-sandbox", "--js-flags=--expose-gc"],
});
const results = [];
const failures = [];

/*
 * `--memory`:长会话驻留内存。
 *
 * 每轮先 gc() 再读 performance.memory.usedJSHeapSize —— 不回收读到的是待回收垃圾,
 * 任何页面都会看起来在涨。四个采样点跨约 9 秒,足以分出「一次性初始化」与「每 tick 累积」。
 */
if (memoryOnly) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const baseSlices = stress ? stressSlices(itemCount) : lateSlices();
  await seedSave(context, activeLoad ? withActiveRun(baseSlices) : baseSlices);
  const page = await openPage(context);
  const route = only ? (VIEWS.find((v) => v.name === only)?.route ?? "/") : activeLoad ? "/adventure" : "/";
  /*
   * 导航失败要说清楚是哪一步,别把 node 的栈甩给读报告的人。
   * 实测 `--memory --active --view inventory` 偶发 `goto` 30s 超时(同一配置连跑 5 次都过,
   * 撞上时是一整段未捕获异常,连浏览器都没关)。
   */
  try {
    await page.goto(base + `#${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.error(`✗ 内存档打不开 #${route}:${String(err).split("\n")[0]}`);
    await context.close().catch(() => {});
    await browser.close();
    server.close();
    process.exit(1);
  }
  await page.waitForTimeout(2500);

  /*
   * 走 CDP 的 Runtime.getHeapUsage,不用 performance.memory。
   *
   * 实测 `performance.memory.usedJSHeapSize` 在本机 chromium 里是**fixed 值**:
   * 连续持有 40×20 万个元素的数组,读数纹丝不动(9.54MB → 9.54MB),
   * 而同一时刻 CDP 报 0.9 → 31.4MB。用它当判据等于空转。
   */
  const cdp = await context.newCDPSession(page);
  /*
   * 采样返回**原始字节**与展示用的 MB 两样。
   *
   * 「读数全程不变 = 度量失效」这条守卫必须看原始字节:显示值取整到 0.1MB,
   * 而 GC 后的驻留本身在几十 KB 量级随机游走(实测 4 点:5883664 → 5861740 → 5857920 → 5861580),
   * 取整后四点全成 5.6MB —— 于是一次正常的平坦测量被误判成「测量手段坏了」。
   */
  const sample = async () => {
    await page.evaluate(() => globalThis.gc?.());
    await page.waitForTimeout(120);
    const { usedSize } = await cdp.send("Runtime.getHeapUsage");
    return { bytes: usedSize, mb: Math.round((usedSize / 1048576) * 10) / 10 };
  };

  const samples = [];
  for (let i = 0; i < memoryRounds; i += 1) {
    if (i > 0) await page.waitForTimeout(memoryGapMs);
    samples.push(await sample());
  }
  const points = samples.map((s) => s.mb);

  console.log(`\n长会话内存(#${route},${memoryRounds} 点 × 间隔 ${memoryGapMs / 1000}s,采样前强制 GC):`);
  console.log(`  ${points.map((v) => `${v}MB`).join(" → ")}`);

  const known = points.filter((v) => Number.isFinite(v));
  /*
   * 守卫看**原始字节**是否一个字都没变 —— 那才是「度量手段失效」(例如退回 performance.memory)。
   * 显示值全同不算:0.1MB 的取整分辨率挡不住几十 KB 的正常抖动。
   */
  const rawBytes = samples.map((s) => s.bytes).filter((v) => Number.isFinite(v));
  const rawFrozen = rawBytes.length >= 2 && rawBytes.every((v) => v === rawBytes[0]);
  if (known.length < 2 || rawFrozen) {
    console.log("  ✗ 堆读数全程不变 —— 度量手段失效,这一档等于空转");
    process.exitCode = 1;
  } else {
    /*
     * 判据:最后一次相对第一次的涨幅。
     *
     * 15MB 是「明显在漏」的门槛 —— 一个 tick 只漏几 KB 的量级在 9 秒里看不出来,
     * 但真漏(定时器没清、监听没解绑)通常每轮几十 KB 到几 MB,9 秒足够跨过这个数。
     * 取绝对值而非百分比:基线 10MB 时百分比会放大正常波动。
     */
    const first = known[0];
    const last = known[known.length - 1];
    const delta = Math.round((last - first) * 10) / 10;
    /*
     * 除首末差,再看**斜率**。
     *
     * 只看首末差会漏两种形态:先涨后降(GC 时点差异)与「匀速小涨但总量没到阈值」。
     * 斜率把整串点都算进去,能分出「收敛到平台」(实测首页 5.1→5.5 后停住)
     * 与「一路向上」(真泄漏)。
     */
    const n = known.length;
    const meanX = (n - 1) / 2;
    const meanY = known.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i += 1) {
      num += (i - meanX) * (known[i] - meanY);
      den += (i - meanX) ** 2;
    }
    const slopePerPoint = den === 0 ? 0 : num / den;
    const totalSec = ((n - 1) * memoryGapMs) / 1000;
    console.log(
      `  首末差 ${delta >= 0 ? "+" : ""}${delta}MB,斜率 ${slopePerPoint.toFixed(2)}MB/点(约 ${totalSec}s 跨度)`
    );
    /*
     * 判据取两条之较:
     *  · 首末差 > 15MB —— 已经漏到肉眼可见
     *  · 斜率 > 1.5MB/点 —— 还在匀速往上爬,哪怕总量还没到 15MB
     * 1.5MB/点是实测噪声的十倍(首页 12 点串的斜率约 0.03),不会把波动判成泄漏。
     */
    const overDelta = delta > 15;
    const overSlope = slopePerPoint > 1.5;
    if (overDelta || overSlope) {
      console.error(
        `✗ 驻留内存在累积(首末差 ${delta}MB,斜率 ${slopePerPoint.toFixed(2)}MB/点)` +
          (overDelta ? " —— 总量已过阈值" : " —— 总量未过阈值但仍在匀速上涨")
      );
      process.exitCode = 1;
    } else {
      console.log("✓ 驻留内存没有持续累积");
    }
  }
  await context.close();
  await browser.close();
  server.close();
  process.exit(process.exitCode ?? 0);
}

/*
 * `--startup`:进一次首页,把启动那几段标记的间隔打出来。
 *
 * 不进这个分支时完全不影响常规巡页。
 */
/**
 * 量一次启动:返回 `{ computeMs, segments }`,`computeMs` 是「扣掉 boot:start 之前网络等待」的主线程那一截。
 *
 * 抽成函数是为了 `--curve`:它要在同一进程里各量一次空包与满包,
 * 跨进程跑两次会带上机器负载差异,比不出「存档变大到底多花了多少」。
 */
async function measureStartup(viewport, slices) {
  const context = await browser.newContext({ viewport });
  await seedSave(context, slices);
  const page = await openPage(context);
  await page.goto(base + "#/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const marks = await page.evaluate(() =>
    performance.getEntriesByType("mark").map((m) => ({ name: m.name, at: Math.round(m.startTime * 100) / 100 }))
  );
  const byName = new Map(marks.map((m) => [m.name, m.at]));
  const order = [
    "boot:start",
    "boot:preflight",
    "boot:sanitize",
    "boot:engineStart",
    "boot:offlineInputs",
    "boot:offlineSettled",
    "boot:achievements",
    "boot:mounted",
  ];
  let prev = null;
  const segments = [];
  for (const name of order) {
    if (!byName.has(name)) continue;
    const at = byName.get(name);
    segments.push({ name, at, delta: prev === null ? at : Math.round((at - prev) * 100) / 100 });
    prev = at;
  }
  const last = prev;
  const computeMs =
    last !== null && byName.has("boot:start") ? Math.round((last - byName.get("boot:start")) * 100) / 100 : last;
  await context.close();
  return { computeMs, total: last, segments };
}

/*
 * `--curve`:同一进程里量「空包 → 满包」的启动增量。
 *
 * 为什么要它:`--items` 一直只是个手动开关,没有任何判据消费它 ——
 * 存档变大到底多花了多少主线程时间,此前只有人工读数,回归了没人拦。
 *
 * 不跨进程各跑一次的理由:那会带上两次之间的机器负载差异,比不出「存档变大的代价」。
 * 同进程连着量,空包与满包吃的是同一份机器状态。
 *
 * 判据定「满包 ≤ 空包 + 75ms」。推导:
 *   · 四次同进程实测增量 54.3 / 56.0 / 53.3 / 53.7ms,均值 54.3、最大 56.0;
 *   · 先按 60ms 定过一版,余量只剩 4ms(7%)—— 噪声就能顶过线,那是误报源不是判据;
 *   · 取均值 × 1.4 ≈ 76,取整 75:既容得下噪声,又能在「每件多花半毫秒」这种量级回归时翻红
 *     (120 件 × 0.5ms = 60ms,叠加到现基础上必然越线)。
 *
 * 不卡绝对值的理由 —— 机器快慢会整体平移,而**增量**才是「存档变大」的代价。
 */
if (curveOnly) {
  const viewport = { width: 390, height: 844 };
  const empty = await measureStartup(viewport, stressSlices(0));
  // 120 = src/data/constants.ts 的 BAG_CAPACITY;.mjs 读不了 TS,与 --items 的默认值同源
  const full = await measureStartup(viewport, stressSlices(120));
  const grow = Math.round((full.computeMs - empty.computeMs) * 10) / 10;
  const CURVE_BUDGET_MS = Number(process.env.PERF_CURVE_MS ?? 75);
  console.log(`\n启动开销曲线(主线程,空包 → 满包 120 件):`);
  console.log(`  空包   ${empty.computeMs}ms`);
  console.log(`  满包   ${full.computeMs}ms`);
  console.log(`  增量   +${grow}ms —— 判据 ≤ ${CURVE_BUDGET_MS}ms`);
  if (grow > CURVE_BUDGET_MS) {
    console.error(`\n✗ 满包启动比空包多 ${grow}ms,超过 ${CURVE_BUDGET_MS}ms —— 存档变大在启动路径上变贵了`);
    process.exitCode = 1;
  } else {
    console.log("✓ 存档变大带来的启动增量在预算内");
  }
  await browser.close();
  server.close();
  process.exit(process.exitCode ?? 0);
}

if (startupOnly) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await seedSave(context, stress ? stressSlices(itemCount) : lateSlices());
  const page = await openPage(context);
  await page.goto(base + "#/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  const marks = await page.evaluate(() =>
    performance.getEntriesByType("mark").map((m) => ({ name: m.name, at: Math.round(m.startTime * 100) / 100 }))
  );
  /*
   * 顺序必须按**真实**打点次序,不是按「直觉上该在哪个阶段」。
   *
   * `boot:engineStart` 系那一串是 App.vue 的 `onMounted` 里跑的,
   * 而 `onMounted` 在 `app.mount()` **返回之前**就同步执行完了 ——
   * 于是 engineStart 比 main.ts 里紧随 `app.mount()` 之后的 `boot:mounted` 还要早。
   * 原先把它排在 mounted 之后,实测每次都算出负增量(+-5.3ms),
   * 报表上看起来像「有一段花了 -5 毫秒」,而那只是顺序写错了。
   */
  const order = [
    "boot:start",
    "boot:preflight",
    "boot:sanitize",
    "boot:engineStart",
    "boot:offlineInputs",
    "boot:offlineSettled",
    "boot:achievements",
    "boot:mounted",
  ];
  const byName = new Map(marks.map((m) => [m.name, m.at]));
  console.log("\n启动分段(ms,相对导航起点):");
  let prev = null;
  for (const name of order) {
    if (!byName.has(name)) continue;
    const at = byName.get(name);
    const delta = prev === null ? at : Math.round((at - prev) * 100) / 100;
    console.log(`  ${name.padEnd(22)} @${String(at).padStart(8)}  +${delta}`);
    prev = at;
  }
  /*
   * 末尾取**序列里最后一个实际存在的标记**,不写死某个名字。
   * 写死 `boot:achievements` 时,它在 engineStart 之后、mounted 之前,
   * 于是「启动合计」漏掉 mounted 那一段(实测 142.2 vs 142.3 —— 这次差 0.1ms,
   * 但顺序一改就可能差出整段)。
   */
  const last = prev;
  /*
   * 启动合计也进判据。
   *
   * 判据看的是**主线程计算**那一段(见下面 computeMs),现在实测 late ≈ 51ms、stress(满包)≈ 100ms。
   * 行囊上限 120 件 ≈ 36KB,stress 夹具已接近最坏情况 —— 玩家再怎么样也不会比它更差。
   * 故 250ms 是「最坏情况再留一倍半余量」,不是随手取整。
   *
   * 旧注释写的是「late 108ms、stress 161ms」—— 那两个数是加了 `boot:start` 之前的导航等待、
   * 或喂给判据的口径不同时的读数,与现在 `computeMs` 的定义对不上,已按实测更新。
   */
  /*
   * 启动预算同样按限速倍数放宽。
   *
   * 250ms 是给不限速基线定的;4x 下主线程实测约 206ms(未限速约 51ms),各段都按 4 倍放大。
   * 拿绝对 250ms 卡限速档只会误报。
   */
  /*
   * 启动预算是对**主线程计算**定的,不含网络等待。
   *
   * 模拟弱网(--rtt/--bw)时 boot:start 之前会有几秒的下载与解析,
   * 那是网络时间,不该拿 CPU 预算去卡它 —— 卡了只会得到「弱网很慢」这种没用的结论。
   * 故预算只比 boot:start 之后的那一段。
   */
  const computeMs = last !== null && byName.has("boot:start") ? Math.round((last - byName.get("boot:start")) * 100) / 100 : last;
  const STARTUP_BUDGET_MS = Number(process.env.PERF_STARTUP_MS ?? 250) * Math.max(1, Math.min(cpuRate, 4));
  if (last !== null) {
    const total = Math.round(last * 100) / 100;
    console.log(`  ${"(启动合计)".padEnd(20)} ${total}ms`);
    if (computeMs !== null && computeMs !== total) {
      console.log(`  ${"(其中主线程)".padEnd(18)} ${computeMs}ms —— 判据只看这一段,前面是网络等待`);
    }
    if (computeMs !== null && computeMs > STARTUP_BUDGET_MS) {
      console.error(`\n✗ 启动主线程 ${computeMs}ms > 预算 ${STARTUP_BUDGET_MS}ms`);
      process.exitCode = 1;
    } else {
      console.log(`✓ 启动主线程在预算内(≤ ${STARTUP_BUDGET_MS}ms)`);
    }
  }
  await context.close();
  await browser.close();
  server.close();
  process.exit(process.exitCode ?? 0);
}
for (const view of VIEWS) {
  if (only && view.name !== only) continue;
  let record = null;
  /*
   * context 必须在外层声明并在 finally 里收 —— 记在 try 里的话,视图一抛异常就永远关不掉。
   *
   * 踩过:4x 限速下 goto 偶发超时,那一页的 context 带着整个渲染进程留着;
   * 后面几个视图接着开新 context,内存与句柄越堆越多,于是**崩的页一个比一个多**
   * (实测同一轮里 codex 与 dongfu 先后超时,单独跑这两个都过)。
   * 一个假崩溃会把后面几页一起拖红,读数就全不可信了。
   */
  let context = null;
  try {
    context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    // 每视图注入一份后期档;缺档会落到欢迎页,门量空
    if (!noSave) {
      const base = stress ? stressSlices() : lateSlices();
      // `--active` 让引擎每 tick 真打一场:本档原先只量静置页面,而放置游戏的时间
      // 大多花在「历练在途」这种持续产生战斗与战报的状态上
      await seedSave(context, activeLoad ? withActiveRun(base) : base);
    }
    const page = await openPage(context);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("crash", () => errors.push("RENDERER_CRASH"));
    /*
     * 长任务观测器必须在**导航前**装上。
     *
     * 采样器是导航 + 2.5s 之后才 evaluate 的,那时首屏已经渲染完、主线程闲着,
     * 长任务恒为 0 —— 量不到真正贵的那一段(挂载、首帧、首屏数据拉取)。
     */
    await page.addInitScript(() => {
      window.__mountLongTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__mountLongTasks.push(e.duration);
        }).observe({ entryTypes: ['longtask'] });
      } catch {
        window.__mountLongTasks = null;
      }
    });
    const url = base + `#${view.route}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    const mountTasks = await page.evaluate(() => window.__mountLongTasks);
    await page.evaluate(SAMPLER);
    await page.waitForTimeout(secs * 1000);
    const data = await page.evaluate("window.__perfStop()");
    record = {
      name: view.name,
      route: view.route,
      ...data,
      // 挂载期长任务(导航 → 稳定):首屏到底贵不贵就看这一段
      mountLongTaskCount: Array.isArray(mountTasks) ? mountTasks.length : null,
      mountLongTaskTotalMs: Array.isArray(mountTasks) ? Math.round(mountTasks.reduce((a, b) => a + b, 0)) : null,
      mountLongTaskMaxMs: Array.isArray(mountTasks) && mountTasks.length > 0 ? Math.round(Math.max(...mountTasks)) : 0,
      errors
    };
  } catch (err) {
    record = { name: view.name, route: view.route, crashed: String(err).slice(0, 160) };
  } finally {
    // 成功与失败都要收:失败的 context 留着,后面几页会被它拖崩(见外层注释)
    await context?.close().catch(() => {});
  }
  results.push(record);
}
await browser.close();
server.close();

// ---- 报告 ----
for (const r of results) {
  const state = r.crashed
    ? `✗ ${r.name} CRASHED: ${r.crashed}`
    : `✓ ${r.name.padEnd(11)} frames=${r.frames} max=${r.max}ms p95=${r.p95}ms med=${r.median}ms >50ms=${r.over50ms} ` +
      `挂载期=${r.mountLongTaskCount === null ? "n/a" : `${r.mountLongTaskCount}块/${r.mountLongTaskTotalMs}ms(最久 ${r.mountLongTaskMaxMs}ms)`} dom=${r.nodes}${
        r.errors.length ? ` errors=${r.errors.join("|").slice(0, 60)}` : ""
      }`;
  console.log(state);
  if (r.crashed) failures.push(`${r.name}: 崩溃 (${r.crashed})`);
  else if (r.errors.length) failures.push(`${r.name}: 页面异常 (${r.errors[0].slice(0, 80)})`);
  else if (gate && r.nodes < BUDGET.minNodes)
    failures.push(`${r.name}: 只渲染了 ${r.nodes} 个节点(< ${BUDGET.minNodes})—— 视图没出来,门空转`);
  else if (gate && r.frames < BUDGET.minFramesPerSecond * secs)
    failures.push(
      `${r.name}: 只采到 ${r.frames} 帧(< ${BUDGET.minFramesPerSecond * secs})—— 页面被长任务卡死,max/median 都不可信,本门等于空转`,
    );
  else if (gate && !(r.max > 0))
    failures.push(`${r.name}: 最差帧读数 ${r.max}ms 非正数 —— 帧间隔没测出来`);
  else if (gate && r.max > BUDGET.maxFrameMs)
    failures.push(`${r.name}: 最差帧 ${r.max}ms > ${BUDGET.maxFrameMs}ms`);
  else if (gate && r.over50ms > BUDGET.longFramesMax)
    failures.push(`${r.name}: ${r.over50ms} 帧 >50ms 长帧 > ${BUDGET.longFramesMax}`);
  else if (gate && r.mountLongTaskTotalMs !== null && r.mountLongTaskTotalMs > BUDGET.mountLongTaskMs)
    failures.push(
      `${r.name}: 挂载期长任务共 ${r.mountLongTaskTotalMs}ms(最久一块 ${r.mountLongTaskMaxMs}ms)> ${BUDGET.mountLongTaskMs}ms —— 进页时主线程被独占了这么久`
    );
}

console.log(
  `\n判据:最差帧 ≤ ${BUDGET.maxFrameMs}ms · 长帧 ≤ ${BUDGET.longFramesMax} · ` +
    `挂载期长任务 ≤ ${BUDGET.mountLongTaskMs}ms · DOM ≥ ${BUDGET.minNodes} · 无崩溃/异常`,
);
if (failures.length > 0) {
  console.log(`✗ 有 ${failures.length} 处超限:`);
  for (const f of failures) console.log(`   - ${f}`);
  process.exitCode = 1;
} else {
  console.log(`✓ 全部 ${results.length} 个视图在预算内`);
}
