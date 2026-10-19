import { useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from './lib';
import { loadLottie, type AnimationItem } from './lottie-player';

export function ContactAnimation({ path, fallback }: { path: string | null; fallback: ReactNode }) {
  const mount = useRef<HTMLSpanElement>(null);
  const [readyPath, setReadyPath] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!path || !supabase || !mount.current || reducedMotion) return;
    setReadyPath(null);
    const container = mount.current;
    let alive = true;
    let visible = true;
    let animation: AnimationItem | null = null;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    function syncPlayback() {
      if (animation) {
        if (visible && !document.hidden) animation.play(); else animation.pause();
      }
    }
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? true; syncPlayback();
    });
    observer?.observe(container);
    document.addEventListener('visibilitychange', syncPlayback);
    async function start() {
      try {
        const url = supabase!.storage.from('app-assets').getPublicUrl(path!).data.publicUrl;
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Animación no disponible.');
        const text = await response.text();
        if (text.length > 5 * 1024 * 1024) throw new Error('Animación demasiado grande.');
        const data: unknown = JSON.parse(text);
        if (!data || typeof data !== 'object' || !('layers' in data) || !Array.isArray(data.layers)) throw new Error('JSON Lottie inválido.');
        const player = await loadLottie();
        if (!alive) return;
        animation = player.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: false,
          animationData: data as Record<string, unknown>, rendererSettings: { preserveAspectRatio: 'xMidYMid meet' } });
        animation.addEventListener('DOMLoaded', () => { if (alive) { setReadyPath(path); syncPlayback(); } });
        animation.addEventListener('data_failed', () => { if (alive) setReadyPath(null); });
      } catch { if (alive) setReadyPath(null); }
      finally { window.clearTimeout(timeout); }
    }
    void start();
    return () => {
      alive = false; window.clearTimeout(timeout); controller.abort(); observer?.disconnect();
      document.removeEventListener('visibilitychange', syncPlayback);
      animation?.destroy();
    };
  }, [path, reducedMotion]);
  const ready = !!path && readyPath === path && !reducedMotion;
  return <span className={`contact-animation ${ready ? 'is-ready' : ''}`} aria-hidden="true">
    <span className="contact-animation-player" ref={mount} />
    {!ready && <span className="contact-animation-fallback">{fallback}</span>}
  </span>;
}
