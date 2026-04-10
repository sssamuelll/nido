import { useState } from 'react';
import { Api } from '../api';
import { showToast } from '../components/Toast';
import type { CategoryDef } from './useCategoryManagement';

const COLOR_OPTIONS = ['#F87171', '#60A5FA', '#FBBF24', '#A78BFA', '#34D399'];

export const useCategoryModal = () => {
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<'add' | 'edit'>('add');
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [budget, setBudget] = useState('');
  const [emoji, setEmoji] = useState('🍽️');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);

  const openAdd = () => {
    setMode('add');
    setName('');
    setOriginalName('');
    setBudget('');
    setEmoji('🍽️');
    setColor(COLOR_OPTIONS[0]);
    setEditingId(undefined);
    setShowModal(true);
  };

  const openEdit = (catDef: CategoryDef) => {
    setMode('edit');
    setName(catDef.name);
    setOriginalName(catDef.name);
    setBudget(String(catDef.budget_amount));
    setEmoji(catDef.emoji || '📂');
    setColor(catDef.color || '#6B7280');
    setEditingId(catDef.id);
    setShowModal(true);
  };

  const close = () => setShowModal(false);

  const save = async (opts: {
    context: 'shared' | 'personal';
    categories: CategoryDef[];
    onSuccess: () => void;
  }) => {
    const trimmedName = name.trim();
    const amount = parseFloat(budget);
    if (!trimmedName) { showToast('Ponle un nombre a la categoría'); return; }
    const emojiVal = emoji.trim() || '📂';
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Pon un límite válido para la categoría'); return; }

    try {
      const existingCat = opts.categories.find(c => c.name === originalName);
      await Api.saveCategory({
        id: mode === 'edit' && existingCat ? existingCat.id : (mode === 'edit' && editingId ? editingId : undefined),
        name: trimmedName,
        emoji: emojiVal,
        color,
        budget_amount: amount,
        context: opts.context,
      });
      setShowModal(false);
      opts.onSuccess();
      showToast(mode === 'add' ? 'Categoría creada' : 'Categoría actualizada');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al guardar la categoría';
      showToast(message);
    }
  };

  const remove = async (opts: {
    categories: CategoryDef[];
    onSuccess: () => void;
  }) => {
    const existingCat = opts.categories.find(c => c.name === originalName);
    if (!existingCat) {
      showToast('Categoría no encontrada');
      return;
    }
    try {
      await Api.deleteCategory(existingCat.id);
      setShowModal(false);
      opts.onSuccess();
      showToast('Categoría eliminada');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al eliminar la categoría';
      showToast(message);
    }
  };

  return {
    showModal, mode, name, setName, originalName, budget, setBudget,
    emoji, setEmoji, color, setColor, colorOptions: COLOR_OPTIONS,
    openAdd, openEdit, close, save, remove,
  };
};
