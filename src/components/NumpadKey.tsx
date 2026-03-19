import React from 'react';

interface NumpadKeyProps {
  label?: string;
  value?: string;
  onClick?: () => void;
  variant?: 'default' | 'action' | 'delete';
  isDelete?: boolean;
}

export const NumpadKey: React.FC<NumpadKeyProps> = ({
  label,
  value,
  onClick,
  variant = 'default',
  isDelete = false,
}) => {
  const isAction = variant === 'action' || variant === 'delete' || isDelete || value === '.';
  return (
    <button
      type="button"
      className={`num-btn${isAction ? ' action' : ''}`}
      onClick={onClick}
    >
      {isDelete ? '\u2190' : (label || value)}
    </button>
  );
};
