import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { format } from 'date-fns';
import { useAuth } from '../auth';
import { CATEGORIES } from '../types';
import { Utensils, ShoppingCart, Zap, Smile, TrendingUp, MoreHorizontal } from 'lucide-react';

/* SVG icons matching design reference */
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

/* Lucide icon map per category */
const CATEGORY_ICONS: Record<string, React.FC<any>> = {
  Restaurant: Utensils,
  Supermercado: ShoppingCart,
  Servicios: Zap,
  Ocio: Smile,
  'Inversión': TrendingUp,
  Otros: MoreHorizontal,
};


export const AddExpense: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState('Restaurant');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const cmdRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Api.getCategories()
      .then(setCategories)
      .catch(() => {
        /* fallback to CATEGORIES from types */
        setCategories(CATEGORIES.map(c => ({ id: c.id, name: c.name, emoji: c.emoji })));
      });
  }, []);

  /* Close dropdown on outside click */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cmdRef.current && !cmdRef.current.contains(e.target as Node)) {
        setCmdOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKey = (key: string) => {
    if (key === 'del') {
      setAmount(prev => prev.length > 1 ? prev.slice(0, -1) : '0');
    } else if (key === '.') {
      if (!amount.includes('.')) setAmount(prev => prev + '.');
    } else {
      setAmount(prev => prev === '0' ? key : prev + key);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parseFloat(amount) <= 0) return setError('Ingresa un monto valido');
    if (!description) return setError('Ingresa una descripcion');

    try {
      setLoading(true);
      setError('');
      await Api.createExpense({
        description,
        amount: parseFloat(amount),
        category,
        date: format(new Date(), 'yyyy-MM-dd'),
        type,
        paid_by: user?.username || 'samuel',
      });
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (err) {
      setError('Error al guardar el gasto');
    } finally {
      setLoading(false);
    }
  };

  const getCatDef = (name: string) => CATEGORIES.find(c => c.name === name);

  const filteredCategories = CATEGORIES.filter(cat =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase()) || categorySearch === ''
  );

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
      {/* Back link */}
      <div
        className="add-expense__back-link"
        onClick={() => navigate(-1)}
      >
        <ChevronLeftIcon />
        Volver
      </div>

      <div className="topbar an d1">
        <div><h1>Nuevo Gasto</h1></div>
      </div>

      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          {/* Amount display */}
          <div className="an d2" style={{ textAlign: 'center', padding: '40px 0 24px' }}>
            <span style={{
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--tm)',
              verticalAlign: 'super',
            }}>
              &euro;
            </span>
            <span style={{
              fontSize: 56,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: amount === '0' ? 'var(--tm)' : 'var(--text)',
              transition: 'color .2s',
            }}>
              {amount}
            </span>
          </div>

          {/* Description field */}
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
              onChange={e => setDescription(e.target.value)}
              onFocus={e => {
                e.currentTarget.style.borderColor = 'var(--green)';
                e.currentTarget.style.boxShadow = '0 0 16px rgba(52,211,153,.15)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = 'var(--glass-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Command palette category picker */}
          <div className="an d3 cmd-palette" ref={cmdRef}>
            <div className="label">Categoria</div>
            <div className="cmd-input-wrap">
              <TagIcon />
              {category && (() => {
                const catDef = getCatDef(category);
                const IconComp = CATEGORY_ICONS[category];
                return (
                  <span className="cmd-selected">
                    <div className="cmd-icon" style={{
                      background: catDef?.iconBg ?? 'var(--gl)',
                      width: 20,
                      height: 20,
                    }}>
                      {IconComp
                        ? <IconComp size={12} color={catDef?.color ?? 'var(--green)'} strokeWidth={2} />
                        : <MoreHorizontal size={12} color={catDef?.color ?? 'var(--green)'} strokeWidth={2} />
                      }
                    </div>
                    {category}
                    <span
                      className="cmd-x"
                      onClick={e => {
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
                placeholder="Buscar o crear categoría..."
                value={categorySearch}
                onChange={e => {
                  setCategorySearch(e.target.value);
                  setCmdOpen(e.target.value.length > 0);
                }}
              />
            </div>
            <div className={`cmd-dropdown ${cmdOpen ? 'open' : ''}`}>
              <div className="cmd-list">
                {filteredCategories.map(cat => (
                  <div
                    key={cat.id}
                    className={`cmd-option ${category === cat.name ? 'selected' : ''}`}
                    onClick={() => {
                      setCategory(cat.name);
                      setCategorySearch('');
                      setCmdOpen(false);
                    }}
                  >
                    <div className="cmd-icon" style={{ background: cat.iconBg }}>
                      {(() => {
                        const IconComp = CATEGORY_ICONS[cat.name];
                        return IconComp
                          ? <IconComp size={14} color={cat.color} strokeWidth={2} />
                          : <MoreHorizontal size={14} color={cat.color} strokeWidth={2} />;
                      })()}
                    </div>
                    {cat.name}
                  </div>
                ))}
              </div>
              {categorySearch.trim() && !CATEGORIES.some(c => c.name.toLowerCase() === categorySearch.trim().toLowerCase()) && (
                <div
                  className="cmd-create"
                  onClick={() => {
                    setCategory(categorySearch.trim());
                    setCategorySearch('');
                    setCmdOpen(false);
                  }}
                >
                  <PlusIcon /> Crear &ldquo;{categorySearch.trim()}&rdquo;
                </div>
              )}
            </div>
          </div>

          {/* Type toggle */}
          <div className="an d4" style={{ marginBottom: 24 }}>
            <div className="label">Tipo de gasto</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div
                className="type-sel"
                onClick={() => setType('shared')}
                style={type === 'shared'
                  ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                  : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }
                }
              >
                Compartido
              </div>
              <div
                className="type-sel"
                onClick={() => setType('personal')}
                style={type === 'personal'
                  ? { border: '2px solid var(--green)', background: 'var(--gl)', color: 'var(--green)' }
                  : { border: '1px solid var(--glass-border)', background: 'var(--surface)', color: 'var(--ts)' }
                }
              >
                Personal
              </div>
            </div>
          </div>

          {/* Numpad */}
          <div className="an d5">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              maxWidth: 320,
              margin: '0 auto',
            }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => (
                <button
                  key={k}
                  type="button"
                  className="num-btn"
                  onClick={() => handleKey(k)}
                >
                  {k}
                </button>
              ))}
              <button type="button" className="num-btn action" onClick={() => handleKey('.')}>.</button>
              <button type="button" className="num-btn" onClick={() => handleKey('0')}>0</button>
              <button type="button" className="num-btn action" onClick={() => handleKey('del')}>&larr;</button>
            </div>

            {error && <div className="add-expense__error-msg">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                maxWidth: 320,
                margin: '20px auto 0',
                display: 'block',
                padding: 16,
                fontSize: 16,
              }}
              disabled={loading}
            >
              {loading ? 'Guardando...' : 'Anadir Gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
