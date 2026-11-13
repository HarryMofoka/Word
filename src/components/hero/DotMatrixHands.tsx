import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const HANDS_SHEET_URL =
  'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261030_025250_100df7b8-31fd-4614-aa4a-c1b7d5b6b273.png&w=1600&q=85';

const QUANT_LEVELS = [0.24, 0.44, 0.64, 0.84, 1.0];

function hash2D(c: number, r: number): number {
  const n = Math.sin(c * 127.1 + r * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function quantizeLuminance(val: number): number {
  if (val < 0.12) return 0;
  const idx = Math.min(QUANT_LEVELS.length - 1, Math.floor(val * QUANT_LEVELS.length));
  return QUANT_LEVELS[idx];
}

export const DotMatrixHands: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let isDisposed = false;
    let imageLoaded = false;
    let imageFailed = false;

    // Reusable pre-downscaled tile canvases: LA, RA, LB, RB
    const tileCanvases = [0, 1, 2, 3].map(() => document.createElement('canvas'));
    const fieldA = document.createElement('canvas');
    const fieldB = document.createElement('canvas');
    const ctxA = fieldA.getContext('2d', { willReadFrequently: true });
    const ctxB = fieldB.getContext('2d', { willReadFrequently: true });

    let viewW = canvas.parentElement?.clientWidth || window.innerWidth;
    let viewH = canvas.parentElement?.clientHeight || 760;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    let pointerX = 0;
    let pointerY = 0;
    let smoothPX = 0;
    let smoothPY = 0;

    const resize = () => {
      if (!canvas) return;
      viewW = canvas.parentElement?.clientWidth || window.innerWidth;
      viewH = canvas.parentElement?.clientHeight || 760;
      const maxDpr = viewW <= 760 ? 1.5 : 2;
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      canvas.width = Math.max(1, Math.round(viewW * dpr));
      canvas.height = Math.max(1, Math.round(viewH * dpr));
      canvas.style.width = `${viewW}px`;
      canvas.style.height = `${viewH}px`;
    };

    resize();

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (isDisposed) return;
      const tw = Math.floor(img.naturalWidth / 2);
      const th = Math.floor(img.naturalHeight / 2);
      const downW = Math.min(480, tw);
      const downH = Math.round((th / Math.max(1, tw)) * downW);

      const rects = [
        [0, 0, tw, th], // LA
        [tw, 0, tw, th], // RA
        [0, th, tw, th], // LB
        [tw, th, tw, th], // RB
      ];

      rects.forEach(([sx, sy, sw, sh], idx) => {
        const tc = tileCanvases[idx];
        tc.width = downW;
        tc.height = downH;
        const tctx = tc.getContext('2d');
        if (tctx) {
          tctx.clearRect(0, 0, downW, downH);
          tctx.drawImage(img, sx, sy, sw, sh, 0, 0, downW, downH);
        }
      });

      imageLoaded = true;
      if (reducedMotion) {
        renderFrame(performance.now());
      }
    };

    img.onerror = () => {
      if (isDisposed) return;
      imageFailed = true;
      if (reducedMotion) {
        renderFrame(performance.now());
      }
    };

    img.src = HANDS_SHEET_URL;

    const onPointerMove = (e: PointerEvent) => {
      pointerX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      pointerY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const drawFieldPose = (
      fCtx: CanvasRenderingContext2D,
      cols: number,
      rows: number,
      leftTile: HTMLCanvasElement,
      rightTile: HTMLCanvasElement,
      timeSec: number,
      isMobile: boolean
    ) => {
      fCtx.fillStyle = '#ffffff';
      fCtx.fillRect(0, 0, cols, rows);

      const reach = Math.sin(timeSec * 0.72) * 0.022;
      const breathe = 1 + Math.sin(timeSec * 0.55) * 0.025;
      const roll = Math.sin(timeSec * 0.45) * 0.028;

      const handW = isMobile ? cols * 0.62 * breathe : cols * 0.42 * breathe;
      const aspect = leftTile.height / Math.max(1, leftTile.width);
      const handH = handW * aspect;
      const centerY = isMobile ? rows * 0.75 : rows * 0.54;

      // Left hand (counter-phase)
      fCtx.save();
      fCtx.translate(cols * (isMobile ? 0.14 : 0.19) + reach * cols + smoothPX * 1.4, centerY + smoothPY);
      fCtx.rotate(roll);
      fCtx.drawImage(leftTile, -handW * 0.45, -handH * 0.5, handW, handH);
      fCtx.restore();

      // Right hand (counter-phase)
      fCtx.save();
      fCtx.translate(cols * (isMobile ? 0.86 : 0.81) - reach * cols + smoothPX * 1.4, centerY - smoothPY * 0.7);
      fCtx.rotate(-roll);
      fCtx.drawImage(rightTile, -handW * 0.55, -handH * 0.5, handW, handH);
      fCtx.restore();
    };

    const drawFallbackHands = (fCtx: CanvasRenderingContext2D, cols: number, rows: number, isMobile: boolean) => {
      fCtx.fillStyle = '#ffffff';
      fCtx.fillRect(0, 0, cols, rows);
      const cy = isMobile ? rows * 0.68 : rows * 0.54;

      const gradL = fCtx.createRadialGradient(cols * 0.16, cy, 2, cols * 0.16, cy, cols * 0.25);
      gradL.addColorStop(0, '#111111');
      gradL.addColorStop(1, '#ffffff');
      fCtx.fillStyle = gradL;
      fCtx.fillRect(0, 0, cols * 0.45, rows);

      const gradR = fCtx.createRadialGradient(cols * 0.84, cy, 2, cols * 0.84, cy, cols * 0.25);
      gradR.addColorStop(0, '#111111');
      gradR.addColorStop(1, '#ffffff');
      fCtx.fillStyle = gradR;
      fCtx.fillRect(cols * 0.55, 0, cols * 0.45, rows);
    };

    const renderFrame = (nowMs: number) => {
      const timeSec = reducedMotion ? 0 : nowMs * 0.001;
      const isMobile = viewW <= 760;

      smoothPX += (pointerX * 4 - smoothPX) * 0.06;
      smoothPY += (pointerY * 2.5 - smoothPY) * 0.06;

      const step = Math.max(5, viewW / 205);
      const rowStep = step * 2.05;
      const baseR = step * 0.46;

      const cols = Math.max(16, Math.floor(viewW / step));
      const rows = Math.max(12, Math.floor(viewH / rowStep));

      if (fieldA.width !== cols || fieldA.height !== rows) {
        fieldA.width = cols;
        fieldA.height = rows;
        fieldB.width = cols;
        fieldB.height = rows;
      }

      if (ctxA && ctxB) {
        if (imageLoaded) {
          drawFieldPose(ctxA, cols, rows, tileCanvases[0], tileCanvases[1], timeSec, isMobile);
          drawFieldPose(ctxB, cols, rows, tileCanvases[2], tileCanvases[3], timeSec, isMobile);
        } else if (imageFailed) {
          drawFallbackHands(ctxA, cols, rows, isMobile);
          drawFallbackHands(ctxB, cols, rows, isMobile);
        } else {
          // Still loading: keep canvas clean
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, viewW, viewH);
          return;
        }
      }

      const dataA = ctxA?.getImageData(0, 0, cols, rows).data;
      const dataB = ctxB?.getImageData(0, 0, cols, rows).data;
      if (!dataA || !dataB) return;

      // Pose cycle: hold A -> glitch dissolve to B -> hold B -> glitch dissolve back to A
      const cycle = (timeSec * 0.14) % 1;
      let morph = 0;
      if (cycle > 0.35 && cycle <= 0.5) {
        morph = (cycle - 0.35) / 0.15;
      } else if (cycle > 0.5 && cycle <= 0.85) {
        morph = 1;
      } else if (cycle > 0.85) {
        morph = 1 - (cycle - 0.85) / 0.15;
      }

      // Occasional scanline horizontal jump
      const glitchTick = Math.floor(timeSec * 12);
      const glitchRowA = hash2D(glitchTick, 3) > 0.82 ? Math.floor(hash2D(glitchTick, 7) * rows) : -1;
      const glitchRowB = hash2D(glitchTick, 11) > 0.86 ? Math.floor(hash2D(glitchTick, 19) * rows) : -1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewW, viewH);
      ctx.fillStyle = '#0d0d0d';

      // Safe zone around central headline & CTA so no dots cross text or CTA
      const safeCx = viewW * 0.5;
      const safeCy = isMobile ? viewH * 0.34 : viewH * 0.46;
      const safeRx = isMobile ? viewW * 0.46 : Math.min(360, viewW * 0.32);
      const safeRy = isMobile ? viewH * 0.25 : viewH * 0.28;

      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        const y = (r + 0.5) * rowStep;
        let rowOffsetX = 0;
        if (!reducedMotion && (r === glitchRowA || r === glitchRowB)) {
          rowOffsetX = (hash2D(r, glitchTick) - 0.5) * step * 2.6;
        }

        for (let c = 0; c < cols; c++) {
          const x = (c + 0.5) * step + rowOffsetX;

          // Clear central text/CTA safe zone + dissolve fingertips before headline
          const dx = (x - safeCx) / safeRx;
          const dy = (y - safeCy) / safeRy;
          const safeDist = Math.hypot(dx, dy);
          if (safeDist < 1.0) continue;

          const idx = (r * cols + c) * 4;
          const lumA = 1 - (dataA[idx] * 0.299 + dataA[idx + 1] * 0.587 + dataA[idx + 2] * 0.114) / 255;
          const lumB = 1 - (dataB[idx] * 0.299 + dataB[idx + 1] * 0.587 + dataB[idx + 2] * 0.114) / 255;

          // Controlled irregular dot-by-dot glitch dissolve
          const noise = hash2D(c * 0.7, r * 1.3);
          const inTransition = morph > 0 && morph < 1;
          const useB = noise < morph;
          let lum = useB ? lumB : lumA;

          if (inTransition && Math.abs(noise - morph) < 0.08) {
            // Subtle LED flicker along the dissolve front
            const flicker = Math.sin(timeSec * 36 + c + r) * 0.22;
            lum = Math.max(0, Math.min(1, lum + flicker));
          }

          // Smooth fingertip fade near safe zone boundary
          const edgeFade = safeDist < 1.28 ? (safeDist - 1.0) / 0.28 : 1;
          lum *= edgeFade;

          const q = quantizeLuminance(lum);
          if (q <= 0) continue;

          // Subtle shimmer
          const shimmer = reducedMotion ? 1 : 0.94 + 0.06 * Math.sin(timeSec * 3.1 + c * 0.4 + r * 0.7);
          const radius = baseR * q * shimmer;

          ctx.moveTo(x + radius, y);
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    };

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      if (document.hidden) return;
      renderFrame(now);
    };

    if (!reducedMotion) {
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      isDisposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [reducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        pointerEvents: 'none',
      }}
    />
  );
};

