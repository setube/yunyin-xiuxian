/**
 * Phase 31.0 S3:短期秘境 —— 一次性内容容器
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createSecretRealm, currentRealm, abandonRealm, realmUnlock, secretRealmDef, SECRET_REALMS } from './secretRealm'
import { usePlayerStore } from '@/stores/player'

describe('短期秘境(secretRealm)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('元婴(≥3)起可探索', () => {
    const player = usePlayerStore()
    player.$patch({ major: 2 } as never)
    expect(realmUnlock()).toBe(false)
    player.$patch({ major: 3 } as never)
    expect(realmUnlock()).toBe(true)
  })

  it('进入秘境:生成随机规则(1~2 条,不重复),写入 store', () => {
    const st = createSecretRealm()
    expect(st.rules.length).toBeGreaterThanOrEqual(1)
    expect(st.rules.length).toBeLessThanOrEqual(2)
    expect(new Set(st.rules).size).toBe(st.rules.length)
    expect(currentRealm()?.realmId).toBe(st.realmId)
    expect(st.layer).toBe(1)
  })

  it('离开秘境:状态清空', () => {
    createSecretRealm()
    abandonRealm()
    expect(currentRealm()).toBeNull()
  })

  it('秘境目录:三处,各有入口代价(道源)', () => {
    expect(SECRET_REALMS.length).toBe(3)
    for (const s of SECRET_REALMS) {
      expect(s.entryCost).toBeGreaterThan(0)
      expect(secretRealmDef(s.id)?.name).toBe(s.name)
    }
  })
})
