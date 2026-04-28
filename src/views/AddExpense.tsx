import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Api } from '../api';
import { format } from 'date-fns';
import { useAuth } from '../auth';
import { showToast } from '../components/Toast';
import { EmojiPicker } from '../components/EmojiPicker';
import { useCategoryManagement } from '../hooks/useCategoryManagement';
import { resolveCycleForDate } from '../lib/resolveCycleForDate';
import { handleApiError } from '../lib/handleApiError';
import type { CycleInfo } from '../api-types/cycles';
import { formatDateLabel } from '../lib/dates';
import { formatMoneyExact } from '../lib/money';
import { handleApiError } from '../lib/handleApiError';

const ChevronLeftIcon = () => (
  <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M15 19l-7-7 7-7" />
  </svg>
);

const TagIcon = () => (
  <svg width="16" height="16" fill="none" stroke="var(--tm)" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path d="M12 4v16m-8-8h16" />
  </svg>
);

const COLOR_OPTIONS = ['#F87171', '#60A5FA', '#FBBF24', '#A78BFA', '#34D399'];

export const AddExpense: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [expenseDate, setExpenseDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const isToday = expenseDate === format(new Date(), 'yyyy-MM-dd');

  const [cycles, setCycles] = useState<CycleInfo[]>([]);
  const [targetCycleId, setTargetCycleId] = useState<number | null>(null);
  const activeCycle = cycles.find(c => c.status === 'active');
  const cycleResolution = useMemo(
    () => resolveCycleForDate(expenseDate, cycles),
    [expenseDate, cycles]
  );
  useEffect(() => {
    Api.listCycles()
      .then(d => setCycles(Array.isArray(d) ? d : []))
      .catch((err) => {
        handleApiError(err, 'Error al cargar ciclos', { silent: true });
        setCycles([]);
      });
  }, []);
  useEffect(() => {
    if (cycleResolution.kind === 'in-active') {
      setTargetCycleId(null);
    } else if (cycleResolution.kind === 'in-closed') {
      setTargetCycleId(cycleResolution.cycle.id);
    } else {
      setTargetCycleId(activeCycle?.id ?? null);
    }
  }, [cycleResolution.kind, cycleResolution.kind === 'in-closed' ? cycleResolution.cycle.id : null, activeCycle?.id]);

  const { categories, getCategoryDef } = useCategoryManagement(type);
  const [categorySearch, setCategorySearch] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatEmoji, setNewCatEmoji] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLOR_OPTIONS[0]);
  const [savingCat, setSavingCat] = useState(false);
  const [repeatCount, setRepeatCount] = useState(1);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const cmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (categories.length === 0) {
      setCategory('');
      return;
    }

    setCategory((current) => {
      const existsInCurrentContext = categories.some((item) => item.name === current);
      return existsInCurrentContext ? current : categories[0].name;
    });
  }, [categories, type]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cmdRef.current && !cmdRef.current.contains(e.target as Node)) {
        setCmdOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        // Shared expense → only shared events.
        // Personal expense → user can also tag own expenses (e.g. a souvenir during a shared trip)
        // to a shared event, so include both shared and own personal events.
        const lists = type === 'shared'
          ? [await Api.getEvents('shared')]
          : await Promise.all([Api.getEvents('shared'), Api.getEvents('personal')]);
        const merged = lists.flat();
        const activeEvents = merged.filter((ev: any) => new Date(ev.end_date) >= new Date());
        setEvents(activeEvents);
      } catch {
        setEvents([]);
      }
    };
    loadEvents();
  }, [type]);

  useEffect(() => {
    const incomingState = location.state as any;
    if (incomingState?.eventId) {
      setSelectedEventId(incomingState.eventId);
    }
  }, []);

  const OPS = ['+', '-', '×', '÷'] as const;
  const isOp = (ch: string) => OPS.includes(ch as any);
  const lastChar = amount[amount.length - 1];

  // Safe expression evaluator (no eval) — supports +, -, ×, ÷
  const evaluateExpr = (expr: string): number => {
    const sanitized = expr.replace(/×/g, '*').replace(/÷/g, '/');
    // Tokenize into numbers and operators
    const tokens = sanitized.match(/(\d+\.?\d*|[+\-*/])/g);
    if (!tokens) return 0;

    // First pass: multiply and divide
    const stack: (number | string)[] = [];
    for (const t of tokens) {
      if (t === '*' || t === '/') {
        stack.push(t);
      } else if (!isNaN(Number(t))) {
        const prev = stack[stack.length - 1];
        if (prev === '*' || prev === '/') {
          const op = stack.pop() as string;
          const left = stack.pop() as number;
          stack.push(op === '*' ? left * Number(t) : left / Number(t));
        } else {
          stack.push(Number(t));
        }
      } else {
        stack.push(t);
      }
    }

    // Second pass: add and subtract
    let result = stack[0] as number;
    for (let i = 1; i < stack.length; i += 2) {
      const op = stack[i] as string;
      const val = stack[i + 1] as number;
      if (op === '+') result += val;
      else if (op === '-') result -= val;
    }
    return isNaN(result) || !isFinite(result) ? 0 : result;
  };

  const hasOperator = OPS.some(op => amount.includes(op));
  const computedResult = hasOperator ? evaluateExpr(amount) : null;

  // Physical keyboard support (desktop only)
  useEffect(() => {
    if (window.innerWidth < 768) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === '.' || e.key === ',') handleKey('.');
      else if (e.key === '+') handleKey('+');
      else if (e.key === '-') handleKey('-');
      else if (e.key === '*') handleKey('×');
      else if (e.key === '/') { e.preventDefault(); handleKey('÷'); }
      else if (e.key === 'Backspace') handleKey('del');
      else if (e.key === '=' || e.key === 'Enter') {
        if (hasOperator) handleKey('=');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [amount, hasOperator]);

  const handleKey = (key: string) => {
    if (key === 'del') {
      setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (key === '=') {
      // Resolve expression to result
      if (hasOperator) {
        const result = evaluateExpr(amount);
        setAmount(result > 0 ? String(parseFloat(result.toFixed(2))) : '0');
      }
    } else if (isOp(key)) {
      // Don't allow operator as first char or double operators
      if (amount === '0' && key !== '-') return;
      if (isOp(lastChar)) {
        setAmount(prev => prev.slice(0, -1) + key);
      } else {
        setAmount(prev => prev + key);
      }
    } else if (key === '.') {
      // Only one dot per number segment (split by operators)
      const segments = amount.split(/[+\-×÷]/);
      const currentSegment = segments[segments.length - 1];
      if (!currentSegment.includes('.')) setAmount(prev => prev + '.');
    } else {
      setAmount(prev => prev === '0' ? key : prev + key);
    }
  };

  const filteredCategories = categories.filter((item) =>
    item.name.toLowerCase().includes(categorySearch.toLowerCase()) || categorySearch === ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Evaluate expression if it contains operators
    const finalAmount = hasOperator ? evaluateExpr(amount) : parseFloat(amount);
    if (finalAmount <= 0 || isNaN(finalAmount)) return setError('Ingresa un monto valido');
    if (!description) return setError('Ingresa una descripcion');
    if (!category.trim()) return setError('Selecciona una categoría');

    try {
      setLoading(true);
      setError('');
      const expenseData = {
        description,
        amount: parseFloat(finalAmount.toFixed(2)),
        category,
        category_id: categories.find(c => c.name === category)?.id,
        date: expenseDate,
        type,
        event_id: selectedEventId || undefined,
        cycle_id: targetCycleId,
      };
      for (let i = 0; i < repeatCount; i++) {
        await Api.createExpense(expenseData);
      }

      const isNewCategory = !categories.some(
        (c) => c.name.toLowerCase() === category.trim().toLowerCase()
      );

      const msg = repeatCount > 1 ? `${repeatCount} gastos añadidos ✔` : 'Gasto añadido ✔';
      if (isNewCategory) {
        showToast(msg, 'success');
        setShowNewCatModal(true);
      } else {
        setSuccess(true);
        showToast(msg, 'success');
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      console.error('Failed to save expense:', err);
      setError('Error al guardar el gasto');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="u-vh-center">
        <div className="u-text-center">
          <div className="add-expense__success-icon">&#10003;</div>
          <div className="settings__title">Gasto guardado!</div>
          <div className="settings__subtitle">Redirigiendo...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-expense">
      <div className="add-expense__back-link" onClick={() => navigate(-1)}>
        <ChevronLeftIcon />
        Volver
      </div>

      <div className="topbar an d1">
        <div><h1>Nuevo Gasto</h1></div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <div className="an d2" style={{ textAlign: 'center', padding: '32px 0 16px' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--tm)', verticalAlign: 'super' }}>
              &euro;
            </span>
            <span style={{
              fontSize: hasOperator ? 32 : 56,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: amount === '0' ? 'var(--tm)' : 'var(--text)',
              transition: 'all .2s',
              wordBreak: 'break-all',
            }}>
              {amount}
            </span>
            {computedResult !== null && (
              <div style={{
                fontSize: 14, color: 'var(--green)', marginTop: 6,
                fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                transition: 'opacity .15s', opacity: 0.9,
              }}>
                = {formatMoneyExact(computedResult)}
              </div>
            )}
          </div>

          <div className="an d3" style={{ marginBottom: 24 }}>
            <div className="label">Descripcion</div>
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
              placeholder="En que gastaste?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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

          {/* Optional date — progressive disclosure */}
          <div className="an d3" style={{ marginBottom: 16 }}>
            {!showDatePicker ? (
              <button
                type="button"
                className="expense-date-toggle"
                onClick={() => setShowDatePicker(true)}
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {isToday ? 'Hoy' : formatDateLabel(expenseDate)}
                {!isToday && <span className="expense-date-dot" />}
              </button>
            ) : (
              <div className="expense-date-picker">
                <div className="label">Fecha del gasto</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="date"
                    className="expense-date-input"
                    value={expenseDate}
                    onChange={e => setExpenseDate(e.target.value)}
                    max={format(new Date(), 'yyyy-MM-dd')}
                  />
                  {!isToday && (
                    <button
                      type="button"
                      className="expense-date-today"
                      onClick={() => { setExpenseDate(format(new Date(), 'yyyy-MM-dd')); setShowDatePicker(false); }}
                    >
                      Hoy
                    </button>
                  )}
                  <button
                    type="button"
                    className="expense-date-close"
                    onClick={() => setShowDatePicker(false)}
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {cycleResolution.kind !== 'in-active' && activeCycle && (
                  <div className="cycle-attribution">
                    <div className="cycle-attribution__hint">
                      {cycleResolution.kind === 'in-closed'
                        ? 'Esta fecha cae fuera del ciclo actual'
                        : 'No hay ciclo registrado en esa fecha'}
                    </div>
                    <div className="cycle-attribution__toggle">
                      <button
                        type="button"
                        className={`type-sel ${targetCycleId !== activeCycle.id ? 'type-sel--active' : ''}`}
                        disabled={cycleResolution.kind === 'no-cycle'}
                        onClick={() => {
                          if (cycleResolution.kind === 'in-closed') {
                            setTargetCycleId(cycleResolution.cycle.id);
                          }
                        }}
                      >
                        {cycleResolution.kind === 'in-closed'
                          ? `Ciclo ${cycleResolution.cycle.month ?? cycleResolution.cycle.start_date}`
                          : 'Ciclo de esa fecha (sin datos)'}
                      </button>
                      <button
                        type="button"
                        className={`type-sel ${targetCycleId === activeCycle.id ? 'type-sel--active' : ''}`}
                        onClick={() => setTargetCycleId(activeCycle.id)}
                      >
                        Ciclo actual
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="an d4" style={{ marginBottom: 24 }}>
            <div className="label">Tipo de gasto</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                className="type-sel"
                onClick={() => setType('shared')}
                style={type === 'shared'
                  ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                  : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }}
              >
                Compartido
              </div>
              <div
                className="type-sel"
                onClick={() => setType('personal')}
                style={type === 'personal'
                  ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                  : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }}
              >
                Personal
              </div>
            </div>
          </div>

          <div className="an d3 cmd-palette" ref={cmdRef}>
            <div className="label">Categoria</div>
            <div className="cmd-input-wrap">
              <TagIcon />
              {category && (() => {
                const catDef = getCategoryDef(category);
                return (
                  <span className="cmd-selected">
                    <div className="cmd-icon" style={{
                      background: catDef?.iconBg ?? 'var(--gl)',
                      width: 20,
                      height: 20,
                    }}>
                      <span style={{ fontSize: 12 }}>{catDef?.emoji ?? '📂'}</span>
                    </div>
                    {category}
                    <span
                      className="cmd-x"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCategory('');
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
                    className={`cmd-option ${category === item.name ? 'selected' : ''}`}
                    onClick={() => {
                      setCategory(item.name);
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
              </div>
              {categorySearch.trim() && !categories.some((item) => item.name.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                <div
                  className="cmd-create"
                  onClick={() => {
                    const nextCategory = categorySearch.trim();
                    setCategory(nextCategory);
                    setCategorySearch('');
                    setCmdOpen(false);
                    showToast(`Usaremos “${nextCategory}” en este gasto. Si quieres, luego la registramos como categoría nueva.`);
                  }}
                >
                  <PlusIcon /> Usar &ldquo;{categorySearch.trim()}&rdquo; en este gasto
                </div>
              )}
            </div>
          </div>

          {events.length > 0 && (
            <div className="an d4" style={{ marginBottom: 16 }}>
              <div className="label">Evento (opcional)</div>
              <div className="ev-select-wrap">
                <select
                  className="ev-select"
                  value={selectedEventId ?? ''}
                  onChange={e => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Sin evento</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.emoji} {ev.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="an d5">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              maxWidth: 340,
              margin: '0 auto',
            }}>
              {/* Row 1 */}
              <button type="button" className="num-btn" onClick={() => handleKey('1')}>1</button>
              <button type="button" className="num-btn" onClick={() => handleKey('2')}>2</button>
              <button type="button" className="num-btn" onClick={() => handleKey('3')}>3</button>
              <button type="button" className="num-btn action" onClick={() => handleKey('÷')}>÷</button>
              {/* Row 2 */}
              <button type="button" className="num-btn" onClick={() => handleKey('4')}>4</button>
              <button type="button" className="num-btn" onClick={() => handleKey('5')}>5</button>
              <button type="button" className="num-btn" onClick={() => handleKey('6')}>6</button>
              <button type="button" className="num-btn action" onClick={() => handleKey('×')}>×</button>
              {/* Row 3 */}
              <button type="button" className="num-btn" onClick={() => handleKey('7')}>7</button>
              <button type="button" className="num-btn" onClick={() => handleKey('8')}>8</button>
              <button type="button" className="num-btn" onClick={() => handleKey('9')}>9</button>
              <button type="button" className="num-btn action" onClick={() => handleKey('-')}>−</button>
              {/* Row 4 */}
              <button type="button" className="num-btn action" onClick={() => handleKey('.')}>.</button>
              <button type="button" className="num-btn" onClick={() => handleKey('0')}>0</button>
              <button type="button" className="num-btn action" onClick={() => handleKey('del')}>←</button>
              <button type="button" className="num-btn action" onClick={() => handleKey('+')}>+</button>
            </div>
            {hasOperator && (
              <button
                type="button"
                className="btn btn-outline"
                style={{ maxWidth: 340, width: '100%', margin: '8px auto 0', display: 'block', padding: '10px 0', fontSize: 15, fontWeight: 600 }}
                onClick={() => handleKey('=')}
              >
                = Calcular
              </button>
            )}

            {/* Repeat toggle */}
            <div style={{ maxWidth: 340, margin: '12px auto 0', display: 'flex', justifyContent: 'center' }}>
              {repeatCount <= 1 ? (
                <button
                  type="button"
                  className="expense-date-toggle"
                  onClick={() => setRepeatCount(2)}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 014-4h14" />
                    <path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                  </svg>
                  Repetir gasto
                </button>
              ) : (
                <div className="expense-repeat-stepper">
                  <button
                    type="button"
                    className="expense-repeat-btn"
                    onClick={() => setRepeatCount(c => Math.max(1, c - 1))}
                  >
                    −
                  </button>
                  <span className="expense-repeat-value">
                    ×{repeatCount}
                  </span>
                  <button
                    type="button"
                    className="expense-repeat-btn"
                    onClick={() => setRepeatCount(c => Math.min(20, c + 1))}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    className="expense-repeat-cancel"
                    onClick={() => setRepeatCount(1)}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {error && <div className="add-expense__error-msg">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                maxWidth: 340,
                margin: '16px auto 0',
                display: 'block',
                padding: 16,
                fontSize: 16,
              }}
              disabled={loading}
            >
              {loading ? 'Guardando...' : repeatCount > 1 ? `Añadir ${repeatCount} gastos` : 'Añadir Gasto'}
            </button>
          </div>
        </form>
      </div>

      {showNewCatModal && (
        <div className="modal-overlay open" onClick={() => { setShowNewCatModal(false); navigate('/'); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Registrar &ldquo;{category}&rdquo; como categoría</h3>
            <p>El gasto ya se guardó. ¿Quieres registrar esta categoría para futuros gastos?</p>

            <div className="form-row">
              <label>Emoji</label>
              <EmojiPicker value={newCatEmoji} onChange={setNewCatEmoji} />
            </div>

            <div className="form-row">
              <label>Color</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {COLOR_OPTIONS.map((c) => (
                  <div key={c} onClick={() => setNewCatColor(c)} style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: `3px solid ${newCatColor === c ? 'var(--text)' : 'transparent'}`,
                  }} />
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => { setShowNewCatModal(false); navigate('/'); }}>
                Omitir
              </button>
              <button
                className="btn btn-primary"
                disabled={savingCat}
                onClick={async () => {
                  const emoji = newCatEmoji.trim() || '📂';
                  try {
                    setSavingCat(true);
                    await Api.saveCategory({ name: category.trim(), emoji, color: newCatColor, context: type });
                    showToast('Categoría registrada ✔', 'success');
                    navigate('/');
                  } catch (err) {
                    handleApiError(err, 'Error al guardar la categoría');
                  } finally {
                    setSavingCat(false);
                  }
                }}
              >
                {savingCat ? 'Guardando...' : 'Guardar categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
