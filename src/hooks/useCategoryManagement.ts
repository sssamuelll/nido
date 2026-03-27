import { useState, useEffect } from 'react';
import { Api } from '../api';

export interface CategoryDef {
  id?: number;
  name: string;
  emoji: string;
  color: string;
  iconBg?: string;
}

export const useCategoryManagement = () => {
  const [categories, setCategories] = useState<CategoryDef[]>([]);

  const loadCategories = () => {
    Api.getCategories()
      .then((data: CategoryDef[]) => {
        setCategories(data.map(c => ({
          ...c,
          color: c.color ?? '#60A5FA',
          iconBg: c.iconBg ?? (c.color ? `${c.color}1A` : 'var(--gl)'),
        })));
      })
      .catch(() => setCategories([]));
  };

  useEffect(() => { loadCategories(); }, []);

  const getCategoryDef = (name: string) =>
    categories.find(c => c.name === name);

  return { categories, setCategories, getCategoryDef, reloadCategories: loadCategories };
};
