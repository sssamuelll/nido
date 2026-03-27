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
}

export const CategoryModal: React.FC<Props> = ({
  isOpen, mode, name, onNameChange, emoji, onEmojiChange,
  color, onColorChange, colorOptions, budget, onBudgetChange,
  onClose, onSave,
}) => {
  if (!isOpen) return null;
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
          <div style={{ display: 'flex', gap: 6 }}>
            {colorOptions.map(c => (
              <div key={c} onClick={() => onColorChange(c)} style={{
                width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                border: `3px solid ${color === c ? 'var(--text)' : 'transparent'}`,
              }} />
            ))}
          </div>
        </div>
        <div className="form-row">
          <label>Límite</label>
          <span style={{ color: 'var(--tm)' }}>€</span>
          <input className="form-input" type="number" placeholder="200" value={budget} onChange={e => onBudgetChange(e.target.value)} style={{ width: 100, textAlign: 'right' }} autoFocus />
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave}>Guardar</button>
        </div>
      </div>
    </div>
  );
};
