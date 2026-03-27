import React from 'react';

interface Props {
  active: 'shared' | 'personal';
  onChange: (ctx: 'shared' | 'personal') => void;
  className?: string;
}

export const ContextTabs: React.FC<Props> = ({ active, onChange, className }) => (
  <div className={`dashboard__context-tabs ${className ?? ''}`}>
    <button
      className={`dashboard__context-tab ${active === 'shared' ? 'dashboard__context-tab--active' : ''}`}
      onClick={() => onChange('shared')}
    >
      <div className="dot sh-d" />
      Compartido
    </button>
    <button
      className={`dashboard__context-tab ${active === 'personal' ? 'dashboard__context-tab--active' : ''}`}
      onClick={() => onChange('personal')}
    >
      <div className="dot ps-d" />
      Personal
    </button>
  </div>
);
