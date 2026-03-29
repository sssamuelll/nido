import React, { useState, useEffect } from 'react';
import { Api } from '../api';
import { showToast } from './Toast';
import { EmojiPicker } from './EmojiPicker';

interface RecurringItem {
  id: number;
  name: string;
  emoji: string;
  amount: number;
  category: string;
  type: 'shared' | 'personal';
  notes?: string;
  paused: boolean;
}

interface Cycle {
  id: number;
  status: 'active' | 'pending' | 'completed';
  requested_by: number;
  month: string;
}

interface RecurringSectionProps {
  userId: number;
  onCycleApproved?: () => void;
}

export const RecurringSection: React.FC<RecurringSectionProps> = ({ userId, onCycleApproved }) => {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<RecurringItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for edit/add modal
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('🔁');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formType, setFormType] = useState<'shared' | 'personal'>('shared');
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [recurring, currentCycle] = await Promise.all([
        Api.getRecurring(),
        Api.getCurrentCycle().catch(() => null),
      ]);
      setItems(Array.isArray(recurring) ? recurring : []);
      setCycle(currentCycle);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeItems = items.filter(i => !i.paused);
  const total = activeItems.reduce((sum, i) => sum + i.amount, 0);
  const sharedCount = activeItems.filter(i => i.type === 'shared').length;
  const personalCount = activeItems.filter(i => i.type === 'personal').length;

  const cycleStatusLabel = cycle?.status === 'active'
    ? 'Activo'
    : cycle?.status === 'pending'
      ? 'Pendiente'
      : null;

  const cycleStatusColor = cycle?.status === 'active'
    ? '#34D399'
    : cycle?.status === 'pending'
      ? '#FBBF24'
      : undefined;

  const showApprovalBanner = cycle?.status === 'pending' && cycle.requested_by !== userId;
  const showStartCycle = !cycle && items.length > 0;

  const openEditModal = (item: RecurringItem) => {
    setEditItem(item);
    setFormName(item.name);
    setFormEmoji(item.emoji);
    setFormAmount(String(item.amount));
    setFormCategory(item.category);
    setFormType(item.type);
    setFormNotes(item.notes || '');
    setShowAddModal(false);
  };

  const openAddModal = () => {
    setEditItem(null);
    setFormName('');
    setFormEmoji('🔁');
    setFormAmount('');
    setFormCategory('');
    setFormType('shared');
    setFormNotes('');
    setShowAddModal(true);
  };

  const closeModal = () => {
    setEditItem(null);
    setShowAddModal(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formAmount) return;
    setSaving(true);
    try {
      if (editItem) {
        await Api.updateRecurring(editItem.id, {
          name: formName.trim(),
          emoji: formEmoji,
          amount: parseFloat(formAmount),
          category: formCategory.trim(),
          type: formType,
          notes: formNotes.trim() || undefined,
        });
        showToast('Gasto fijo actualizado');
      } else {
        await Api.createRecurring({
          name: formName.trim(),
          emoji: formEmoji,
          amount: parseFloat(formAmount),
          category: formCategory.trim(),
          type: formType,
          notes: formNotes.trim() || undefined,
        });
        showToast('Gasto fijo creado');
      }
      closeModal();
      await loadData();
    } catch {
      showToast('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await Api.togglePauseRecurring(editItem.id);
      showToast(editItem.paused ? 'Gasto activado' : 'Gasto pausado');
      closeModal();
      await loadData();
    } catch {
      showToast('Error al cambiar estado');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await Api.deleteRecurring(editItem.id);
      showToast('Gasto fijo eliminado');
      closeModal();
      await loadData();
    } catch {
      showToast('Error al eliminar');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveCycle = async () => {
    if (!cycle) return;
    try {
      await Api.approveCycle(cycle.id);
      showToast('Ciclo aprobado');
      await loadData();
      onCycleApproved?.();
    } catch {
      showToast('Error al aprobar ciclo');
    }
  };

  const handleStartCycle = async () => {
    try {
      await Api.requestCycle();
      showToast('Ciclo iniciado');
      await loadData();
    } catch {
      showToast('Error al iniciar ciclo');
    }
  };

  if (loading) {
    return (
      <div className="card an d4 recurring-card">
        <div className="skeleton skeleton--card-sm" />
      </div>
    );
  }

  const isModalOpen = editItem !== null || showAddModal;

  return (
    <>
      <div className="card an d4 recurring-card">
        {/* Header */}
        <div className="sh recurring-card__header">
          <div className="recurring-card__title-row">
            <span className="st">Gastos fijos del ciclo</span>
            <span className="recurring-card__total">
              €{total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          {cycleStatusLabel ? (
            <span className="recurring-card__status" style={{ background: (cycleStatusColor ?? '#888') + '22', color: cycleStatusColor }}>
              {cycleStatusLabel}
            </span>
          ) : (
            <span className="recurring-card__status recurring-card__status--idle">—</span>
          )}
        </div>

        {/* Subtitle */}
        {items.length > 0 && (
          <div className="recurring-card__meta">
            {activeItems.length} activo{activeItems.length !== 1 ? 's' : ''}
            {sharedCount > 0 && personalCount > 0 && (
              <> · {sharedCount} compartido{sharedCount !== 1 ? 's' : ''}, {personalCount} personal{personalCount !== 1 ? 'es' : ''}</>
            )}
          </div>
        )}

        {/* Items list */}
        {items.length === 0 ? (
          <div className="empty-view recurring-card__empty">
            No hay gastos fijos configurados
          </div>
        ) : (
          <div className="recurring-card__list">
            {items.map(item => (
              <div
                key={item.id}
                onClick={() => openEditModal(item)}
                className={`budget-item recurring-card__item${item.paused ? ' recurring-card__item--paused' : ''}`}
              >
                <div className="icon-c recurring-card__icon">
                  <span className="recurring-card__emoji">{item.emoji}</span>
                </div>
                <div className="recurring-card__item-body">
                  <div className="recurring-card__item-top-row">
                    <div className="recurring-card__item-title-row">
                      <span className="recurring-card__item-title">{item.name}</span>
                      {item.type === 'personal' && (
                        <span className="recurring-card__pill recurring-card__pill--personal">
                          personal
                        </span>
                      )}
                      {item.paused && (
                        <span className="recurring-card__pill recurring-card__pill--paused">
                          pausado
                        </span>
                      )}
                    </div>
                    <span className="recurring-card__amount">
                      €{item.amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="recurring-card__subline">{item.category || 'Sin categoría'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Approval banner */}
        {showApprovalBanner && (
          <div className="recurring-card__approval-banner">
            <span className="recurring-card__approval-text">Ciclo pendiente de aprobación</span>
            <button
              className="btn btn-primary recurring-card__approval-btn"
              onClick={handleApproveCycle}
            >
              Aprobar
            </button>
          </div>
        )}

        {/* Footer actions */}
        <div className="recurring-card__actions">
          <div
            className="add-cat-row recurring-card__add"
            onClick={openAddModal}
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path d="M12 4v16m-8-8h16" />
            </svg>
            {' '}Añadir recurrente
          </div>
          {showStartCycle && (
            <button
              className="btn btn-outline"
              onClick={handleStartCycle}
              style={{ fontSize: 12, padding: '6px 14px' }}
            >
              Iniciar ciclo
            </button>
          )}
        </div>
      </div>

      {/* Edit / Add Modal */}
      {isModalOpen && (
        <div className="modal-overlay open" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
              {editItem ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
            </h2>

            <div className="form-row">
              <label style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 4 }}>Nombre</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <EmojiPicker value={formEmoji} onChange={setFormEmoji} />
                <input
                  className="form-input"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="Nombre del gasto"
                  style={{ flex: 1 }}
                />
              </div>
            </div>

            <div className="form-row">
              <label style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 4 }}>Importe (€)</label>
              <input
                className="form-input"
                type="number"
                inputMode="decimal"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-row">
              <label style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 4 }}>Categoría</label>
              <input
                className="form-input"
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                placeholder="Ej: Hogar, Seguros, Suscripciones..."
              />
            </div>

            <div className="form-row">
              <label style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 4 }}>Tipo</label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <button
                  type="button"
                  onClick={() => setFormType('shared')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: formType === 'shared' ? 'rgba(96,165,250,0.2)' : 'transparent',
                    color: formType === 'shared' ? '#60A5FA' : 'var(--tm)',
                    transition: 'all 0.15s',
                  }}
                >
                  Compartido
                </button>
                <button
                  type="button"
                  onClick={() => setFormType('personal')}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    background: formType === 'personal' ? 'rgba(167,139,250,0.2)' : 'transparent',
                    color: formType === 'personal' ? '#A78BFA' : 'var(--tm)',
                    transition: 'all 0.15s',
                  }}
                >
                  Personal
                </button>
              </div>
            </div>

            <div className="form-row">
              <label style={{ fontSize: 13, color: 'var(--tm)', marginBottom: 4 }}>Notas</label>
              <input
                className="form-input"
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                placeholder="Notas opcionales..."
              />
            </div>

            {/* Modal footer */}
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              {editItem ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-outline"
                    onClick={handleTogglePause}
                    disabled={saving}
                    style={{ fontSize: 13 }}
                  >
                    {editItem.paused ? 'Activar' : 'Pausar'}
                  </button>
                  <button
                    className="btn btn-outline"
                    onClick={handleDelete}
                    disabled={saving}
                    style={{ fontSize: 13, color: '#F87171', borderColor: 'rgba(248,113,113,0.3)' }}
                  >
                    Eliminar
                  </button>
                </div>
              ) : (
                <div />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-outline" onClick={closeModal} style={{ fontSize: 13 }}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={saving || !formName.trim() || !formAmount}
                  style={{ fontSize: 13 }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
