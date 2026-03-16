import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { CATEGORIES } from '../types';

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
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [weeklyReportEnabled, setWeeklyReportEnabled] = useState(false);

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
      setBudget({
        month: currentMonth,
        total_budget: Number(data?.total_budget ?? 2800),
        rent: Number(data?.rent ?? 335),
        savings: Number(data?.savings ?? 300),
        personal_samuel: Number(data?.personal_samuel ?? 500),
        personal_maria: Number(data?.personal_maria ?? 500),
        categories: (data?.categories && typeof data.categories === 'object') ? data.categories : {}
      });
    } catch {
      setToast({ type: 'error', msg: 'Error al cargar presupuesto' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
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
      <>
        <div className="skeleton" style={{ height: 60 }} />
        <div style={{ display: 'flex', gap: 36 }}>
          <div className="skeleton" style={{ flex: 1, height: 400 }} />
          <div className="skeleton" style={{ width: 420, height: 400 }} />
        </div>
      </>
    );
  }

  const userName = user?.username === 'maria' ? 'María' : 'Samuel';
  const userInitials = user?.username === 'maria' ? 'MA' : 'SD';
  const userColor = user?.username === 'maria' ? 'var(--color-maria)' : 'var(--color-samuel)';

  return (
    <>
      {/* Toast */}
        {toast && (
          <div style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 1000,
            background: toast.type === 'success' ? 'var(--color-samuel)' : 'var(--color-danger)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div className="settings__header">
          <div className="settings__subtitle">Gestión</div>
          <div className="settings__title">Configuración</div>
        </div>

        <div className="settings__columns">
          {/* Left column */}
          <div className="settings__col-left">

            {/* Profile card */}
            <div className="settings__card">
              <div className="settings__card-title">Perfil</div>
              <div className="settings__row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: `linear-gradient(225deg, ${userColor}, ${userColor}80)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>
                      {userInitials}
                    </span>
                  </div>
                  <div>
                    <div className="settings__row-label">{userName}</div>
                    <div className="settings__row-desc">{user?.username}@nido.app</div>
                  </div>
                </div>
              </div>
              <div className="settings__row" style={{ borderBottom: 'none' }}>
                <div>
                  <div className="settings__row-label">Idioma</div>
                  <div className="settings__row-desc">Español</div>
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-tertiary)' }}>🇪🇸</span>
              </div>
            </div>

            {/* Budget General card */}
            <div className="settings__card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 4px' }}>
                <span className="settings__card-title" style={{ padding: 0 }}>Presupuesto General</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button
                    onClick={() => navigateMonth(-1)}
                    style={{ width: 28, height: 28, background: 'var(--color-bg)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    ‹
                  </button>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-secondary)', minWidth: 70, textAlign: 'center' }}>
                    {formatMonthName(currentMonth)}
                  </span>
                  <button
                    onClick={() => navigateMonth(1)}
                    style={{ width: 28, height: 28, background: 'var(--color-bg)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    ›
                  </button>
                </div>
              </div>
              <form onSubmit={handleSave}>
                {[
                  { key: 'total_budget', label: 'Total', desc: 'Presupuesto mensual total' },
                  { key: 'rent', label: 'Alquiler', desc: 'Gasto fijo mensual' },
                  { key: 'savings', label: 'Ahorros', desc: 'Meta de ahorro mensual' },
                  { key: 'personal_samuel', label: 'Samuel personal', desc: 'Gastos personales Samuel' },
                  { key: 'personal_maria', label: 'María personal', desc: 'Gastos personales María' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="settings__row">
                    <div>
                      <div className="settings__row-label">{label}</div>
                      <div className="settings__row-desc">{desc}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-tertiary)' }}>€</span>
                      <input
                        type="number"
                        step="0.01"
                        value={(budget as any)[key]}
                        onChange={e => updateField(key as keyof BudgetData, e.target.value)}
                        disabled={saving}
                        style={{
                          width: 90,
                          padding: '6px 10px',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-bg)',
                          boxShadow: 'var(--shadow-neu-xs)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          color: 'var(--color-text-primary)',
                          textAlign: 'right',
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="settings__row" style={{ borderBottom: 'none' }}>
                  <div>
                    <div className="settings__row-label">Disponible compartido</div>
                    <div className="settings__row-desc">Calculado automáticamente</div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 15,
                    fontWeight: 600,
                    color: available >= 0 ? 'var(--color-samuel)' : 'var(--color-danger)',
                  }}>
                    €{available.toFixed(2)}
                  </span>
                </div>
                <div style={{ padding: '12px 24px 20px' }}>
                  <button
                    type="submit"
                    className="btn btn--samuel btn--full"
                    disabled={saving}
                    style={{ '--btn-gradient': 'linear-gradient(180deg, #8bdc6b, #6bc98b)', '--btn-glow': 'rgba(139,220,107,0.25)' } as React.CSSProperties}
                  >
                    {saving ? 'Guardando...' : 'Guardar presupuesto'}
                  </button>
                </div>
              </form>
            </div>

            {/* Category Budgets card */}
            <div className="settings__card">
              <div className="settings__card-title">Límites por Categoría</div>
              {CATEGORIES.map(cat => (
                <div key={cat.id} className="settings__row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 18 }}>{cat.emoji}</span>
                    <div className="settings__row-label">{cat.name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-tertiary)' }}>€</span>
                    <input
                      type="number"
                      step="0.01"
                      value={budget.categories[cat.id] || 0}
                      onChange={e => updateCategoryBudget(cat.id, e.target.value)}
                      disabled={saving}
                      style={{
                        width: 90,
                        padding: '6px 10px',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--color-bg)',
                        boxShadow: 'var(--shadow-neu-xs)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: 'var(--color-text-primary)',
                        textAlign: 'right',
                      }}
                    />
                  </div>
                </div>
              ))}
              <div style={{ padding: '12px 24px 20px' }}>
                <button
                  onClick={() => handleSave()}
                  className="btn btn--shared btn--full"
                  disabled={saving}
                  style={{ '--btn-gradient': 'linear-gradient(180deg, #7cb5e8, #5a9ecc)', '--btn-glow': 'rgba(124,181,232,0.25)' } as React.CSSProperties}
                >
                  {saving ? 'Guardando...' : 'Guardar límites'}
                </button>
              </div>
            </div>

            {/* Notifications card */}
            <div className="settings__card">
              <div className="settings__card-title">Notificaciones</div>
              <div className="settings__row">
                <div>
                  <div className="settings__row-label">Alertas de gasto</div>
                  <div className="settings__row-desc">Recibe alertas cuando superes el presupuesto</div>
                </div>
                <button
                  className="settings__toggle"
                  onClick={() => setNotifEnabled(!notifEnabled)}
                  style={{ background: notifEnabled ? 'var(--color-samuel)' : 'var(--color-divider)' }}
                >
                  <div
                    className="settings__toggle-knob"
                    style={{ left: notifEnabled ? 22 : 2 }}
                  />
                </button>
              </div>
              <div className="settings__row" style={{ borderBottom: 'none' }}>
                <div>
                  <div className="settings__row-label">Resumen semanal</div>
                  <div className="settings__row-desc">Informe de gastos cada lunes</div>
                </div>
                <button
                  className="settings__toggle"
                  onClick={() => setWeeklyReportEnabled(!weeklyReportEnabled)}
                  style={{ background: weeklyReportEnabled ? 'var(--color-samuel)' : 'var(--color-divider)' }}
                >
                  <div
                    className="settings__toggle-knob"
                    style={{ left: weeklyReportEnabled ? 22 : 2 }}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="settings__col-right">

            {/* Partner card */}
            <div className="settings__card">
              <div className="settings__card-title">Pareja</div>
              <div className="settings__row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: user?.username === 'maria'
                      ? 'linear-gradient(225deg, #8bdc6b, #6bc98b)'
                      : 'linear-gradient(225deg, #ff8c6b, #e87c7c)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>
                      {user?.username === 'maria' ? 'SD' : 'MA'}
                    </span>
                  </div>
                  <div>
                    <div className="settings__row-label">
                      {user?.username === 'maria' ? 'Samuel' : 'María'}
                    </div>
                    <div className="settings__row-desc">Cuenta vinculada</div>
                  </div>
                </div>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-samuel)', display: 'inline-block' }} />
              </div>
              <div className="settings__row" style={{ borderBottom: 'none' }}>
                <div className="settings__row-label">Estado</div>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-samuel)', fontWeight: 500 }}>
                  Conectado
                </span>
              </div>
            </div>

            {/* PIN management */}
            <div className="settings__card">
              <div className="settings__card-title">Seguridad</div>
              <form onSubmit={handlePinSave}>
                <div className="settings__row">
                  <div>
                    <div className="settings__row-label">Nuevo PIN de acceso</div>
                    <div className="settings__row-desc">PIN de 4 dígitos para acceso rápido</div>
                  </div>
                </div>
                <div style={{ padding: '0 24px 16px', display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    maxLength={4}
                    inputMode="numeric"
                    placeholder="••••"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    disabled={pinLoading}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg)',
                      boxShadow: 'var(--shadow-neu-sm)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 20,
                      letterSpacing: 6,
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  <button
                    type="submit"
                    className="btn btn--samuel btn--sm"
                    disabled={pinLoading || newPin.length !== 4}
                    style={{ '--btn-gradient': 'linear-gradient(180deg, #8bdc6b, #6bc98b)', '--btn-glow': 'rgba(139,220,107,0.25)' } as React.CSSProperties}
                  >
                    {pinLoading ? '...' : 'Cambiar'}
                  </button>
                </div>
              </form>
            </div>

            {/* Data export */}
            <div className="settings__card">
              <div className="settings__card-title">Datos</div>
              <div className="settings__row" style={{ borderBottom: 'none' }}>
                <div>
                  <div className="settings__row-label">Exportar CSV</div>
                  <div className="settings__row-desc">Descarga tus gastos de {formatMonthName(currentMonth)}</div>
                </div>
                <button
                  onClick={exportToCSV}
                  className="btn btn--shared btn--sm"
                  style={{ '--btn-gradient': 'linear-gradient(180deg, #7cb5e8, #5a9ecc)', '--btn-glow': 'rgba(124,181,232,0.25)' } as React.CSSProperties}
                >
                  📥 Exportar
                </button>
              </div>
            </div>

            {/* Danger zone */}
            <div className="settings__danger-zone">
              <div className="settings__danger-title">Zona de peligro</div>
              <div className="settings__danger-text">
                Estas acciones son permanentes y no se pueden deshacer. Procede con cuidado.
              </div>
              <div className="settings__danger-actions">
                <button className="settings__danger-btn settings__danger-btn--outline">
                  Borrar datos
                </button>
                <button
                  className="settings__danger-btn settings__danger-btn--solid"
                  onClick={() => logout()}
                >
                  Cerrar sesión
                </button>
              </div>
            </div>

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '8px 0', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              🏠 Nido v1.0 · Hecho con ❤️ para Samuel y María
            </div>
          </div>
        </div>
    </>
  );
};
