import React, { useState, useRef, useEffect, useCallback } from 'react';

interface AvatarCropperProps {
  imageUrl: string;
  onCrop: (dataUrl: string) => void;
  onCancel: () => void;
}

export const AvatarCropper: React.FC<AvatarCropperProps> = ({ imageUrl, onCrop, onCancel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const CANVAS_SIZE = 280;
  const CIRCLE_R = 120;

  // Load image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      // Fit image so shortest side fills the circle
      const minDim = Math.min(img.width, img.height);
      const initialScale = (CIRCLE_R * 2) / minDim;
      setScale(initialScale);
      setImgSize({ w: img.width, h: img.height });
      setOffset({ x: 0, y: 0 });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    const cx = CANVAS_SIZE / 2;
    const cy = CANVAS_SIZE / 2;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Draw image centered + offset + scaled
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = cx - dw / 2 + offset.x;
    const dy = cy - dh / 2 + offset.y;
    ctx.drawImage(img, dx, dy, dw, dh);

    // Dark overlay outside circle
    ctx.save();
    ctx.fillStyle = 'rgba(26, 23, 20, 0.7)';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(cx, cy, CIRCLE_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [scale, offset, imgSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Pointer drag
  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handlePointerUp = () => setDragging(false);

  // Pinch zoom via wheel / gesture
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.02 : 0.02;
    setScale(s => Math.max(0.1, Math.min(5, s + delta)));
  };

  // Touch pinch
  const lastDist = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const diff = dist - lastDist.current;
      setScale(s => Math.max(0.1, Math.min(5, s + diff * 0.005)));
      lastDist.current = dist;
    }
  };

  // Export cropped circle
  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const out = document.createElement('canvas');
    const size = 256;
    out.width = size;
    out.height = size;
    const ctx = out.getContext('2d')!;

    // Clip to circle
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();

    // Scale factor from preview to output
    const sf = size / (CIRCLE_R * 2);
    const dw = img.width * scale * sf;
    const dh = img.height * scale * sf;
    const dx = size / 2 - dw / 2 + offset.x * sf;
    const dy = size / 2 - dh / 2 + offset.y * sf;
    ctx.drawImage(img, dx, dy, dw, dh);

    onCrop(out.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="crop-overlay" onClick={onCancel}>
      <div className="crop-modal" onClick={e => e.stopPropagation()}>
        <div className="crop-title">Ajustar foto</div>
        <div className="crop-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="crop-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            style={{ touchAction: 'none' }}
          />
        </div>
        <input
          type="range"
          className="crop-slider"
          min="0.1"
          max="3"
          step="0.01"
          value={scale}
          onChange={e => setScale(parseFloat(e.target.value))}
        />
        <div className="crop-actions">
          <button className="crop-btn crop-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button className="crop-btn crop-btn-confirm" onClick={handleConfirm}>Guardar</button>
        </div>
      </div>
    </div>
  );
};
