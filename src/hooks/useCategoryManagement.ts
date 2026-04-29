import { useState, useEffect } from 'react';
import { Api } from '../api';
import { handleApiError } from '../lib/handleApiError';

export interface CategoryDef {
  id: number;
  name: string;
  emoji: string;
  color: string;
  budget_amount: number;
  iconBg?: string;
}

export const useCategoryManagement = (context: 'shared' | 'personal' = 'shared') => {
  const [categories, setCategories] = useState<CategoryDef[]>([]);

  const loadCategories = () => {
    Api.getCategories(context)
      .then((data: CategoryDef[]) => {
        setCategories(data.map(c => ({
          ...c,
          color: c.color ?? '#60A5FA',
          iconBg: c.iconBg ?? (c.color ? `${c.color}1A` : 'var(--gl)'),
        })));
      })
      .catch((err) => {
        handleApiError(err, 'Error al cargar categorías', { silent: true });
        setCategories([]);
      });
  };

  useEffect(() => { loadCategories(); }, [context]);

  const getCategoryDef = (name: string) =>
    categories.find(c => c.name === name);

  return { categories, setCategories, getCategoryDef, reloadCategories: loadCategories };
};
