import { useEffect, useRef, useState } from 'react';
import { Bell, Check, LoaderCircle } from 'lucide-react';
import { supabase, date } from './lib';

const vapidPublicKey = 'BNtbZNRD_ooezVlDPvQvUCrYbFJQfabwWQbgJpnqNaML1rZEsakHHR8cLc1l0AF26bRZolu1op6SOjtKBz8pgxs';
type UserNotification = { id: string; title: string; body: string; created_at: string; read_at: string | null };

function applicationServerKey() {
  const padded = vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(vapidPublicKey.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

export async function removeDeviceSubscription() {
  if (!supabase || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await supabase.rpc('unregister_push_subscription', { p_endpoint: subscription.endpoint });
  await subscription.unsubscribe();
}

export function PlayerNotifications({ userId, showSettings }: { userId: string; showSettings: boolean }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [supported, setSupported] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [existingSubscription, setExistingSubscription] = useState<PushSubscription | null>(null);
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
    activeRegistration.current = null;
    foregroundOnlyActive.current = false;
    setForegroundOnly(false);
    setEnabled(false);
    async function refresh() {
      const { data } = await db.from('user_notifications').select('id,title,body,created_at,read_at')
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
            body: item.body ?? '', icon: '/pwa/icon-panda-192.png', tag: `deposit-credited-${item.id}`, data: { url: '/' },
          }).catch(() => undefined);
        }
      })
      .subscribe();
    const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
    setSupported(canPush);
    if (canPush) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async () => {
        // register() can resolve before Chrome activates the worker. Push requires an active worker.
        const readyRegistration = await navigator.serviceWorker.ready;
        const subscription = await readyRegistration.pushManager.getSubscription();
        if (!alive) return;
        activeRegistration.current = readyRegistration;
        setRegistration(readyRegistration);
        setExistingSubscription(subscription);
        if (!subscription || Notification.permission !== 'granted') {
          if (!subscription && Notification.permission === 'granted') { foregroundOnlyActive.current = true; setForegroundOnly(true); }
          return;
        }
        const json = subscription.toJSON();
        if (json.keys?.p256dh && json.keys.auth) {
          const { error } = await db.rpc('register_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
          if (alive && !error) { foregroundOnlyActive.current = false; setForegroundOnly(false); setEnabled(true); setError(''); }
        }
      }).catch(() => { if (alive) setError('No se pudo preparar el servicio de avisos de esta app. Cerrala y abrila de nuevo.'); });
    }
    return () => { alive = false; window.removeEventListener('focus', onFocus); window.clearInterval(timer); void db.removeChannel(channel); };
  }, [userId]);

  async function activate() {
    if (!supabase || !registration) return;
    setBusy(true); setError('');
    let step: 'permission' | 'subscription' | 'save' = 'permission';
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') { setError('Habilitá las notificaciones en los permisos del navegador.'); return; }
      step = 'subscription';
      const subscription = existingSubscription ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey() });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error('El dispositivo no devolvió una suscripción válida.');
      step = 'save';
      const { error } = await supabase.rpc('register_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
      if (error) throw error;
      setExistingSubscription(subscription);
      foregroundOnlyActive.current = false;
      setForegroundOnly(false);
      setEnabled(true);
    } catch (cause) {
      const code = cause instanceof Error ? cause.name : '';
      if (step === 'save') setError(`El dispositivo aceptó los avisos, pero no pudimos guardarlo en tu cuenta. Intentá nuevamente. ${cause instanceof Error ? cause.message : ''}`);
      else if (code === 'NotAllowedError') setError('Chrome bloqueó los avisos para esta app. Habilitalos desde los permisos del sitio o de Android.');
      else if (code === 'AbortError' || code === 'NetworkError') { foregroundOnlyActive.current = true; setForegroundOnly(true); }
      else setError(`No pudimos activar los avisos en este dispositivo. Intentá nuevamente${code ? ` (código: ${code})` : ''}.`);
    }
    finally { setBusy(false); }
  }

  async function markRead(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc('mark_my_notification_read', { p_notification_id: id });
    if (!error) setNotifications(items => items.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }

  const visible = notifications.filter(item => !item.read_at);
  if (!visible.length && (!showSettings || !supported || enabled)) return null;
  return <section className="player-notifications" aria-label="Notificaciones">
    {visible.map(item => <article className="player-notification" key={item.id}>
      <Bell size={18} aria-hidden="true" />
      <div><strong>{item.title}</strong><p>{item.body}</p><time dateTime={item.created_at} className="sr-only">{date(item.created_at)}</time></div>
      <button type="button" aria-label={`Marcar como leída: ${item.title}`} title="Marcar como leída" onClick={() => void markRead(item.id)}><Check size={17} /></button>
    </article>)}
    {showSettings && supported && !enabled && <div className={`player-notification-settings${foregroundOnly ? ' is-limited' : ''}`}><div className="player-notifications-heading"><Bell size={19} /><h2>Notificaciones</h2></div><p>{foregroundOnly ? 'En esta PC, los avisos siguen disponibles dentro de Gana777. Si dejás la pestaña abierta, también intentaremos mostrarlos en el sistema.' : 'Activá los avisos para enterarte cuando se acredite una carga, incluso con la app cerrada.'}</p><button type="button" disabled={busy || !registration} onClick={() => void activate()}>{busy || !registration ? <LoaderCircle size={16} /> : <Bell size={16} />} {registration ? foregroundOnly ? 'Reintentar push' : 'Activar notificaciones' : 'Preparando avisos…'}</button></div>}
    {error && <p className="player-notification-error" role="alert">{error}</p>}
  </section>;
}
