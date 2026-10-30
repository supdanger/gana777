import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { StorageImage, useContent } from './content';
import { homeBannerImage } from './home-banner';

const steps = [
  {
    label: 'EMPEZAMOS', title: 'Todo lo que necesitás, en Inicio',
    description: 'Te mostramos el camino para elegir un bono, cargar, jugar y retirar. Podés volver a ver esta guía cuando quieras.',
    tip: 'Es un recorrido corto. Avanzá a tu ritmo.', visualLabel: 'Los botones que vas a encontrar en Inicio',
  },
  {
    label: 'ANTES DE CARGAR', title: 'Elegí un bono',
    description: 'Tocá Bonos, leé las condiciones y pulsá Obtener en el que quieras usar. La app te llevará a Cargas con ese bono elegido.',
    tip: 'Si no querés un bono, podés ir directo a Cargas.', visualLabel: 'Tocá esta tarjeta para elegir tu bono',
  },
  {
    label: 'PASO SIGUIENTE', title: 'Hacé tu carga',
    description: 'En Cargas escribí el monto, seguí los datos de pago y subí una foto clara del comprobante. Después enviá la solicitud.',
    tip: 'La carga mínima es $1.000. Podés revisar su estado en Mi perfil.', visualLabel: 'Buscá esta tarjeta en Inicio',
  },
  {
    label: 'A JUGAR', title: 'Abrí el casino',
    description: 'Tocá Jugar en Inicio para abrir el casino. Ingresá allí con el usuario y la contraseña que recibiste para jugar.',
    tip: 'El botón Jugar es el banner grande de arriba.', visualLabel: 'El banner grande abre el casino',
  },
  {
    label: 'CUANDO QUIERAS RETIRAR', title: 'Solicitá un retiro',
    description: 'Entrá en Retiros, completá el monto y los datos que te pide la pantalla. Enviá la solicitud y seguí su estado en Mi perfil.',
    tip: 'Revisá que tus datos estén correctos antes de enviar.', visualLabel: 'Buscá esta tarjeta en Inicio',
  },
  {
    label: 'SI NECESITÁS AYUDA', title: 'Estamos para ayudarte',
    description: 'Tocá CHAT en Inicio para escribirnos. También podés ver el historial de tus cargas y retiros desde Mi perfil.',
    tip: 'Esta guía siempre estará en la tarjeta Tutorial, junto a Bonos.', visualLabel: 'La burbuja CHAT está en Inicio',
  },
] as const;

function TutorialArtwork({ path, title }: { path: string | null | undefined; title: string }) {
  if (!path) return <span className="home-tutorial-art-fallback">{title}</span>;
  return path.startsWith('/')
    ? <img src={path} alt="" draggable={false} decoding="async" />
    : <StorageImage path={path} alt="" />;
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
  const dialog = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) { setIndex(0); return; }
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
  const design = settings.portal_theme_designs?.[settings.portal_theme];
  const images = {
    casino: homeBannerImage(settings, settings.portal_theme),
    deposit: design?.depositPath,
    withdrawal: design?.withdrawalPath,
    bonuses: design?.bonusesPath,
    chat: '/chat-soporte-transparent.png',
  };
  const stepImage = [null, images.bonuses, images.deposit, images.casino, images.withdrawal, images.chat][index];
  return createPortal(<div className="home-tutorial-backdrop" data-required={required ? 'true' : undefined}>
    <section ref={dialog} className="home-tutorial-dialog" role="dialog" aria-modal="true" aria-labelledby="home-tutorial-title" aria-describedby="home-tutorial-description" tabIndex={-1}>
      <header className="home-tutorial-header"><span className="home-tutorial-brand">GUÍA GANA777</span>{required ? <span className="home-tutorial-required">PRIMER INGRESO</span> : <button type="button" className="home-tutorial-close" aria-label="Cerrar tutorial" onClick={onClose}><X size={20} /></button>}</header>
      <div className="home-tutorial-progress" aria-label={`Paso ${index + 1} de ${steps.length}`}><span>PASO {String(index + 1).padStart(2, '0')} / {String(steps.length).padStart(2, '0')}</span><div className="home-tutorial-progress-track"><i style={{ width: `${((index + 1) / steps.length) * 100}%` }} /></div></div>
      <div className="home-tutorial-visual" aria-hidden="true"><div className={`home-tutorial-artwork${index === 0 ? ' is-collage' : ''}`}>{index === 0 ? <><TutorialArtwork path={images.casino} title="JUGAR" /><TutorialArtwork path={images.deposit} title="CARGAS" /><TutorialArtwork path={images.withdrawal} title="RETIROS" /><TutorialArtwork path={images.bonuses} title="BONOS" /></> : <TutorialArtwork path={stepImage} title={step.title} />}</div><span className="home-tutorial-visual-number">{String(index + 1).padStart(2, '0')}</span><span className="home-tutorial-visual-caption">{step.visualLabel}</span></div>
      <div className="home-tutorial-copy" key={index}><span className="home-tutorial-label">{step.label}</span><h2 id="home-tutorial-title">{step.title}</h2><p id="home-tutorial-description">{step.description}</p><div className="home-tutorial-tip"><Check size={17} aria-hidden="true" /><span>{required && index === 0 ? 'Completá el recorrido para continuar en la app.' : step.tip}</span></div></div>
      <footer className="home-tutorial-footer"><div className="home-tutorial-dots" aria-hidden="true">{steps.map((_, dot) => <span key={dot} className={dot === index ? 'active' : ''} />)}</div><div className="home-tutorial-actions">{index === 0 ? required ? null : <button type="button" className="home-tutorial-skip" onClick={onClose}>Omitir</button> : <button type="button" className="home-tutorial-back" onClick={() => setIndex(index - 1)}><ArrowLeft size={17} /> Atrás</button>}<button type="button" className="home-tutorial-next" onClick={() => index === steps.length - 1 ? onFinish() : setIndex(index + 1)}>{index === steps.length - 1 ? 'Terminar tutorial' : index === 0 ? 'Empezar' : 'Siguiente'}{index === steps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></footer>
    </section>
  </div>, document.body);
}
