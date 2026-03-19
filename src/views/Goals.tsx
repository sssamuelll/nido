import React, { useEffect, useState } from 'react';
import { GoalCard } from '../components/GoalCard';
import { Button } from '../components/Button';
import { type Goal } from '../types';
import { Api } from '../api';
import { launchConfetti } from '../components/Confetti';
import { showToast } from '../components/Toast';

interface GoalFormData {
  name: string;
  icon: string;
  target: string;
  deadline: string;
  owner_type: 'shared' | 'personal';
}

const EMPTY_FORM: GoalFormData = {
  name: '',
  icon: '\uD83C\uDFAF',
  target: '',
  deadline: '',
  owner_type: 'shared',
};

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formData, setFormData] = useState<GoalFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  const fetchGoals = async () => {
    try {
      const data = await Api.getGoals();
      setGoals(data);
      setError(null);
    } catch (err) {
      setError('Error al cargar objetivos');
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGoals();
  }, []);

  const handleContribute = async (id: number) => {
    try {
      await Api.contributeToGoal(id, 50);
      await fetchGoals();
      launchConfetti();
      showToast('\u00a1Contribuci\u00f3n registrada! Siguen avanzando juntos \uD83D\uDE80');
    } catch (err) {
      showToast('Error al contribuir');
      console.error('Error contributing:', err);
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      icon: goal.icon,
      target: String(goal.target),
      deadline: goal.deadline || '',
      owner_type: goal.owner_type,
    });
    setShowCreateModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await Api.deleteGoal(id);
      await fetchGoals();
      showToast('Objetivo eliminado');
    } catch (err) {
      showToast('Error al eliminar');
      console.error('Error deleting goal:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingGoal) {
        await Api.updateGoal(editingGoal.id, {
          name: formData.name,
          icon: formData.icon,
          target: Number(formData.target),
          deadline: formData.deadline || null,
        });
        showToast('Objetivo actualizado');
      } else {
        await Api.createGoal({
          name: formData.name,
          icon: formData.icon,
          target: Number(formData.target),
          deadline: formData.deadline || undefined,
          owner_type: formData.owner_type,
        });
        showToast('\u00a1Nuevo objetivo creado!');
      }
      await fetchGoals();
      setShowCreateModal(false);
      setEditingGoal(null);
      setFormData(EMPTY_FORM);
    } catch (err) {
      showToast('Error al guardar objetivo');
      console.error('Error saving goal:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setEditingGoal(null);
    setFormData(EMPTY_FORM);
    setShowCreateModal(true);
  };

  // Summary stats computed from real goals
  const totalSaved = goals.reduce((sum, g) => sum + g.current, 0);
  const activeGoals = goals.length;
  const nextDeadline = goals
    .filter(g => g.deadline)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))[0]?.deadline || '-';

  const summaryStats = [
    { label: 'TOTAL AHORRADO', value: `\u20AC${totalSaved.toLocaleString('es-ES')}`, color: 'var(--green)' },
    { label: 'OBJ. ACTIVOS', value: String(activeGoals), color: undefined },
    { label: 'MEJOR RACHA', value: '8 sem', color: 'var(--orange)' },
    { label: 'PR\u00D3XIMO HITO', value: nextDeadline, color: 'var(--red)' },
  ];

  // Masonry layout: col1 = [0, 2, ...], col2 = [1, 3, ...]
  const col1Goals = goals.filter((_, i) => i % 2 === 0);
  const col2Goals = goals.filter((_, i) => i % 2 === 1);

  if (loading) {
    return (
      <div className="u-flex-gap-24">
        <div className="goals__header an d1">
          <div>
            <h1 className="goals__title">Objetivos</h1>
            <p className="goals__subtitle">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

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
          onClick={openCreateModal}
        />
      </div>

      {error && <div className="goals__error an d2" style={{ color: 'var(--red)', padding: '12px' }}>{error}</div>}

      {/* Stats */}
      <div className="goals__stats an d2">
        {summaryStats.map(stat => (
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
                onEdit={() => handleEdit(goal)}
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
                onEdit={() => handleEdit(goal)}
              />
            </div>
          ))}
          {/* Add placeholder */}
          <div className="goals__add-placeholder an d6" onClick={openCreateModal}>
            <span className="goals__plus-icon">+</span>
            <span className="goals__add-text">A\u00f1adir objetivo</span>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {showCreateModal && (
        <div className="modal-overlay open" onClick={() => { setShowCreateModal(false); setEditingGoal(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingGoal ? 'Editar Objetivo' : 'Nuevo Objetivo'}</h3>
            <p>{editingGoal ? 'Modifica los datos del objetivo' : 'Crea una nueva meta de ahorro'}</p>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label>Icono</label>
                <input className="form-input" type="text" value={formData.icon} onChange={e => setFormData(prev => ({ ...prev, icon: e.target.value }))} maxLength={4} style={{ flex: '0 0 60px', fontSize: 20, textAlign: 'center' }} />
              </div>
              <div className="form-row">
                <label>Nombre</label>
                <input className="form-input" type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Vacaciones Verano" required />
              </div>
              <div className="form-row">
                <label>Objetivo</label>
                <input className="form-input" type="number" value={formData.target} onChange={e => setFormData(prev => ({ ...prev, target: e.target.value }))} placeholder="5000" required min="1" step="any" />
              </div>
              <div className="form-row">
                <label>Fecha</label>
                <input className="form-input" type="text" value={formData.deadline} onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))} placeholder="Ej: Jul 2026" />
              </div>
              {!editingGoal && (
                <div className="form-row">
                  <label>Tipo</label>
                  <select className="form-input" value={formData.owner_type} onChange={e => setFormData(prev => ({ ...prev, owner_type: e.target.value as 'shared' | 'personal' }))}>
                    <option value="shared">Compartido</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>
              )}
              <div className="modal-actions">
                {editingGoal && (
                  <button type="button" onClick={() => handleDelete(editingGoal.id)} className="btn btn-sm" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'transparent', marginRight: 'auto' }}>
                    Eliminar
                  </button>
                )}
                <button type="button" onClick={() => { setShowCreateModal(false); setEditingGoal(null); }} className="btn btn-sm" style={{ background: 'var(--surface)', border: '1px solid var(--glass-border)' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
                  {submitting ? 'Guardando...' : editingGoal ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
