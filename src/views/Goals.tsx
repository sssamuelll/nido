import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { GoalCard } from '../components/GoalCard';
import { EmojiPicker } from '../components/EmojiPicker';
import { type Goal } from '../types';
import { Api } from '../api';
import { launchConfetti } from '../components/Confetti';
import { showToast } from '../components/Toast';

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatDateLabel = (dateStr: string) => {
  const today = format(new Date(), 'yyyy-MM-dd');
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
  if (dateStr === today) return 'Hoy';
  if (dateStr === yesterday) return 'Ayer';
  const d = new Date(dateStr + 'T12:00:00');
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
};

interface GoalFormData {
  name: string;
  icon: string;
  target: string;
  start_date: string;
  deadline: string;
  owner_type: 'shared' | 'personal';
  color: string;
}

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

const EMPTY_FORM: GoalFormData = {
  name: '',
  icon: '✨',
  target: '',
  start_date: todayStr(),
  deadline: '',
  owner_type: 'shared',
  color: '#60A5FA',
};

export const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formData, setFormData] = useState<GoalFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showStartDate, setShowStartDate] = useState(false);
  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributing, setContributing] = useState(false);

  const fetchGoals = async () => {
    try {
      const data = await Api.getGoals();
      setGoals(data);
      setError(null);
    } catch (err) {
      console.error('Failed to load goals:', err);
      setError('Error al cargar objetivos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchGoals(); }, []);

  const openContributeModal = (goal: Goal) => {
    setContributeGoal(goal);
    setContributeAmount('50');
    setContributing(false);
  };

  const handleContributeSubmit = async () => {
    if (!contributeGoal) return;
    const amount = parseFloat(contributeAmount);
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Ingresa un monto válido'); return; }
    try {
      setContributing(true);
      await Api.contributeToGoal(contributeGoal.id, amount);
      await fetchGoals();
      setContributeGoal(null);
      launchConfetti();
      showToast(`¡€${amount} añadidos a ${contributeGoal.name}! 🚀`);
    } catch (err) {
      console.error('Failed to contribute:', err);
      showToast('Error al contribuir');
    } finally {
      setContributing(false);
    }
  };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      icon: goal.icon,
      target: String(goal.target),
      start_date: goal.start_date || '',
      deadline: goal.deadline || '',
      owner_type: goal.owner_type,
      color: '#60A5FA',
    });
    setShowStartDate(!!goal.start_date);
    setShowCreateModal(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await Api.deleteGoal(id);
      await fetchGoals();
      setShowCreateModal(false);
      setEditingGoal(null);
      showToast('Objetivo eliminado');
    } catch (err) {
      console.error('Failed to delete goal:', err);
      showToast('Error al eliminar');
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
          start_date: formData.start_date || null,
          deadline: formData.deadline || null,
        });
        showToast('Objetivo actualizado');
      } else {
        await Api.createGoal({
          name: formData.name,
          icon: formData.icon,
          target: Number(formData.target),
          start_date: formData.start_date || undefined,
          deadline: formData.deadline || undefined,
          owner_type: formData.owner_type,
        });
        showToast('¡Nuevo objetivo creado!');
      }
      await fetchGoals();
      setShowCreateModal(false);
      setEditingGoal(null);
      setFormData(EMPTY_FORM);
    } catch (err) {
      console.error('Failed to save goal:', err);
      showToast('Error al guardar objetivo');
    } finally {
      setSubmitting(false);
    }
  };

  const openCreateModal = () => {
    setEditingGoal(null);
    setFormData(EMPTY_FORM);
    setShowStartDate(false);
    setShowCreateModal(true);
  };

  const filteredGoals = goals.filter(g => g.owner_type === activeContext);

  const totalSaved = filteredGoals.reduce((sum, g) => sum + g.current, 0);
  const activeGoals = filteredGoals.length;
  const nextDeadline = filteredGoals
    .filter(g => g.deadline)
    .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))[0]?.deadline || '-';

  const summaryStats = [
    { label: 'TOTAL AHORRADO', value: `€${totalSaved.toLocaleString('es-ES')}`, color: 'var(--green)' },
    { label: 'OBJ. ACTIVOS', value: String(activeGoals), color: undefined },
    { label: 'MEJOR RACHA', value: filteredGoals.length > 0 ? `${filteredGoals.length} obj` : '-', color: 'var(--orange)' },
    { label: 'PRÓXIMO HITO', value: nextDeadline, color: 'var(--red)' },
  ];
  const col1Goals = filteredGoals.filter((_, i) => i % 2 === 0);
  const col2Goals = filteredGoals.filter((_, i) => i % 2 === 1);

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
      {/* Header — matches design: title left, button right */}
      <div className="topbar an d1">
        <div>
          <h1>Objetivos</h1>
          <p>Vuestras metas de ahorro</p>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={openCreateModal}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M12 4v16m-8-8h16"/></svg>
          Nuevo Objetivo
        </button>
      </div>

      {error && <div style={{ color: 'var(--red)', padding: '12px' }}>{error}</div>}

      {/* Context tabs — same as Analytics/Dashboard */}
      <div className="analytics__context-tabs an d1">
        <button className={`analytics__context-tab ${activeContext === 'shared' ? 'analytics__context-tab--active' : ''}`} onClick={() => setActiveContext('shared')}>
          <div className="dot sh-d" />
          Compartido
        </button>
        <button className={`analytics__context-tab ${activeContext === 'personal' ? 'analytics__context-tab--active' : ''}`} onClick={() => setActiveContext('personal')}>
          <div className="dot ps-d" />
          Personal
        </button>
      </div>

      {/* Stats — reflect filtered context */}
      <div className="goals__stats an d2">
        {summaryStats.map(stat => (
          <div key={stat.label} className="goals__stat-card">
            <span className="goals__stat-value" style={stat.color ? { color: stat.color } : undefined}>
              {stat.value}
            </span>
            <span className="goals__stat-label">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Goals grid */}
      <div className="goals__grid">
        <div className="goals__column">
          {col1Goals.map((goal, i) => (
            <div key={goal.id} className={`an d${3 + i * 2}`}>
              <GoalCard {...goal} onContribute={() => openContributeModal(goal)} onEdit={() => handleEdit(goal)} />
            </div>
          ))}
        </div>
        <div className="goals__column">
          {col2Goals.map((goal, i) => (
            <div key={goal.id} className={`an d${4 + i * 2}`}>
              <GoalCard {...goal} onContribute={() => openContributeModal(goal)} onEdit={() => handleEdit(goal)} />
            </div>
          ))}
        </div>
      </div>

      {/* Modal — 1:1 design reference */}
      {showCreateModal && (
        <div className="modal-overlay open" onClick={() => { setShowCreateModal(false); setEditingGoal(null); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editingGoal ? 'Editar Objetivo' : 'Nuevo Objetivo'}</h3>
            <p>{editingGoal ? 'Modifica los datos del objetivo' : 'Crea una meta de ahorro para ti o para los dos'}</p>
            <form onSubmit={handleSubmit}>
              {/* Name */}
              <div className="form-row">
                <label>Nombre</label>
                <input className="form-input" type="text" value={formData.name} onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Ej: Vacaciones, Fondo..." required />
              </div>

              {/* Target amount */}
              <div className="form-row">
                <label>Meta</label>
                <span style={{ color: 'var(--tm)' }}>€</span>
                <input className="form-input" type="number" value={formData.target} onChange={e => setFormData(prev => ({ ...prev, target: e.target.value }))} placeholder="5000" required min="1" step="any" style={{ width: 120, textAlign: 'right' }} />
              </div>

              {/* Emoji picker — replaces old SVG icon + color pickers */}
              <div className="form-row">
                <label>Emoji</label>
                <EmojiPicker value={formData.icon} onChange={icon => setFormData(prev => ({ ...prev, icon }))} />
              </div>

              {/* Type toggle — Compartido / Personal as buttons */}
              {!editingGoal && (
                <div className="form-row">
                  <label>Tipo</label>
                  <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                    <div
                      onClick={() => setFormData(prev => ({ ...prev, owner_type: 'shared' }))}
                      style={{
                        flex: 1, padding: 10, borderRadius: 'var(--rx)', cursor: 'pointer',
                        textAlign: 'center', fontSize: 13, fontWeight: 500,
                        border: formData.owner_type === 'shared' ? '2px solid var(--blue)' : '1px solid var(--glass-border)',
                        background: formData.owner_type === 'shared' ? 'var(--bl)' : 'var(--surface)',
                        color: formData.owner_type === 'shared' ? 'var(--blue)' : 'var(--ts)',
                      }}
                    >
                      Compartido
                    </div>
                    <div
                      onClick={() => setFormData(prev => ({ ...prev, owner_type: 'personal' }))}
                      style={{
                        flex: 1, padding: 10, borderRadius: 'var(--rx)', cursor: 'pointer',
                        textAlign: 'center', fontSize: 13, fontWeight: 500,
                        border: formData.owner_type === 'personal' ? '2px solid var(--blue)' : '1px solid var(--glass-border)',
                        background: formData.owner_type === 'personal' ? 'var(--bl)' : 'var(--surface)',
                        color: formData.owner_type === 'personal' ? 'var(--blue)' : 'var(--ts)',
                      }}
                    >
                      Personal
                    </div>
                  </div>
                </div>
              )}

              {/* Date range — Desde uses pill pattern like AddExpense */}
              <div className="form-row">
                <label>Desde</label>
                {!showStartDate ? (
                  <button
                    type="button"
                    className="expense-date-toggle"
                    onClick={() => setShowStartDate(true)}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                    {formatDateLabel(formData.start_date || todayStr())}
                    {formData.start_date && formData.start_date !== todayStr() && <span className="expense-date-dot" />}
                  </button>
                ) : (
                  <div className="expense-date-picker">
                    <input
                      className="expense-date-input"
                      type="date"
                      value={formData.start_date || todayStr()}
                      onChange={e => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    />
                    {formData.start_date !== todayStr() && (
                      <button
                        type="button"
                        className="expense-date-today"
                        onClick={() => { setFormData(prev => ({ ...prev, start_date: todayStr() })); setShowStartDate(false); }}
                      >
                        Hoy
                      </button>
                    )}
                    <button
                      type="button"
                      className="expense-date-close"
                      onClick={() => setShowStartDate(false)}
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="form-row">
                <label>Hasta</label>
                <input
                  className="form-input"
                  type="date"
                  value={formData.deadline}
                  onChange={e => setFormData(prev => ({ ...prev, deadline: e.target.value }))}
                  placeholder="Sin fecha límite"
                />
              </div>

              {/* Actions */}
              <div className="modal-actions">
                {editingGoal && (
                  <button type="button" onClick={() => handleDelete(editingGoal.id)} className="btn btn-sm" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'transparent', marginRight: 'auto' }}>
                    Eliminar
                  </button>
                )}
                <button type="button" onClick={() => { setShowCreateModal(false); setEditingGoal(null); }} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Guardando...' : editingGoal ? 'Actualizar' : 'Crear Objetivo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Contribute modal */}
      {contributeGoal && (
        <div className="modal-overlay open" onClick={() => setContributeGoal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Contribuir a {contributeGoal.name}</h3>
            <p>
              Progreso actual: €{contributeGoal.current.toLocaleString('es-ES')} de €{contributeGoal.target.toLocaleString('es-ES')}
              {' '}({contributeGoal.target > 0 ? Math.round((contributeGoal.current / contributeGoal.target) * 100) : 0}%)
            </p>

            {/* Amount with quick-select buttons */}
            <div className="form-row">
              <label>Monto</label>
              <div className="contribute-amount-wrap">
                <span className="contribute-currency">€</span>
                <input
                  className="form-input contribute-input"
                  type="number"
                  min="1"
                  step="any"
                  value={contributeAmount}
                  onChange={e => setContributeAmount(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            {/* Quick amount chips */}
            <div className="contribute-chips">
              {[25, 50, 100, 200].map(v => (
                <button
                  key={v}
                  type="button"
                  className={`contribute-chip ${contributeAmount === String(v) ? 'contribute-chip--active' : ''}`}
                  onClick={() => setContributeAmount(String(v))}
                >
                  €{v}
                </button>
              ))}
              {/* "Remaining" chip - fills the rest to reach target */}
              {contributeGoal.target > contributeGoal.current && (
                <button
                  type="button"
                  className={`contribute-chip contribute-chip--fill`}
                  onClick={() => setContributeAmount(String(Math.round(contributeGoal.target - contributeGoal.current)))}
                >
                  Completar (€{Math.round(contributeGoal.target - contributeGoal.current)})
                </button>
              )}
            </div>

            {/* Info: where the money comes from */}
            <div className="contribute-info">
              Este monto se descuenta del presupuesto {contributeGoal.owner_type === 'shared' ? 'compartido' : 'personal'}
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setContributeGoal(null)} disabled={contributing}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleContributeSubmit} disabled={contributing}>
                {contributing ? 'Guardando...' : `Añadir €${contributeAmount || '0'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
