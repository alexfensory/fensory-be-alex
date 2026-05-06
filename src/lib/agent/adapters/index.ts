import { TelegramAdapter } from './telegram'
import { SlackAdapter } from './slack'
import type { ChannelAdapter, ChannelType } from '../types'

const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {
  telegram: new TelegramAdapter(),
  slack: new SlackAdapter()
}

export function getChannelAdapter(type: ChannelType): ChannelAdapter {
  const adapter = adapters[type]
  if (!adapter) {
    throw new Error(`Channel adapter '${type}' is not implemented`)
  }
  return adapter
}

export function getSupportedChannels(): ChannelType[] {
  return Object.keys(adapters) as ChannelType[]
}

export function isChannelSupported(type: string): type is ChannelType {
  return type in adapters
}

export { TelegramAdapter } from './telegram'
export { SlackAdapter } from './slack'
