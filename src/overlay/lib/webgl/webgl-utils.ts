import { validateLiveKernelDimensions } from '../../../shared/correction-constants';
import { CORRECTION_VERT_SOURCE, CORRECTION_FRAG_SOURCE } from './correction-shader';

// Fullscreen quad: two CCW triangles covering NDC -1..+1, UV 0..1
const QUAD_VERTICES = new Float32Array([
  -1, -1,  0, 0,
   1, -1,  1, 0,
  -1,  1,  0, 1,
   1, -1,  1, 0,
   1,  1,  1, 1,
  -1,  1,  0, 1,
]);

// The public browser showcase uses the same base correction kernel as the
// desktop renderer, then adds displaced zero-sum lobes so edge structure is
// visibly doubled instead of reading like a bright spotlight. The Electron
// overlay has no browser canvas class and therefore keeps the base kernel.
const BROWSER_DEMO_BASE_GAIN = 1.25;
const BROWSER_DEMO_PRIMARY_GHOST = 0.90;
const BROWSER_DEMO_SECONDARY_GHOST = 0.32;
const BROWSER_DEMO_PRIMARY_OFFSET_X = 6;
const BROWSER_DEMO_PRIMARY_OFFSET_Y = 1;
const BROWSER_DEMO_SECONDARY_OFFSET_X = 3;

export class CorrectionRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private inputTexture: WebGLTexture | null = null;
  private uniformLocations: Map<string, WebGLUniformLocation> = new Map();

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      throw new Error('WebGL2 is not supported, so the correction overlay cannot run');
    }
    this.canvas = canvas;
    this.gl = gl;
  }

  init(): void {
    const { gl } = this;

    // 1. Compile and link shaders
    const vert = compileShader(gl, CORRECTION_VERT_SOURCE, gl.VERTEX_SHADER);
    const frag = compileShader(gl, CORRECTION_FRAG_SOURCE, gl.FRAGMENT_SHADER);
    this.program = createProgram(gl, vert, frag);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    // 2. Fullscreen quad VAO
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    // a_position: location 0, vec2
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    // a_texCoord: location 1, vec2
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);

    // 3. Input texture
    this.inputTexture = createTexture(gl);

    // 4. Cache uniform locations
    gl.useProgram(this.program);
    const uniformNames = [
      'u_image',
      'u_resolution',
      'u_kernel',
      'u_kernelSize',
      'u_gazePoint',
      'u_fovealRadius',
      'u_blendRadius',
      'u_strength',
      'u_enabled',
    ] as const;

    for (const name of uniformNames) {
      const loc = gl.getUniformLocation(this.program, name);
      if (loc !== null) {
        this.uniformLocations.set(name, loc);
      }
    }
  }

  uploadVideoFrame(video: HTMLVideoElement): void {
    if (video.readyState < 2) return;
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);
    // Capture frames are top-row-first; WebGL texture origin is bottom-left.
    // Flip on upload so the image is not drawn upside down.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  uploadImageData(data: ImageData | HTMLCanvasElement): void {
    const { gl } = this;
    gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  setKernel(kernelData: Float32Array, kernelSize: number): void {
    validateLiveKernelDimensions(kernelData.length, kernelSize);

    const { gl } = this;
    const kernelLoc = this.uniformLocations.get('u_kernel');
    const sizeLoc = this.uniformLocations.get('u_kernelSize');
    const uploadedKernel = this.canvas.classList.contains('correction-canvas')
      ? buildBrowserShowcaseKernel(kernelData, kernelSize)
      : kernelData;

    if (kernelLoc && uploadedKernel.length > 0) gl.uniform1fv(kernelLoc, uploadedKernel);
    if (sizeLoc) gl.uniform1i(sizeLoc, kernelSize);
  }

  setGazePoint(x: number, y: number): void {
    const loc = this.uniformLocations.get('u_gazePoint');
    if (loc) this.gl.uniform2f(loc, x, y);
  }

  setStrength(strength: number): void {
    const loc = this.uniformLocations.get('u_strength');
    if (loc) this.gl.uniform1f(loc, strength);
  }

  setEnabled(enabled: boolean): void {
    const loc = this.uniformLocations.get('u_enabled');
    if (loc) this.gl.uniform1i(loc, enabled ? 1 : 0);
  }

  setFovealParams(fovealRadius: number, blendRadius: number): void {
    const { gl } = this;
    const fovLoc = this.uniformLocations.get('u_fovealRadius');
    const blendLoc = this.uniformLocations.get('u_blendRadius');
    if (fovLoc) gl.uniform1f(fovLoc, fovealRadius);
    if (blendLoc) gl.uniform1f(blendLoc, blendRadius);
  }

  render(): void {
    const { gl, canvas } = this;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(this.program);

    const resLoc = this.uniformLocations.get('u_resolution');
    const imageLoc = this.uniformLocations.get('u_image');
    if (resLoc) gl.uniform2f(resLoc, canvas.width, canvas.height);
    if (imageLoc) gl.uniform1i(imageLoc, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.inputTexture);

    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);
  }

  clear(): void {
    const { gl } = this;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  destroy(): void {
    const { gl } = this;
    if (this.inputTexture) gl.deleteTexture(this.inputTexture);
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.program) gl.deleteProgram(this.program);
    this.inputTexture = null;
    this.vao = null;
    this.program = null;
    this.uniformLocations.clear();
    const ext = gl.getExtension('WEBGL_lose_context');
    ext?.loseContext();
  }
}

// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

function amplifyKernelAroundIdentity(
  kernelData: Float32Array,
  gain: number,
): Float32Array {
  const centerIndex = Math.floor(kernelData.length / 2);
  const amplified = new Float32Array(kernelData.length);

  for (let i = 0; i < kernelData.length; i++) {
    const identity = i === centerIndex ? 1 : 0;
    amplified[i] = identity + gain * (kernelData[i] - identity);
  }

  return amplified;
}

function buildBrowserShowcaseKernel(
  kernelData: Float32Array,
  kernelSize: number,
): Float32Array {
  if (kernelSize < 3 || kernelData.length === 0) return kernelData;

  const half = Math.floor(kernelSize / 2);
  const centerIndex = half * kernelSize + half;
  const showcase = amplifyKernelAroundIdentity(kernelData, BROWSER_DEMO_BASE_GAIN);

  const primaryX = Math.min(BROWSER_DEMO_PRIMARY_OFFSET_X, half);
  const primaryY = Math.min(BROWSER_DEMO_PRIMARY_OFFSET_Y, half);
  const secondaryX = Math.min(BROWSER_DEMO_SECONDARY_OFFSET_X, half);
  const primaryIndex = (half + primaryY) * kernelSize + (half + primaryX);
  const secondaryIndex = half * kernelSize + (half + secondaryX);
  const displacedEnergy = BROWSER_DEMO_PRIMARY_GHOST + BROWSER_DEMO_SECONDARY_GHOST;

  // Add two displaced positive lobes and remove the same energy from the
  // centre tap. The zero-sum modification preserves uniform regions while
  // producing clear duplicate contours around text and other hard edges.
  showcase[centerIndex] -= displacedEnergy;
  showcase[primaryIndex] += BROWSER_DEMO_PRIMARY_GHOST;
  showcase[secondaryIndex] += BROWSER_DEMO_SECONDARY_GHOST;

  return showcase;
}

export function compileShader(
  gl: WebGL2RenderingContext,
  source: string,
  type: GLenum,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader object');

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '(no info log)';
    gl.deleteShader(shader);
    const annotated = annotateShaderError(source, log);
    throw new Error(`Shader compile error:\n${log}\n${annotated}`);
  }

  return shader;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vert: WebGLShader,
  frag: WebGLShader,
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program object');

  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '(no info log)';
    gl.deleteProgram(program);
    throw new Error(`Program link error:\n${log}`);
  }

  return program;
}

export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error('Failed to create WebGL texture');

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  // Allocate a 1 x 1 transparent pixel so the texture is valid before first upload.
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

// Attach line-numbered source context around each error line reported by the driver.
function annotateShaderError(source: string, log: string): string {
  const lines = source.split('\n');
  const errorLineRe = /ERROR:\s*\d+:(\d+)/g;
  const errorLines = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = errorLineRe.exec(log)) !== null) {
    errorLines.add(parseInt(match[1], 10));
  }
  if (errorLines.size === 0) return '';
  return [...errorLines]
    .flatMap((ln) => {
      const start = Math.max(1, ln - 2);
      const end = Math.min(lines.length, ln + 2);
      return lines.slice(start - 1, end).map((l, i) => {
        const n = start + i;
        return `${n === ln ? '>>>' : '   '} ${String(n).padStart(4)} | ${l}`;
      });
    })
    .join('\n');
}