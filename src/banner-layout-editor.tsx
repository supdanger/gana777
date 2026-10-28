import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { homeBannerLayoutStyles, type HomeBannerLayout } from './home-banner';

const sliders: { key: keyof HomeBannerLayout; label: string; min: number; max: number; unit: string }[] = [
  { key: 'height', label: 'Alto del banner', min: 10, max: 80, unit: '% del ancho' },
  { key: 'width', label: 'Ancho de imagen', min: 50, max: 300, unit: '%' },
  { key: 'imageHeight', label: 'Alto de imagen', min: 50, max: 300, unit: '%' },
  { key: 'x', label: 'Mover a los lados', min: -100, max: 100, unit: '%' },
  { key: 'y', label: 'Mover arriba o abajo', min: -100, max: 100, unit: '%' },
  { key: 'radius', label: 'Redondeo de esquinas', min: 0, max: 40, unit: 'px' },
];

export function BannerLayoutEditor({ label, layout, previewLayout, defaults, heightRange, heightScale = 1, hideHeight = false, disabled, saved, onChange, onSave, children }: {
  label: string; layout: HomeBannerLayout; previewLayout?: HomeBannerLayout; defaults: HomeBannerLayout; heightRange: readonly [number, number]; heightScale?: number;
  hideHeight?: boolean;
  disabled: boolean; saved: boolean; onChange: (layout: HomeBannerLayout) => void; onSave: () => void; children: ReactNode;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: layout.x, y: layout.y, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    onChange({ ...layout, x: Math.max(-100, Math.min(100, Math.round((start.x + (event.clientX - start.startX) / start.width * 100) * 10) / 10)), y: Math.max(-100, Math.min(100, Math.round((start.y + (event.clientY - start.startY) / start.height * 100) * 10) / 10)) });
  }
  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  }

  return <div className="portal-layout-editor">
    <div className={`portal-banner-preview portal-layout-preview${dragging ? ' is-dragging' : ''}`} style={homeBannerLayoutStyles(previewLayout ?? layout) as CSSProperties} aria-label={`Vista previa ajustable de ${label}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag}>{children}</div>
    <p>Arrastrá la imagen para moverla. Los controles ajustan el tamaño y la posición.</p>
    <div className="portal-layout-sliders">{sliders.filter(({ key }) => !hideHeight || key !== 'height').map(({ key, label: sliderLabel, min, max, unit }) => { const value = key === 'height' ? layout.height * heightScale : layout[key]; return <label key={key}><span>{sliderLabel}<output>{value} {unit}</output></span><input type="range" min={key === 'height' ? heightRange[0] : min} max={key === 'height' ? heightRange[1] : max} step={key === 'height' && heightScale !== 1 ? '0.2' : '1'} value={value} disabled={disabled} onChange={event => onChange({ ...layout, [key]: key === 'height' ? Number(event.target.value) / heightScale : Number(event.target.value) })} /></label>; })}</div>
    <div className="portal-banner-actions"><button type="button" disabled={disabled} onClick={onSave}>Guardar encuadre</button><button type="button" disabled={disabled} onClick={() => onChange({ ...defaults })}>Restablecer ajustes</button></div>
    {saved && <small role="status">Encuadre de {label} guardado.</small>}
  </div>;
}
