import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpFromLine, BellRing, BookOpen,
  Check, Clock3, Disc, Gift, History, Landmark, Layers3, Lightbulb,
  MessageCircle, MessagesSquare, PanelsTopLeft, Palette, PhoneCall, Settings2,
  UserCog, UserRound, Users, X,
} from 'lucide-react';
import { titles, type Page } from './user-views';

type Guide = { intro: string; steps: string[]; visuals?: { title: string; detail: string }[]; tip?: string };

const guides: Partial<Record<Page, Guide>> = {
  home: {
    intro: 'Resumen del turno y accesos rápidos a lo que necesita atención.',
    steps: ['Revisá cuántas cargas y retiros siguen pendientes.', 'Consultá los contadores de bonos y el movimiento de jugadores.', 'Abrí la sección correspondiente desde el menú para revisar cada caso.'],
    visuals: [{ title: 'Pendientes', detail: 'Cargas y retiros por atender' }, { title: 'Resumen', detail: 'Bonos y actividad de jugadores' }, { title: 'Abrir apartado', detail: 'Entrá a la sección que necesitás' }],
    tip: 'Si trabajás en un puesto de caja, elegí primero su SAC en Cargas.',
  },
  deposit: {
    intro: 'Revisá las cargas que enviaron los jugadores y acreditá las que correspondan.',
    steps: ['Abrí una solicitud pendiente para ver el usuario, el monto y el comprobante.', 'Compará el comprobante con el monto y los datos de pago.', 'Elegí si corresponde entregar el bono y aceptá la carga; si no coincide, rechazala.'],
    visuals: [{ title: 'Cargas pendientes', detail: 'Abrí la solicitud del jugador' }, { title: 'Monto y comprobante', detail: 'Verificá que coincidan' }, { title: 'Aceptar o rechazar', detail: 'Confirmá después de revisar' }],
    tip: 'Aceptar acredita la carga. Rechazar es definitivo: verificá el comprobante antes de confirmar.',
  },
  withdrawal: {
    intro: 'Gestioná los retiros pendientes y registrá cada pago con su comprobante.',
    steps: ['Abrí el retiro y comprobá el titular, la cuenta de destino y el monto.', 'Seleccioná la cuenta de origen desde la que vas a transferir.', 'Adjuntá el comprobante de cada pago y confirmalo. Si el retiro tiene varias partes, repetí el proceso hasta completarlas todas.'],
    visuals: [{ title: 'Solicitud de retiro', detail: 'Revisá titular y monto' }, { title: 'Cuenta de origen', detail: 'Elegí desde dónde transferís' }, { title: 'Comprobante de pago', detail: 'Adjuntá y confirmá cada parte' }],
    tip: 'El retiro queda en proceso hasta que se registren todos sus pagos. Rechazalo solo después de revisar los datos.',
  },
  chat: {
    intro: 'Bandeja de mensajes de jugadores. Las conversaciones vinculadas con la burbuja externa aparecen junto con las del chat normal.',
    steps: ['Usá la búsqueda y los filtros para encontrar una conversación.', 'Seleccioná al jugador, leé el historial y respondé desde el campo inferior.', 'Marcá como completado cuando quede resuelta; podés reabrirla si vuelve a necesitar atención.'],
    visuals: [{ title: 'Buscar conversación', detail: 'Filtrá por usuario o estado' }, { title: 'Responder', detail: 'Leé el historial y escribí abajo' }, { title: 'Estado del chat', detail: 'Completá o reabrí la conversación' }],
    tip: 'Enter envía el mensaje y Shift + Enter agrega una línea. También podés adjuntar una imagen.',
  },
  'external-chat': {
    intro: 'Atendé las consultas que llegan desde la burbuja pública del sitio.',
    steps: ['Elegí una conversación y revisá lo que escribió el visitante.', 'Respondé en el mismo hilo para continuar la atención.', 'Si identificaste su usuario, vinculalo con el nombre exacto: desde entonces sus mensajes se reúnen en Chat.'],
    visuals: [{ title: 'Consultas externas', detail: 'Abrí el mensaje del visitante' }, { title: 'Responder en el hilo', detail: 'La respuesta llega a la burbuja' }, { title: 'Vincular jugador', detail: 'Uní ambos chats por usuario' }],
    tip: 'Vincular une el historial externo con el jugador seleccionado; revisá el usuario antes de confirmar.',
  },
  announcements: {
    intro: 'Prepará mensajes que se mostrarán a los jugadores en el portal.',
    steps: ['Escribí un título y el contenido del aviso.', 'Definí cuándo debe aparecer y guardá la programación.', 'Revisá el estado y la fecha en la lista; editá o cancelá el aviso desde sus acciones.'],
    visuals: [{ title: 'Redactar aviso', detail: 'Título y mensaje para jugadores' }, { title: 'Programar', detail: 'Elegí días y hora de Asunción' }, { title: 'Mensajes activos', detail: 'Editá, pausá o eliminá' }],
    tip: 'Antes de programar, comprobá el texto, la fecha y la hora para evitar avisos fuera de momento.',
  },
  'access-requests': {
    intro: 'Revisá solicitudes de acceso, respondé desde el chat y creá la cuenta del jugador.',
    steps: ['Buscá la solicitud y confirmá el usuario que recibirá.', 'Respondé cualquier duda antes de crear el acceso.', 'Ingresá la contraseña definitiva y el enlace personal del casino; luego elegí Crear usuario y enviar acceso.'],
    visuals: [{ title: 'Solicitud', detail: 'Buscá y verificá el usuario' }, { title: 'Conversación', detail: 'Respondé antes de configurar' }, { title: 'Crear acceso', detail: 'Contraseña + enlace personal' }],
    tip: 'También podés crear un usuario manualmente sin una solicitud previa usando el botón Crear usuario.',
  },
  users: {
    intro: 'Creá jugadores y mantené su teléfono, ID externo y WhatsApp de atención.',
    steps: ['Abrí Nuevo jugador y completá usuario, contraseña, teléfono y WhatsApp principal.', 'Si corresponde, buscá y elegí quién lo recomendó antes de crear la cuenta.', 'Buscá luego en el directorio para editar datos o cambiar la contraseña.'],
    visuals: [{ title: 'Nuevo jugador', detail: 'Usuario, clave, teléfono y principal' }, { title: 'Recomendador', detail: 'Elegilo antes de crear la cuenta' }, { title: 'Directorio', detail: 'Buscá, editá o cambiá la clave' }],
    tip: 'El recomendador queda vinculado al crear al jugador; revisalo antes porque después no se puede cambiar.',
  },
  platform: {
    intro: 'Consultá la ficha Platform del jugador: cuenta, acceso al casino y actividad.',
    steps: ['Buscá el nombre de usuario y abrí su ficha.', 'En Datos editá teléfono, nombre visible, ID externo o WhatsApp principal.', 'En Acceso actualizá el enlace personal, cambiá la contraseña o suspendé/reactivá la cuenta.', 'Consultá Actividad para revisar movimientos recientes.'],
    visuals: [{ title: 'Buscar jugador', detail: 'Abrí la ficha correcta' }, { title: 'Datos', detail: 'Editá perfil y contacto' }, { title: 'Acceso', detail: 'Enlace, contraseña y estado' }, { title: 'Actividad', detail: 'Revisá cargas y retiros' }],
    tip: 'Cambiar la contraseña avisa al jugador por el chat. Verificá el usuario antes de guardar.',
  },
  shifts: {
    intro: 'Controlá qué turno atiende, el cierre de caja entre turnos y el modo mantenimiento.',
    steps: ['Elegí en Cargas el SAC (puesto de caja) asignado a esta computadora.', 'Al cambiar de turno, definí la duración del cierre y cuál turno entra después.', 'Si hace falta detener las cuentas nuevas, activá mantenimiento; elegí un turno para volver a ponerlas en línea.'],
    visuals: [{ title: 'Puesto de caja', detail: 'Elegí su SAC en Cargas' }, { title: 'Cambio de turno', detail: 'Duración y próximo turno' }, { title: 'Mantenimiento', detail: 'Pausá o volvé a poner en línea' }],
    tip: 'El cierre dura de 1 a 10 minutos. Durante ese período las cuentas nuevas se detienen y el siguiente turno puede activarse automáticamente.',
  },
  referrals: {
    intro: 'Acreditá los bonos que se generan cuando un jugador invita a otra persona.',
    steps: ['Abrí Pendientes y tomá el bono que vas a gestionar.', 'Copiá el usuario y el monto; entregá el beneficio en el casino.', 'Volvé aquí y marcá «Ya acredité este bono». Usá Liberar sin acreditar solo si no lo entregaste.'],
    visuals: [{ title: 'Pendientes', detail: 'Tomá el bono para gestionarlo' }, { title: 'Acreditar afuera', detail: 'Copiá usuario y monto' }, { title: 'Confirmar', detail: 'Marcá solo cuando ya lo entregaste' }],
    tip: 'La primera carga aprobada genera $1.000 para quien recomendó y $1.000 para el nuevo jugador. Acreditá ambos manualmente.',
  },
  wheel: {
    intro: 'Activá la ruleta, organizá sus premios y acreditá los giros ganados.',
    steps: ['En Premios, definí el monto y cuántos espacios ocupa cada premio; guardá los cambios.', 'Prendé la ruleta para que esté visible para los jugadores.', 'En Acreditación, tomá un premio pendiente, entregalo en la plataforma externa y confirmalo aquí.'],
    visuals: [{ title: 'Editar premios', detail: 'Monto y cantidad de espacios' }, { title: 'Visibilidad', detail: 'Prendé o apagá la ruleta' }, { title: 'Acreditación', detail: 'Entregá y confirmá el premio' }],
    tip: 'Cada jugador puede girar una vez cada 24 horas. El premio no se carga automáticamente: entregalo en el casino antes de marcarlo como acreditado.',
  },
  history: {
    intro: 'Consultá operaciones anteriores de cargas y retiros.',
    steps: ['Elegí la pestaña Cargas o Retiros.', 'Buscá la operación y revisá su estado y detalle.', 'Usá la paginación para consultar registros más antiguos.'],
    visuals: [{ title: 'Cargas / Retiros', detail: 'Elegí qué historial consultar' }, { title: 'Detalle', detail: 'Revisá monto, jugador y estado' }, { title: 'Más registros', detail: 'Avanzá a páginas anteriores' }],
  },
  contacts: {
    intro: 'Mantené actualizados los canales de contacto que aparecen en el portal.',
    steps: ['Editá el canal y el dato de contacto que quieras publicar.', 'Revisá que el enlace o número sea correcto.', 'Guardá y comprobá cómo queda disponible para los jugadores.'],
    visuals: [{ title: 'Canales', detail: 'WhatsApp, Telegram e Instagram' }, { title: 'Datos de contacto', detail: 'Verificá el número o enlace' }, { title: 'Visibilidad', detail: 'Elegí qué canales mostrar' }],
    tip: 'Probá cada enlace antes de guardarlo para evitar dirigir a los jugadores a un contacto incorrecto.',
  },
  portal: {
    intro: 'Configurá el banner que aparece antes de Cargar y sus imágenes para cada tema.',
    steps: ['Subí o elegí la imagen que querés mostrar.', 'Pegá el enlace de destino y ajustá el encuadre.', 'Guardá el banner y probá el enlace desde la vista previa o el portal.'],
    visuals: [{ title: 'Imagen del banner', detail: 'Elegí o subí el archivo' }, { title: 'Destino y encuadre', detail: 'Ajustá enlace y posición' }, { title: 'Probar', detail: 'Guardá y abrí el portal' }],
    tip: 'Usá las proporciones recomendadas que muestra cada control para evitar recortes en celular.',
  },
  themes: {
    intro: 'Personalizá colores y apariencia del portal para cada tema.',
    steps: ['Seleccioná el tema que querés editar.', 'Ajustá sus colores, fondos y estilos.', 'Guardá y previsualizá el portal antes de dejar el tema activo.'],
    visuals: [{ title: 'Elegir tema', detail: 'Abrí el tema que vas a editar' }, { title: 'Personalizar', detail: 'Colores, fondos y apariencia' }, { title: 'Previsualizar', detail: 'Revisá antes de aplicar' }],
    tip: 'Revisá el contraste de textos y botones tanto en celular como en computadora.',
  },
  bonuses: {
    intro: 'Creá y mantené los bonos que pueden ver y solicitar los jugadores.',
    steps: ['Creá un bono y definí nombre, tipo, límites y condiciones.', 'Configurá vigencia y requisitos, como carga mínima o cantidad de cargas permitidas.', 'Subí la imagen, ajustá su encuadre y la posición de los controles.', 'Guardá y comprobá la tarjeta desde el portal.'],
    visuals: [{ title: 'Datos y condiciones', detail: 'Tipo, monto y límites' }, { title: 'Requisitos', detail: 'Carga mínima y usos permitidos' }, { title: 'Tarjeta del bono', detail: 'Imagen, encuadre y botones' }, { title: 'Vista previa', detail: 'Guardá y revisá el portal' }],
    tip: 'Si la imagen ya incluye el texto del bono, activá la opción para ocultar el texto superpuesto.',
  },
  accounts: {
    intro: 'Organizá las cuentas bancarias por turno y el teléfono o SAC desde donde se usan.',
    steps: ['Elegí el turno que querés administrar.', 'Agregá o editá banco, titular, teléfono, CBU/CVU y alias; podés cargar un banner opcional.', 'Revisá los datos y activá la cuenta para que esté disponible al operar.'],
    visuals: [{ title: 'Elegir turno', detail: 'Mañana, tarde o noche' }, { title: 'Datos bancarios', detail: 'Titular, teléfono, CBU/CVU y alias' }, { title: 'Cuenta activa', detail: 'Confirmá que se pueda usar' }],
    tip: 'Un dato incorrecto puede enviar una transferencia a un destino equivocado. Comprobá CBU/CVU y alias antes de guardar.',
  },
  telegram: {
    intro: 'Elegí a qué grupos de Telegram se envía cada tipo de aviso del sistema.',
    steps: ['Pegá el ID del grupo que recibirá cada tipo de aviso.', 'Activá o pausá el envío para esa función y guardá.', 'Enviá una prueba y revisá abajo el estado de los últimos avisos.'],
    visuals: [{ title: 'Destino del aviso', detail: 'Ingresá el ID del grupo' }, { title: 'Activar y guardar', detail: 'Elegí si se envía' }, { title: 'Prueba e historial', detail: 'Confirmá que llegó' }],
    tip: 'No compartas tokens del bot en chats públicos ni capturas del panel.',
  },
  cashiers: {
    intro: 'Creá cajeros y controlá qué secciones pueden usar en el panel.',
    steps: ['Creá el acceso del cajero con sus datos de ingreso.', 'Activá únicamente los permisos que necesita para su tarea.', 'Guardá y pedile que vuelva a ingresar para que se apliquen los permisos.'],
    visuals: [{ title: 'Nuevo cajero', detail: 'Creá usuario y contraseña' }, { title: 'Permisos', detail: 'Habilitá solo lo necesario' }, { title: 'Guardar acceso', detail: 'Pedile que vuelva a ingresar' }],
    tip: 'Los permisos determinan qué apartados aparecen y qué acciones puede realizar cada cajero.',
  },
  'external-chat-admin': {
    intro: 'Controlá si la burbuja de chat está visible y obtené el código para instalarla en el sitio.',
    steps: ['Usá el interruptor para activar o pausar la burbuja.', 'Copiá el código de integración y pasáselo al equipo que administra gana777bet.com.', 'Pediles que la prueben en el sitio publicado; volvé al interruptor si necesitás ocultarla.'],
    visuals: [{ title: 'Burbuja del sitio', detail: 'Activala o pausala' }, { title: 'Código de integración', detail: 'Copialo para el equipo web' }, { title: 'Sitio publicado', detail: 'Comprobá que abra el chat' }],
    tip: 'El código lleva una clave pública para el navegador. Nunca compartas claves secretas de administración.',
  },
};

export function AdminPageGuide({ page }: { page: Page }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const guide = guides[page] ?? { intro: 'Ayuda rápida para usar este apartado.', steps: ['Revisá las opciones disponibles.', 'Guardá los cambios y comprobá el resultado.'] };
  const title = page === 'external-chat-admin' ? 'Configuración del chat externo' : titles[page];
  const pageIcons: Partial<Record<Page, typeof BookOpen>> = {
    home: Activity, deposit: ArrowDownToLine, withdrawal: ArrowUpFromLine, chat: MessagesSquare,
    'external-chat': MessageCircle, announcements: BellRing, 'access-requests': UserRound,
    users: Users, platform: Layers3, shifts: Clock3, referrals: Gift, wheel: Disc,
    history: History, contacts: PhoneCall, portal: PanelsTopLeft, themes: Palette,
    bonuses: Gift, accounts: Landmark, telegram: BellRing, cashiers: UserCog,
    'external-chat-admin': Settings2,
  };
  const PageIcon = pageIcons[page] ?? BookOpen;
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!open) { setIndex(0); return; }
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab' || !dialog.current) return;
      const buttons = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown, true); returnFocus.current?.focus(); };
  }, [open, close]);
  const PageIconComponent = PageIcon;
  const accents = ['#d56bff', '#f0b429', '#3ec6ff', '#3ddea0', '#ff6ad5', '#7ee0ff'];
  const totalSteps = guide.steps.length;
  const visuals = guide.visuals ?? guide.steps.map((_, itemIndex) => ({ title: `Acción ${itemIndex + 1}`, detail: 'Seguí la indicación de este paso' }));
  const chapters = guide.steps.map((body, itemIndex) => ({
    topic: visuals[itemIndex]?.title ?? `Acción ${itemIndex + 1}`,
    detail: visuals[itemIndex]?.detail ?? 'Seguí la indicación de este paso',
    body,
    accent: accents[itemIndex % accents.length],
  }));
  const step = chapters[index] ?? chapters[0];
  const columns = chapters.length === 4 ? 2 : Math.min(chapters.length, 3);
  const accentStyle = { '--guide-accent': step.accent } as CSSProperties;
  function goTo(next: number) { setIndex(Math.max(0, Math.min(chapters.length - 1, next))); }
  return <>
    <section className="admin-page-guide" aria-label={`Tutorial de ${title}`}>
      <span className="admin-page-guide-icon"><BookOpen size={18} /></span>
      <div className="admin-page-guide-copy"><strong>¿Primera vez en {title}?</strong><small>{guide.intro}</small></div>
      <button type="button" className="admin-page-guide-start" onClick={() => { setIndex(0); setOpen(true); }}><BookOpen size={16} />Ver paso a paso</button>
    </section>
    {open && createPortal(<div className="admin-guide-backdrop">
      <section ref={dialog} className="admin-guide-dialog" style={accentStyle} role="dialog" aria-modal="true" aria-labelledby="admin-guide-title" aria-describedby="admin-guide-description" tabIndex={-1}>
        <header className="admin-guide-header"><span className="admin-guide-brand"><BookOpen size={16} /> GUÍA · {title}</span><button type="button" className="admin-guide-close" aria-label="Cerrar tutorial" onClick={close}><X size={19} /></button></header>
        <nav className="admin-guide-chapters" aria-label="Apartados de esta guía" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{chapters.map((item, dot) => <button key={`${item.topic}-${dot}`} type="button" className={dot === index ? 'active' : dot < index ? 'seen' : ''} style={{ '--guide-accent': item.accent } as CSSProperties} aria-current={dot === index ? 'step' : undefined} onClick={() => goTo(dot)}><b>{dot + 1}</b><span>{item.topic}</span></button>)}</nav>
        <div className="admin-guide-progress" aria-label={`${step.topic}, apartado ${index + 1} de ${totalSteps}`}><span>{step.topic.toUpperCase()} · {String(index + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}</span><div><i style={{ width: `${((index + 1) / totalSteps) * 100}%` }} /></div></div>
        <div className="admin-guide-preview" key={`${page}-${index}`} role="img" aria-label={`Apartado ${step.topic} de ${title}`}>
          <header className="admin-guide-preview-heading"><span><PageIconComponent size={16} /></span><div><small>{title.toUpperCase()}</small><strong>{step.topic}</strong></div><b>{String(index + 1).padStart(2, '0')}</b></header>
          <div className="admin-guide-preview-screen"><article className="admin-guide-section"><b aria-hidden="true">{String(index + 1).padStart(2, '0')}</b><div><strong>{step.topic}</strong><small>{step.detail}</small></div></article></div>
        </div>
        <div className="admin-guide-copy-step" key={`copy-${index}`}><span className="admin-guide-label">APARTADO {String(index + 1).padStart(2, '0')}</span><h2 id="admin-guide-title">{step.topic}</h2><p id="admin-guide-description">{step.body}</p>{guide.tip && index === totalSteps - 1 && <aside><Lightbulb size={16} /><span><strong>Tené en cuenta</strong>{guide.tip}</span></aside>}</div>
        <footer className="admin-guide-footer"><div className="admin-guide-actions">{index > 0 && <button type="button" className="admin-guide-back" onClick={() => goTo(index - 1)}><ArrowLeft size={17} />Atrás</button>}<button type="button" className="admin-guide-next" onClick={() => index === totalSteps - 1 ? close() : goTo(index + 1)}>{index === totalSteps - 1 ? 'Terminar guía' : `Siguiente: ${chapters[index + 1].topic}`}{index === totalSteps - 1 ? <Check size={17} /> : <ArrowRight size={17} />}</button></div></footer>
      </section>
    </div>, document.body)}
  </>;
}
