// Loaded only after an administrator configures a contact animation.
// The light player supports vector JSON without evaluating After Effects expressions.
export type AnimationItem = {
  play(): void; pause(): void; destroy(): void;
  addEventListener(event: string, listener: () => void): void;
};
type LottiePlayer = {
  loadAnimation(options: {
    container: HTMLElement; renderer: 'svg'; loop: boolean; autoplay: boolean;
    animationData: Record<string, unknown>;
    rendererSettings: { preserveAspectRatio: string };
  }): AnimationItem;
};
declare global { interface Window { lottie?: LottiePlayer } }
let pending: Promise<LottiePlayer> | null = null;
export function loadLottie(): Promise<LottiePlayer> {
  if (window.lottie) return Promise.resolve(window.lottie);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.13.0/lottie_light.min.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    const timeout = window.setTimeout(() => fail(), 12000);
    function fail() {
      window.clearTimeout(timeout); script.remove(); pending = null;
      reject(new Error('No se pudo cargar el reproductor Lottie.'));
    }
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.lottie) resolve(window.lottie); else fail();
    };
    document.head.appendChild(script);
  });
  return pending;
}
