import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger'
}

const Button: React.FC<ButtonProps> = ({ variant = 'primary', children, style, ...props }) => {
  const colors: Record<string, string> = {
    primary: 'var(--accent-blue)',
    secondary: 'var(--bg-hover)',
    danger: 'var(--accent-red)',
  }
  return (
    <button
      style={{
        background: colors[variant],
        color: variant === 'secondary' ? 'var(--text-primary)' : '#fff',
        border: 'none', borderRadius: 'var(--radius-sm)',
        padding: '6px 14px', fontSize: 13, cursor: 'pointer', fontWeight: 500,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  )
}

export default Button
