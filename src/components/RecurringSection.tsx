import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Api } from '../api';
import { showToast } from './Toast';
import { EmojiPicker } from './EmojiPicker';
import { useCategoryManagement } from '../hooks/useCategoryManagement';

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

const TagIcon = () => (
  <svg width="16" height="16" fill="none" stroke="var(--tm)" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

export const RecurringSection: React.FC<RecurringSectionProps> = ({ userId, onCycleApproved }) => {
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<RecurringItem | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state for edit/add modal
  const [formName, setFormName] = useState('');
  const [formEmoji, setFormEmoji] = useState('🔁');
  const [formAmount, setFormAmount] = useState('0');
  const [formCategory, setFormCategory] = useState('');
  const [formType, setFormType] = useState<'shared' | 'personal'>('shared');
  const [formNotes, setFormNotes] = useState('');
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
    setCategorySearch('');
    setCmdOpen(false);
    setShowAddModal(false);
  };

  const openAddModal = () => {
    setEditItem(null);
    setFormName('');
    setFormEmoji('🔁');
    setFormAmount('0');
    setFormCategory('');
    setFormType('shared');
    setFormNotes('');
    setCategorySearch('');
    setCmdOpen(false);
    setShowAddModal(true);
  };

  const closeModal = () => {
    setEditItem(null);
    setShowAddModal(false);
    setCmdOpen(false);
  };

  // Numpad-style amount handler (matches AddExpense)
  const handleAmountKey = (key: string) => {
    if (key === 'del') {
      setFormAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
    } else if (key === '.') {
      if (!formAmount.includes('.')) setFormAmount((prev) => prev + '.');
    } else {
      setFormAmount((prev) => (prev === '0' ? key : prev + key));
    }
  };

  const handleSave = async () => {
    if (!formName.trim() || parseFloat(formAmount) <= 0) return;
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
  const numpadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

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

            {/* Amount — hero display like AddExpense */}
            <div style={{ textAlign: 'center', padding: '24px 0 20px' }}>
              <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--tm)', verticalAlign: 'super' }}>
                &euro;
              </span>
              <span style={{
                fontSize: 48,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: formAmount === '0' ? 'var(--tm)' : 'var(--text)',
                transition: 'color .2s',
              }}>
                {formAmount}
              </span>
            </div>

            {/* Numpad */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 6,
              marginBottom: 24,
            }}>
              {numpadKeys.map(key => (
                <button
                  key={key}
                  type="button"
                  className="numpad-key"
                  onClick={() => handleAmountKey(key)}
                >
                  {key === 'del' ? '⌫' : key}
                </button>
              ))}
            </div>

            {/* Name + Emoji inline */}
            <div style={{ marginBottom: 16 }}>
              <div className="label">Nombre</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--rs)',
                    fontSize: 15,
                    fontFamily: 'inherit',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    transition: 'all .2s',
                    outline: 'none',
                  }}
                  placeholder="Ej: Alquiler, Netflix..."
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--green)';
                    e.currentTarget.style.boxShadow = '0 0 16px rgba(52,211,153,.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--glass-border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <EmojiPicker value={formEmoji} onChange={setFormEmoji} />
              </div>
            </div>

            {/* Type selector — matches AddExpense type-sel */}
            <div style={{ marginBottom: 16 }}>
              <div className="label">Tipo de gasto</div>
              <div style={{ display: 'flex', gap: 8 }}>
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

            {/* Category — smart cmd-palette like AddExpense */}
            <div className="cmd-palette" ref={cmdRef} style={{ marginBottom: 16 }}>
              <div className="label">Categoría</div>
              <div className="cmd-input-wrap">
                <TagIcon />
                {formCategory && (() => {
                  const catDef = getCategoryDef(formCategory);
                  return (
                    <span className="cmd-selected">
                      <div className="cmd-icon" style={{
                        background: catDef?.iconBg ?? 'var(--gl)',
                        width: 20,
                        height: 20,
                      }}>
                        <span style={{ fontSize: 12 }}>{catDef?.emoji ?? '📂'}</span>
                      </div>
                      {formCategory}
                      <span
                        className="cmd-x"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormCategory('');
                        }}
                      >
                        &times;
                      </span>
                    </span>
                  );
                })()}
                <input
                  className="cmd-input"
                  placeholder="Buscar categoría..."
                  value={categorySearch}
                  onFocus={() => setCmdOpen(true)}
                  onChange={(e) => {
                    setCategorySearch(e.target.value);
                    setCmdOpen(true);
                  }}
                />
              </div>
              <div className={`cmd-dropdown ${cmdOpen ? 'open' : ''}`}>
                <div className="cmd-list">
                  {filteredCategories.map((item) => (
                    <div
                      key={item.id ?? item.name}
                      className={`cmd-option ${formCategory === item.name ? 'selected' : ''}`}
                      onClick={() => {
                        setFormCategory(item.name);
                        setCategorySearch('');
                        setCmdOpen(false);
                      }}
                    >
                      <div className="cmd-icon" style={{ background: item.iconBg ?? 'var(--gl)' }}>
                        <span style={{ fontSize: 14 }}>{item.emoji ?? '📂'}</span>
                      </div>
                      {item.name}
                    </div>
                  ))}
                  {categorySearch.trim() && !filteredCategories.some(c => c.name.toLowerCase() === categorySearch.toLowerCase()) && (
                    <div
                      className="cmd-create"
                      onClick={() => {
                        setFormCategory(categorySearch.trim());
                        setCategorySearch('');
                        setCmdOpen(false);
                      }}
                    >
                      + Crear "{categorySearch.trim()}"
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <div className="label">Notas</div>
              <input
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--rs)',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  transition: 'all .2s',
                  outline: 'none',
                }}
                placeholder="Opcional..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--green)';
                  e.currentTarget.style.boxShadow = '0 0 16px rgba(52,211,153,.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--glass-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {/* Footer */}
            <div className="modal-actions">
              {editItem && (
                <button
                  className="btn btn-outline"
                  onClick={handleTogglePause}
                  disabled={saving}
                >
                  {editItem.paused ? 'Activar' : 'Pausar'}
                </button>
              )}
              {editItem && (
                <button
                  className="btn btn-outline"
                  onClick={handleDelete}
                  disabled={saving}
                  style={{ color: 'var(--red)', borderColor: 'rgba(248,113,113,0.3)', marginRight: 'auto' }}
                >
                  Eliminar
                </button>
              )}
              <button className="btn btn-outline" onClick={closeModal}>
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saving || !formName.trim() || parseFloat(formAmount) <= 0}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
