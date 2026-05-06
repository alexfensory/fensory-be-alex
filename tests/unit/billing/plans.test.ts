import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, getPlanLimits, getPlanTierFromPrice, type PlanTier } from '@/lib/billing/plans'

describe('Billing Plans', () => {
  describe('PLAN_LIMITS', () => {
    it('should have all plan tiers defined', () => {
      expect(PLAN_LIMITS).toHaveProperty('solo')
      expect(PLAN_LIMITS).toHaveProperty('growth')
      expect(PLAN_LIMITS).toHaveProperty('scale')
    })

    it('should have increasing limits for higher tiers', () => {
      expect(PLAN_LIMITS.growth.postsPerMonth).toBeGreaterThan(PLAN_LIMITS.solo.postsPerMonth)
      expect(PLAN_LIMITS.scale.postsPerMonth).toBeGreaterThan(PLAN_LIMITS.growth.postsPerMonth)
    })

    it('should have all required limit properties', () => {
      const requiredProps = [
        'postsPerMonth',
        'teamMembers',
        'cmsConnections',
        'agentChannels',
        'brandCorpusPages',
        'qualityThreshold'
      ]

      for (const tier of Object.values(PLAN_LIMITS)) {
        for (const prop of requiredProps) {
          expect(tier).toHaveProperty(prop)
        }
      }
    })

    it('should have higher quality thresholds for higher tiers', () => {
      expect(PLAN_LIMITS.growth.qualityThreshold).toBeGreaterThan(PLAN_LIMITS.solo.qualityThreshold)
      expect(PLAN_LIMITS.scale.qualityThreshold).toBeGreaterThan(PLAN_LIMITS.growth.qualityThreshold)
    })
  })

  describe('getPlanLimits', () => {
    it('should return correct limits for solo plan', () => {
      const limits = getPlanLimits('solo')
      expect(limits).toEqual(PLAN_LIMITS.solo)
      expect(limits.postsPerMonth).toBe(10)
      expect(limits.teamMembers).toBe(1)
    })

    it('should return correct limits for growth plan', () => {
      const limits = getPlanLimits('growth')
      expect(limits).toEqual(PLAN_LIMITS.growth)
      expect(limits.postsPerMonth).toBe(50)
      expect(limits.teamMembers).toBe(5)
    })

    it('should return correct limits for scale plan', () => {
      const limits = getPlanLimits('scale')
      expect(limits).toEqual(PLAN_LIMITS.scale)
      expect(limits.postsPerMonth).toBe(200)
      expect(limits.teamMembers).toBe(20)
    })
  })

  describe('getPlanTierFromPrice', () => {
    it('should return solo for unknown price IDs', () => {
      const tier = getPlanTierFromPrice('unknown-price-id')
      expect(tier).toBe('solo')
    })

    it('should return solo for empty price ID', () => {
      const tier = getPlanTierFromPrice('')
      expect(tier).toBe('solo')
    })
  })
})
