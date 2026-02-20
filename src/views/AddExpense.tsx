import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { CATEGORIES } from '../components/CategoryIcon';
import { format } from 'date-fns';

const QUICK_CATS = CATEGORIES.map(c => ({ id: c.id, icon: c.icon }));

export const AddExpense: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const amountRef = useRef<HTMLInputElement>(null);

  const expenseType = (location.state as any)?.type === 'personal' ? 'personal' : 'shared';

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Autocomplete
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [showHints, setShowHints] = useState(false);

  useEffect(() => {
    setTimeout(() => amountRef.current?.focus(), 100);
    Api.getCategories().then(setDbCategories).catch(() => {});
  }, []);

  const hints = category
    ? dbCategories.filter(c => c.toLowerCase().includes(category.toLowerCase()) && c !== category)
    : [];

  const effectiveCategory = category.trim();

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError('Ingresa una cantidad'); return; }
    if (!effectiveCategory) { setError('¿En qué gastaste?'); return; }

    try {
      setSaving(true);
      setError('');
      await Api.createExpense({
        amount: num,
        description: description.trim() || effectiveCategory,
        category: effectiveCategory,
        date: format(new Date(), 'yyyy-MM-dd'),
        paid_by: user?.username || 'samuel',
        type: expenseType,
      });
      setSuccess(true);
      setTimeout(() => navigate('/', { replace: true }), 600);
    } catch {
      setError('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && amount && effectiveCategory) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const pickQuick = (id: string) => {
    setCategory(id);
    setShowHints(false);
  };

  const pickHint = (cat: string) => {
    setCategory(cat);
    setShowHints(false);
  };

  if (success) {
    return (
      <div className="add-view">
        <div className="add-success">
          <div className="add-success-icon">✓</div>
          <div className="add-success-text">Guardado</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-view">
      <div className="add-header">
        <button className="add-back" onClick={() => navigate(-1)}>←</button>
        <h1 className="add-title">
          {expenseType === 'personal' ? 'Gasto personal' : 'Gasto compartido'}
        </h1>
        <div style={{ width: 40 }} />
      </div>

      <div className="add-content">
        {/* Amount */}
        <div className="add-amount-area">
          <div className="add-amount-row">
            <span className="add-currency">€</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              className="add-amount-input"
              placeholder="0"
              value={amount}
              onChange={handleAmountChange}
              onKeyDown={handleKeyDown}
              autoFocus
            />
          </div>
        </div>

        {/* Quick emoji row */}
        <div className="add-tag-row">
          {QUICK_CATS.map(cat => (
            <button
              key={cat.id}
              className={`add-tag ${category === cat.id ? 'active' : ''}`}
              onClick={() => pickQuick(cat.id)}
            >
              {cat.icon}
            </button>
          ))}
        </div>

        {/* Category input with autocomplete */}
        <div className="add-autocomplete">
          <input
            type="text"
            className="add-note-input"
            placeholder="Categoría..."
            value={category}
            onChange={e => { setCategory(e.target.value); setShowHints(true); }}
            onFocus={() => setShowHints(true)}
            onBlur={() => setTimeout(() => setShowHints(false), 150)}
            onKeyDown={handleKeyDown}
          />
          {showHints && hints.length > 0 && (
            <div className="add-hints">
              {hints.map(h => (
                <button key={h} className="add-hint" onMouseDown={() => pickHint(h)}>
                  {h}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Note */}
        <input
          type="text"
          className="add-note-input add-note-secondary"
          placeholder="Nota (opcional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {error && <div className="add-error">{error}</div>}
      </div>

      <div className="add-footer">
        <button
          className="btn btn-primary add-submit"
          onClick={handleSubmit}
          disabled={saving || !amount}
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  );
};
