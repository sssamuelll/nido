import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { CategorySelector } from '../components/CategoryIcon';
import { format } from 'date-fns';

export const AddExpense: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const amountInputRef = useRef<HTMLInputElement>(null);

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

  // Auto-focus amount input
  useEffect(() => {
    if (amountInputRef.current) {
      amountInputRef.current.focus();
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      setError('Ingresa una cantidad válida');
      return;
    }

    if (!formData.description.trim()) {
      setError('Ingresa una descripción');
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
        description: formData.description.trim(),
      });

      // Redirect to dashboard
      navigate('/', { replace: true });
    } catch (err: any) {
      setError('Error al guardar el gasto');
      console.error('Create expense error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setFormData({ ...formData, amount: value });
    }
  };

  return (
    <div className="page-container fade-in">
      <div className="main-content">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate(-1)}
            className="btn btn-ghost"
            style={{ padding: '0.5rem' }}
          >
            ← Volver
          </button>
          <h1 className="text-xl font-semibold">Nuevo Gasto</h1>
          <div style={{ width: '60px' }}></div> {/* Spacer */}
        </div>

        <form onSubmit={handleSubmit}>
          {/* Amount Input */}
          <div className="form-group">
            <label className="form-label">Cantidad</label>
            <input
              ref={amountInputRef}
              type="text"
              inputMode="decimal"
              className="form-input amount-input"
              placeholder="0.00"
              value={formData.amount}
              onChange={handleAmountChange}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label">Descripción</label>
            <input
              type="text"
              className="form-input"
              placeholder="¿En qué gastaste?"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              disabled={saving}
            />
          </div>

          {/* Category */}
          <div className="form-group">
            <label className="form-label">Categoría</label>
            <CategorySelector
              selectedCategory={formData.category}
              onSelect={(category) => setFormData({ ...formData, category })}
            />
          </div>

          {/* Date */}
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input
              type="date"
              className="form-input"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              disabled={saving}
            />
          </div>

          {/* Paid By */}
          <div className="form-group">
            <label className="form-label">Pagado por</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-option ${formData.paid_by === 'samuel' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, paid_by: 'samuel' })}
                disabled={saving}
              >
                👨‍💻 Samuel
              </button>
              <button
                type="button"
                className={`toggle-option ${formData.paid_by === 'maria' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, paid_by: 'maria' })}
                disabled={saving}
              >
                👩‍🎨 María
              </button>
            </div>
          </div>

          {/* Type */}
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div className="toggle-group">
              <button
                type="button"
                className={`toggle-option ${formData.type === 'shared' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, type: 'shared' })}
                disabled={saving}
              >
                💑 Compartido
              </button>
              <button
                type="button"
                className={`toggle-option ${formData.type === 'personal' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, type: 'personal' })}
                disabled={saving}
              >
                👤 Personal
              </button>
            </div>
          </div>

          {error && (
            <div className="text-error text-center mb-2">
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving}
            style={{ width: '100%', marginTop: '2rem' }}
          >
            {saving ? 'Guardando...' : 'Guardar Gasto'}
          </button>
        </form>
      </div>
    </div>
  );
};