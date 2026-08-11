import { bus, type BroadcastEvent } from '@shared/bus'
import { useSyslogStore } from '@stores/syslog-store'
import { useAppStore } from '@stores/app-store'
import { runEngine } from '@renderer/core/engine-runner'

let initialized = false

export function setupAgentBroadcastListeners() {
  if (initialized) return
  initialized = true

  bus.on('401_BROADCAST', (event) => {
    const { role, action } = event
    useSyslogStore.getState().addLog({
      timestamp: event.timestamp,
      category: 'Agent',
      sourceName: role,
      message: `[${role}] ${action}`,
    })
  })

  bus.on('agent:broadcast', async (event) => {
    const { sourceId, sourceName, message, category } = event

    // 全局日志记录（所有信标都记）
    useSyslogStore.getState().addLog({
      timestamp: event.timestamp,
      category,
      sourceName,
      message: `[${sourceName}] ${message}`,
    })

  })
}

export function emitBroadcast(event: Omit<BroadcastEvent, 'timestamp'>) {
  bus.emit('agent:broadcast', { ...event, timestamp: Date.now() })
}
