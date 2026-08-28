import {
  LIVE_CORRECTION_KERNEL_HALF,
  LIVE_CORRECTION_KERNEL_TAPS,
} from '../../../shared/correction-constants'

/**
 * WebGL2 (GLSL ES 3.00) shader sources for the gaze-contingent optical
 * correction pass.
 *
 * UNIFORMS REFERENCE:
 *   u_image:        input screen capture texture (from desktopCapturer video stream)
 *   u_resolution:   vec2(screen.width, screen.height) in physical pixels
 *   u_kernel:       flattened live correction kernel, currently capped at 15 x 15
 *   u_kernelSize:   actual odd kernel size, 0 means no active correction kernel
 *   u_gazePoint:    vec2(x, y) in screen pixel coordinates
 *   u_fovealRadius: pixels of full correction zone
 *   u_blendRadius:  pixels of fade zone beyond foveal
 *   u_strength:     0.0-1.0 blend from original to corrected luminance
 *   u_enabled:      kill switch
 *   u_browserGhostMix: browser-only showcase control, 0.0 in the desktop overlay
 *   u_browserGhostOffsetPx: browser-only displaced edge-copy offset in pixels
 */

export const CORRECTION_VERT_SOURCE: string = `#version 300 es
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_texCoord;
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
uniform float     u_kernel[${LIVE_CORRECTION_KERNEL_TAPS}];
uniform int       u_kernelSize;
uniform vec2      u_gazePoint;
uniform float     u_fovealRadius;
uniform float     u_blendRadius;
uniform float     u_strength;
uniform bool      u_enabled;
uniform float     u_browserGhostMix;
uniform vec2      u_browserGhostOffsetPx;

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
  if (!u_enabled || u_strength < 0.001 || u_kernelSize < 3) {
    fragColor = vec4(0.0);
    return;
  }

  // Gaze-contingent zone. u_gazePoint uses screen-space Y down from the top,
  // while gl_FragCoord uses Y up from the bottom, so flip before comparing.
  vec2 gazeGL = vec2(u_gazePoint.x, u_resolution.y - u_gazePoint.y);
  float dist  = distance(gl_FragCoord.xy, gazeGL);
  float gaze  = smoothstep(u_fovealRadius + u_blendRadius, u_fovealRadius, dist);

  // Pixels outside the active region stay transparent so the underlying desktop
  // remains untouched.
  if (gaze < 0.001) {
    fragColor = vec4(0.0);
    return;
  }

  vec4 original = texture(u_image, v_texCoord);

  // Correction convolution. The live TypeScript boundary validates that
  // u_kernelSize never exceeds the shader's compiled maximum.
  vec2 texelSize = 1.0 / u_resolution;
  int halfSize = u_kernelSize / 2;
  vec4 corrected = vec4(0.0);

  for (int dy = -${LIVE_CORRECTION_KERNEL_HALF}; dy <= ${LIVE_CORRECTION_KERNEL_HALF}; dy++) {
    for (int dx = -${LIVE_CORRECTION_KERNEL_HALF}; dx <= ${LIVE_CORRECTION_KERNEL_HALF}; dx++) {
      if (abs(dx) > halfSize || abs(dy) > halfSize) continue;
      int idx = (dy + halfSize) * u_kernelSize + (dx + halfSize);
      vec2 offset = vec2(float(dx), float(dy)) * texelSize;
      corrected += texture(u_image, clamp(v_texCoord + offset, 0.001, 0.999))
                   * u_kernel[idx];
    }
  }
  corrected = clamp(corrected, 0.0, 1.0);

  // Luma-only correction reduces colour fringing from negative kernel sidelobes.
  vec3 originalYCC = rgbToYCbCr(original.rgb);
  vec3 correctedYCC = rgbToYCbCr(corrected.rgb);
  float correctedLuma = correctedYCC.x;

  // The public browser demo can deliberately expose a much more legible
  // pre-correction pattern than the desktop default. Two displaced luma samples
  // create separated edge copies while subtracting the local source luma. Flat
  // regions therefore remain unchanged instead of becoming a bright spotlight.
  // Desktop rendering sets u_browserGhostMix to zero and skips this branch.
  if (u_browserGhostMix > 0.001) {
    vec2 farOffset = u_browserGhostOffsetPx / u_resolution;
    vec2 nearOffset = farOffset * 0.45;
    float farLuma = rgbToYCbCr(texture(u_image, clamp(v_texCoord + farOffset, 0.001, 0.999)).rgb).x;
    float nearLuma = rgbToYCbCr(texture(u_image, clamp(v_texCoord + nearOffset, 0.001, 0.999)).rgb).x;
    correctedLuma += u_browserGhostMix * 0.45 * (farLuma - originalYCC.x);
    correctedLuma += u_browserGhostMix * 0.18 * (nearLuma - originalYCC.x);
    correctedLuma = clamp(correctedLuma, 0.0, 1.0);
  }

  vec3 lumaOnly = yCbCrToRgb(vec3(correctedLuma, originalYCC.y, originalYCC.z));

  vec3 finalColor = mix(original.rgb, lumaOnly, u_strength);

  // Correction kernels with negative sidelobes can darken the focal region.
  // Keep a conservative brightness floor so stronger settings do not turn the
  // correction zone into a shaded patch.
  finalColor = max(finalColor, original.rgb * 0.92);

  // Premultiplied alpha lets the faded edge blend naturally into the untouched
  // desktop below the transparent Electron window.
  fragColor = vec4(finalColor * gaze, gaze);
}`;