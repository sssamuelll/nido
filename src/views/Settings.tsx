import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { OWNER_THEMES, type Owner } from '../types';
import { Plus, Trash2, Check, X, AlertCircle, Download, LogOut, Shield, Key } from 'lucide-react';
import { Button } from '../components/Button';
import { InputField } from '../components/InputField';

interface Category {
  id: number;
  name: string;
  emoji: string;
  color: string;
}

interface BudgetData {
  id?: number;
  month: string;
  shared_available: number;
  personal_budget: number;
  pending_approval?: {
    id: number;
    shared_available: number;
    requested_by: string;
  };
  categories: Record<string, number>;
}

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  
  // Category editor state
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  useEffect(() => { 
    loadData(); 
  }, [currentMonth]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [budgetData, categoriesData] = await Promise.all([
        Api.getBudget(currentMonth),
        Api.getCategories()
      ]);
      setBudget(budgetData);
      setCategories(categoriesData);
    } catch {
      setToast({ type: 'error', msg: 'Error al cargar datos' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBudget = async () => {
    if (!budget) return;
    try {
      setSaving(true);
      const res = await Api.updateBudget({
        month: currentMonth,
        shared_available: budget.shared_available,
        personal_budget: budget.personal_budget,
        categories: budget.categories
      });
      
      if (res.pending_approval) {
        setToast({ type: 'success', msg: 'Petición enviada a tu pareja' });
      } else {
        setToast({ type: 'success', msg: '✓ Presupuesto guardado' });
      }
      loadData();
    } catch {
      setToast({ type: 'error', msg: 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveBudget = async () => {
    if (!budget?.pending_approval) return;
    try {
      setSaving(true);
      await Api.approveBudget(budget.pending_approval.id);
      setToast({ type: 'success', msg: '✓ Presupuesto aprobado' });
      loadData();
    } catch {
      setToast({ type: 'error', msg: 'Error al aprobar' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async () => {
    if (!editingCategory?.name) return;
    try {
      await Api.saveCategory(editingCategory);
      setEditingCategory(null);
      loadData();
      setToast({ type: 'success', msg: '✓ Categoría guardada' });
    } catch {
      setToast({ type: 'error', msg: 'Error al guardar categoría' });
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm('¿Borrar esta categoría?')) return;
    try {
      await Api.deleteCategory(id);
      loadData();
    } catch {
      setToast({ type: 'error', msg: 'Error al borrar' });
    }
  };

  const handlePinSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) return;
    try {
      setPinLoading(true);
      await Api.updatePin(newPin);
      setToast({ type: 'success', msg: '✓ PIN actualizado' });
      setNewPin('');
    } catch {
      setToast({ type: 'error', msg: 'Error al actualizar PIN' });
    } finally {
      setPinLoading(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const expenses = await Api.getExpenses(currentMonth);
      const csv = [
        'Fecha,Descripción,Cantidad,Categoría,Pagado por,Tipo',
        ...expenses.map((e: any) =>
          `${e.date},"${e.description}",${e.amount},${e.category},${e.paid_by},${e.type}`
        )
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `nido-${currentMonth}.csv`;
      link.click();
      setToast({ type: 'success', msg: '✓ CSV descargado' });
    } catch {
      setToast({ type: 'error', msg: 'Error al exportar' });
    }
  };

  if (loading || !budget) {
    return (
      <div className="settings__loading">
        <div className="skeleton" style={{ height: 40, width: 200, marginBottom: 24 }} />
        <div className="settings__grid">
          <div className="skeleton" style={{ height: 300 }} />
          <div className="skeleton" style={{ height: 300 }} />
        </div>
      </div>
    );
  }

  const isOwner = (name: string) => user?.username === name;
  const partnerName = isOwner('samuel') ? 'María' : 'Samuel';

  return (
    <div className="settings">
      {toast && (
        <div className={`toast toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      <div className="settings__header">
        <h1 className="settings__title">Configuración</h1>
        <div className="settings__month-nav">
          <button onClick={() => {
            const [y, m] = currentMonth.split('-').map(Number);
            const d = new Date(y, m - 2, 1);
            setCurrentMonth(format(d, 'yyyy-MM'));
          }}>‹</button>
          <span>{format(new Date(currentMonth + '-01'), 'MMMM yyyy')}</span>
          <button onClick={() => {
            const [y, m] = currentMonth.split('-').map(Number);
            const d = new Date(y, m, 1);
            setCurrentMonth(format(d, 'yyyy-MM'));
          }}>›</button>
        </div>
      </div>

      <div className="settings__grid">
        {/* Budget Section */}
        <section className="settings__card">
          <div className="settings__card-header">
            <h2 className="settings__card-title">Presupuesto Mensual</h2>
            <AlertCircle size={18} color="var(--color-text-tertiary)" />
          </div>

          <div className="settings__fields">
            <div className="settings__field-group">
              <label>Disponible compartido</label>
              <div className="settings__input-row">
                <input 
                  type="number" 
                  value={budget.shared_available}
                  onChange={e => setBudget({...budget, shared_available: parseFloat(e.target.value) || 0})}
                />
                <span className="settings__currency">€</span>
              </div>
              <p className="settings__help">Cambios requieren aprobación de {partnerName}</p>
            </div>

            <div className="settings__field-group">
              <label>Tu disponible personal</label>
              <div className="settings__input-row">
                <input 
                  type="number" 
                  value={budget.personal_budget}
                  onChange={e => setBudget({...budget, personal_budget: parseFloat(e.target.value) || 0})}
                />
                <span className="settings__currency">€</span>
              </div>
            </div>
          </div>

          {budget.pending_approval && (
            <div className="settings__pending">
              <div className="settings__pending-info">
                <strong>Pendiente de aprobación</strong>
                <p>
                  {budget.pending_approval.requested_by === user?.username 
                    ? `Esperando a que ${partnerName} apruebe €${budget.pending_approval.shared_available}`
                    : `${partnerName} solicita cambiar el presupuesto a €${budget.pending_approval.shared_available}`}
                </p>
              </div>
              {budget.pending_approval.requested_by !== user?.username && (
                <div className="settings__pending-actions">
                  <Button label="Aprobar" size="sm" onClick={handleApproveBudget} disabled={saving} />
                </div>
              )}
            </div>
          )}

          <Button 
            label={saving ? 'Guardando...' : 'Guardar Presupuesto'} 
            fullWidth 
            onClick={handleSaveBudget}
            disabled={saving}
          />
        </section>

        {/* Categories Section */}
        <section className="settings__card">
          <div className="settings__card-header">
            <h2 className="settings__card-title">Categorías Configurables</h2>
            <button className="settings__add-btn" onClick={() => setEditingCategory({ name: '', emoji: '🦋', color: '#a89e94' })}>
              <Plus size={18} />
            </button>
          </div>

          <div className="settings__category-list">
            {categories.map(cat => (
              <div key={cat.id} className="settings__category-item">
                <div className="settings__category-info">
                  <span className="settings__category-emoji">{cat.emoji}</span>
                  <span className="settings__category-name">{cat.name}</span>
                </div>
                <div className="settings__category-actions">
                  <button onClick={() => setEditingCategory(cat)}><X size={14} /></button>
                  <button className="settings__delete-btn" onClick={() => handleDeleteCategory(cat.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>

          {editingCategory && (
            <div className="settings__modal">
              <div className="settings__modal-content">
                <h3>{editingCategory.id ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
                <InputField 
                  label="Nombre" 
                  value={editingCategory.name} 
                  onChange={v => setEditingCategory({...editingCategory, name: v})} 
                />
                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                  <InputField 
                    label="Emoji" 
                    value={editingCategory.emoji} 
                    onChange={v => setEditingCategory({...editingCategory, emoji: v})} 
                  />
                  <InputField 
                    label="Color" 
                    type="color"
                    value={editingCategory.color} 
                    onChange={v => setEditingCategory({...editingCategory, color: v})} 
                  />
                </div>
                <div className="settings__modal-actions">
                  <Button label="Cancelar" variant="maria" onClick={() => setEditingCategory(null)} />
                  <Button label="Guardar" onClick={handleSaveCategory} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Security Section */}
        <section className="settings__card">
          <div className="settings__card-header">
            <h2 className="settings__card-title">Seguridad</h2>
            <Shield size={18} color="var(--color-text-tertiary)" />
          </div>
          <form onSubmit={handlePinSave} className="settings__pin-form">
            <label>Cambiar PIN de acceso</label>
            <div className="settings__pin-input">
              <Key size={16} />
              <input 
                type="password" 
                maxLength={4} 
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="****"
              />
              <Button label="Actualizar" size="sm" disabled={newPin.length !== 4 || pinLoading} />
            </div>
          </form>
        </section>

        {/* Tools Section */}
        <section className="settings__card">
          <div className="settings__card-header">
            <h2 className="settings__card-title">Herramientas</h2>
          </div>
          <div className="settings__tool-buttons">
            <button className="settings__tool-btn" onClick={exportToCSV}>
              <Download size={18} />
              <span>Exportar datos a CSV</span>
            </button>
            <button className="settings__tool-btn settings__tool-btn--danger" onClick={() => logout()}>
              <LogOut size={18} />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
