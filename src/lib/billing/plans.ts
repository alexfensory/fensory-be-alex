export type PlanTier = 'solo' | 'growth' | 'scale'

export interface PlanLimits {
  postsPerMonth: number
  teamMembers: number
  cmsConnections: number
  agentChannels: number
  brandCorpusPages: number
  qualityThreshold: number
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  solo: {
    postsPerMonth: 10,
    teamMembers: 1,
    cmsConnections: 1,
    agentChannels: 1,
    brandCorpusPages: 50,
    qualityThreshold: 70
  },
  growth: {
    postsPerMonth: 50,
    teamMembers: 5,
    cmsConnections: 3,
    agentChannels: 3,
    brandCorpusPages: 200,
    qualityThreshold: 75
  },
  scale: {
    postsPerMonth: 200,
    teamMembers: 20,
    cmsConnections: 10,
    agentChannels: 10,
    brandCorpusPages: 1000,
    qualityThreshold: 80
  }
}

export const STRIPE_PRICE_IDS: Record<PlanTier, string> = {
  solo: process.env.STRIPE_SOLO_PRICE_ID || '',
  growth: process.env.STRIPE_GROWTH_PRICE_ID || '',
  scale: process.env.STRIPE_SCALE_PRICE_ID || ''
}

export function getPlanTierFromPrice(priceId: string): PlanTier {
  for (const [tier, id] of Object.entries(STRIPE_PRICE_IDS)) {
    if (id === priceId) return tier as PlanTier
  }
  return 'solo'
}

export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLAN_LIMITS[tier]
}
