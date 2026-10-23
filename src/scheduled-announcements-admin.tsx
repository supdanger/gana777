import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { BellRing, CalendarClock, Pencil, Trash2 } from 'lucide-react';
import { supabase } from './lib';

type Campaign = {
  id: string;
  title: string;
  body: string;
  weekdays: number[];
  send_time: string;
  active: boolean;
  last_sent_on: string | null;
  last_sent_count: number;
  created_at: string;
};
const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const empty = { title: '', body: '', weekdays: [1, 2, 3, 4, 5, 6, 7], send_time: '18:00', active: true };

export function ScheduledAnnouncementsAdmin({ demo }: { demo: boolean }) {
  const [items, setItems] = useState<Campaign[]>([]);
  const [form, setForm] = useState({ ...empty });
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (demo || !supabase) return;
    const { data, error: readError } = await supabase.from('scheduled_announcements')
      .select('id,title,body,weekdays,send_time,active,last_sent_on,last_sent_count,created_at')
      .is('deleted_at', null).order('created_at', { ascending: false });
    if (readError) setError('No pudimos cargar los mensajes. Verificá que la migración esté aplicada.');
    else setItems((data ?? []) as Campaign[]);
  }, [demo]);
  useEffect(() => { void refresh(); }, [refresh]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo || !supabase) return;
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title || !body || !form.weekdays.length) { setError('Completá el título, el mensaje y al menos un día.'); return; }
    setBusy(true); setError(''); setNotice('');
    const values = { title, body, weekdays: [...form.weekdays].sort(), send_time: `${form.send_time}:00`, active: form.active };
    const result = editing
      ? await supabase.from('scheduled_announcements').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editing)
      : await supabase.from('scheduled_announcements').insert({ ...values, created_by: (await supabase.auth.getUser()).data.user?.id });
    setBusy(false);
    if (result.error) { setError('No pudimos guardar el mensaje. Revisá los campos o volvé a ingresar al panel.'); return; }
    setNotice(editing ? 'Mensaje actualizado.' : 'Mensaje programado.');
    setEditing(null); setForm({ ...empty, weekdays: [...empty.weekdays] });
    await refresh();
  }

  async function changeStatus(item: Campaign, remove = false) {
    if (demo || !supabase) return;
    setBusy(true); setError(''); setNotice('');
    const values = remove
      ? { active: false, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { active: !item.active, updated_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from('scheduled_announcements').update(values).eq('id', item.id);
    setBusy(false);
    if (updateError) { setError('No pudimos cambiar el estado del mensaje.'); return; }
    setNotice(remove ? 'Mensaje eliminado de la programación.' : item.active ? 'Mensaje pausado.' : 'Mensaje activado.');
    if (remove && editing === item.id) { setEditing(null); setForm({ ...empty, weekdays: [...empty.weekdays] }); }
    await refresh();
  }

  function edit(item: Campaign) {
    setEditing(item.id);
    setForm({ title: item.title, body: item.body, weekdays: [...item.weekdays], send_time: item.send_time.slice(0, 5), active: item.active });
    setError(''); setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return <div className="scheduled-announcements">
    <div className="page-title"><div><span className="eyebrow">COMUNICACIÓN</span><h1>Mensajes programados</h1><p>Creá avisos para todos los jugadores. Se envían los días elegidos a la hora de Asunción.</p></div></div>
    {error && <p className="alert error" role="alert">{error}</p>}{notice && <p className="alert success" role="status">{notice}</p>}
    <form className="card announcement-editor" onSubmit={event => void save(event)}>
      <h2><BellRing size={21} />{editing ? 'Editar mensaje' : 'Nuevo mensaje'}</h2>
      <label htmlFor="announcement-title">Título del aviso</label>
      <input id="announcement-title" value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} maxLength={100} placeholder="Ej.: Bonos de esta semana" required />
      <label htmlFor="announcement-body">Mensaje</label>
      <textarea id="announcement-body" value={form.body} onChange={event => setForm(value => ({ ...value, body: event.target.value }))} maxLength={1000} rows={5} placeholder="Escribí el aviso que verán los jugadores…" required />
      <div className="announcement-schedule"><div><label htmlFor="announcement-time">Hora de envío</label><input id="announcement-time" type="time" value={form.send_time} onChange={event => setForm(value => ({ ...value, send_time: event.target.value }))} required /><small>Zona horaria: Asunción</small></div><fieldset><legend>Días de envío</legend><div className="announcement-days">{days.map((day, index) => <label key={day} className={form.weekdays.includes(index + 1) ? 'selected' : ''}><input type="checkbox" checked={form.weekdays.includes(index + 1)} onChange={() => setForm(value => ({ ...value, weekdays: value.weekdays.includes(index + 1) ? value.weekdays.filter(number => number !== index + 1) : [...value.weekdays, index + 1] }))} />{day}</label>)}</div></fieldset></div>
      <div className="announcement-editor-actions"><button className="primary" type="submit" disabled={busy || demo}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Programar mensaje'}</button>{editing && <button type="button" disabled={busy} onClick={() => { setEditing(null); setForm({ ...empty, weekdays: [...empty.weekdays] }); }}>Cancelar</button>}</div>
    </form>
    <section className="announcement-list"><h2><CalendarClock size={21} /> Programados</h2>{!items.length && <p className="card announcement-empty">Todavía no hay mensajes programados.</p>}{items.map(item => <article className="card announcement-item" key={item.id}><div className="announcement-item-head"><div><h3>{item.title}</h3><span className={item.active ? 'announcement-status active' : 'announcement-status'}>{item.active ? 'Activo' : 'Pausado'}</span></div><p>{item.body}</p></div><div className="announcement-item-footer"><span>{item.weekdays.map(day => days[day - 1]).join(' · ')} · {item.send_time.slice(0, 5)} (Asunción)</span>{item.last_sent_on && <small>Último envío: {item.last_sent_on} · {item.last_sent_count} usuarios</small>}</div><div className="announcement-item-actions"><button type="button" disabled={busy || demo} onClick={() => edit(item)}><Pencil size={15} /> Editar</button><button type="button" disabled={busy || demo} onClick={() => void changeStatus(item)}>{item.active ? 'Pausar' : 'Activar'}</button><button type="button" disabled={busy || demo} onClick={() => void changeStatus(item, true)}><Trash2 size={15} /> Eliminar</button></div></article>)}</section>
  </div>;
}
