import { useEffect, useState, type FormEvent } from 'react';
import { Camera, KeyRound, Trash2, UserRound } from 'lucide-react';
import { InputError } from '../supabase/functions/_shared/validation';
import { supabase } from './lib';
import { noStaffPermissions, staffPermissionPages, type StaffPermissionPage, type StaffPermissions } from './staff';
import { titles } from './user-views';

type Cashier = StaffPermissions & {
  user_id: string;
  username: string;
  display_name: string;
  avatar_path: string | null;
  active: boolean;
  created_at: string;
};

const columns = `user_id,username,display_name,avatar_path,active,created_at,${staffPermissionPages.join(',')}`;
const avatarTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function functionError(error: unknown, data: unknown, fallback: string): Promise<Error> {
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') return new InputError(data.error);
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    const response = error.context;
    try {
      const body: unknown = await response.clone().json();
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return new InputError(body.error);
    } catch { /* The gateway may return plain text for missing functions. */ }
    if (response.status === 404) return new InputError('La función para gestionar cajeros todavía no está desplegada en Supabase.');
    if (response.status === 401) return new InputError('Tu sesión venció. Volvé a ingresar.');
    if (response.status === 403) return new InputError('Solo el superadministrador puede gestionar cajeros.');
  }
  return new InputError(fallback);
}

export function CashierAdmin({ demo, busy, action }: { demo: boolean; busy: boolean; action: (task: () => Promise<void>) => Promise<void> }) {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(!demo && !!supabase);
  const [loadError, setLoadError] = useState('');
  const [newPermissions, setNewPermissions] = useState<StaffPermissions>({ ...noStaffPermissions, home: true, deposit: true });
  const [passwordId, setPasswordId] = useState<string | null>(null);

  async function refresh() {
    if (demo || !supabase) { setLoading(false); return; }
    const { data, error } = await supabase.from('cashier_directory').select(columns).order('created_at');
    setLoading(false);
    if (error) { setLoadError('No pudimos cargar los cajeros. Aplicá la migración 015 y desplegá la función manage-cashiers.'); return; }
    setLoadError('');
    setCashiers((data ?? []) as unknown as Cashier[]);
  }
  useEffect(() => { void refresh(); }, [demo]);

  function avatarUrl(cashier: Cashier): string | null {
    return cashier.avatar_path && supabase ? supabase.storage.from('cashier-avatars').getPublicUrl(cashier.avatar_path).data.publicUrl : null;
  }
  async function uploadAvatar(userId: string, file: File): Promise<string> {
    if (!supabase) throw new InputError('Supabase no está configurado.');
    const extension = avatarTypes[file.type];
    if (!extension || file.size > 2 * 1024 * 1024) throw new InputError('El icono debe ser JPG, PNG o WebP y pesar hasta 2 MB.');
    const path = `${userId}/avatar.${extension}`;
    const uploaded = await supabase.storage.from('cashier-avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (uploaded.error) throw uploaded.error;
    const saved = await supabase.from('cashier_profiles').update({ avatar_path: path, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (saved.error) throw saved.error;
    return path;
  }
  async function createCashier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    await action(async () => {
      if (demo || !supabase) throw new InputError('La vista previa no crea cajeros.');
      const username = String(form.get('username') ?? '').trim().toLowerCase();
      const displayName = String(form.get('display_name') ?? '').trim();
      const password = String(form.get('password') ?? '');
      const result = await supabase.functions.invoke('manage-cashiers', { body: { action: 'create', username, display_name: displayName || username, password, permissions: newPermissions } });
      if (result.error || !result.data?.user_id) throw await functionError(result.error, result.data, 'No se pudo crear el cajero.');
      const avatar = form.get('avatar');
      if (avatar instanceof File && avatar.size) {
        try { await uploadAvatar(result.data.user_id, avatar); }
        catch { await refresh(); throw new InputError('El cajero fue creado, pero el icono no pudo guardarse. Podés cargarlo desde su tarjeta.'); }
      }
      element.reset();
      setNewPermissions({ ...noStaffPermissions, home: true, deposit: true });
      await refresh();
    });
  }
  async function togglePermission(cashier: Cashier, permission: StaffPermissionPage) {
    await action(async () => {
      if (!supabase || demo) throw new InputError('La vista previa no guarda permisos.');
      const value = !cashier[permission];
      const { error } = await supabase.from('admin_permissions').update({ [permission]: value, updated_at: new Date().toISOString() }).eq('user_id', cashier.user_id);
      if (error) throw error;
      setCashiers(old => old.map(item => item.user_id === cashier.user_id ? { ...item, [permission]: value } : item));
    });
  }
  async function toggleActive(cashier: Cashier) {
    await action(async () => {
      if (!supabase || demo) throw new InputError('La vista previa no guarda cambios.');
      const { error } = await supabase.from('cashier_profiles').update({ active: !cashier.active, updated_at: new Date().toISOString() }).eq('user_id', cashier.user_id);
      if (error) throw error;
      setCashiers(old => old.map(item => item.user_id === cashier.user_id ? { ...item, active: !cashier.active } : item));
    });
  }
  async function changePassword(event: FormEvent<HTMLFormElement>, cashier: Cashier) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(async () => {
      if (!supabase || demo) throw new InputError('La vista previa no cambia contraseñas.');
      const result = await supabase.functions.invoke('manage-cashiers', { body: { action: 'password', user_id: cashier.user_id, password: String(form.get('password') ?? '') } });
      if (result.error || !result.data?.ok) throw await functionError(result.error, result.data, 'No se pudo cambiar la contraseña.');
      setPasswordId(null);
    });
  }
  async function changeAvatar(cashier: Cashier, file: File | undefined) {
    if (!file) return;
    await action(async () => { await uploadAvatar(cashier.user_id, file); await refresh(); });
  }
  async function removeCashier(cashier: Cashier) {
    if (!window.confirm(`¿Eliminar al cajero ${cashier.display_name}? Perderá el acceso inmediatamente.`)) return;
    await action(async () => {
      if (!supabase || demo) throw new InputError('La vista previa no elimina cajeros.');
      const result = await supabase.functions.invoke('manage-cashiers', { body: { action: 'delete', user_id: cashier.user_id } });
      if (result.error || !result.data?.ok) throw await functionError(result.error, result.data, 'No se pudo eliminar el cajero.');
      setCashiers(old => old.filter(item => item.user_id !== cashier.user_id));
    });
  }

  return <section className="cashier-admin" aria-labelledby="cashier-title">
    <div className="account-heading"><div><h1 id="cashier-title">Cajeros</h1><p>Creá accesos y decidí qué apartados puede utilizar cada persona.</p></div><strong>{cashiers.length} cajeros</strong></div>
    <form className="cashier-create" onSubmit={createCashier}>
      <div className="cashier-create-fields">
        <label>Nombre visible<input name="display_name" maxLength={80} placeholder="Ejemplo: Carlos" required /></label>
        <label>Usuario<input name="username" minLength={3} maxLength={32} pattern="[a-zA-Z0-9._-]+" autoCapitalize="none" spellCheck={false} placeholder="carlos" required /></label>
        <label>Contraseña<input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Mínimo 8 caracteres" required /></label>
        <label>Icono<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      </div>
      <fieldset className="cashier-permissions"><legend>Accesos iniciales</legend>{staffPermissionPages.map(permission => <label key={permission}><span>{titles[permission]}</span><input type="checkbox" role="switch" checked={newPermissions[permission]} onChange={event => setNewPermissions(value => ({ ...value, [permission]: event.target.checked }))} /></label>)}</fieldset>
      <button className="cashier-create-submit" disabled={busy || loading}>Crear cajero</button>
    </form>
    {loading ? <p className="empty">Cargando cajeros…</p> : loadError ? <p className="empty">{loadError}</p> : !cashiers.length ? <p className="empty">Todavía no creaste ningún cajero.</p> : <div className="cashier-list">{cashiers.map(cashier => <article className={`cashier-card${cashier.active ? '' : ' inactive'}`} key={cashier.user_id}>
      <header className="cashier-card-header">
        <span className="cashier-avatar">{avatarUrl(cashier) ? <img src={avatarUrl(cashier)!} alt="" /> : <UserRound />}</span>
        <div><strong>{cashier.display_name}</strong><small>@{cashier.username}</small></div>
        <button type="button" role="switch" aria-checked={cashier.active} onClick={() => void toggleActive(cashier)}><span />{cashier.active ? 'Activo' : 'Pausado'}</button>
      </header>
      <div className="cashier-access-grid">{staffPermissionPages.map(permission => <button type="button" role="switch" aria-checked={cashier[permission]} className={cashier[permission] ? 'enabled' : ''} key={permission} onClick={() => void togglePermission(cashier, permission)}><span />{titles[permission]}</button>)}</div>
      {passwordId === cashier.user_id && <form className="cashier-password" onSubmit={event => void changePassword(event, cashier)}><input name="password" type="password" minLength={8} maxLength={72} autoComplete="new-password" placeholder="Nueva contraseña" required /><button disabled={busy}>Guardar contraseña</button><button type="button" onClick={() => setPasswordId(null)}>Cancelar</button></form>}
      <div className="cashier-card-actions">
        <label className="cashier-file-button"><Camera />Cambiar icono<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void changeAvatar(cashier, event.target.files?.[0])} /></label>
        <button type="button" onClick={() => setPasswordId(cashier.user_id)}><KeyRound />Cambiar contraseña</button>
        <button type="button" className="cashier-delete" onClick={() => void removeCashier(cashier)}><Trash2 />Eliminar</button>
      </div>
    </article>)}</div>}
  </section>;
}
