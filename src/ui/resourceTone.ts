import type { ResourceDialogData } from '@/core/resourceGuidance'

/**
 * 资源生命周期形制。
 *
 * 道源与道果的说明弹窗都有同一句「生命周期」:道源是「本世使用 · 可凝为道果」,
 * 道果是「跨世保留」—— 而这正是玩家最容易记错的一条:转世时哪一个会清零。
 *
 * `ResourceDialogData` 里早有一个 `roleTone`('action' | 'permanent')专门表达这件事,
 * 但弹窗只是把 lifecycle 那行文字原样铺出来,`roleTone` 一处都没读 ——
 * 两个弹窗各写一个硬编码的左边框色(cinnabar / violet-ink),与 roleTone 是两套说法。
 *
 * 这一层把 roleTone 翻成形制:符号 + 说法 + 色。两处弹窗共用,不再各写各的。
 */

/** 生命周期的一档形制 */
export interface ResourceTone {
  /** 「此生」/「累世」二字签 */
  seal: string
  /** 读屏与标签用的说法 */
  label: string
  /** 一句把差别说清的话(不劝、不解释设计,只报事实) */
  note: string
  /** 语义色 token 名;调用方据此挂类,不写裸 hex */
  tone: 'cinnabar' | 'violet-ink'
}

const TONES: Record<ResourceDialogData['roleTone'], ResourceTone> = {
  action: {
    seal: '此',
    label: '本世',
    note: '转世散去',
    tone: 'cinnabar'
  },
  permanent: {
    seal: '累',
    label: '跨世',
    note: '转世保留',
    tone: 'violet-ink'
  }
}

/** 取一档形制;坏档给的 roleTone 认不出时按「本世」处理 —— 少承诺强过多承诺 */
export function resourceTone(roleTone: string): ResourceTone {
  return TONES[roleTone as ResourceDialogData['roleTone']] ?? TONES.action
}

/** 全部形制(供判据与自检读) */
export function allResourceTones(): ResourceTone[] {
  return Object.values(TONES)
}
