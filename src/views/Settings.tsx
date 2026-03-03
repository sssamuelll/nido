import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';

interface BudgetData {
  month: string;
  total_budget: number;
  rent: number;
  savings: number;
  personal_samuel: number;
  personal_maria: number;
  categories: Record<string, number>;
}

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [budget, setBudget] = useState<BudgetData>({
    month: currentMonth,
    total_budget: 2800,
    rent: 335,
    savings: 300,
    personal_samuel: 500,
    personal_maria: 500,
    categories: {}
  });

  const [saving, setSaving] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => { loadBudget(); }, [currentMonth]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadBudget = async () => {
    try {
      setLoading(true);
      const data = await Api.getBudget(currentMonth);
      setBudget(data);
    } catch {
      setToast({ type: 'error', msg: 'Error al cargar presupuesto' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e?.preventDefault();
    if (budget.total_budget <= 0) {
      setToast({ type: 'error', msg: 'Total debe ser mayor a 0' });
      return;
    }
    try {
      setSaving(true);
      await Api.updateBudget(budget);
      setToast({ type: 'success', msg: '✓ Presupuesto guardado' });
    } catch {
      setToast({ type: 'error', msg: 'Error al guardar' });
    } finally {
      setSaving(false);
    }
  };

  const handlePinSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      setToast({ type: 'error', msg: 'El PIN debe ser de 4 dígitos' });
      return;
    }

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

  const updateField = (field: keyof BudgetData, value: string) => {
    if (field === 'categories') return;
    setBudget({ ...budget, [field]: parseFloat(value) || 0 });
  };

  const updateCategoryBudget = (category: string, value: string) => {
    setBudget({
      ...budget,
      categories: {
        ...budget.categories,
        [category]: parseFloat(value) || 0
      }
    });
  };

  const available = budget.total_budget - budget.rent - budget.savings - budget.personal_samuel - budget.personal_maria;

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

  if (loading) {
    return (
      <div className="page-container">
        <div className="main-content">
          <div className="skeleton-loader">
            <div className="skeleton-block skeleton-header" />
            <div className="skeleton-block skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="main-content">
        {/* Toast */}
        {toast && (
          <div className={`toast toast-${toast.type}`}>
            {toast.msg}
          </div>
        )}

        <div className="dashboard-header">
          <div>
            <div className="dashboard-greeting" style={{ fontSize: '1.25rem' }}>Configuración</div>
          </div>
        </div>

        {/* General Budget */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Presupuesto General</h2>
            <div className="month-nav" style={{ gap: '0.25rem' }}>
              <button className="month-nav-btn" onClick={() => navigateMonth(-1)} style={{ width: 28, height: 28, fontSize: '1rem' }}>‹</button>
              <span className="text-sm text-secondary" style={{ padding: '0 0.25rem' }}>{formatMonthName(currentMonth)}</span>
              <button className="month-nav-btn" onClick={() => navigateMonth(1)} style={{ width: 28, height: 28, fontSize: '1rem' }}>›</button>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div className="settings-grid">
              <div className="settings-field">
                <label className="settings-label">Total</label>
                <div className="settings-input-wrap">
                  <span className="settings-input-prefix">€</span>
                  <input type="number" step="0.01" className="settings-input" value={budget.total_budget}
                    onChange={(e) => updateField('total_budget', e.target.value)} disabled={saving} />
                </div>
              </div>
              <div className="settings-field">
                <label className="settings-label">Alquiler</label>
                <div className="settings-input-wrap">
                  <span className="settings-input-prefix">€</span>
                  <input type="number" step="0.01" className="settings-input" value={budget.rent}
                    onChange={(e) => updateField('rent', e.target.value)} disabled={saving} />
                </div>
              </div>
              <div className="settings-field">
                <label className="settings-label">Ahorros</label>
                <div className="settings-input-wrap">
                  <span className="settings-input-prefix">€</span>
                  <input type="number" step="0.01" className="settings-input" value={budget.savings}
                    onChange={(e) => updateField('savings', e.target.value)} disabled={saving} />
                </div>
              </div>
              <div className="settings-field">
                <label className="settings-label">Samuel</label>
                <div className="settings-input-wrap">
                  <span className="settings-input-prefix">€</span>
                  <input type="number" step="0.01" className="settings-input" value={budget.personal_samuel}
                    onChange={(e) => updateField('personal_samuel', e.target.value)} disabled={saving} />
                </div>
              </div>
              <div className="settings-field">
                <label className="settings-label">María</label>
                <div className="settings-input-wrap">
                  <span className="settings-input-prefix">€</span>
                  <input type="number" step="0.01" className="settings-input" value={budget.personal_maria}
                    onChange={(e) => updateField('personal_maria', e.target.value)} disabled={saving} />
                </div>
              </div>
            </div>

            <div className="settings-available">
              <span>Disponible compartido</span>
              <span className={`font-bold ${available >= 0 ? 'text-success' : 'text-error'}`}>
                €{available.toFixed(2)}
              </span>
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%' }}>
              {saving ? 'Guardando...' : 'Guardar presupuesto'}
            </button>
          </form>
        </div>

        {/* Category Budgets */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Límites por Categoría</h2>
          </div>
          <div className="settings-grid">
            {['Restaurant', 'Gastos', 'Servicios', 'Ocio', 'Inversión', 'Otros'].map(cat => (
              <div key={cat} className="settings-field">
                <label className="settings-label">{cat}</label>
                <div className="settings-input-wrap">
                  <span className="settings-input-prefix">€</span>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="settings-input" 
                    value={budget.categories[cat] || 0}
                    onChange={(e) => updateCategoryBudget(cat, e.target.value)}
                    disabled={saving} 
                  />
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => handleSave(null as any)} className="btn btn-secondary mt-4" disabled={saving} style={{ width: '100%' }}>
            {saving ? 'Guardando...' : 'Guardar límites'}
          </button>
        </div>

        {/* Security / PIN */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Seguridad</h2>
          </div>
          <form onSubmit={handlePinSave}>
            <div className="settings-field">
              <label className="settings-label">Nuevo PIN de acceso</label>
              <div className="settings-input-wrap">
                <span className="settings-input-prefix">🔢</span>
                <input 
                  type="password" 
                  maxLength={4} 
                  inputMode="numeric"
                  className="settings-input" 
                  placeholder="****"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  disabled={pinLoading}
                />
              </div>
              <p className="text-xs text-secondary mt-1">PIN de 4 dígitos para acceso rápido</p>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={pinLoading || newPin.length !== 4} style={{ width: '100%', marginTop: '0.5rem' }}>
              {pinLoading ? 'Cambiando...' : 'Cambiar PIN'}
            </button>
          </form>
        </div>

        {/* Quick Actions */}
        <div className="settings-actions">
          <button onClick={exportToCSV} className="settings-action-btn">
            <span>📥</span>
            <span>Exportar CSV</span>
          </button>
          <button onClick={() => logout()} className="settings-action-btn settings-action-danger">
            <span>👋</span>
            <span>Cerrar sesión</span>
          </button>
        </div>

        {/* About */}
        <div className="settings-footer">
          <div>🏠 Nido v1.0</div>
          <div>Hecho con ❤️ para Samuel y María</div>
        </div>
      </div>
    </div>
  );
};