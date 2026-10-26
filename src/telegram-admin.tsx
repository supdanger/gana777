import { useEffect, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import { supabase } from './lib';

type Route = { route: string; chat_id: string | null; enabled: boolean; updated_at: string };
type Alert = { id: string; route: string; event_type: string; status: string; attempts: number; last_error: string | null; created_at: string; sent_at: string | null };
const destinations = [
  ['withdrawals', 'Retiros pendientes'], ['deposits_all', 'Todas las cargas'],
  ['sac_1', 'Cargas SAC 1'], ['sac_2', 'Cargas SAC 2'], ['sac_3', 'Cargas SAC 3'],
  ['sac_4', 'Cargas SAC 4'], ['sac_5', 'Cargas SAC 5'], ['shifts', 'Inicio y fin de turnos'],
] as const;
const names = Object.fromEntries(destinations);
const statusLabels: Record<string, string> = {
  pending: 'Pendiente', sending: 'Enviando', failed: 'Reintentando', sent: 'Enviado', skipped: 'Omitido', dead: 'Requiere revisión',
};
const validChatId = /^-?\d{1,20}$/;

export function TelegramAdmin({ demo }: { demo: boolean }) {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [savedChatIds, setSavedChatIds] = useState<Record<string, string | null>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    if (demo || !supabase) return;
    const [routeResult, alertResult] = await Promise.all([
      supabase.from('telegram_routes').select('route,chat_id,enabled,updated_at').order('route'),
      supabase.from('telegram_alerts').select('id,route,event_type,status,attempts,last_error,created_at,sent_at')
        .order('created_at', { ascending: false }).limit(20),
    ]);
    if (routeResult.error || alertResult.error) { setError('No pudimos cargar la configuración. Revisá que la migración 058 esté aplicada.'); return; }
    setRoutes((routeResult.data ?? []) as Route[]);
    setSavedChatIds(Object.fromEntries(((routeResult.data ?? []) as Route[]).map(item => [item.route, item.chat_id])));
    setAlerts((alertResult.data ?? []) as Alert[]);
    setError('');
  }
  useEffect(() => {
    if (demo) {
      setRoutes(destinations.map(([route]) => ({ route, chat_id: null, enabled: false, updated_at: new Date().toISOString() })));
      return;
    }
    void refresh();
  }, [demo]);

  function change(route: string, values: Partial<Route>) {
    setRoutes(previous => previous.map(item => item.route === route ? { ...item, ...values } : item));
    setNotice('');
  }
  async function save(item: Route) {
    if (demo || !supabase) return;
    const chatId = item.chat_id?.trim() || null;
    if (chatId && !validChatId.test(chatId)) { setError('El ID del grupo debe contener solo números y puede comenzar con un signo menos.'); return; }
    if (item.enabled && !chatId) { setError('Ingresá el ID del grupo antes de activarlo.'); return; }
    setBusy(item.route); setError(''); setNotice('');
    const { error: saveError } = await supabase.from('telegram_routes')
      .update({ chat_id: chatId, enabled: item.enabled, updated_at: new Date().toISOString() }).eq('route', item.route);
    setBusy(null);
    if (saveError) { setError('No pudimos guardar el grupo. Verificá el ID y tus permisos.'); return; }
    setNotice(`${names[item.route]} guardado.`);
    await refresh();
  }
  async function test(route: string) {
    if (demo || !supabase) return;
    setBusy(route); setError(''); setNotice('');
    const { error: testError } = await supabase.functions.invoke('test-telegram-route', { body: { route } });
    setBusy(null);
    if (testError) setError('Telegram no recibió la prueba. Revisá el ID, que el bot esté en el grupo y que el token esté configurado en Supabase.');
    else setNotice(`Prueba enviada a ${names[route]}.`);
  }
  async function retry(id: string) {
    if (demo || !supabase) return;
    setBusy(id); setError(''); setNotice('');
    const { data, error: retryError } = await supabase.rpc('retry_telegram_alert', { p_alert_id: id });
    setBusy(null);
    if (retryError || !data) { setError('No pudimos reprogramar el aviso.'); return; }
    setNotice('Aviso reprogramado para el próximo intento.');
    await refresh();
  }

  return <section className="telegram-admin">
    <div className="page-title"><div><span className="eyebrow">COMUNICACIÓN INTERNA</span><h1>Avisos de Telegram</h1><p>Asigná un grupo a cada función. El token del bot se guarda en los secretos de Supabase.</p></div></div>
    {error && <p className="alert error" role="alert">{error}</p>}
    {notice && <p className="alert success" role="status">{notice}</p>}
    <div className="telegram-routes">{destinations.map(([route, title]) => {
      const item = routes.find(value => value.route === route);
      if (!item) return null;
      return <article className="card telegram-route" key={route}>
        <div className="telegram-route-heading"><BellRing size={20} /><div><h2>{title}</h2><small>{item.enabled ? 'Activo' : 'Pausado'}</small></div></div>
        <label>ID del grupo<input inputMode="numeric" autoComplete="off" value={item.chat_id ?? ''} placeholder="Ej.: -1001234567890" disabled={busy === route || demo} onChange={event => change(route, { chat_id: event.target.value })} /></label>
        <label className="telegram-route-toggle"><input type="checkbox" checked={item.enabled} disabled={busy === route || demo} onChange={event => change(route, { enabled: event.target.checked })} /> Enviar avisos a este grupo</label>
        <div className="telegram-route-actions"><button type="button" disabled={busy === route || demo} onClick={() => void save(item)}>Guardar</button><button type="button" disabled={busy === route || demo || !item.chat_id || item.chat_id !== savedChatIds[route]} onClick={() => void test(route)}><Send size={15} /> Enviar prueba</button></div>
      </article>;
    })}</div>
    <section className="card telegram-history"><div className="telegram-history-heading"><h2>Últimos avisos</h2><button type="button" disabled={!!busy || demo} onClick={() => void refresh()}>Actualizar</button></div><p>Los fallidos se reintentan automáticamente. Revisá los que indiquen «Requiere revisión».</p>
      {!alerts.length ? <p>Todavía no hay avisos registrados.</p> : <div className="telegram-history-list">{alerts.map(item => <div key={item.id}><strong>{names[item.route] ?? item.route}</strong><span>{statusLabels[item.status] ?? item.status}</span><small>{new Date(item.created_at).toLocaleString('es-AR')} · {item.attempts} intento(s){item.last_error ? ` · ${item.last_error}` : ''}</small>{(item.status === 'failed' || item.status === 'dead') && <button type="button" disabled={!!busy || demo} onClick={() => void retry(item.id)}>Reintentar</button>}</div>)}</div>}
    </section>
  </section>;
}
