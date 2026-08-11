import React, { useEffect, useState, useCallback } from 'react'

interface Props { value: string; onChange: (id: string) => void }

const ModelSelector: React.FC<Props> = ({ value, onChange }) => {
  const [models, setModels] = useState<Array<{ id: string; name: string; needsKey: boolean }>>([])

  const fetchModels = useCallback(() => {
    (window as any).electronAPI?.ai?.availableModels().then((list: any[]) => {
      if (list?.length) setModels(list)
    }).catch(() => {})
  }, [])

  // 首次挂载拉取
  useEffect(() => { fetchModels() }, [fetchModels])

  // 未选定模型时，自动选用「设置里第一个已配置 Key 的模型」（配置驱动，不偏向任何供应商）
  useEffect(() => {
    if (!value && models.length) onChange(models[0].id)
  }, [value, models, onChange])

  // 每次点击下拉时重新拉取，确保 Key 变更后能看到新模型
  const handleMouseDown = () => {
    fetchModels()
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} onMouseDown={handleMouseDown} style={{
      background:'var(--panel-bg)',color:'var(--text-primary)',border:'1px solid var(--border-color)',
      borderRadius:'var(--radius-sm)',padding:'4px 8px',fontSize:12,cursor:'pointer',outline:'none',maxWidth:160,
    }}>
      {models.map(m => (
        <option key={m.id} value={m.id}>{m.name}</option>
      ))}
    </select>
  )
}
export default ModelSelector
