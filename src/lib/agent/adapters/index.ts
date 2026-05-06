import { TelegramAdapter } from './telegram'
import { SlackAdapter } from './slack'
import { EmailAdapter } from './email'
import { WhatsAppAdapter } from './whatsapp'
import type { ChannelAdapter, ChannelType } from '../types'

const adapters: Partial<Record<ChannelType, ChannelAdapter>> = {
  telegram: new TelegramAdapter(),
  slack: new SlackAdapter(),
  email: new EmailAdapter(),
  whatsapp: new WhatsAppAdapter()
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
export { EmailAdapter } from './email'
export { WhatsAppAdapter } from './whatsapp'
