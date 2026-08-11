import { useAppStore } from '@stores/app-store'
import { zhCN, enUS } from '@shared/i18n/translations'

export function useT() {
  const lang = useAppStore(s => s.language)
  return lang === 'zh-CN' ? zhCN : enUS
}
