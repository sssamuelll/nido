import React, { useCallback, useState } from 'react';
import { type Goal } from '../types';
import { Api } from '../api';
import { EmojiPicker } from '../components/EmojiPicker';
import { launchConfetti } from '../components/Confetti';
import { showToast } from '../components/Toast';
import { formatDayLabel, todayISO } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { handleApiError } from '../lib/handleApiError';
import { useResource } from '../hooks/useResource';
import { useIsMobile } from '../hooks/useMediaQuery';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import { ErrorView } from '../components/ErrorView';
import { Card, Eyebrow, Pill, Btn, Seg, StatCard, GoalCard as NidoGoalCard, Icon, CONTEXT_SEG_OPTIONS } from '../components/nido';

interface GoalFormData {
  name: string;
  icon: string;
  target: string;
  start_date: string;
  deadline: string;
  owner_type: 'shared' | 'personal';
}

const EMPTY_FORM: GoalFormData = {
  name: '', icon: '✨', target: '', start_date: todayISO(), deadline: '', owner_type: 'shared',
};

/* warm palette assigned per-goal by index (the data has no colour) */
const GOAL_COLORS = ['var(--clay)', 'var(--pine)', 'var(--plum)', 'var(--honey)', 'var(--berry)'];

export const Goals: React.FC = () => {
  const isMobile = useIsMobile();
  const loadGoals = useCallback(() => Api.getGoals(), []);
  const { data: goalsData, loading, error, reload: fetchGoals } = useResource<Goal[]>(loadGoals, {
    fallbackMessage: 'Error al cargar objetivos',
    invalidationKey: CACHE_KEYS.goals,
  });
  const goals = goalsData ?? [];

  const [activeContext, setActiveContext] = useState<'shared' | 'personal'>('shared');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [formData, setFormData] = useState<GoalFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [showStartDate, setShowStartDate] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null);
  const [contributeAmount, setContributeAmount] = useState('');
  const [contributing, setContributing] = useState(false);

  const filteredGoals = goals.filter((g) => g.owner_type === activeContext);
  const totalSaved = filteredGoals.reduce((sum, g) => sum + g.current, 0);
  const totalTarget = filteredGoals.reduce((sum, g) => sum + g.target, 0);
  const nextDeadlineGoal = filteredGoals.filter((g) => g.deadline).sort((a, b) => (a.deadline || '').localeCompare(b.deadline || ''))[0] ?? null;

  const openContributeModal = (goal: Goal) => { setContributeGoal(goal); setContributeAmount('50'); setContributing(false); };
  const openCreateModal = () => { setEditingGoal(null); setFormData({ ...EMPTY_FORM, owner_type: activeContext }); setShowStartDate(false); setShowCreateModal(true); };

  const handleEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormData({ name: goal.name, icon: goal.icon, target: String(goal.target), start_date: goal.start_date || '', deadline: goal.deadline || '', owner_type: goal.owner_type });
    setShowStartDate(!!goal.start_date);
    setShowCreateModal(true);
  };

  const handleContributeSubmit = async () => {
    if (!contributeGoal) return;
    const amount = parseFloat(contributeAmount);
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Ingresa un monto válido'); return; }
    try {
      setContributing(true);
      await Api.contributeToGoal(contributeGoal.id, amount);
      cacheBus.invalidate(CACHE_KEYS.goals);
      setContributeGoal(null);
      launchConfetti();
      showToast(`Has aportado ${formatMoney(amount)} a ${contributeGoal.name}`, 'success');
    } catch (err) {
      handleApiError(err, 'Error al aportar');
    } finally { setContributing(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este objetivo? Esta acción no se puede deshacer.')) return;
    try {
      await Api.deleteGoal(id);
      cacheBus.invalidate(CACHE_KEYS.goals);
      setShowCreateModal(false); setEditingGoal(null);
      showToast('Objetivo eliminado', 'success');
    } catch (err) { handleApiError(err, 'Error al eliminar'); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingGoal) {
        await Api.updateGoal(editingGoal.id, {
          name: formData.name, icon: formData.icon, target: Number(formData.target),
          start_date: formData.start_date || null, deadline: formData.deadline || null,
        });
        cacheBus.invalidate(CACHE_KEYS.goals);
        showToast('Objetivo actualizado', 'success');
      } else {
        await Api.createGoal({
          name: formData.name, icon: formData.icon, target: Number(formData.target),
          start_date: formData.start_date || undefined, deadline: formData.deadline || undefined,
          owner_type: formData.owner_type,
        });
        cacheBus.invalidate(CACHE_KEYS.goals);
        showToast('Nuevo objetivo creado', 'success');
      }
      setShowCreateModal(false); setEditingGoal(null); setFormData(EMPTY_FORM);
    } catch (err) {
      handleApiError(err, 'Error al guardar objetivo');
    } finally { setSubmitting(false); }
  };

  const header = (
    <div style={{ display: 'flex', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: isMobile ? 14 : 20 }}>
      <div>
        <h1 className={isMobile ? 'serif' : 'ptitle'} style={isMobile ? { fontSize: 26, lineHeight: 1 } : undefined}>Objetivos</h1>
        <div className="psub" style={isMobile ? { fontSize: 12, marginTop: 2 } : undefined}>Vuestras metas de ahorro, juntos</div>
      </div>
      {!isMobile ? <Btn variant="pine" onClick={openCreateModal}><Icon.plusS /> Nuevo objetivo</Btn> : null}
    </div>
  );

  const contextRow = (
    <div style={{ marginBottom: isMobile ? 14 : 20 }}>
      <Seg value={activeContext} options={CONTEXT_SEG_OPTIONS} onChange={setActiveContext} full={isMobile} />
    </div>
  );

  if (loading) {
    return (<>{header}{contextRow}<div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 18 }}>{[0, 1].map((i) => <div key={i} className="card" style={{ height: 200, opacity: 0.5 - i * 0.1 }} />)}</div></>);
  }
  if (error) return <>{header}{contextRow}<ErrorView message={error} onRetry={fetchGoals} /></>;

  const hero = (
    <Card pad style={{ marginBottom: isMobile ? 14 : 18, background: 'linear-gradient(140deg, var(--surface) 55%, var(--pine-tint))', padding: isMobile ? '20px 22px' : '24px 28px' }}>
      <Eyebrow>Ahorrado en total</Eyebrow>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, margin: '7px 0 4px' }}>
        <div style={{ fontSize: isMobile ? 48 : 56, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-.02em', color: 'var(--pine-2)' }}>{formatMoney(totalSaved)}</div>
        <Pill tone="ok" style={{ marginBottom: isMobile ? 7 : 10 }}>{filteredGoals.length} {filteredGoals.length === 1 ? 'activo' : 'activos'}</Pill>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
        {totalTarget > 0 ? <>de {formatMoney(totalTarget)} entre {filteredGoals.length === 1 ? 'el bote' : 'todos los botes'}</> : 'Aún sin metas en este contexto'}
      </div>
    </Card>
  );

  const stats = (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3,1fr)', gap: 12, marginBottom: isMobile ? 16 : 20 }}>
      <StatCard label="Objetivos activos" value={String(filteredGoals.length)} sub={activeContext === 'shared' ? 'compartidos' : 'personales'} />
      <StatCard label="Próximo hito" value={nextDeadlineGoal?.deadline ? formatDayLabel(nextDeadlineGoal.deadline) : '—'} sub={nextDeadlineGoal?.name ?? 'sin fecha límite'} valueColor="var(--honey)" />
      <StatCard label="Por reunir" value={formatMoney(Math.max(0, totalTarget - totalSaved))} sub="para cerrar todo" valueColor="var(--clay)" />
    </div>
  );

  const goalCards = filteredGoals.length === 0 ? (
    <Card pad style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ fontSize: 15, color: 'var(--ink-2)', fontWeight: 600, marginBottom: 4 }}>Aún no tenéis metas {activeContext === 'shared' ? 'compartidas' : 'personales'}</div>
      <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginBottom: 18 }}>Un viaje, un fondo, un capricho. Empezad por la primera.</div>
      <Btn variant="pine" onClick={openCreateModal} style={{ margin: '0 auto' }}><Icon.plusS /> Crear objetivo</Btn>
    </Card>
  ) : (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 14 : 18 }}>
      {filteredGoals.map((goal, i) => {
        const color = GOAL_COLORS[i % GOAL_COLORS.length];
        const pct = goal.target > 0 ? Math.round((goal.current / goal.target) * 100) : 0;
        const left = Math.max(0, goal.target - goal.current);
        const note = pct >= 100 ? '¡Meta alcanzada!' : `Faltan ${formatMoney(left)}${goal.deadline ? ` · cierra el ${formatDayLabel(goal.deadline)}` : ''}`;
        const GoalGlyph: React.FC = () => <span style={{ fontSize: 18 }}>{goal.icon}</span>;
        return (
          <NidoGoalCard
            key={goal.id}
            icon={GoalGlyph}
            color={color}
            title={goal.name}
            savedLabel={formatMoney(goal.current)}
            targetLabel={formatMoney(goal.target)}
            from={goal.start_date ? formatDayLabel(goal.start_date) : 'inicio'}
            to={goal.deadline ? formatDayLabel(goal.deadline) : 'sin límite'}
            note={note}
            pct={Math.min(100, pct)}
            onContribute={() => openContributeModal(goal)}
            onMenu={() => handleEdit(goal)}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {header}
      {contextRow}
      {hero}
      {stats}
      {goalCards}
      {isMobile ? <Btn variant="pine" onClick={openCreateModal} style={{ width: '100%', height: 52, fontSize: 16, marginTop: 16 }}><Icon.plusS /> Nuevo objetivo</Btn> : null}

      {/* create / edit modal — interim glass overlay (restyled in widgets pass) */}
      {showCreateModal ? (
        <div className="modal-overlay open" onClick={() => { setShowCreateModal(false); setEditingGoal(null); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingGoal ? 'Editar objetivo' : 'Nuevo objetivo'}</h3>
            <p>{editingGoal ? 'Modifica los datos del objetivo' : 'Crea una meta de ahorro para ti o para los dos'}</p>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label>Nombre</label>
                <input className="form-input" type="text" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: Viaje a Venezuela…" required />
              </div>
              <div className="form-row">
                <label>Meta</label>
                <span style={{ color: 'var(--tm)' }}>€</span>
                <input className="form-input" type="number" value={formData.target} onChange={(e) => setFormData((p) => ({ ...p, target: e.target.value }))} placeholder="3000" required min="1" step="any" style={{ width: 120, textAlign: 'right' }} />
              </div>
              <div className="form-row">
                <label>Emoji</label>
                <EmojiPicker value={formData.icon} onChange={(icon) => setFormData((p) => ({ ...p, icon }))} />
              </div>
              {!editingGoal ? (
                <div className="form-row">
                  <label>Tipo</label>
                  <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                    {(['shared', 'personal'] as const).map((t) => (
                      <div key={t} onClick={() => setFormData((p) => ({ ...p, owner_type: t }))} style={{ flex: 1, padding: 10, borderRadius: 'var(--rx)', cursor: 'pointer', textAlign: 'center', fontSize: 13, fontWeight: 500, border: formData.owner_type === t ? '2px solid var(--green)' : '1px solid var(--glass-border)', background: formData.owner_type === t ? 'var(--gl)' : 'var(--surface)', color: formData.owner_type === t ? 'var(--green)' : 'var(--ts)' }}>
                        {t === 'shared' ? 'Compartido' : 'Personal'}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="form-row">
                <label>Desde</label>
                {!showStartDate ? (
                  <button type="button" className="expense-date-toggle" onClick={() => setShowStartDate(true)}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                    {formatDayLabel(formData.start_date || todayISO())}
                  </button>
                ) : (
                  <div className="expense-date-picker">
                    <input className="expense-date-input" type="date" value={formData.start_date || todayISO()} onChange={(e) => setFormData((p) => ({ ...p, start_date: e.target.value }))} />
                    <button type="button" className="expense-date-close" onClick={() => setShowStartDate(false)}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                )}
              </div>
              <div className="form-row">
                <label>Hasta</label>
                <input className="form-input" type="date" value={formData.deadline} onChange={(e) => setFormData((p) => ({ ...p, deadline: e.target.value }))} />
              </div>
              <div className="modal-actions">
                {editingGoal ? (
                  <button type="button" onClick={() => handleDelete(editingGoal.id)} className="btn btn-sm" style={{ color: 'var(--red)', border: '1px solid var(--red)', background: 'transparent', marginRight: 'auto' }}>Eliminar</button>
                ) : null}
                <button type="button" onClick={() => { setShowCreateModal(false); setEditingGoal(null); }} className="btn btn-outline">Cancelar</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Guardando…' : editingGoal ? 'Actualizar' : 'Crear objetivo'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* contribute modal — interim glass overlay */}
      {contributeGoal ? (
        <div className="modal-overlay open" onClick={() => setContributeGoal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Aportar a {contributeGoal.name}</h3>
            <p>Progreso: {formatMoney(contributeGoal.current)} de {formatMoney(contributeGoal.target)} ({contributeGoal.target > 0 ? Math.round((contributeGoal.current / contributeGoal.target) * 100) : 0}%)</p>
            <div className="form-row">
              <label>Monto</label>
              <div className="contribute-amount-wrap">
                <span className="contribute-currency">€</span>
                <input className="form-input contribute-input" type="number" min="1" step="any" value={contributeAmount} onChange={(e) => setContributeAmount(e.target.value)} autoFocus />
              </div>
            </div>
            <div className="contribute-chips">
              {[25, 50, 100, 200].map((v) => (
                <button key={v} type="button" className={`contribute-chip ${contributeAmount === String(v) ? 'contribute-chip--active' : ''}`} onClick={() => setContributeAmount(String(v))}>€{v}</button>
              ))}
              {contributeGoal.target > contributeGoal.current ? (
                <button type="button" className="contribute-chip contribute-chip--fill" onClick={() => setContributeAmount(String(Math.round(contributeGoal.target - contributeGoal.current)))}>
                  Completar (€{Math.round(contributeGoal.target - contributeGoal.current)})
                </button>
              ) : null}
            </div>
            <div className="contribute-info">Este monto se descuenta del presupuesto {contributeGoal.owner_type === 'shared' ? 'compartido' : 'personal'}.</div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setContributeGoal(null)} disabled={contributing}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleContributeSubmit} disabled={contributing}>{contributing ? 'Guardando…' : `Aportar €${contributeAmount || '0'}`}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
};
