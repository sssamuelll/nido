import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Api } from '../api';
import { showToast } from './Toast';
import { EmojiPicker } from './EmojiPicker';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { useAsyncEffect } from '../hooks/useResource';
import { formatMoneyExact } from '../lib/money';
import { handleApiError } from '../lib/handleApiError';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import type { CycleDetail } from '../api-types/cycles';

interface RecurringItem {
  id: number;
  name: string;
  emoji: string;
  amount: number;
  category: string;
  type: 'shared' | 'personal';
  notes?: string;
  every_n_cycles?: number;
  paused: boolean;
}

interface RecurringSectionProps {
  userId: number;
  onCycleApproved?: () => void;
}

const TagIcon = () => (
  <svg width="16" height="16" fill="none" stroke="var(--tm)" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

export const RecurringSection: React.FC<RecurringSectionProps> = ({ userId, onCycleApproved }) => {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [cycle, setCycle] = useState<CycleDetail | null>(null);
  const [editItem, setEditItem] = useState<RecurringItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for edit/add modal
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('🔁');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formType, setFormType] = useState<'shared' | 'personal'>('shared');
  const [formNotes, setFormNotes] = useState('');
  const [everyNCycles, setEveryNCycles] = useState(1);
  const [saving, setSaving] = useState(false);

  // Category cmd-palette state
  const { categories, getCategoryDef } = useCategoryManagement(formType);
  const [categorySearch, setCategorySearch] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const cmdRef = useRef<HTMLDivElement>(null);

  const filteredCategories = useMemo(() => {
    return categories.filter((item) =>
      item.name.toLowerCase().includes(categorySearch.toLowerCase()) || categorySearch === ''
    );
  }, [categories, categorySearch]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cmdRef.current && !cmdRef.current.contains(e.target as Node)) {
        setCmdOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadData = useCallback(async () => {
    const [recurring, currentCycle] = await Promise.all([
      Api.getRecurring(),
      Api.getCurrentCycle().catch((err) => {
        handleApiError(err, 'Error al cargar ciclo activo', { silent: true });
        return null;
      }),
    ]);
    setItems(Array.isArray(recurring) ? recurring : []);
    setCycle(currentCycle);
  }, []);

  const { loading } = useAsyncEffect(loadData, {
    fallbackMessage: 'Error al cargar recurrentes',
    invalidationKeys: [CACHE_KEYS.recurring, CACHE_KEYS.cycles],
  });

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

  const showApprovalBanner = cycle?.status === 'pending'
    && cycle.requested_by_user_id !== userId;
  const showStartCycle = !cycle && items.length > 0;

  const openEditModal = (item: RecurringItem) => {
    setEditItem(item);
    setFormName(item.name);
    setFormEmoji(item.emoji);
    setFormAmount(String(item.amount));
    setFormCategory(item.category);
    setFormType(item.type);
    setFormNotes(item.notes || '');
    setEveryNCycles(item.every_n_cycles ?? 1);
    setCategorySearch('');
    setCmdOpen(false);
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
    setEveryNCycles(1);
    setCategorySearch('');
    setCmdOpen(false);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setEditItem(null);
    setShowAddModal(false);
    setCmdOpen(false);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formAmount || parseFloat(formAmount) <= 0) return;
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
          every_n_cycles: everyNCycles,
        });
        cacheBus.invalidate(CACHE_KEYS.recurring);
        showToast('Gasto fijo actualizado', 'success');
      } else {
        await Api.createRecurring({
          name: formName.trim(),
          emoji: formEmoji,
          amount: parseFloat(formAmount),
          category: formCategory.trim(),
          type: formType,
          notes: formNotes.trim() || undefined,
          every_n_cycles: everyNCycles,
        });
        cacheBus.invalidate(CACHE_KEYS.recurring, CACHE_KEYS.expenses);
        showToast('Gasto fijo creado', 'success');
      }
      closeModal();
    } catch (err) {
      handleApiError(err, 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await Api.togglePauseRecurring(editItem.id);
      cacheBus.invalidate(CACHE_KEYS.recurring);
      showToast(editItem.paused ? 'Gasto activado' : 'Gasto pausado', 'success');
      closeModal();
    } catch (err) {
      handleApiError(err, 'Error al cambiar estado');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editItem) return;
    setSaving(true);
    try {
      await Api.deleteRecurring(editItem.id);
      cacheBus.invalidate(CACHE_KEYS.recurring);
      showToast('Gasto fijo eliminado', 'success');
      closeModal();
    } catch (err) {
      handleApiError(err, 'Error al eliminar');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveCycle = async () => {
    if (!cycle) return;
    try {
      await Api.approveCycle(cycle.id);
      cacheBus.invalidate(CACHE_KEYS.cycles, CACHE_KEYS.summary);
      showToast('Ciclo aprobado', 'success');
      onCycleApproved?.();
    } catch (err) {
      handleApiError(err, 'Error al aprobar ciclo');
    }
  };

  const handleStartCycle = async () => {
    try {
      await Api.requestCycle();
      cacheBus.invalidate(CACHE_KEYS.cycles);
      showToast('Ciclo iniciado', 'success');
    } catch (err) {
      handleApiError(err, 'Error al iniciar ciclo');
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
              {formatMoneyExact(total)}
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
                      {(item.every_n_cycles ?? 1) > 1 && (
                        <span className="recurring-card__pill" style={{ background: 'var(--gl)', color: 'var(--green)' }}>
                          cada {item.every_n_cycles} ciclos
                        </span>
                      )}
                      {item.paused ? (
                        <span className="recurring-card__pill recurring-card__pill--paused">
                          pausado
                        </span>
                      ) : null}
                    </div>
                    <span className="recurring-card__amount">
                      {formatMoneyExact(item.amount)}
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

        {/* Footer — matches add-cat-row pattern from budget cards */}
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="add-cat-row" style={{ flex: 1 }} onClick={openAddModal}>
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
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>{editItem ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</h3>
            <p>{editItem ? 'Modifica los datos del gasto recurrente' : 'Añade un gasto que se repite cada mes'}</p>

            {/* Name + Emoji */}
            <div className="form-row">
              <label>Nombre</label>
              <input className="form-input" type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ej: Alquiler, Netflix..." style={{ flex: 1 }} />
              <EmojiPicker value={formEmoji} onChange={setFormEmoji} />
            </div>

            {/* Amount */}
            <div className="form-row">
              <label>Importe</label>
              <span style={{ color: 'var(--tm)' }}>€</span>
              <input className="form-input" type="number" inputMode="decimal" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="900" min="0" step="0.01" style={{ width: 120, textAlign: 'right' }} />
            </div>

            {/* Type */}
            <div className="form-row">
              <label>Tipo</label>
              <div style={{ display: 'flex', gap: 8, flex: 1 }}>
                <div
                  className="type-sel"
                  onClick={() => setFormType('shared')}
                  style={formType === 'shared'
                    ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                    : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }}
                >
                  Compartido
                </div>
                <div
                  className="type-sel"
                  onClick={() => setFormType('personal')}
                  style={formType === 'personal'
                    ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                    : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }}
                >
                  Personal
                </div>
              </div>
            </div>

            {/* Category — smart cmd-palette */}
            <div className="form-row" style={{ marginBottom: 14, position: 'relative' }} ref={cmdRef}>
              <label>Categoría</label>
              <div className="cmd-palette" style={{ flex: 1, marginBottom: 0 }}>
                <div className="cmd-input-wrap">
                  <TagIcon />
                  {formCategory && (() => {
                    const catDef = getCategoryDef(formCategory);
                    return (
                      <span className="cmd-selected">
                        <div className="cmd-icon" style={{ background: catDef?.iconBg ?? 'var(--gl)', width: 20, height: 20 }}>
                          <span style={{ fontSize: 12 }}>{catDef?.emoji ?? '📂'}</span>
                        </div>
                        {formCategory}
                        <span className="cmd-x" onClick={(e) => { e.stopPropagation(); setFormCategory(''); }}>&times;</span>
                      </span>
                    );
                  })()}
                  <input
                    className="cmd-input"
                    placeholder="Buscar categoría..."
                    value={categorySearch}
                    onFocus={() => setCmdOpen(true)}
                    onChange={(e) => { setCategorySearch(e.target.value); setCmdOpen(true); }}
                  />
                </div>
                <div className={`cmd-dropdown${cmdOpen ? ' open' : ''}`}>
                  <div className="cmd-list">
                    {filteredCategories.map((item, idx) => (
                      <div
                        key={`${item.id ?? ''}-${item.name}-${idx}`}
                        className={`cmd-option${formCategory === item.name ? ' selected' : ''}`}
                        onClick={() => { setFormCategory(item.name); setCategorySearch(''); setCmdOpen(false); }}
                      >
                        <div className="cmd-icon" style={{ background: item.iconBg ?? 'var(--gl)' }}>
                          <span style={{ fontSize: 14 }}>{item.emoji ?? '📂'}</span>
                        </div>
                        {item.name}
                      </div>
                    ))}
                    {categorySearch.trim() && !filteredCategories.some(c => c.name.toLowerCase() === categorySearch.toLowerCase()) && (
                      <div className="cmd-create" onClick={() => { setFormCategory(categorySearch.trim()); setCategorySearch(''); setCmdOpen(false); }}>
                        + Crear &ldquo;{categorySearch.trim()}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="form-row">
              <label>Notas</label>
              <input className="form-input" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Opcional..." style={{ flex: 1 }} />
            </div>

            {/* Cycle frequency — stepper buttons */}
            <div className="form-row">
              <label>Se repite cada</label>
              <div className="cycle-stepper">
                <button
                  type="button"
                  className="cycle-stepper__btn"
                  onClick={() => setEveryNCycles(v => Math.max(1, v - 1))}
                  disabled={everyNCycles <= 1}
                >
                  −
                </button>
                <span className="cycle-stepper__value">{everyNCycles}</span>
                <button
                  type="button"
                  className="cycle-stepper__btn"
                  onClick={() => setEveryNCycles(v => Math.min(24, v + 1))}
                >
                  +
                </button>
                <span className="cycle-stepper__label">
                  {everyNCycles === 1 ? 'ciclo (siempre)' : 'ciclos'}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-actions">
              {editItem && (
                <button className="btn btn-outline" onClick={handleTogglePause} disabled={saving}>
                  {editItem.paused ? 'Activar' : 'Pausar'}
                </button>
              )}
              {editItem && (
                <button className="btn btn-outline" onClick={handleDelete} disabled={saving} style={{ color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)', marginRight: 'auto' }}>
                  Eliminar
                </button>
              )}
              <button className="btn btn-outline" onClick={closeModal}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formName.trim() || !formAmount || parseFloat(formAmount) <= 0}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
