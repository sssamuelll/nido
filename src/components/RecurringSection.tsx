import React, { useState, useEffect, useCallback } from 'react';
import { Api } from '../api';
import { Portal, Seg, Btn, FilterChip, CatIcon, Icon, CONTEXT_SEG_OPTIONS } from './nido';
import { showToast } from './Toast';
import { EmojiPicker } from './EmojiPicker';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import type { CategoryDef } from '../hooks/useCategoryManagement';
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
  /**
   * Current billing cycle, when the parent already loads it (Dashboard does).
   * Passing it avoids a duplicate GET /cycles/current and a redundant `cycles`
   * subscription — the parent owns refresh and feeds the fresh value down.
   * Omit it for standalone use and the component fetches its own.
   */
  cycle?: CycleDetail | null;
}

export const RecurringSection: React.FC<RecurringSectionProps> = ({ userId, onCycleApproved, cycle: cycleProp }) => {
  // `undefined` means the parent didn't pass a cycle (fetch our own);
  // `null` or a value means it owns the cycle and we mustn't fetch it.
  const cycleProvided = cycleProp !== undefined;
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [internalCycle, setInternalCycle] = useState<CycleDetail | null>(null);
  const cycle: CycleDetail | null = cycleProvided ? (cycleProp ?? null) : internalCycle;
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

  // Category picker (chips + search/create — mirrors the Nuevo gasto modal)
  const { categories } = useCategoryManagement(formType);
  const [categorySearch, setCategorySearch] = useState('');
  const [catExpanded, setCatExpanded] = useState(false);

  const loadData = useCallback(async () => {
    if (cycleProvided) {
      // Parent owns the cycle; only the recurring list is ours to fetch.
      const recurring = await Api.getRecurring();
      setItems(Array.isArray(recurring) ? recurring : []);
      return;
    }
    const [recurring, currentCycle] = await Promise.all([
      Api.getRecurring(),
      Api.getCurrentCycle().catch((err) => {
        // Cat 3-auto: cycle fetch es soporte del listado de recurrentes;
        // null se acepta y los lectores aguas abajo usan cycle?.* (UI tolerante).
        handleApiError(err, 'Error al cargar ciclo activo', { silent: true });
        return null;
      }),
    ]);
    setItems(Array.isArray(recurring) ? recurring : []);
    setInternalCycle(currentCycle);
  }, [cycleProvided]);

  const { loading } = useAsyncEffect(loadData, {
    fallbackMessage: 'Error al cargar recurrentes',
    // When the parent owns the cycle we only watch `recurring`; otherwise we
    // also refetch our own cycle on `cycles` invalidations.
    invalidationKeys: cycleProvided ? [CACHE_KEYS.recurring] : [CACHE_KEYS.recurring, CACHE_KEYS.cycles],
  });

  const closeModal = useCallback(() => {
    setEditItem(null);
    setShowAddModal(false);
    setCatExpanded(false);
    setCategorySearch('');
  }, []);

  // Modal chrome parity with the Nuevo gasto modal: lock background scroll and
  // close on Escape while the add/edit modal is open.
  const modalOpen = editItem !== null || showAddModal;
  useEffect(() => {
    if (!modalOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') closeModal(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [modalOpen, closeModal]);

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
    setCatExpanded(false);
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
    setCatExpanded(false);
    setShowAddModal(true);
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

  /* ── category picker (chips + search/create), mirrored from AddExpense ── */
  const trimmedCatSearch = categorySearch.trim();
  const filteredCats = categories.filter((c) => c.name.toLowerCase().includes(trimmedCatSearch.toLowerCase()));
  const customSelected = formCategory !== '' && !categories.some((c) => c.name === formCategory);
  const canCreateCat = trimmedCatSearch !== '' && !categories.some((c) => c.name.toLowerCase() === trimmedCatSearch.toLowerCase());

  const categoryChip = (c: CategoryDef, onPick: () => void) => (
    <FilterChip key={c.name} on={formCategory === c.name} hasIcon onClick={onPick}>
      <CatIcon color={c.color} bg={c.color ? `${c.color}1A` : undefined} size={24} radius={7}>
        <span style={{ fontSize: 14 }}>{c.emoji}</span>
      </CatIcon>
      {c.name}
    </FilterChip>
  );

  const customChip = customSelected ? (
    <FilterChip on hasIcon onClick={() => {}}>
      <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.tag /></span>
      {formCategory}
    </FilterChip>
  ) : null;

  const categoryPicker = (
    <div>
      <input
        value={categorySearch}
        onChange={(e) => setCategorySearch(e.target.value)}
        placeholder="Buscar o crear categoría…"
        style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 14, outline: 'none', marginBottom: 10 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        {customChip}
        {filteredCats.map((c: CategoryDef) => categoryChip(c, () => { setFormCategory(c.name); setCategorySearch(''); }))}
        {canCreateCat && trimmedCatSearch.toLowerCase() !== formCategory.toLowerCase() ? (
          <FilterChip hasIcon onClick={() => { setFormCategory(trimmedCatSearch); setCategorySearch(''); }} style={{ borderStyle: 'dashed' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.plusS /></span>
            Crear «{trimmedCatSearch}»
          </FilterChip>
        ) : null}
        {categories.length === 0 && !trimmedCatSearch ? (
          <span style={{ fontSize: 13, color: 'var(--ink-3)', padding: '7px 4px' }}>Escribe el nombre de una categoría para crearla.</span>
        ) : null}
      </div>
    </div>
  );

  // Compact chip row (first 6 + "Más") that reveals the full search-or-create picker.
  const modalCategory = catExpanded ? categoryPicker : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
      {customChip}
      {categories.slice(0, 6).map((c: CategoryDef) => categoryChip(c, () => setFormCategory(c.name)))}
      <FilterChip hasIcon onClick={() => setCatExpanded(true)} style={{ borderStyle: 'dashed' }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 22, height: 22 }}><Icon.plusS /></span>
        Más
      </FilterChip>
    </div>
  );

  if (loading) {
    return (
      <div className="card an d4 recurring-card">
        <div className="skeleton skeleton--card-sm" />
      </div>
    );
  }

  const saveDisabled = saving || !formName.trim() || !formAmount || parseFloat(formAmount) <= 0;

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
                        <span className="recurring-card__pill" style={{ background: 'var(--pine-tint)', color: 'var(--pine-2)' }}>
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
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 8 }}>
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

      {/* Edit / Add modal — paper style, mirrored from the Nuevo gasto modal.
          Portaled to <body> so it escapes the .nido cascade of this card. */}
      {modalOpen && (
        <Portal>
          <div
            onClick={closeModal}
            style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(43,38,32,.42)', backdropFilter: 'blur(3px)' }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={editItem ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                borderRadius: 26,
                width: '100%',
                maxWidth: 520,
                maxHeight: 'calc(100vh - 40px)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 30px 70px rgba(43,38,32,.30)',
                animation: 'nido-pop .18s cubic-bezier(.2,.9,.3,1.2)',
              }}
            >
              {/* header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 26px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ display: 'flex', color: 'var(--clay)' }}><Icon.repeat /></span>
                  <h2 className="serif" style={{ fontSize: 24, lineHeight: 1 }}>{editItem ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</h2>
                </div>
                <button
                  type="button"
                  aria-label="Cerrar"
                  onClick={closeModal}
                  style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 999, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)', cursor: 'pointer' }}
                >
                  <Icon.x />
                </button>
              </div>

              {/* body */}
              <div style={{ minHeight: 0, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Nombre</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ej: Alquiler, Netflix…"
                      style={{ flex: 1, minWidth: 0, padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
                    />
                    <EmojiPicker value={formEmoji} onChange={setFormEmoji} />
                  </div>
                </div>

                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Importe</label>
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
                    <span style={{ padding: '14px 15px', color: 'var(--ink-3)', borderRight: '1px solid var(--line)' }}>€</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      placeholder="900"
                      style={{ flex: 1, minWidth: 0, padding: '14px 16px', fontSize: 15, fontWeight: 600, border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', width: '100%' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Tipo</label>
                  <Seg value={formType} options={CONTEXT_SEG_OPTIONS} onChange={setFormType} full />
                </div>

                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Categoría</label>
                  {modalCategory}
                </div>

                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 8 }}>Notas</label>
                  <input
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Opcional…"
                    style={{ width: '100%', padding: '14px 16px', border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 15, fontFamily: 'inherit', outline: 'none' }}
                  />
                </div>

                <div>
                  <label className="eyebrow" style={{ display: 'block', marginBottom: 10 }}>Se repite cada</label>
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
              </div>

              {/* footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 26px', borderTop: '1px solid var(--line)' }}>
                <div>
                  {editItem ? (
                    <Btn variant="ghost" onClick={handleDelete} disabled={saving} style={{ borderColor: 'var(--berry)', color: 'var(--berry)', background: 'transparent' }}>
                      Eliminar
                    </Btn>
                  ) : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {editItem ? (
                    <Btn variant="ghost" onClick={handleTogglePause} disabled={saving}>
                      {editItem.paused ? 'Activar' : 'Pausar'}
                    </Btn>
                  ) : null}
                  <Btn variant="primary" onClick={handleSave} disabled={saveDisabled}>
                    <Icon.check /> {saving ? 'Guardando…' : 'Guardar'}
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
};
