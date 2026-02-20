import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { CATEGORIES } from '../components/CategoryIcon';
import { format } from 'date-fns';

export const AddExpense: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paidBy, setPaidBy] = useState(user?.username || 'samuel');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDate, setShowDate] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError('Ingresa una cantidad'); return; }
    if (!category) { setError('Elige una categoría'); return; }

    try {
      setSaving(true);
      setError('');
      await Api.createExpense({
        amount: num,
        description: description.trim() || category,
        category,
        date,
        paid_by: paidBy,
        type,
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
    if (e.key === 'Enter' && amount && category) {
      e.preventDefault();
      handleSubmit();
    }
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
      {/* Header */}
      <div className="add-header">
        <button className="add-back" onClick={() => navigate(-1)}>←</button>
        <h1 className="add-title">Nuevo gasto</h1>
        <div style={{ width: 40 }} />
      </div>

      {/* Scrollable content */}
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
          <input
            type="text"
            className="add-desc-input"
            placeholder="Añadir nota..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Categories grid */}
        <div className="add-section-label">Categoría</div>
        <div className="add-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`add-cat ${category === cat.id ? 'active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >
              <span className="add-cat-icon">{cat.icon}</span>
              <span className="add-cat-name">{cat.name}</span>
            </button>
          ))}
        </div>

        {/* Who paid */}
        <div className="add-section-label">Pagó</div>
        <div className="add-chips-row">
          <button
            className={`add-chip ${paidBy === 'samuel' ? 'active' : ''}`}
            onClick={() => setPaidBy('samuel')}
          >
            👨‍💻 Samuel
          </button>
          <button
            className={`add-chip ${paidBy === 'maria' ? 'active' : ''}`}
            onClick={() => setPaidBy('maria')}
          >
            👩‍🎨 María
          </button>
        </div>

        {/* Type */}
        <div className="add-section-label">Tipo</div>
        <div className="add-chips-row">
          <button
            className={`add-chip ${type === 'shared' ? 'active' : ''}`}
            onClick={() => setType('shared')}
          >
            Compartido
          </button>
          <button
            className={`add-chip ${type === 'personal' ? 'active' : ''}`}
            onClick={() => setType('personal')}
          >
            Personal
          </button>
        </div>

        {/* Date */}
        {showDate ? (
          <div className="add-date-picker">
            <input
              type="date"
              className="form-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        ) : (
          <button className="add-date-btn" onClick={() => setShowDate(true)}>
            📅 {date === format(new Date(), 'yyyy-MM-dd') ? 'Hoy' : date} · Cambiar
          </button>
        )}

        {/* Error */}
        {error && <div className="add-error">{error}</div>}
      </div>

      {/* Fixed bottom submit */}
      <div className="add-footer">
        <button
          className="btn btn-primary add-submit"
          onClick={handleSubmit}
          disabled={saving || !amount}
        >
          {saving ? 'Guardando...' : 'Guardar gasto'}
        </button>
      </div>
    </div>
  );
};
