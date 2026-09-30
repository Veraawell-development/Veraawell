import React, { useRef, useState, useEffect, useCallback } from 'react';

/**
 * Draw-to-sign pad.
 *
 * Built rather than pulled in: the whole job is pointer events on a canvas and
 * a trimmed PNG out, and a dependency for that would be more code to audit than
 * to write.
 *
 * Three details that are easy to get wrong and unpleasant afterwards:
 *
 *  - POINTER events, not mouse events. A doctor signing on a tablet or a
 *    touchscreen laptop is the case where a drawn signature actually looks
 *    like a signature; mouse-only handlers leave those users out entirely.
 *  - devicePixelRatio scaling. A canvas sized in CSS pixels on a retina screen
 *    renders at half resolution, and a signature is the one image where fuzzy
 *    edges read as a photocopy of a photocopy.
 *  - TRIMMED output with a transparent background. Exporting the whole canvas
 *    gives a wide white rectangle that sits on the PDF like a sticker; trimming
 *    to the ink lets it sit on the page like a signature.
 */

interface Props {
  /** An existing signature to show, as a PNG data URL. */
  value?: string | null;
  /** Called with a trimmed PNG data URL, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  disabled?: boolean;
  height?: number;
}

const STROKE = '#16262a';
const LINE_WIDTH = 2.2;

const SignaturePad: React.FC<Props> = ({ value, onChange, disabled = false, height = 180 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  // Distinct from "no signature": the doctor has asked to replace a saved one
  // and is about to draw. Without this, tapping "Draw a new one" would have to
  // null the stored value first, throwing away a good signature the moment
  // they changed their mind.
  const [editing, setEditing] = useState(false);

  /** Size the backing store to the element's real pixel size. */
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return null;

    // Only resize when it actually changed — resizing clears the canvas, and
    // doing it on every render would wipe a signature mid-stroke.
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = STROKE;
    ctx.lineWidth = LINE_WIDTH;
    return ctx;
  }, []);

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas]);

  const pointFrom = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const ctx = setupCanvas();
    if (!ctx) return;

    // Capture so a stroke that leaves the canvas still finishes cleanly
    // instead of leaving the pad stuck in a drawing state.
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointFrom(e);

    // A tap with no movement should still leave a mark.
    const { x, y } = lastPoint.current;
    ctx.beginPath();
    ctx.arc(x, y, LINE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fillStyle = STROKE;
    ctx.fill();
    hasInk.current = true;
    setIsEmpty(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !lastPoint.current) return;

    const point = pointFrom(e);
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint.current = point;
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    if (hasInk.current) onChange(exportTrimmed());
  };

  /**
   * The drawn ink as a PNG data URL, cropped to its bounding box.
   *
   * Scans the alpha channel for the used region, then re-draws just that into
   * a second canvas. Without this the export is mostly empty space, and the
   * PDF has no way to know which part of it is the signature.
   */
  const exportTrimmed = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const { width, height: h } = canvas;
    const { data } = ctx.getImageData(0, 0, width, h);

    let minX = width; let minY = h; let maxX = -1; let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] !== 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // nothing drawn

    const pad = Math.ceil(LINE_WIDTH * (window.devicePixelRatio || 1));
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(h - 1, maxY + pad);

    const out = document.createElement('canvas');
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    const outCtx = out.getContext('2d');
    if (!outCtx) return null;
    // No fill: the background stays transparent so it sits on the page rather
    // than in a white box.
    outCtx.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  };

  const clearCanvas = () => {
    const ctx = setupCanvas();
    const canvas = canvasRef.current;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasInk.current = false;
    setIsEmpty(true);
  };

  const showSaved = !!value && !editing;

  const handleSecondaryAction = () => {
    if (showSaved) {
      // Switch to the pad but keep the stored signature until they draw.
      setEditing(true);
      setIsEmpty(true);
      return;
    }
    clearCanvas();
    onChange(null);
    setEditing(false);
  };

  return (
    <div>
      <div
        style={{
          position: 'relative',
          border: '1px solid rgba(27,43,46,.14)',
          borderRadius: 12,
          background: '#fff',
          overflow: 'hidden'
        }}
      >
        {showSaved ? (
          // The stored signature, shown until they start a new one.
          <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <img
              src={value as string}
              alt="Your saved signature"
              style={{ maxHeight: height - 32, maxWidth: '100%', objectFit: 'contain' }}
            />
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              onPointerLeave={endStroke}
              style={{
                display: 'block',
                width: '100%',
                height,
                // Stops the browser scrolling the page instead of drawing.
                touchAction: 'none',
                cursor: disabled ? 'not-allowed' : 'crosshair'
              }}
            />
            {isEmpty && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  color: '#b9c0bd',
                  fontSize: 13.5
                }}
              >
                Sign here
              </div>
            )}
            {/* Signing rule, drawn under the ink. */}
            <div
              style={{
                position: 'absolute',
                left: 24,
                right: 24,
                bottom: 34,
                borderBottom: '1px solid rgba(27,43,46,.12)',
                pointerEvents: 'none'
              }}
            />
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <span style={{ fontSize: 12, color: '#8a938f' }}>
          {showSaved ? 'Saved signature' : 'Draw with your mouse, trackpad or finger'}
        </span>
        <button
          type="button"
          onClick={handleSecondaryAction}
          disabled={disabled || (isEmpty && !value && !editing)}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: '#1f7a8c',
            background: 'transparent',
            border: 'none',
            cursor: disabled || (isEmpty && !value && !editing) ? 'default' : 'pointer',
            opacity: disabled || (isEmpty && !value && !editing) ? 0.4 : 1,
            padding: 0
          }}
        >
          {showSaved ? 'Draw a new one' : 'Clear'}
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;
