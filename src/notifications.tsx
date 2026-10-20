import { useEffect, useState } from 'react';
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
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase || !userId) return;
    const db = supabase;
    let alive = true;
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    const canPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
    setSupported(canPush);
    if (canPush) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(async registration => {
        const subscription = await registration.pushManager.getSubscription();
        if (!alive || !subscription || Notification.permission !== 'granted') return;
        const json = subscription.toJSON();
        if (json.keys?.p256dh && json.keys.auth) {
          const { error } = await db.rpc('register_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
          if (alive && !error) setEnabled(true);
        }
      }).catch(() => { /* In-app notices still work. */ });
    }
    return () => { alive = false; window.removeEventListener('focus', onFocus); window.clearInterval(timer); void db.removeChannel(channel); };
  }, [userId]);

  async function activate() {
    if (!supabase) return;
    setBusy(true); setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setError('Habilitá las notificaciones en los permisos del navegador.'); return; }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey() });
      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) throw new Error('El dispositivo no devolvió una suscripción válida.');
      const { error } = await supabase.rpc('register_push_subscription', { p_endpoint: subscription.endpoint, p_p256dh: json.keys.p256dh, p_auth: json.keys.auth });
      if (error) throw error;
      setEnabled(true);
    } catch { setError('No pudimos activar los avisos en este dispositivo. Intentá nuevamente.'); }
    finally { setBusy(false); }
  }

  async function markRead(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc('mark_my_notification_read', { p_notification_id: id });
    if (!error) setNotifications(items => items.map(item => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
  }

  const visible = showSettings ? notifications : notifications.filter(item => !item.read_at);
  if (!visible.length && (!showSettings || !supported || enabled)) return null;
  return <section className="player-notifications" aria-label="Notificaciones">
    <div className="player-notifications-heading"><Bell size={19} /><h2>Notificaciones</h2>{notifications.some(item => !item.read_at) && <span>{notifications.filter(item => !item.read_at).length} nueva{notifications.filter(item => !item.read_at).length === 1 ? '' : 's'}</span>}</div>
    {visible.map(item => <article className={`player-notification ${item.read_at ? 'is-read' : ''}`} key={item.id}>
      <strong>{item.title}</strong><p>{item.body}</p><small>{date(item.created_at)}</small>
      {!item.read_at && <button type="button" onClick={() => void markRead(item.id)}><Check size={15} /> Marcar como leída</button>}
    </article>)}
    {showSettings && supported && !enabled && <div className="player-notification-settings"><p>Activá los avisos para enterarte cuando se acredite una carga, incluso con la app cerrada.</p><button type="button" disabled={busy} onClick={() => void activate()}>{busy ? <LoaderCircle size={16} /> : <Bell size={16} />} Activar notificaciones</button></div>}
    {error && <p className="player-notification-error" role="alert">{error}</p>}
  </section>;
}
