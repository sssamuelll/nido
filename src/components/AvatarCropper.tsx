import React, { useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface AvatarCropperProps {
  imageUrl: string;
  onCrop: (dataUrl: string) => void;
  onCancel: () => void;
}

export const AvatarCropper: React.FC<AvatarCropperProps> = ({ imageUrl, onCrop, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const scaleRef = useRef(1);
  const minScaleRef = useRef(0.1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const sliderRef = useRef<HTMLInputElement>(null);

  // Gesture tracking
  const gestureRef = useRef<{
    active: boolean;
    pointers: Map<number, { x: number; y: number }>;
    startDist: number;
    startScale: number;
    startMid: { x: number; y: number };
    startOffset: { x: number; y: number };
    lastSinglePos: { x: number; y: number };
  }>({
    active: false,
    pointers: new Map(),
    startDist: 0,
    startScale: 1,
    startMid: { x: 0, y: 0 },
    startOffset: { x: 0, y: 0 },
    lastSinglePos: { x: 0, y: 0 },
  });

  const CANVAS_SIZE = 280;
  const CIRCLE_R = 120;
  const rafRef = useRef(0);

  // Clamp scale so image always fills the circle, and offset so it can't escape
  const clamp = (s: number, ox: number, oy: number) => {
    const img = imgRef.current;
    if (!img) return { s, ox, oy };
    s = Math.max(minScaleRef.current, Math.min(5, s));
    const halfW = (img.width * s) / 2;
    const halfH = (img.height * s) / 2;
    const maxOx = Math.max(0, halfW - CIRCLE_R);
    const maxOy = Math.max(0, halfH - CIRCLE_R);
    ox = Math.max(-maxOx, Math.min(maxOx, ox));
    oy = Math.max(-maxOy, Math.min(maxOy, oy));
    return { s, ox, oy };
  };

  // Lock body scroll
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;
    const scale = scaleRef.current;
    const offset = offsetRef.current;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = cx - dw / 2 + offset.x;
    const dy = cy - dh / 2 + offset.y;
    ctx.drawImage(img, dx, dy, dw, dh);

    // Dark overlay outside circle
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fill();
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }, []);

  const requestDraw = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const minDim = Math.min(img.width, img.height);
      const initScale = (CIRCLE_R * 2) / minDim;
      minScaleRef.current = initScale;
      scaleRef.current = initScale;
      offsetRef.current = { x: 0, y: 0 };
      if (sliderRef.current) {
        sliderRef.current.min = String(initScale);
        sliderRef.current.value = String(initScale);
      }
      requestDraw();
    };
    img.src = imageUrl;
  }, [imageUrl, requestDraw]);

  // --- Gesture handlers (all via native events for better mobile perf) ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const g = gestureRef.current;

    const getMid = () => {
      const pts = Array.from(g.pointers.values());
      if (pts.length < 2) return pts[0] || { x: 0, y: 0 };
      return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    };

    const getDist = () => {
      const pts = Array.from(g.pointers.values());
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (g.pointers.size === 1) {
        g.lastSinglePos = { x: e.clientX, y: e.clientY };
      }
      if (g.pointers.size === 2) {
        g.startDist = getDist();
        g.startScale = scaleRef.current;
        g.startMid = getMid();
        g.startOffset = { ...offsetRef.current };
      }
      g.active = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!g.active) return;
      g.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (g.pointers.size === 1) {
        const dx = e.clientX - g.lastSinglePos.x;
        const dy = e.clientY - g.lastSinglePos.y;
        const c = clamp(scaleRef.current, offsetRef.current.x + dx, offsetRef.current.y + dy);
        offsetRef.current = { x: c.ox, y: c.oy };
        g.lastSinglePos = { x: e.clientX, y: e.clientY };
      } else if (g.pointers.size === 2) {
        const dist = getDist();
        const mid = getMid();
        const ratio = dist / g.startDist;
        const panX = mid.x - g.startMid.x;
        const panY = mid.y - g.startMid.y;
        const c = clamp(g.startScale * ratio, g.startOffset.x + panX, g.startOffset.y + panY);
        scaleRef.current = c.s;
        offsetRef.current = { x: c.ox, y: c.oy };
        if (sliderRef.current) sliderRef.current.value = String(c.s);
      }
      requestDraw();
    };

    const onPointerUp = (e: PointerEvent) => {
      g.pointers.delete(e.pointerId);
      if (g.pointers.size === 0) {
        g.active = false;
      } else if (g.pointers.size === 1) {
        // Transition from pinch to single-finger pan
        const remaining = Array.from(g.pointers.values())[0];
        g.lastSinglePos = { x: remaining.x, y: remaining.y };
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      const c = clamp(scaleRef.current * delta, offsetRef.current.x, offsetRef.current.y);
      scaleRef.current = c.s;
      offsetRef.current = { x: c.ox, y: c.oy };
      if (sliderRef.current) sliderRef.current.value = String(c.s);
      requestDraw();
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Prevent default touch behaviors on canvas
    const preventTouch = (e: TouchEvent) => e.preventDefault();
    canvas.addEventListener('touchstart', preventTouch, { passive: false });
    canvas.addEventListener('touchmove', preventTouch, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('touchstart', preventTouch);
      canvas.removeEventListener('touchmove', preventTouch);
    };
  }, [requestDraw]);

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const c = clamp(parseFloat(e.target.value), offsetRef.current.x, offsetRef.current.y);
    scaleRef.current = c.s;
    offsetRef.current = { x: c.ox, y: c.oy };
    requestDraw();
  };

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    const size = 256;
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d')!;

    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    const sf = size / (CIRCLE_R * 2);
    const scale = scaleRef.current;
    const offset = offsetRef.current;
    const dw = img.width * scale * sf;
    const dh = img.height * scale * sf;
    const dx = size / 2 - dw / 2 + offset.x * sf;
    const dy = size / 2 - dh / 2 + offset.y * sf;
    ctx.drawImage(img, dx, dy, dw, dh);

    onCrop(out.toDataURL('image/jpeg', 0.85));
  };

  return createPortal(
    <div className="crop-overlay" onClick={onCancel}>
      <div className="crop-modal" onClick={e => e.stopPropagation()}>
        <div className="crop-title">Ajustar foto</div>
        <div className="crop-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="crop-canvas"
            style={{ touchAction: 'none' }}
          />
        </div>
        <input
          ref={sliderRef}
          type="range"
          className="crop-slider"
          min="0.01"
          max="4"
          step="0.01"
          defaultValue="1"
          onChange={handleSlider}
        />
        <div className="crop-actions">
          <button className="crop-btn crop-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button className="crop-btn crop-btn-confirm" onClick={handleConfirm}>Guardar</button>
        </div>
      </div>
    </div>,
    document.body
  );
};
