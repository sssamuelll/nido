import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { CATEGORIES } from './CategoryIcon';
import { format } from 'date-fns';

interface AddExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const AddExpenseSheet: React.FC<AddExpenseSheetProps> = ({ isOpen, onClose, onSaved }) => {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paidBy, setPaidBy] = useState(user?.username || 'samuel');
  const [type, setType] = useState<'shared' | 'personal'>('shared');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showExtra, setShowExtra] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setDescription('');
      setCategory('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setPaidBy(user?.username || 'samuel');
      setType('shared');
      setError('');
      setSaving(false);
      setShowExtra(false);
      setSuccess(false);
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [isOpen, user]);

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
      setTimeout(() => {
        onSaved();
        onClose();
      }, 600);
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

  if (!isOpen) return null;

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className={`sheet ${success ? 'sheet-success' : ''}`} onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="sheet-handle"><div className="sheet-handle-bar" /></div>

        {success ? (
          <div className="sheet-success-msg">
            <div className="sheet-success-icon">✓</div>
            <div>Guardado</div>
          </div>
        ) : (
          <>
            {/* Amount — big and central */}
            <div className="sheet-amount-area">
              <div className="sheet-amount-row">
                <span className="sheet-currency">€</span>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="decimal"
                  className="sheet-amount-input"
                  placeholder="0"
                  value={amount}
                  onChange={handleAmountChange}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
              </div>
              {/* Description inline */}
              <input
                type="text"
                className="sheet-desc-input"
                placeholder="Añadir nota..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>

            {/* Categories — horizontal scroll */}
            <div className="sheet-categories">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`sheet-cat ${category === cat.id ? 'active' : ''}`}
                  onClick={() => setCategory(cat.id)}
                >
                  <span className="sheet-cat-icon">{cat.icon}</span>
                  <span className="sheet-cat-name">{cat.name}</span>
                </button>
              ))}
            </div>

            {/* Who paid — compact toggle, only shows if not default */}
            <div className="sheet-meta-row">
              <button
                className={`sheet-meta-chip ${paidBy === 'samuel' ? 'active' : ''}`}
                onClick={() => setPaidBy('samuel')}
              >
                👨‍💻 Samuel
              </button>
              <button
                className={`sheet-meta-chip ${paidBy === 'maria' ? 'active' : ''}`}
                onClick={() => setPaidBy('maria')}
              >
                👩‍🎨 María
              </button>
              <div className="sheet-meta-spacer" />
              <button
                className={`sheet-meta-chip ${type === 'shared' ? 'active' : ''}`}
                onClick={() => setType('shared')}
              >
                Compartido
              </button>
              <button
                className={`sheet-meta-chip ${type === 'personal' ? 'active' : ''}`}
                onClick={() => setType('personal')}
              >
                Personal
              </button>
            </div>

            {/* Extra — date (tap to show) */}
            {showExtra ? (
              <div className="sheet-extra">
                <input
                  type="date"
                  className="form-input"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  style={{ fontSize: '0.875rem' }}
                />
              </div>
            ) : (
              <button className="sheet-date-btn" onClick={() => setShowExtra(true)}>
                {date === format(new Date(), 'yyyy-MM-dd') ? 'Hoy' : date} · Cambiar fecha
              </button>
            )}

            {/* Error */}
            {error && <div className="sheet-error">{error}</div>}

            {/* Submit */}
            <button
              className="btn btn-primary sheet-submit"
              onClick={handleSubmit}
              disabled={saving || !amount}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
