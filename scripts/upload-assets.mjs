import fs from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

async function hiddenPassword() {
  if (!process.stdin.isTTY) throw new Error('Ejecutá este comando en una terminal interactiva.');
  process.stdout.write('Contraseña del administrador (no se muestra): ');
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    function finish(error) {
      process.stdin.removeListener('data', onData); process.stdin.setRawMode(false); process.stdin.pause();
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    }
    function onData(chunk) {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u0003') { finish(new Error('Cancelado.')); return; }
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else if (character >= ' ') value += character;
      }
    }
    process.stdin.on('data', onData);
  });
}
try {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Completá .env con la URL y la clave pública de Supabase.');
  const email = process.env.ASSET_ADMIN_EMAIL || 'gana777@gmail.com';
  console.log(`Subir recursos a app-assets como ${email}. Se conserva el archivo original.`);
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.auth.signInWithPassword({ email, password: await hiddenPassword() });
  if (error) throw new Error('No pudimos ingresar con esa cuenta.');
  const { data: admin, error: roleError } = await db.rpc('is_admin');
  if (roleError || !admin) throw new Error('La cuenta no tiene permisos de administrador.');
  for (const [source, target] of [
    ['panda-login-transparent.png', 'brand/panda-login-transparent.png'],
    ['panda-user-avatar.png', 'avatars/panda-user-avatar.png'],
    ['welcome-reference.png', 'banners/welcome-reference.png'],
  ]) {
    const file = await fs.readFile(new URL(`../public/preview-assets/${source}`, import.meta.url));
    const { error: uploadError } = await db.storage.from('app-assets').upload(target, file, { contentType: 'image/png', upsert: false });
    if (uploadError && uploadError.statusCode !== '409' && uploadError.statusCode !== 409) throw uploadError;
    console.log(uploadError ? `Ya existe, se conserva: ${target}` : `Subido: ${target}`);
  }
  await db.auth.signOut();
  console.log('Recursos listos en Supabase Storage.');
} catch (error) { console.error(error instanceof Error ? error.message : 'No se pudieron subir los recursos.'); process.exitCode = 1; }
