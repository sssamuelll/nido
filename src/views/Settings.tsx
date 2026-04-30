import React, { useState, useCallback } from 'react';
import { useAuth } from '../auth';
import { Api } from '../api';
import { useAsyncEffect } from '../hooks/useResource';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import { format } from 'date-fns';
import { Clock, Lock, RefreshCw, Smartphone, UserPlus, Copy, Check, Link, Delete } from 'lucide-react';
import { showToast } from '../components/Toast';
import { handleApiError } from '../lib/handleApiError';
import { ErrorView } from '../components/ErrorView';
import type { CycleDetail } from '../api-types/cycles';

/* ── PIN Change Component ── */

type PinStep = 'idle' | 'verify' | 'new' | 'confirm';

const PIN_LABELS: Record<PinStep, { title: string; sub: string }> = {
  idle: { title: 'PIN de acceso', sub: 'Código de 4 dígitos para desbloquear la app' },
  verify: { title: 'PIN actual', sub: 'Ingresa tu PIN actual para continuar' },
  new: { title: 'Nuevo PIN', sub: 'Elige un nuevo código de 4 dígitos' },
  confirm: { title: 'Confirmar PIN', sub: 'Repite el nuevo código' },
};

const PinChangeSection: React.FC = () => {
  const [step, setStep] = useState<PinStep>('idle');
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [shake, setShake] = useState(false);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  }, []);

  const reset = () => { setStep('idle'); setPin(''); setNewPin(''); };

  const handleDigit = useCallback((d: string) => {
    setPin(prev => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) {
        // Defer the action to after render
        setTimeout(() => handlePinComplete(next), 80);
      }
      return next;
    });
  }, [step, newPin]);

  const handlePinComplete = async (fullPin: string) => {
    if (step === 'verify') {
      const ok = await Api.verifyPin(fullPin).then(() => true).catch(() => false);
      if (ok) {
        setPin('');
        setStep('new');
      } else {
        triggerShake();
        setTimeout(() => setPin(''), 400);
      }
    } else if (step === 'new') {
      setNewPin(fullPin);
      setPin('');
      setStep('confirm');
    } else if (step === 'confirm') {
      if (fullPin === newPin) {
        try {
          await Api.updatePin(fullPin);
          showToast('PIN actualizado', 'success');
          reset();
        } catch (err) {
          handleApiError(err, 'Error al actualizar el PIN');
          reset();
        }
      } else {
        triggerShake();
        setTimeout(() => { setPin(''); setStep('new'); setNewPin(''); }, 400);
        showToast('Los PINs no coinciden. Inténtalo de nuevo.', 'error');
      }
    }
  };

  const handleDelete = () => setPin(prev => prev.slice(0, -1));

  const { title, sub } = PIN_LABELS[step];

  return (
    <div className="card settings-section an d4">
      <h3>
        <Lock size={18} />
        {' '}Seguridad
      </h3>

      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '16px' }}>{sub}</div>

      {step === 'idle' ? (
        /* Resting state — masked dots + change button */
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="pin-dot" style={{ fontSize: '24px', lineHeight: 1 }}>&bull;</div>
          ))}
          <button
            className="btn btn-outline btn-sm"
            style={{ marginLeft: '8px' }}
            onClick={() => setStep('verify')}
          >
            Cambiar
          </button>
        </div>
      ) : (
        /* Active state — dot indicators + inline numpad */
        <div>
          {/* Dots */}
          <div className={`pin-change__dots${shake ? ' pin-change__dots--shake' : ''}`}>
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="pin-change__dot"
                style={{
                  background: pin.length > i
                    ? (step === 'verify' ? 'var(--blue)' : 'var(--green)')
                    : 'var(--surface2)',
                  borderColor: pin.length > i
                    ? (step === 'verify' ? 'var(--blue)' : 'var(--green)')
                    : 'var(--glass-border)',
                  transform: pin.length === i ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </div>

          {/* Numpad */}
          <div className="pin-change__numpad">
            {[[1,2,3],[4,5,6],[7,8,9]].map((row, ri) => (
              <div key={ri} className="pin-change__numpad-row">
                {row.map(n => (
                  <button
                    key={n}
                    type="button"
                    className="pin-change__key"
                    onClick={() => handleDigit(String(n))}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ))}
            <div className="pin-change__numpad-row">
              <button
                type="button"
                className="pin-change__key pin-change__key--muted"
                onClick={reset}
              >
                Esc
              </button>
              <button
                type="button"
                className="pin-change__key"
                onClick={() => handleDigit('0')}
              >
                0
              </button>
              <button
                type="button"
                className="pin-change__key pin-change__key--muted"
                onClick={handleDelete}
              >
                <Delete size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Settings Types ── */

interface HouseholdBudgetData {
  id?: number;
  total_amount: number;
  personal_samuel: number;
  personal_maria: number;
  personal_budget: number;
  allocated: number;
  unallocated: number;
  pending_approval?: {
    id: number;
    total_amount: number;
    requested_by_user_id: number;
    requested_by_username?: string;
  };
}

interface PasskeyInfo {
  id: number;
  device_name: string;
  created_at: string;
}

export const Settings: React.FC = () => {
  const { user, logout, registerPasskey } = useAuth();
  const [budget, setBudget] = useState<HouseholdBudgetData | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; username: string }>>([]);
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [currentCycle, setCurrentCycle] = useState<CycleDetail | null>(null);
  const [cycleLoading, setCycleLoading] = useState(false);

  const [saving, setSaving] = useState(false);

  const loadCycle = async () => {
    try {
      setCycleLoading(true);
      const cycle = await Api.getCurrentCycle();
      setCurrentCycle(cycle);
    } catch {
      // No cycle is a valid state — not an error
      setCurrentCycle(null);
    } finally {
      setCycleLoading(false);
    }
  };

  const loadPasskeys = async () => {
    try {
      setPasskeysLoading(true);
      const data = await Api.getPasskeys();
      setPasskeys(data);
    } catch (err) {
      console.error('Failed to load passkeys:', err);
    } finally {
      setPasskeysLoading(false);
    }
  };

  const loadDataFn = useCallback(async () => {
    const cycle = await Api.getCurrentCycle().catch((err) => {
      handleApiError(err, 'Error al cargar ciclo activo', { silent: true });
      return null;
    });
    setCurrentCycle(cycle);
    const [budgetData, membersData] = await Promise.all([
      Api.getHouseholdBudget(),
      Api.getMembers(),
      loadPasskeys(),
    ]);

    if (budgetData.pending_approval && budgetData.pending_approval.requested_by_user_id === user?.id) {
      budgetData.total_amount = budgetData.pending_approval.total_amount;
    }

    setBudget(budgetData);
    setMembers(membersData);
    // loadPasskeys is closure-captured; stable across renders for this usage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const { loading, error, run: loadData } = useAsyncEffect(loadDataFn, {
    invalidationKeys: [CACHE_KEYS.budget, CACHE_KEYS.cycles],
  });

  const handleAddDevice = async () => {
    try {
      await registerPasskey();
      showToast('Dispositivo registrado', 'success');
      loadPasskeys();
    } catch (err) {
      if (err && (err as { name?: string }).name === 'NotAllowedError') return; // user cancelled
      handleApiError(err, 'Error al registrar dispositivo');
    }
  };

  const handleInvitePartner = async () => {
    try {
      const result = await Api.createInvite();
      setInviteUrl(result.url);
      setInviteFor('partner');
      setCopied(false);
    } catch (err) {
      handleApiError(err, 'Error al crear invitación');
    }
  };

  const handleRelinkPartner = async (partnerId: number) => {
    try {
      const result = await Api.createInvite(partnerId);
      setInviteUrl(result.url);
      setInviteFor('relink');
      setCopied(false);
    } catch (err) {
      handleApiError(err, 'Error al crear enlace');
    }
  };

  const handleCopyUrl = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSaveBudget = async () => {
    if (!budget) return;
    try {
      setSaving(true);
      const res = await Api.updateHouseholdBudget({
        total_amount: budget.total_amount,
        personal_budget: budget.personal_budget,
      });
      cacheBus.invalidate(CACHE_KEYS.budget, CACHE_KEYS.summary);

      if (res.pending_approval) {
        showToast('Petición enviada a tu pareja', 'success');
      } else {
        showToast('Presupuesto guardado', 'success');
      }
      loadData();
    } catch (err) {
      handleApiError(err, 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveBudget = async () => {
    if (!budget?.pending_approval) return;
    try {
      setSaving(true);
      await Api.approveHouseholdBudget(budget.pending_approval.id);
      cacheBus.invalidate(CACHE_KEYS.budget, CACHE_KEYS.summary);
      showToast('Presupuesto aprobado', 'success');
      loadData();
    } catch (err) {
      handleApiError(err, 'Error al aprobar');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestCycle = async () => {
    if (!confirm('¿Iniciar nuevo ciclo? Los gastos recurrentes se registrarán una vez tu pareja apruebe.')) return;
    try {
      setSaving(true);
      await Api.requestCycle();
      cacheBus.invalidate(CACHE_KEYS.cycles);
      showToast('Ciclo solicitado. Esperando aprobación.', 'success');
      loadCycle();
    } catch (err) {
      handleApiError(err, 'Error al solicitar ciclo');
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
      cacheBus.invalidate(CACHE_KEYS.cycles, CACHE_KEYS.summary);
      showToast('Ciclo aprobado. Gastos recurrentes registrados.', 'success');
      loadCycle();
    } catch (err) {
      handleApiError(err, 'Error al aprobar ciclo');
    } finally {
      setSaving(false);
    }
  };

  const exportToCSV = async () => {
    try {
      let expenses;
      let filename: string;
      if (currentCycle?.start_date) {
        expenses = await Api.getExpenses({
          start_date: currentCycle.start_date,
          end_date: currentCycle.end_date ?? undefined,
        });
        filename = `nido-ciclo-${currentCycle.start_date}.csv`;
      } else {
        expenses = await Api.getExpenses();
        filename = `nido-todos.csv`;
      }
      const csv = [
        'Fecha,Descripción,Cantidad,Categoría,Pagado por,Tipo',
        ...expenses.map((e: { date: string; description: string; amount: number; category: string; paid_by: string; type: string }) =>
          `${e.date},"${e.description}",${e.amount},${e.category},${e.paid_by},${e.type}`
        )
      ].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      showToast('CSV descargado', 'success');
    } catch (err) {
      handleApiError(err, 'Error al exportar');
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

  if (error) return <ErrorView message={error} onRetry={loadData} />;

  const formatDisplayName = (username?: string | null) => {
    if (!username) return 'Pareja';
    return username.charAt(0).toUpperCase() + username.slice(1);
  };

  const partner = members.find(m => m.id !== user?.id);
  const partnerName = formatDisplayName(partner?.username);
  const requesterName = formatDisplayName(budget.pending_approval?.requested_by_username);
  const isPendingByMe = budget.pending_approval?.requested_by_user_id === user?.id;

  return (
    <div className="settings">
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
              {' '}Presupuesto
            </h3>

            <div className="form-row-s">
              <label>Presupuesto compartido</label>
              <span style={{ color: 'var(--tm)' }}>{'€'}</span>
              <input
                className="form-input-s"
                type="number"
                value={budget.total_amount === 0 ? '' : budget.total_amount}
                onChange={e => {
                  const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                  setBudget({ ...budget, total_amount: val });
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
                  : `${requesterName} solicita cambiar el presupuesto a €${budget.pending_approval.total_amount}`}
              </div>
            )}

            {!isPendingByMe && budget.pending_approval && (
              <button className="btn btn-primary btn-sm" style={{ marginBottom: '16px' }} onClick={handleApproveBudget} disabled={saving}>
                Aprobar cambio
              </button>
            )}

            <div className="form-row-s">
              <label>Tu disponible personal</label>
              <span style={{ color: 'var(--tm)' }}>{'€'}</span>
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
                if (budget.total_amount < 100 || budget.personal_budget < 100) {
                  showToast('Los montos deben ser de al menos 3 dígitos');
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
          {/* Security — PIN change */}
          <PinChangeSection />

          {/* Devices & Access — passkey management */}
          <div className="card settings-section an d4">
            <h3>
              <Smartphone size={18} />
              {' '}Dispositivos y acceso
            </h3>

            {/* Registered passkeys list */}
            {passkeysLoading ? (
              <div style={{ fontSize: '13px', color: 'var(--tm)', padding: '8px 0' }}>Cargando dispositivos...</div>
            ) : passkeys.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--tm)', padding: '8px 0' }}>Sin passkeys registradas</div>
            ) : (
              <div style={{ marginBottom: '16px' }}>
                {passkeys.map(pk => (
                  <div
                    key={pk.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '10px 0', borderBottom: '1px solid var(--border2)',
                    }}
                  >
                    <Smartphone size={16} style={{ color: 'var(--ts)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {pk.device_name}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--tm)' }}>
                        Registrado {format(new Date(pk.created_at), 'dd MMM yyyy')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add device button */}
            <button className="btn btn-outline btn-sm" style={{ marginBottom: '12px' }} onClick={handleAddDevice}>
              <Smartphone size={14} style={{ marginRight: '6px' }} />
              Agregar dispositivo
            </button>

            {/* Invite partner — only if < 2 members */}
            {members.length < 2 && (
              <div style={{ marginTop: '8px' }}>
                <button className="btn btn-outline btn-sm" onClick={handleInvitePartner}>
                  <UserPlus size={14} style={{ marginRight: '6px' }} />
                  Invitar a tu pareja
                </button>
              </div>
            )}

            {/* Re-link buttons for other members */}
            {members.filter(m => m.id !== user?.id).map(m => (
              <div key={m.id} style={{ marginTop: '8px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => handleRelinkPartner(m.id)}>
                  <Link size={14} style={{ marginRight: '6px' }} />
                  Re-vincular dispositivo de {formatDisplayName(m.username)}
                </button>
              </div>
            ))}

            {/* Invite URL display */}
            {inviteUrl && (
              <div style={{
                marginTop: '16px', padding: '12px', borderRadius: 'var(--rx)',
                background: 'var(--ol)', border: '1px solid var(--border2)',
              }}>
                <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '8px' }}>
                  {inviteFor === 'partner' ? 'Envía este enlace a tu pareja:' : 'Enlace para re-vincular:'}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <input
                    readOnly
                    value={inviteUrl}
                    style={{
                      flex: 1, fontSize: '12px', padding: '8px 10px',
                      background: 'var(--surface)', border: '1px solid var(--border2)',
                      borderRadius: 'var(--rs)', color: 'var(--text)',
                      fontFamily: 'monospace', minWidth: 0,
                    }}
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={handleCopyUrl}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}
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

          {/* Billing cycle — restart requires approval from all members */}
          <div className="card settings-section an d5">
            <h3>
              <RefreshCw size={18} />
              {' '}Reiniciar ciclo
            </h3>

            {cycleLoading ? (
              <div style={{ padding: '12px', textAlign: 'center', color: 'var(--tm)' }}>Cargando estado...</div>
            ) : currentCycle ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  {currentCycle.status === 'active' ? 'Ciclo activo' : 'Solicitud pendiente'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--tm)', marginBottom: '12px' }}>
                  {currentCycle.status === 'active'
                    ? `Iniciado el ${new Date(currentCycle.started_at || '').toLocaleDateString('es-ES')}`
                    : `Aprobaciones: ${currentCycle.approvals?.approved_count || 0}/${currentCycle.approvals?.total_members || members.length}`}
                </div>

                {currentCycle.status === 'pending' && (
                  <div className="approval-note" style={{ marginBottom: '12px' }}>
                    {currentCycle.requested_by_user_id === user?.id
                      ? `Tu solicitud está esperando al resto del Nido.`
                      : `${formatDisplayName(currentCycle.requested_by_username)} pidió reiniciar el ciclo.`}
                  </div>
                )}

                {currentCycle.status === 'pending' && !currentCycle.approvals?.current_user_has_approved && (
                  <button className="btn btn-primary btn-sm" onClick={handleApproveCycle} disabled={saving}>
                    {saving ? 'Aprobando...' : 'Aprobar reinicio'}
                  </button>
                )}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', marginBottom: '12px' }}>
                  Inicia un nuevo ciclo. Se activa cuando apruebe todo el Nido.
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleRequestCycle}
                  disabled={saving}
                >
                  {saving ? 'Solicitando...' : 'Solicitar reinicio'}
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
