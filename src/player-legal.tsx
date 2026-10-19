import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ShieldCheck, X } from 'lucide-react';

type LegalDocument = 'terms' | 'privacy';
const legalContact = {
  name: import.meta.env.VITE_LEGAL_OPERATOR_NAME?.trim() || '',
  taxId: import.meta.env.VITE_LEGAL_OPERATOR_CUIT?.trim() || '',
  address: import.meta.env.VITE_LEGAL_OPERATOR_ADDRESS?.trim() || '',
  email: import.meta.env.VITE_PRIVACY_CONTACT_EMAIL?.trim() || '',
};
const contactEmail = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(legalContact.email) ? legalContact.email : '';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="legal-section"><h3>{title}</h3>{children}</section>;
}

function Responsible() {
  return <Section title="Responsable y contacto">
    <p>GANA777 es la denominación del portal gana777bet.com. Estos documentos deben identificar a la persona o entidad que lo opera y decide para qué se utilizan los datos personales.</p>
    <dl className="legal-contact">
      <div><dt>Nombre o razón social</dt><dd>{legalContact.name || 'Pendiente de completar'}</dd></div>
      <div><dt>CUIT</dt><dd>{legalContact.taxId || 'Pendiente de completar'}</dd></div>
      <div><dt>Domicilio legal</dt><dd>{legalContact.address || 'Pendiente de completar'}</dd></div>
      <div><dt>Contacto de privacidad</dt><dd>{contactEmail ? <a href={`mailto:${contactEmail}`}>{contactEmail}</a> : 'Pendiente de completar'}</dd></div>
    </dl>
  </Section>;
}

function Terms() {
  return <>
    <Responsible />
    <Section title="1. Alcance del portal">
      <p>El portal permite acceder a una cuenta de jugador, enviar solicitudes de carga y retiro, consultar su historial y comunicarse con soporte. La plataforma externa asociada puede tener condiciones propias, que deben informarse antes de su uso.</p>
      <p>Estas condiciones no acreditan una licencia de juego ni sustituyen las autorizaciones exigidas en cada jurisdicción. Antes de publicar la versión definitiva deben identificarse el operador, las jurisdicciones habilitadas y, cuando corresponda, la autoridad y la autorización aplicables.</p>
    </Section>
    <Section title="2. Edad y cuenta personal">
      <p>El acceso está destinado exclusivamente a mayores de 18 años que puedan utilizar legalmente el servicio en su jurisdicción. No se permite registrar o utilizar cuentas de menores ni facilitarles credenciales.</p>
      <p>El personal autorizado crea las cuentas con los datos facilitados por cada jugador. El usuario debe proporcionar información propia y correcta, mantener actualizado su teléfono y comunicar cualquier acceso que no reconozca. La cuenta y sus credenciales son personales; el soporte autorizado puede restablecer la contraseña.</p>
    </Section>
    <Section title="3. Cargas y retiros">
      <p>Antes de transferir, revisá la cuenta bancaria asignada en ese momento. Las cuentas disponibles pueden variar. El comprobante debe corresponder a una operación real y permitir su verificación; no incluyas contraseñas, claves bancarias, códigos de autenticación ni información ajena a la transferencia.</p>
      <p>Enviar una solicitud o adjuntar un comprobante no equivale a una acreditación. El resultado debe confirmarse en el historial. Los retiros se solicitan con los datos del beneficiario y quedan sujetos a los controles y condiciones informados. Si detectás un error, comunicalo a soporte e indicá la solicitud correspondiente.</p>
    </Section>
    <Section title="4. Bonificaciones">
      <p>Los bonos dependen del importe ingresado y de las opciones habilitadas. Revisá el beneficio seleccionado antes de solicitar la carga. La existencia de una promoción no garantiza ganancias. Sus restricciones, vigencia y eventuales requisitos deben informarse de forma clara y respetarse para las operaciones que correspondan.</p>
    </Section>
    <Section title="5. Uso permitido y seguridad">
      <p>No está permitido falsificar comprobantes, suplantar identidades, acceder a datos de otras personas ni interferir con la seguridad del servicio. Los indicios de fraude pueden motivar una revisión o una restricción proporcionada de acceso, con un canal para consultar y reclamar. Esto no autoriza retenciones arbitrarias ni elimina derechos del usuario.</p>
      <p>El servicio puede requerir mantenimiento o sufrir interrupciones. Ante incidentes deben revisarse las operaciones y ofrecerse atención. Ninguna cláusula excluye las responsabilidades que legalmente correspondan al operador.</p>
    </Section>
    <Section title="6. Privacidad, consultas y cambios">
      <p>La Política de privacidad describe los datos utilizados y los canales para ejercer derechos. Las consultas operativas se atienden mediante el chat y los contactos habilitados. Las solicitudes sobre datos personales deben dirigirse al contacto de privacidad identificado en este documento.</p>
      <p>Los cambios relevantes deben informarse de forma accesible. No deben aplicarse retroactivamente para desconocer derechos ya adquiridos. Estos términos no imponen una renuncia a derechos irrenunciables ni a las vías administrativas o judiciales que correspondan.</p>
    </Section>
  </>;
}

function Privacy() {
  return <>
    <Responsible />
    <Section title="1. Datos que utiliza el portal">
      <ul>
        <li>Cuenta: nombre de usuario, nombre visible, teléfono, correo cuando corresponda, identificador de la plataforma asociada y canal de atención asignado.</li>
        <li>Operaciones: importe, bono seleccionado, tipo y estado de solicitud, fechas, historial, titular, CBU/CVU y alias informados para retiros.</li>
        <li>Archivos y asistencia: comprobantes de transferencias y mensajes enviados por el chat. Un comprobante puede contener datos adicionales incluidos por su emisor.</li>
        <li>Acceso y seguridad: información de sesión y registros de autenticación, solicitudes y revisión. Los proveedores técnicos pueden procesar dirección IP y datos del navegador para prestar sus servicios y prevenir abusos.</li>
      </ul>
      <p>La información puede ser ingresada por el jugador o por personal autorizado al crear o actualizar su cuenta. Evitá enviar datos sensibles, documentos completos o información de terceros que no sean necesarios para la operación.</p>
    </Section>
    <Section title="2. Finalidades y datos necesarios">
      <p>Los datos se utilizan para administrar la cuenta, autenticar accesos, vincular solicitudes al jugador, verificar comprobantes, gestionar cargas y retiros, atender consultas y revisar errores o posibles abusos.</p>
      <p>El usuario, el teléfono y las credenciales son necesarios para el alta y el acceso previstos en este portal. Los comprobantes son necesarios para las solicitudes de carga y los datos bancarios para las de retiro. Sin esos datos puede no ser posible tramitar la operación. No son obligatorios mensajes o archivos adicionales ajenos a ese fin.</p>
      <p>Las finalidades opcionales, como comunicaciones promocionales no necesarias para el servicio, requieren su información y la autorización que corresponda. Consultar esta política o navegar no equivale por sí solo a prestar consentimiento para cualquier uso de datos.</p>
    </Section>
    <Section title="3. Acceso y proveedores">
      <p>El acceso operativo está previsto para el jugador y para personal autorizado según sus permisos. Supabase interviene en la autenticación, la base de datos y el almacenamiento de recursos. Cloudinary almacena los comprobantes nuevos; pueden existir comprobantes anteriores en Supabase Storage.</p>
      <p>Cloudflare Turnstile puede intervenir en la verificación de seguridad del acceso cuando esté habilitado. Si elegís contactar por WhatsApp, Telegram o Instagram, esos servicios también aplican sus propias condiciones y políticas. El operador debe identificar además a su proveedor de alojamiento y revisar sus condiciones antes de publicar esta política definitiva.</p>
      <p>La vinculación con una plataforma externa debe limitarse a lo necesario para gestionar la cuenta y sus operaciones. Antes de realizar cesiones adicionales deben identificarse sus destinatarios y cumplirse los requisitos aplicables. Los datos no deben venderse ni emplearse para finalidades incompatibles.</p>
    </Section>
    <Section title="4. Almacenamiento fuera de Argentina">
      <p>Los servicios en la nube pueden procesar información en otros países. El operador debe verificar las regiones y subencargados utilizados y establecer el mecanismo de transferencia válido antes de operar: nivel adecuado de protección o las garantías y excepciones admitidas, según corresponda. No se declara que todos los datos permanezcan en Argentina ni que esas garantías ya estén verificadas.</p>
      <p><a href="https://www.argentina.gob.ar/transferencias-internacionales" target="_blank" rel="noopener noreferrer">Información oficial de la AAIP sobre transferencias internacionales</a>.</p>
    </Section>
    <Section title="5. Seguridad y conservación">
      <p>El portal utiliza autenticación, controles de acceso y mecanismos de acceso restringido a comprobantes. Estas medidas deben acompañarse con gestión de permisos, formación del personal y atención de incidentes. No existe una garantía de seguridad absoluta; informá de inmediato cualquier acceso o divulgación que no reconozcas.</p>
      <p>Los datos deben conservarse solo durante el tiempo necesario para la relación de servicio, las operaciones pendientes y las obligaciones o reclamos que correspondan. Los plazos concretos por categoría, el tratamiento de copias de respaldo y el procedimiento de eliminación están pendientes de definición por el responsable antes de publicar la versión definitiva. Este texto no acredita que exista un borrado automático.</p>
    </Section>
    <Section title="6. Tus derechos">
      <p>Podés solicitar información, acceso, rectificación, actualización y, cuando corresponda, supresión o confidencialidad de tus datos, acreditando tu identidad de manera proporcionada. El acceso debe atenderse dentro de diez días corridos desde la intimación fehaciente; la rectificación, actualización o supresión, dentro de cinco días hábiles. La supresión puede tener límites por obligaciones legales o derechos legítimos de terceros.</p>
      <p>Dirigí tu solicitud al contacto de privacidad indicado arriba. No envíes tu contraseña ni claves bancarias. Si no obtenés una respuesta adecuada, podés acudir a la Agencia de Acceso a la Información Pública (AAIP), autoridad de control de la Ley 25.326.</p>
      <p><a href="https://www.argentina.gob.ar/aaip/datospersonales/derechos" target="_blank" rel="noopener noreferrer">Cómo ejercer tus derechos y presentar un reclamo ante la AAIP</a>. <a href="https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion" target="_blank" rel="noopener noreferrer">Texto de la Ley 25.326</a>.</p>
    </Section>
    <Section title="7. Sesión y menores de edad">
      <p>El navegador conserva información necesaria para mantener la sesión. Cerrar sesión finaliza el acceso previsto por el portal. Los servicios de seguridad y los enlaces externos pueden utilizar mecanismos propios; cualquier analítica o publicidad adicional debe informarse y evaluarse por separado.</p>
      <p>El servicio no está destinado a menores de 18 años. Si advertís una cuenta de una persona menor de edad, informalo para que se revise el acceso y el tratamiento de sus datos.</p>
    </Section>
  </>;
}

export function PlayerFooter() {
  const [document, setDocument] = useState<LegalDocument | null>(null);
  const modal = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = modal.current;
    if (!document || !element) return;
    element.showModal();
    const previousOverflow = window.document.body.style.overflow;
    window.document.body.style.overflow = 'hidden';
    return () => {
      if (element.open) element.close();
      window.document.body.style.overflow = previousOverflow;
    };
  }, [document]);
  const title = document === 'privacy' ? 'Política de privacidad' : 'Términos y condiciones';
  return <>
    <footer className="player-footer">
      <span className="secure-connection"><ShieldCheck size={16} /> Conexión segura · GANA777</span>
      <small className="adult-only-notice">Solo para mayores de 18 años (+18)</small>
      <nav className="player-legal-links" aria-label="Información legal">
        <button type="button" onClick={() => setDocument('terms')}>Términos y condiciones</button>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => setDocument('privacy')}>Política de privacidad</button>
      </nav>
    </footer>
    <dialog ref={modal} className="player-legal-dialog" aria-labelledby="player-legal-title" onCancel={event => { event.preventDefault(); setDocument(null); }} onClose={() => setDocument(null)}>
      {document && <>
        <header className="player-legal-header"><h2 id="player-legal-title">{title}</h2><button type="button" autoFocus onClick={() => setDocument(null)} aria-label="Cerrar información legal"><X size={22} /></button></header>
        <article className="player-legal-content">
          <p className="legal-version">Borrador para revisión · 19/10/2026</p>
          <p className="legal-draft-notice" role="note">Documento pendiente de completar y validar por el responsable. La identidad legal, el contacto, los plazos de conservación y las habilitaciones aplicables deben confirmarse antes de presentarlo como una versión definitiva.</p>
          {document === 'terms' ? <Terms /> : <Privacy />}
        </article>
      </>}
    </dialog>
  </>;
}
