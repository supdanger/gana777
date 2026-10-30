import { useEffect, useRef, useState } from 'react';
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

export function ChatImage({ path, source = 'app' }: { path: string; source?: 'app' | 'external' }) {
  const slot = useRef<HTMLSpanElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = slot.current;
    if (!element || nearViewport || !('IntersectionObserver' in window)) {
      setNearViewport(true);
      return;
    }
    const root = element.closest('.admin-chat-messages, .player-chat-log');
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { root, rootMargin: '240px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport]);
  useEffect(() => {
    if (!nearViewport || !supabase) return;
    let alive = true;
    setUrl(''); setFailed(false);
    void supabase.storage.from(source === 'external' ? 'external-chat-files' : bucket).createSignedUrl(path, source === 'external' ? 3600 : 86400).then(({ data, error }) => {
      if (!alive) return;
      if (error || !data?.signedUrl) setFailed(true);
      else setUrl(data.signedUrl);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [path, source, nearViewport]);
  const stateClass = source === 'external' ? 'external-chat-image-loading' : 'chat-image-loading';
  return <span className="chat-image-slot" ref={slot}>
    {failed ? <span className="chat-image-error">No pudimos abrir la imagen.</span>
      : !url ? <span className={stateClass}><ImageIcon size={18} /> Cargando imagen…</span>
        : <a className={`chat-image${source === 'external' ? ' external-chat-image-link' : ''}`} href={url} target="_blank" rel="noreferrer" aria-label="Abrir imagen adjunta"><img className={source === 'external' ? 'external-chat-image' : undefined} src={url} alt="Imagen adjunta" loading="lazy" /></a>}
  </span>;
}
