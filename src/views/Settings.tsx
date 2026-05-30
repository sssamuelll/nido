import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Api } from '../api';
import { useAsyncEffect } from '../hooks/useResource';
import { useIsMobile } from '../hooks/useMediaQuery';
import { CACHE_KEYS, cacheBus } from '../lib/cacheBus';
import { formatDateLong } from '../lib/dates';
import { showToast } from '../components/Toast';
import { handleApiError } from '../lib/handleApiError';
import { ErrorView } from '../components/ErrorView';
import { Card, Eyebrow, Pill, Btn, Icon } from '../components/nido';
import type { CycleDetail } from '../api-types/cycles';

/* ── section + row helpers (paper) ── */
const SetCard: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode; danger?: boolean }> = ({ icon, title, children, danger }) => (
  <Card pad style={{ marginBottom: 16, ...(danger ? { border: '1px solid var(--berry-tint)', background: 'color-mix(in srgb, var(--berry-tint) 50%, var(--surface))' } : null) }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
      <span style={{ color: danger ? 'var(--berry)' : 'var(--ink-2)', display: 'flex' }}>{icon}</span>
      <h3 className="serif" style={{ fontSize: 20, ...(danger ? { color: 'var(--berry)' } : null) }}>{title}</h3>
    </div>
    {children}
  </Card>
);

const SetRow: React.FC<{ icon?: React.ReactNode; title: string; sub?: string; action?: React.ReactNode; first?: boolean; onClick?: () => void }> = ({ icon, title, sub, action, first, onClick }) => (
  <div
    onClick={onClick}
    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderTop: first ? 'none' : '1px solid var(--line)', cursor: onClick ? 'pointer' : undefined }}
  >
    {icon ? <span style={{ color: 'var(--ink-3)', flex: '0 0 auto', display: 'flex' }}>{icon}</span> : null}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {sub ? <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</div> : null}
    </div>
    {action ? <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', color: 'var(--ink-3)' }}>{action}</div> : null}
  </div>
);

const moneyField = (value: number, onChange: (v: number) => void) => (
  <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface-2)' }}>
    <span style={{ padding: '13px 15px', color: 'var(--ink-3)', borderRight: '1px solid var(--line)' }}>€</span>
    <input
      type="number"
      value={value === 0 ? '' : value}
      onChange={(e) => { const n = parseFloat(e.target.value); onChange(e.target.value === '' || !Number.isFinite(n) ? 0 : n); }}
      placeholder="0"
      style={{ flex: 1, padding: '13px 15px', fontSize: 16, fontWeight: 600, border: 0, background: 'transparent', outline: 'none', fontFamily: 'inherit', color: 'var(--ink)', width: '100%' }}
    />
  </div>
);

/* ── PIN change (paper numpad) ── */
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

  const triggerShake = useCallback(() => { setShake(true); setTimeout(() => setShake(false), 500); }, []);
  const reset = () => { setStep('idle'); setPin(''); setNewPin(''); };

  const handlePinComplete = async (fullPin: string) => {
    if (step === 'verify') {
      const ok = await Api.verifyPin(fullPin).then(() => true).catch(() => false);
      if (ok) { setPin(''); setStep('new'); } else { triggerShake(); setTimeout(() => setPin(''), 400); }
    } else if (step === 'new') {
      setNewPin(fullPin); setPin(''); setStep('confirm');
    } else if (step === 'confirm') {
      if (fullPin === newPin) {
        try { await Api.updatePin(fullPin); showToast('PIN actualizado', 'success'); reset(); }
        catch (err) { handleApiError(err, 'Error al actualizar el PIN'); reset(); }
      } else {
        triggerShake(); setTimeout(() => { setPin(''); setStep('new'); setNewPin(''); }, 400);
        showToast('Los PINs no coinciden. Inténtalo de nuevo.', 'error');
      }
    }
  };

  const handleDigit = useCallback((d: string) => {
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) setTimeout(() => handlePinComplete(next), 80);
      return next;
    });
  }, [step, newPin]);

  const { title, sub } = PIN_LABELS[step];

  return (
    <SetCard icon={<Icon.lock />} title="Seguridad">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>{sub}</div>
      {step === 'idle' ? (
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ width: 44, height: 44, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--ink)' }} />
            </span>
          ))}
          <Btn onClick={() => setStep('verify')} style={{ marginLeft: 8 }}>Cambiar</Btn>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 18, justifyContent: 'center', ...(shake ? { animation: 'nido-shake .4s' } : null) }}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} style={{ width: 16, height: 16, borderRadius: 16, background: pin.length > i ? 'var(--clay)' : 'var(--inset)', border: `1.5px solid ${pin.length > i ? 'var(--clay)' : 'var(--line-2)'}`, transition: 'all .15s' }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, maxWidth: 280, margin: '0 auto' }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button key={n} type="button" onClick={() => handleDigit(String(n))} style={{ font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 52, background: 'var(--surface-2)', color: 'var(--ink)', borderRadius: 14, fontSize: 22, fontWeight: 600 }}>{n}</button>
            ))}
            <button type="button" onClick={reset} style={{ font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 52, background: 'var(--inset)', color: 'var(--ink-2)', borderRadius: 14, fontSize: 15, fontWeight: 600 }}>Esc</button>
            <button type="button" onClick={() => handleDigit('0')} style={{ font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 52, background: 'var(--surface-2)', color: 'var(--ink)', borderRadius: 14, fontSize: 22, fontWeight: 600 }}>0</button>
            <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} style={{ font: 'inherit', cursor: 'pointer', border: '1px solid var(--line)', minHeight: 52, background: 'var(--inset)', color: 'var(--ink-2)', borderRadius: 14, display: 'grid', placeItems: 'center' }} aria-label="Borrar">⌫</button>
          </div>
        </div>
      )}
    </SetCard>
  );
};

interface HouseholdBudgetData {
  id?: number;
  total_amount: number;
  personal_samuel: number;
  personal_maria: number;
  personal_budget: number;
  allocated: number;
  unallocated: number;
  pending_approval?: { id: number; total_amount: number; requested_by_user_id: number; requested_by_username?: string };
}
interface PasskeyInfo { id: number; device_name: string; created_at: string }

export const Settings: React.FC = () => {
  const { user, logout, registerPasskey } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

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
    try { setCycleLoading(true); setCurrentCycle(await Api.getCurrentCycle()); }
    catch { setCurrentCycle(null); }
    finally { setCycleLoading(false); }
  };
  const loadPasskeys = async () => {
    try { setPasskeysLoading(true); setPasskeys(await Api.getPasskeys()); }
    catch (err) { handleApiError(err, 'Error al cargar dispositivos', { silent: true }); }
    finally { setPasskeysLoading(false); }
  };

  const loadDataFn = useCallback(async () => {
    const cycle = await Api.getCurrentCycle().catch((err) => { handleApiError(err, 'Error al cargar ciclo activo', { silent: true }); return null; });
    setCurrentCycle(cycle);
    const [budgetData, membersData] = await Promise.all([Api.getHouseholdBudget(), Api.getMembers(), loadPasskeys()]);
    if (budgetData.pending_approval && budgetData.pending_approval.requested_by_user_id === user?.id) {
      budgetData.total_amount = budgetData.pending_approval.total_amount;
    }
    setBudget(budgetData);
    setMembers(membersData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const { loading, error, run: loadData } = useAsyncEffect(loadDataFn, { invalidationKeys: [CACHE_KEYS.budget, CACHE_KEYS.cycles] });

  const formatDisplayName = (username?: string | null) => (username ? username.charAt(0).toUpperCase() + username.slice(1) : 'Pareja');

  const handleAddDevice = async () => {
    try { await registerPasskey(); showToast('Dispositivo registrado', 'success'); loadPasskeys(); }
    catch (err) { if (err && (err as { name?: string }).name === 'NotAllowedError') return; handleApiError(err, 'Error al registrar dispositivo'); }
  };
  const handleInvitePartner = async () => {
    try { const r = await Api.createInvite(); setInviteUrl(r.url); setInviteFor('partner'); setCopied(false); }
    catch (err) { handleApiError(err, 'Error al crear invitación'); }
  };
  const handleRelinkPartner = async (partnerId: number) => {
    try { const r = await Api.createInvite(partnerId); setInviteUrl(r.url); setInviteFor('relink'); setCopied(false); }
    catch (err) { handleApiError(err, 'Error al crear enlace'); }
  };
  const handleCopyUrl = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const handleSaveBudget = async () => {
    if (!budget) return;
    if (budget.total_amount < 100 || budget.personal_budget < 100) { showToast('Los montos deben ser de al menos 3 dígitos'); return; }
    try {
      setSaving(true);
      const res = await Api.updateHouseholdBudget({ total_amount: budget.total_amount, personal_budget: budget.personal_budget });
      cacheBus.invalidate(CACHE_KEYS.budget, CACHE_KEYS.summary);
      showToast(res.pending_approval ? 'Petición enviada a tu pareja' : 'Presupuesto guardado', 'success');
      loadData();
    } catch (err) { handleApiError(err, 'Error al guardar'); }
    finally { setSaving(false); }
  };
  const handleApproveBudget = async () => {
    if (!budget?.pending_approval) return;
    try { setSaving(true); await Api.approveHouseholdBudget(budget.pending_approval.id); cacheBus.invalidate(CACHE_KEYS.budget, CACHE_KEYS.summary); showToast('Presupuesto aprobado', 'success'); loadData(); }
    catch (err) { handleApiError(err, 'Error al aprobar'); }
    finally { setSaving(false); }
  };
  const handleRequestCycle = async () => {
    if (!confirm('¿Iniciar nuevo ciclo? Los gastos recurrentes se registrarán una vez tu pareja apruebe.')) return;
    try { setSaving(true); await Api.requestCycle(); cacheBus.invalidate(CACHE_KEYS.cycles); showToast('Ciclo solicitado. Esperando aprobación.', 'success'); loadCycle(); }
    catch (err) { handleApiError(err, 'Error al solicitar ciclo'); }
    finally { setSaving(false); }
  };
  const handleApproveCycle = async () => {
    if (!currentCycle) return;
    if (!confirm('¿Aprobar ciclo de facturación? Se registrarán los gastos recurrentes.')) return;
    try { setSaving(true); await Api.approveCycle(currentCycle.id); cacheBus.invalidate(CACHE_KEYS.cycles, CACHE_KEYS.summary); showToast('Ciclo aprobado. Gastos recurrentes registrados.', 'success'); loadCycle(); }
    catch (err) { handleApiError(err, 'Error al aprobar ciclo'); }
    finally { setSaving(false); }
  };
  const exportToCSV = async () => {
    try {
      const expenses = currentCycle?.start_date
        ? await Api.getExpenses({ start_date: currentCycle.start_date, end_date: currentCycle.end_date ?? undefined })
        : await Api.getExpenses();
      const filename = currentCycle?.start_date ? `nido-ciclo-${currentCycle.start_date}.csv` : 'nido-todos.csv';
      const csv = ['Fecha,Descripción,Cantidad,Categoría,Pagado por,Tipo',
        ...expenses.map((e: { date: string; description: string; amount: number; category: string; paid_by: string; type: string }) => `${e.date},"${e.description}",${e.amount},${e.category},${e.paid_by},${e.type}`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      showToast('CSV descargado', 'success');
    } catch (err) { handleApiError(err, 'Error al exportar'); }
  };

  const headerBar = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <button type="button" aria-label="Volver" onClick={() => navigate('/')} style={{ color: 'var(--ink-2)', background: 'none', border: 0, cursor: 'pointer', display: 'flex' }}><Icon.back /></button>
      <div>
        <h1 className="serif" style={{ fontSize: 26, lineHeight: 1 }}>Configuración</h1>
        <div className="psub" style={{ fontSize: 12, marginTop: 2 }}>Ajustes del nido</div>
      </div>
    </div>
  );

  const screen = (inner: React.ReactNode) => (
    <div className="nido grain" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 20px 40px' }}>
        {headerBar}
        {inner}
      </div>
    </div>
  );

  if (loading || !budget) {
    return screen(<div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{[0, 1, 2].map((i) => <div key={i} className="card" style={{ height: 140, opacity: 0.5 - i * 0.12 }} />)}</div>);
  }
  if (error) return screen(<ErrorView message={error} onRetry={loadData} />);

  const partner = members.find((m) => m.id !== user?.id);
  const partnerName = formatDisplayName(partner?.username);
  const requesterName = formatDisplayName(budget.pending_approval?.requested_by_username);
  const isPendingByMe = budget.pending_approval?.requested_by_user_id === user?.id;

  const profileCard = (
    <Card pad style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 13, background: 'linear-gradient(140deg, var(--surface) 55%, var(--clay-tint))' }}>
      <div className="brand-mark" style={{ width: 48, height: 48, borderRadius: 16, background: 'linear-gradient(150deg, var(--pine), var(--clay))', display: 'grid', placeItems: 'center', color: '#fff', flex: '0 0 auto' }}><Icon.heart /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="serif" style={{ fontSize: 21, lineHeight: 1 }}>El Nido</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{members.map((m) => formatDisplayName(m.username)).join(' & ') || 'María & tú'}</div>
      </div>
    </Card>
  );

  const budgetCard = (
    <SetCard icon={<Icon.lock />} title="Presupuesto del ciclo">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <Eyebrow>Presupuesto compartido</Eyebrow>
          {moneyField(budget.total_amount, (v) => setBudget({ ...budget, total_amount: v }))}
          <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon.info /> Los cambios requieren aprobación de {partnerName}
          </div>
        </div>

        {budget.pending_approval ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '12px 14px', borderRadius: 12, background: 'var(--honey-tint)', border: '1px solid #e6d3a0' }}>
            <span style={{ color: 'var(--honey)', flex: '0 0 auto', marginTop: 1 }}><Icon.clock /></span>
            <div style={{ fontSize: 12.5, color: '#7a5512', lineHeight: 1.4 }}>
              {isPendingByMe ? `Pendiente · esperando aprobación de ${partnerName}` : `${requesterName} pide cambiar el presupuesto a €${budget.pending_approval.total_amount}`}
            </div>
          </div>
        ) : null}
        {!isPendingByMe && budget.pending_approval ? (
          <Btn variant="primary" onClick={handleApproveBudget} disabled={saving}><Icon.check /> Aprobar cambio</Btn>
        ) : null}

        <div>
          <Eyebrow>Tu disponible personal</Eyebrow>
          {moneyField(budget.personal_budget, (v) => setBudget({ ...budget, personal_budget: v }))}
        </div>

        <Btn variant="primary" onClick={handleSaveBudget} disabled={saving} style={{ width: 'fit-content' }}>
          <Icon.check /> {saving ? 'Guardando…' : 'Guardar presupuesto'}
        </Btn>
      </div>
    </SetCard>
  );

  const cycleCard = (
    <SetCard icon={<Icon.refresh />} title="Ciclo">
      {cycleLoading ? (
        <div style={{ padding: 12, textAlign: 'center', color: 'var(--ink-3)' }}>Cargando estado…</div>
      ) : currentCycle ? (
        <>
          <SetRow
            first
            icon={<Icon.cal />}
            title={currentCycle.status === 'active' ? 'Ciclo activo' : 'Solicitud pendiente'}
            sub={currentCycle.status === 'active' ? `Iniciado el ${formatDateLong(currentCycle.started_at || '')}` : `Aprobaciones: ${currentCycle.approvals?.approved_count || 0}/${currentCycle.approvals?.total_members || members.length}`}
            action={<Pill tone={currentCycle.status === 'active' ? 'ok' : 'warn'}>{currentCycle.status === 'active' ? 'en curso' : 'pendiente'}</Pill>}
          />
          {currentCycle.status === 'pending' ? (
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', padding: '10px 0', lineHeight: 1.4 }}>
              {currentCycle.requested_by_user_id === user?.id ? 'Tu solicitud está esperando al resto del Nido.' : `${formatDisplayName(currentCycle.requested_by_username)} pidió reiniciar el ciclo.`}
            </div>
          ) : null}
          {currentCycle.status === 'pending' && !currentCycle.approvals?.current_user_has_approved ? (
            <Btn variant="primary" onClick={handleApproveCycle} disabled={saving}><Icon.check /> {saving ? 'Aprobando…' : 'Aprobar reinicio'}</Btn>
          ) : currentCycle.status === 'active' ? (
            <SetRow icon={<Icon.refresh />} title="Reiniciar ciclo" sub="Cierra el actual y empieza uno nuevo" action={<Btn variant="ghost" onClick={handleRequestCycle} style={{ padding: '7px 12px' }}>Reiniciar</Btn>} />
          ) : null}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginBottom: 12 }}>Inicia un nuevo ciclo. Se activa cuando lo apruebe todo el Nido.</div>
          <Btn variant="primary" onClick={handleRequestCycle} disabled={saving}><Icon.refresh /> {saving ? 'Solicitando…' : 'Solicitar reinicio'}</Btn>
        </>
      )}
    </SetCard>
  );

  const devicesCard = (
    <SetCard icon={<Icon.phone />} title="Dispositivos">
      {passkeysLoading ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>Cargando dispositivos…</div>
      ) : passkeys.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: '8px 0' }}>Sin dispositivos registrados</div>
      ) : (
        passkeys.map((pk, i) => (
          <SetRow key={pk.id} first={i === 0} icon={<Icon.phone />} title={pk.device_name} sub={`Vinculado ${formatDateLong(pk.created_at)}`} />
        ))
      )}
      <div onClick={handleAddDevice} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clay)', fontWeight: 600, fontSize: 13.5, paddingTop: 13, borderTop: '1px solid var(--line)', marginTop: 4, cursor: 'pointer' }}>
        <Icon.plusS /> Añadir dispositivo
      </div>
      {members.length < 2 ? (
        <div onClick={handleInvitePartner} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clay)', fontWeight: 600, fontSize: 13.5, paddingTop: 13, cursor: 'pointer' }}>
          <Icon.link /> Invitar a tu pareja
        </div>
      ) : null}
      {members.filter((m) => m.id !== user?.id).map((m) => (
        <div key={m.id} onClick={() => handleRelinkPartner(m.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--clay)', fontWeight: 600, fontSize: 13.5, paddingTop: 13, cursor: 'pointer' }}>
          <Icon.link /> Re-vincular dispositivo de {formatDisplayName(m.username)}
        </div>
      ))}
      {inviteUrl ? (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'var(--inset)', border: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>{inviteFor === 'partner' ? 'Envía este enlace a tu pareja:' : 'Enlace para re-vincular:'}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input readOnly value={inviteUrl} onClick={(e) => (e.target as HTMLInputElement).select()} style={{ flex: 1, fontSize: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--ink)', fontFamily: 'monospace', minWidth: 0 }} />
            <Btn onClick={handleCopyUrl} style={{ flexShrink: 0 }}>{copied ? <Icon.check /> : <Icon.doc />}{copied ? 'Copiado' : 'Copiar'}</Btn>
          </div>
        </div>
      ) : null}
    </SetCard>
  );

  const toolsCard = (
    <SetCard icon={<Icon.doc />} title="Herramientas">
      <SetRow first icon={<Icon.doc />} title="Exportar datos" sub="Descargar todos los gastos en CSV" action={<Icon.fwd />} onClick={exportToCSV} />
      <SetRow icon={<Icon.exit />} title="Cerrar sesión" sub="Salir de tu cuenta" action={<Icon.fwd />} onClick={() => logout()} />
    </SetCard>
  );

  const dangerCard = (
    <SetCard icon={<Icon.trash />} title="Zona de peligro" danger>
      <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 13, lineHeight: 1.4 }}>Borrar todos los datos es permanente y no se puede deshacer.</div>
      <Btn onClick={() => window.confirm('¿Estás seguro de que quieres borrar todos tus datos?')} style={{ width: isMobile ? '100%' : 'fit-content', justifyContent: 'center', borderColor: 'var(--berry)', color: 'var(--berry)', background: 'transparent' }}>
        Borrar todos los datos
      </Btn>
    </SetCard>
  );

  return screen(
    <>
      {profileCard}
      {isMobile ? (
        <>{budgetCard}{cycleCard}<PinChangeSection />{devicesCard}{toolsCard}{dangerCard}</>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 16, alignItems: 'start' }}>
          <div>{budgetCard}{cycleCard}</div>
          <div><PinChangeSection />{devicesCard}{toolsCard}{dangerCard}</div>
        </div>
      )}
    </>
  );
};
