import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';

interface Particle {
  x: number;                 // current x, canvas pixels
  y: number;                 // current y, canvas pixels
  size: number;              // circle radius, pixels
  opacityMin: number;        // floor opacity when fully faded out (0 = invisible)
  opacityMax: number;        // peak opacity when fully faded in
  fadePhase: number;         // starting phase of the fade cycle
  fadeFreq: number;          // fade cycle frequency (rad/s)
  activationThreshold: number; // 0–1: particle only becomes visible once global density exceeds this
  phase: number;             // per-particle turbulence phase offset
  turbFreq: number;          // turbulence frequency (rad/s)
  turbAmpX: number;          // turbulence x amplitude (px/s)
  turbAmpY: number;          // turbulence y amplitude (px/s)
  colorPhase: number;        // per-particle hue drift phase offset (rad)
  colorFreq: number;         // per-particle hue drift frequency (rad/s) — very slow
}

@Component({
  selector: 'app-dust',
  templateUrl: './dust.html',
  styleUrl: './dust.scss',
})
export class DustComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animHandle: number | null = null;
  private onBattery = false;
  private startTime = 0;
  private lastFrameTime = 0;
  private lastT = 0;
  // Random phase offset so density doesn't start at the same point every reload
  private readonly densityPhase = Math.random() * Math.PI * 2;

  // Full pool — all 231 always exist; how many are visible depends on global density
  private static readonly PARTICLE_COUNT = 231;
  private static readonly TARGET_FPS = 24;
  private static readonly FRAME_INTERVAL_MS = 1000 / DustComponent.TARGET_FPS;
  // Amplify the wallpaper pan derivative so dust drifts visibly but gently
  private static readonly WIND_SCALE = 4.5;

  private readonly onResize = () => { this.resize(); this.spawnParticles(); };
  private readonly onVisibility = () => document.hidden ? this.stopAnim() : this.startAnim();

  ngAfterViewInit(): void {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.startTime = performance.now();

    window.addEventListener('resize', this.onResize);
    this.resize();
    this.spawnParticles();

    document.addEventListener('visibilitychange', this.onVisibility);

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.onBattery = !battery.charging;
        this.onBattery ? this.stopAnim() : this.startAnim();
        battery.addEventListener('chargingchange', () => {
          this.onBattery = !battery.charging;
          this.onBattery ? this.stopAnim() : this.startAnim();
        });
      });
    }

    this.startAnim();
  }

  ngOnDestroy(): void {
    this.stopAnim();
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  private resize(): void {
    const c = this.canvasRef.nativeElement;
    c.width  = window.innerWidth;
    c.height = window.innerHeight;
  }

  private spawnParticles(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    this.particles = Array.from({ length: DustComponent.PARTICLE_COUNT }, () => ({
      x:                   Math.random() * W,
      y:                   Math.random() * H,
      size:                0.6 + Math.random() * 1.6,
      opacityMin:          0,
      opacityMax:          0.15 + Math.random() * 0.30,
      fadePhase:           Math.random() * Math.PI * 2,
      fadeFreq:            0.10 + Math.random() * 0.30,
      // Spread evenly 0–1 so particles activate one-by-one as density rises
      activationThreshold: Math.random(),
      phase:               Math.random() * Math.PI * 2,
      turbFreq:            0.15 + Math.random() * 0.25,
      turbAmpX:            8  + Math.random() * 14,
      turbAmpY:            5  + Math.random() * 8,
      colorPhase:          Math.random() * Math.PI * 2,
      // Very slow: full cycle takes ~1.7–3.5 min, so hue shifts are imperceptible second-to-second
      colorFreq:           0.030 + Math.random() * 0.060,
    }));
  }

  private readonly render = (timestamp: DOMHighResTimeStamp): void => {
    this.animHandle = requestAnimationFrame(this.render);
    if (timestamp - this.lastFrameTime < DustComponent.FRAME_INTERVAL_MS) return;
    this.lastFrameTime = timestamp;

    const t  = (timestamp - this.startTime) / 1000;
    const dt = Math.min(t - this.lastT, 0.1); // cap to avoid jumps after tab hide
    this.lastT = t;

    const c = this.canvasRef.nativeElement;
    const W = c.width;
    const H = c.height;

    // Instantaneous velocity of the wallpaper pan — d/dt of:
    //   panX = sin(t*0.031)*0.18 + cos(t*0.019)*0.09
    //   panY = cos(t*0.027)*0.14 + sin(t*0.023)*0.07
    // Both in normalised UV units/s; multiply by viewport to get px/s.
    const windNX =  Math.cos(t * 0.031) * (0.031 * 0.18)
                  - Math.sin(t * 0.019) * (0.019 * 0.09);
    const windNY = -Math.sin(t * 0.027) * (0.027 * 0.14)
                  + Math.cos(t * 0.023) * (0.023 * 0.07);

    const windX = windNX * W * DustComponent.WIND_SCALE;
    const windY = windNY * H * DustComponent.WIND_SCALE;

    // Global density — two overlapping slow sines for organic variation.
    // Amplitudes sum to 0.54, so density reaches ~0 and ~1 over time:
    //   ~0   → almost no particles visible
    //   ~0.5 → ~105 particles (≈ original 70 is around density 0.33)
    //   ~1.0 → all 210 visible
    // Periods: ~5 min and ~13 min — noticeable within a session.
    const d1 = Math.sin(t * 0.020 + this.densityPhase);
    const d2 = Math.sin(t * 0.008 + this.densityPhase + 1.3);
    const density = Math.max(0, Math.min(1, 0.5 + 0.32 * d1 + 0.22 * d2));

    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Global hue drift — frequencies borrowed from the wallpaper's pan animation (0.019, 0.013 rad/s)
    // so the color mood loosely tracks the background's slow motion.
    //   Dark:  wanders 205–285 (blue → indigo → purple → lavender)
    //   Light: wanders 20–70  (amber → gold → warm yellow), mirroring the inverted warm tones
    const globalHueDrift = Math.sin(t * 0.019 + this.densityPhase) * 0.5
                         + Math.cos(t * 0.013 + this.densityPhase + 1.3) * 0.5; // -1…+1
    const globalHue = isDark
      ? 245 + 40 * globalHueDrift   // blue–indigo–purple range
      :  45 + 25 * globalHueDrift;  // amber–gold range

    this.ctx.clearRect(0, 0, W, H);

    const margin = 12;
    for (const p of this.particles) {
      // Soft activation window: particle fades in over 0.12 density-units above its threshold,
      // so particles don't all pop on at once — they trickle in as density rises.
      const activateAlpha = Math.max(0, Math.min(1, (density - p.activationThreshold) / 0.12));

      // Skip invisible particles entirely — no path ops needed
      if (activateAlpha === 0) continue;

      // Per-particle turbulence (gentle sinusoidal wobble, px/s)
      const tx = Math.sin(t * p.turbFreq + p.phase)             * p.turbAmpX;
      const ty = Math.cos(t * p.turbFreq * 0.7 + p.phase + 1.3) * p.turbAmpY;

      p.x += (windX + tx) * dt;
      p.y += (windY + ty) * dt;

      // Wrap around viewport edges
      if (p.x < -margin)    p.x += W + margin * 2;
      if (p.x > W + margin) p.x -= W + margin * 2;
      if (p.y < -margin)    p.y += H + margin * 2;
      if (p.y > H + margin) p.y -= H + margin * 2;

      // Per-particle hue: global drift + slow individual wander (±12°)
      // Dark:  high lightness (80%) — lighter particles float above the dark background
      // Light: low lightness (15%) — deep charcoal tones cut through the bright warm background
      const hue = globalHue + 12 * Math.sin(t * p.colorFreq + p.colorPhase);
      this.ctx.fillStyle = isDark
        ? `hsl(${hue}, 38%, 80%)`
        : `hsl(${hue}, 42%, 15%)`;

      // Per-particle fade × activation envelope.
      // Light mode gets a 1.6× opacity boost: dark particles on a bright background need
      // more opacity to stand out — the spawn-time opacityMax was tuned for dark bg contrast.
      const fadeAlpha = p.opacityMin +
                        (p.opacityMax - p.opacityMin) *
                        (0.5 + 0.5 * Math.sin(t * p.fadeFreq + p.fadePhase));
      this.ctx.globalAlpha = Math.min(1, activateAlpha * fadeAlpha * (isDark ? 1.0 : 1.6));
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1;
  };

  private startAnim(): void {
    if (!this.animHandle && !this.onBattery && !document.hidden) {
      this.animHandle = requestAnimationFrame(this.render);
    }
  }

  private stopAnim(): void {
    if (this.animHandle) {
      cancelAnimationFrame(this.animHandle);
      this.animHandle = null;
    }
  }
}
