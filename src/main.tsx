import React, { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { ArrowUpRight, CalendarClock, Check, CheckCircle2, ChevronRight, Clock, Copy, Hash, UserRound, WalletCards, X } from 'lucide-react';
import { canonicalMoney, percentText, readMoney } from '../supabase/functions/_shared/bonus-rule';
import { adminApp, supabase, configError, turnstileSiteKey, REQUEST_COLUMNS, REQUEST_COLUMNS_LEGACY, money, date, statusLabel, type RequestRow, type WithdrawalPart, type Message, type Bank, type BankOperationStatus } from './lib';
import { DEPOSIT_PAGE_SIZE, depositWindow } from './deposit-page';
import { bonusCounters, type BonusCounter } from './bonus-counters';
import { loginFailure, readLoginRetryAt, saveLoginRetryAt } from './login-security';
import { assertFormFields, InputError, parseAmount, parseAlias, parseCbu, parseHolder, parseMessage, parseUuid, validateReceipt } from '../supabase/functions/_shared/validation';
import { publicError } from './security';
import { ContentProvider, useContent } from './content';
import { DepositRateLimitError, submitDeposit, receiptUrl } from './receipt';
import { creditAmounts } from './amounts';
import { userHistoryWindow } from './user-history';
import { ApprovedReferralNotice, ReferralBonusHistory, ReferralRewardsAdmin } from './referrals';
import { UserWheel, WheelAdmin } from './wheel';

function missingBonusAmount(error: { message?: string } | null) {
  return !!error && /bonus_amount|requested_special_bonus_id/i.test(error.message ?? '');
}
function missingDepositRoute(error: { message?: string } | null) {
  return !!error && /deposit_sac|deposit_phone|deposit_holder/i.test(error.message ?? '');
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
import { SacBoard } from './sac-board';
import { SAC_STATION_KEY, depositRouteLabel, parseSacStation, scopedDepositFilter } from './sac';
import { AdminShell } from './admin-shell';
import { pendingChatCount, pendingRequestCount } from './admin-navigation';
import { CashierAdmin } from './cashier-admin';
import { ContactAdmin } from './contact-admin';
import { PlayerAdmin } from './player-admin';
import { PortalAdmin } from './portal-admin';
import { AdminWithdrawals } from './admin-withdrawals';
import { AdminChat, type ChatInboxRow } from './admin-chat';
import { AdminExternalChat, type ExternalChatInboxRow } from './admin-external-chat';
import { AdminExternalChatSettings } from './admin-external-chat-settings';
import { DepositLeaderboard } from './deposit-leaderboard';
import { AdminPlayerAccess } from './admin-player-access';
import { PlatformAdmin } from './platform-admin';
import { AccessSessionError, invokeAdminPlayerAccess } from './admin-player-access-api';
import { removeChatImage, uploadChatImage } from './chat-images';
import { playerSignInEmail } from './players';
import { PlayerNotifications, unlinkDeviceSubscription } from './notifications';
import { ScheduledAnnouncementsAdmin } from './scheduled-announcements-admin';
import { TelegramAdmin } from './telegram-admin';
import { ThemesAdmin } from './themes-admin';
import { deviceFootprint } from './device-footprint';
import { themeSurface } from './portal-theme-design';
import { allStaffPermissions, canOpenAdminPage, noStaffPermissions, staffPermissionPages, staffSignInEmail, type StaffPermissions } from './staff';
import './styles.css';
import './mobile.css';
import './reference.css';
import './admin.css';

if (adminApp) document.title = 'GANA777 Panel';

function playerTextField(target: EventTarget | null) {
  const node = target instanceof Node ? target : null;
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const field = element?.closest('input, textarea, select, [contenteditable]');
  return !!field && field.getAttribute('contenteditable') !== 'false';
}

// En el portal del jugador, mantener pulsado no abre la ficha de la imagen ni el recuadro azul.
// Los campos siguen pudiendo seleccionarse para escribir y pegar.
if (!adminApp && typeof document !== 'undefined') {
  document.documentElement.classList.add('player-portal');
  const blockPlayerCallout = (event: Event) => {
    if (playerTextField(event.target)) return;
    event.preventDefault();
  };
  document.addEventListener('contextmenu', blockPlayerCallout, true);
  document.addEventListener('selectstart', blockPlayerCallout, true);
  document.addEventListener('dragstart', blockPlayerCallout, true);
}

function App() {
  const { settings } = useContent();
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
  const [staffReady, setStaffReady] = useState(false);
  const [sacStation, setSacStation] = useState<number | null>(() => parseSacStation(window.localStorage.getItem(SAC_STATION_KEY)));
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [withdrawalParts, setWithdrawalParts] = useState<WithdrawalPart[]>([]);
  const [partPreview, setPartPreview] = useState<{ key: string; url: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatBubbleOpen, setChatBubbleOpen] = useState(false);
  const [chatInbox, setChatInbox] = useState<ChatInboxRow[]>([]);
  const [chatReload, setChatReload] = useState(0);
  const [externalChatInbox, setExternalChatInbox] = useState<ExternalChatInboxRow[]>([]);
  const [externalChatReload, setExternalChatReload] = useState(0);
  const [accessRequestCount, setAccessRequestCount] = useState(0);
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankOperation, setBankOperation] = useState<BankOperationStatus | null>(null);
  const [bankReload, setBankReload] = useState(0);
  const [thread, setThread] = useState('');
  const [externalThread, setExternalThread] = useState('');
  const [selectedDepositId, setSelectedDepositId] = useState<string | null>(null);
  const [selectedSpecialBonusId, setSelectedSpecialBonusId] = useState('');
  const [depositPage, setDepositPage] = useState(0);
  const [depositRows, setDepositRows] = useState<RequestRow[]>([]);
  const [depositTotal, setDepositTotal] = useState(0);
  const [depositLoading, setDepositLoading] = useState(false);
  const [depositReload, setDepositReload] = useState(0);
  const [historyKind, setHistoryKind] = useState<RequestRow['kind']>('deposit');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRows, setHistoryRows] = useState<RequestRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyReload, setHistoryReload] = useState(0);
  const [leaderboardReload, setLeaderboardReload] = useState(0);
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [pendingWithdrawalCount, setPendingWithdrawalCount] = useState(0);
  const [liveBonusCounters, setLiveBonusCounters] = useState<BonusCounter[]>([]);
  const [approvedDeposit, setApprovedDeposit] = useState<RequestRow | null>(null);
  const [reviewAmount, setReviewAmount] = useState('');
  const [reviewGrantBonus, setReviewGrantBonus] = useState(true);
  const [copiedCreditField, setCopiedCreditField] = useState<'user' | 'amount' | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; kind: 'image' | 'pdf' } | null>(null);
  const [receiptPreviewLoading, setReceiptPreviewLoading] = useState(false);
  const [receiptPreviewError, setReceiptPreviewError] = useState('');
  const [loginRetryAt, setLoginRetryAt] = useState(readLoginRetryAt);
  const [depositRetryAt, setDepositRetryAt] = useState(0);
  const [userHistoryPages, setUserHistoryPages] = useState<Record<RequestRow['kind'], number>>({ deposit: 0, withdrawal: 0 });
  const [userHistoryOpen, setUserHistoryOpen] = useState<Record<RequestRow['kind'], boolean>>({ deposit: false, withdrawal: false });
  const [profileHistoryTarget, setProfileHistoryTarget] = useState<RequestRow['kind'] | null>(null);
  const [playerWhatsAppUrl, setPlayerWhatsAppUrl] = useState<string | null>(null);
  const [playerUsername, setPlayerUsername] = useState<string | null>(null);
  const [playerCasinoUrl, setPlayerCasinoUrl] = useState<string | null>(null);
  const loginInFlight = useRef(false);
  const depositTrigger = useRef<HTMLButtonElement | null>(null);
  const bankAssignmentId = useRef<string | null>(null);
  const userId = session?.user.id ?? 'demo';
  useEffect(() => {
    if (adminApp || demo || !session || !supabase) return;
    const client = supabase;
    let alive = true;
    void deviceFootprint().then(footprint => {
      if (!alive || !footprint) return;
      return client.functions.invoke('player-access', { body: { action: 'remember-footprint', footprint } });
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [demo, session?.user.id]);

  function navigate(nextPage: Page) {
    if (!adminApp && nextPage === 'chat') { setPage('home'); setChatBubbleOpen(true); return; }
    setPage(nextPage); if (nextPage !== 'deposit') setSelectedSpecialBonusId(''); setSelectedDepositId(null); setApprovedDeposit(null); setError(''); setNotice('');
  }
  useEffect(() => {
    if (adminApp || !session) return;
    function openNotification(url: string) {
      const target = new URL(url, window.location.origin);
      if (target.origin !== window.location.origin) return;
      const view = target.searchParams.get('view');
      if (view === 'chat') {
        navigate('home');
        setChatBubbleOpen(true);
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      if (view === 'wheel' && !settings.wheel_enabled) {
        navigate('home');
        window.history.replaceState(null, '', window.location.pathname);
        return;
      }
      if (view === 'deposit' || view === 'profile' || view === 'home' || view === 'wheel') {
        if (view === 'profile') setUserHistoryOpen(old => ({ ...old, withdrawal: true }));
        navigate(view);
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    openNotification(window.location.href);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'notification-navigate' && typeof event.data.url === 'string') openNotification(event.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [session?.user.id, settings.wheel_enabled]);
  useEffect(() => {
    if (adminApp || settings.wheel_enabled || page !== 'wheel') return;
    navigate('home');
  }, [page, settings.wheel_enabled]);
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
      if (!value) { setChatBubbleOpen(false); setRequests([]); setWithdrawalParts([]); setPartPreview(null); setMessages([]); setChatInbox([]); setExternalChatInbox([]); setExternalThread(''); setAccessRequestCount(0); setBank(null); setBankOperation(null); setIsAdmin(false); setStaffReady(false); setStaffContext({ superAdmin: false, username: '', displayName: '', avatarPath: null, permissions: noStaffPermissions }); setThread(''); setDepositRows([]); setDepositTotal(0); setDepositPage(0); setPendingDepositCount(0); setPendingWithdrawalCount(0); setLiveBonusCounters([]); setPlayerWhatsAppUrl(null); setPlayerUsername(null); setPlayerCasinoUrl(null); }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    const db = supabase;
    let alive = true;
    async function refresh() {
      const requestPromise = adminApp && page === 'history' ? Promise.resolve({ data: [] as RequestRow[], error: null }) : (async () => {
        let requestQuery = db.from('request_summaries').select(REQUEST_COLUMNS).order('created_at', { ascending: false });
        if (adminApp) requestQuery = requestQuery.neq('kind', 'deposit');
        else requestQuery = requestQuery.eq('user_id', session!.user.id);
        const first = await requestQuery;
        if (!missingBonusAmount(first.error) && !missingDepositRoute(first.error)) return first;
        let legacyQuery = db.from('request_summaries').select(REQUEST_COLUMNS_LEGACY).order('created_at', { ascending: false });
        if (adminApp) legacyQuery = legacyQuery.neq('kind', 'deposit');
        else legacyQuery = legacyQuery.eq('user_id', session!.user.id);
        const second = await legacyQuery;
        return { ...second, data: (second.data ?? []).map(row => ({ ...row, bonus_amount: 0 })) };
      })();
      const messageQuery = adminApp ? Promise.resolve({ data: [] as Message[], error: null })
        : db.from('messages').select('id,user_id,sender_id,body,attachment_path,created_at').eq('user_id', session!.user.id).order('created_at');
      const pendingWithdrawalsQuery = adminApp
        ? db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'withdrawal').eq('status', 'pending')
        : Promise.resolve({ count: 0, error: null });
      const contextQuery = adminApp ? db.rpc('get_admin_context').single() : Promise.resolve({ data: null, error: null });
      const playerContactQuery = adminApp ? Promise.resolve({ data: null, error: null }) : db.rpc('get_my_whatsapp_url');
      const playerProfileQuery = adminApp ? Promise.resolve({ data: null, error: null }) : db.from('user_profiles').select('username').eq('user_id', session!.user.id).maybeSingle();
      const playerCasinoQuery = adminApp ? Promise.resolve({ data: null, error: null }) : db.from('player_casino_links').select('url').eq('user_id', session!.user.id).maybeSingle();
      const partsQuery = adminApp && page === 'history'
        ? Promise.resolve({ data: [] as WithdrawalPart[], error: null })
        : adminApp
        ? db.from('withdrawal_parts').select('request_id,part_number,amount,receipt_path,paid_at,source_bank_account_id,source_bank_name,source_alias')
        : db.from('withdrawal_parts').select('request_id,part_number,amount,receipt_path,paid_at');
      const [r, m, role, pendingWithdrawals, context, playerContact, playerProfile, playerCasino, partsResult] = await Promise.all([
        requestPromise,
        messageQuery,
        db.rpc('is_admin'),
        pendingWithdrawalsQuery,
        contextQuery,
        playerContactQuery,
        playerProfileQuery,
        playerCasinoQuery,
        partsQuery,
      ]);
      if (!alive) return;
      const failure = r.error ?? m.error ?? role.error ?? pendingWithdrawals.error ?? context.error ?? partsResult.error;
      if (failure) { setError(publicError(failure)); return; }
      setRequests(r.data as RequestRow[]); setWithdrawalParts((partsResult.data ?? []) as WithdrawalPart[]); setMessages(m.data as Message[]);
      setIsAdmin(role.data === true);
      if (!adminApp) setPlayerWhatsAppUrl(!playerContact.error && typeof playerContact.data === 'string' ? playerContact.data : null);
      if (!adminApp) setPlayerUsername(!playerProfile.error && typeof playerProfile.data?.username === 'string' ? playerProfile.data.username : null);
      if (!adminApp) setPlayerCasinoUrl(!playerCasino.error && typeof playerCasino.data?.url === 'string' ? playerCasino.data.url : null);
      if (adminApp) {
        const row = context.data as null | { is_super_admin: boolean; username: string | null; display_name: string | null; avatar_path: string | null; permissions: Partial<StaffPermissions> | null };
        if (row) setStaffContext({
          superAdmin: row.is_super_admin === true,
          username: row.username ?? '',
          displayName: row.display_name ?? '',
          avatarPath: row.avatar_path ?? null,
          permissions: { ...noStaffPermissions, ...(row.permissions ?? {}) },
        });
        setStaffReady(true);
        const depositScope = scopedDepositFilter(row?.is_super_admin === true, sacStation);
        let depositCount = depositScope === 'none'
          ? { count: 0, error: null as { message?: string } | null }
          : await (depositScope === 'all'
            ? db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending')
            : db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending').eq('deposit_sac', depositScope));
        if (depositCount.error && missingDepositRoute(depositCount.error)) depositCount = await db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending');
        if (depositCount.error) { setError(publicError(depositCount.error)); return; }
        setPendingDepositCount(depositCount.count ?? 0);
        setPendingWithdrawalCount(pendingWithdrawals.count ?? 0);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => { void refresh(); setDepositReload(value => value + 1); setHistoryReload(value => value + 1); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'deposit_credits' }, () => setLeaderboardReload(value => value + 1))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'withdrawal_parts' }, () => void refresh())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => { if (!adminApp) void refresh(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'admin_permissions', filter: `user_id=eq.${session.user.id}` }, () => void refresh())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'cashier_profiles', filter: `user_id=eq.${session.user.id}` }, () => void refresh()).subscribe();
    return () => { alive = false; window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, [session, sacStation]);
  useEffect(() => {
    if (!adminApp || !session || !supabase) return;
    const db = supabase;
    let alive = true;
    let requestVersion = 0;
    async function refreshInbox() {
      const version = ++requestVersion;
      const rows: ChatInboxRow[] = [];
      const pageSize = 500;
      for (let offset = 0; alive; offset += pageSize) {
        const { data, error } = await db.from('chat_inbox')
          .select('user_id,username,display_name,last_message_id,last_sender_id,last_body,last_created_at,completed_at,completed_by')
          .order('last_created_at', { ascending: false }).order('last_message_id', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (!alive || version !== requestVersion) return;
        if (error) { setError('No pudimos cargar la bandeja de chat. Actualizá el panel e intentá de nuevo.'); return; }
        rows.push(...((data ?? []) as ChatInboxRow[]));
        if (!data || data.length < pageSize) break;
      }
      if (alive && version === requestVersion) setChatInbox(rows);
    }
    void refreshInbox();
    const onFocus = () => void refreshInbox();
    window.addEventListener('focus', onFocus);
    const channel = db.channel(`admin-chat-inbox-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => void refreshInbox())
      .subscribe();
    return () => { alive = false; window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, [session?.user.id, chatReload]);
  useEffect(() => {
    if (!adminApp || !session || !supabase || demo || (!staffContext.superAdmin && !staffContext.permissions.chat)) {
      setExternalChatInbox([]);
      return;
    }
    const db = supabase;
    let alive = true;
    let requestVersion = 0;
    async function refreshExternalInbox() {
      const version = ++requestVersion;
      const rows: ExternalChatInboxRow[] = [];
      const pageSize = 500;
      for (let offset = 0; alive; offset += pageSize) {
        const { data, error } = await db.from('external_chat_inbox')
          .select('thread_id,nickname,origin,created_at,last_seen_at,completed_at,completed_by,last_message_id,last_sender_type,last_body,last_message_at')
          .order('last_message_at', { ascending: false }).order('last_message_id', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (!alive || version !== requestVersion) return;
        if (error) { setError('No pudimos cargar la bandeja de chat externo. Actualizá el panel e intentá de nuevo.'); return; }
        rows.push(...((data ?? []) as ExternalChatInboxRow[]));
        if (!data || data.length < pageSize) break;
      }
      if (alive && version === requestVersion) setExternalChatInbox(rows);
    }
    void refreshExternalInbox();
    const onFocus = () => void refreshExternalInbox();
    window.addEventListener('focus', onFocus);
    const channel = db.channel(`admin-external-chat-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'external_chat_messages' }, () => void refreshExternalInbox())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'external_chat_threads' }, () => void refreshExternalInbox())
      .subscribe();
    return () => { alive = false; window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, [session?.user.id, externalChatReload, demo, staffContext.superAdmin, staffContext.permissions.chat]);
  useEffect(() => {
    if (!adminApp || !session || !supabase || !staffContext.permissions.users || demo) { setAccessRequestCount(0); return; }
    let alive = true;
    const refreshCount = async () => {
      try {
        const data = await invokeAdminPlayerAccess({ action: 'admin-count' });
        if (alive) setAccessRequestCount(Number(data.pending_count) || 0);
      } catch (error) {
        if (error instanceof AccessSessionError) {
          window.clearInterval(timer);
          window.removeEventListener('focus', refreshCount);
          if (alive) setAccessRequestCount(0);
        }
      }
    };
    const timer = window.setInterval(() => void refreshCount(), 30000);
    void refreshCount();
    window.addEventListener('focus', refreshCount);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener('focus', refreshCount); };
  }, [session?.user.id, staffContext.permissions.users, demo]);
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
      const nextBank = assignment.data as Bank;
      if (bankAssignmentId.current && bankAssignmentId.current !== nextBank.assignment_id) setError('');
      bankAssignmentId.current = nextBank.assignment_id;
      setBank(nextBank);
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
    if (!adminApp || demo || page !== 'deposit' || !session || !supabase || !staffReady) return;
    const db = supabase;
    let alive = true;
    const depositScope = scopedDepositFilter(staffContext.superAdmin, sacStation);
    if (depositScope === 'none') { setDepositRows([]); setDepositTotal(0); setDepositLoading(false); return; }
    setDepositLoading(true);
    const from = depositPage * DEPOSIT_PAGE_SIZE;
    void (async () => {
      let scoped = db.from('request_summaries').select(REQUEST_COLUMNS, { count: 'exact' }).eq('kind', 'deposit').order('created_at', { ascending: false });
      if (depositScope !== 'all') scoped = scoped.eq('deposit_sac', depositScope);
      const firstPage = await scoped.range(from, from + DEPOSIT_PAGE_SIZE - 1);
      const pageResult = missingBonusAmount(firstPage.error) || missingDepositRoute(firstPage.error)
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
  }, [session, page, demo, depositPage, depositReload, staffReady, staffContext.superAdmin, sacStation]);
  useEffect(() => {
    if (!adminApp || page !== 'history' || demo || !session || !supabase || !staffReady) return;
    const db = supabase;
    let alive = true;
    const pageSize = 35;
    const from = historyPage * pageSize;
    const historyScope = historyKind === 'deposit' ? scopedDepositFilter(staffContext.superAdmin, sacStation) : 'all';
    if (historyScope === 'none') { setHistoryRows([]); setHistoryTotal(0); setHistoryLoading(false); setHistoryError(''); return; }
    setHistoryLoading(true);
    setHistoryError('');
    void (async () => {
      let scoped = db.from('request_summaries').select(REQUEST_COLUMNS, { count: 'exact' }).eq('kind', historyKind).order('created_at', { ascending: false });
      if (historyScope !== 'all') scoped = scoped.eq('deposit_sac', historyScope);
      const firstPage = await scoped.range(from, from + pageSize - 1);
      const result = missingBonusAmount(firstPage.error) || missingDepositRoute(firstPage.error)
        ? await db.from('request_summaries').select(REQUEST_COLUMNS_LEGACY, { count: 'exact' }).eq('kind', historyKind).order('created_at', { ascending: false }).range(from, from + pageSize - 1)
        : firstPage;
      if (!alive) return;
      if (result.error) {
        setHistoryRows([]); setHistoryTotal(0); setHistoryError(publicError(result.error)); setHistoryLoading(false);
        return;
      }
      const total = result.count ?? 0;
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const current = Math.min(historyPage, pages - 1);
      setHistoryTotal(total);
      if (current !== historyPage) { setHistoryPage(current); return; }
      setHistoryRows((result.data ?? []).map(row => ({ ...row, bonus_amount: Number('bonus_amount' in row ? row.bonus_amount : 0) || 0 })) as RequestRow[]);
      setHistoryLoading(false);
    })();
    return () => { alive = false; };
  }, [session, page, demo, historyKind, historyPage, historyReload, staffReady, staffContext.superAdmin, sacStation]);

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
      if (!adminApp && !demo) await unlinkDeviceSubscription().catch(() => undefined);
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
        if (requests.some(request => request.kind === 'deposit' && request.status === 'pending')) throw new InputError('Ya tenés una carga pendiente. Esperá a que sea aprobada o rechazada.');
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
        const createdParts = await supabase.from('withdrawal_parts').select('request_id,part_number,amount,receipt_path,paid_at').eq('request_id', row.id);
        if (createdParts.error) throw createdParts.error;
        setWithdrawalParts(old => [...old.filter(part => part.request_id !== row.id), ...(createdParts.data as WithdrawalPart[])]);
      }
      setRequests(old => [row, ...old.filter(r => r.id !== row.id)]);
      if (page === 'deposit') setDepositRetryAt(0);
      element.reset();
      if (page === 'withdrawal') setNotice('Tu solicitud fue enviada. Podés seguir su estado en el historial.');
      if (page === 'deposit') { setBank(null); setBankReload(value => value + 1); }
    });
  }
  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const element = event.currentTarget; const form = new FormData(element);
    await action(async () => {
      if (!supabase || demo) throw new InputError('Conectá Supabase para conversar con soporte.');
      assertFormFields(form, ['message', 'image']);
      const image = form.get('image');
      const file = image instanceof File && image.size ? image : null;
      const text = String(form.get('message') ?? '').trim();
      if (!text && !file) throw new InputError('Escribí un mensaje o adjuntá una imagen.');
      const body = parseMessage(text || 'Imagen adjunta');
      const target = parseUuid(userId);
      const attachment_path = file ? await uploadChatImage(target, file) : null;
      try {
        const { data, error } = await supabase.from('messages').insert({ user_id: target, sender_id: userId, body, attachment_path }).select('id,user_id,sender_id,body,attachment_path,created_at').single();
        if (error) throw error;
        setMessages(old => [...old.filter(m => m.id !== data.id), data as Message]); element.reset();
      } catch (cause) {
        if (attachment_path) await removeChatImage(attachment_path);
        throw cause;
      }
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
  async function withdrawalReceiptUrl(part: WithdrawalPart): Promise<string> {
    if (!supabase || !part.receipt_path) throw new InputError('Este pago todavía no tiene comprobante.');
    const { data, error } = await supabase.storage.from('withdrawal-receipts').createSignedUrl(part.receipt_path, 300);
    if (error || !data?.signedUrl) throw new InputError('No pudimos abrir el comprobante.');
    return data.signedUrl;
  }
  async function viewWithdrawalPart(part: WithdrawalPart, inline = false) {
    const key = `${part.request_id}-${part.part_number}`;
    if (inline && partPreview?.key === key) { setPartPreview(null); return; }
    const tab = inline ? null : window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    await action(async () => {
      try {
        const url = await withdrawalReceiptUrl(part);
        if (inline) setPartPreview({ key, url });
        else if (tab) tab.location.href = url;
        else window.location.assign(url);
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
  function chooseSac(next: number) {
    const chosen = parseSacStation(next);
    if (!chosen) return;
    window.localStorage.setItem(SAC_STATION_KEY, String(chosen));
    setSacStation(chosen);
    setDepositPage(0);
    setHistoryPage(0);
  }
  const feedback = <>{error && <div role="alert" className="alert error">{error}</div>}{notice && <div role="status" className="alert">{notice}</div>}</>;
  if (loading) return <main className="login"><Brand panel={adminApp} /><p>Cargando tu cuenta…</p></main>;
  if (!session && !demo) return <LoginView admin={adminApp} busy={busy} retryAt={loginRetryAt} siteKey={turnstileSiteKey} configured={!!supabase} feedback={<>{configError && <div role="alert" className="alert error">{configError}</div>}{feedback}</>} onLogin={login} onDemo={startDemo} onHelp={() => setNotice('Si no podés ingresar, comunicate con el soporte que te proporcionó tu cuenta.')} />;

  function history(kind?: RequestRow['kind']) {
    const adminHistory = adminApp && page === 'history' && kind === undefined;
    const currentKind = adminHistory ? historyKind : kind;
    const items = adminHistory ? demo ? requests.filter(r => r.kind === historyKind) : historyRows : requests.filter(r => (adminApp || r.user_id === userId) && (!kind || r.kind === kind));
    const paginated = !adminApp && page === 'profile' && kind !== undefined;
    const window = paginated ? userHistoryWindow(userHistoryPages[kind], items.length) : null;
    const pageSize = 35;
    const adminPages = Math.max(1, Math.ceil((demo ? requests.filter(r => r.kind === historyKind).length : historyTotal) / pageSize));
    const adminCurrent = Math.min(historyPage, adminPages - 1);
    const visibleItems = adminHistory ? demo ? items.slice(adminCurrent * pageSize, (adminCurrent + 1) * pageSize) : items : window ? items.slice(window.from, window.to) : items;
    const heading = adminApp
      ? currentKind === 'deposit' ? 'Cargas' : currentKind === 'withdrawal' ? 'Retiros' : page === 'history' ? 'Historial' : 'Solicitudes'
      : kind === 'deposit' ? 'Historial de cargas' : 'Tus retiros';
    const empty = currentKind === 'deposit' ? adminApp ? 'Todavía no hay cargas.' : 'Todavía no tenés recargas.' : currentKind === 'withdrawal' ? adminApp ? 'Todavía no hay retiros.' : 'Todavía no tenés retiros.' : 'Todavía no hay solicitudes.';
    const isOpen = !paginated || (kind ? userHistoryOpen[kind] : true);
    return <section className={`card history-card${isOpen ? ' is-open' : ''}`} id={!adminApp && kind ? `user-${kind}-history` : undefined}>{adminHistory ? <><div className="admin-history-heading"><h2><Clock size={23} />Historial</h2><div className="admin-history-tabs" role="tablist" aria-label="Tipo de historial">{(['deposit', 'withdrawal'] as const).map(item => <button type="button" role="tab" aria-selected={historyKind === item} className={historyKind === item ? 'active' : ''} key={item} onClick={() => { setHistoryKind(item); setHistoryPage(0); }}>{item === 'deposit' ? 'Cargas' : 'Retiros'}</button>)}</div></div>{historyError && <p className="alert error" role="alert">{historyError}</p>}{historyKind === 'deposit' && !demo && !staffContext.superAdmin && !sacStation ? <p className="shift-note">Elegí el SAC de esta computadora en Cargas para ver su historial.</p> : null}</> : <h2>{paginated && kind ? <button type="button" className="history-toggle" aria-expanded={isOpen} aria-controls={`user-${kind}-history-content`} onClick={() => setUserHistoryOpen(old => ({ ...old, [kind]: !old[kind] }))}><Clock size={23} /><span>{heading}</span><small>{items.length}</small><ChevronRight className="history-toggle-chevron" size={20} /></button> : <><Clock size={23} />{heading}</>}</h2>}
      {isOpen && <div id={paginated && kind ? `user-${kind}-history-content` : undefined}>
      {adminHistory && historyLoading ? <p className="empty">Cargando historial…</p> : !items.length ? <p className="empty">{empty}</p> : visibleItems.map(r => {
        const requestParts = !adminApp && r.kind === 'withdrawal' ? withdrawalParts.filter(part => part.request_id === r.id).sort((a, b) => a.part_number - b.part_number) : [];
        return <article className={`movement${requestParts.length ? ' user-withdrawal-movement' : ''}`} key={r.id}>
        <div><strong>{money(r.amount)}</strong><small>{r.kind === 'deposit' ? 'Carga' : 'Retiro'} · {date(r.created_at)}</small>{requestedBonus(r) && <small>Bono solicitado: {requestedBonus(r)}</small>}
          {adminApp && <><small>Usuario: {r.user_name || 'Sin nombre'}</small>{r.holder && <small>{r.holder} · {r.cbu} · {r.alias}</small>}</>}
          {requestParts.map(part => {
            const key = `${part.request_id}-${part.part_number}`;
            const partStatus = r.status === 'rejected' ? 'rejected' : part.paid_at ? 'approved' : 'pending';
            return <div className="user-withdrawal-part" key={part.part_number}><div className="user-withdrawal-part-summary"><small>Retiro {part.part_number} de {requestParts.length}</small><strong>{money(Number(part.amount))}</strong></div><span className={`badge ${partStatus}`}>{partStatus === 'approved' ? 'Realizado' : partStatus === 'rejected' ? 'Rechazado' : 'Pendiente'}</span>{part.receipt_path && <button type="button" disabled={busy} onClick={() => void viewWithdrawalPart(part, true)}>{partPreview?.key === key ? 'Ocultar comprobante' : 'Ver comprobante'}</button>}{partPreview?.key === key && <img src={partPreview.url} alt={`Comprobante del retiro ${part.part_number}`} />}</div>;
          })}
        </div>{requestParts.length === 0 && <span className={`badge ${r.status}`}>{statusLabel[r.status]}</span>}
        {adminApp && <div className="row-actions">
          {(r.receipt_url || r.receipt_path) && canOpenAdminPage('deposit', staffContext.permissions, staffContext.superAdmin) && <button disabled={busy} onClick={() => void openReceipt(r)}>Comprobante <ArrowUpRight size={14} /></button>}
          {r.status === 'pending' && page === 'withdrawal' && canOpenAdminPage('withdrawal', staffContext.permissions, staffContext.superAdmin) && (['approved', 'rejected'] as const).map(status => <button disabled={busy || demo} key={status} onClick={() => void action(async () => {
            const { data, error } = await supabase!.from('requests').update({ status }).eq('id', parseUuid(r.id)).eq('status', 'pending').select('id,status').single();
            if (error) throw error;
            setRequests(old => old.map(item => item.id === r.id ? { ...item, status: data.status as RequestRow['status'] } : item));
          })}>{status === 'approved' ? (r.kind === 'withdrawal' ? 'Confirmar acreditación' : 'Aprobar') : 'Rechazar'}</button>)}
        </div>}
      </article>})}
      {adminHistory && adminPages > 1 && <div className="user-history-pager admin-history-pager" aria-label={`Páginas de ${heading.toLowerCase()}`}><button type="button" disabled={adminCurrent === 0 || historyLoading} onClick={() => setHistoryPage(adminCurrent - 1)}>Anterior</button><span>{adminCurrent + 1} de {adminPages} · {historyTotal} registros</span><button type="button" disabled={adminCurrent + 1 >= adminPages || historyLoading} onClick={() => setHistoryPage(adminCurrent + 1)}>Siguiente</button></div>}
      {kind && window && window.pages > 1 && <div className="user-history-pager" aria-label={`Páginas del ${heading.toLowerCase()}`}>
        <button type="button" disabled={window.current === 0} onClick={() => setUserHistoryPages(value => ({ ...value, [kind]: window.current - 1 }))}>Anterior</button>
        <span>{window.current + 1} de {window.pages}</span>
        <button type="button" disabled={window.current + 1 >= window.pages} onClick={() => setUserHistoryPages(value => ({ ...value, [kind]: window.current + 1 }))}>Siguiente</button>
      </div>}
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
        const special = !!selected.requested_special_bonus_id;
        const actual = readMoney(reviewAmount);
        if (status === 'approved' && special && actual === null) throw new InputError('Ingresá el monto que llegó realmente.');
        const { data, error } = status === 'approved' && special
          ? await db.rpc('review_special_deposit', { p_request_id: parseUuid(selected.id), p_actual_amount: actual, p_apply_bonus: reviewGrantBonus })
          : await db.from('requests').update({ status }).eq('id', parseUuid(selected.id)).eq('status', 'pending').select('id,status').single();
        if (error) throw error;
        const reviewed = { ...selected, ...data, status: data.status as RequestRow['status'] };
        setDepositRows(old => old.map(item => item.id === selected.id ? reviewed : item));
        if (selected.status === 'pending') setPendingDepositCount(count => Math.max(0, count - 1));
        if (status === 'approved') { setApprovedDeposit(reviewed); setCopiedCreditField(null); setSelectedDepositId(null); }
      });
    }
    async function confirmCredit() {
      if (!approvedDeposit) return;
      if (demo) {
        setRequests(old => old.map(item => item.id === approvedDeposit.id ? { ...item, credited_at: new Date().toISOString() } : item));
        setApprovedDeposit(null);
        return;
      }
      await action(async () => {
        const db = supabase!;
        const { data, error } = await db.rpc('confirm_deposit_credit', { p_request_id: approvedDeposit.id });
        if (error) throw error;
        const result = data as { notification_id: string; newly_credited: boolean };
        const creditedAt = new Date().toISOString();
        setDepositRows(old => old.map(item => item.id === approvedDeposit.id ? { ...item, credited_at: creditedAt } : item));
        setApprovedDeposit(null);
        setNotice('Carga acreditada. El aviso quedó guardado para el usuario.');
        if (result.newly_credited) {
          const { data: pushResult, error: pushError } = await db.functions.invoke('send-user-push', { body: { notification_id: result.notification_id } });
          if (pushError) setNotice('Carga acreditada y aviso visible en la web. No pudimos enviar el push; podés reintentarlo desde esta carga.');
          else if (pushResult?.no_devices || !pushResult?.sent) setNotice('Carga acreditada y aviso visible en la web. No hay dispositivos conectados para recibir el push.');
          else setNotice(`Carga acreditada. Push enviado a ${pushResult.sent} dispositivo(s).`);
        }
        setDepositReload(value => value + 1);
      });
    }
    async function retryCreditPush(requestId: string) {
      await action(async () => {
        if (!supabase) return;
        const { data, error } = await supabase.functions.invoke('send-user-push', { body: { request_id: requestId } });
        if (error) throw error;
        const result = data as { sent?: number; already_sent?: boolean; no_devices?: boolean };
        setNotice(result.already_sent ? 'El aviso push ya se envió.' : result.no_devices ? 'El usuario todavía no activó los avisos en un dispositivo. El aviso está en su cuenta.' : `Aviso enviado a ${result.sent ?? 0} dispositivo(s).`);
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
    const waitingForSac = !demo && !staffContext.superAdmin && !sacStation;
    const route = selected ? depositRouteLabel(selected, staffContext.superAdmin) : '';
    return <section className="admin-loads" aria-labelledby="loads-title">
      {!demo && !staffContext.superAdmin ? <SacBoard demo={demo} busy={busy} action={action} scope="local" station={sacStation} onStation={chooseSac} /> : null}
      <div className="loads-heading">
        <h1 id="loads-title">Cargas</h1>
        <span className="loads-count">{waitingForSac ? 'SAC sin elegir' : `${total} ${total === 1 ? 'solicitud' : 'solicitudes'}`}</span>
      </div>
      {waitingForSac ? null : depositLoading && !items.length ? <p className="empty">Cargando cargas…</p> : !items.length ? <section className="card empty loads-empty"><WalletCards size={34} /><strong>No hay solicitudes de carga</strong><p>{staffContext.superAdmin || demo ? 'Las nuevas cargas aparecerán en esta lista.' : 'Las cargas de los teléfonos de este SAC aparecerán en esta lista.'}</p></section> : <div className="loads-list">
        {items.map(request => {
          const name = request.user_name || 'Usuario sin nombre';
          const requestRoute = depositRouteLabel(request, staffContext.superAdmin || demo);
          return <button className="load-request-button" key={request.id} onClick={event => { depositTrigger.current = event.currentTarget; setSelectedDepositId(request.id); setReviewAmount(canonicalMoney(request.amount)); setReviewGrantBonus(true); }} aria-haspopup="dialog">
              <span className="request-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('es')}</span>
              <span className="request-summary-user"><strong>{name}</strong><small>{date(request.created_at)}</small>{requestRoute ? <small className="request-route">{requestRoute}</small> : null}</span>
              <span className="request-summary-amount"><strong>{money(request.amount)}</strong><span className={`badge ${request.status}`}>{request.credited_at ? 'Acreditada' : statusLabel[request.status]}</span></span>
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
            {route ? <div className="summary-field"><span>Cuenta de destino</span><strong>{route}</strong></div> : null}
            <div className="summary-review-meta"><span>Estado <span className={`badge ${selected.status}`}>{selected.credited_at ? 'Acreditada' : statusLabel[selected.status]}</span></span>{selectedBonus && <span>Bono solicitado: <strong>{selectedBonus}</strong></span>}{selected.requested_special_bonus_id && !selected.bonus_id && selected.status === 'approved' && <span>Bono especial solicitado; {selected.credited_at ? 'acreditada' : 'aprobada'} sin bono</span>}</div>
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
          {selected.status === 'pending' && selected.requested_special_bonus_id && <div className="special-deposit-review">
            <label>Monto realmente recibido<input inputMode="decimal" value={reviewAmount} onChange={event => setReviewAmount(event.target.value)} /></label>
            <p>Solicitó {money(selected.amount)}. El monto que pongas acá será el que se acredite.</p>
            <label><input type="radio" name="special-review-bonus" checked={reviewGrantBonus} onChange={() => setReviewGrantBonus(true)} /> Acreditar con bono {selectedBonus}</label>
            <label><input type="radio" name="special-review-bonus" checked={!reviewGrantBonus} onChange={() => setReviewGrantBonus(false)} /> Acreditar solo el dinero recibido, sin bono</label>
            {(() => { const actual = readMoney(reviewAmount); const min = Number(selected.special_min_amount) || 0; const max = Number(selected.special_max_amount) || 0; return actual !== null && (actual < min || actual > max) ? <p className="alert error">El monto recibido no cumple el rango de {money(min)} a {money(max)}. Elegí «sin bono».</p> : null; })()}
          </div>}
          {selected.status === 'pending' && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => void reviewSelected('approved')}>Aceptar carga</button><button className="reject-load" disabled={busy} onClick={() => { if (window.confirm('¿Confirmás que querés rechazar esta carga? Esta acción no se puede deshacer.')) void reviewSelected('rejected'); }}>Rechazar</button></div>}
          {selected.status === 'approved' && !selected.credited_at && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => { setApprovedDeposit(selected); setSelectedDepositId(null); }}>Ver datos para acreditar</button></div>}
          {selected.credited_at && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => void retryCreditPush(selected.id)}>Comprobar o reenviar aviso</button></div>}
        </section>
      </div>}
      {approvedDeposit && <div className="load-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setApprovedDeposit(null); }}>
        <section className="credit-ready-modal" role="dialog" aria-modal="true" aria-labelledby="credit-ready-title">
          <button className="load-modal-close" aria-label="Cerrar datos de acreditación" autoFocus onClick={() => setApprovedDeposit(null)}><X /></button>
          <div className="credit-ready-heading"><CheckCircle2 aria-hidden="true" /><span className="eyebrow">CARGA ACEPTADA</span><h2 id="credit-ready-title">Datos listos para acreditar</h2><p>Copiá estos valores y pegalos en la plataforma.</p></div>
          <div className="credit-copy-field"><span>Nombre de usuario</span><div><strong>{approvedName}</strong><button aria-label="Copiar nombre de usuario" onClick={() => void copyCreditValue(approvedName, 'user')}>{copiedCreditField === 'user' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar</>}</button></div></div>
          <div className="credit-breakdown">
            <div><span>Monto a acreditar</span><strong>{money(approvedDeposit.amount)}</strong></div>
            <div><span>{approvedBonus ? `Bono ${approvedBonus}` : 'Sin bono'}</span><strong>{approvedBonus ? `+${money(credit.bonus)}` : money(0)}</strong></div>
          </div>
          <div className="credit-copy-field credit-total"><span>Total a acreditar</span><div><strong>{money(credit.total)}</strong><button aria-label="Copiar total a acreditar" onClick={() => void copyCreditValue(credit.copyValue, 'amount')}>{copiedCreditField === 'amount' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar monto</>}</button></div><small>Se copiará {credit.copyValue}, listo para pegar.</small></div>
          {!demo && <ApprovedReferralNotice requestId={approvedDeposit.id} />}
          <div className="credit-confirm-actions"><button className="credit-done" disabled={busy} onClick={() => void confirmCredit()}>Ya acredité la carga</button><button type="button" disabled={busy} onClick={() => setApprovedDeposit(null)}>Cerrar sin confirmar</button></div>
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
    withdrawal: adminApp && !demo ? pendingWithdrawalCount : pendingRequestCount(requests, 'withdrawal'),
    chat: pendingChatCount(chatInbox),
    externalChat: externalChatInbox.filter(row => !row.completed_at && row.last_sender_type === 'visitor').length,
    access: accessRequestCount,
  };
  const canOpenCurrentPage = !adminApp || demo || canOpenAdminPage(page, staffContext.permissions, staffContext.superAdmin);
  const content = <>
    {demo && <div className="demo">Vista previa · las operaciones no se envían</div>}
    {adminApp && !isAdmin && !demo ? <section className="card"><h1>Acceso restringido</h1><p>Esta cuenta no tiene permisos de administración.</p>{feedback}</section> : !canOpenCurrentPage ? <section className="card"><h1>Sin acceso</h1><p>Este apartado no está habilitado para tu usuario.</p>{feedback}</section> : <>
      {(adminApp || (page !== 'deposit' && page !== 'withdrawal')) && feedback}
      {!adminApp && page === 'profile' && <UserProfile name={name} busy={busy} logout={() => void logout()} />}
      {!adminApp && !demo && session && <PlayerNotifications key={session.user.id} userId={session.user.id} settingsPage={page === 'home' || page === 'profile' ? page : null} onOpenChat={() => navigate('chat')} onOpenWheel={() => navigate('wheel')} />}
      {page === 'home' && (adminApp ? <><div className="welcome"><h1><span>Resumen del turno</span></h1></div>{!demo && !staffContext.superAdmin && !sacStation ? <p className="shift-note">Elegí el SAC de esta computadora en Cargas para ver sus pendientes.</p> : null}<div className="stats">{(['deposit', 'withdrawal'] as const).map(kind => <section className="card" key={kind}><p>{kind === 'deposit' ? 'Cargas pendientes' : 'Retiros pendientes'}</p><h1>{kind === 'deposit' ? pendingCounts.deposit : pendingCounts.withdrawal}</h1></section>)}</div>{bonusBoard()}<DepositLeaderboard demo={demo} requests={requests} reloadKey={leaderboardReload} /></> : <UserHome name={name} navigate={navigate} onClaimSpecialBonus={id => { setSelectedSpecialBonusId(id); navigate('deposit'); }} whatsappUrl={demo ? undefined : playerWhatsAppUrl} username={demo ? null : playerUsername} casinoUrl={demo ? null : playerCasinoUrl} demo={demo} userId={demo ? '' : userId} />)}
      {!adminApp && page === 'profile' && <>{history('deposit')}{history('withdrawal')}<ReferralBonusHistory userId={userId} demo={demo} /></>}
      {(page === 'deposit' || page === 'withdrawal') && !adminApp && <RequestForm key={`${page}:${selectedSpecialBonusId}`} kind={page} requests={requests.filter(r => r.user_id === userId)} bank={bank} bankOperation={bankOperation} retryAt={page === 'deposit' ? depositRetryAt : 0} initialSpecialBonusId={page === 'deposit' ? selectedSpecialBonusId : ''} busy={busy} demo={demo} feedback={feedback} onSubmit={submitRequest} onCopy={(text, label) => void action(async () => { await navigator.clipboard.writeText(text); setNotice(`${label} copiado.`); })} onOpenWithdrawalHistory={() => { setUserHistoryOpen(old => ({ ...old, withdrawal: true })); setProfileHistoryTarget('withdrawal'); navigate('profile'); }} />}
      {adminApp && page === 'deposit' && depositList()}
      {adminApp && page === 'withdrawal' && <AdminWithdrawals requests={requests} parts={withdrawalParts} busy={busy} demo={demo} onViewReceipt={part => void viewWithdrawalPart(part)} onPay={async (request, part, file, sourceAccount) => {
        setBusy(true); setError(''); setNotice('');
        try {
          if (!supabase || demo || !canOpenAdminPage('withdrawal', staffContext.permissions, staffContext.superAdmin)) throw new InputError('No tenés permiso para acreditar retiros.');
          const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : '';
          if (!ext || file.size > 5 * 1024 * 1024) throw new InputError('El comprobante debe ser una foto JPG, PNG o WebP de hasta 5 MB.');
          const path = `${parseUuid(request.id)}/${part.part_number}/${crypto.randomUUID()}.${ext}`;
          const bucket = supabase.storage.from('withdrawal-receipts');
          const uploaded = await bucket.upload(path, file, { contentType: file.type, upsert: false });
          if (uploaded.error) throw uploaded.error;
          const result = await supabase.rpc('confirm_withdrawal_part', {
            p_request_id: request.id, p_part_number: part.part_number, p_receipt_path: path, p_source_account_id: sourceAccount.id,
          });
          if (result.error) {
            await bucket.remove([path]);
            throw result.error;
          }
          const paidAt = new Date().toISOString();
          setWithdrawalParts(old => old.map(item => item.request_id === request.id && item.part_number === part.part_number ? {
            ...item, receipt_path: path, paid_at: paidAt, source_bank_account_id: sourceAccount.id,
            source_bank_name: sourceAccount.bank, source_alias: sourceAccount.alias,
          } : item));
          if (withdrawalParts.filter(item => item.request_id === request.id && !item.paid_at).length === 1) {
            setRequests(old => old.map(item => item.id === request.id ? { ...item, status: 'approved', approved_at: paidAt } : item));
            setPendingWithdrawalCount(value => Math.max(0, value - 1));
            setNotice('Retiro completado. El usuario ya puede ver todos los comprobantes.');
          } else setNotice(`Retiro ${part.part_number} de ${withdrawalParts.filter(item => item.request_id === request.id).length} realizado. Faltan transferencias para completar la solicitud.`);
          const { data: pushResult, error: pushError } = await supabase.functions.invoke('send-user-push', { body: { request_id: request.id, part_number: part.part_number } });
          if (pushError) setNotice(`Retiro ${part.part_number} realizado. El aviso está en la cuenta del usuario, pero no pudimos enviar el push.`);
          else if (pushResult?.no_devices || !pushResult?.sent) setNotice(`Retiro ${part.part_number} realizado. El aviso está en la cuenta del usuario; no hay dispositivos conectados para el push.`);
          return { ok: true };
        } catch (cause) {
          const message = publicError(cause);
          setError(message);
          return { ok: false, error: message };
        } finally { setBusy(false); }
      }} onReview={(request, status) => void action(async () => {
        if (!canOpenAdminPage('withdrawal', staffContext.permissions, staffContext.superAdmin)) throw new InputError('No tenés permiso para revisar retiros.');
        const { data, error } = await supabase!.from('requests').update({ status }).eq('id', parseUuid(request.id)).eq('status', 'pending').select('id,status').single();
        if (error) throw error;
        setRequests(old => old.map(item => item.id === request.id ? { ...item, status: data.status as RequestRow['status'] } : item));
        setPendingWithdrawalCount(value => Math.max(0, value - 1));
        setHistoryReload(value => value + 1);
        setNotice('Retiro rechazado.');
      })} />}
      {adminApp && page === 'history' && history()}
      {adminApp && page === 'users' && <PlayerAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'platform' && <PlatformAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'access-requests' && <AdminPlayerAccess demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'contacts' && <ContactAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'portal' && <PortalAdmin demo={demo} busy={busy} action={action} canEditThemes={demo || staffContext.superAdmin} />}
      {adminApp && page === 'themes' && staffContext.superAdmin && <ThemesAdmin demo={demo} />}
      {adminApp && page === 'announcements' && staffContext.superAdmin && <ScheduledAnnouncementsAdmin demo={demo} />}
      {adminApp && page === 'telegram' && staffContext.superAdmin && <TelegramAdmin demo={demo} />}
      {adminApp && page === 'bonuses' && <BonusAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'referrals' && <ReferralRewardsAdmin demo={demo} busy={busy} action={action} userId={userId} superAdmin={demo || staffContext.superAdmin} />}
      {adminApp && page === 'wheel' && <WheelAdmin demo={demo} busy={busy} action={action} userId={userId} superAdmin={demo || staffContext.superAdmin} canEditPrizes={demo || staffContext.superAdmin || staffContext.permissions.bonuses} />}
      {!adminApp && page === 'wheel' && settings.wheel_enabled && <UserWheel demo={demo} userId={userId} />}
      {adminApp && page === 'accounts' && <AccountAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'shifts' && <ShiftAdmin demo={demo} busy={busy} action={action} station={sacStation} onStation={chooseSac} />}
      {adminApp && page === 'cashiers' && staffContext.superAdmin && <CashierAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'chat' && <AdminChat inbox={chatInbox} selectedId={thread} demo={demo} onSelect={setThread} onChanged={() => setChatReload(value => value + 1)} />}
      {adminApp && page === 'external-chat' && <AdminExternalChat inbox={externalChatInbox} selectedId={externalThread} demo={demo} onSelect={setExternalThread} onChanged={() => setExternalChatReload(value => value + 1)} />}
      {adminApp && page === 'external-chat-admin' && (demo || staffContext.superAdmin) && <AdminExternalChatSettings demo={demo} />}
    </>}
  </>;
  const staffAvatarUrl = staffContext.avatarPath && supabase ? supabase.storage.from('cashier-avatars').getPublicUrl(staffContext.avatarPath).data.publicUrl : null;
  if (adminApp) return <AdminShell page={page} counts={pendingCounts} permissions={demo ? allStaffPermissions : staffContext.permissions} superAdmin={demo || staffContext.superAdmin} staffName={demo ? 'Superadministrador' : staffContext.displayName || name} avatarUrl={staffAvatarUrl} busy={busy} navigate={navigate} logout={() => void logout()}>{content}</AdminShell>;
  const surface = themeSurface(settings, path => supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl ?? null);
  return <div className={`app user-app page-${page} ${surface.className}`} style={surface.style}>
    <UserHeader page={page} navigate={navigate} name={name} />
    {content}
    {session && !demo && <Conversation messages={messages} userId={userId} busy={busy} disabled={false} open={chatBubbleOpen} onOpenChange={setChatBubbleOpen} onSubmit={sendMessage} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ContentProvider><App /></ContentProvider></React.StrictMode>);
