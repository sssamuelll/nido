import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { CATEGORIES, type Owner } from '../types';
import { CategoryPill } from '../components/CategoryPill';
import { NumpadKey } from '../components/NumpadKey';
import { Button } from '../components/Button';
import { Pencil } from 'lucide-react';

const OWNER_OPTIONS: { owner: Owner; label: string; emoji: string }[] = [
  { owner: 'shared', label: 'Compartido', emoji: '🏠' },
  { owner: 'samuel', label: 'Samuel', emoji: '👨‍💻' },
  { owner: 'maria', label: 'María', emoji: '👩‍🎨' },
];

const NUMPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

export const AddExpense: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('0');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [owner, setOwner] = useState<Owner>('shared');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [split, setSplit] = useState(50);

  const handleNumpad = (key: string) => {
    if (key === '⌫') {
      setAmount(prev => prev.length <= 1 ? '0' : prev.slice(0, -1));
      return;
    }
    if (key === '.' && amount.includes('.')) return;
    if (amount.includes('.') && amount.split('.')[1].length >= 2) return;
    setAmount(prev => prev === '0' && key !== '.' ? key : prev + key);
  };

  const handleSubmit = async () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { setError('Ingresa una cantidad'); return; }
    if (!category) { setError('¿En qué gastaste?'); return; }

    const paid_by = owner === 'maria' ? 'maria' : owner === 'samuel' ? 'samuel' : (user?.username || 'samuel');
    const type = owner === 'shared' ? 'shared' : 'personal';

    try {
      setSaving(true);
      setError('');
      await Api.createExpense({
        amount: num,
        description: description.trim() || category,
        category,
        date: format(new Date(), 'yyyy-MM-dd'),
        paid_by,
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

  if (success) {
    return (
      <div className="add-expense" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
          <div className="page-subtitle">Guardado</div>
        </div>
      </div>
    );
  }

  return (
    <div className="add-expense">
      {/* Header with owner pills */}
      <div className="add-expense__header">
        <h2 className="add-expense__title">Nuevo Gasto</h2>
        <div className="add-expense__owner-pills">
          {OWNER_OPTIONS.map(o => (
            <button
              key={o.owner}
              className="add-expense__owner-pill"
              onClick={() => setOwner(o.owner)}
              style={{
                background: owner === o.owner ? `var(--color-${o.owner})` : 'transparent',
                borderColor: `var(--color-${o.owner})`,
                color: owner === o.owner ? '#FFFFFF' : `var(--color-${o.owner})`,
              }}
            >
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Amount display */}
      <div className="add-expense__amount-display">
        <div className="add-expense__amount-box">
          <span className="add-expense__currency">€</span>
          <span className="add-expense__value">{amount}</span>
        </div>
      </div>

      {/* Categories */}
      <div className="add-expense__categories">
        {CATEGORIES.map(cat => (
          <CategoryPill
            key={cat.id}
            emoji={cat.emoji}
            name={cat.name}
            active={category === cat.id}
            onClick={() => setCategory(cat.id)}
          />
        ))}
      </div>

      {/* Description */}
      <div className="add-expense__description">
        <Pencil size={16} color="var(--color-text-tertiary)" />
        <input
          className="add-expense__description-input"
          placeholder="Añadir nota..."
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      {/* Split slider (visual-only when shared) */}
      {owner === 'shared' && (
        <div className="add-expense__split">
          <div className="add-expense__split-badge" style={{ background: 'rgba(139,220,107,0.18)' }}>
            <span style={{ fontSize: 14 }}>👨‍💻</span>
            <span className="add-expense__split-pct" style={{ color: 'var(--color-samuel)' }}>{split}%</span>
          </div>
          <input
            type="range" min={0} max={100} value={split}
            onChange={e => setSplit(Number(e.target.value))}
            className="add-expense__split-slider"
            style={{ accentColor: 'var(--color-samuel)' }}
          />
          <div className="add-expense__split-badge" style={{ background: 'rgba(255,140,107,0.18)' }}>
            <span className="add-expense__split-pct" style={{ color: 'var(--color-maria)' }}>{100 - split}%</span>
            <span style={{ fontSize: 14 }}>👩‍🎨</span>
          </div>
        </div>
      )}

      {error && <div style={{ color: 'var(--color-danger)', fontFamily: 'var(--font-body)', fontSize: 13, textAlign: 'center', padding: '0 24px' }}>{error}</div>}

      {/* Numpad */}
      <div className="add-expense__numpad">
        {NUMPAD_ROWS.map((row, ri) => (
          <div key={ri} className="add-expense__numpad-row">
            {row.map(key => (
              <NumpadKey
                key={key}
                label={key}
                variant={key === '⌫' ? 'delete' : 'default'}
                onClick={() => handleNumpad(key)}
              />
            ))}
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="add-expense__cta">
        <Button
          label={saving ? 'Guardando...' : 'Guardar'}
          variant={owner}
          fullWidth
          onClick={handleSubmit}
          disabled={saving || amount === '0'}
        />
      </div>
    </div>
  );
};
