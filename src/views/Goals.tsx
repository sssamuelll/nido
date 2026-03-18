import React, { useState } from 'react';
import { GoalCard } from '../components/GoalCard';
import { Button } from '../components/Button';
import { type Goal } from '../types';

const MOCK_GOALS: Goal[] = [
  { id: '1', name: 'Vacaciones Verano', emoji: '✈️', current: 3200, target: 5000, deadline: 'Jul 2026', owner: 'shared' },
  { id: '2', name: 'MacBook Pro', emoji: '💻', current: 1800, target: 3000, deadline: 'Sep 2026', owner: 'samuel' },
  { id: '3', name: 'Fondo Emergencia', emoji: '🛡️', current: 2500, target: 6000, deadline: 'Dic 2026', owner: 'shared' },
  { id: '4', name: 'Cámara Sony A7', emoji: '📸', current: 970, target: 1200, deadline: 'May 2026', owner: 'maria' },
];

const SUMMARY_STATS = [
  { label: 'Total ahorrado', value: '€8.470', sub: 'de €15.200 objetivo', color: 'var(--color-samuel)' },
  { label: 'Objetivos activos', value: '4', sub: '2 en progreso este mes', color: 'var(--color-shared)' },
  { label: 'Mejor racha', value: '🔥 8 sem', sub: 'contribuciones semanales', color: 'var(--color-warning)' },
  { label: 'Próximo hito', value: 'Jul 2026', sub: 'Vacaciones de verano', color: 'var(--color-maria)' },
];

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>(MOCK_GOALS);

  const handleContribute = (id: string) => {
    // Mock contribute: add a small amount
    setGoals(prev =>
      prev.map(g => g.id === id ? { ...g, current: Math.min(g.current + 50, g.target) } : g)
    );
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
      <div className="goals__header">
        <div>
          <div className="goals__subtitle">Finanzas</div>
          <div className="goals__title">Objetivos</div>
        </div>
        <Button
          label="Nuevo Objetivo"
          variant="samuel"
          size="sm"
        />
      </div>

      {/* Stats */}
      <div className="goals__stats">
        {SUMMARY_STATS.map(stat => (
          <div key={stat.label} className="goals__stat-card">
            <span className="goals__stat-label">{stat.label}</span>
            <span className="goals__stat-value" style={{ color: stat.color } as React.CSSProperties}>
              {stat.value}
            </span>
            <span className="goals__stat-sub">{stat.sub}</span>
          </div>
        ))}
      </div>

      {/* Goals grid */}
      <div className="goals__grid">
        {/* Column 1 */}
        <div className="goals__column">
          {col1Goals.map(goal => (
            <GoalCard
              key={goal.id}
              {...goal}
              onContribute={() => handleContribute(goal.id)}
              onEdit={() => handleEdit(goal.id)}
            />
          ))}
        </div>

        {/* Column 2 */}
        <div className="goals__column">
          {col2Goals.map(goal => (
            <GoalCard
              key={goal.id}
              {...goal}
              onContribute={() => handleContribute(goal.id)}
              onEdit={() => handleEdit(goal.id)}
            />
          ))}
          {/* Add placeholder */}
          <div className="goals__add-placeholder">
            <span className="goals__plus-icon">+</span>
            <span className="goals__add-text">Añadir objetivo</span>
          </div>
        </div>
      </div>
    </div>
  );
};
