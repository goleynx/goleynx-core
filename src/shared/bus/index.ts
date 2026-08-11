import mitt from 'mitt'
import type { BusEvents } from './types'

export const bus = mitt<BusEvents>()

export * from './types'
export * from './agent-names'
