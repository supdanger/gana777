import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';
import { adminApp } from './lib';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pendingPrompt: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const standalone = window.matchMedia('(display-mode: standalone)');
const notify = () => listeners.forEach(listener => listener());
const isInstalled = () => installed || standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

if (!adminApp) {
  // Listen before login finishes loading so an early browser prompt is not lost.
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event as InstallPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => { installed = true; pendingPrompt = null; notify(); });
  standalone.addEventListener('change', notify);
}

export function PortalInstall() {
  const hidden = useSyncExternalStore(subscribe, isInstalled);
  const [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  if (adminApp || hidden) return null;

  async function install() {
    const prompt = pendingPrompt;
    if (!prompt) { dialog.current?.showModal(); return; }
    pendingPrompt = null;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') { installed = true; notify(); }
    } catch {
      dialog.current?.showModal();
    } finally { setBusy(false); }
  }

  return <div className="portal-install">
    <button className="portal-install-button" type="button" disabled={busy} onClick={() => void install()}><Download size={16} />{busy ? 'Abriendo instalación…' : 'Instalar GANA777'}</button>
    <dialog ref={dialog} className="portal-install-dialog" aria-labelledby={titleId}>
      <button type="button" className="portal-install-close" aria-label="Cerrar instrucciones" onClick={() => dialog.current?.close()}><X size={20} /></button>
      <h2 id={titleId}>GANA777 en tu inicio</h2>
      <p><strong>iPhone o iPad:</strong> abrí el portal en Safari, tocá Compartir y luego «Agregar a inicio». Si aparece «Abrir como app web», dejalo activado.</p>
      <p><strong>Android:</strong> abrí el portal en Chrome, entrá al menú ⋮ y elegí «Instalar aplicación» o «Agregar a la pantalla principal».</p>
      <p><strong>Computadora:</strong> buscá la opción de instalar en la barra de direcciones o en el menú de Chrome o Edge.</p>
      <p>Si estás dentro de WhatsApp u otra aplicación, abrí el enlace en tu navegador. Las opciones dependen del dispositivo y del navegador.</p>
      <small>El acceso es gratuito y necesita conexión a internet. No modifica tu cuenta ni tu contraseña.</small>
    </dialog>
  </div>;
}
