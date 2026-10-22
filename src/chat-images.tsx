import { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { supabase } from './lib';
import { compressReceipt } from './image-compression';
import { InputError, validateReceipt } from '../supabase/functions/_shared/validation';

const bucket = 'chat-images';
const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

export async function uploadChatImage(userId: string, file: File): Promise<string> {
  if (!supabase) throw new InputError('No pudimos conectar con el chat.');
  if (!file.type.startsWith('image/')) throw new InputError('Elegí una imagen para adjuntar.');
  const image = await compressReceipt(file);
  await validateReceipt(image);
  const extension = extensions[image.type];
  if (!extension) throw new InputError('La imagen debe ser JPG, PNG o WebP.');
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(bucket).upload(path, image, {
    contentType: image.type, upsert: false,
  });
  if (error) throw new InputError('No pudimos adjuntar la imagen. Intentá de nuevo.');
  return path;
}

export async function removeChatImage(path: string): Promise<void> {
  if (supabase) await supabase.storage.from(bucket).remove([path]);
}

export function useChatImagePreview(file: File | null): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

export function ChatImage({ path }: { path: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    setUrl(''); setFailed(false);
    void supabase.storage.from(bucket).createSignedUrl(path, 86400).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setUrl(data.signedUrl);
    });
    return () => { alive = false; };
  }, [path]);
  if (failed) return <span className="chat-image-error">No pudimos abrir la imagen.</span>;
  if (!url) return <span className="chat-image-loading"><ImageIcon size={18} /> Cargando imagen…</span>;
  return <a className="chat-image" href={url} target="_blank" rel="noreferrer" aria-label="Abrir imagen adjunta"><img src={url} alt="Imagen adjunta" loading="lazy" /></a>;
}
