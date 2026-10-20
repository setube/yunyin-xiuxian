/**
 * 标签页图标判据
 *
 * favicon 是**每次冷启动都要走一遍网络**的那一枚,而它的调用方只有一处:
 * 浏览器标签页 —— 16px,高分屏 32px。桌面快捷方式的 48px 是最后一档。
 * 再往上是安装图标的事,归 manifest 的 `icons` 管(192 / 512 / maskable),两条线。
 *
 * 这条边界原先没守住:`public/favicon.ico` 里塞的是**单条 256×256 的 PNG**,
 * 130 KB。256 那张从来没被画出来过 —— 它既不在标签页的取用范围内,
 * 也不在安装图标的清单里,纯粹是「图标包里放了一张原图」。
 *
 * 判据盯五件事:
 *   一 尺寸集合:只许 16/32/48。多出来的条目不是"更周全",是白搭的字节。
 *   二 体积预算:超了就说明有人又把大图塞回来了。
 *   三 目录自洽:每条声明的字节数与偏移都落在文件里(手工改 .ico 最容易坏在这)。
 *   四 引用不悬空:index.html 与 manifest 点名的图标都真的存在 ——
 *      改文件名而忘了改引用,浏览器只会在控制台留一行 404,界面看不出问题。
 *   五 与母图同源:那枚画与 `images/brand/favicon-source-128.png` 是同一张。
 *      这一条要真解像素来核 —— 只核生成器读哪个文件挡不住「产物没重跑」。
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')
const ICO = readFileSync(resolve(ROOT, 'public/favicon.ico'))
const INDEX_HTML = readFileSync(resolve(ROOT, 'index.html'), 'utf-8')
const MANIFEST = JSON.parse(readFileSync(resolve(ROOT, 'public/manifest.webmanifest'), 'utf-8')) as {
  icons: { src: string }[]
}

/** 只许这几档 —— 标签页要的那两三档 */
const ALLOWED = new Set([16, 32, 48])
/** 预算:当前实测约 10.5 KB(写实插画的 PNG 压不了多少),留一倍余量 */
const BUDGET = 24 * 1024

interface Entry {
  size: number
  bytes: number
  offset: number
}

function entries(): Entry[] {
  const count = ICO.readUInt16LE(4)
  const out: Entry[] = []
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16
    // 宽高各占 1 字节,0 代表 256 —— 正是这条格式约定让人误以为"该放 256"
    out.push({
      size: ICO.readUInt8(at) || 256,
      bytes: ICO.readUInt32LE(at + 8),
      offset: ICO.readUInt32LE(at + 12)
    })
  }
  return out
}

/** 取 ICO 里某一档的 PNG 字节 */
function pngOf(size: number): Buffer {
  const entry = entries().find(e => e.size === size)
  if (!entry) throw new Error(`favicon.ico 里没有 ${size}px 那一条`)
  return ICO.subarray(entry.offset, entry.offset + entry.bytes)
}

type Rgb = readonly [number, number, number]

/**
 * 最小 PNG 解码 —— 只认本项目自己产出的那一类:8 位、RGB 或 RGBA、非隔行。
 *
 * 为什么要真解码:这一节要回答的是「**checked-in 的那枚 .ico 与母图是不是
 * 同一张画**」。只核生成器读哪个文件是不够的 —— 脚本改了、产物没重跑,
 * 或者有人手工塞了一张回去,文件还在、指向也对,断言照样绿。
 * 只有把像素摊开量一遍,这句话才是真的。
 *
 * 不解码器全:调色板、16 位、隔行一概抛错 —— 真出现了说明产出流程变了,
 * 判据应当当场喊住,而不是给一个"大概对"的数。
 */
function decodePng(buf: Buffer): { w: number; h: number; rgba: Uint8Array } {
  let pos = 8
  let w = 0
  let h = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.subarray(pos + 4, pos + 8).toString('latin1')
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`这个解码器只认 8 位 RGB/RGBA,遇到的是 ${bitDepth} 位 / 类型 ${colorType}`)
  }
  const bpp = colorType === 6 ? 4 : 3
  const stride = w * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const out = new Uint8Array(w * h * 4)
  let prev = new Uint8Array(stride)
  for (let y = 0; y < h; y += 1) {
    const filter = raw[y * (stride + 1)]!
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? cur[i - bpp]! : 0
      const b = prev[i]!
      const c = i >= bpp ? prev[i - bpp]! : 0
      const x = line[i]!
      let v: number
      if (filter === 0) v = x
      else if (filter === 1) v = x + a
      else if (filter === 2) v = x + b
      else if (filter === 3) v = x + ((a + b) >> 1)
      else {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      cur[i] = v & 0xff
    }
    for (let x = 0; x < w; x += 1) {
      const s = x * bpp
      const d = (y * w + x) * 4
      out[d] = cur[s]!
      out[d + 1] = cur[s + 1]!
      out[d + 2] = cur[s + 2]!
      out[d + 3] = bpp === 4 ? cur[s + 3]! : 255
    }
    prev = cur
  }
  return { w, h, rgba: out }
}

/** 不透明像素的平均色 —— 缩放不改变平均色,故两枚同源的图标在这一项上必然接近 */
function meanColor(img: { w: number; h: number; rgba: Uint8Array }): Rgb {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < img.w * img.h; i += 1) {
    if (img.rgba[i * 4 + 3]! < 128) continue
    r += img.rgba[i * 4]!
    g += img.rgba[i * 4 + 1]!
    b += img.rgba[i * 4 + 2]!
    n += 1
  }
  if (n === 0) throw new Error('整张图都是透明的')
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

/** 两个主色在**最不相符的那个通道**上差多少 */
function channelGap(a: Rgb, b: Rgb): number {
  return Math.max(...[0, 1, 2].map(i => Math.abs(a[i]! - b[i]!)))
}

describe('favicon · 只装标签页用得着的几档', () => {
  it('确实是 ICO,且有条目(否则下面的判据在替一个空壳站岗)', () => {
    expect(ICO.readUInt16LE(0)).toBe(0)
    expect(ICO.readUInt16LE(2)).toBe(1)
    expect(entries().length).toBeGreaterThanOrEqual(3)
  })

  it('条目尺寸只许 16 / 32 / 48 —— 256 那档没有任何调用方', () => {
    expect(
      entries()
        .map(e => e.size)
        .sort((a, b) => a - b)
    ).toEqual([...ALLOWED])
  })

  it('体积在预算里', () => {
    // 130 KB 的那一版就是从这里漏过去的:没有预算,谁也说不清多少算大
    expect(ICO.length, `favicon.ico 已经 ${ICO.length} B`).toBeLessThanOrEqual(BUDGET)
  })

  it('每条的字节区间都落在文件里', () => {
    for (const e of entries()) {
      expect(e.offset + e.bytes, `${e.size}px 那条越界了`).toBeLessThanOrEqual(ICO.length)
      // PNG 签名:生成器统一走 PNG 条目,不写老式 BMP + AND 掩码
      expect(ICO.subarray(e.offset, e.offset + 8).toString('hex')).toBe('89504e470d0a1a0a')
    }
  })
})

describe('favicon · 引用不悬空', () => {
  it('index.html 点的图标都在', () => {
    const refs = [...INDEX_HTML.matchAll(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)].map(
      m => /href="\.\/([^"]+)"/.exec(m[0])?.[1] ?? ''
    )
    expect(refs.length).toBeGreaterThanOrEqual(2)
    for (const ref of refs) {
      expect(existsSync(resolve(ROOT, 'public', ref)), `index.html 点的 ./${ref} 不存在`).toBe(true)
    }
  })

  it('manifest 的安装图标都在,且都够大', () => {
    expect(MANIFEST.icons.length).toBeGreaterThanOrEqual(3)
    for (const icon of MANIFEST.icons) {
      const path = resolve(ROOT, 'public', icon.src.replace('./', ''))
      expect(existsSync(path), `manifest 点的 ${icon.src} 不存在`).toBe(true)
      // 安装图标是另一条线:最小边至少 192,别拿标签页那张小图顶替
      const png = readFileSync(path)
      expect(png.subarray(1, 4).toString(), `${icon.src} 不是 PNG`).toBe('PNG')
      const side = Math.min(png.readUInt32BE(16), png.readUInt32BE(20))
      expect(side, `${icon.src} 只有 ${side}px`).toBeGreaterThanOrEqual(192)
    }
  })
})

describe('favicon · 与母图是同一张画', () => {
  const master = decodePng(readFileSync(resolve(ROOT, 'images/brand/favicon-source-128.png')))
  const favicon32 = decodePng(pngOf(32))

  it('32px 的主色与 images/brand 母图一致(每通道差 ≤6)', () => {
    // 只核「生成器读哪个文件」挡不住「脚本改了产物没重跑」,也挡不住手工塞回旧图。
    // 缩图不改变平均色,同源的图标在这一项上必然几乎相等。
    expect(channelGap(meanColor(favicon32), meanColor(master))).toBeLessThanOrEqual(6)
  })

  it('生成器读的就是这张母图 —— 源码这一层也不许分家', () => {
    expect(readFileSync(resolve(ROOT, 'scripts/favicon.mjs'), 'utf-8')).toContain(
      "const SOURCE = join(ROOT, 'images/brand/favicon-source-128.png')"
    )
  })
})

describe('判据自证 · 解码与主色都靠得住', () => {
  it('解出来的尺寸与条目声明一致(解错会当场露)', () => {
    for (const size of [16, 32, 48]) {
      const img = decodePng(pngOf(size))
      expect([img.w, img.h]).toEqual([size, size])
      expect(img.rgba.length).toBe(size * size * 4)
    }
  })

  it('解出来的不是一片零(全黑或全透明都说明解码坏了)', () => {
    const img = decodePng(pngOf(32))
    const [r, g, b] = meanColor(img)
    expect(Math.max(r, g, b)).toBeGreaterThan(32)
    expect(img.rgba.some((v, i) => i % 4 === 3 && v === 255)).toBe(true)
  })

  it('不同画风真的会被量出来 —— 纯蓝与现用这枚差得远', () => {
    const blue = {
      w: 2,
      h: 2,
      rgba: new Uint8Array([0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255])
    }
    const gap = channelGap(meanColor(blue), meanColor(decodePng(pngOf(32))))
    expect(gap).toBeGreaterThan(6)
  })
})
