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
  const amountRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    amount: '',
    description: '',
    category: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    paid_by: user?.username || 'samuel',
    type: 'shared' as 'shared' | 'personal',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'amount' | 'details'>('amount');

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setFormData({
        amount: '',
        description: '',
        category: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        paid_by: user?.username || 'samuel',
        type: 'shared',
      });
      setStep('amount');
      setError('');
      setSaving(false);
      setTimeout(() => amountRef.current?.focus(), 300);
    }
  }, [isOpen, user]);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setFormData({ ...formData, amount: value });
    }
  };

  const handleAmountNext = () => {
    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      setError('Ingresa una cantidad');
      return;
    }
    setError('');
    setStep('details');
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAmountNext();
    }
  };

  const handleSubmit = async () => {
    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      setError('Cantidad inválida');
      return;
    }
    if (!formData.category) {
      setError('Selecciona una categoría');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await Api.createExpense({
        ...formData,
        amount,
        description: formData.description.trim() || formData.category,
      });
      onSaved();
      onClose();
    } catch (err: any) {
      setError('Error al guardar');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div className="bottom-sheet bottom-sheet-tall" onClick={(e) => e.stopPropagation()}>
        {/* Drag Handle */}
        <div className="bottom-sheet-handle">
          <div className="bottom-sheet-handle-bar" />
        </div>

        <div className="bottom-sheet-header">
          <h2 className="bottom-sheet-title">
            {step === 'amount' ? 'Nuevo gasto' : ''}
          </h2>
          <button className="btn-ghost bottom-sheet-close" onClick={onClose}>✕</button>
        </div>

        <div className="bottom-sheet-content">
          {step === 'amount' ? (
            /* Step 1: Amount */
            <div className="add-expense-amount-step">
              <div className="amount-display">
                <span className="amount-currency">€</span>
                <input
                  ref={amountRef}
                  type="text"
                  inputMode="decimal"
                  className="amount-input-clean"
                  placeholder="0"
                  value={formData.amount}
                  onChange={handleAmountChange}
                  onKeyDown={handleAmountKeyDown}
                  autoFocus
                />
              </div>

              {/* Quick amounts */}
              <div className="quick-amounts">
                {[5, 10, 20, 50].map((val) => (
                  <button
                    key={val}
                    type="button"
                    className="quick-amount-chip"
                    onClick={() => setFormData({ ...formData, amount: val.toString() })}
                  >
                    €{val}
                  </button>
                ))}
              </div>

              {/* Paid by toggle */}
              <div className="sheet-section">
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-option ${formData.paid_by === 'samuel' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, paid_by: 'samuel' })}
                  >
                    👨‍💻 Samuel
                  </button>
                  <button
                    type="button"
                    className={`toggle-option ${formData.paid_by === 'maria' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, paid_by: 'maria' })}
                  >
                    👩‍🎨 María
                  </button>
                </div>
              </div>

              {/* Type toggle */}
              <div className="sheet-section">
                <div className="toggle-group">
                  <button
                    type="button"
                    className={`toggle-option ${formData.type === 'shared' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, type: 'shared' })}
                  >
                    💑 Compartido
                  </button>
                  <button
                    type="button"
                    className={`toggle-option ${formData.type === 'personal' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, type: 'personal' })}
                  >
                    👤 Personal
                  </button>
                </div>
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <button
                type="button"
                className="btn btn-primary sheet-btn-full"
                onClick={handleAmountNext}
              >
                Siguiente →
              </button>
            </div>
          ) : (
            /* Step 2: Category + Description */
            <div className="add-expense-details-step">
              {/* Amount summary */}
              <div className="amount-summary">
                <button className="amount-summary-edit" onClick={() => setStep('amount')}>
                  <span className="amount-summary-value">€{parseFloat(formData.amount).toFixed(2)}</span>
                  <span className="amount-summary-label">
                    {formData.paid_by === 'samuel' ? '👨‍💻' : '👩‍🎨'} · {formData.type === 'shared' ? 'Compartido' : 'Personal'}
                  </span>
                </button>
              </div>

              {/* Category chips */}
              <div className="sheet-section">
                <label className="form-label">Categoría</label>
                <div className="category-chips">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`category-chip ${formData.category === cat.id ? 'active' : ''}`}
                      onClick={() => setFormData({ ...formData, category: cat.id })}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="sheet-section">
                <label className="form-label">Descripción (opcional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="¿En qué gastaste?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* Date */}
              <div className="sheet-section">
                <label className="form-label">Fecha</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              {error && <div className="sheet-error">{error}</div>}

              <button
                type="button"
                className="btn btn-primary sheet-btn-full"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? 'Guardando...' : '✓ Guardar gasto'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
