import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { StorageImage, useContent } from './content';
import { homeBannerImage } from './home-banner';

const steps = [
  {
    topic: 'Inicio', accent: '#d56bff', title: 'Todo lo que necesitás, en Inicio',
    description: 'Cada botón de abajo es un apartado distinto. Recorré Bonos, Cargas, Jugar, Retiros y Ayuda. Podés volver a esta guía cuando quieras.',
    tip: 'Es un recorrido corto. Avanzá de a un apartado.', visualLabel: 'Cada tarjeta es un apartado distinto',
  },
  {
    topic: 'Bonos', accent: '#f0b429', title: 'Elegí un bono',
    description: 'Este apartado es solo de bonos. Tocá Bonos, leé las condiciones y pulsá Obtener en el que quieras usar. La app te lleva a Cargas con ese bono elegido.',
    tip: 'Si no querés un bono, saltá este apartado e andá directo a Cargas.', visualLabel: 'Apartado Bonos',
  },
  {
    topic: 'Cargas', accent: '#3ec6ff', title: 'Hacé tu carga',
    description: 'Este apartado es para depositar. En Cargas escribí el monto, seguí los datos de pago y subí una foto clara del comprobante. Después enviá la solicitud.',
    tip: 'La carga mínima es $1.000. El estado queda en Mi perfil.', visualLabel: 'Apartado Cargas',
  },
  {
    topic: 'Jugar', accent: '#ff6ad5', title: 'Abrí el casino',
    description: 'Este apartado abre el juego. Tocá Jugar, el banner grande de Inicio, e ingresá al casino con el usuario y la contraseña que recibiste.',
    tip: 'Jugar no es lo mismo que Cargas ni que Retiros.', visualLabel: 'Apartado Jugar',
  },
  {
    topic: 'Retiros', accent: '#3ddea0', title: 'Solicitá un retiro',
    description: 'Este apartado es para cobrar. Entrá en Retiros, completá el monto y los datos que te pide la pantalla, y enviá la solicitud.',
    tip: 'Revisá que tus datos estén correctos antes de enviar. El estado queda en Mi perfil.', visualLabel: 'Apartado Retiros',
  },
  {
    topic: 'Ayuda', accent: '#c084fc', title: 'Escribinos por el chat',
    description: 'Este apartado es para hablar con soporte. Tocá CHAT en Inicio. El historial de cargas y retiros está en Mi perfil, no en el chat.',
    tip: 'La guía completa sigue en la tarjeta Tutorial, junto a Bonos.', visualLabel: 'Apartado Ayuda',
  },
] as const;

function TutorialArtwork({ path, title }: { path: string | null | undefined; title: string }) {
  if (!path) return <span className="home-tutorial-art-fallback">{title}</span>;
  return path.startsWith('/')
    ? <img src={path} alt="" draggable={false} decoding="async" />
    : <StorageImage path={path} alt="" />;
}

function TutorialTile({ path, title }: { path: string | null | undefined; title: string }) {
  return <figure className="home-tutorial-tile"><TutorialArtwork path={path} title={title} /><figcaption>{title}</figcaption></figure>;
}

const completedInSession = new Set<string>();
const storageKey = (userId: string) => `gana777:home-tutorial:v2:${userId}`;
function needsTutorial(userId: string, demo: boolean) {
  if (demo || !userId) return false;
  const key = storageKey(userId);
  if (completedInSession.has(key)) return false;
  try { return window.localStorage.getItem(key) !== 'done'; } catch { return true; }
}

export function useHomeTutorial(userId: string, demo: boolean) {
  const [mode, setMode] = useState<'required' | 'replay' | null>(() => needsTutorial(userId, demo) ? 'required' : null);
  useEffect(() => {
    setMode(needsTutorial(userId, demo) ? 'required' : null);
  }, [demo, userId]);
  const finish = useCallback(() => {
    if (!demo && userId) {
      const key = storageKey(userId);
      completedInSession.add(key);
      try { window.localStorage.setItem(key, 'done'); } catch { /* El almacenamiento puede estar deshabilitado. */ }
    }
    setMode(null);
  }, [demo, userId]);
  const close = useCallback(() => setMode(current => current === 'required' ? current : null), []);
  const show = useCallback(() => setMode(current => current === 'required' ? current : 'replay'), []);
  return { open: mode !== null, required: mode === 'required', show, close, finish };
}

export function HomeTutorial({ open, required, onClose, onFinish }: { open: boolean; required: boolean; onClose: () => void; onFinish: () => void }) {
  const { settings } = useContent();
  const [index, setIndex] = useState(0);
  const [reached, setReached] = useState(0);
  const dialog = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) { setIndex(0); setReached(0); return; }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!required) onClose(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown, true); returnFocus.current?.focus(); };
  }, [open, required, onClose]);
  if (!open) return null;
  const step = steps[index];
  function goTo(next: number) {
    if (required && next > reached) return;
    setIndex(next);
    setReached(value => Math.max(value, next));
  }
  const design = settings.portal_theme_designs?.[settings.portal_theme];
  const images = {
    casino: homeBannerImage(settings, settings.portal_theme),
    deposit: design?.depositPath,
    withdrawal: design?.withdrawalPath,
    bonuses: design?.bonusesPath,
    chat: '/chat-soporte-transparent.png',
  };
  const stepImage = [null, images.bonuses, images.deposit, images.casino, images.withdrawal, images.chat][index];
  const accentStyle = { '--tutorial-accent': step.accent } as CSSProperties;
  return createPortal(<div className="home-tutorial-backdrop" data-required={required ? 'true' : undefined}>
    <section ref={dialog} className="home-tutorial-dialog" style={accentStyle} role="dialog" aria-modal="true" aria-labelledby="home-tutorial-title" aria-describedby="home-tutorial-description" tabIndex={-1}>
      <header className="home-tutorial-header"><span className="home-tutorial-brand">GUÍA GANA777</span>{required ? <span className="home-tutorial-required">PRIMER INGRESO</span> : <button type="button" className="home-tutorial-close" aria-label="Cerrar tutorial" onClick={onClose}><X size={20} /></button>}</header>
      <nav className="home-tutorial-chapters" aria-label="Apartados de la guía">{steps.map((item, dot) => <button key={item.topic} type="button" className={dot === index ? 'active' : dot < index ? 'seen' : ''} style={{ '--tutorial-accent': item.accent } as CSSProperties} aria-current={dot === index ? 'step' : undefined} disabled={required && dot > reached} onClick={() => goTo(dot)}><b>{dot + 1}</b><span>{item.topic}</span></button>)}</nav>
      <div className="home-tutorial-progress" aria-label={`${step.topic}, apartado ${index + 1} de ${steps.length}`}><span>{step.topic.toUpperCase()} · {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span><div className="home-tutorial-progress-track"><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div></div>
      <div className="home-tutorial-visual" aria-hidden="true"><div className={`home-tutorial-artwork${index === 0 ? ' is-collage' : ''}`}>{index === 0 ? <><TutorialTile path={images.bonuses} title="BONOS" /><TutorialTile path={images.deposit} title="CARGAS" /><TutorialTile path={images.casino} title="JUGAR" /><TutorialTile path={images.withdrawal} title="RETIROS" /></> : <TutorialArtwork path={stepImage} title={step.topic} />}</div>{index > 0 && <span className="home-tutorial-topic">{step.topic}</span>}<span className="home-tutorial-visual-caption">{step.visualLabel}</span></div>
      <div className="home-tutorial-copy" key={index}><span className="home-tutorial-label">APARTADO {step.topic.toUpperCase()}</span><h2 id="home-tutorial-title">{step.title}</h2><p id="home-tutorial-description">{step.description}</p><div className="home-tutorial-tip"><Check size={17} aria-hidden="true" /><span>{required && index === 0 ? 'Completá los apartados para continuar en la app.' : step.tip}</span></div></div>
      <footer className="home-tutorial-footer"><div className="home-tutorial-actions">{index === 0 ? required ? null : <button type="button" className="home-tutorial-skip" onClick={onClose}>Omitir</button> : <button type="button" className="home-tutorial-back" onClick={() => goTo(index - 1)}><ArrowLeft size={17} /> Atrás</button>}<button type="button" className="home-tutorial-next" onClick={() => index === steps.length - 1 ? onFinish() : goTo(index + 1)}>{index === steps.length - 1 ? 'Terminar tutorial' : index === 0 ? 'Ver apartados' : `Siguiente: ${steps[index + 1].topic}`}{index === steps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></footer>
    </section>
  </div>, document.body);
}
