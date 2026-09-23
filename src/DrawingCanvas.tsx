import { useEffect, useImperativeHandle, useRef, useState, type PointerEvent, type Ref } from 'react';
import { Eraser, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react';

type Point = { x: number; y: number };
type Stroke = { points: Point[]; color: string; size: number };
const colors = [['Black', '#243746'], ['White', '#ffffff'], ['Red', '#e65050'], ['Orange', '#f39439'], ['Yellow', '#f4cf45'], ['Green', '#4baf73'], ['Blue', '#4386db'], ['Purple', '#9963ce']];

export type DrawingCanvasHandle = { snapshot: () => string };

export function DrawingCanvas({ locked, ref }: { locked: boolean; ref?: Ref<DrawingCanvasHandle> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const undone = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const pointer = useRef<number | null>(null);
  const [color, setColor] = useState('#243746');
  const [size, setSize] = useState(8);
  const [eraser, setEraser] = useState(false);
  const [canvasScale, setCanvasScale] = useState(1);
  const eraserDiameter = Math.max(1, size * 3 * canvasScale);
  const cursorSize = Math.ceil(eraserDiameter / 2 + 2) * 2;
  const cursorCenter = cursorSize / 2;
  const eraserCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="${cursorSize}" height="${cursorSize}" viewBox="0 0 ${cursorSize} ${cursorSize}"><circle cx="${cursorCenter}" cy="${cursorCenter}" r="${eraserDiameter / 2}" fill="none" stroke="white" stroke-width="3"/><circle cx="${cursorCenter}" cy="${cursorCenter}" r="${eraserDiameter / 2}" fill="none" stroke="#243746" stroke-width="1"/></svg>`;
  const cursor = locked ? 'default' : eraser ? `url("data:image/svg+xml,${encodeURIComponent(eraserCursor)}") ${cursorCenter} ${cursorCenter}, crosshair` : 'crosshair';
  const [history, setHistory] = useState({ undo: 0, redo: 0 });
  const clearDialog = useRef<HTMLDialogElement>(null);

  useImperativeHandle(ref, () => ({ snapshot: () => canvas.current?.toDataURL('image/png') ?? '' }));

  function paint() {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 800, 500);
    for (const stroke of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      const first = stroke.points[0];
      if (!first) continue;
      context.fillStyle = stroke.color;
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.size;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.arc(first.x, first.y, stroke.size / 2, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.moveTo(first.x, first.y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
  }
  function syncHistory() { setHistory({ undo: strokes.current.length, redo: undone.current.length }); }
  function finish() {
    if (current.current) { strokes.current.push(current.current); current.current = null; syncHistory(); }
    pointer.current = null;
  }
  useEffect(() => { paint(); }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setCanvasScale(element.getBoundingClientRect().width / 800));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (locked) {
      if (current.current) { strokes.current.push(current.current); current.current = null; }
      pointer.current = null;
      clearDialog.current?.close();
    }
  }, [locked]);

  function point(event: PointerEvent<HTMLCanvasElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * 800 / bounds.width, y: (event.clientY - bounds.top) * 500 / bounds.height };
  }
  function down(event: PointerEvent<HTMLCanvasElement>) {
    if (locked || pointer.current !== null || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    undone.current = [];
    current.current = { points: [point(event)], color: eraser ? '#ffffff' : color, size: eraser ? size * 3 : size };
    paint();
    syncHistory();
  }
  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (locked || pointer.current !== event.pointerId || !current.current) return;
    current.current.points.push(point(event));
    paint();
  }
  function changeHistory(redo: boolean) {
    if (locked) return;
    finish();
    const stroke = (redo ? undone : strokes).current.pop();
    if (stroke) (redo ? strokes : undone).current.push(stroke);
    syncHistory();
    paint();
  }

  return <>
    <div className="drawing-paper"><canvas ref={canvas} width={800} height={500} style={{ cursor }} aria-label="Drawing canvas. Use a mouse, touch, or pen to draw." onPointerDown={down} onPointerMove={move} onPointerUp={event => { if (pointer.current === event.pointerId) { move(event); finish(); } }} onPointerCancel={event => { if (pointer.current === event.pointerId) finish(); }} onLostPointerCapture={event => { if (pointer.current === event.pointerId) finish(); }}/></div>
    <fieldset className="drawing-tools" disabled={locked} aria-label="Drawing tools">
      <div className="drawing-tool-group"><button type="button" title="Brush" aria-label="Brush" aria-pressed={!eraser} onClick={() => setEraser(false)}><Pencil size={19}/></button><button type="button" title="Eraser" aria-label="Eraser" aria-pressed={eraser} onClick={() => setEraser(true)}><Eraser size={19}/></button></div>
      <div className="drawing-tool-group drawing-colors" role="group" aria-label="Brush color">{colors.map(([label, value]) => <button key={value} type="button" title={label} aria-label={label} aria-pressed={color === value && !eraser} onClick={() => { setColor(value!); setEraser(false); }}><span style={{ background: value }}>{color === value && !eraser ? <span style={{ color: value === '#243746' || value === '#9963ce' ? '#fff' : '#243746' }}>✓</span> : null}</span></button>)}</div>
      <div className="drawing-tool-group" role="group" aria-label="Brush size">{[4, 8, 16].map((value, index) => <button key={value} type="button" aria-label={`${['Small', 'Medium', 'Large'][index]} brush`} aria-pressed={size === value} onClick={() => setSize(value)}><span className="drawing-size-dot" style={{ width: value + 2, height: value + 2 }}/></button>)}</div>
      <div className="drawing-tool-group"><button type="button" aria-label="Undo" title="Undo" disabled={!history.undo} onClick={() => changeHistory(false)}><Undo2 size={19}/></button><button type="button" aria-label="Redo" title="Redo" disabled={!history.redo} onClick={() => changeHistory(true)}><Redo2 size={19}/></button><button type="button" aria-label="Clear canvas" title="Clear canvas" disabled={!history.undo} onClick={() => clearDialog.current?.showModal()}><Trash2 size={19}/></button></div>
    </fieldset>
    <dialog ref={clearDialog} className="waiting-player-dialog drawing-clear" aria-labelledby="clear-title"><h2 id="clear-title">Start fresh?</h2><p>This clears your whole drawing and undo history.</p><div><button className="room-secondary" onClick={() => clearDialog.current?.close()}>Keep drawing</button><button className="room-primary" onClick={() => { if (!locked) { strokes.current = []; undone.current = []; current.current = null; syncHistory(); paint(); } clearDialog.current?.close(); }}>Clear canvas</button></div></dialog>
  </>;
}
