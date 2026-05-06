import { describe, it, expect } from 'vitest'
import { getChannelAdapter, getSupportedChannels, isChannelSupported } from '@/lib/agent/adapters'

describe('Agent Adapters Registry', () => {
  describe('getSupportedChannels', () => {
    it('should return array of supported channel types', () => {
      const channels = getSupportedChannels()
      expect(Array.isArray(channels)).toBe(true)
      expect(channels.length).toBeGreaterThan(0)
    })

    it('should include telegram adapter', () => {
      const channels = getSupportedChannels()
      expect(channels).toContain('telegram')
    })

    it('should include slack adapter', () => {
      const channels = getSupportedChannels()
      expect(channels).toContain('slack')
    })

    it('should include email adapter', () => {
      const channels = getSupportedChannels()
      expect(channels).toContain('email')
    })

    it('should include whatsapp adapter', () => {
      const channels = getSupportedChannels()
      expect(channels).toContain('whatsapp')
    })
  })

  describe('isChannelSupported', () => {
    it('should return true for supported channels', () => {
      expect(isChannelSupported('telegram')).toBe(true)
      expect(isChannelSupported('slack')).toBe(true)
      expect(isChannelSupported('email')).toBe(true)
      expect(isChannelSupported('whatsapp')).toBe(true)
    })

    it('should return false for unsupported channels', () => {
      expect(isChannelSupported('unknown')).toBe(false)
      expect(isChannelSupported('discord')).toBe(false)
    })
  })

  describe('getChannelAdapter', () => {
    it('should return adapter instance for supported type', () => {
      const adapter = getChannelAdapter('telegram')
      expect(adapter).toBeDefined()
      expect(adapter.type).toBe('telegram')
    })

    it('should throw error for unsupported channel', () => {
      expect(() => getChannelAdapter('web')).toThrow("Channel adapter 'web' is not implemented")
    })

    it('should return adapter with required methods', () => {
      const adapter = getChannelAdapter('telegram')
      expect(typeof adapter.sendArticlePreview).toBe('function')
      expect(typeof adapter.sendConfirmation).toBe('function')
      expect(typeof adapter.sendError).toBe('function')
      expect(typeof adapter.parseWebhook).toBe('function')
      expect(typeof adapter.verifyWebhook).toBe('function')
    })
  })
})
