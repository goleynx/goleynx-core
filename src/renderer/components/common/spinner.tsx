import React from 'react'
export const Spinner: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
    <div style={{
      width: 24, height: 24, border: '3px solid var(--border-color)',
      borderTopColor: 'var(--accent-blue)', borderRadius: '50%',
    }}
    className="animate-spin"
    />
  </div>
)
