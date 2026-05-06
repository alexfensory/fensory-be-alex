import { describe, it, expect } from 'vitest'
import { getConnector, getSupportedConnectors, isConnectorSupported } from '@/lib/cms/registry'

describe('CMS Registry', () => {
  describe('getSupportedConnectors', () => {
    it('should return array of supported connector types', () => {
      const connectors = getSupportedConnectors()
      expect(Array.isArray(connectors)).toBe(true)
      expect(connectors.length).toBeGreaterThan(0)
    })

    it('should include wordpress connector', () => {
      const connectors = getSupportedConnectors()
      expect(connectors).toContain('wordpress')
    })

    it('should include webflow connector', () => {
      const connectors = getSupportedConnectors()
      expect(connectors).toContain('webflow')
    })

    it('should include ghost connector', () => {
      const connectors = getSupportedConnectors()
      expect(connectors).toContain('ghost')
    })

    it('should include notion connector', () => {
      const connectors = getSupportedConnectors()
      expect(connectors).toContain('notion')
    })

    it('should include hubspot connector', () => {
      const connectors = getSupportedConnectors()
      expect(connectors).toContain('hubspot')
    })
  })

  describe('isConnectorSupported', () => {
    it('should return true for supported connectors', () => {
      expect(isConnectorSupported('wordpress')).toBe(true)
      expect(isConnectorSupported('webflow')).toBe(true)
      expect(isConnectorSupported('ghost')).toBe(true)
      expect(isConnectorSupported('notion')).toBe(true)
      expect(isConnectorSupported('hubspot')).toBe(true)
    })

    it('should return false for unsupported connectors', () => {
      expect(isConnectorSupported('unknown')).toBe(false)
      expect(isConnectorSupported('medium')).toBe(false)
    })
  })

  describe('getConnector', () => {
    it('should return connector instance for supported type', () => {
      const connector = getConnector('wordpress')
      expect(connector).toBeDefined()
      expect(connector.type).toBe('wordpress')
    })

    it('should throw error for unsupported connector', () => {
      expect(() => getConnector('custom')).toThrow("CMS connector 'custom' is not implemented")
    })

    it('should return connector with required methods', () => {
      const connector = getConnector('wordpress')
      expect(typeof connector.testConnection).toBe('function')
      expect(typeof connector.createPost).toBe('function')
      expect(typeof connector.updatePost).toBe('function')
      expect(typeof connector.deletePost).toBe('function')
      expect(typeof connector.getPost).toBe('function')
    })
  })
})
