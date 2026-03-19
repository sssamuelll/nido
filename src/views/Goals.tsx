import React, { useState } from 'react';
import { GoalCard } from '../components/GoalCard';
import { Button } from '../components/Button';
import { type Goal } from '../types';
import { launchConfetti } from '../components/Confetti';
import { showToast } from '../components/Toast';

/* ---------- SVG Icons matching design reference ---------- */
const SparkleIcon = (
  <svg width="18" height="18" fill="none" stroke="#60A5FA" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>
  </svg>
);

const CreditCardIcon = (
  <svg width="18" height="18" fill="none" stroke="#34D399" viewBox="0 0 24 24" strokeWidth={2}>
    <rect x="3" y="4" width="18" height="12" rx="2"/>
    <path d="M3 10h18"/>
  </svg>
);

const ShieldCheckIcon = (
  <svg width="18" height="18" fill="none" stroke="#60A5FA" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
  </svg>
);

const CameraIcon = (
  <svg width="18" height="18" fill="none" stroke="#FBBF24" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
    <circle cx="12" cy="14" r="3"/>
  </svg>
);

const MOCK_GOALS: Goal[] = [
  {
    id: '1', name: 'Vacaciones Verano',
    icon: SparkleIcon, iconBg: 'var(--bl)', themeColor: 'var(--blue)',
    current: 3200, target: 5000, deadline: 'Jul 2026', owner: 'shared',
  },
  {
    id: '2', name: 'MacBook Pro',
    icon: CreditCardIcon, iconBg: 'var(--gl)', themeColor: 'var(--green)',
    current: 1800, target: 3000, deadline: 'Sep 2026', owner: 'samuel',
  },
  {
    id: '3', name: 'Fondo Emergencia',
    icon: ShieldCheckIcon, iconBg: 'var(--bl)', themeColor: 'var(--blue)',
    current: 2500, target: 6000, deadline: 'Dic 2026', owner: 'shared',
  },
  {
    id: '4', name: 'Cámara Sony A7',
    icon: CameraIcon, iconBg: 'var(--ol)', themeColor: 'var(--orange)',
    current: 978, target: 1200, deadline: 'May 2026', owner: 'maria',
  },
];

const SUMMARY_STATS = [
  { label: 'TOTAL AHORRADO', value: '€8.470', color: 'var(--green)' },
  { label: 'OBJ. ACTIVOS', value: '4', color: undefined },
  { label: 'MEJOR RACHA', value: '8 sem', color: 'var(--orange)' },
  { label: 'PRÓXIMO HITO', value: 'Jul 2026', color: 'var(--red)' },
];

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>(MOCK_GOALS);

  const handleContribute = (id: string) => {
    // Mock contribute: add a small amount
    setGoals(prev =>
      prev.map(g => g.id === id ? { ...g, current: Math.min(g.current + 50, g.target) } : g)
    );
    launchConfetti();
    showToast('\u00a1Contribuci\u00f3n registrada! Siguen avanzando juntos \ud83d\ude80');
  };

  const handleEdit = (id: string) => {
    // Placeholder for future edit modal
    console.log('Edit goal', id);
  };

  // Distribute goals in masonry-like layout: col1 = [0, 2], col2 = [1, 3]
  const col1Goals = goals.filter((_, i) => i % 2 === 0);
  const col2Goals = goals.filter((_, i) => i % 2 === 1);

  return (
    <div className="u-flex-gap-24">
      {/* Header */}
      <div className="goals__header an d1">
        <div>
          <h1 className="goals__title">Objetivos</h1>
          <p className="goals__subtitle">Vuestras metas de ahorro</p>
        </div>
        <Button
          label={<><svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 4v16m-8-8h16"/></svg>Nuevo Objetivo</>}
          variant="samuel"
          size="sm"
        />
      </div>

      {/* Stats */}
      <div className="goals__stats an d2">
        {SUMMARY_STATS.map(stat => (
          <div key={stat.label} className="goals__stat-card">
            <span className="goals__stat-value" style={stat.color ? { color: stat.color } as React.CSSProperties : undefined}>
              {stat.value}
            </span>
            <span className="goals__stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Goals grid */}
      <div className="goals__grid">
        {/* Column 1 */}
        <div className="goals__column">
          {col1Goals.map((goal, i) => (
            <div key={goal.id} className={`an d${3 + i * 2}`}>
              <GoalCard
                {...goal}
                onContribute={() => handleContribute(goal.id)}
                onEdit={() => handleEdit(goal.id)}
              />
            </div>
          ))}
        </div>

        {/* Column 2 */}
        <div className="goals__column">
          {col2Goals.map((goal, i) => (
            <div key={goal.id} className={`an d${4 + i * 2}`}>
              <GoalCard
                {...goal}
                onContribute={() => handleContribute(goal.id)}
                onEdit={() => handleEdit(goal.id)}
              />
            </div>
          ))}
          {/* Add placeholder */}
          <div className="goals__add-placeholder an d6" onClick={() => { /* future modal */ }}>
            <span className="goals__plus-icon">+</span>
            <span className="goals__add-text">Añadir objetivo</span>
          </div>
        </div>
      </div>
    </div>
  );
};
