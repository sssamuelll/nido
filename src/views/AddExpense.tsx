import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Api } from '../api';
import { format } from 'date-fns';
import { useAuth } from '../auth';
import { showToast } from '../components/Toast';
import { EmojiPicker } from '../components/EmojiPicker';
import { useCategoryManagement } from '../hooks/useCategoryManagement';

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
  const { user } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('0');
  const [category, setCategory] = useState('');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { categories, getCategoryDef } = useCategoryManagement(type);
  const [categorySearch, setCategorySearch] = useState('');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatEmoji, setNewCatEmoji] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLOR_OPTIONS[0]);
  const [savingCat, setSavingCat] = useState(false);
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

  const handleKey = (key: string) => {
    if (key === 'del') {
      setAmount((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
    } else if (key === '.') {
      if (!amount.includes('.')) setAmount((prev) => prev + '.');
    } else {
      setAmount((prev) => (prev === '0' ? key : prev + key));
    }
  };

  const filteredCategories = categories.filter((item) =>
    item.name.toLowerCase().includes(categorySearch.toLowerCase()) || categorySearch === ''
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parseFloat(amount) <= 0) return setError('Ingresa un monto valido');
    if (!description) return setError('Ingresa una descripcion');
    if (!category.trim()) return setError('Selecciona una categoría');

    try {
      setLoading(true);
      setError('');
      await Api.createExpense({
        description,
        amount: parseFloat(amount),
        category,
        category_id: categories.find(c => c.name === category)?.id,
        date: format(new Date(), 'yyyy-MM-dd'),
        type,
      });

      const isNewCategory = !categories.some(
        (c) => c.name.toLowerCase() === category.trim().toLowerCase()
      );

      if (isNewCategory) {
        showToast('Gasto añadido correctamente ✔');
        setShowNewCatModal(true);
      } else {
        setSuccess(true);
        showToast('Gasto añadido correctamente ✔');
        setTimeout(() => navigate('/'), 1500);
      }
    } catch {
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
          <div className="an d2" style={{ textAlign: 'center', padding: '40px 0 24px' }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: 'var(--tm)', verticalAlign: 'super' }}>
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

          <div className="an d5">
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              maxWidth: 320,
              margin: '0 auto',
            }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
                <button key={k} type="button" className="num-btn" onClick={() => handleKey(k)}>
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
                    showToast('Categoría registrada ✔');
                    navigate('/');
                  } catch {
                    showToast('Error al guardar la categoría');
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
