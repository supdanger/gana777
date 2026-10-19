const names = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = names.filter(name => !process.env[name]?.trim());
const url = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

async function functionProbe(name) {
  if (!url || !key) return { name, error: 'Falta la URL o la clave pública de Supabase.' };
  const target = `${url}/functions/v1/${name}`;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const options = await fetch(target, { method: 'OPTIONS' });
  const post = await fetch(target, { method: 'POST', headers });
  let message = '';
  try { message = (await post.json())?.error ?? ''; } catch { message = ''; }
  return { name, options: options.status, post: post.status, message };
}

if (missing.length) {
  console.log(`Cloudinary sin datos: ${missing.join(', ')}`);
} else {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cloud)) {
    console.log('CLOUDINARY_CLOUD_NAME tiene un formato inválido.');
  } else {
    const token = Buffer.from(`${process.env.CLOUDINARY_API_KEY.trim()}:${process.env.CLOUDINARY_API_SECRET.trim()}`).toString('base64');
    const ping = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/ping`, { headers: { Authorization: `Basic ${token}` } });
    let status = '';
    try { status = (await ping.json())?.status ?? ''; } catch { status = ''; }
    console.log(ping.ok && status === 'ok' ? 'Cloudinary respondió ok.' : `Cloudinary no aceptó las claves (HTTP ${ping.status}).`);
  }
}

for (const name of ['submit-deposit', 'receipt-url']) {
  const result = await functionProbe(name);
  if (result.error) console.log(`${name}: ${result.error}`);
  else console.log(`${name}: OPTIONS ${result.options}, POST ${result.post}${result.message ? ` — ${result.message}` : ''}`);
}
process.exit(missing.length ? 2 : 0);
