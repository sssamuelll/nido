import React from 'react';
import { EmojiPicker } from './EmojiPicker';

interface Props {
  isOpen: boolean;
  mode: 'add' | 'edit';
  name: string;
  onNameChange: (v: string) => void;
  emoji: string;
  onEmojiChange: (v: string) => void;
  color: string;
  onColorChange: (v: string) => void;
  colorOptions: string[];
  budget: string;
  onBudgetChange: (v: string) => void;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  totalBudget?: number;
  allocatedBudget?: number;
}

export const CategoryModal: React.FC<Props> = ({
  isOpen, mode, name, onNameChange, emoji, onEmojiChange,
  color, onColorChange, colorOptions, budget, onBudgetChange,
  onClose, onSave, onDelete, totalBudget, allocatedBudget,
}) => {
  if (!isOpen) return null;

  const hasTotalBudget = totalBudget != null && totalBudget > 0;

  const handleAmountChange = (val: string) => {
    onBudgetChange(val);
  };

  const handlePctChange = (pctStr: string) => {
    const pct = parseFloat(pctStr);
    if (hasTotalBudget && Number.isFinite(pct)) {
      const amount = Math.round((pct / 100) * totalBudget!);
      onBudgetChange(String(amount));
    }
  };

  const currentAmount = parseFloat(budget) || 0;
  const pctOfTotal = hasTotalBudget
    ? ((currentAmount / totalBudget!) * 100).toFixed(1)
    : '';
  const totalAllocated = (allocatedBudget || 0) + currentAmount;
  const pctAllocated = hasTotalBudget ? Math.round((totalAllocated / totalBudget!) * 100) : 0;
  const remaining = hasTotalBudget ? totalBudget! - totalAllocated : 0;

  const barColorClass = pctAllocated > 100
    ? 'cat-budget-bar--over'
    : pctAllocated >= 80
      ? 'cat-budget-bar--warn'
      : '';

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>{mode === 'edit' ? 'Editar categoría' : 'Nueva categoría'}</h3>
        <p>{mode === 'edit' ? 'Edita nombre, emoji y límite' : 'Crea una categoría para organizar tus gastos'}</p>

        <div className="form-row">
          <label>Nombre</label>
          <input className="form-input" type="text" placeholder="Ej: Transporte" value={name} onChange={e => onNameChange(e.target.value)} />
        </div>
        <div className="form-row">
          <label>Emoji</label>
          <EmojiPicker value={emoji} onChange={onEmojiChange} />
        </div>
        <div className="form-row">
          <label>Color</label>
          <div className="cat-color-options">
            {colorOptions.map(c => (
              <button
                key={c}
                type="button"
                className={`cat-color-dot${color === c ? ' cat-color-dot--active' : ''}`}
                style={{ '--dot-color': c } as React.CSSProperties}
                onClick={() => onColorChange(c)}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>Límite</label>
          {hasTotalBudget ? (
            <div className="cat-budget-dual-wrap">
              <div className="cat-budget-dual">
                <div className="cat-budget-input">
                  <span className="cat-budget-input__symbol">€</span>
                  <input
                    className="form-input"
                    type="number"
                    placeholder="200"
                    value={budget}
                    onChange={e => handleAmountChange(e.target.value)}
                    autoFocus
                  />
                </div>
                <span className="cat-budget-swap">↔</span>
                <div className="cat-budget-input">
                  <input
                    className="form-input"
                    type="number"
                    placeholder="15.0"
                    value={pctOfTotal}
                    onChange={e => handlePctChange(e.target.value)}
                    step="0.1"
                  />
                  <span className="cat-budget-input__symbol">%</span>
                </div>
              </div>
              <div className="cat-budget-bar-wrap">
                <div className={`cat-budget-bar ${barColorClass}`} style={{ '--cat-budget-pct': `${Math.min(pctAllocated, 100)}%` } as React.CSSProperties} />
              </div>
              <div className="cat-budget-info">
                {pctAllocated}% asignado · €{remaining.toLocaleString('es-ES', { maximumFractionDigits: 0 })} disponible
              </div>
            </div>
          ) : (
            <div className="cat-budget-dual-wrap">
              <div className="cat-budget-input cat-budget-input--solo">
                <span className="cat-budget-input__symbol">€</span>
                <input
                  className="form-input"
                  type="number"
                  placeholder="200"
                  value={budget}
                  onChange={e => handleAmountChange(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          {mode === 'edit' && onDelete && (
            <button type="button" onClick={onDelete} className="btn btn-danger-outline">
              Eliminar
            </button>
          )}
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
};
