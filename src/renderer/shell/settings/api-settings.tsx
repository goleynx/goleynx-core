import React, { useEffect, useState } from 'react'
import { useAppStore } from '@stores/app-store'
import { zhCN, enUS } from '@shared/i18n/translations'

interface ProviderInfo { id: string; name: string; baseURL: string; needsKey: boolean }

const ApiSettings: React.FC = () => {
  const { language } = useAppStore()
  const t = language === 'zh-CN' ? zhCN : enUS
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Record<string, 'idle'|'saving'|'saved'>>({})
  const [showCustom, setShowCustom] = useState(false)
  const [custom, setCustom] = useState({ id: '', url: '', key: '' })

  useEffect(() => {
    (window as any).electronAPI?.ai?.providers().then((list: ProviderInfo[]) => {
      setProviders(list ?? [])
      list?.forEach((p: ProviderInfo) => {
        (window as any).electronAPI?.key?.get(p.id).then((k: string | null) => {
          if (k) setKeys(prev => ({ ...prev, [p.id]: k }))
        })
      })
    })
  }, [])

  const save = async (id: string, key: string) => {
    if (!key.trim()) return
    setStatus(p => ({ ...p, [id]: 'saving' }))
    await (window as any).electronAPI?.key?.set(id, key.trim())
    setKeys(p => ({ ...p, [id]: key.trim() }))
    setStatus(p => ({ ...p, [id]: 'saved' }))
    setTimeout(() => setStatus(p => ({ ...p, [id]: 'idle' })), 2000)
  }

  const del = async (id: string) => {
    await (window as any).electronAPI?.key?.delete(id)
    setKeys(p => { const n = { ...p }; delete n[id]; return n })
  }

  const addCustom = async () => {
    if (!custom.id.trim() || !custom.url.trim() || !custom.key.trim()) return
    await (window as any).electronAPI?.key?.set(custom.id.trim(), custom.key.trim())
    const newP: ProviderInfo = { id: custom.id.trim(), name: custom.id.trim(), baseURL: custom.url.trim(), needsKey: true }
    setProviders(p => [...p, newP])
    setKeys(p => ({ ...p, [custom.id.trim()]: custom.key.trim() }))
    setCustom({ id: '', url: '', key: '' })
    setShowCustom(false)
  }

  const cloud = providers.filter(p => p.needsKey)
  const local = providers.filter(p => !p.needsKey)

  return (
    <div style={{ padding: 20 }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>{t.api_title}</h3>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 16 }}>{t.api_subtitle}</p>

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>{t.api_cloud}</div>
      {cloud.map(p => (
        <div key={p.id} style={{ marginBottom: 10, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{p.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginBottom: 4 }}>{p.baseURL}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <input type="password" placeholder="sk-xxx..." value={keys[p.id] ?? ''}
              onChange={e => setKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
              style={{ flex: 1, padding: '4px 8px', fontSize: 11, background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: 3, outline: 'none' }} />
            <button onClick={() => save(p.id, keys[p.id] ?? '')} style={{
              padding: '3px 8px', fontSize: 11, whiteSpace: 'nowrap', border: 'none', borderRadius: 3, cursor: 'pointer',
              background: status[p.id] === 'saved' ? 'var(--accent-green)' : 'var(--accent-blue)', color: '#fff',
            }}>{status[p.id] === 'saved' ? t.api_saved : t.api_save}</button>
            {keys[p.id] && <button onClick={() => del(p.id)} style={{
              padding: '3px 6px', fontSize: 11, cursor: 'pointer',
              background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', borderRadius: 3,
            }}>{t.api_delete}</button>}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, marginTop: 14 }}>{t.api_local}</div>
      {local.map(p => (
        <div key={p.id} style={{ marginBottom: 6, padding: 8, background: 'var(--bg-tertiary)', borderRadius: 4 }}>
          <div style={{ fontSize: 12, color: 'var(--text-primary)' }}>{p.name}</div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{p.baseURL} — {t.api_always_on}</div>
        </div>
      ))}

      <div style={{ marginTop: 12, borderTop: '1px solid var(--border-color)', paddingTop: 10 }}>
        {!showCustom ? (
          <button onClick={() => setShowCustom(true)} style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 11, cursor: 'pointer' }}>
            {t.api_add_custom}
          </button>
        ) : (
          <div style={{ padding: 8, background: 'var(--bg-tertiary)', borderRadius: 4 }}>
            <input placeholder={t.api_custom_name} value={custom.id}
              onChange={e => setCustom(v => ({ ...v, id: e.target.value }))}
              style={inputS} />
            <input placeholder={t.api_custom_url} value={custom.url}
              onChange={e => setCustom(v => ({ ...v, url: e.target.value }))}
              style={inputS} />
            <input placeholder={t.api_custom_key} value={custom.key} type="password"
              onChange={e => setCustom(v => ({ ...v, key: e.target.value }))}
              style={inputS} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={addCustom} style={btnS('var(--accent-blue)')}>{t.api_save}</button>
              <button onClick={() => setShowCustom(false)} style={btnS('var(--bg-hover)')}>{t.settings_close}</button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>{t.api_encrypt_note}</div>
    </div>
  )
}

const inputS: React.CSSProperties = { display:'block',width:'100%',padding:'4px 8px',fontSize:11,background:'var(--bg-primary)',color:'var(--text-primary)',border:'1px solid var(--border-color)',borderRadius:3,outline:'none',marginBottom:4,boxSizing:'border-box' }
const btnS = (bg: string): React.CSSProperties => ({ padding:'3px 10px',fontSize:11,border:'none',borderRadius:3,cursor:'pointer',background:bg,color:'var(--text-primary)' })

export default ApiSettings
