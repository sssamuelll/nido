import React from 'react';
import { OWNER_THEMES, type Owner } from '../types';

interface ButtonProps {
  label: string;
  variant?: Owner;
  onClick?: () => void;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
  size?: 'sm' | 'md';
  disabled?: boolean;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  label,
  variant = 'samuel',
  onClick,
  fullWidth = false,
  type = 'button',
  size = 'md',
  disabled = false,
  children,
}) => {
  const theme = OWNER_THEMES[variant];

  return (
    <button
      type={type}
      className={`btn btn--${variant} ${size === 'sm' ? 'btn--sm' : ''} ${fullWidth ? 'btn--full' : ''}`}
      onClick={onClick}
      disabled={disabled}
      style={{
        '--btn-gradient': theme.gradient,
        '--btn-glow': theme.glow,
      } as React.CSSProperties}
    >
      {children || label}
    </button>
  );
};
