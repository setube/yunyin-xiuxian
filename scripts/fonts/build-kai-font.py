#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools>=4.50", "brotli>=1.1"]
# ///
"""
生成随游戏分发的楷体子集(切片):src/assets/fonts/lxgw-wenkai-gb-screen-subset-*.woff2
与它们的 @font-face 声明(src/assets/fonts/kai-subset.css)

用法:
    uv run scripts/fonts/build-kai-font.py                # 母体在缓存里就直接用
    uv run scripts/fonts/build-kai-font.py --master path/to/LXGWWenKaiGBScreen.ttf
    uv run scripts/fonts/build-kai-font.py --source public/fonts/lxgw-full.woff2  # 离线:从已入库的全量字库再切

为什么要**切片**而不是一份大子集
--------------------------------
一份 1.8MB 的子集在冷启动时是整份下载的:首屏要传的字节里 67% 是它(实测 2681KB 里
1783KB),而首屏真正用到的字不过一两百个 —— 剩下的是「将来可能会用」的储备。

浏览器的 `unicode-range` 正好能按需取:同一族声明多份 @font-face,每份一段码位区间,
只有页面上真出现该区间里的字时,那一份才会被下载。于是这里按**用法频次**切片:

    第 1 片 —— 语料里出现最多的那些字(累计占全部出现次数的一半以上):日常界面基本被它兜住
    第 2、3、4 片 —— 依次更冷的字(各方神兽、生僻名号、罕见功法名)
    第 5 片 —— 语料里没出现过、但 GB2312 里有的字(玩家自己起名要用的储备)

冷启动因此只取第 1 片(必要时加第 2 片),而「名字里有个生僻字」这种情况照旧能画出来
—— 取不到的字仍会回退系统字体,只是那一份也会被按需拉下来。取舍与实测见
scripts/first-paint.mjs 与 docs/development.md 的首屏一节。

为什么要有这个脚本
------------------
安卓不带楷体(iOS 有 Kaiti SC、Windows 有 KaiTi),而整套水墨味的标题、境界名都
压在楷体上 —— 所以字体得随包走。母体 24.8MB 太重,故裁成子集:只留游戏用得到的字
(源码里出现的全部字符)+ GB2312 全字集(覆盖日常汉字与玩家输入的名字),24.8MB → 1.5MB。

为什么是「GB 屏幕阅读版」这一支(而不是原版霞鹜文楷)
----------------------------------------------------
两处都是换它的理由,且与原来那份同版本(v1.522):
  · **GB 字形**:原版霞鹜文楷源自日本 Klee One,带日式字形 —— 「这 边 过 运 巡 遍 遥 道」
    的辶旁是日式两点辶,「令 骨 直 真」也不合大陆规范。GB 版按 G 源改过,对简体玩家
    来说这是对错,不是审美。
  · **屏幕阅读优化**:笔画更实,小字号(本项目 UI 大量 10~13px)可读性明显更好。
两点都在同屏对比里量过:替换前后游戏用字覆盖不变(仅 8 个非汉字符号由系统符号字体画)。

母体覆盖 20992 个汉字(远超《通用规范汉字表》8105),所以子集**能**收多少只取决于
CHAR_SET 的选择,不取决于母体 —— 哪天要把生僻名字也纳入,改这里的字集即可。

为什么仓库里放的是**产物**而不是构建时下载
----------------------------------------
产物本来就要随 APK 一起打包,构建时再下载只让仓库变小、产物一点没变,却把发版
流水线挂到外网上(实测从 GitHub 拉这 24MB 要五分钟以上、连续超时两次)。所以:
子集入库、母体不入库,要重做时用这个脚本 —— 下载只发生在**重新生成**这一次。

协议
----
霞鹜文楷(LXGW WenKai)为 SIL OFL 1.1。其 OFL 文本附了一条额外许可:子集化并转成
WOFF/WOFF2 用于网页字体分发时,**可以保留保留字体名**(霞鹜 / LXGW 等),只要不作为
可安装的桌面字体再分发 —— 本脚本正是这个用途。协议全文随字体一起放在
public/fonts/OFL.txt,再分发时别把它落下。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
import urllib.request

FONT_VERSION = "v1.522"
MASTER_URL = f"https://github.com/lxgw/LxgwWenKai-Screen/releases/download/{FONT_VERSION}/LXGWWenKaiGBScreen.ttf"
# 母体的 sha256:换版本时先改 URL 与这个哈希,再跑一次脚本
MASTER_SHA256 = "23ec023913e1851925eb94462c4b0ccd1d78bb89533745aaa8cc682ccd339dc0"

ROOT = pathlib.Path(__file__).resolve().parents[2]
# 产物放 src/assets 而不是 public:style.css 里用相对 url() 引它,Vite 才会改写
# 成带 hash、且认得 base 的地址(vite.config 的 base 是 './',写死 /fonts/… 在
# GitHub Pages 那种子路径部署下会 404)。协议文本放 public,原样进产物。
OUT_DIR = ROOT / "src/assets/fonts"
OUT_CSS = OUT_DIR / "kai-subset.css"
META = ROOT / "scripts/fonts/kai-subset.meta.json"
CHARS = ROOT / "scripts/fonts/kai-subset.chars.txt"
CACHE = pathlib.Path("/tmp/lxgw-wenkai-cache")

# 切片数:再多就只是把请求数堆上去(每片都要一次往返),再少则第一片太肥。
CHUNKS = 5

# 界面一定会用到、但未必出现在源码字面量里的字符:ASCII、常用标点与全角符号
EXTRA = (
    "".join(chr(c) for c in range(0x20, 0x7F))
    + "　、。〈〉《》「」『』【】〔〕—…·～×÷％＋－°※→←↑↓√✓○●◆◇■□★☆"
)

# 允许「由系统符号/emoji 字体去画」的字符 —— 它们不是汉字,楷体里也没有,
# 混排时由系统字体补上(▾ 之类的箭头、✧ 之类的装饰),这是正常的回退,不是缺字。
# 生成时会核对:凡是不在字体里、又不在这份名单里的字,一律让脚本**报错退出** ——
# 换母体、加内容时最容易发生的就是「某个字悄悄没了」,而它在界面上只表现为
# 一个字形突然换成衬线,没人会报 bug。
SYMBOLS_FROM_SYSTEM = set("✧◈▸▾▬✅")


def sha256_of(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_master(explicit: str | None) -> pathlib.Path:
    if explicit:
        path = pathlib.Path(explicit)
    else:
        CACHE.mkdir(parents=True, exist_ok=True)
        path = CACHE / f"LXGWWenKai-Regular-{FONT_VERSION}.ttf"
        if not path.exists():
            print(f"母体不在缓存,下载 {MASTER_URL}")
            urllib.request.urlretrieve(MASTER_URL, path)
    got = sha256_of(path)
    if got != MASTER_SHA256:
        sys.exit(f"母体 sha256 不符:\n  期望 {MASTER_SHA256}\n  实际 {got}\n换版本请同步更新脚本里的 URL 与哈希")
    return path


def needed_chars() -> set[str]:
    """
    游戏要用到的字 = 源码/模板里出现的全部字符 + 界面符号 + GB2312 全字集。

    跳过 *.spec.ts:用例里会有别人写下的**正则区间端点**(如 /[⺀-鿿　-〿＀-￯]/ 里的
    U+FF00、U+FFEF),那两端的字符根本不会出现在界面上,收进字体只是白占体积。
    界面文字都住在 src 的其余文件与 index.html 里,漏不了。
    """
    chars: set[str] = set()
    for pattern in ("*.ts", "*.vue", "*.js"):
        for p in (ROOT / "src").rglob(pattern):
            if p.name.endswith(".spec.ts"):
                continue
            chars |= set(p.read_text(encoding="utf-8", errors="ignore"))
    chars |= set((ROOT / "index.html").read_text(encoding="utf-8", errors="ignore"))
    chars |= set(EXTRA)
    # GB2312 全字集:一级 3755 + 二级 3008,覆盖日常汉字与绝大多数名字
    for hi in range(0xB0, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return {c for c in chars if not c.isspace()}


def ui_corpus() -> str:
    """
    界面语料 —— 用来给字排频次,决定谁进第一片。

    取的是**源码与模板里的全部文本**(含 src/data 里的名字与文案),跳过 *.spec.ts
    (与 needed_chars 同一条规则)。频次只是个权重,不要求精确:哪一片先到,只影响
    冷启动那几次请求的大小,不影响覆盖。
    """
    parts: list[str] = []
    for pattern in ("*.ts", "*.vue", "*.js"):
        for p in (ROOT / "src").rglob(pattern):
            if p.name.endswith(".spec.ts"):
                continue
            parts.append(p.read_text(encoding="utf-8", errors="ignore"))
    parts.append((ROOT / "index.html").read_text(encoding="utf-8", errors="ignore"))
    return "".join(parts)


def split_chunks(chars: set[str], corpus: str, per_band: int, per_cold: int) -> list[list[str]]:
    """
    按用法频次把字切片:每片约 `per_band` 个字,热的在前;最后一片收「语料里没出现过」
    的字(GB2312 储备,玩家自己起名要用的那些)。

    为什么按频次排序 + 按字数均分,而不是按累计出现次数分档:界面上的字是长尾分布,
    前两三百个字就占了全部出现次数的一半以上。按出现次数分档会让前面几片小得可笑
    (实测第一片 19 字、第二片 35 字),而后面一片 2474 字 —— 首屏只要碰到一个中频字,
    那片 650KB 就整份下来了,等于没切。按字数均分才是浏览器真正吃的那一档:页面碰到
    哪些字,就只取它们所在的那几片。

    片数(每片多大)是取舍:片越小首屏越省字节,但请求数越多。取值与实测见
    docs/development.md 的首屏一节,量法是 scripts/first-paint.mjs。
    """
    weight = {c: corpus.count(c) for c in chars if c in corpus}
    hot = sorted([c for c in chars if weight.get(c, 0) > 0], key=lambda c: (-weight[c], c))
    cold = sorted([c for c in chars if weight.get(c, 0) == 0])
    bands: list[list[str]] = [hot[i : i + per_band] for i in range(0, len(hot), per_band)]
    # 储备那一段(GB2312 里语料没用到的那几千字)按码位切:它们只在「玩家起了个生僻名字」
    # 时才用得上,整段一千多 KB 一份太贵 —— 切小之后,那一个名字只拽下来一小片。
    bands += [cold[i : i + per_cold] for i in range(0, len(cold), per_cold)]
    return bands


def unicode_range(chars: list[str]) -> str:
    """一串字 → CSS 的 unicode-range(连续码位并成区间,免得写几千个 U+xxxx)"""
    points = sorted({ord(c) for c in chars})
    runs: list[tuple[int, int]] = []
    for cp in points:
        if runs and cp == runs[-1][1] + 1:
            runs[-1] = (runs[-1][0], cp)
        else:
            runs.append((cp, cp))
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in runs)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", help="母体 TTF 路径(不给就按上面的 URL 下载到缓存)")
    ap.add_argument(
        "--source",
        help="离线切片的全量字库路径(已入库的 lxgw-wenkai-gb-screen-subset.woff2);"
        "给则跳过母体下载,直接从这份已含全部需用字的字库再切",
    )
    ap.add_argument(
        "--per-band",
        type=int,
        default=180,
        help="常用字每片大约几个字(默认 180,实测的口径见 docs/development.md 首屏一节)",
    )
    ap.add_argument(
        "--per-cold",
        type=int,
        default=700,
        help="储备字(语料里没出现过)每片大约几个字 —— 玩家起生僻名时才取",
    )
    args = ap.parse_args()

    from fontTools import subset
    from fontTools.ttLib import TTFont

    # --source 是离线再切的入口:直接复用已入库的全量字库(已含全部需用字),
    # 不必能连外网下载母体。选 --source 时 sha256 校验的是这份待切的字库本身。
    source = pathlib.Path(args.source) if args.source else ensure_master(args.master)
    chars = needed_chars()
    bands = split_chunks(chars, ui_corpus(), args.per_band, args.per_cold)

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.drop_tables += ["DSIG"]
    opts.notdef_outline = True
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    covered_all: set[str] = set()
    missing_all: set[str] = set()
    chunks: list[dict[str, object]] = []
    for i, band in enumerate(bands, start=1):
        if not band:
            continue
        out = OUT_DIR / f"lxgw-wenkai-gb-screen-subset-{i}.woff2"
        font = subset.load_font(str(source), opts)
        subsetter = subset.Subsetter(options=opts)
        subsetter.populate(text="".join(band))
        subsetter.subset(font)
        subset.save_font(font, str(out), opts)

        # 从**产物**读回真实覆盖,而不是记「我要求包含的字」—— 两者会差:母体里没有的字
        # (那些符号)pyftsubset 直接跳过,若字表照抄请求集,判据就成了空头支票。
        produced = TTFont(str(out), lazy=True)
        covered = {chr(cp) for cp in produced.getBestCmap()}
        missing_all |= set(band) - covered
        covered_all |= covered
        chunks.append(
            {
                "file": out.name,
                "chars": len(covered),
                "bytes": out.stat().st_size,
                "sha256": sha256_of(out),
                "unicode_range": unicode_range(sorted(covered)),
            }
        )
        print(f"  第 {i} 片:{len(covered)} 字 · {out.stat().st_size / 1024:.0f} KB")

    missing = sorted(missing_all)
    unexpected = [c for c in missing if c not in SYMBOLS_FROM_SYSTEM]
    if unexpected:
        sys.exit(
            "母体里缺这些字(既不在字体里,也不在 SYMBOLS_FROM_SYSTEM 名单里):\n  "
            + "".join(unexpected)
            + "\n要么换母体,要么把确实该由系统字体画的字符加进 SYMBOLS_FROM_SYSTEM"
        )
    CHARS.write_text("".join(sorted(covered_all)), encoding="utf-8")

    # @font-face 声明也由脚本写:每一片的 unicode-range 必须与那一份**产物**的 cmap 一致,
    # 手抄一份到 style.css 里迟早会与字体对不上(而那种错只表现为「有字拉不下来」)。
    rules = [
        "/* 生成物 —— 由 scripts/fonts/build-kai-font.py 写出,判据在 src/ui/kaiFontCoverage.spec.ts。",
        "   手改会被下一次生成覆盖。 */",
    ]
    for chunk in chunks:
        rules.append(
            "@font-face {\n"
            "  font-family: 'LXGW WenKai GB Screen';\n"
            "  src:\n"
            "    local('LXGW WenKai GB Screen'),\n"
            f"    url('./{chunk['file']}') format('woff2');\n"
            "  font-display: swap;\n"
            f"  unicode-range: {chunk['unicode_range']};\n"
            "}"
        )
    OUT_CSS.write_text("\n".join(rules) + "\n", encoding="utf-8")

    META.write_text(
        json.dumps(
            {
                "source": "霞鹜文楷 GB 屏幕阅读版 LXGW WenKai GB Screen",
                "version": FONT_VERSION,
                "url": MASTER_URL,
                "master_sha256": MASTER_SHA256,
                "license": "SIL OFL 1.1 —— 全文见 public/fonts/OFL.txt",
                "requested_chars": len(chars),
                "subset_chars": len(covered_all),
                "delegated_to_system": "".join(missing),
                "subset_bytes": sum(int(c["bytes"]) for c in chunks),
                "chunks": chunks,
                "generated_by": "scripts/fonts/build-kai-font.py",
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    total_bytes = sum(int(c["bytes"]) for c in chunks)
    hot_bytes = int(chunks[0]["bytes"]) if chunks else 0
    print(
        f"请求 {len(chars)} 字 · 字体实收 {len(covered_all)} 字 · {len(chunks)} 片"
        + (f" · 交给系统字体:{''.join(missing)}" if missing else "")
        + f"\n→ {OUT_DIR.relative_to(ROOT)}/lxgw-wenkai-gb-screen-subset-*.woff2"
        + f"(合计 {total_bytes / 1024:.0f} KB,第一片 {hot_bytes / 1024:.0f} KB)"
        + f"\n→ {OUT_CSS.relative_to(ROOT)}(每一片的 @font-face 与 unicode-range)"
    )


if __name__ == "__main__":
    main()
