import { useEffect, useRef } from "react";

const ACCENT_DARK = [90, 190, 190]; // hsl(187, 40%, 55%) — soft cyan for dark bg
const ACCENT_LIGHT = [20, 120, 130]; // hsl(187, 70%, 35%) — rich teal for light bg

// Gradient mesh settings
const BLOB_COUNT = 4;

// Dot grid settings
const DOT_GAP = 28;
const DOT_R = 1;
const RIPPLE_RADIUS = 150;
const DOT_BASE_ALPHA = 0.12;
const DOT_PEAK_ALPHA = 0.5;

interface AnimatedBgProps {
  /** 0–1 multiplier for all alpha values. Default 1. */
  intensity?: number;
}

type Blob = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

export function AnimatedBg({ intensity = 1 }: AnimatedBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobs = useRef<Blob[]>([]);
  const mouse = useRef({ x: -9999, y: -9999 });
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    function resize() {
      canvas!.width = window.innerWidth * devicePixelRatio;
      canvas!.height = window.innerHeight * devicePixelRatio;
      ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resize();
    window.addEventListener("resize", resize);

    function onMouseMove(e: MouseEvent) {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    }
    window.addEventListener("mousemove", onMouseMove);

    // Init blobs
    const w = window.innerWidth;
    const h = window.innerHeight;
    blobs.current = Array.from({ length: BLOB_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 150 + Math.random() * 200,
    }));

    function animate() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx!.clearRect(0, 0, w, h);

      const k = intensityRef.current;
      const isDark = document.documentElement.classList.contains("dark");
      const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;

      // ── Gradient mesh layer ──
      for (const b of blobs.current) {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < -b.r || b.x > w + b.r) {
          b.vx *= -1;
        }
        if (b.y < -b.r || b.y > h + b.r) {
          b.vy *= -1;
        }

        const grad = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        grad.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.08 * k})`);
        grad.addColorStop(1, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, 0)`);
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx!.fill();
      }

      // ── Dot grid layer with cursor ripple ──
      const mx = mouse.current.x;
      const my = mouse.current.y;

      for (let x = DOT_GAP / 2; x < w; x += DOT_GAP) {
        for (let y = DOT_GAP / 2; y < h; y += DOT_GAP) {
          let alpha = 0;
          let r = DOT_R;

          // Brighten from nearby blobs
          for (const b of blobs.current) {
            const bdx = x - b.x;
            const bdy = y - b.y;
            const bdist = Math.sqrt(bdx * bdx + bdy * bdy);
            if (bdist < b.r) {
              const t = 1 - bdist / b.r;
              alpha = Math.max(alpha, DOT_BASE_ALPHA + 0.2 * t * t);
              r = Math.max(r, DOT_R + t * 0.5);
            }
          }

          // Cursor ripple on top
          const dx = x - mx;
          const dy = y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < RIPPLE_RADIUS) {
            const t = 1 - dist / RIPPLE_RADIUS;
            alpha = Math.max(alpha, DOT_BASE_ALPHA + (DOT_PEAK_ALPHA - DOT_BASE_ALPHA) * t * t);
            r = Math.max(r, DOT_R + t * 0.8);
          }

          // Skip dots outside any influence
          if (alpha <= 0) {
            continue;
          }

          ctx!.fillStyle = `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${alpha * k})`;
          ctx!.beginPath();
          ctx!.arc(x, y, r, 0, Math.PI * 2);
          ctx!.fill();
        }
      }

      raf.current = requestAnimationFrame(animate);
    }

    animate();

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 w-screen h-screen pointer-events-none" />;
}
