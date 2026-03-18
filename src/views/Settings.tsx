import React, { useState, useEffect } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { format } from 'date-fns';
import { Plus, Trash2, AlertCircle, Download, LogOut, Key, Lock, Shield } from 'lucide-react';
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
    requested_by_user_id: number;
  };
  categories: Record<string, number>;
}

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [members, setMembers] = useState<any[]>([]);

  const [saving, setSaving] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
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

  const partner = members.find(m => m.id !== user?.id);
  const partnerName = partner ? (partner.username === 'maria' ? 'María' : partner.username === 'samuel' ? 'Samuel' : partner.username) : 'Pareja';
  const isPendingByMe = budget.pending_approval?.requested_by_user_id === user?.id;

  return (
    <div className="settings">
      {/* Toast */}
      {toast && (
        <div className={`settings__toast settings__toast--${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="settings__header">
        <div className="settings__subtitle">Ajustes del hogar</div>
        <h1 className="settings__title">Configuración</h1>
      </div>

      <div className="settings__columns">
        <div className="settings__col-left">
          
          {/* Budget Card */}
          <div className="settings__card">
            <div className="settings__card-title settings__card-title--flex">
              <Lock size={18} /> Presupuesto Mensual
            </div>
            
            <div className="settings__row">
              <div>
                <div className="settings__row-label">Presupuesto compartido</div>
                <div className="settings__row-desc">Cambios requieren aprobación de {partnerName}</div>
              </div>
              <div className="settings__budget-input-wrapper">
                <span className="settings__currency-symbol">€</span>
                <input 
                  type="number" 
                  className="settings__budget-input"
                  value={budget.shared_available === 0 ? '' : budget.shared_available}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    setBudget({...budget, shared_available: val});
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="settings__row">
              <div>
                <div className="settings__row-label">Tu disponible personal</div>
                <div className="settings__row-desc">Presupuesto para tus gastos privados</div>
              </div>
              <div className="settings__budget-input-wrapper">
                <span className="settings__currency-symbol">€</span>
                <input 
                  type="number" 
                  className="settings__budget-input"
                  value={budget.personal_budget === 0 ? '' : budget.personal_budget}
                  onChange={e => {
                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                    setBudget({...budget, personal_budget: val});
                  }}
                  placeholder="0"
                />
              </div>
            </div>

            {budget.pending_approval && (
              <div className="settings__pending-card">
                <div className="settings__pending-header">
                  <AlertCircle size={16} color="var(--color-shared)" />
                  <strong className="settings__pending-title">Cambio pendiente</strong>
                </div>
                <p className="settings__pending-desc">
                  {isPendingByMe 
                    ? `Esperando aprobación de ${partnerName} para €${budget.pending_approval.shared_available}`
                    : `${partnerName} solicita cambiar el presupuesto a €${budget.pending_approval.shared_available}`}
                </p>
                {!isPendingByMe && (
                  <Button label="Aprobar cambio" size="sm" variant="shared" onClick={handleApproveBudget} disabled={saving} />
                )}
              </div>
            )}

            <div className="settings__card-actions">
              <Button 
                label={saving ? 'Guardando...' : 'Guardar presupuesto'} 
                fullWidth 
                onClick={() => {
                  if (budget.shared_available < 100 || budget.personal_budget < 100) {
                    setToast({ type: 'error', msg: 'Los montos deben ser de al menos 3 dígitos' });
                    return;
                  }
                  handleSaveBudget();
                }} 
                disabled={saving} 
              />
            </div>
          </div>

        </div>

        <div className="settings__col-right">
          
          {/* PIN Card */}
          <div className="settings__card">
            <div className="settings__card-title settings__card-title--flex">
              <Key size={18} /> Seguridad
            </div>
            <div className="settings__row">
              <div className="settings__flex-1">
                <div className="settings__row-label">PIN de acceso</div>
                <div className="settings__row-desc">Código de 4 dígitos para acceso rápido</div>
              </div>
            </div>
            <form onSubmit={handlePinSave} className="settings__pin-form-inner">
              <input 
                type="password" 
                maxLength={4} 
                className="settings__pin-field"
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
            
            <div className="settings__row settings__clickable-row" onClick={exportToCSV}>
              <div className="settings__category-info-row">
                <Download size={18} color="var(--color-text-tertiary)" />
                <div>
                  <div className="settings__row-label">Exportar datos</div>
                  <div className="settings__row-desc">Descargar gastos en formato CSV</div>
                </div>
              </div>
            </div>

            <div className="settings__row settings__clickable-row settings__row--no-border" onClick={() => logout()}>
              <div className="settings__category-info-row">
                <LogOut size={18} color="var(--color-danger)" />
                <div>
                  <div className="settings__row-label settings__label--danger">Cerrar sesión</div>
                  <div className="settings__row-desc">Salir de tu cuenta en este dispositivo</div>
                </div>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="settings__danger-zone">
            <div className="settings__danger-title">Zona de peligro</div>
            <div className="settings__danger-desc">
              Estas acciones son permanentes y no se pueden deshacer. Procede con cuidado.
            </div>
            <div className="settings__danger-actions-row">
              <button 
                className="btn btn--sm settings__danger-btn-outline" 
                onClick={() => window.confirm('¿Estás seguro de que quieres borrar todos tus datos?')}
              >
                Borrar datos
              </button>
              <button 
                className="btn btn--sm settings__danger-btn-solid" 
                onClick={() => logout()}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
