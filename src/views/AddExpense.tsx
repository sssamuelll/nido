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
  const inputRef = useRef<HTMLInputElement>(null);

  const expenseType = (location.state as any)?.type === 'personal' ? 'personal' : 'shared';

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const effectiveCategory = customCat.trim() || category;

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError('Ingresa una cantidad'); return; }
    if (!effectiveCategory) { setError('Elige o escribe una categoría'); return; }

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

  const selectQuickCat = (id: string) => {
    setCategory(id);
    setCustomCat('');
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
              ref={inputRef}
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

        {/* Category — quick chips + free input */}
        <div className="add-tag-row">
          {QUICK_CATS.map(cat => (
            <button
              key={cat.id}
              className={`add-tag ${category === cat.id && !customCat ? 'active' : ''}`}
              onClick={() => selectQuickCat(cat.id)}
            >
              {cat.icon}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="add-note-input"
          placeholder="O escribe una categoría..."
          value={customCat}
          onChange={e => { setCustomCat(e.target.value); if (e.target.value) setCategory(''); }}
          onKeyDown={handleKeyDown}
        />

        {/* Note */}
        <input
          type="text"
          className="add-note-input"
          placeholder="Nota (opcional)"
          value={description}
          onChange={e => setDescription(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ marginTop: 'var(--space-sm)' }}
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
