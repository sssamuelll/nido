import React, { useState } from 'react';
import { Delete } from 'lucide-react';

interface NumpadKeyProps {
  label: string;
  onClick?: () => void;
  variant?: 'default' | 'action' | 'delete';
}

export const NumpadKey: React.FC<NumpadKeyProps> = ({
  label,
  onClick,
  variant = 'default',
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
      {variant === 'delete' ? <Delete size={20} /> : label}
    </button>
  );
};
