import React, { lazy, startTransition, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { ArrowUpRight, CalendarClock, Check, CheckCircle2, ChevronRight, Clock, Copy, Hash, UserRound, WalletCards, X } from 'lucide-react';
import { canonicalMoney, percentText, readMoney } from '../supabase/functions/_shared/bonus-rule';
import { adminApp, supabase, configError, turnstileSiteKey, REQUEST_COLUMNS, REQUEST_COLUMNS_LEGACY, money, date, statusLabel, type RequestRow, type WithdrawalPart, type Message, type Bank, type BankOperationStatus } from './lib';
import { DEPOSIT_PAGE_SIZE, depositWindow } from './deposit-page';
import { depositQueueEnabled, readDepositQueue, takeDeposit, releaseDeposit, reviewQueueDeposit, confirmQueueCredit, ownsDeposit, depositClaimLabel, type QueueDeposit, type DepositQueueFilter } from './deposit-claims';
import { bonusCounters } from './bonus-counters';
const BonusCounterAdmin = lazy(() => import('./bonus-counter-admin').then(module => ({ default: module.BonusCounterAdmin })));
import { loginFailure, readLoginRetryAt, saveLoginRetryAt } from './login-security';
import { assertFormFields, InputError, parseAmount, parseAlias, parseCbu, parseHolder, parseMessage, parseUuid, validateReceipt } from '../supabase/functions/_shared/validation';
import { publicError } from './security';
import { ContentProvider, useContent } from './content';
import { DepositRateLimitError, submitDeposit, receiptUrl } from './receipt';
import { creditAmounts } from './amounts';
import { userHistoryWindow } from './user-history';
const ApprovedReferralNotice = lazy(() => import('./referrals').then(module => ({ default: module.ApprovedReferralNotice })));
const ReferralBonusHistory = lazy(() => import('./referrals').then(module => ({ default: module.ReferralBonusHistory })));
const ReferralRewardsAdmin = lazy(() => import('./referrals').then(module => ({ default: module.ReferralRewardsAdmin })));
const UserWheel = lazy(() => import('./wheel').then(module => ({ default: module.UserWheel })));
const WheelAdmin = lazy(() => import('./wheel').then(module => ({ default: module.WheelAdmin })));

function missingBonusAmount(error: { message?: string } | null) {
  return !!error && /bonus_amount|requested_special_bonus_id|bonus_reward_type|bonus_reward_label|bonus_load_number/i.test(error.message ?? '');
}
function missingDepositRoute(error: { message?: string } | null) {
  return !!error && /deposit_sac|deposit_phone|deposit_holder/i.test(error.message ?? '');
}
function requestedBonus(row: RequestRow) {
  if (row.bonus_id && row.bonus_reward_type === 'free_spins' && row.bonus_reward_label) return row.bonus_reward_label;
  if (row.bonus_percent > 0) return `+${percentText(row.bonus_percent)}%`;
  if ((row.bonus_amount ?? 0) > 0) return `+${money(row.bonus_amount ?? 0)}`;
  return '';
}
import { Brand, LoginView, UserHeader, type Page } from './user-shell';
const UserHome = lazy(() => import('./user-views').then(module => ({ default: module.UserHome })));
const UserProfile = lazy(() => import('./user-views').then(module => ({ default: module.UserProfile })));
const RequestForm = lazy(() => import('./user-views').then(module => ({ default: module.RequestForm })));
const Conversation = lazy(() => import('./user-views').then(module => ({ default: module.Conversation })));
const AccountAdmin = lazy(() => import('./account-admin').then(module => ({ default: module.AccountAdmin })));
const BonusAdmin = lazy(() => import('./bonus-admin').then(module => ({ default: module.BonusAdmin })));
const DepositClaimHistory = lazy(() => import('./deposit-claim-history').then(module => ({ default: module.DepositClaimHistory })));
const ShiftAdmin = lazy(() => import('./shift-admin').then(module => ({ default: module.ShiftAdmin })));
const SacBoard = lazy(() => import('./sac-board').then(module => ({ default: module.SacBoard })));
import { SAC_STATION_KEY, depositRouteLabel, parseSacStation, scopedDepositFilter } from './sac';
const AdminShell = lazy(() => import('./admin-shell').then(module => ({ default: module.AdminShell })));
const AdminOverview = lazy(() => import('./admin-overview').then(module => ({ default: module.AdminOverview })));
import { AdminRefreshProvider } from './admin-refresh';
import { pendingChatCount, pendingRequestCount } from './admin-navigation';
const CashierAdmin = lazy(() => import('./cashier-admin').then(module => ({ default: module.CashierAdmin })));
const ContactAdmin = lazy(() => import('./contact-admin').then(module => ({ default: module.ContactAdmin })));
const PlayerAdmin = lazy(() => import('./player-admin').then(module => ({ default: module.PlayerAdmin })));
const LoginLinkAdmin = lazy(() => import('./login-link-admin').then(module => ({ default: module.LoginLinkAdmin })));
const PortalAdmin = lazy(() => import('./portal-admin').then(module => ({ default: module.PortalAdmin })));
const AdminWithdrawals = lazy(() => import('./admin-withdrawals').then(module => ({ default: module.AdminWithdrawals })));
import type { ChatInboxRow } from './admin-chat';
const AdminChat = lazy(() => import('./admin-chat').then(module => ({ default: module.AdminChat })));
import type { ExternalChatInboxRow } from './admin-external-chat';
const AdminExternalChat = lazy(() => import('./admin-external-chat').then(module => ({ default: module.AdminExternalChat })));
const AdminExternalChatSettings = lazy(() => import('./admin-external-chat-settings').then(module => ({ default: module.AdminExternalChatSettings })));
const DepositLeaderboard = lazy(() => import('./deposit-leaderboard').then(module => ({ default: module.DepositLeaderboard })));
const AdminPlayerAccess = lazy(() => import('./admin-player-access').then(module => ({ default: module.AdminPlayerAccess })));
const PlatformAdmin = lazy(() => import('./platform-admin').then(module => ({ default: module.PlatformAdmin })));
import { AccessSessionError, invokeAdminPlayerAccess } from './admin-player-access-api';
import { removeChatImage, uploadChatImage } from './chat-images';
import { playerSignInEmail } from './players';
import { PlayerNotifications, unlinkDeviceSubscription } from './notifications';
const PlayerBonuses = lazy(() => import('./player-bonuses').then(module => ({ default: module.PlayerBonuses })));
const ScheduledAnnouncementsAdmin = lazy(() => import('./scheduled-announcements-admin').then(module => ({ default: module.ScheduledAnnouncementsAdmin })));
const TelegramAdmin = lazy(() => import('./telegram-admin').then(module => ({ default: module.TelegramAdmin })));
const ThemesAdmin = lazy(() => import('./themes-admin').then(module => ({ default: module.ThemesAdmin })));
import { deviceFootprint } from './device-footprint';
import { themeSurface } from './portal-theme-design';
import { allStaffPermissions, canOpenAdminPage, noStaffPermissions, staffPermissionPages, staffPermissionRoute, staffSignInEmail, type StaffPermissions } from './staff';
import { AsyncView, ViewLoading } from './async-view';
import { readDevicePreference, writeDevicePreference } from './device-preferences';
import { clearViewState } from './view-state';
import { registerPortalWorker } from './worker-registration';
import { cachedResource, clearResourceCache, invalidateResourcePrefix } from './resource-cache';
import { MESSAGE_PAGE_SIZE, mergeMessages } from './query-utils';
import { readRequestPage, readWithdrawalParts } from './request-data';
import { inboxIds, readInboxPage, type ChatSummary, type ExternalSummary, type InboxFilter } from './inbox-data';
import './styles.css';
import './mobile.css';
import './reference.css';

if (adminApp) { document.title = 'GANA777 Panel'; document.documentElement.classList.add('admin-document'); document.body.classList.add('admin-document'); void import('./admin-login.css'); }
if (!adminApp && import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => { void registerPortalWorker().catch(() => {}); };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

function playerTextField(target: EventTarget | null) {
  const node = target instanceof Node ? target : null;
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const field = element?.closest('input, textarea, select, [contenteditable]');
  return !!field && field.getAttribute('contenteditable') !== 'false';
}

function PortalBootScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <main className="portal-boot-screen" aria-busy={!error}>
    <div className="portal-boot-brand" aria-label="Gana777bet.com">Gana<span>777</span><small>bet.com</small></div>
    {error ? <><p role="alert">{error}</p><button type="button" onClick={onRetry}>Reintentar</button></> : <><span className="portal-boot-spinner" aria-hidden="true" /><p role="status">Preparando tu portal…</p></>}
  </main>;
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
  const { settings, initialReady, initialError, retryInitialLoad } = useContent();
  const [session, setSession] = useState<Session | null>(null);
  const currentSessionId = useRef(session?.user.id);
  currentSessionId.current = session?.user.id;
  const [loading, setLoading] = useState(!!supabase);
  const [demo, setDemo] = useState(false);
  const [page, setPage] = useState<Page>('home');
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [wheelEligible, setWheelEligible] = useState(false);
  const [wheelEligibilityReady, setWheelEligibilityReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [staffContext, setStaffContext] = useState<{ superAdmin: boolean; username: string; displayName: string; avatarPath: string | null; permissions: StaffPermissions }>({
    superAdmin: false, username: '', displayName: '', avatarPath: null, permissions: noStaffPermissions,
  });
  const [staffReady, setStaffReady] = useState(false);
  const [sharedDeposits, setSharedDeposits] = useState(false);
  const [depositFilter, setDepositFilter] = useState<DepositQueueFilter>('available');
  const [activeDeposit, setActiveDeposit] = useState<QueueDeposit | null>(null);

  const [depositReadError, setDepositReadError] = useState('');
  const [sacStation, setSacStation] = useState<number | null>(() => parseSacStation(readDevicePreference(SAC_STATION_KEY)));
  const [requests, setRequests] = useState<QueueDeposit[]>([]);
  const [withdrawalParts, setWithdrawalParts] = useState<WithdrawalPart[]>([]);
  const [withdrawalReload, setWithdrawalReload] = useState(0);
  const [withdrawalPages, setWithdrawalPages] = useState({ pending: 0, resolved: 0 });
  const [withdrawalTotals, setWithdrawalTotals] = useState({ pending: 0, resolved: 0 });
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [partPreview, setPartPreview] = useState<{ key: string; url: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHasMore, setChatHasMore] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOlderLoading, setChatOlderLoading] = useState(false);
  const chatRequestVersion = useRef(0);
  const [playerHistory, setPlayerHistory] = useState<Record<RequestRow['kind'], { rows: RequestRow[]; total: number; loading: boolean; error: string }>>({ deposit: { rows: [], total: 0, loading: false, error: '' }, withdrawal: { rows: [], total: 0, loading: false, error: '' } });
  const [chatBubbleOpen, setChatBubbleOpen] = useState(false);
  const [chatInbox, setChatInbox] = useState<ChatInboxRow[]>([]);
  const [chatReload, setChatReload] = useState(0);
  const [chatSummary, setChatSummary] = useState<ChatSummary[]>([]);
  const [externalSummary, setExternalSummary] = useState<ExternalSummary[]>([]);
  const [chatQuery, setChatQuery] = useState({ search: '', filter: 'pending' as InboxFilter, page: 0 });
  const [externalQuery, setExternalQuery] = useState({ search: '', filter: 'pending' as InboxFilter, page: 0 });
  const [chatPageState, setChatPageState] = useState({ total: 0, loading: false });
  const [externalPageState, setExternalPageState] = useState({ total: 0, loading: false });
  const [externalChatInbox, setExternalChatInbox] = useState<ExternalChatInboxRow[]>([]);
  const [externalChatReload, setExternalChatReload] = useState(0);
  const [accessRequestCount, setAccessRequestCount] = useState(0);
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankOperation, setBankOperation] = useState<BankOperationStatus | null>(null);
  const [bankReload, setBankReload] = useState(0);
  const [thread, setThread] = useState('');
  const [externalThread, setExternalThread] = useState('');
  const [selectedDepositId, setSelectedDepositId] = useState<string | null>(null);
  const [selectedBonusId, setSelectedBonusId] = useState('');
  const [depositPage, setDepositPage] = useState(0);
  const [depositRows, setDepositRows] = useState<QueueDeposit[]>([]);
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
  const [adminRefresh, setAdminRefresh] = useState(0);
  const refreshAdmin = useCallback(() => {
    setAdminRefresh(value => value + 1);
    setWithdrawalReload(value => value + 1);
    setDepositReload(value => value + 1);
    setHistoryReload(value => value + 1);
    setChatReload(value => value + 1);
    setExternalChatReload(value => value + 1);
    setLeaderboardReload(value => value + 1);
  }, []);
  const [pendingDepositCount, setPendingDepositCount] = useState(0);
  const [pendingWithdrawalCount, setPendingWithdrawalCount] = useState(0);
  const [approvedDeposit, setApprovedDeposit] = useState<QueueDeposit | null>(null);
  const [reviewAmount, setReviewAmount] = useState('');
  const depositOperation = useRef<{ selected: QueueDeposit | null; approved: QueueDeposit | null }>({ selected: null, approved: null });
  depositOperation.current = { selected: selectedDepositId ? activeDeposit : null, approved: approvedDeposit };
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
  const playerHistoryReady = useRef(false);
  const playerHistoryClosing = useRef(false);
  const playerPageRef = useRef<Page>('home');
  const currentPageRef = useRef(page);
  const scrollPositions = useRef(new Map<Page, number>());
  const playerPopHandler = useRef<((event: PopStateEvent) => void) | null>(null);
  const depositTrigger = useRef<HTMLButtonElement | null>(null);
  const closeDepositDetail = useRef<() => void>(() => {});
  const bankAssignmentId = useRef<string | null>(null);
  const userId = session?.user.id ?? 'demo';
  useEffect(() => { playerPageRef.current = page; currentPageRef.current = page; }, [page]);
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
    scrollPositions.current.set(currentPageRef.current, window.scrollY);
    if (!adminApp && nextPage === 'chat') {
      if ((session || demo) && window.history.state?.gana777Player) window.history.pushState({ gana777Player: true, page: 'home', chatOverlay: true }, '', window.location.href);
      playerPageRef.current = 'home'; setPage('home'); setChatBubbleOpen(true); return;
    }
    if (!adminApp && (session || demo) && window.history.state?.gana777Player) {
      window.history.pushState({ gana777Player: true, page: nextPage }, '', window.location.href);
    }
    if (nextPage !== 'home') setChatBubbleOpen(false);
    playerPageRef.current = nextPage;
    startTransition(() => setPage(nextPage)); if (nextPage !== 'deposit') setSelectedBonusId(''); setSelectedDepositId(null); setActiveDeposit(null); setApprovedDeposit(null); setError(''); setNotice('');
  }
  useEffect(() => {
    if (adminApp || (!session && !demo)) return;
    if (!playerHistoryReady.current) {
      window.history.replaceState({ gana777Player: true, page: 'home', root: true }, '', window.location.href);
      window.history.pushState({ gana777Player: true, page: 'home', guard: true }, '', window.location.href);
      playerHistoryReady.current = true;
    }
    playerHistoryClosing.current = false;
    const handlePopState = (event: PopStateEvent) => {
      if (playerHistoryClosing.current) return;
      if (document.querySelector('.home-tutorial-backdrop[data-required="true"]')) {
        window.history.pushState({ gana777Player: true, page: 'home', guard: true }, '', window.location.href);
        return;
      }
      const state = event.state as { gana777Player?: boolean; page?: Page; root?: boolean; guard?: boolean } | null;
      if (state?.gana777Player && state.root) {
        setExitConfirmationOpen(true);
        window.history.pushState({ gana777Player: true, page: 'home', guard: true }, '', window.location.href);
        return;
      }
      const previousPage = state?.gana777Player && state.page ? state.page : 'home';
      playerPageRef.current = previousPage;
      setPage(previousPage);
      setChatBubbleOpen(false);
      setSelectedBonusId(''); setSelectedDepositId(null); setActiveDeposit(null); setApprovedDeposit(null); setError(''); setNotice('');
    };
    playerPopHandler.current = handlePopState;
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      if (playerPopHandler.current === handlePopState) playerPopHandler.current = null;
    };
  }, [demo, session?.user.id]);
  function confirmClosePortal() {
    playerHistoryClosing.current = true;
    setExitConfirmationOpen(false);
    if (playerPopHandler.current) window.removeEventListener('popstate', playerPopHandler.current);
    window.close();
    window.history.go(-2);
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
        window.history.replaceState(window.history.state, '', window.location.pathname);
        return;
      }
      if (view === 'wheel' && (!settings.wheel_enabled || wheelEligibilityReady && !wheelEligible)) {
        navigate('home');
        window.history.replaceState(window.history.state, '', window.location.pathname);
        return;
      }
      if (view === 'deposit' || view === 'profile' || view === 'home' || view === 'wheel') {
        if (view === 'profile') setUserHistoryOpen(old => ({ ...old, withdrawal: true }));
        navigate(view);
        window.history.replaceState(window.history.state, '', window.location.pathname);
      }
    }
    openNotification(window.location.href);
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'notification-navigate' && typeof event.data.url === 'string') openNotification(event.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, [session?.user.id, settings.wheel_enabled, wheelEligibilityReady, wheelEligible]);
  useEffect(() => {
    if (adminApp) return;
    if (demo) { setWheelEligible(true); setWheelEligibilityReady(true); return; }
    const userId = session?.user.id;
    if (!userId || !settings.wheel_enabled || !supabase) {
      setWheelEligible(false);
      setWheelEligibilityReady(true);
      return;
    }
    const db = supabase;
    let alive = true;
    const refresh = async () => {
      const { data, error } = await db.rpc('player_wheel_eligible');
      if (!alive) return;
      if (!error) setWheelEligible(data === true);
      setWheelEligibilityReady(true);
    };
    setWheelEligible(false);
    setWheelEligibilityReady(false);
    void refresh();
    const poll = window.setInterval(() => { if (document.visibilityState !== 'hidden') void refresh(); }, 300_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    const channel = db.channel(`wheel-eligibility-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: `user_id=eq.${userId}` }, () => void refresh())
      .subscribe();
    window.addEventListener('focus', refresh);
    return () => { alive = false; window.clearInterval(poll); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', onVisible); void db.removeChannel(channel); };
  }, [demo, session?.user.id, settings.wheel_enabled]);
  useEffect(() => {
    if (adminApp || page !== 'wheel' || !wheelEligibilityReady || settings.wheel_enabled && wheelEligible) return;
    navigate('home');
  }, [page, settings.wheel_enabled, wheelEligibilityReady, wheelEligible]);
  useEffect(() => { window.scrollTo({ top: scrollPositions.current.get(page) ?? 0, behavior: 'instant' }); }, [page]);
  useEffect(() => { if (adminApp && page === 'deposit') window.scrollTo({ top: 0, behavior: 'instant' }); }, [depositPage]);
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
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') closeDepositDetail.current(); };
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
  const selectedReceiptRequest = selectedDepositId ? activeDeposit?.id === selectedDepositId ? activeDeposit : (adminApp && !demo ? depositRows : requests).find(item => item.id === selectedDepositId) : null;
  useEffect(() => {
    setReceiptPreview(null);
    setReceiptPreviewError('');
    setReceiptPreviewLoading(false);
    if (!selectedDepositId) return;
    const request = selectedReceiptRequest;
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
  }, [selectedDepositId, selectedReceiptRequest?.receipt_path, selectedReceiptRequest?.receipt_url, demo]);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setSession(data.session); setLoading(false);
      if (error) setError(publicError(error));
    });
    let previousUser: string | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, value) => {
      const accountChanged = previousUser !== value?.user.id;
      if (accountChanged) { clearResourceCache(); clearViewState(); }
      previousUser = value?.user.id;
      setSession(value);
      if (!value || accountChanged) {
        chatRequestVersion.current++;
        scrollPositions.current.clear();
        bankAssignmentId.current = null;
        setPage('home');
        setError('');
        setNotice('');
        setApprovedDeposit(null);
        setSelectedDepositId(null);
        setReceiptPreview(null);
        setReceiptPreviewError('');
        setReceiptPreviewLoading(false);
        setHistoryRows([]);
        setHistoryTotal(0);
        setHistoryError('');
        setHistoryPage(0);
        setHistoryLoading(false);
        setChatPageState({ total: 0, loading: false });
        setExternalPageState({ total: 0, loading: false });
        setWithdrawalsLoading(false);
        setReviewAmount('');
        setCopiedCreditField(null);
        setWithdrawalPages({ pending: 0, resolved: 0 });
        setWithdrawalTotals({ pending: 0, resolved: 0 });
        setChatHasMore(false);
        setChatLoading(false);
        setChatOlderLoading(false);
        setUserHistoryPages({ deposit: 0, withdrawal: 0 });
        setUserHistoryOpen({ deposit: false, withdrawal: false });
        setPlayerHistory({ deposit: { rows: [], total: 0, loading: false, error: '' }, withdrawal: { rows: [], total: 0, loading: false, error: '' } });
        setChatBubbleOpen(false);
        setRequests([]);
        setWithdrawalParts([]);
        setPartPreview(null);
        setMessages([]);
        setChatInbox([]);
        setExternalChatInbox([]);
        setChatSummary([]);
        setExternalSummary([]);
        setChatQuery({ search: '', filter: 'pending', page: 0 });
        setExternalQuery({ search: '', filter: 'pending', page: 0 });
        setExternalThread('');
        setAccessRequestCount(0);
        setBank(null);
        setBankOperation(null);
        setIsAdmin(false);
        setStaffReady(false);
        setStaffContext({ superAdmin: false, username: '', displayName: '', avatarPath: null, permissions: noStaffPermissions });
        setThread('');
        setDepositRows([]);
        setSharedDeposits(false);
        setActiveDeposit(null);
        setSelectedDepositId(null);
        setApprovedDeposit(null);
        setDepositFilter('available');
        setDepositTotal(0);
        setDepositPage(0);
        setPendingDepositCount(0);
        setPendingWithdrawalCount(0);
        setPlayerWhatsAppUrl(null);
        setPlayerUsername(null);
        setPlayerCasinoUrl(null);

      }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    const db = supabase;
    let alive = true;
    let refreshVersion = 0;
    async function refresh() {
      const version = ++refreshVersion;
      try {
        const requestPromise = adminApp ? Promise.resolve({ data: [] as RequestRow[], error: null }) : Promise.all([
          readRequestPage({ userId: session!.user.id, status: 'pending', size: 10, count: false }),
          readRequestPage({ userId: session!.user.id, kind: 'withdrawal', status: 'approved', latestApproved: true, size: 1, count: false }),
        ]).then(([pending, latest]) => ({ data: [...pending.rows, ...latest.rows], error: null }));
        const pendingWithdrawalsQuery = adminApp
          ? db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'withdrawal').eq('status', 'pending')
          : Promise.resolve({ count: 0, error: null });
        const contextQuery = adminApp ? db.rpc('get_admin_context').single() : Promise.resolve({ data: null, error: null });
        const queueModeQuery = adminApp ? depositQueueEnabled(session!.user.id) : Promise.resolve(false);
        const playerMetadata = adminApp ? Promise.resolve(null) : cachedResource(`player-profile:${session!.user.id}`, 60_000, async () => {
          const [contact, profile, casino] = await Promise.all([
            db.rpc('get_my_whatsapp_url'),
            db.from('user_profiles').select('username').eq('user_id', session!.user.id).maybeSingle(),
            db.from('player_casino_links').select('url').eq('user_id', session!.user.id).maybeSingle(),
          ]);
          return { contact, profile, casino };
        });
        const [requestResult, metadata] = await Promise.all([requestPromise, playerMetadata]);
        const playerContactQuery = Promise.resolve(metadata?.contact ?? { data: null, error: null });
        const playerProfileQuery = Promise.resolve(metadata?.profile ?? { data: null, error: null });
        const playerCasinoQuery = Promise.resolve(metadata?.casino ?? { data: null, error: null });
        const partsQuery = Promise.resolve({ data: [] as WithdrawalPart[], error: null });
        const [r, role, pendingWithdrawals, context, playerContact, playerProfile, playerCasino, partsResult, queueEnabled] = await Promise.all([
          Promise.resolve(requestResult),
          adminApp ? db.rpc('is_admin') : Promise.resolve({ data: false, error: null }),
          pendingWithdrawalsQuery,
          contextQuery,
          playerContactQuery,
          playerProfileQuery,
          playerCasinoQuery,
          partsQuery,
          queueModeQuery,
        ]);
        if (!alive || version !== refreshVersion) return;
        const failure = r.error ?? role.error ?? pendingWithdrawals.error ?? context.error ?? partsResult.error;
        if (failure) { setError(publicError(failure)); return; }
        if (!adminApp) setRequests(r.data as RequestRow[]);
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
          setSharedDeposits(queueEnabled);
          setStaffReady(true);
          const depositScope = queueEnabled ? 'all' : scopedDepositFilter(row?.is_super_admin === true, sacStation);
          let depositCount = depositScope === 'none'
            ? { count: 0, error: null as { message?: string } | null }
            : await (depositScope === 'all'
              ? db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending')
              : db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending').eq('deposit_sac', depositScope));
          if (depositCount.error && missingDepositRoute(depositCount.error)) depositCount = await db.from('request_summaries').select('id', { count: 'exact', head: true }).eq('kind', 'deposit').eq('status', 'pending');
          if (depositCount.error) { setError(publicError(depositCount.error)); return; }
          if (!alive || version !== refreshVersion) return;
          setPendingDepositCount(depositCount.count ?? 0);
          setPendingWithdrawalCount(pendingWithdrawals.count ?? 0);
        }
      } catch (cause) { if (alive) setError(publicError(cause)); }
    }
    void refresh();
    if (adminApp) return () => { alive = false; };
    let lastRefresh = Date.now();
    const onFocus = () => { if (document.visibilityState === 'visible' && Date.now() - lastRefresh > 30_000) { lastRefresh = Date.now(); void refresh(); } };
    window.addEventListener('focus', onFocus);
    const ownUser = `user_id=eq.${session.user.id}`;
    let refreshTimer = 0;
    let refreshing = false;
    let queued = false;
    const schedulePlayerRefresh = () => {
      invalidateResourcePrefix('player-rpc:');
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(async () => {
        if (refreshing) { queued = true; return; }
        refreshing = true;
        await refresh();
        refreshing = false;
        if (alive && queued) { queued = false; schedulePlayerRefresh(); }
        if (currentPageRef.current === 'profile') setHistoryReload(value => value + 1);
      }, 200);
    };
    const channel = db.channel(`updates-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: ownUser }, schedulePlayerRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: ownUser }, payload => {
        if (payload.new.kind === 'withdrawal_paid' && currentPageRef.current === 'profile') setHistoryReload(value => value + 1);
      })
      .subscribe();
    return () => { alive = false; window.clearTimeout(refreshTimer); window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, [session?.user.id, sacStation, adminApp, adminRefresh]);
  useEffect(() => {
    if (adminApp || demo || !session || !supabase || (!chatBubbleOpen && page !== 'chat')) return;
    const db = supabase;
    const controller = new AbortController();
    const version = ++chatRequestVersion.current;
    let alive = true;
    let running = false;
    let queued = false;
    let initialized = false;
    let timer = 0;
    const load = async () => {
      if (running) { queued = true; return; }
      running = true;
      if (!initialized) setChatLoading(true);
      try {
        const [result, links] = await Promise.all([
          db.from('unified_chat_messages').select('id,user_id,sender_id,body,attachment_path,created_at,source,external_thread_id')
            .eq('user_id', session.user.id).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MESSAGE_PAGE_SIZE).abortSignal(controller.signal),
          db.from('external_chat_threads').select('id').eq('linked_user_id', session.user.id).abortSignal(controller.signal),
        ]);
        if (!alive || version !== chatRequestVersion.current) return;
        if (result.error || links.error) throw result.error ?? links.error;
        const linkedIds = new Set((links.data ?? []).map(row => row.id as string));
        const latest = (result.data ?? []) as Message[];
        setMessages(old => mergeMessages(old.filter(row => row.user_id === session.user.id && (row.source !== 'external' || !!row.external_thread_id && linkedIds.has(row.external_thread_id))), latest));
        if (!initialized) setChatHasMore(latest.length === MESSAGE_PAGE_SIZE);
        initialized = true;
      } catch (cause) { if (alive) setError(publicError(cause)); }
      finally {
        running = false;
        if (alive) setChatLoading(false);
        if (alive && queued) { queued = false; void load(); }
      }
    };
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 120); };
    const onFocus = () => { if (document.visibilityState === 'visible') schedule(); };
    void load();
    const channel = db.channel(`player-chat-${session.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${session.user.id}` }, payload => {
        const row = payload.new;
        if (typeof row.id === 'string' && row.user_id === session.user.id && typeof row.body === 'string' && typeof row.created_at === 'string') {
          setMessages(old => mergeMessages(old, [{ ...row, source: 'app' } as Message]));
        } else schedule();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'external_chat_threads', filter: `linked_user_id=eq.${session.user.id}` }, schedule)
      .subscribe();
    window.addEventListener('focus', onFocus);
    return () => { alive = false; controller.abort(); window.clearTimeout(timer); window.removeEventListener('focus', onFocus); void db.removeChannel(channel); };
  }, [adminApp, demo, session?.user.id, chatBubbleOpen, page]);

  async function loadOlderPlayerMessages() {
    if (!supabase || !session || !messages.length || chatOlderLoading) return;
    const version = chatRequestVersion.current;
    const oldest = messages[0];
    setChatOlderLoading(true);
    try {
      const result = await supabase.from('unified_chat_messages').select('id,user_id,sender_id,body,attachment_path,created_at,source,external_thread_id')
        .eq('user_id', session.user.id).or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
        .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(MESSAGE_PAGE_SIZE);
      if (version !== chatRequestVersion.current) return;
      if (result.error) throw result.error;
      setMessages(old => mergeMessages(old, (result.data ?? []) as Message[]));
      setChatHasMore((result.data ?? []).length === MESSAGE_PAGE_SIZE);
    } catch (cause) { if (version === chatRequestVersion.current) setError(publicError(cause)); }
    finally { if (version === chatRequestVersion.current) setChatOlderLoading(false); }
  }

  useEffect(() => {
    if (adminApp || demo || !session || page !== 'profile') return;
    const controller = new AbortController();
    let alive = true;
    for (const kind of ['deposit', 'withdrawal'] as const) {
      if (!userHistoryOpen[kind]) continue;
      setPlayerHistory(old => ({ ...old, [kind]: { ...old[kind], loading: true, error: '' } }));
      void (async () => {
        try {
          const result = await readRequestPage({ userId: session.user.id, kind, size: 5, page: userHistoryPages[kind], signal: controller.signal });
          const lastPage = Math.max(0, Math.ceil(result.total / 5) - 1);
          if (!alive) return;
          if (userHistoryPages[kind] > lastPage) { setUserHistoryPages(old => ({ ...old, [kind]: lastPage })); return; }
          const parts = kind === 'withdrawal' ? await readWithdrawalParts(result.rows.map(row => row.id), controller.signal) : [];
          if (!alive) return;
          setPlayerHistory(old => ({ ...old, [kind]: { ...result, loading: false, error: '' } }));
          if (kind === 'withdrawal') setWithdrawalParts(parts);
        } catch (cause) { if (alive) setPlayerHistory(old => ({ ...old, [kind]: { ...old[kind], loading: false, error: publicError(cause) } })); }
      })();
    }
    return () => { alive = false; controller.abort(); };
  }, [adminApp, demo, session?.user.id, page, userHistoryOpen, userHistoryPages, historyReload]);

  useEffect(() => {
    if (adminApp || demo || !session || !supabase) return;
    const db = supabase;
    const signedInAt = Date.parse(session.user.last_sign_in_at ?? session.user.created_at ?? '');
    let alive = true;
    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      const { data, error } = await db.rpc('get_my_session_revoked_at');
      if (!alive || error || !data || !signedInAt) return;
      if (Date.parse(String(data)) > signedInAt) {
        await db.auth.signOut();
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    void check();
    const timer = window.setInterval(() => void check(), 180_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [adminApp, demo, session?.user.id, session?.user.last_sign_in_at, session?.user.created_at]);
  useEffect(() => {
    if (!adminApp || page !== 'withdrawal' || !session || !supabase || !staffReady || (!staffContext.superAdmin && !staffContext.permissions.withdrawal)) return;
    let alive = true;
    const controller = new AbortController();
    setWithdrawalsLoading(true);
    void (async () => {
      try {
        const [pending, resolved] = await Promise.all([
          readRequestPage({ kind: 'withdrawal', status: 'pending', ascending: true, page: withdrawalPages.pending, size: 10, signal: controller.signal }),
          readRequestPage({ kind: 'withdrawal', resolved: true, page: withdrawalPages.resolved, size: 10, signal: controller.signal }),
        ]);
        if (!alive) return;
        const pages = { pending: Math.min(withdrawalPages.pending, Math.max(0, Math.ceil(pending.total / 10) - 1)), resolved: Math.min(withdrawalPages.resolved, Math.max(0, Math.ceil(resolved.total / 10) - 1)) };
        if (pages.pending !== withdrawalPages.pending || pages.resolved !== withdrawalPages.resolved) { setWithdrawalPages(pages); return; }
        const rows = [...pending.rows, ...resolved.rows];
        const parts = await readWithdrawalParts(rows.map(row => row.id), controller.signal);
        if (!alive) return;
        setRequests(rows);
        setWithdrawalParts(parts);
        setWithdrawalTotals({ pending: pending.total, resolved: resolved.total });
      } catch (cause) { if (alive) setError(publicError(cause)); }
      finally { if (alive) setWithdrawalsLoading(false); }
    })();
    return () => { alive = false; controller.abort(); };
  }, [adminApp, page, session?.user.id, withdrawalReload, withdrawalPages, staffReady, staffContext.superAdmin, staffContext.permissions.withdrawal]);
  useEffect(() => {
    if (!adminApp || !session || !supabase || !staffReady || (!staffContext.superAdmin && !staffContext.permissions.chat)) { setChatSummary([]); return; }
    const db = supabase;
    let alive = true;
    const controller = new AbortController();
    let requestVersion = 0;
    async function refreshInbox() {
      const version = ++requestVersion;
      const rows: ChatSummary[] = [];
      const pageSize = 500;
      for (let offset = 0; alive; offset += pageSize) {
        const { data, error } = await db.from('chat_inbox')
          .select('user_id,last_sender_id,completed_at')
          .order('last_created_at', { ascending: false }).order('last_message_id', { ascending: false })
          .range(offset, offset + pageSize - 1).abortSignal(controller.signal);
        if (!alive || version !== requestVersion) return;
        if (error) { setError('No pudimos cargar la bandeja de chat. Actualizá el panel e intentá de nuevo.'); return; }
        rows.push(...((data ?? []) as ChatSummary[]));
        if (!data || data.length < pageSize) break;
      }
      if (alive && version === requestVersion) setChatSummary(rows);
    }
    void refreshInbox();
    return () => { alive = false; controller.abort(); };
  }, [session?.user.id, chatReload, staffReady, staffContext.superAdmin, staffContext.permissions.chat]);
  useEffect(() => {
    if (!adminApp || !session || !supabase || demo || (!staffContext.superAdmin && !staffContext.permissions.external_chat)) {
      setExternalChatInbox([]); setExternalSummary([]);
      return;
    }
    const db = supabase;
    let alive = true;
    let requestVersion = 0;
    async function refreshExternalInbox() {
      const version = ++requestVersion;
      const rows: ExternalSummary[] = [];
      const pageSize = 500;
      for (let offset = 0; alive; offset += pageSize) {
        const { data, error } = await db.from('external_chat_inbox')
          .select('thread_id,last_sender_type,completed_at')
          .order('last_message_at', { ascending: false }).order('last_message_id', { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (!alive || version !== requestVersion) return;
        if (error) { setError('No pudimos cargar la bandeja de chat externo. Actualizá el panel e intentá de nuevo.'); return; }
        rows.push(...((data ?? []) as ExternalSummary[]));
        if (!data || data.length < pageSize) break;
      }
      if (alive && version === requestVersion) setExternalSummary(rows);
    }
    void refreshExternalInbox();
    return () => { alive = false; };
  }, [session?.user.id, externalChatReload, demo, staffContext.superAdmin, staffContext.permissions.external_chat]);
  useEffect(() => {
    if (!adminApp || demo || !session || (page !== 'chat' && page !== 'external-chat')) return;
    const external = page === 'external-chat';
    const directory = external ? externalSummary : chatSummary;
    const query = external ? externalQuery : chatQuery;
    const updateState = external ? setExternalPageState : setChatPageState;
    const controller = new AbortController();
    updateState(old => ({ ...old, loading: true }));
    const timer = window.setTimeout(async () => {
      try {
        const ids = inboxIds(directory, query.filter);
        const result = external
          ? await readInboxPage<ExternalChatInboxRow>('external_chat_inbox', ids, query.search, query.page, controller.signal)
          : await readInboxPage<ChatInboxRow>('chat_inbox', ids, query.search, query.page, controller.signal);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(0, Math.ceil(result.total / 50) - 1);
        if (query.page > lastPage) { (external ? setExternalQuery : setChatQuery)(old => ({ ...old, page: lastPage })); return; }
        if (external) setExternalChatInbox(result.rows as ExternalChatInboxRow[]);
        else setChatInbox(result.rows as ChatInboxRow[]);
        updateState({ total: result.total, loading: false });
      } catch (cause) { if (!controller.signal.aborted) { updateState(old => ({ ...old, loading: false })); setError(publicError(cause)); } }
    }, query.search ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [adminApp, demo, session?.user.id, page, chatSummary, externalSummary, chatQuery, externalQuery]);
  useEffect(() => {
    if (!adminApp || !session || !supabase || (!staffContext.superAdmin && !staffContext.permissions.access_requests) || demo) { setAccessRequestCount(0); return; }
    let alive = true;
    const refreshCount = async () => {
      try {
        const data = await invokeAdminPlayerAccess({ action: 'admin-count' });
        if (alive) setAccessRequestCount(Number(data.pending_count) || 0);
      } catch (error) {
        if (error instanceof AccessSessionError && alive) setAccessRequestCount(0);
      }
    };
    void refreshCount();
    return () => { alive = false; };
  }, [session?.user.id, staffContext.superAdmin, staffContext.permissions.access_requests, demo, adminRefresh]);
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
    const timer = window.setInterval(() => { if (document.visibilityState !== 'hidden') refreshBankState(); }, 180_000);
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
    if (first) navigate(staffPermissionRoute[first]);
  }, [page, isAdmin, demo, staffContext]);
  useEffect(() => {
    if (!adminApp || demo || page !== 'deposit' || !session || !supabase || !staffReady) return;
    const db = supabase;
    let alive = true;
    const depositScope = sharedDeposits ? 'all' : scopedDepositFilter(staffContext.superAdmin, sacStation);
    if (depositScope === 'none') { setDepositRows([]); setDepositTotal(0); setDepositLoading(false); return; }
    setDepositLoading(true);
    setDepositReadError('');
    const controller = new AbortController();
    const from = depositPage * DEPOSIT_PAGE_SIZE;
    void (async () => {
      if (sharedDeposits) {
        try {
          const result = await readDepositQueue(depositFilter, depositPage, controller.signal);
          if (!alive) return;
          const next = depositWindow(depositPage, result.total);
          setDepositTotal(result.total);
          setPendingDepositCount(result.pending_count);
          if (next.current !== depositPage) { setDepositPage(next.current); return; }
          setDepositRows(result.rows);
        } catch (cause) { if (alive) { setDepositRows([]); setDepositReadError(publicError(cause)); } }
        finally { if (alive) setDepositLoading(false); }
        return;
      }
      let scoped = db.from('request_summaries').select(REQUEST_COLUMNS, { count: 'exact' }).eq('kind', 'deposit').order('created_at', { ascending: false }).order('id', { ascending: false });
      if (depositScope !== 'all') scoped = scoped.eq('deposit_sac', depositScope);
      const firstPage = await scoped.range(from, from + DEPOSIT_PAGE_SIZE - 1);
      const pageResult = missingBonusAmount(firstPage.error) || missingDepositRoute(firstPage.error)
        ? await db.from('request_summaries').select(REQUEST_COLUMNS_LEGACY, { count: 'exact' }).eq('kind', 'deposit').order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + DEPOSIT_PAGE_SIZE - 1)
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
    return () => { alive = false; controller.abort(); };
  }, [session, page, demo, depositPage, depositReload, staffReady, staffContext.superAdmin, sacStation, sharedDeposits, depositFilter]);
  useEffect(() => {
    if (!adminApp || !sharedDeposits || demo || page !== 'deposit' || !session || !supabase) return;
    const db = supabase;
    let timer = 0;
    let dirty = false;
    let lastRefresh = Date.now();
    const refresh = () => {
      dirty = true;
      if (document.visibilityState === 'hidden' || timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        if (document.visibilityState === 'hidden') return;
        dirty = false; lastRefresh = Date.now();
        setDepositReload(value => value + 1);
      }, 600);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (dirty || Date.now() - lastRefresh > 15_000)) refresh();
    };
    const channel = db.channel(`deposit-queue-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deposit_claims' }, payload => {
        const next = payload.new as { request_id?: string; claim_token?: string };
        const { selected, approved } = depositOperation.current;
        if ([selected, approved].some(row => row?.id === next.request_id && row?.claim_token !== next.claim_token)) {
          setSelectedDepositId(null); setActiveDeposit(null); setApprovedDeposit(null);
          setNotice('La asignación de esta carga cambió. Volvé a abrirla antes de continuar.');
        }
        refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'requests', filter: 'kind=eq.deposit' }, refresh)
      .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
      void db.removeChannel(channel);
    };
  }, [sharedDeposits, demo, page, session?.user.id]);
  useEffect(() => {
    if (!adminApp || page !== 'history' || demo || !session || !supabase || !staffReady) return;
    const db = supabase;
    let alive = true;
    const pageSize = 35;
    const from = historyPage * pageSize;
    const historyScope = historyKind === 'deposit' && !sharedDeposits ? scopedDepositFilter(staffContext.superAdmin, sacStation) : 'all';
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
  }, [session, page, demo, historyKind, historyPage, historyReload, staffReady, staffContext.superAdmin, sacStation, sharedDeposits]);

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
      invalidateResourcePrefix('player-rpc:');
      setRequests(old => [row, ...old.filter(r => r.id !== row.id)]);
      setHistoryReload(value => value + 1);
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
        setMessages(old => mergeMessages(old, [data as Message])); element.reset();
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
    setSharedDeposits(true);
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
    writeDevicePreference(SAC_STATION_KEY, String(chosen));
    setSacStation(chosen);
    setDepositPage(0);
    setHistoryPage(0);
  }
  const feedback = <>{error && <div role="alert" className="alert error">{error}</div>}{notice && <div role="status" className="alert">{notice}</div>}</>;
  if (!adminApp && (!initialReady || initialError)) return <PortalBootScreen error={initialError} onRetry={retryInitialLoad} />;
  if (adminApp && session && !staffReady && !error) return <main className="login"><Brand panel /><ViewLoading /></main>;
  if (loading) return <main className="login"><Brand panel={adminApp} /><p>Cargando tu cuenta…</p></main>;
  if (!session && !demo) return <LoginView admin={adminApp} busy={busy} retryAt={loginRetryAt} siteKey={turnstileSiteKey} configured={!!supabase} feedback={<>{configError && <div role="alert" className="alert error">{configError}</div>}{feedback}</>} onLogin={login} onDemo={startDemo} />;

  function history(kind?: RequestRow['kind']) {
    const adminHistory = adminApp && page === 'history' && kind === undefined;
    const currentKind = adminHistory ? historyKind : kind;
    const remoteHistory = !adminApp && !demo && kind ? playerHistory[kind] : null;
    const items = remoteHistory ? remoteHistory.rows : adminHistory ? demo ? requests.filter(r => r.kind === historyKind) : historyRows : requests.filter(r => (adminApp || r.user_id === userId) && (!kind || r.kind === kind));
    const paginated = !adminApp && page === 'profile' && kind !== undefined;
    const window = paginated ? userHistoryWindow(userHistoryPages[kind], remoteHistory?.total ?? items.length) : null;
    const pageSize = 35;
    const adminPages = Math.max(1, Math.ceil((demo ? requests.filter(r => r.kind === historyKind).length : historyTotal) / pageSize));
    const adminCurrent = Math.min(historyPage, adminPages - 1);
    const visibleItems = adminHistory ? demo ? items.slice(adminCurrent * pageSize, (adminCurrent + 1) * pageSize) : items : window && !remoteHistory ? items.slice(window.from, window.to) : items;
    const heading = adminApp
      ? currentKind === 'deposit' ? 'Cargas' : currentKind === 'withdrawal' ? 'Retiros' : page === 'history' ? 'Historial' : 'Solicitudes'
      : kind === 'deposit' ? 'Historial de cargas' : 'Tus retiros';
    const empty = currentKind === 'deposit' ? adminApp ? 'Todavía no hay cargas.' : 'Todavía no tenés recargas.' : currentKind === 'withdrawal' ? adminApp ? 'Todavía no hay retiros.' : 'Todavía no tenés retiros.' : 'Todavía no hay solicitudes.';
    const isOpen = !paginated || (kind ? userHistoryOpen[kind] : true);
    return <section className={`card history-card${isOpen ? ' is-open' : ''}`} id={!adminApp && kind ? `user-${kind}-history` : undefined}>{adminHistory ? <><div className="admin-history-heading"><h2><Clock size={23} />Historial</h2><div className="admin-history-tabs" role="tablist" aria-label="Tipo de historial">{(['deposit', 'withdrawal'] as const).map(item => <button type="button" role="tab" aria-selected={historyKind === item} className={historyKind === item ? 'active' : ''} key={item} onClick={() => { setHistoryKind(item); setHistoryPage(0); }}>{item === 'deposit' ? 'Cargas' : 'Retiros'}</button>)}</div></div>{historyError && <p className="alert error" role="alert">{historyError}</p>}{historyKind === 'deposit' && !sharedDeposits && !demo && !staffContext.superAdmin && !sacStation ? <p className="shift-note">Elegí el SAC de esta computadora en Cargas para ver su historial.</p> : null}</> : <h2>{paginated && kind ? <button type="button" className="history-toggle" aria-expanded={isOpen} aria-controls={`user-${kind}-history-content`} onClick={() => setUserHistoryOpen(old => ({ ...old, [kind]: !old[kind] }))}><Clock size={23} /><span>{heading}</span><small>{remoteHistory ? userHistoryOpen[kind] ? remoteHistory.total : 'Ver' : items.length}</small><ChevronRight className="history-toggle-chevron" size={20} /></button> : <><Clock size={23} />{heading}</>}</h2>}
      {isOpen && <div id={paginated && kind ? `user-${kind}-history-content` : undefined}>
      {remoteHistory?.error && <p className="alert error" role="alert">{remoteHistory.error}</p>}
      {(adminHistory && historyLoading) || remoteHistory?.loading ? <p className="empty">Cargando historial…</p> : !items.length ? <p className="empty">{empty}</p> : visibleItems.map(r => {
        const requestParts = !adminApp && r.kind === 'withdrawal' ? withdrawalParts.filter(part => part.request_id === r.id).sort((a, b) => a.part_number - b.part_number) : [];
        return <article className={`movement${requestParts.length ? ' user-withdrawal-movement' : ''}`} key={r.id}>
        <div><strong>{money(r.amount)}</strong><small>{r.kind === 'deposit' ? 'Carga' : 'Retiro'} · {date(r.created_at)}</small>{requestedBonus(r) && <small>Bono solicitado: {requestedBonus(r)}</small>}
          {adminApp && <><small>Usuario: {r.user_name || 'Sin nombre'}</small>{sharedDeposits && !demo && r.kind === 'deposit' && <DepositClaimHistory requestId={r.id} />}{r.holder && <small>{r.holder} · {r.cbu} · {r.alias}</small>}</>}
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
        <button type="button" disabled={window.current === 0 || remoteHistory?.loading} onClick={() => setUserHistoryPages(value => ({ ...value, [kind]: window.current - 1 }))}>Anterior</button>
        <span>{window.current + 1} de {window.pages}</span>
        <button type="button" disabled={window.current + 1 >= window.pages || remoteHistory?.loading} onClick={() => setUserHistoryPages(value => ({ ...value, [kind]: window.current + 1 }))}>Siguiente</button>
      </div>}
      </div>}
    </section>;
  }
  function depositList() {
    const demoDeposits: QueueDeposit[] = requests.filter(request => request.kind === 'deposit').sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
    const actor = session?.user.id ?? (demo ? 'demo-operator' : '');
    const demoQueue = sharedDeposits ? demoDeposits.filter(row => depositFilter === 'all' ? row.status === 'pending' || row.status === 'approved' || row.status === 'rejected' : row.status === 'pending' && !row.credited_at && (depositFilter === 'mine' ? ownsDeposit(row, actor) : !row.claimed_by)) : demoDeposits;
    const total = demo ? demoQueue.length : depositTotal;
    const pager = depositWindow(depositPage, total);
    const items = demo ? demoQueue.slice(pager.from, pager.to + 1) : depositRows;
    const selected = selectedDepositId && activeDeposit?.id === selectedDepositId ? activeDeposit : (demo ? demoDeposits : depositRows).find(request => request.id === selectedDepositId) ?? null;
    const canWorkSelected = !sharedDeposits || !!selected && ownsDeposit(selected, actor);
    async function openDeposit(request: QueueDeposit) {
      await action(async () => {
        const shouldTake = sharedDeposits && request.status === 'pending' && !request.credited_at && (ownsDeposit(request, actor) || !request.claimed_by);
        let row = request;
        if (shouldTake) {
          try {
            row = demo ? { ...request, claimed_by: actor, claimed_name: 'Vos', claim_token: request.claim_token ?? crypto.randomUUID(), claimed_at: request.claimed_at ?? new Date().toISOString() } : await takeDeposit(request.id);
          } finally {
            if (!demo && currentSessionId.current === actor) setDepositReload(value => value + 1);
          }
          if (demo) setRequests(old => old.map(item => item.id === row.id ? row : item));
        }
        if (currentPageRef.current !== 'deposit' || !demo && currentSessionId.current !== actor) return;
        setActiveDeposit(row);
        setSelectedDepositId(row.id);
        setReviewAmount(canonicalMoney(row.amount));
        setReviewGrantBonus(true);
      });
    }
    function dismissDeposit() {
      if (busy) { setSelectedDepositId(null); return; }
      const shouldRelease = sharedDeposits && !!selected && ownsDeposit(selected, actor) && selected.status === 'pending' && !selected.credited_at;
      if (shouldRelease) void releaseSelected();
      else setSelectedDepositId(null);
    }
    closeDepositDetail.current = dismissDeposit;
    async function releaseSelected() {
      if (!selected) return;
      await action(async () => {
        if (demo) setRequests(old => old.map(item => item.id === selected.id ? { ...item, claimed_by: null, claimed_name: null, claim_token: null, claimed_at: null } : item));
        else await releaseDeposit(selected);
        if (!demo && currentSessionId.current !== actor) return;
        setSelectedDepositId(null); setActiveDeposit(null); setDepositReload(value => value + 1);
        setNotice('Carga liberada. Volvió a Disponibles.');
      });
    }
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
        const reviewed = { ...selected, status, credited_at: status === 'approved' ? new Date().toISOString() : selected.credited_at, credit_started_at: status === 'approved' ? new Date().toISOString() : null };
        setRequests(old => old.map(item => item.id === selected.id ? reviewed : item));
        setSelectedDepositId(null);
        setActiveDeposit(null);
        if (status === 'approved') setNotice('Carga registrada.');
        return;
      }
      await action(async () => {
        const special = !!selected.requested_special_bonus_id;
        const actual = readMoney(reviewAmount);
        if (status === 'approved' && special && actual === null) throw new InputError('Ingresá el monto que llegó realmente.');
        let reviewed: QueueDeposit;
        if (sharedDeposits) reviewed = await reviewQueueDeposit(selected, status, actual, reviewGrantBonus);
        else {
          const { data, error } = status === 'approved' && special
            ? await db.rpc('review_special_deposit', { p_request_id: parseUuid(selected.id), p_actual_amount: actual, p_apply_bonus: reviewGrantBonus })
            : await db.from('requests').update({ status }).eq('id', parseUuid(selected.id)).eq('status', 'pending').select('id,status').single();
          if (error) throw error;
          reviewed = { ...selected, ...data, status: data.status as RequestRow['status'] };
        }
        if (currentSessionId.current !== actor) return;
        const current = depositOperation.current.selected;
        const stillReviewing = currentPageRef.current === 'deposit' && current?.id === selected.id
          && (!sharedDeposits || current.claim_token === selected.claim_token);
        if (stillReviewing) setActiveDeposit(reviewed);
        if (sharedDeposits) setDepositReload(value => value + 1);
        setDepositRows(old => old.map(item => item.id === selected.id ? reviewed : item));
        if (selected.status === 'pending') setPendingDepositCount(count => Math.max(0, count - 1));
        if (status === 'approved' && stillReviewing) {
          setApprovedDeposit(reviewed);
          setCopiedCreditField(null);
          setSelectedDepositId(null);
          setActiveDeposit(null);
        }
        else if (status === 'rejected' && stillReviewing) { setSelectedDepositId(null); setActiveDeposit(null); setNotice('La carga quedó como no cargada.'); }
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
        let result: { notification_id: string; newly_credited: boolean };
        if (sharedDeposits) result = await confirmQueueCredit(approvedDeposit);
        else {
          const { data, error } = await db.rpc('confirm_deposit_credit', { p_request_id: approvedDeposit.id });
          if (error) throw error;
          result = data as { notification_id: string; newly_credited: boolean };
        }
        if (currentSessionId.current !== actor) return;
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
    const selectedAmount = selected?.requested_special_bonus_id ? readMoney(reviewAmount) ?? selected.amount : selected?.amount ?? 0;
    const selectedAppliesBonus = !!selected && (!selected.requested_special_bonus_id || reviewGrantBonus);
    const selectedCredit = selected ? creditAmounts(selectedAmount, selectedAppliesBonus ? selected.bonus_percent : 0, selectedAppliesBonus ? selected.bonus_amount ?? 0 : 0) : creditAmounts(0, 0);
    const selectedExternalBonus = !!selected && selectedAppliesBonus && selected.bonus_reward_type === 'free_spins';
    const selectedBonusValue = selectedExternalBonus
      ? selected.bonus_reward_label || 'Giros gratis'
      : selectedCredit.bonus > 0 ? `+${money(selectedCredit.bonus)}` : 'Sin bono';
    const waitingForSac = !sharedDeposits && !demo && !staffContext.superAdmin && !sacStation;
    const route = selected ? depositRouteLabel(selected, !sharedDeposits && staffContext.superAdmin) : '';
    return <section className="admin-loads" aria-labelledby="loads-title">
      {!sharedDeposits && !demo && !staffContext.superAdmin ? <SacBoard demo={demo} busy={busy} action={action} scope="local" station={sacStation} onStation={chooseSac} /> : null}
      <div className="loads-heading">
        <h1 id="loads-title">Cargas</h1>
        <span className="loads-count">{waitingForSac ? 'SAC sin elegir' : `${total} ${total === 1 ? 'solicitud' : 'solicitudes'}`}</span>
      </div>
      {sharedDeposits && <><p className="deposit-queue-description">Disponibles son las que nadie tomó. Todas junta esas, las que están en atención y las ya cargadas, de 30 en 30.</p><div className="deposit-queue-tabs" role="tablist" aria-label="Filtrar cargas">{([['available', 'Disponibles'], ['all', 'Todas']] as const).map(([key, label]) => <button type="button" role="tab" aria-selected={depositFilter === key} key={key} disabled={busy} onClick={() => { setDepositRows([]); setDepositPage(0); setDepositFilter(key); }}>{label}</button>)}</div></>}
      {depositReadError ? <div className="alert error" role="alert">{depositReadError}<button type="button" onClick={() => setDepositReload(value => value + 1)}>Reintentar</button></div> : waitingForSac ? null : depositLoading && !items.length ? <p className="empty">Cargando cargas…</p> : !items.length ? <section className="card empty loads-empty"><WalletCards size={34} /><strong>No hay solicitudes de carga</strong><p>{sharedDeposits ? depositFilter === 'available' ? 'No quedan cargas disponibles. En Todas está el historial.' : 'No hay cargas en el historial.' : staffContext.superAdmin || demo ? 'Las nuevas cargas aparecerán en esta lista.' : 'Las cargas de los teléfonos de este SAC aparecerán en esta lista.'}</p></section> : <div className="loads-list">
        {items.map(request => {
          const name = request.user_name || 'Usuario sin nombre';
          const requestRoute = depositRouteLabel(request, !sharedDeposits && (staffContext.superAdmin || demo));
          return <button className="load-request-button" key={request.id} disabled={busy || depositLoading} onClick={event => { depositTrigger.current = event.currentTarget; void openDeposit(request); }} aria-haspopup="dialog">
              <span className="request-avatar" aria-hidden="true">{name.charAt(0).toLocaleUpperCase('es')}</span>
              <span className="request-summary-user"><strong>{name}</strong><small>{date(request.created_at)}</small>{requestRoute ? <small className="request-route">{requestRoute}</small> : null}</span>
              <span className="request-summary-amount"><strong>{money(request.amount)}</strong><span className={`badge ${request.status}`}>{sharedDeposits ? depositClaimLabel(request, actor) : request.credited_at ? 'Acreditada' : statusLabel[request.status]}</span>{sharedDeposits && <small>{request.status === 'pending' && !request.credited_at ? ownsDeposit(request, actor) ? 'Continuar' : request.claimed_by ? 'Ver quién la tiene' : 'Abrir y tomar' : 'Ver detalle'}</small>}</span>
              <ChevronRight className="request-chevron" aria-hidden="true" />
            </button>;
        })}
      </div>}
      {total > 0 && <nav className="loads-pager" aria-label="Páginas de cargas"><button type="button" disabled={pager.current === 0 || depositLoading} onClick={() => { setSelectedDepositId(null); setDepositPage(pager.current - 1); }}>Anterior</button><span>Página {pager.current + 1} de {pager.pages}</span><button type="button" disabled={pager.current + 1 >= pager.pages || depositLoading} onClick={() => { setSelectedDepositId(null); setDepositPage(pager.current + 1); }}>Siguiente</button></nav>}
      {selected && <div className="load-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) dismissDeposit(); }}>
        <section className="load-modal" role="dialog" aria-modal="true" aria-label="Revisión de solicitud de carga">
          <button className="load-modal-close" aria-label="Cerrar detalle" title={sharedDeposits && ownsDeposit(selected, actor) && selected.status === 'pending' ? 'Devolver a Disponibles' : 'Cerrar'} autoFocus onClick={() => dismissDeposit()}><X /></button>
          <div className="load-modal-summary">
            <div className="summary-field summary-amount"><span><WalletCards size={16} /> Monto solicitado</span><strong>{money(selected.amount)}</strong></div>
            <div className="summary-field"><span><UserRound size={16} /> Nombre del usuario</span><strong>{selectedName}</strong></div>
            <div className="summary-field"><span><Hash size={16} /> Solicitud</span><strong title={selected.id}>{selected.id.slice(0, 8)}</strong></div>
            <div className="summary-field"><span><CalendarClock size={16} /> Fecha y hora</span><strong>{date(selected.created_at)}</strong></div>
            {route ? <div className="summary-field"><span>Cuenta de destino</span><strong>{route}</strong></div> : null}
          <div className="summary-review-meta"><span>Estado <span className={`badge ${selected.status}`}>{selected.credited_at ? 'Acreditada' : statusLabel[selected.status]}</span></span>{selectedBonus && <span>Bono solicitado: <strong>{selectedBonus}{!selectedExternalBonus && selectedCredit.bonus > 0 ? ` · ${money(selectedCredit.bonus)}` : ''}</strong></span>}{selected.bonus_load_number && <span>Carga n.º <strong>{selected.bonus_load_number}</strong></span>}{selected.requested_special_bonus_id && !selected.bonus_id && selected.status === 'approved' && <span>Bono especial solicitado; {selected.credited_at ? 'acreditada' : 'aprobada'} sin bono</span>}</div>
          </div>
          {sharedDeposits && <div className="deposit-claim-status" role="status"><strong>{depositClaimLabel(selected, actor)}</strong>{selected.claimed_at && <small>Tomada el {date(selected.claimed_at)}</small>}{canWorkSelected && selected.status === 'pending' && <button type="button" disabled={busy} onClick={() => void releaseSelected()}>Liberar carga</button>}</div>}
          {sharedDeposits && !demo && <DepositClaimHistory key={selected.id} requestId={selected.id} />}
          {canWorkSelected && selected.status === 'pending' && <section className="deposit-credit-card" aria-label="Resumen para acreditar">
            <div className="deposit-credit-card-heading"><span>Datos para acreditar</span><small>El total se calcula automáticamente.</small></div>
            <div className="credit-copy-field"><span>Usuario</span><div><strong>{selectedName}</strong><button type="button" aria-label="Copiar nombre de usuario" onClick={() => void copyCreditValue(selectedName, 'user')}>{copiedCreditField === 'user' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar</>}</button></div></div>
            <div className="credit-breakdown deposit-credit-breakdown">
              <div><span>Carga recibida</span><strong>{money(selectedAmount)}</strong></div>
              <div><span>{selectedExternalBonus ? 'Premio adicional' : 'Bono'}</span><strong>{selectedExternalBonus ? selectedBonusValue : selectedCredit.bonus > 0 ? selectedBonusValue : 'Sin bono'}</strong></div>
            </div>
            <div className="credit-copy-field credit-total"><span>{selectedExternalBonus ? 'Total de dinero' : 'Total a acreditar'}</span><div><strong>{money(selectedCredit.total)}</strong><button type="button" aria-label="Copiar total a acreditar" onClick={() => void copyCreditValue(selectedCredit.copyValue, 'amount')}>{copiedCreditField === 'amount' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar total</>}</button></div><small>Se copiará {selectedCredit.copyValue}, listo para pegar.</small></div>
          </section>}
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
          {canWorkSelected && selected.status === 'pending' && selected.requested_special_bonus_id && <div className="special-deposit-review">
            <label>Monto realmente recibido<input inputMode="decimal" value={reviewAmount} onChange={event => setReviewAmount(event.target.value)} /></label>
            <p>Solicitó {money(selected.amount)}. El monto que pongas acá será el que se acredite.</p>
            <label><input type="radio" name="special-review-bonus" checked={reviewGrantBonus} onChange={() => setReviewGrantBonus(true)} /> Acreditar con bono {selectedBonus}</label>
            <label><input type="radio" name="special-review-bonus" checked={!reviewGrantBonus} onChange={() => setReviewGrantBonus(false)} /> Acreditar solo el dinero recibido, sin bono</label>
            {(() => { const actual = readMoney(reviewAmount); const min = Number(selected.special_min_amount) || 0; const max = Number(selected.special_max_amount) || 0; return actual !== null && (actual < min || actual > max) ? <p className="alert error">El monto recibido no cumple el rango de {money(min)} a {money(max)}. Elegí «sin bono».</p> : null; })()}
          </div>}
          {canWorkSelected && selected.status === 'pending' && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => void reviewSelected('approved')}>Confirmar carga</button><button className="reject-load" disabled={busy} onClick={() => { if (window.confirm('¿Confirmás que esta carga no se hizo? Esta acción no se puede deshacer.')) void reviewSelected('rejected'); }}>No se cargó</button></div>}
          {!sharedDeposits && canWorkSelected && selected.status === 'approved' && !selected.credited_at && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => { setApprovedDeposit(selected); setSelectedDepositId(null); }}>Ver datos para acreditar</button></div>}
          {selected.credited_at && <div className="load-decision-footer"><button className="approve-load" disabled={busy} onClick={() => void retryCreditPush(selected.id)}>Comprobar o reenviar aviso</button></div>}
        </section>
      </div>}
      {approvedDeposit && <div className="load-modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setApprovedDeposit(null); }}>
        <section className="credit-ready-modal" role="dialog" aria-modal="true" aria-labelledby="credit-ready-title">
          <button className="load-modal-close" aria-label="Cerrar datos de acreditación" autoFocus onClick={() => setApprovedDeposit(null)}><X /></button>
          <div className="credit-ready-heading"><CheckCircle2 aria-hidden="true" /><span className="eyebrow">CARGA ACEPTADA</span><h2 id="credit-ready-title">Datos listos para acreditar</h2><p>Copiá estos valores y pegalos en la plataforma.</p></div>
          <div className="credit-copy-field"><span>Nombre de usuario</span><div><strong>{approvedName}</strong><button aria-label="Copiar nombre de usuario" onClick={() => void copyCreditValue(approvedName, 'user')}>{copiedCreditField === 'user' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar</>}</button></div></div>
          <div className="credit-breakdown">
            <div><span>Carga recibida</span><strong>{money(approvedDeposit.amount)}</strong></div>
            <div><span>{approvedBonus ? approvedDeposit.bonus_reward_type === 'free_spins' ? `Premio externo · ${approvedBonus}` : `Bono ${approvedBonus}` : 'Sin bono'}</span><strong>{approvedBonus && approvedDeposit.bonus_reward_type === 'free_spins' ? 'Giros gratis' : credit.bonus > 0 ? `+${money(credit.bonus)}` : 'Sin bono'}</strong></div>
          </div>
          <div className="credit-copy-field credit-total"><span>Total a acreditar</span><div><strong>{money(credit.total)}</strong><button aria-label="Copiar total a acreditar" onClick={() => void copyCreditValue(credit.copyValue, 'amount')}>{copiedCreditField === 'amount' ? <><Check size={17} /> Copiado</> : <><Copy size={17} /> Copiar monto</>}</button></div><small>Se copiará {credit.copyValue}, listo para pegar.</small></div>
          {!demo && <ApprovedReferralNotice requestId={approvedDeposit.id} />}
          <div className="credit-confirm-actions"><button className="credit-done" disabled={busy} onClick={() => void confirmCredit()}>Ya acredité el total</button><button type="button" disabled={busy} onClick={() => setApprovedDeposit(null)}>Cerrar sin confirmar</button></div>
        </section>
      </div>}
    </section>;
  }
  function bonusBoard() {
    return <BonusCounterAdmin demo={demo} demoCounters={demo ? bonusCounters(requests.filter(row => row.status === 'approved')) : []} />;
  }
  const displayName: unknown = session?.user.user_metadata?.display_name;
  const name = (typeof displayName === 'string' ? displayName.trim().slice(0, 80) : '') || session?.user.email?.split('@')[0] || 'bienvenido';
  const pendingCounts = {
    deposit: demo ? pendingRequestCount(requests, 'deposit') : pendingDepositCount,
    withdrawal: adminApp && !demo ? pendingWithdrawalCount : pendingRequestCount(requests, 'withdrawal'),
    chat: pendingChatCount(demo ? chatInbox : chatSummary),
    externalChat: (demo ? externalChatInbox : externalSummary).filter(row => !row.completed_at && row.last_sender_type === 'visitor').length,
    access: accessRequestCount,
  };
  const canOpenCurrentPage = !adminApp || demo || canOpenAdminPage(page, staffContext.permissions, staffContext.superAdmin);
  const content = <AsyncView key={userId} viewKey={`${userId}:${page}`}>
    {demo && <div className="demo">Vista previa · las operaciones no se envían</div>}
    {adminApp && !isAdmin && !demo ? <section className="card"><h1>Acceso restringido</h1><p>Esta cuenta no tiene permisos de administración.</p>{feedback}</section> : !canOpenCurrentPage ? <section className="card"><h1>Sin acceso</h1><p>Este apartado no está habilitado para tu usuario.</p>{feedback}</section> : <>
      {(adminApp || (page !== 'deposit' && page !== 'withdrawal')) && feedback}
      {!adminApp && page === 'profile' && <UserProfile name={name} busy={busy} logout={() => void logout()} />}
      {!adminApp && !demo && session && <PlayerNotifications key={session.user.id} userId={session.user.id} settingsPage={page === 'home' || page === 'profile' ? page : null} onOpenChat={() => navigate('chat')} onOpenWheel={() => navigate('wheel')} />}
      {page === 'home' && (adminApp ? <AdminOverview counts={pendingCounts} permissions={demo ? allStaffPermissions : staffContext.permissions} superAdmin={demo || staffContext.superAdmin} navigate={navigate} note={!sharedDeposits && !demo && !staffContext.superAdmin && !sacStation ? <p className="shift-note">Elegí el SAC de esta computadora en Cargas para ver sus pendientes.</p> : null} bonuses={bonusBoard()} leaderboard={<DepositLeaderboard demo={demo} requests={requests} reloadKey={leaderboardReload} />} /> : <UserHome name={name} navigate={navigate} onClaimSpecialBonus={id => { setSelectedBonusId(id); navigate('deposit'); }} onOpenChat={() => setChatBubbleOpen(true)} whatsappUrl={demo ? undefined : playerWhatsAppUrl} username={demo ? null : playerUsername} casinoUrl={demo ? null : playerCasinoUrl} demo={demo} userId={demo ? '' : userId} wheelEligible={demo || wheelEligible} />)}
      {!adminApp && page === 'bonuses' && <PlayerBonuses demo={demo} onClaim={id => { setSelectedBonusId(id); navigate('deposit'); }} />}
      {!adminApp && page === 'profile' && <>{history('deposit')}{history('withdrawal')}<ReferralBonusHistory userId={userId} demo={demo} /></>}
      {(page === 'deposit' || page === 'withdrawal') && !adminApp && <RequestForm key={`${page}:${selectedBonusId}`} kind={page} requests={requests.filter(r => r.user_id === userId)} bank={bank} bankOperation={bankOperation} retryAt={page === 'deposit' ? depositRetryAt : 0} initialBonusId={page === 'deposit' ? selectedBonusId : ''} busy={busy} demo={demo} feedback={feedback} onSubmit={submitRequest} onCopy={(text, label) => void action(async () => { await navigator.clipboard.writeText(text); setNotice(`${label} copiado.`); })} submissionError={error} onBrowseBonuses={() => navigate('bonuses')} onOpenWithdrawalHistory={() => { setUserHistoryOpen(old => ({ ...old, withdrawal: true })); setProfileHistoryTarget('withdrawal'); navigate('profile'); }} />}
      {adminApp && page === 'deposit' && depositList()}
      {adminApp && page === 'withdrawal' && <AdminWithdrawals pagination={demo ? undefined : { pendingPage: withdrawalPages.pending, resolvedPage: withdrawalPages.resolved, pendingTotal: withdrawalTotals.pending, resolvedTotal: withdrawalTotals.resolved, loading: withdrawalsLoading, onPage: (kind, next) => setWithdrawalPages(old => ({ ...old, [kind]: next })) }} requests={requests} parts={withdrawalParts} busy={busy} demo={demo} onAdjust={async (request, amount) => {
        try {
          if (!supabase || demo || !canOpenAdminPage('withdrawal', staffContext.permissions, staffContext.superAdmin)) throw new InputError('No tenés permiso para modificar retiros.');
          const result = await supabase.rpc('adjust_withdrawal_amount', { p_request_id: request.id, p_amount: amount });
          if (result.error) throw result.error;
          const nextParts = await supabase.from('withdrawal_parts').select('request_id,part_number,amount,receipt_path,paid_at,paid_by,source_bank_account_id,source_bank_name,source_alias').eq('request_id', request.id).order('part_number');
          if (nextParts.error) throw nextParts.error;
          setRequests(old => old.map(item => item.id === request.id ? { ...item, amount } : item));
          setWithdrawalParts(old => [...old.filter(item => item.request_id !== request.id), ...((nextParts.data ?? []) as WithdrawalPart[])]);
          setNotice(`Monto del retiro actualizado a ${money(amount)}.`);
          return { ok: true };
        } catch (cause) { const message = publicError(cause); setError(message); return { ok: false, error: message }; }
      }} onViewReceipt={part => void viewWithdrawalPart(part)} onPay={async (request, part, file, sourceAccount) => {
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
            setWithdrawalReload(value => value + 1);
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
        setWithdrawalReload(value => value + 1);
      })} />}
      {adminApp && page === 'history' && history()}
      {adminApp && page === 'users' && <PlayerAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'link' && <LoginLinkAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'platform' && <PlatformAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'access-requests' && <AdminPlayerAccess demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'contacts' && <ContactAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'portal' && <PortalAdmin demo={demo} busy={busy} action={action} canEditThemes={demo || staffContext.superAdmin} />}
      {adminApp && page === 'themes' && <ThemesAdmin demo={demo} />}
      {adminApp && page === 'announcements' && <ScheduledAnnouncementsAdmin demo={demo} />}
      {adminApp && page === 'telegram' && <TelegramAdmin demo={demo} />}
      {adminApp && page === 'bonuses' && <BonusAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'referrals' && <ReferralRewardsAdmin demo={demo} busy={busy} action={action} userId={userId} superAdmin={demo || staffContext.superAdmin} />}
      {adminApp && page === 'wheel' && <WheelAdmin demo={demo} busy={busy} action={action} userId={userId} superAdmin={demo || staffContext.superAdmin} canEditPrizes={demo || staffContext.superAdmin || staffContext.permissions.wheel} />}
      {!adminApp && page === 'wheel' && settings.wheel_enabled && wheelEligibilityReady && wheelEligible && <UserWheel demo={demo} userId={userId} />}
      {adminApp && page === 'accounts' && <AccountAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'shifts' && <ShiftAdmin demo={demo} busy={busy} action={action} station={sacStation} onStation={chooseSac} sharedDeposits={sharedDeposits} />}
      {adminApp && page === 'cashiers' && staffContext.superAdmin && <CashierAdmin demo={demo} busy={busy} action={action} />}
      {adminApp && page === 'chat' && <AdminChat pagination={demo ? undefined : { ...chatPageState, search: chatQuery.search, filter: chatQuery.filter, page: chatQuery.page, all: chatSummary.length, pending: pendingCounts.chat, completed: chatSummary.filter(row => !!row.completed_at).length, onQuery: (search, filter) => { setChatQuery({ search, filter, page: 0 }); }, onPage: next => { setThread(''); setChatQuery(old => ({ ...old, page: next })); } }} inbox={chatInbox} selectedId={thread} demo={demo} canManageExternalLinks={staffContext.superAdmin || staffContext.permissions.external_chat} onSelect={setThread} onChanged={() => setChatReload(value => value + 1)} />}
      {adminApp && page === 'external-chat' && <AdminExternalChat pagination={demo ? undefined : { ...externalPageState, search: externalQuery.search, filter: externalQuery.filter, page: externalQuery.page, all: externalSummary.length, pending: pendingCounts.externalChat, completed: externalSummary.filter(row => !!row.completed_at).length, onQuery: (search, filter) => { setExternalQuery({ search, filter, page: 0 }); }, onPage: next => { setExternalThread(''); setExternalQuery(old => ({ ...old, page: next })); } }} inbox={externalChatInbox} selectedId={externalThread} demo={demo} canLink={staffContext.superAdmin || staffContext.permissions.chat} onSelect={setExternalThread} onChanged={() => setExternalChatReload(value => value + 1)} onLinked={linkedUserId => { setExternalThread(''); setThread(linkedUserId); setChatReload(value => value + 1); setExternalChatReload(value => value + 1); navigate('chat'); }} />}
      {adminApp && page === 'external-chat-admin' && (demo || staffContext.superAdmin) && <AdminExternalChatSettings demo={demo} />}
    </>}
  </AsyncView>;
  const staffAvatarUrl = staffContext.avatarPath && supabase ? supabase.storage.from('cashier-avatars').getPublicUrl(staffContext.avatarPath).data.publicUrl : null;
  if (adminApp) return <AsyncView viewKey={`admin-shell:${userId}`}><AdminRefreshProvider version={adminRefresh} refresh={refreshAdmin}><AdminShell page={page} counts={pendingCounts} permissions={demo ? allStaffPermissions : staffContext.permissions} superAdmin={demo || staffContext.superAdmin} staffName={demo ? 'Superadministrador' : staffContext.displayName || name} avatarUrl={staffAvatarUrl} busy={busy} navigate={navigate} logout={() => void logout()} onRefresh={refreshAdmin}>{content}</AdminShell></AdminRefreshProvider></AsyncView>;
  const surface = themeSurface(settings, path => supabase?.storage.from('app-assets').getPublicUrl(path).data.publicUrl ?? null);
  return <div className={`app user-app page-${page} ${surface.className}`} style={surface.style}>
    <UserHeader page={page} navigate={navigate} name={name} />
    {content}
    {session && !demo && page === 'home' && chatBubbleOpen && <AsyncView viewKey={`conversation:${userId}`}><Conversation loading={chatLoading} hasMore={chatHasMore} loadingOlder={chatOlderLoading} onLoadOlder={loadOlderPlayerMessages} messages={messages} userId={userId} busy={busy} disabled={false} open={chatBubbleOpen} onOpenChange={setChatBubbleOpen} onSubmit={sendMessage} showLauncher={false} /></AsyncView>}
    {exitConfirmationOpen && <div className="player-exit-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) setExitConfirmationOpen(false); }}>
      <section className="player-exit-dialog" role="dialog" aria-modal="true" aria-labelledby="player-exit-title">
        <h2 id="player-exit-title">¿Querés cerrar la app?</h2>
        <p>Podés seguir usando Gana777 o cerrar ahora.</p>
        <div className="player-exit-actions"><button type="button" autoFocus onClick={() => setExitConfirmationOpen(false)}>Seguir usando</button><button type="button" onClick={confirmClosePortal}>Cerrar</button></div>
      </section>
    </div>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><ContentProvider><App /></ContentProvider></React.StrictMode>);
