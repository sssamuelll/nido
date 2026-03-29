import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { Clock, Download, LogOut, Lock, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../components/Button';

interface BudgetData {
  id?: number;
  month: string;
  shared_available: number;
  personal_budget: number;
  pending_approval?: {
    id: number;
    shared_available: number;
    requested_by_user_id: number;
    requested_by_username?: string;
  };
  categories: Record<string, number>;
}

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; username: string }>>([]);
  const [currentCycle, setCurrentCycle] = useState<{
    id: number;
    month: string;
    status: 'pending' | 'active' | 'closed';
    requested_by_user_id: number;
    requested_by_username?: string;
    approved_by_user_id?: number;
    started_at?: string;
  } | null>(null);
  const [cycleLoading, setCycleLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadCycle = async () => {
    try {
      setCycleLoading(true);
      const cycle = await Api.getCurrentCycle();
      setCurrentCycle(cycle);
    } catch {
      // No cycle is fine, just ignore
      setCurrentCycle(null);
    } finally {
      setCycleLoading(false);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [budgetData, membersData] = await Promise.all([
        Api.getBudget(currentMonth),
        Api.getMembers()
      ]);

      if (budgetData.pending_approval && budgetData.pending_approval.requested_by_user_id === user?.id) {
        budgetData.shared_available = budgetData.pending_approval.shared_available;
      }

      setBudget(budgetData);
      setMembers(membersData);
      await loadCycle();
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
        setToast({ type: 'success', msg: 'Presupuesto guardado' });
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
      setToast({ type: 'success', msg: 'Presupuesto aprobado' });
      loadData();
    } catch {
      setToast({ type: 'error', msg: 'Error al aprobar' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestCycle = async () => {
    if (!confirm('¿Reiniciar ciclo mensual? Los gastos recurrentes se activarán una vez tu pareja apruebe.')) return;
    try {
      setSaving(true);
      await Api.requestCycle();
      setToast({ type: 'success', msg: 'Ciclo solicitado. Esperando aprobación.' });
      loadCycle();
    } catch (error: any) {
      setToast({ type: 'error', msg: error.message || 'Error al solicitar ciclo' });
    } finally {
      setSaving(false);
    }
  };

  const handleApproveCycle = async () => {
    if (!currentCycle) return;
    if (!confirm('¿Aprobar ciclo de facturación? Se registrarán los gastos recurrentes.')) return;
    try {
      setSaving(true);
      await Api.approveCycle(currentCycle.id);
      setToast({ type: 'success', msg: 'Ciclo aprobado. Gastos recurrentes registrados.' });
      loadCycle();
    } catch (error: any) {
      setToast({ type: 'error', msg: error.message || 'Error al aprobar ciclo' });
    } finally {
      setSaving(false);
    }
  };

  const exportToCSV = async () => {
    try {
      const expenses = await Api.getExpenses(currentMonth);
      const csv = [
        'Fecha,Descripción,Cantidad,Categoría,Pagado por,Tipo',
        ...expenses.map((e: { date: string; description: string; amount: number; category: string; paid_by: string; type: string }) =>
          `${e.date},"${e.description}",${e.amount},${e.category},${e.paid_by},${e.type}`
        )
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `nido-${currentMonth}.csv`;
      link.click();
      setToast({ type: 'success', msg: 'CSV descargado' });
    } catch {
      setToast({ type: 'error', msg: 'Error al exportar' });
    }
  };

  if (loading || !budget) {
    return (
      <div className="settings">
        <div className="skeleton settings__skeleton-title" />
        <div className="settings__columns">
          <div className="settings__col-left">
            <div className="skeleton settings__skeleton-card" />
          </div>
          <div className="settings__col-right">
            <div className="skeleton settings__skeleton-card" />
          </div>
        </div>
      </div>
    );
  }

  const formatDisplayName = (username?: string) => {
    if (!username) return 'Pareja';
    if (username === 'maria') return 'María';
    if (username === 'samuel') return 'Samuel';
    return username;
  };

  const partner = members.find(m => m.id !== user?.id);
  const partnerName = formatDisplayName(partner?.username);
  const requesterName = formatDisplayName(budget.pending_approval?.requested_by_username);
  const isPendingByMe = budget.pending_approval?.requested_by_user_id === user?.id;

  return (
    <div className="settings">
      {/* Toast */}
      {toast && (
        <div className={`settings__toast settings__toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Header — topbar pattern matching design reference */}
      <div className="topbar an d1">
        <div>
          <h1>Configuración</h1>
          <p>Ajustes del hogar</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* LEFT COLUMN: Budget */}
        <div>
          <div className="card settings-section an d2">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              {' '}Presupuesto Mensual
            </h3>

            <div className="form-row-s">
              <label>Presupuesto compartido</label>
              <span style={{ color: 'var(--tm)' }}>{'\u20AC'}</span>
              <input
                className="form-input-s"
                type="number"
                value={budget.shared_available === 0 ? '' : budget.shared_available}
                onChange={e => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setBudget({ ...budget, shared_available: val });
                }}
                placeholder="0"
              />
            </div>
            <div style={{ fontSize: '12px', color: 'var(--tm)', margin: '4px 0 16px 0' }}>
              Cambios requieren aprobación de {partnerName}
            </div>

            {/* Pending approval banner — orange background with clock icon */}
            {budget.pending_approval && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 14px', borderRadius: 'var(--rx)',
                background: 'var(--ol)', fontSize: '13px', color: '#FBBF24',
                marginBottom: '16px'
              }}>
                <Clock size={14} />
                {isPendingByMe
                  ? `Pendiente — Esperando aprobación de ${partnerName}`
                  : `${requesterName} solicita cambiar el presupuesto a €${budget.pending_approval.shared_available}`}
              </div>
            )}

            {!isPendingByMe && budget.pending_approval && (
              <button className="btn btn-primary btn-sm" style={{ marginBottom: '16px' }} onClick={handleApproveBudget} disabled={saving}>
                Aprobar cambio
              </button>
            )}

            <div className="form-row-s">
              <label>Tu disponible personal</label>
              <span style={{ color: 'var(--tm)' }}>{'\u20AC'}</span>
              <input
                className="form-input-s"
                type="number"
                value={budget.personal_budget === 0 ? '' : budget.personal_budget}
                onChange={e => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setBudget({ ...budget, personal_budget: val });
                }}
                placeholder="0"
              />
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: '16px' }}
              disabled={saving}
              onClick={() => {
                if (budget.shared_available < 100 || budget.personal_budget < 100) {
                  setToast({ type: 'error', msg: 'Los montos deben ser de al menos 3 dígitos' });
                  return;
                }
                handleSaveBudget();
              }}
            >
              {saving ? 'Guardando...' : 'Guardar presupuesto'}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Security + Tools + Danger */}
        <div>
          {/* Security — PIN dots matching design reference */}
          <div className="card settings-section an d4">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              {' '}Seguridad
            </h3>
            <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>PIN de acceso</div>
            <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '12px' }}>Código de 4 dígitos</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div className="pin-dot">&bull;</div>
              <div className="pin-dot">&bull;</div>
              <div className="pin-dot">&bull;</div>
              <div className="pin-dot">&bull;</div>
              <button className="btn btn-outline btn-sm" style={{ marginLeft: '8px' }}>Cambiar</button>
            </div>
          </div>

          {/* Tools — Exportar datos + Cerrar sesión */}
          <div className="card settings-section an d5">
            <h3>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {' '}Herramientas
            </h3>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border2)', cursor: 'pointer' }}
              onClick={exportToCSV}
            >
              <svg width="18" height="18" fill="none" stroke="var(--ts)" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Exportar datos</div>
                <div style={{ fontSize: '12px', color: 'var(--tm)' }}>Descargar gastos en CSV</div>
              </div>
            </div>

            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', cursor: 'pointer' }}
              onClick={() => logout()}
            >
              <svg width="18" height="18" fill="none" stroke="var(--ts)" viewBox="0 0 24 24" strokeWidth={2}>
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500 }}>Cerrar sesión</div>
                <div style={{ fontSize: '12px', color: 'var(--tm)' }}>Salir de tu cuenta</div>
              </div>
            </div>
          </div>

          {/* Billing cycle — restart monthly cycle with partner approval */}
          <div className="card settings-section an d5">
            <h3>
              <RefreshCw size={18} />
              {' '}Ciclo mensual
            </h3>

            {cycleLoading ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--tm)' }}>Cargando ciclo...</div>
            ) : currentCycle ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  Estado: {currentCycle.status === 'pending' ? '🟡 Pendiente' : '🟢 Activo'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '12px' }}>
                  {currentCycle.status === 'pending'
                    ? `Solicitado por ${currentCycle.requested_by_username || 'tu pareja'}`
                    : `Ciclo activo desde ${new Date(currentCycle.started_at || '').toLocaleDateString('es-ES')}`}
                </div>

                {currentCycle.status === 'pending' && currentCycle.requested_by_user_id !== user?.id && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginBottom: '8px' }}
                    onClick={handleApproveCycle}
                    disabled={saving}
                  >
                    Aprobar ciclo
                  </button>
                )}
                {currentCycle.status === 'pending' && currentCycle.requested_by_user_id === user?.id && (
                  <div style={{ fontSize: '12px', color: '#FBBF24' }}>
                    Esperando aprobación de {partnerName}
                  </div>
                )}
                {currentCycle.status === 'active' && (
                  <div style={{ fontSize: '12px', color: 'var(--green)' }}>
                    Ciclo activo. Los gastos recurrentes ya están registrados.
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', marginBottom: '12px' }}>
                  No hay ciclo activo para este mes.
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRequestCycle}
                  disabled={saving}
                >
                  Reiniciar ciclo
                </button>
                <div style={{ fontSize: '11px', color: 'var(--tm)', marginTop: '8px' }}>
                  Requiere aprobación de ambos. Se registrarán los gastos recurrentes.
                </div>
              </div>
            )}
          </div>

          {/* Billing cycle — restart requires both approvals */}
          <div className="card settings-section an d5">
            <h3>
              <RefreshCw size={18} />
              {' '}Ciclo de facturación
            </h3>
            {cycleLoading ? (
              <div>Cargando...</div>
            ) : currentCycle ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                  {currentCycle.status === 'active' ? 'Ciclo activo' : currentCycle.status === 'pending' ? 'Pendiente de aprobación' : 'Cerrado'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '12px' }}>
                  {currentCycle.status === 'active' ? `Iniciado el ${format(new Date(currentCycle.started_at || ''), 'dd/MM/yyyy')}` :
                   currentCycle.status === 'pending' ? `Solicitado por ${currentCycle.requested_by_username === user?.username ? 'ti' : currentCycle.requested_by_username}` :
                   'Finalizado'}
                </div>
                {currentCycle.status === 'pending' && currentCycle.requested_by_user_id !== user?.id && (
                  <button className="btn btn-primary btn-sm" onClick={handleApproveCycle} disabled={saving}>
                    {saving ? 'Aprobando...' : 'Aprobar ciclo'}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>No hay ciclo activo</div>
                <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '12px' }}>
                  Un ciclo registra los gastos recurrentes mensuales.
                </div>
                <button className="btn btn-primary btn-sm" onClick={handleRequestCycle} disabled={saving}>
                  {saving ? 'Solicitando...' : 'Solicitar nuevo ciclo'}
                </button>
              </div>
            )}
          </div>

          {/* Danger zone — only delete button, no duplicate logout */}
          <div className="danger-zone an d6">
            <h4>Zona de peligro</h4>
            <p>Estas acciones son permanentes y no se pueden deshacer.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => window.confirm('¿Estás seguro de que quieres borrar todos tus datos?')}
              >
                Borrar todos los datos
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
