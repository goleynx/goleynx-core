import React, { useCallback } from 'react'
import { useAppStore } from '@stores/app-store'
import { useT } from '@renderer/hooks/use-translation'

const Titlebar: React.FC = () => {
  const t = useT()
  const call = useCallback((m: string) => () => (window as any).electronAPI?.window[m](), [])
  const { isSettingsOpen, toggleSettings } = useAppStore()

  return (
    <div style={{ display:'grid',gridTemplateColumns:'20% 40% 40%',height:32,background:'var(--panel-header)',borderBottom:'1px solid var(--border-color)',WebkitAppRegion:'drag' as any,userSelect:'none' }}>
      {/* 左列 20% — 对齐审查/中框左列 */}
      <div style={{ display:'flex',alignItems:'center',paddingLeft:12,WebkitAppRegion:'no-drag' as any }}>
        <span style={{ fontSize:12,fontWeight:600,color:'var(--text-primary)',letterSpacing:0.3,marginRight:8 }}>Goleynx</span>
        {[t.menu_file, t.menu_edit, t.menu_view, t.menu_help, t.menu_plugins].map(l => (
          <span key={l} style={{ fontSize:11,color:'var(--text-secondary)',padding:'0 6px',cursor:'pointer',lineHeight:'32px',borderRadius:3 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>{l}</span>
        ))}
      </div>

      {/* 中列 40% — 空，对齐对话中列 */}
      <div />

      {/* 右列 40% — 对齐执行体右侧列：设置按钮放在该列开头 */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',WebkitAppRegion:'no-drag' as any }}>
        <button onClick={() => toggleSettings()} style={{
          background:isSettingsOpen?'var(--accent-blue)':'transparent',color:isSettingsOpen?'#fff':'var(--text-secondary)',
          border:'none',padding:'0 12px',fontSize:12,cursor:'pointer',lineHeight:'32px',borderRadius:3,
        }}>{t.menu_settings}</button>
        <div style={{ display:'flex' }}>
          <WinBtn l="ー" onClick={call('minimize')} /><WinBtn l="□" onClick={call('maximize')} /><WinBtn l="✕" onClick={call('close')} danger />
        </div>
      </div>
    </div>
  )
}

const WinBtn: React.FC<{ l: string; onClick: () => void; danger?: boolean }> = ({ l, onClick, danger }) => (
  <span onClick={onClick} style={{ fontSize:11,cursor:'pointer',padding:'0 14px',lineHeight:'32px',color:'var(--text-secondary)' }}
    onMouseEnter={e => { e.currentTarget.style.background = danger?'var(--accent-red)':'var(--bg-hover)'; e.currentTarget.style.color = danger?'#fff':'var(--text-primary)' }}
    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)' }}>{l}</span>
)

export default Titlebar
