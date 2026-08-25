/**
 * WebGL2 (GLSL ES 3.00) shader sources for the gaze-contingent optical
 * correction pass.
 *
 * UNIFORMS REFERENCE:
 *   u_image:        input screen capture texture (from desktopCapturer video stream)
 *   u_resolution:   vec2(screen.width, screen.height) in physical pixels
 *   u_kernel[225]:  flattened 15×15 Wiener/unsharp correction kernel
 *   u_kernelSize:   actual kernel size (7, 9, 11, 15) — 0 means no kernel, use pass-through
 *   u_gazePoint:    vec2(x, y) in screen pixel coordinates
 *   u_fovealRadius: pixels of full correction zone
 *   u_blendRadius:  pixels of fade zone beyond foveal
 *   u_strength:     0.0–1.0 multiplier from the strength slider
 *   u_enabled:      kill switch
 *   u_zoom:         magnification amount (e.g. 0.12 = 12% zoom at gaze centre)
 */

export const CORRECTION_VERT_SOURCE: string = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}`;

export const CORRECTION_FRAG_SOURCE: string = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec2      u_resolution;
uniform float     u_kernel[225];
uniform int       u_kernelSize;
uniform vec2      u_gazePoint;
uniform float     u_fovealRadius;
uniform float     u_blendRadius;
uniform float     u_strength;
uniform bool      u_enabled;
uniform float     u_zoom;

vec3 rgbToYCbCr(vec3 rgb) {
  return vec3(
     0.299    * rgb.r + 0.587    * rgb.g + 0.114    * rgb.b,
    -0.168736 * rgb.r - 0.331264 * rgb.g + 0.5      * rgb.b + 0.5,
     0.5      * rgb.r - 0.418688 * rgb.g - 0.081312 * rgb.b + 0.5
  );
}

vec3 yCbCrToRgb(vec3 ycbcr) {
  float y  = ycbcr.x;
  float cb = ycbcr.y - 0.5;
  float cr = ycbcr.z - 0.5;
  return vec3(
    y + 1.402    * cr,
    y - 0.344136 * cb - 0.714136 * cr,
    y + 1.772    * cb
  );
}

void main() {
  if (!u_enabled || u_strength < 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  // ── Gaze-contingent zone ────────────────────────────────────────────────────
  // u_gazePoint is screen-space (Y down from top).
  // gl_FragCoord has Y up from bottom — flip before comparing.
  vec2 gazeGL = vec2(u_gazePoint.x, u_resolution.y - u_gazePoint.y);
  float dist  = distance(gl_FragCoord.xy, gazeGL);
  float gaze  = smoothstep(u_fovealRadius + u_blendRadius, u_fovealRadius, dist);

  // Skip pixels fully outside the zone — keeps the transparent surround clean.
  if (gaze < 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  // ── Zoom: pull UVs toward gaze centre ──────────────────────────────────────
  // Texture Y is flipped on upload (UNPACK_FLIP_Y_WEBGL), so texture (u,1)=top.
  float zoomFactor = 1.0 + u_zoom * gaze;
  vec2  gazeUV     = vec2(u_gazePoint.x  / u_resolution.x,
                          1.0 - u_gazePoint.y / u_resolution.y);
  vec2  zoomedUV   = gazeUV + (v_texCoord - gazeUV) / zoomFactor;
        zoomedUV   = clamp(zoomedUV, 0.001, 0.999);

  vec4 original = texture(u_image, v_texCoord);

  // ── No-kernel path: zoom-only pass-through ─────────────────────────────────
  // When no correction kernel is loaded (u_kernelSize < 3) just show the zoomed
  // capture — never black, never shaded, text fully readable.
  if (u_kernelSize < 3) {
    vec3 col = texture(u_image, zoomedUV).rgb;
    // Brightness nudge so the zone looks active without darkening
    col = clamp(col * (1.0 + u_strength * 0.06), 0.0, 1.0);
    fragColor = vec4(col * gaze, gaze);
    return;
  }

  // ── Correction convolution ──────────────────────────────────────────────────
  vec2 texelSize = 1.0 / u_resolution;
  int  halfSize  = u_kernelSize / 2;
  vec4 corrected = vec4(0.0);

  for (int dy = -7; dy <= 7; dy++) {
    for (int dx = -7; dx <= 7; dx++) {
      if (abs(dx) > halfSize || abs(dy) > halfSize) continue;
      int  idx    = (dy + halfSize) * u_kernelSize + (dx + halfSize);
      vec2 offset = vec2(float(dx), float(dy)) * texelSize;
      corrected  += texture(u_image, clamp(zoomedUV + offset, 0.001, 0.999))
                    * u_kernel[idx];
    }
  }
  corrected = clamp(corrected, 0.0, 1.0);

  // ── Luma-only correction (prevents colour fringing) ─────────────────────────
  vec4 zoomed   = texture(u_image, zoomedUV);
  vec3 zoomYCC  = rgbToYCbCr(zoomed.rgb);
  vec3 corrYCC  = rgbToYCbCr(corrected.rgb);
  // Keep original chroma; blend only luma
  vec3 lumaOnly = yCbCrToRgb(vec3(corrYCC.x, zoomYCC.y, zoomYCC.z));

  vec3 finalColor = mix(zoomed.rgb, lumaOnly, u_strength);

  // ── Brightness floor ────────────────────────────────────────────────────────
  // Correction kernels with negative sidelobes can produce a visually darkened
  // zone ("shaded like sunglasses"). Clamp the output so the correction zone is
  // never darker than 92 % of the original, keeping text fully readable.
  finalColor = max(finalColor, original.rgb * 0.92);

  // ── Premultiplied alpha output ──────────────────────────────────────────────
  fragColor = vec4(finalColor * gaze, gaze);
}`;
