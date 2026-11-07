import { useEffect, useRef, type VideoHTMLAttributes } from 'react';

export function VisibleVideo(props: VideoHTMLAttributes<HTMLVideoElement>) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !props.autoPlay) return;
    let visible = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      if (visible && document.visibilityState === 'visible' && !reduced.matches) void video.play().catch(() => {});
      else video.pause();
    };
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(items => { visible = items[0]?.isIntersecting ?? false; update(); });
    observer?.observe(video);
    document.addEventListener('visibilitychange', update);
    reduced.addEventListener('change', update);
    update();
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', update); reduced.removeEventListener('change', update); video.pause(); };
  }, [props.autoPlay, props.src]);
  return <video {...props} ref={ref} />;
}
