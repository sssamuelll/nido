import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { OWNER_THEMES, type Owner } from '../types';
import { Plus, Trash2, Check, X, AlertCircle, Download, LogOut, Shield, Key, Lock, Bell, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const navigateMonth = (dir: -1 | 1) => {
    const [y, m] = currentMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setCurrentMonth(format(d, 'yyyy-MM'));
  };

  const formatMonthName = (monthStr: string) => {
    const [year, month] = monthStr.split('-');
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${months[parseInt(month) - 1]} ${year}`;
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
      <div className="settings">
        <div className="skeleton" style={{ height: 60, width: 240, marginBottom: 32 }} />
        <div className="settings__columns">
          <div className="settings__col-left">
            <div className="skeleton" style={{ height: 400 }} />
          </div>
          <div className="settings__col-right">
            <div className="skeleton" style={{ height: 400 }} />
          </div>
        </div>
      </div>
    );
  }

  const partnerName = user?.username === 'samuel' ? 'María' : 'Samuel';

  return (
    <div className="settings">
      {/* Toast */}
      {toast && (
        <div className={`toast toast--${toast.type}`} style={{
          position: 'fixed', top: 24, right: 24, zIndex: 1000,
          background: toast.type === 'success' ? 'var(--color-samuel)' : 'var(--color-danger)',
          color: '#fff', padding: '12px 20px', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-neu-lg)'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="settings__header" style={{ marginBottom: 32 }}>
        <div className="settings__subtitle">Ajustes del hogar</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 className="settings__title">Configuración</h1>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => navigateMonth(-1)} className="btn btn--sm" style={{ padding: '8px' }}>
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, minWidth: 100, textAlign: 'center' }}>
              {formatMonthName(currentMonth)}
            </span>
            <button onClick={() => navigateMonth(1)} className="btn btn--sm" style={{ padding: '8px' }}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      <div className="settings__columns">
        {/* Left Column: Budget & Categories */}
        <div className="settings__col-left">
          
          {/* Budget Card */}
          <div className="settings__card">
            <div className="settings__card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Lock size={18} /> Presupuesto Mensual
            </div>
            
            <div className="settings__row">
              <div>
                <div className="settings__row-label">Disponible compartido</div>
                <div className="settings__row-desc">Cambios requieren aprobación de {partnerName}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.5 }}>€</span>
                <input 
                  type="number" 
                  className="input-field__input"
                  style={{ width: 100, textAlign: 'right', background: 'var(--color-bg)', padding: '8px', borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-neu-xs)' }}
                  value={budget.shared_available}
                  onChange={e => setBudget({...budget, shared_available: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>

            <div className="settings__row">
              <div>
                <div className="settings__row-label">Tu disponible personal</div>
                <div className="settings__row-desc">Presupuesto para tus gastos privados</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.5 }}>€</span>
                <input 
                  type="number" 
                  className="input-field__input"
                  style={{ width: 100, textAlign: 'right', background: 'var(--color-bg)', padding: '8px', borderRadius: '8px', border: 'none', boxShadow: 'var(--shadow-neu-xs)' }}
                  value={budget.personal_budget}
                  onChange={e => setBudget({...budget, personal_budget: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>

            {budget.pending_approval && (
              <div style={{ margin: '16px 24px', padding: '16px', borderRadius: '16px', background: 'rgba(124, 181, 232, 0.1)', border: '1px dashed var(--color-shared)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <AlertCircle size={16} color="var(--color-shared)" />
                  <strong style={{ fontSize: 13, color: 'var(--color-shared)' }}>Cambio pendiente</strong>
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  {budget.pending_approval.requested_by === user?.username 
                    ? `Esperando aprobación de ${partnerName} para €${budget.pending_approval.shared_available}`
                    : `${partnerName} solicita cambiar el presupuesto a €${budget.pending_approval.shared_available}`}
                </p>
                {budget.pending_approval.requested_by !== user?.username && (
                  <Button label="Aprobar cambio" size="sm" variant="shared" onClick={handleApproveBudget} disabled={saving} />
                )}
              </div>
            )}

            <div style={{ padding: '16px 24px 24px' }}>
              <Button label={saving ? 'Guardando...' : 'Guardar presupuesto'} fullWidth onClick={handleSaveBudget} disabled={saving} />
            </div>
          </div>

          {/* Categories Card */}
          <div className="settings__card">
            <div className="settings__card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Plus size={18} /> Categorías
              </div>
              <button onClick={() => setEditingCategory({ name: '', emoji: '🦋', color: '#a89e94' })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-samuel)' }}>
                <Plus size={20} />
              </button>
            </div>

            <div style={{ padding: '8px 0' }}>
              {categories.map(cat => (
                <div key={cat.id} className="settings__row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 20 }}>{cat.emoji}</span>
                    <div>
                      <div className="settings__row-label">{cat.name}</div>
                      <div className="settings__row-desc" style={{ color: cat.color }}>Color: {cat.color}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setEditingCategory(cat)} className="btn btn--sm" style={{ padding: '6px' }}><Shield size={14} /></button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="btn btn--sm" style={{ padding: '6px', color: 'var(--color-danger)' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Security & Tools */}
        <div className="settings__col-right">
          
          {/* PIN Card */}
          <div className="settings__card">
            <div className="settings__card-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Key size={18} /> Seguridad
            </div>
            <div className="settings__row">
              <div style={{ flex: 1 }}>
                <div className="settings__row-label">PIN de acceso</div>
                <div className="settings__row-desc">Código de 4 dígitos para acceso rápido</div>
              </div>
            </div>
            <form onSubmit={handlePinSave} style={{ padding: '0 24px 24px', display: 'flex', gap: 12 }}>
              <input 
                type="password" 
                maxLength={4} 
                className="input-field__input"
                style={{ flex: 1, letterSpacing: 8, textAlign: 'center', fontSize: 18, background: 'var(--color-bg)', border: 'none', boxShadow: 'var(--shadow-neu-xs)', borderRadius: 12 }}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="****"
              />
              <Button label="Cambiar" disabled={newPin.length !== 4 || pinLoading} />
            </form>
          </div>

          {/* Tools Card */}
          <div className="settings__card">
            <div className="settings__card-title">Herramientas</div>
            
            <div className="settings__row" style={{ cursor: 'pointer' }} onClick={exportToCSV}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Download size={18} color="var(--color-text-tertiary)" />
                <div>
                  <div className="settings__row-label">Exportar datos</div>
                  <div className="settings__row-desc">Descargar gastos en formato CSV</div>
                </div>
              </div>
            </div>

            <div className="settings__row" style={{ cursor: 'pointer', borderBottom: 'none' }} onClick={() => logout()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <LogOut size={18} color="var(--color-danger)" />
                <div>
                  <div className="settings__row-label" style={{ color: 'var(--color-danger)' }}>Cerrar sesión</div>
                  <div className="settings__row-desc">Salir de tu cuenta en este dispositivo</div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Footer */}
          <div style={{ padding: '0 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              NIDO v1.2 · 2026
            </p>
          </div>
        </div>
      </div>

      {/* Category Modal */}
      {editingCategory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 20 }}>
          <div className="settings__card" style={{ width: '100%', maxWidth: 400, padding: '32px' }}>
            <h3 style={{ marginBottom: 24, fontFamily: 'var(--font-display)', fontSize: 20 }}>{editingCategory.id ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <InputField label="Nombre" value={editingCategory.name} onChange={v => setEditingCategory({...editingCategory, name: v})} />
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}><InputField label="Emoji" value={editingCategory.emoji} onChange={v => setEditingCategory({...editingCategory, emoji: v})} /></div>
                <div style={{ width: 80 }}><InputField label="Color" type="color" value={editingCategory.color} onChange={v => setEditingCategory({...editingCategory, color: v})} /></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <Button label="Cancelar" variant="maria" fullWidth onClick={() => setEditingCategory(null)} />
              <Button label="Guardar" fullWidth onClick={handleSaveCategory} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
