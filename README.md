<p align="center">
  <img src="docs/media/refract-header.jpg" alt="Refract, Clarity, Rethought" width="100%">
</p>

<p align="center">
  <strong>An experimental adaptive-display prototype that combines computational optics, gaze tracking, and real-time GPU rendering.</strong>
</p>

<p align="center">
  Electron · React · TypeScript · WebGL2 · GLSL · MediaPipe · Zustand
</p>

Refract explores a simple question: **what if the screen could adapt to the user's vision instead of making the user adapt to the screen?**

The desktop application captures the display, models an approximate refractive blur from prescription and calibration parameters, tracks the user's gaze or cursor, and applies localized GPU-accelerated correction around the point of attention. The result is a working engineering prototype where optics, computer vision, numerical calibration, desktop systems, physical setup, and human comfort all have to operate in one loop.

<p align="center">
  <img src="docs/media/refract-home.webp" alt="Refract desktop application home screen with correction status, prescription values, and controls" width="100%">
</p>

<p align="center">
  <sub>Current Refract desktop interface. The application separates its control UI from a transparent correction overlay that can operate above other desktop content.</sub>
</p>

## At a glance

| Area | Refract |
| --- | --- |
| **Core idea** | Preprocess display content so the screen can partially compensate for modeled visual blur |
| **Technical centerpiece** | A gaze-aware, click-through WebGL2 overlay that processes a live desktop capture around the point of attention |
| **Optics** | Prescription and physical calibration values become a rotated anisotropic Gaussian point spread function and correction kernel |
| **Tracking** | MediaPipe iris landmarks, custom eye-relative features, polynomial calibration, validation, and Kalman smoothing |
| **Project type** | Collaborative experimental engineering prototype, later refined and curated here as a technical portfolio |
| **Current status** | Functional proof of concept with explicit limitations, not a clinical or medical system |

<p align="center">
  <a href="#why-refract">Why</a> ·
  <a href="#my-contribution-and-collaboration">Contribution</a> ·
  <a href="#system-architecture">Architecture</a> ·
  <a href="#gaze-tracking-and-calibration">Gaze</a> ·
  <a href="#modeling-refractive-blur">Optics</a> ·
  <a href="#testing-changed-the-product">Testing</a> ·
  <a href="#run-refract-locally">Run locally</a>
</p>

> [!IMPORTANT]
> **Refract is an experimental research and engineering prototype.** It is not a medical device, a clinical diagnostic tool, or a replacement for glasses, contact lenses, professional eye examinations, or other vision care. The guided vision workflow produces heuristic estimates only.

## Why Refract

Glasses correct light after it leaves a display. Refract investigates the inverse idea: whether the image on the display can be preprocessed so that some of the user's modeled optical blur is partially compensated before the image reaches the eye.

That question quickly became more than an image-filtering problem. A useful prototype also had to understand physical screen scale and viewing distance, convert prescription values into a directional blur model, follow where the user is looking, modify arbitrary desktop content with low latency, avoid recursive screen capture, control visual artifacts, and remain comfortable enough to test.

This makes Refract different from a conventional application UI. Its main engineering problem is **integration across physical and computational systems**:

- **Computational optics:** translate sphere, cylinder, axis, pupil size, viewing distance, and screen scale into an approximate point spread function.
- **Computer vision:** estimate gaze from webcam iris landmarks and calibrate those measurements to screen coordinates.
- **Numerical methods:** fit screen mappings, smooth noisy measurements, and generate bounded correction kernels.
- **GPU graphics:** perform localized convolution on a continuously updated desktop texture with WebGL2 and GLSL.
- **Desktop engineering:** coordinate Electron windows, screen capture, IPC, persistence, tray controls, shortcuts, and packaging.
- **Human-centered iteration:** treat comprehension, reversibility, setup conditions, and visual comfort as engineering constraints rather than presentation details.

## My contribution and collaboration

Refract was developed collaboratively, and I do not present the original technical foundation as solo work. The technical sections below describe the collaborative system as it exists. My individual contribution centered on product direction, user testing and interpretation, feedback-driven UX decisions, later interface and desktop engineering, and the final technical presentation of the project.

| Area | My contribution |
| --- | --- |
| **Product direction** | Helped frame Refract around adaptive display comfort and a human problem rather than only a technology demonstration |
| **Testing and iteration** | Helped organize testing, interpret recurring friction, and turn feedback about calibration, reversibility, before/after comparison, and correction strength into product changes |
| **Interface engineering** | Completed a substantial later refactor across typography, spacing, responsive behavior, accessibility semantics, page structure, OD/OS help graphics, and Refract branding |
| **Desktop polish** | Added the Refract app and tray icon system, icon-generation tooling, and Windows packaging support |
| **Portfolio engineering** | Migrated and cleaned the working application for public presentation, added CI verification, documented active versus experimental techniques, and built the diagrams and technical narrative in this repository |

Two source-history commits make the later engineering work directly inspectable:

- [`11e9c9c`](https://github.com/VDuckardtt/refract/commit/11e9c9ccb8aee09c7aac5ceb3ed13c75cf4eb80b): interface, responsive layout, accessibility, typography, help graphics, and branding refinement
- [`0fa3a54`](https://github.com/VDuckardtt/refract/commit/0fa3a54b1e7a5d66fe540837c7b16addb130a860): application and tray icons, icon-generation tooling, and Windows packaging support

The original development history is preserved in the [collaborative source repository](https://github.com/VDuckardtt/refract). This repository is my curated showcase of the working project and its engineering story.

## System architecture

<p align="center">
  <img src="docs/media/architecture.svg" alt="Refract system architecture from prescription and calibration through optics, tracking, desktop capture, GPU correction, and transparent overlay" width="100%">
</p>

Refract separates the application interface from the high-frequency correction layer because they have different performance and interaction requirements.

- The **React renderer** handles prescription input, calibration, guided vision screens, settings, and user controls.
- The **Electron main process** owns windows, persistence, screen-capture coordination, tray behavior, shortcuts, and IPC.
- The **overlay renderer** receives compact correction state and runs a WebGL render loop without forcing React component re-renders.
- The **computer-vision pipeline** produces gaze and distance estimates.
- The **optics pipeline** converts refractive and physical parameters into PSF and correction kernels that can be serialized through IPC.

A typical path is:

```text
prescription + physical calibration
              |
              v
      approximate optical model
              |
              +----------------------+
              |                      |
              v                      v
       correction kernel      gaze or cursor
              |                      |
              +----------+-----------+
                         |
                         v
                  desktop capture
                         |
                         v
               WebGL2 correction shader
                         |
                         v
             transparent desktop overlay
```

### Real-time desktop correction

The correction layer is a separate frameless, transparent, always-on-top Electron window. It is normally non-focusable and click-through, so the corrected region can appear above other applications without intercepting normal mouse interaction.

The high-frequency path is implemented in [`CorrectionCanvas.tsx`](src/overlay/CorrectionCanvas.tsx), with the WebGL renderer in [`webgl-utils.ts`](src/overlay/lib/webgl/webgl-utils.ts) and correction logic in [`correction-shader.ts`](src/overlay/lib/webgl/correction-shader.ts).

One subtle systems problem appears immediately. If the screen-capture pipeline captures Refract's own overlay, the next frame can contain the previous corrected output. Reprocessing that image creates a recursive feedback loop. Refract therefore uses Electron content protection so the overlay remains visible to the user while being excluded from capture APIs.

The shader also includes perceptual safeguards:

- correction fades smoothly outside the focal region instead of ending at a hard boundary
- luminance is corrected separately to reduce color fringing
- a brightness floor limits darkening from negative kernel sidelobes
- pixels outside the active region remain transparent, leaving the underlying desktop untouched
- gaze coordinates are validated before use, with a safe fallback when tracking data is unavailable

The key lesson was that mathematical strength alone was not a sufficient objective. A stronger filter could also produce more ringing, darkening, or visual discomfort.

## Gaze tracking and calibration

<p align="center">
  <img src="docs/media/gaze-pipeline.svg" alt="Refract gaze pipeline from webcam landmarks through normalization, calibration, regression, smoothing, and screen coordinates" width="100%">
</p>

MediaPipe Face Mesh provides iris and eye-corner landmarks, but Refract builds the screen mapping around those landmarks rather than treating library output as a finished gaze estimate.

The implementation in [`iris-gaze.ts`](src/renderer/lib/eyetracking/iris-gaze.ts) measures each iris center **relative to the midpoint and width of the eye corners**. This normalized feature reduces sensitivity to head translation and viewing-distance changes compared with regressing directly on raw camera pixels. Features from both eyes are then combined.

Calibration uses a 3 x 3 screen grid. At each point, Refract records the median of several recent frames to reduce the influence of blinks and small involuntary movements. It then fits two degree-2 polynomial mappings, one for horizontal position and one for vertical position, using:

```text
[1, x, y, x^2, xy, y^2]
```

The least-squares normal equations are solved with a custom Gauss-Jordan implementation using partial pivoting. Runtime predictions are stabilized by the constant-velocity Kalman smoother in [`gaze-smoother.ts`](src/renderer/lib/eyetracking/gaze-smoother.ts), with additional behavior for rapid gaze changes.

After calibration, validation targets provide a mean pixel-error estimate. That matters because successful model initialization is not the same thing as accurate tracking.

## Modeling refractive blur

<p align="center">
  <img src="docs/media/optics-pipeline.svg" alt="Refract computational optics pipeline from prescription values to point spread function and localized GPU correction" width="100%">
</p>

The active optical model is deliberately pragmatic. Refract converts prescription and calibration values into blur radii in screen pixels using viewing distance, screen pixel density, and pupil diameter. Sphere contributes the base blur, while cylinder and axis make the model directional. The result is a **rotated anisotropic Gaussian point spread function (PSF)**.

The prescription conversion is implemented in [`prescription.ts`](src/renderer/lib/optics/prescription.ts), while PSF and kernel generation live in [`psf.ts`](src/renderer/lib/optics/psf.ts).

For each kernel sample, Refract rotates the pixel offset into the PSF's principal-axis coordinate system and evaluates a 2D Gaussian. The kernel is normalized to preserve energy and bounded so it remains practical for real-time use.

The active live route derives a normalized unsharp kernel:

```text
correction = (1 + strength) * identity - strength * PSF
```

This is an approximation, not a claim of clinical optical inversion. It proved easier to keep responsive and visually stable than more aggressive inverse filtering.

### Experimental Wiener inversion

The codebase also contains an experimental frequency-domain Wiener deconvolution implementation in [`wiener.ts`](src/renderer/lib/optics/wiener.ts). It zero-pads and shifts the PSF, performs a custom separable 2D discrete Fourier transform, applies the regularized inverse

```text
W(u,v) = H*(u,v) / (|H(u,v)|^2 + NSR)
```

and transforms the result back into a spatial correction kernel.

This module is an engineering experiment, **not the default live path**. Refract also explored higher-order aberration models during research, including Zernike representations, but the current PSF implementation remains Gaussian. The portfolio keeps explored techniques, experimental code, and active runtime behavior separate so the technical claims remain precise.

## Experimental vision workflow

Refract can start from a known prescription, but it also includes an experimental guided workflow for users who do not begin with prescription values. That workflow is a calibration and interaction experiment, not a clinical eye examination.

<table>
  <tr>
    <td width="50%">
      <img src="docs/media/refract-prescription.webp" alt="Refract prescription editor for OD and OS sphere, cylinder, add, PD, and date values">
    </td>
    <td width="50%">
      <img src="docs/media/refract-vision-acuity.webp" alt="Refract Snellen-style acuity test with calibrated letter rows and response controls">
    </td>
  </tr>
  <tr>
    <td align="center"><sub>Prescription input keeps OD and OS values explicit and editable.</sub></td>
    <td align="center"><sub>The guided workflow scales Sloan-style letters using physical screen calibration rather than CSS pixels alone.</sub></td>
  </tr>
</table>

The workflow includes:

- **Viewing-distance calibration:** manual positioning plus camera-based estimation.
- **Physical screen calibration:** an ISO-size credit card can serve as a known real-world reference for estimating pixels per millimetre.
- **Snellen-style acuity testing:** Sloan letters from 20/200 through 20/20, scaled from the calibrated physical screen size.
- **Astigmatism clock:** selectable orientations combined through circular averaging to estimate a dominant axis.
- **Astigmatism fan:** a denser directional refinement interface.
- **Contrast comparison:** generated Gabor-like patches for exploratory visual comparison.
- **Results:** a clearly labeled heuristic estimate that can seed correction controls.

Physical calibration became an important engineering constraint. A letter that occupies the same number of CSS pixels can have very different real-world dimensions on two monitors, so screen geometry and viewing conditions are part of the system rather than merely setup instructions.

## Testing changed the product

<p align="center">
  <img src="docs/media/user-testing.svg" alt="Refract feedback-driven iteration showing changes to calibration language, before and after comparison, reversibility, comfort, and physical setup" width="100%">
</p>

Refract went through exploratory user testing followed by additional feedback. The most useful outcome was not a headline metric. It was discovering where a technically functioning prototype still failed as an experience.

| What users revealed | What changed |
| --- | --- |
| Calibration language sounded too technical | Instructions were rewritten as guided setup rather than clinical-sounding procedure |
| The idea remained abstract until users toggled correction on and off | The before/after comparison moved earlier so the core effect became tangible sooner |
| Some users worried a poor adjustment might leave the screen worse | Reset and reversibility became more visible |
| Stronger correction could feel harsh or slightly disorienting | Default strength was reduced and comfort became part of the definition of functionality |
| Results varied with the testing environment | Viewing distance, brightness, room lighting, camera position, and physical screen dimensions became explicit engineering variables |

One glasses-wearing tester described the effect as promising while also making clear that it did not feel equivalent to glasses. That distinction was valuable. It pushed the project away from treating technical sophistication as proof of effectiveness and toward clearer limits, better setup, and more honest success criteria.

The testing was exploratory and subjective. It was not controlled clinical validation, retention telemetry, or evidence that Refract can replace corrective lenses.

## Engineering challenges and decisions

### 1. Preventing recursive capture

**Problem:** a transparent correction layer can accidentally become part of the next desktop frame it processes.

**Decision:** separate correction into its own protected overlay window and exclude that window from capture.

**Lesson:** real-time graphics systems create feedback and timing problems that do not appear in an isolated image-processing prototype.

### 2. Stabilizing gaze without specialized hardware

**Problem:** raw iris positions move with both gaze and head motion, while blinks and small movements add noise.

**Decision:** normalize iris position relative to eye geometry, collect multiple calibration frames, fit a polynomial screen mapping, validate the result, and smooth runtime predictions.

**Lesson:** integrating a computer-vision model is only the first step. A usable system needs calibration, numerical conditioning, error handling, validation, and temporal filtering around the model.

### 3. Balancing correction with visual comfort

**Problem:** aggressive sharpening can create ringing, darkening, color artifacts, or an uncomfortable focal region.

**Decision:** keep the live path conservative, localize correction around attention, blend its edge, preserve chroma, and protect brightness.

**Lesson:** in a human-facing system, perceptual quality is part of technical correctness.

### 4. Connecting pixels to the physical world

**Problem:** visual tests expressed only in CSS pixels are not physically consistent across monitors or viewing distances.

**Decision:** add screen-scale and distance calibration and use those measurements when sizing visual targets and converting modeled blur to pixels.

**Lesson:** when software interacts with perception, environmental conditions belong inside the engineering model.

## Prototype scope and current limitations

Refract is intentionally presented as a proof of concept, including the boundaries that still separate it from a validated vision product:

- the live correction model uses an anisotropic Gaussian PSF, not a clinically calibrated wavefront model
- the experimental Wiener module exists separately, while the active route uses normalized unsharp correction
- the application computes separate OD and OS optical state, but the current overlay path still consumes the OD correction kernel
- the guided Snellen, astigmatism, and contrast stages need more rigorous scoring, integration, and validation before they should be treated as a reliable prescription estimator
- some advanced settings and adaptive-quality hooks are prototype infrastructure rather than complete user-facing behavior
- MediaPipe runtime assets are currently loaded from a CDN
- user testing was exploratory and was not performed under controlled clinical conditions

These limitations are part of the engineering record. They define where a compelling prototype ends and where much more rigorous validation would have to begin.

## What I learned

**Test earlier.** We waited too long to put rough versions in front of users. Research can justify a direction, but it cannot show whether a first-time user understands the setup or finds the result comfortable.

**Design the environment, not only the interface.** Viewing distance, brightness, room lighting, camera position, and physical screen dimensions can change the result. In software connected to the physical world, setup conditions become system inputs.

**Define success before collecting feedback.** Early testing mixed several possible meanings of "working," including visible sharpness, comfort, before/after difference, and similarity to corrective lenses. A stronger evaluation would define those criteria before testing.

**Technical complexity is not a substitute for clarity.** A shader, deconvolution method, or tracking model can be sophisticated while the product is still confusing. Refract improved when technical decisions and user experience were treated as the same system.

**Comfort is part of functionality.** More correction was not automatically better correction. The project became stronger when the goal shifted from maximizing an effect to making the effect predictable, reversible, and usable.

## Technology

| Area | Technology and implementation |
| --- | --- |
| Desktop application | Electron 32, Electron Vite |
| Interface | React 18, TypeScript, React Router, Tailwind CSS |
| State and persistence | Zustand, electron-store |
| GPU rendering | WebGL2, GLSL ES 3.00 |
| Computer vision | MediaPipe Face Mesh with custom iris-feature calibration |
| Gaze estimation | Degree-2 polynomial regression, custom Gauss-Jordan solver, Kalman smoothing |
| Computational optics | Directional Gaussian PSFs, normalized unsharp correction, experimental Wiener deconvolution |
| Desktop integration | IPC, transparent overlay, desktop capture, tray controls, global shortcuts |
| Packaging | Electron Builder, Windows NSIS, macOS DMG, Linux AppImage |

## Run Refract locally

### Prerequisites

- Node.js and npm
- A desktop environment supported by Electron
- A webcam for eye tracking and camera-based distance estimation
- Screen-capture permission where required by the operating system

### Development

```bash
git clone https://github.com/kzhu37/Refract-Portfolio.git
cd Refract-Portfolio
npm ci
npm run dev
```

### Verification

```bash
npm run typecheck
npm run build
```

The repository includes GitHub Actions CI that installs dependencies, runs the TypeScript checks, and builds the application on pushes and pull requests.

### Platform packages

```bash
npm run build:win
npm run build:mac
npm run build:linux
```

Build the target that matches your operating system. Platform-specific packaging can require native tooling and permissions.

### Global shortcuts

| Action | Windows / Linux | macOS |
| --- | --- | --- |
| Toggle correction | `Ctrl + Shift + V` | `Cmd + Shift + V` |
| Bring Refract forward | `Ctrl + Shift + B` | `Cmd + Shift + B` |

## Repository guide

```text
src/
  main/
    ipc/                 Electron IPC handlers
    store/               Persistent application state
    tray/                System tray integration
    windows/             Main and transparent overlay windows
  overlay/
    lib/capture/         Live desktop capture
    lib/quality/         Frame-time monitoring
    lib/webgl/           Shader and WebGL renderer
    CorrectionCanvas.tsx High-frequency correction loop
  preload/               Context-isolated Electron bridges
  renderer/
    components/          Calibration, vision, and correction UI
    lib/eyetracking/     Iris tracking, calibration, smoothing
    lib/optics/          Prescription model, PSF, Wiener experiments
    lib/store/           Renderer state
    pages/               Main application screens
docs/media/              Portfolio screenshots and diagrams
resources/icons/         App and tray branding
scripts/                 Icon-generation tooling
```

## Next steps

The strongest next work is validation, not adding more controls:

1. integrate OD and OS correction behavior more rigorously
2. add automated tests for optics, scoring, and calibration math
3. benchmark latency and visual quality under controlled viewing conditions
4. compare Gaussian, Wiener, and higher-order optical models against predefined success criteria

## Credits

Refract was developed collaboratively by Vlad Duckardt and Kevin Zhu. The original development history remains available in [`VDuckardtt/refract`](https://github.com/VDuckardtt/refract), while this repository is Kevin Zhu's curated portfolio presentation of the project.

The project's difficulty came from making several systems operate together: refractive parameters had to become a usable correction model, webcam landmarks had to become stable screen coordinates, those coordinates had to drive a localized GPU correction over a continuously captured desktop, and the entire loop had to remain responsive, reversible, and understandable enough for people to test.
