import React, { useState } from 'react';
import { Delete } from 'lucide-react';

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
  const [active, setActive] = useState(false);

  return (
    <button
      className={`numpad-key ${variant !== 'default' ? `numpad-key--${variant}` : ''}`}
      onClick={onClick}
      onPointerDown={() => setActive(true)}
      onPointerUp={() => setActive(false)}
      onPointerLeave={() => setActive(false)}
    >
      {(variant === 'delete' || isDelete) ? <Delete size={20} /> : (label || value)}
    </button>
  );
};
