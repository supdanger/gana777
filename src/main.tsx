import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { ArrowUpRight, CalendarClock, Check, CheckCircle2, ChevronRight, Clock, Copy, Hash, Send, UserRound, WalletCards, X } from 'lucide-react';
import { canonicalMoney, percentText } from '../supabase/functions/_shared/bonus-rule';
import { adminApp, supabase, configError, turnstileSiteKey, REQUEST_COLUMNS, REQUEST_COLUMNS_LEGACY, money, date, statusLabel, type RequestRow, type Message, type Bank, type BankOperationStatus } from './lib';
import { DEPOSIT_PAGE_SIZE, depositWindow } from './deposit-page';
import { bonusCounters, type BonusCounter } from './bonus-counters';
import { loginFailure, readLoginRetryAt, saveLoginRetryAt } from './login-security';
import { assertFormFields, InputError, parseAmount, parseAlias, parseCbu, parseHolder, parseMessage, parseUuid, validateReceipt } from '../supabase/functions/_shared/validation';
import { publicError } from './security';
import { ContentProvider } from './content';
import { DepositRateLimitError, submitDeposit, receiptUrl } from './receipt';
import { creditAmounts } from './amounts';
import { userHistoryWindow } from './user-history';
import { ApprovedReferralNotice, ReferralBonusHistory, ReferralRewardsAdmin } from './referrals';

function missingBonusAmount(error: { message?: string } | null) {
  return !!error && /bonus_amount/i.test(error.message ?? '');
}
function requestedBonus(row: RequestRow) {
  if (row.bonus_percent > 0) return `+${percentText(row.bonus_percent)}%`;
  if ((row.bonus_amount ?? 0) > 0) return `+${money(row.bonus_amount ?? 0)}`;
  return '';
}
import { Brand, LoginView, UserHeader, UserHome, UserProfile, RequestForm, Conversation, type Page } from './user-views';
import { AccountAdmin } from './account-admin';
import { BonusAdmin } from './bonus-admin';
import { ShiftAdmin } from './shift-admin';
import { AdminShell } from './admin-shell';
import { pendingConversationCount, pendingRequestCount } from './admin-navigation';
import { CashierAdmin } from './cashier-admin';
import { ContactAdmin } from './contact-admin';
import { PlayerAdmin } from './player-admin';
import { PortalAdmin } from './portal-admin';
import { playerSignInEmail } from './players';
import { allStaffPermissions, canOpenAdminPage, noStaffPermissions, staffPermissionPages, staffSignInEmail, type StaffPermissions } from './staff';
import './styles.css';
import './mobile.css';
import './reference.css';
import './admin.css';

if (adminApp) document.title = 'GANA777 Panel';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!!supabase);
  const [demo, setDemo] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [staffContext, setStaffContext] = useState<{ superAdmin: boolean; username: string; displayName: string; avatarPath: string | null; permissions: StaffPermissions }>({
    superAdmin: false, username: '', displayName: '', avatarPath: null, permissions: noStaffPermissions,
  });
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankOperation, setBankOperation] = useState<BankOperationStatus | null>(null);
  const [bankReload, setBankReload] = useState(0);
  const [thread, setThread] = useState('');
  const [selectedDepositId, setSelectedDepositId] = useState<string | null>(null);
  const [depositPage, setDepositPage] = useState(0);
  const [depositRows, setDepositRows] = useState<RequestRow[]>([]);
  const [depositTotal, setDepositTotal] = useState(0);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositReload, setDepositReload] = useState(0);
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [liveBonusCounters, setLiveBonusCounters] = useState<BonusCounter[]>([]);
  const [approvedDeposit, setApprovedDeposit] = useState<RequestRow | null>(null);
  const [copiedCreditField, setCopiedCreditField] = useState<'user' | 'amount' | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; kind: 'image' | 'pdf' } | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewError, setReceiptPreviewError] = useState('');
  const [loginRetryAt, setLoginRetryAt] = useState(readLoginRetryAt);
  const [depositRetryAt, setDepositRetryAt] = useState(0);
  const [userHistoryPages, setUserHistoryPages] = useState<Record<RequestRow['kind'], number>>({ deposit: 0, withdrawal: 0 });
  const [profileHistoryTarget, setProfileHistoryTarget] = useState<RequestRow['kind'] | null>(null);
  const [playerWhatsAppUrl, setPlayerWhatsAppUrl] = useState<string | null>(null);
  const [playerUsername, setPlayerUsername] = useState<string | null>(null);
  const loginInFlight = useRef(false);
  const depositTrigger = useRef<HTMLButtonElement | null>(null);
  const userId = session?.user.id ?? 'demo';

  function navigate(nextPage: Page) { setPage(nextPage); setSelectedDepositId(null); setApprovedDeposit(null); setError(''); setNotice(''); }
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [page, depositPage]);
  useEffect(() => {
    if (page !== 'profile' || !profileHistoryTarget) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`user-${profileHistoryTarget}-history`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setProfileHistoryTarget(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [page, profileHistoryTarget]);
  useEffect(() => {
    if (!selectedDepositId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedDepositId(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      depositTrigger.current?.focus();
    };
  }, [selectedDepositId]);
  useEffect(() => {
    if (!approvedDeposit) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setApprovedDeposit(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [approvedDeposit]);
  useEffect(() => {
    setReceiptPreview(null);
    setReceiptPreviewError('');
    setReceiptPreviewLoading(false);
    if (!selectedDepositId) return;
    const requestSource = adminApp && !demo ? depositRows : requests;
    const request = requestSource.find(item => item.id === selectedDepositId);
    if (!request) return;
    if (demo) {
      setReceiptPreview({ url: '/preview-assets/demo-receipt.svg', kind: 'image' });
      return;
    }
    if (!request.receipt_url && !request.receipt_path) {
      setReceiptPreviewError('Esta solicitud no tiene un comprobante adjunto.');
      return;
    }
    let alive = true;
    setReceiptPreviewLoading(true);
    const sourceName = request.receipt_path ?? request.receipt_url ?? '';
    void receiptUrl(request).then(url => {
      if (alive) setReceiptPreview({ url, kind: /\.pdf(?:$|[?#])/i.test(sourceName) ? 'pdf' : 'image' });
    }).catch(() => {
      if (alive) setReceiptPreviewError('No pudimos cargar el comprobante. Intentá abrirlo nuevamente.');
    }).finally(() => {
      if (alive) setReceiptPreviewLoading(false);
    });
    return () => { alive = false; };
  }, [selectedDepositId, demo, depositRows, requests]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSession(data.session); setLoading(false);
      if (error) setError(publicError(error));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      setSession(value);
      if (!value) { setRequests([]); setMessages([]); setBank(null); setBankOperation(null); setIsAdmin(false); setStaffContext({ superAdmin: false, username: '', displayName: '', avatarPath: null, permissions: noStaffPermissions }); setThread(''); setDepositRows([]); setDepositTotal(0); setDepositPage(0); setPendingDepositCount(0); setLiveBonusCounters([]); setPlayerWhatsAppUrl(null); setPlayerUsername(null); }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    const db = supabase;
    let alive = true;
    async function refresh() {
      const requestPromise = (async () => {
        let requestQuery = db.from('request_summaries').select(REQUEST_COLUMNS).order('created_at', { ascending: false });
        if (adminApp) requestQuery = requestQuery.neq('kind', 'deposit');
        else requestQuery = requestQuery.eq('user_id', session!.user.id);
        const first = await requestQuery;
        if (!missingBonusAmount(first.error)) return first;
        let legacyQuery = db.from('request_summaries').select(REQUEST_COLUMNS_LEGACY).order('created_at', { ascending: false });
        if (adminApp) legacyQuery = legacyQuery.neq('kind', 'deposit');
        else legacyQuery = legacyQuery.eq('user_id', session!.user.id);
        const second = await legacyQuery;
        return { ...second, data: (second.data ?? []).map(row => ({ ...row, bonus_amount: 0 })) };
      })();
      let messageQuery = db.from('messages').select('id,user_id,sender_id,body,created_at').order('created_at');
      if (!adminApp) messageQuery = messageQuery.eq('user_id', session!.user.id);
      const pendingDepositsQuery = adminApp
        ? db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending')
        : Promise.resolve({ count: 0, error: null });
      const contextQuery = adminApp ? db.rpc('get_admin_context').single() : Promise.resolve({ data: null, error: null });
      const playerContactQuery = adminApp ? Promise.resolve({ data: null, error: null }) : db.rpc('get_my_whatsapp_url');
      const playerProfileQuery = adminApp ? Promise.resolve({ data: null, error: null }) : db.from('user_profiles').select('username').eq('user_id', session!.user.id).maybeSingle();
      const [r, m, role, pending, context, playerContact, playerProfile] = await Promise.all([
        requestPromise,
        messageQuery,
        db.rpc('is_admin'),
        pendingDepositsQuery,
        contextQuery,
        playerContactQuery,
        playerProfileQuery,
      ]);
      if (!alive) return;
      const failure = r.error ?? m.error ?? role.error ?? pending.error ?? context.error;
      if (failure) { setError(publicError(failure)); return; }
      setRequests(r.data as RequestRow[]); setMessages(m.data as Message[]);
      setIsAdmin(role.data === true);
      if (!adminApp) setPlayerWhatsAppUrl(!playerContact.error && typeof playerContact.data === 'string' ? playerContact.data : null);
      if (!adminApp) setPlayerUsername(!playerProfile.error && typeof playerProfile.data?.username === 'string' ? playerProfile.data.username : null);
      if (adminApp) {
        const row = context.data as null | { is_super_admin: boolean; username: string | null; display_name: string | null; avatar_path: string | null; permissions: Partial<StaffPermissions> | null };
        if (row) setStaffContext({
          superAdmin: row.is_super_admin === true,
          username: row.username ?? '',
          displayName: row.display_name ?? '',
          avatarPath: row.avatar_path ?? null,
          permissions: { ...noStaffPermissions, ...(row.permissions ?? {}) },
        });
        setPendingDepositCount(pending.count ?? 0);
        let bonus = await db.from('deposit_bonus_totals').select('bonus_percent,bonus_amount,title,loads,bonus_total');
        if (missingBonusAmount(bonus.error)) bonus = await db.from('deposit_bonus_totals').select('bonus_percent,title,loads,bonus_total');
        if (!bonus.error) setLiveBonusCounters((bonus.data ?? []).map(row => {
          const percent = Number(row.bonus_percent) || 0;
          const fixed = Number('bonus_amount' in row ? row.bonus_amount : 0) || 0;
          return {
            key: percent > 0 ? `p:${percent}:${row.title}` : fixed > 0 ? `f:${fixed}:${row.title}` : 'none',
            title: row.title,
            loads: Number(row.loads) || 0,
            bonusTotal: Number(row.bonus_total) || 0,
          };
        }));
      }
    }
    void refresh();
    const onFocus = () => { if (!adminApp) void refresh(); };
    window.addEventListener('focus', onFocus);
    const channel = db.channel(`updates-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => { void refresh(); setDepositReload(value => value + 1); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_permissions', filter: `user_id=eq.${session.user.id}` }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cashier_profiles', filter: `user_id=eq.${session.user.id}` }, () => void refresh()).subscribe();
    return () => { alive = false; window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, [session]);
  useEffect(() => {
    if (adminApp || demo || page !== 'deposit' || !session || !supabase) return;
    let alive = true;
    void (async () => {
      const statusResult = await supabase.rpc('get_bank_operation_status').single();
      if (!alive) return;
      if (statusResult.error) { setError(publicError(statusResult.error)); return; }
      const status = statusResult.data as BankOperationStatus;
      setBankOperation(status);
      if (status.mode !== 'online') { setBank(null); return; }
      const assignment = await supabase.rpc('assign_bank_account').single();
      if (!alive) return;
      if (assignment.error) {
        if (status.mode === 'online') setError(publicError(assignment.error));
        return;
      }
      setBank(assignment.data as Bank);
    })();
    return () => { alive = false; };
  }, [session, page, demo, bankReload]);
  useEffect(() => {
    if (adminApp || demo || page !== 'deposit' || !session || !supabase) return;
    const db = supabase;
    const refreshBankState = () => setBankReload(value => value + 1);
    const operationChanged = () => { setBank(null); refreshBankState(); };
    const timer = window.setInterval(refreshBankState, 5000);
    const channel = db.channel(`bank-operation-${session.user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bank_operation_state' }, operationChanged)
      .subscribe();
    return () => { window.clearInterval(timer); void db.removeChannel(channel); };
  }, [session, page, demo]);
  useEffect(() => {
    if (bankOperation?.mode !== 'closing' || !bankOperation.resumes_at || bank) return;
    const delay = Math.max(250, Date.parse(bankOperation.resumes_at) - Date.now() + 250);
    const timer = window.setTimeout(() => setBankReload(value => value + 1), delay);
    return () => window.clearTimeout(timer);
  }, [bankOperation, bank]);
  useEffect(() => {
    if (!adminApp || !isAdmin || demo || canOpenAdminPage(page, staffContext.permissions, staffContext.superAdmin)) return;
    const first = staffPermissionPages.find(candidate => staffContext.permissions[candidate]);
    if (first) navigate(first);
  }, [page, isAdmin, demo, staffContext]);
  useEffect(() => {
    if (!adminApp || demo || page !== 'deposit' || !session || !supabase) return;
    const db = supabase;
    let alive = true;
    setDepositLoading(true);
    const from = depositPage * DEPOSIT_PAGE_SIZE;
    void (async () => {
      const firstPage = await db.from('request_summaries').select(REQUEST_COLUMNS, { count: 'exact' }).eq('kind', 'deposit').order('created_at', { ascending: false }).range(from, from + DEPOSIT_PAGE_SIZE - 1);
      const pageResult = missingBonusAmount(firstPage.error)
        ? await db.from('request_summaries').select(REQUEST_COLUMNS_LEGACY, { count: 'exact' }).eq('kind', 'deposit').order('created_at', { ascending: false }).range(from, from + DEPOSIT_PAGE_SIZE - 1)
        : firstPage;
      const { data, error, count } = pageResult;
      if (!alive) return;
      if (error) { setError(publicError(error)); setDepositLoading(false); return; }
      const total = count ?? 0;
      const next = depositWindow(depositPage, total);
      if (next.current !== depositPage) { setDepositPage(next.current); setDepositLoading(false); return; }
      setDepositTotal(total);
      setDepositRows((data ?? []).map(row => ({ ...row, bonus_amount: Number('bonus_amount' in row ? row.bonus_amount : 0) || 0 })) as RequestRow[]);
      setDepositLoading(false);
    })();
    return () => { alive = false; };
  }, [session, page, demo, depositPage, depositReload]);

  async function action(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); } catch (e) { setError(publicError(e)); }
    finally { setBusy(false); }
  }
  async function login(event: FormEvent<HTMLFormElement>, captchaToken: string | null = null) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (loginInFlight.current) return;
    loginInFlight.current = true;
    try { await action(async () => {
      if (Date.now() < loginRetryAt) throw new InputError('Esperá a que termine la pausa antes de volver a intentar.');
      if (!supabase) throw new InputError('Falta configurar Supabase. Podés explorar la vista previa.');
      assertFormFields(form, ['email', 'password']);
      const email = adminApp ? staffSignInEmail(form.get('email')) : playerSignInEmail(form.get('email'));
      const password = form.get('password');
      if (typeof password !== 'string' || !password || password.length > 1024) throw new InputError('Ingresá una contraseña válida.');
      if (turnstileSiteKey && (!captchaToken || captchaToken.length > 2048)) throw new InputError('Completá la verificación de seguridad.');
      const { error } = await supabase.auth.signInWithPassword({ email, password,
        ...(captchaToken ? { options: { captchaToken } } : {}),
      });
      if (error) {
        const failure = loginFailure(error);
        if (failure.retrySeconds) {
          const deadline = Date.now() + failure.retrySeconds * 1000;
          setLoginRetryAt(deadline); saveLoginRetryAt(deadline);
        }
        throw new InputError(failure.message);
      }
      setLoginRetryAt(0); saveLoginRetryAt(0);
      navigate('home');
    }); } finally { loginInFlight.current = false; }
  }
  async function logout() {
    await action(async () => {
      if (supabase && !demo) { const { error } = await supabase.auth.signOut(); if (error) throw error; }
      setDemo(false); navigate('home');
    });
  }
  async function submitRequest(event: FormEvent<HTMLFormElement>, receiptFile?: File | null) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await action(async () => {
      if (!supabase || demo) throw new InputError('La vista previa no envía solicitudes.');
      form.set('amount', canonicalMoney(parseAmount(form.get('amount'))));
      let row: RequestRow;
      if (page === 'deposit') {
        assertFormFields(form, ['amount', 'bonus_id', 'bank_assignment_id', 'receipt']);
        if (!bank) throw new InputError('Todavía no hay una cuenta habilitada para recibir cargas.');
        if (parseUuid(form.get('bank_assignment_id')) !== bank.assignment_id) throw new InputError('La cuenta asignada no es válida.');
        if (receiptFile) form.set('receipt', receiptFile);
        await validateReceipt(form.get('receipt'));
        try { row = await submitDeposit(form); }
        catch (depositError) {
          if (depositError instanceof DepositRateLimitError) setDepositRetryAt(Date.now() + depositError.retrySeconds * 1000);
          if (depositError instanceof InputError && /asignación|cuenta asignada/i.test(depositError.message)) {
            setBank(null); setBankReload(value => value + 1);
          }
          throw depositError;
        }
      } else {
        assertFormFields(form, ['amount', 'holder', 'cbu', 'alias']);
        const { data, error } = await supabase.rpc('create_withdrawal', {
          p_amount: String(form.get('amount')).trim(), p_holder: parseHolder(form.get('holder')),
          p_cbu: parseCbu(form.get('cbu')), p_alias: parseAlias(form.get('alias')),
        }).single();
        if (error) throw error;
        row = data as RequestRow;
      }
      setRequests(old => [row, ...old.filter(r => r.id !== row.id)]);
      if (page === 'deposit') setDepositRetryAt(0);
      element.reset(); setNotice('Tu solicitud fue enviada. Podés seguir su estado en el historial.');
      if (page === 'deposit') { setBank(null); setBankReload(value => value + 1); }
    });
  }
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await action(async () => {
      if (!supabase || demo) throw new InputError('Conectá Supabase para conversar con soporte.');
      assertFormFields(form, ['message']);
      const body = parseMessage(form.get('message'));
      const target = parseUuid(adminApp ? thread : userId);
      const { data, error } = await supabase.from('messages').insert({ user_id: target, sender_id: userId, body }).select('id,user_id,sender_id,body,created_at').single();
      if (error) throw error;
      setMessages(old => [...old.filter(m => m.id !== data.id), data as Message]); element.reset();
    });
  }
  async function openReceipt(request: RequestRow) {
    // Open synchronously so mobile browsers do not block the tab after the network request.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    await action(async () => {
      try {
        const url = await receiptUrl(request);
        if (tab) tab.location.href = url; else window.location.assign(url);
      } catch (error) { tab?.close(); throw error; }
    });
  }
  function startDemo() {
    setDemo(true);
    if (!adminApp) return;
    setIsAdmin(true);
    setStaffContext({ superAdmin: true, username: 'superadmin', displayName: 'Superadministrador', avatarPath: null, permissions: allStaffPermissions });
    const now = Date.now();
    const featured: RequestRow[] = [
      { id: '10000000-0000-4000-8000-000000000001', user_id: '20000000-0000-4000-8000-000000000001', user_name: 'Martín López', kind: 'deposit', amount: 150000, status: 'pending', created_at: new Date(now - 4 * 60000).toISOString(), approved_at: null, holder: null, cbu: null, alias: null, receipt_path: null, receipt_url: null, cloudinary_asset_id: null, bonus_id: null, bonus_percent: 20 },
      { id: '10000000-0000-4000-8000-000000000002', user_id: '20000000-0000-4000-8000-000000000002', user_name: 'Sofía Benítez', kind: 'deposit', amount: 85000, status: 'pending', created_at: new Date(now - 19 * 60000).toISOString(), approved_at: null, holder: null, cbu: null, alias: null, receipt_path: null, receipt_url: null, cloudinary_asset_id: null, bonus_id: null, bonus_percent: 0 },
      { id: '10000000-0000-4000-8000-000000000003', user_id: '20000000-0000-4000-8000-000000000003', user_name: 'Carlos Acosta', kind: 'deposit', amount: 25000, status: 'approved', created_at: new Date(now - 54 * 60000).toISOString(), approved_at: new Date(now - 42 * 60000).toISOString(), holder: null, cbu: null, alias: null, receipt_path: null, receipt_url: null, cloudinary_asset_id: null, bonus_id: null, bonus_percent: 10 },
    ];
    const demoNames = ['Lucía Romero', 'Mateo Fernández', 'Valentina Ruiz', 'Julián Castro', 'Camila Ortiz', 'Thiago Molina', 'Emilia Vargas', 'Benjamín Torres', 'Martina Silva', 'Facundo Rojas', 'Isabella Núñez', 'Santiago Pereira', 'Renata Gómez', 'Lautaro Díaz', 'Catalina Herrera', 'Bautista Medina', 'Mora Aguilar', 'Franco Paredes', 'Abril Soto', 'Ignacio Rivas', 'Paula Cabrera', 'Tomás Blanco', 'Delfina Navarro', 'Joaquín Flores', 'Alma Suárez', 'Ramiro Acuña', 'Bianca Ferreyra', 'Nicolás Quiroga', 'Elena Coronel', 'Bruno Giménez', 'Ailén Vega', 'Pedro Mansilla', 'Josefina Leiva', 'Agustín Correa', 'Milagros Paz', 'Lucas Benítez', 'Carla Domínguez', 'Felipe Ojeda', 'Natalia Sosa', 'Kevin Duarte', 'Rocío Farías', 'Andrés Palacios'];
    const statuses = ['pending', 'approved', 'rejected'] as const;
    const extras: RequestRow[] = demoNames.map((userName, index) => {
      const number = index + 4;
      const status = statuses[index % statuses.length];
      const minutes = 70 + index * 23;
      const suffix = number.toString(16).padStart(12, '0');
      return { id: `10000000-0000-4000-8000-${suffix}`, user_id: `20000000-0000-4000-8000-${suffix}`, user_name: userName, kind: 'deposit', amount: 12000 + (index * 8750) % 190000, status, created_at: new Date(now - minutes * 60000).toISOString(), approved_at: status === 'approved' ? new Date(now - (minutes - 8) * 60000).toISOString() : null, holder: null, cbu: null, alias: null, receipt_path: null, receipt_url: null, cloudinary_asset_id: null, bonus_id: null, bonus_percent: index % 5 === 0 ? 10 : 0 };
    });
    setRequests([...featured, ...extras]);
  }
  const feedback = <>{error && <div role="alert" className="alert error">{error}</div>}{notice && <div role="status" className="alert">{notice}</div>}</>;
  if (loading) return <main className="login"><Brand panel={adminApp} /><p>Cargando tu cuenta…</p></main>;
  if (!session && !demo) return <LoginView admin={adminApp} busy={busy} retryAt={loginRetryAt} siteKey={turnstileSiteKey} configured={!!supabase} feedback={<>{configError && <div role="alert" className="alert error">{configError}</div>}{feedback}</>} onLogin={login} onDemo={startDemo} onHelp={() => setNotice('Si no podés ingresar, comunicate con el soporte que te proporcionó tu cuenta.')} />;

  function history(kind?: RequestRow['kind']) {
    const items = requests.filter(r => (adminApp || r.user_id === userId) && (!kind || r.kind === kind));
    const paginated = !adminApp && page === 'profile' && kind !== undefined;
    const window = paginated ? userHistoryWindow(userHistoryPages[kind], items.length) : null;
    const visibleItems = window ? items.slice(window.from, window.to) : items;
    const heading = adminApp
      ? kind === 'deposit' ? 'Cargas' : kind === 'withdrawal' ? 'Retiros' : page === 'history' ? 'Historial' : 'Solicitudes'
      : kind === 'deposit' ? 'Historial de cargas' : 'Tus retiros';
    const empty = kind === 'deposit' ? adminApp ? 'Todavía no hay cargas.' : 'Todavía no tenés recargas.' : kind === 'withdrawal' ? adminApp ? 'Todavía no hay retiros.' : 'Todavía no tenés retiros.' : 'Todavía no hay solicitudes.';
    return <section className="card history-card" id={!adminApp && kind ? `user-${kind}-history` : undefined}><h2><Clock size={23} />{heading}</h2>
      {!items.length ? <p className="empty">{empty}</p> : visibleItems.map(r => <article className="movement" key={r.id}>
        <div><strong>{money(r.amount)}</strong><small>{r.kind === 'deposit' ? 'Carga' : 'Retiro'} · {date(r.created_at)}</small>{requestedBonus(r) && <small>Bono solicitado: {requestedBonus(r)}</small>}
          {adminApp && <><small>Usuario: {r.user_name || 'Sin nombre'}</small>{r.holder && <small>{r.holder} · {r.cbu} · {r.alias}</small>}</>}
        </div><span className={`badge ${r.status}`}>{statusLabel[r.status]}</span>
        {adminApp && <div className="row-actions">
          {(r.receipt_url || r.receipt_path) && canOpenAdminPage('deposit', staffContext.permissions, staffContext.superAdmin) && <button disabled={busy} onClick={() => void openReceipt(r)}>Comprobante <ArrowUpRight size={14} /></button>}
          {r.status === 'pending' && page === 'withdrawal' && canOpenAdminPage('withdrawal', staffContext.permissions, staffContext.superAdmin) && (['approved', 'rejected'] as const).map(status => <button disabled={busy || demo} key={status} onClick={() => void action(async () => {
            const { data, error } = await supabase!.from('requests').update({ status }).eq('id', parseUuid(r.id)).eq('status', 'pending').select('id,status').single();
            if (error) throw error;
            setRequests(old => old.map(item => item.id === r.id ? { ...item, status: data.status as RequestRow['status'] } : item));
          })}>{status === 'approved' ? (r.kind === 'withdrawal' ? 'Confirmar acreditación' : 'Aprobar') : 'Rechazar'}</button>)}
        </div>}
      </article>)}
      {kind && window && window.pages > 1 && <div className="user-history-pager" aria-label={`Páginas del ${heading.toLowerCase()}`}>
        <button type="button" disabled={window.current === 0} onClick={() => setUserHistoryPages(value => ({ ...value, [kind]: window.current - 1 }))}>Anterior</button>
        <span>{window.current + 1} de {window.pages}</span>
        <button type="button" disabled={window.current + 1 >= window.pages} onClick={() => setUserHistoryPages(value => ({ ...value, [kind]: window.current + 1 }))}>Siguiente</button>
      </div>}
    </section>;
  }
  function depositList() {
    const demoDeposits = requests.filter(request => request.kind === 'deposit').sort((a, b) => b.created_at.localeCompare(a.created_at));
    const total = demo ? demoDeposits.length : depositTotal;
    const pager = depositWindow(depositPage, total);
    const items = demo ? demoDeposits.slice(pager.from, pager.to + 1) : depositRows;
    const selected = (demo ? demoDeposits : depositRows).find(request => request.id === selectedDepositId) ?? null;
    const selectedName = selected?.user_name || 'Usuario sin nombre';
    function openFullReceipt() {
      if (!selected || !receiptPreview) return;
      if (demo) { const tab = window.open(receiptPreview.url, '_blank'); if (tab) tab.opener = null; }
      else void openReceipt(selected);
    }
    async function reviewSelected(status: 'approved' | 'rejected') {
      const db = supabase;
      if (!selected) return;
      if (demo || !db) {
        const reviewed = { ...selected, status };
        setRequests(old => old.map(item => item.id === selected.id ? reviewed : item));
        if (status === 'approved') { setApprovedDeposit(reviewed); setCopiedCreditField(null); setSelectedDepositId(null); }
        return;
      }
      await action(async () => {
        const { data, error } = await db.from('requests').update({ status }).eq('id', parseUuid(selected.id)).eq('status', 'pending').select('id,status').single();
        if (error) throw error;
        const reviewed = { ...selected, status: data.status as RequestRow['status'] };
        setDepositRows(old => old.map(item => item.id === selected.id ? reviewed : item));
        if (selected.status === 'pending') setPendingDepositCount(count => Math.max(0, count - 1));
        if (status === 'approved') { setApprovedDeposit(reviewed); setCopiedCreditField(null); setSelectedDepositId(null); }
      });
    }
    async function copyCreditValue(value: string, field: 'user' | 'amount') {
      try { await navigator.clipboard.writeText(value); setCopiedCreditField(field); }
      catch { setError('No pudimos copiar el dato. Seleccionalo y copialo manualmente.'); }
    }
    const approvedName = approvedDeposit?.user_name || 'Usuario sin nombre';
    const credit = approvedDeposit ? creditAmounts(approvedDeposit.amount, approvedDeposit.bonus_percent, approvedDeposit.bonus_amount ?? 0) : creditAmounts(0, 0);
    const selectedBonus = selected ? requestedBonus(selected) : '';
    const approvedBonus = approvedDeposit ? requestedBonus(approvedDeposit) : '';
    return <section className="admin-loads" aria-labelledby="loads-title">
      <div className="loads-heading">
        <h1 id="loads-title">Cargas</h1>
        <span className="loads-count">{total} {total === 1 ? 'solicitud' : 'solicitudes'}</span>
      </div>
      {depositLoading && !items.length ? <p className="empty">Cargando cargas…</p> : !items.length ? <section className="card empty loads-empty"><WalletCards size={34} /><strong>No hay solicitudes de carga</strong><p>Las nuevas cargas aparecerán en esta lista.</p></section> : <div className="loads-list">
        {items.map(request => {
          const name = request.user_name || 'Usuario sin nombre';
          return <button className="load-request-button" key={request.id} onClick={event => { depositTrigger.current = event.currentTarget; setSelectedDepositId(request.id); }} aria-haspopup="dialog">
              <span className="request-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('es')}</span>
              <span className="request-summary-user"><strong>{name}</strong><small>{date(request.created_at)}</small></span>
              <span className="request-summary-amount"><strong>{money(request.amount)}</strong><span className={`badge ${request.status}`}>{statusLabel[request.status]}</span></span>
              <ChevronRight className="request-chevron" aria-hidden="true" />
            </button>;
        })}
      </div>}
      {total > 0 && <nav className="loads-pager" aria-label="Páginas de cargas"><button type="button" disabled={pager.current === 0 || depositLoading} onClick={() => { setSelectedDepositId(null); setDepositPage(pager.current - 1); }}>Anterior</button><span>Página {pager.current + 1} de {pager.pages}</span><button type="button" disabled={pager.current + 1 >= pager.pages || depositLoading} onClick={() => { setSelectedDepositId(null); setDepositPage(pager.current + 1); }}>Siguiente</button></nav>}
      {selected && <div className="load-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setSelectedDepositId(null); }}>
        <section className="load-modal" role="dialog" aria-modal="true" aria-label="Revisión de solicitud de carga">
          <button className="load-modal-close" aria-label="Cerrar detalle" autoFocus onClick={() => setSelectedDepositId(null)}><X /></button>
          <div className="load-modal-summary">
            <div className="summary-field summary-amount"><span><WalletCards size={16} /> Monto solicitado</span><strong>{money(selected.amount)}</strong></div>
            <div className="summary-field"><span><UserRound size={16} /> Nombre del usuario</span><strong>{selectedName}</strong></div>
            <div className="summary-field"><span><Hash size={16} /> ID USER</span></div>
            <div className="summary-field"><span><CalendarClock size={16} /> Fecha y hora</span><strong>{date(selected.created_at)}</strong></div>
            <div className="summary-review-meta"><span>Estado <span className={`badge ${selected.status}`}>{statusLabel[selected.status]}</span></span>{selectedBonus && <span>Bono solicitado: <strong>{selectedBonus}</strong></span>}</div>
          </div>
          <div className="request-detail">
            <section className="receipt-viewer" aria-label="Comprobante de transferencia">
              <div className="receipt-canvas" aria-live="polite">
                {receiptPreviewLoading && <div className="receipt-loading"><span aria-hidden="true" /><p>Cargando comprobante…</p></div>}
                {receiptPreviewError && <div className="receipt-preview-error"><WalletCards size={30} /><p>{receiptPreviewError}</p></div>}
                {receiptPreview?.kind === 'image' && <button className="receipt-image-button" aria-label="Abrir comprobante en tamaño completo" disabled={busy} onClick={openFullReceipt}><img src={receiptPreview.url} alt={`Comprobante enviado por ${selectedName}`} referrerPolicy="no-referrer" onError={() => { setReceiptPreview(null); setReceiptPreviewError('No pudimos mostrar este comprobante. Abrilo nuevamente desde la solicitud.'); }} /></button>}
                {receiptPreview?.kind === 'pdf' && <><iframe src={receiptPreview.url} title={`Comprobante PDF de ${selectedName}`} referrerPolicy="no-referrer" /><button className="receipt-pdf-open" aria-label="Abrir comprobante PDF en tamaño completo" disabled={busy} onClick={openFullReceipt} /></>}
              </div>
            </section>
          </div>
          {selected.status === 'pending' && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => void reviewSelected('approved')}>Aceptar carga</button><button className="reject-load" disabled={busy} onClick={() => { if (window.confirm('¿Confirmás que querés rechazar esta carga? Esta acción no se puede deshacer.')) void reviewSelected('rejected'); }}>Rechazar</button></div>}
        </section>
      </div>}
      {approvedDeposit && <div className="load-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setApprovedDeposit(null); }}>
        <section className="credit-ready-modal" role="dialog" aria-modal="true" aria-labelledby="credit-ready-title">
          <button className="load-modal-close" aria-label="Cerrar datos de acreditación" autoFocus onClick={() => setApprovedDeposit(null)}><X /></button>
          <div className="credit-ready-heading"><CheckCircle2 aria-hidden="true" /><span className="eyebrow">CARGA ACEPTADA</span><h2 id="credit-ready-title">Datos listos para acreditar</h2><p>Copiá estos valores y pegalos en la plataforma.</p></div>
          <div className="credit-copy-field"><span>Nombre de usuario</span><div><strong>{approvedName}</strong><button aria-label="Copiar nombre de usuario" onClick={() => void copyCreditValue(approvedName, 'user')}>{copiedCreditField === 'user' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar</>}</button></div></div>
          <div className="credit-breakdown">
            <div><span>Monto solicitado</span><strong>{money(approvedDeposit.amount)}</strong></div>
            <div><span>{approvedBonus ? `Bono ${approvedBonus}` : 'Sin bono'}</span><strong>{approvedBonus ? `+${money(credit.bonus)}` : money(0)}</strong></div>
          </div>
          <div className="credit-copy-field credit-total"><span>Total a acreditar</span><div><strong>{money(credit.total)}</strong><button aria-label="Copiar total a acreditar" onClick={() => void copyCreditValue(credit.copyValue, 'amount')}>{copiedCreditField === 'amount' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar monto</>}</button></div><small>Se copiará {credit.copyValue}, listo para pegar.</small></div>
          {!demo && <ApprovedReferralNotice requestId={approvedDeposit.id} />}
          <button className="credit-done" onClick={() => setApprovedDeposit(null)}>Listo</button>
        </section>
      </div>}
    </section>;
  }
  function bonusBoard() {
    const counters = demo ? bonusCounters(requests) : liveBonusCounters;
    const totalLoads = counters.reduce((sum, item) => sum + item.loads, 0);
    const withoutBonus = counters.find(item => item.key === 'none')?.loads ?? 0;
    return <section className="bonus-counters" aria-label="Contadores de bonos">
      <h2>Contadores de bonos</h2>
      <div className="bonus-counter-grid">
        {counters.map(item => <article className="card" key={item.key}><p>{item.title}</p><strong>{item.loads}</strong><small>{item.key === 'none' ? 'Sin monto extra' : money(item.bonusTotal)}</small></article>)}
        <article className="card"><p>Total cargas</p><strong>{totalLoads}</strong><small>Sin bono: {withoutBonus}</small></article>
      </div>
    </section>;
  }
  const displayName: unknown = session?.user.user_metadata?.display_name;
  const name = (typeof displayName === 'string' ? displayName.trim().slice(0, 80) : '') || session?.user.email?.split('@')[0] || 'bienvenido';
  const pendingCounts = {
    deposit: demo ? pendingRequestCount(requests, 'deposit') : pendingDepositCount,
    withdrawal: pendingRequestCount(requests, 'withdrawal'),
    chat: pendingConversationCount(messages, userId),
  };
  const canOpenCurrentPage = !adminApp || demo || canOpenAdminPage(page, staffContext.permissions, staffContext.superAdmin);
  const content = <>
    {demo && <div className="demo">Vista previa · las operaciones no se envían</div>}
    {adminApp && !isAdmin && !demo ? <section className="card"><h1>Acceso restringido</h1><p>Esta cuenta no tiene permisos de administración.</p>{feedback}</section> : !canOpenCurrentPage ? <section className="card"><h1>Sin acceso</h1><p>Este apartado no está habilitado para tu usuario.</p>{feedback}</section> : <>
      {(adminApp || (page !== 'deposit' && page !== 'withdrawal')) && feedback}
      {page === 'home' && (adminApp ? <><div className="welcome"><h1>Resumen del turno</h1><p>Revisá rápidamente las operaciones que necesitan atención.</p></div><div className="stats">{(['deposit', 'withdrawal'] as const).map(kind => <section className="card" key={kind}><p>{kind === 'deposit' ? 'Cargas pendientes' : 'Retiros pendientes'}</p><h1>{kind === 'deposit' ? pendingCounts.deposit : pendingCounts.withdrawal}</h1></section>)}</div>{bonusBoard()}</> : <UserHome name={name} navigate={navigate} whatsappUrl={demo ? undefined : playerWhatsAppUrl} username={demo ? null : playerUsername} />)}
      {!adminApp && page === 'profile' && <><UserProfile name={name} busy={busy} logout={() => void logout()} />{history('deposit')}{history('withdrawal')}<ReferralBonusHistory userId={userId} demo={demo} /></>}
      {(page === 'deposit' || page === 'withdrawal') && !adminApp && <RequestForm key={page} kind={page} requests={requests.filter(r => r.user_id === userId)} bank={bank} bankOperation={bankOperation} retryAt={page === 'deposit' ? depositRetryAt : 0} busy={busy} demo={demo} feedback={feedback} onSubmit={submitRequest} onCopy={(text, label) => void action(async () => { await navigator.clipboard.writeText(text); setNotice(`${label} copiado.`); })} onOpenWithdrawalHistory={() => { setProfileHistoryTarget('withdrawal'); navigate('profile'); }} />}
      {adminApp && page === 'deposit' && depositList()}
      {adminApp && page === 'withdrawal' && history('withdrawal')}
      {adminApp && page === 'history' && history()}
      {adminApp && page === 'users' && <PlayerAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'contacts' && <ContactAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'portal' && <PortalAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'bonuses' && <BonusAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'referrals' && <ReferralRewardsAdmin demo={demo} busy={busy} action={action} userId={userId} superAdmin={demo || staffContext.superAdmin} />}
      {adminApp && page === 'accounts' && <AccountAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'shifts' && <ShiftAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'cashiers' && staffContext.superAdmin && <CashierAdmin demo={demo} busy={busy} action={action} />}
      {page === 'chat' && (adminApp ? <>
        <h1>Conversaciones</h1><label>Usuario<select value={thread} onChange={e => setThread(e.target.value)}><option value="">Seleccioná una conversación</option>{Array.from(new Set(messages.map(m => m.user_id))).map(id => <option key={id} value={id}>{id}</option>)}</select></label>
        <section className="card chat-log" aria-live="polite">{!thread && <p className="empty">Seleccioná una conversación existente.</p>}{messages.filter(m => m.user_id === thread).map(m => <div className={`message ${m.sender_id === userId ? 'mine' : ''}`} key={m.id}><p>{m.body}</p><small>{date(m.created_at)}</small></div>)}</section>
        <form className="composer" onSubmit={sendMessage}><input name="message" aria-label="Mensaje" placeholder="Escribí un mensaje…" maxLength={2000} required /><button className="send" aria-label="Enviar mensaje" disabled={busy || demo || !thread}><Send size={21} /></button></form>
      </> : <Conversation messages={messages} userId={userId} busy={busy} disabled={demo} onSubmit={sendMessage} />)}
    </>}
  </>;
  const staffAvatarUrl = staffContext.avatarPath && supabase ? supabase.storage.from('cashier-avatars').getPublicUrl(staffContext.avatarPath).data.publicUrl : null;
  if (adminApp) return <AdminShell page={page} counts={pendingCounts} permissions={demo ? allStaffPermissions : staffContext.permissions} superAdmin={demo || staffContext.superAdmin} staffName={demo ? 'Superadministrador' : staffContext.displayName || name} avatarUrl={staffAvatarUrl} busy={busy} navigate={navigate} logout={() => void logout()}>{content}</AdminShell>;
  return <div className={`app user-app page-${page}`}>
    <UserHeader page={page} navigate={navigate} name={name} />
    {content}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ContentProvider><App /></ContentProvider></React.StrictMode>);
