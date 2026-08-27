# Optical model assumptions and claim boundaries

Refract is an engineering prototype for exploring display-side precompensation. It is not a clinical optical simulator, a prescription estimator, or a substitute for corrective lenses or professional eye care. This note documents what the current numerical model is intended to approximate, where the implementation deliberately simplifies ocular optics, and which claims the project does not make.

## 1. What the model is trying to approximate

A defocused eye spreads light from an ideal point over a finite retinal region. In first-order geometrical optics, blur size grows with pupil diameter and dioptric defocus. Smith describes angular defocus blur as an approximate function of pupil diameter and refractive error, while later treatments derive the same basic proportional relationship from similar-triangle geometry.

Refract uses that relationship as physical motivation, not as a claim that its screen-space kernel reproduces a measured retinal point spread function.

Useful references:

- G. Smith, "Angular diameter of defocus blur discs," American Journal of Optometry and Physiological Optics, 1982. [PubMed](https://pubmed.ncbi.nlm.nih.gov/7180930/) and [DOI](https://doi.org/10.1097/00006324-198211000-00006)
- C. Chan, G. Smith, and R. J. Jacobs, "Simulating refractive errors: source and observer methods," American Journal of Optometry and Physiological Optics, 1985. [PubMed](https://pubmed.ncbi.nlm.nih.gov/3985114/)
- L. N. Thibos and C. A. Thibos, "Geometrical Optical Analysis of Defocused Retinal Images to Compute the Size of Retinal Blur Circles Relative to Object Size," US Ophthalmic Review, 2011. [DOI](https://doi.org/10.17925/USOR.2011.04.02.104)

## 2. Refract's pixel-space blur scale

[`blurRadiusPixels`](../src/renderer/lib/optics/prescription.ts) converts prescription and setup values into two directional blur scales. The current inputs are sphere, cylinder, axis, viewing distance, screen pixels per metre, and an assumed pupil diameter.

The code uses a distance-adjusted engineering heuristic to keep the display-space blur scale bounded across practical viewing conditions. It should not be read as a clinically validated retinal-blur equation. In particular, the numerical output is used as a Gaussian kernel scale for a real-time rendering experiment, not as a prediction of an individual's retinal image.

This distinction matters because a physical blur-disc diameter and a Gaussian standard deviation are not the same quantity. Refract intentionally chooses a Gaussian representation because it is compact, normalized, directional, and practical for repeated GPU convolution.

## 3. Sphere, cylinder, and axis

For sphere-only prescriptions, the prototype uses the same blur scale in both kernel axes. When cylinder is present, it evaluates the sphere meridian and the sphere-plus-cylinder meridian separately, then rotates the resulting ellipse using the prescription axis convention.

This captures directional behavior in a tractable form, but it omits many effects that can shape a real ocular point spread function, including diffraction, higher-order aberrations, pupil shape, accommodation, tear-film variation, and individual wavefront structure. Higher-order optical representations were explored during research, but they are not part of the active runtime model.

## 4. Why the active PSF is Gaussian

The live point spread function is a rotated anisotropic Gaussian. For every kernel sample, Refract rotates the sample coordinate into the principal-axis frame, evaluates the Gaussian, and normalizes the complete kernel to unit sum.

The Gaussian is best understood as a computational approximation with three practical properties:

1. It turns prescription directionality into a smooth bounded kernel.
2. It is inexpensive enough for repeated model updates and GPU use.
3. It makes numerical invariants such as normalization, finiteness, kernel size, and directional response easy to verify.

It is not presented as a wavefront-derived or clinically measured ocular PSF.

## 5. Correction is separate from the blur model

The active correction kernel is

```text
K = 2I - PSF
```

where `I` is the identity kernel. This is a normalized spatial unsharp correction. Runtime strength is applied once in the WebGL shader by blending original and corrected luminance. Keeping strength out of cached kernel generation avoids stale kernels and gives the user-facing control one consistent meaning.

[`wiener.ts`](../src/renderer/lib/optics/wiener.ts) contains a separate regularized inverse-filter experiment. It is retained as research code and is not an active runtime control.

## 6. The guided acuity workflow is not refraction

The guided workflow includes a monotonic Snellen-to-sphere mapping so a user without a known prescription can explore the interface. That table is a product prototype heuristic. It is not a validated refraction algorithm.

Published work shows why the distinction is important. Visual acuity and refractive error are related at a population level, but one does not uniquely determine the other for an individual. In the PERK study, the same one-diopter refractive-error ranges contained visual acuities spanning several Snellen lines, and similar acuities could occur across multiple diopters of refractive error.

Reference:

- V. R. Santos et al., "Relationship between refractive error and visual acuity in the Prospective Evaluation of Radial Keratotomy (PERK) Study," Archives of Ophthalmology, 1987. [PubMed](https://pubmed.ncbi.nlm.nih.gov/3800751/) and [DOI](https://doi.org/10.1001/archopht.1987.01060010092038)

For that reason, Refract treats a known professional prescription as the stronger input path and labels guided estimates as heuristic.

## 7. What the current tests establish

The automated numerical checks establish engineering properties of the implementation, including normalization, finite outputs, directional response, identity behavior for neutral prescriptions, live-kernel bounds, physical-input guards, prescription normalization, correction-strength semantics, and gaze-smoother stability.

They do not establish clinical effectiveness, visual-acuity improvement, equivalence to corrective lenses, or population-level safety. User testing in this repository is exploratory and is presented separately from the numerical verification.

## 8. Stronger future validation

The most valuable next experiments are measurements rather than additional controls:

- record frame time and end-to-end correction latency on defined hardware
- repeat gaze calibration under controlled camera and lighting conditions and report screen-space error distributions
- compare Gaussian and inverse-filter variants against predefined artifact and readability criteria
- test sensitivity to viewing distance, screen scale, pupil assumptions, and head movement
- define success criteria before collecting any further human feedback

Until those measurements exist, the repository keeps its claims at the level supported by the current prototype.
