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

  const openAdd = () => {
    setMode('add');
    setName('');
    setOriginalName('');
    setBudget('');
    setEmoji('🍽️');
    setColor(COLOR_OPTIONS[0]);
    setShowModal(true);
  };

  const openEdit = (categoryName: string, budgetAmount: number, catDef?: CategoryDef) => {
    setMode('edit');
    setName(categoryName);
    setOriginalName(categoryName);
    setBudget(String(budgetAmount));
    setEmoji(catDef?.emoji || '📂');
    setColor(catDef?.color || '#6B7280');
    setShowModal(true);
  };

  const close = () => setShowModal(false);

  const save = async (opts: {
    month?: string;
    cycle_id?: number;
    context: 'shared' | 'personal';
    categoryBreakdown: Array<{ category: string; budget: number }>;
    categories: CategoryDef[];
    onSuccess: () => void;
  }) => {
    const trimmedName = name.trim();
    const amount = parseFloat(budget);
    if (!trimmedName) { showToast('Ponle un nombre a la categoría'); return; }
    const emojiVal = emoji.trim() || '📂';
    if (!Number.isFinite(amount) || amount <= 0) { showToast('Pon un límite válido para la categoría'); return; }

    const cats: Record<string, number> = {};
    opts.categoryBreakdown.forEach(cat => { cats[cat.category] = cat.budget; });
    if (mode === 'edit' && originalName !== trimmedName) delete cats[originalName];
    cats[trimmedName] = amount;

    try {
      const existingCat = opts.categories.find(c => c.name === originalName);
      await Api.saveCategory({
        id: mode === 'edit' && existingCat?.id ? existingCat.id : undefined,
        name: trimmedName,
        emoji: emojiVal,
        color,
        context: opts.context,
      });
      await Api.updateBudget({ month: opts.month, cycle_id: opts.cycle_id, categories: cats, context: opts.context });
      setShowModal(false);
      opts.onSuccess();
      showToast(mode === 'add' ? 'Categoría creada' : 'Categoría actualizada');
    } catch (error: any) {
      showToast(error?.message || 'Error al guardar la categoría');
    }
  };

  const remove = async (opts: {
    categories: CategoryDef[];
    onSuccess: () => void;
  }) => {
    const existingCat = opts.categories.find(c => c.name === originalName);
    if (!existingCat?.id) { showToast('No se puede eliminar esta categoría'); return; }
    try {
      await Api.deleteCategory(existingCat.id);
      setShowModal(false);
      opts.onSuccess();
      showToast('Categoría eliminada');
    } catch (error: any) {
      showToast(error?.message || 'Error al eliminar la categoría');
    }
  };

  return {
    showModal, mode, name, setName, originalName, budget, setBudget,
    emoji, setEmoji, color, setColor, colorOptions: COLOR_OPTIONS,
    openAdd, openEdit, close, save, remove,
  };
};
