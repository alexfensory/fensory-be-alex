import { WordPressConnector } from './connectors/wordpress'
import { WebflowConnector } from './connectors/webflow'
import { GhostConnector } from './connectors/ghost'
import { NotionConnector } from './connectors/notion'
import { HubSpotConnector } from './connectors/hubspot'
import type { CMSConnector, CMSConnectorType } from './types'

const connectors: Partial<Record<CMSConnectorType, CMSConnector>> = {
  wordpress: new WordPressConnector(),
  webflow: new WebflowConnector(),
  ghost: new GhostConnector(),
  notion: new NotionConnector(),
  hubspot: new HubSpotConnector()
}

export function getConnector(type: CMSConnectorType): CMSConnector {
  const connector = connectors[type]
  if (!connector) {
    throw new Error(`CMS connector '${type}' is not implemented`)
  }
  return connector
}

export function getSupportedConnectors(): CMSConnectorType[] {
  return Object.keys(connectors) as CMSConnectorType[]
}

export function isConnectorSupported(type: string): type is CMSConnectorType {
  return type in connectors
}
