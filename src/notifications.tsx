import { useEffect, useRef, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { supabase, date } from './lib';

const vapidPublicKey = 'BNtbZNRD_ooezVlDPvQvUCrYbFJQfabwWQbgJpnqNaML1rZEsakHHR8cLc1l0AF26bRZolu1op6SOjtKBz8pgxs';
const DEVICE_PREFERENCE_KEY = 'gana777-push-device-enabled';
let pushSessionGeneration = 0;
type UserNotification = { id: string; kind: 'deposit_credited' | 'withdrawal_paid' | 'chat_message' | 'announcement'; title: string; body: string; created_at: string; read_at: string | null };

function devicePreference() {
  try { return localStorage.getItem(DEVICE_PREFERENCE_KEY); } catch { return null; }
}

function saveDevicePreference(enabled: boolean) {
  try { localStorage.setItem(DEVICE_PREFERENCE_KEY, enabled ? 'on' : 'off'); } catch { /* El navegador puede bloquear el almacenamiento local. */ }
}

function applicationServerKey() {
  const padded = vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(vapidPublicKey.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function readyRegistration() {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  let timer = 0;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error('El servicio de avisos tardó demasiado en iniciar.')), 8000); }),
    ]);
  } finally { window.clearTimeout(timer); }
}

async function registerForCurrentUser(subscription: PushSubscription) {
  if (!supabase) return;
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error('El dispositivo no devolvió una suscripción válida.');
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: subscription.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth,
  });
  if (error) throw error;
}

// Desvincula la cuenta al salir y conserva la suscripción del dispositivo.
export async function unlinkDeviceSubscription() {
  pushSessionGeneration += 1;
  if (!supabase || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { error } = await supabase.rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint });
  if (error) {
    // Si falla la desvinculación, invalida el endpoint para no recibir avisos de la cuenta anterior.
    await subscription.unsubscribe();
    throw error;
  }
}

export function PlayerNotifications({ userId, settingsPage, onOpenChat }: { userId: string; settingsPage: 'home' | 'profile' | null; onOpenChat: () => void }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [supported, setSupported] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [existingSubscription, setExistingSubscription] = useState<PushSubscription | null>(null);
  const [wanted, setWanted] = useState(() => devicePreference() === 'on');
  const [enabled, setEnabled] = useState(false);
  const [foregroundOnly, setForegroundOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activeRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const foregroundOnlyActive = useRef(false);

  useEffect(() => {
    if (!supabase || !userId) return;
    const db = supabase;
    let alive = true;
    const generation = pushSessionGeneration;
    activeRegistration.current = null;
    foregroundOnlyActive.current = false;
    setNotifications([]);
    setRegistration(null);
    setExistingSubscription(null);
    setForegroundOnly(false);
    setEnabled(false);
    setError('');
    async function refresh() {
      const { data } = await db.from('user_notifications').select('id,kind,title,body,created_at,read_at')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
      if (alive && data) setNotifications(data as UserNotification[]);
    }
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(refresh, 30000);
    const channel = db.channel(`player-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` }, payload => {
        void refresh();
        const item = payload.new as Partial<UserNotification>;
        if (foregroundOnlyActive.current && document.visibilityState === 'hidden' && Notification.permission === 'granted'
          && activeRegistration.current && item.id && item.title) {
          void activeRegistration.current.showNotification(item.title, {
            body: item.body ?? '', icon: '/pwa/icon-panda-192.png', tag: `gana777-${item.id}`,
            data: { url: item.kind === 'chat_message' ? '/?view=chat' : item.kind === 'withdrawal_paid' ? '/?view=profile' : item.kind === 'announcement' ? '/?view=home' : '/?view=deposit' },
          }).catch(() => undefined);
        }
      })
      .subscribe();
    const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
    setSupported(canPush);
    if (canPush) {
      void (async () => {
        const previous = await navigator.serviceWorker.getRegistration('/');
        const existing = await previous?.pushManager.getSubscription() ?? null;
        let preference = devicePreference();
        // Conserva la elección de quienes ya tenían avisos activados antes de este cambio.
        if (preference === null && existing && Notification.permission === 'granted') {
          saveDevicePreference(true);
          preference = 'on';
        }
        if (!alive) return;
        setWanted(preference === 'on');
        setRegistration(previous ?? null);
        setExistingSubscription(existing);
        if (preference !== 'on') return;
        if (Notification.permission !== 'granted') {
          setError('Los permisos de avisos están desactivados en este dispositivo.');
          return;
        }
        setBusy(true);
        const ready = await readyRegistration();
        const subscription = existing ?? await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey() });
        if (!alive || generation !== pushSessionGeneration || devicePreference() !== 'on') return;
        await registerForCurrentUser(subscription);
        if (!alive) return;
        activeRegistration.current = ready;
        setRegistration(ready);
        setExistingSubscription(subscription);
        setEnabled(true);
        setError('');
      })().catch(() => {
        if (alive && devicePreference() === 'on') setError('No se pudieron preparar los avisos. Apagá y volvé a encender el interruptor para reintentar.');
      }).finally(() => { if (alive) setBusy(false); });
    }
    return () => { alive = false; window.removeEventListener('focus', onFocus); window.clearInterval(timer); void db.removeChannel(channel); };
  }, [userId]);

  async function activate() {
    if (!supabase) return;
    const generation = pushSessionGeneration;
    setBusy(true); setError('');
    let step: 'permission' | 'subscription' | 'save' = 'permission';
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') { setError('Habilitá las notificaciones en los permisos del dispositivo.'); return; }
      step = 'subscription';
      const ready = registration?.active ? registration : await readyRegistration();
      const subscription = existingSubscription ?? await ready.pushManager.getSubscription() ?? await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey() });
      if (generation !== pushSessionGeneration) return;
      step = 'save';
      await registerForCurrentUser(subscription);
      saveDevicePreference(true);
      setWanted(true);
      setRegistration(ready);
      setExistingSubscription(subscription);
      activeRegistration.current = ready;
      foregroundOnlyActive.current = false;
      setForegroundOnly(false);
      setEnabled(true);
    } catch (cause) {
      const code = cause instanceof Error ? cause.name : '';
      console.error('No se pudo activar el push', { step, cause });
      if (step === 'save') setError('El navegador aceptó los avisos, pero no pudimos vincularlos a tu cuenta. Reintentá; los avisos dentro de GANA777 siguen disponibles.');
      else if (code === 'NotAllowedError') setError('El navegador bloqueó las notificaciones. Habilitalas en los permisos del sitio o del dispositivo y reintentá.');
      else if (code === 'AbortError' || code === 'NetworkError') { foregroundOnlyActive.current = true; setForegroundOnly(true); setError('No hubo conexión con el servicio de notificaciones push. Los avisos dentro de GANA777 siguen disponibles; reintentá más tarde.'); }
      else if (code === 'InvalidStateError') setError('El servicio de notificaciones todavía no está listo. Cerrá y volvé a abrir el portal antes de reintentar.');
      else if (code === 'NotSupportedError' || code === 'SecurityError') setError('Este navegador no permite notificaciones push en este modo. Probá abrir el portal como app instalada y con una conexión segura.');
      else setError(`No pudimos activar las notificaciones push en este dispositivo${code ? ` (${code})` : ''}. Los avisos dentro de GANA777 siguen disponibles.`);
    }
    finally { setBusy(false); }
  }

  async function deactivate() {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const subscription = existingSubscription ?? await registration?.pushManager.getSubscription();
      if (subscription) {
        const { error } = await supabase.rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint });
        if (error) throw error;
        await subscription.unsubscribe();
      }
      saveDevicePreference(false);
      setWanted(false);
      setEnabled(false);
      setExistingSubscription(null);
      foregroundOnlyActive.current = false;
      setForegroundOnly(false);
    } catch { setError('No pudimos desactivar los avisos. Intentá nuevamente.'); }
    finally { setBusy(false); }
  }

  async function markRead(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc('mark_my_notification_read', { p_notification_id: id });
    if (!error) setNotifications(items => items.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }

  const visible = notifications.filter(item => !item.read_at);
  const showSettings = settingsPage === (wanted ? 'profile' : 'home');
  if (!visible.length && !showSettings) return null;
  return <section className="player-notifications" aria-label="Notificaciones">
    {showSettings && <div className="player-notification-settings"><div className="player-notification-setting-copy"><div className="player-notifications-heading"><Bell size={19} /><h2>Avisos en este dispositivo</h2></div><p>{enabled ? 'Activados para la cuenta que uses en esta app.' : foregroundOnly ? 'Podés ver los avisos dentro de Gana777. Los avisos del sistema necesitan conexión.' : wanted ? 'Se volverán a conectar cuando el servicio esté disponible.' : 'Recibí avisos de cargas, retiros y mensajes de soporte.'}</p></div><button type="button" className="player-notification-switch" role="switch" aria-label="Avisos en este dispositivo" aria-checked={wanted} disabled={busy || !supported} onClick={() => void (wanted ? deactivate() : activate())}><span /></button></div>}
    {showSettings && !supported && <p className="player-notification-error">Este dispositivo no admite avisos push.</p>}
    {showSettings && error && <p className="player-notification-error" role="alert">{error}</p>}
    {visible.map(item => <article className="player-notification" key={item.id}>
      <Bell size={18} aria-hidden="true" />
      <div><strong>{item.title}</strong><p>{item.body}</p>{item.kind === 'chat_message' && <button type="button" className="player-notification-open-chat" onClick={() => { void markRead(item.id); onOpenChat(); }}>Abrir chat</button>}<time dateTime={item.created_at} className="sr-only">{date(item.created_at)}</time></div>
      <button type="button" aria-label={`Marcar como leída: ${item.title}`} title="Marcar como leída" onClick={() => void markRead(item.id)}><Check size={17} /></button>
    </article>)}
  </section>;
}
