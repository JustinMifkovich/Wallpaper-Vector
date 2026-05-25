import { Component, ElementRef, OnDestroy, AfterViewInit, ViewChild } from '@angular/core';

const VS_SOURCE = `
  attribute vec2 a_pos;
  void main() { gl_Position = vec4(a_pos, 0, 1); }
`;

const FS_SOURCE = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;

  #define S(a,b,t) smoothstep(a,b,t)

  mat2 Rot(float a) {
    float s = sin(a);
    float c = cos(a);
    return mat2(c, -s, s, c);
  }

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(2127.1, 81.17)), dot(p, vec2(1269.5, 283.37)));
    return fract(sin(p) * 43758.5453);
  }

  float noise(in vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float n = mix(
      mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
          dot(-1.0 + 2.0 * hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
      mix(dot(-1.0 + 2.0 * hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
          dot(-1.0 + 2.0 * hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
    return 0.5 + 0.5 * n;
  }

  vec2 swirl(vec2 uv, vec2 center, float strength, float time) {
    vec2 delta = uv - center;
    float dist = length(delta);
    float angle = strength * exp(-dist * 2.8) * sin(time * 0.3 + dist * 3.0);
    float s = sin(angle);
    float c = cos(angle);
    return center + mat2(c, -s, s, c) * delta;
  }

  vec3 getColor(vec2 wp, float yPulse, float pPulse, float gPulse) {
    vec3 deepNavy      = vec3(0.04, 0.07, 0.28);
    vec3 cobalt        = vec3(0.10, 0.25, 0.65);
    vec3 cerulean      = vec3(0.15, 0.42, 0.72);
    vec3 indigo        = vec3(0.18, 0.10, 0.52);
    vec3 purple        = vec3(0.35, 0.15, 0.60);
    vec3 lavender      = vec3(0.42, 0.30, 0.72);
    vec3 vibrantYellow = vec3(0.98, 0.35, 0.60);
    vec3 softPink      = vec3(0.75, 0.30, 0.48);
    vec3 lightGreen    = vec3(0.40, 0.90, 0.50);

    float x = (wp * Rot(radians(-5.))).x;
    float y = wp.y;

    vec3 blueBase    = mix(deepNavy, cobalt,      S(-.5, .0, x));
    blueBase         = mix(blueBase, cerulean,    S(.0,  .4, x));
    vec3 purpleLayer = mix(indigo,   purple,      S(-.4, .1, x));
    purpleLayer      = mix(purpleLayer, lavender, S(.0,  .5, x));
    vec3 col = mix(blueBase, purpleLayer, S(.3, -.2, y) * 0.55);

    float yellowRegion = noise(wp * 2.2 + vec2(iTime * 0.04, 0.0));
    col = mix(col, mix(cobalt, vibrantYellow, 0.85), S(0.62, 0.80, yellowRegion) * yPulse * 0.80);

    float pinkRegion = noise(wp * 2.5 + vec2(0.0, iTime * 0.03 + 5.5));
    col = mix(col, mix(purple, softPink, 0.70), S(0.64, 0.80, pinkRegion) * pPulse * 0.65);

    float greenRegion = noise(wp * 2.0 + vec2(iTime * 0.035 + 2.3, iTime * 0.025 + 8.1));
    col = mix(col, mix(cerulean, lightGreen, 0.65), S(0.63, 0.79, greenRegion) * gPulse * 0.55);

    return col;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord / iResolution.xy;
    float ratio = iResolution.x / iResolution.y;

    vec2 pan = vec2(
      sin(iTime * 0.031) * 0.18 + cos(iTime * 0.019) * 0.09,
      cos(iTime * 0.027) * 0.14 + sin(iTime * 0.023) * 0.07
    );
    vec2 pannedUV = uv + pan;

    vec2 c1 = vec2(0.35 + 0.12 * sin(iTime * 0.11), 0.5 + 0.10 * cos(iTime * 0.09));
    vec2 c2 = vec2(0.65 + 0.10 * cos(iTime * 0.13), 0.5 + 0.12 * sin(iTime * 0.07));

    vec2 suv = pannedUV;
    suv = swirl(suv, c1,  1.8, iTime);
    suv = swirl(suv, c2, -1.4, iTime + 1.5);

    vec2 tuv = suv;
    tuv -= .5;

    float degree = noise(vec2(iTime * .1, tuv.x * tuv.y));
    tuv.y *= 1. / ratio;
    tuv *= Rot(radians((degree - .5) * 720. + 180.));
    tuv.y *= ratio;

    float frequency = 5.;
    float amplitude = 30.;
    float speed = iTime * 2.;
    tuv.x += sin(tuv.y * frequency + speed) / amplitude;
    tuv.y += sin(tuv.x * frequency * 1.5 + speed) / (amplitude * .5);

    vec2 dq = vec2(
      noise(tuv * 2.0 + vec2(iTime * 0.02,        0.5)),
      noise(tuv * 2.0 + vec2(1.3, iTime * 0.02 + 3.7))
    );
    vec2 dr = vec2(
      noise(tuv * 2.0 + 2.2 * dq + vec2(iTime * 0.015 + 1.7, 9.2)),
      noise(tuv * 2.0 + 2.2 * dq + vec2(8.3, iTime * 0.015 + 2.8))
    );
    vec2 wtuv = tuv + 0.35 * dr;

    float accentNoise1 = noise(vec2(iTime * 0.07, 1.3));
    float accentNoise2 = noise(vec2(iTime * 0.05 + 4.7, 2.9));
    float accentNoise3 = noise(vec2(iTime * 0.06 + 9.1, 5.3));
    float yellowPulse  = pow(max(0.0, sin(accentNoise1 * 6.28)), 2.5);
    float pinkPulse    = pow(max(0.0, sin(accentNoise2 * 6.28 + 2.1)), 2.5);
    float greenPulse   = pow(max(0.0, sin(accentNoise3 * 6.28 + 4.2)), 2.5);

    vec3 base = getColor(wtuv, yellowPulse, pinkPulse, greenPulse);

    vec2 vignUV = uv * 2.0 - 1.0;
    float vign = 1.0 - dot(vignUV, vignUV) * 0.15;
    base *= vign;

    gl_FragColor = vec4(base, 1.0);
  }
`;

@Component({
  selector: 'app-wallpaper',
  templateUrl: './wallpaper.html',
  styleUrl: './wallpaper.scss',
})
export class WallpaperComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private gl!: WebGLRenderingContext;
  private animHandle: number | null = null;
  private onBattery = false;
  private startTime = 0;
  private lastFrameTime = 0;
  private uRes!: WebGLUniformLocation;
  private uTime!: WebGLUniformLocation;

  private static readonly TARGET_FPS = 24;
  private static readonly FRAME_INTERVAL_MS = 1000 / WallpaperComponent.TARGET_FPS;

  private readonly onResize = () => this.resize();
  private readonly onVisibility = () => document.hidden ? this.stopAnim() : this.startAnim();

  ngAfterViewInit(): void {
    const canvas = this.canvasRef.nativeElement;
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
    if (!gl) {
      console.error('WebGL not supported');
      return;
    }
    this.gl = gl;

    this.setupWebGL();
    this.startTime = performance.now();
    this.lastFrameTime = 0;

    window.addEventListener('resize', this.onResize);
    this.resize();

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

  private setupWebGL(): void {
    const gl = this.gl;

    const vs = this.compileShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = this.compileShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uRes = gl.getUniformLocation(program, 'iResolution')!;
    this.uTime = gl.getUniformLocation(program, 'iTime')!;
  }

  private compileShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)!;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      console.error(this.gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  private resize(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = Math.floor(window.innerWidth / 3);
    canvas.height = Math.floor(window.innerHeight / 3);
    this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  private render = (timestamp: DOMHighResTimeStamp): void => {
    this.animHandle = requestAnimationFrame(this.render);
    if (timestamp - this.lastFrameTime < WallpaperComponent.FRAME_INTERVAL_MS) return;
    this.lastFrameTime = timestamp;

    const t = (timestamp - this.startTime) / 1000;
    const canvas = this.canvasRef.nativeElement;
    this.gl.uniform2f(this.uRes, canvas.width, canvas.height);
    this.gl.uniform1f(this.uTime, t);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
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
