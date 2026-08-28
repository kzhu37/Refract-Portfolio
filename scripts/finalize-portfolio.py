from pathlib import Path


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    text = path.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path_str}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


readme_browser = """<p align="center">
  <img src="docs/media/refract-correction-demo.gif" alt="Refract browser demo showing the real localized WebGL2 correction region moving across detailed content and switching to a directional prescription preset" width="94%">
</p>
<p align="center"><sub><strong>Live renderer evidence:</strong> captured from the real browser build. The pointer moves the localized correction region, the demo switches to a directional prescription, and the original source is briefly revealed for comparison.</sub></p>"""

readme_desktop = """<p align="center">
  <img src="docs/media/refract-desktop-overlay.gif" alt="Refract Electron desktop prototype applying the real localized correction overlay to a controlled high-detail desktop scene as the system cursor moves" width="94%">
</p>
<p align="center"><sub><strong>Desktop system proof:</strong> captured from the real Electron build against a controlled high-detail desktop scene. The actual global shortcut enables the transparent correction overlay, then the system cursor moves the localized region across the captured desktop. A deliberately strong valid model profile makes the effect visible; no magnification or simulated correction is added.</sub></p>"""

replace_once("README.md", readme_browser, readme_desktop)

browser_heading = """## Interactive browser demo

The public demo reuses Refract's browser-compatible PSF generation, correction-kernel generation, WebGL utilities, GLSL shader, and optional iris tracker."""

browser_with_proof = """## Interactive browser demo

<p align="center">
  <img src="docs/media/refract-correction-demo.gif" alt="Refract browser demo showing the real localized WebGL2 correction region moving across detailed content and switching to a directional prescription preset" width="94%">
</p>
<p align="center"><sub><strong>Public renderer proof:</strong> captured from the real browser adaptation. The pointer moves the localized correction region, the demo switches to a directional prescription, and the original source is briefly revealed for comparison.</sub></p>

The public demo reuses Refract's browser-compatible PSF generation, correction-kernel generation, WebGL utilities, GLSL shader, and optional iris tracker."""

replace_once("README.md", browser_heading, browser_with_proof)

replace_once(
    "src/main/index.ts",
    "    body: enabled ? 'Vision correction enabled' : 'Vision correction disabled'",
    "    body: enabled ? 'Display correction enabled' : 'Display correction disabled'",
)
replace_once(
    "src/main/tray/tray-manager.ts",
    "    this.tray.setToolTip('Refract: Vision Correction')",
    "    this.tray.setToolTip('Refract: Display Correction')",
)
replace_once(
    "src/main/tray/tray-manager.ts",
    "        label: 'Eye Exam',",
    "        label: 'Guided Vision Check',",
)
replace_once(
    "src/renderer/pages/Home.tsx",
    "    label: 'Exam',\n    description: 'Start a guided vision check',",
    "    label: 'Guided Check',\n    description: 'Explore the heuristic vision workflow',",
)
replace_once(
    "src/renderer/pages/Exam.tsx",
    '            <p className="text-body-sm mb-4">Exam data incomplete.</p>',
    '            <p className="text-body-sm mb-4">Guided check data incomplete.</p>',
)

help_path = Path("src/renderer/pages/Help.tsx")
help = help_path.read_text()

faq_start = help.index("const FAQS = [")
faq_end_marker = "\n]\n\nfunction Faq"
faq_end = help.index(faq_end_marker, faq_start) + 2
new_faq = r"""const FAQS = [
  {
    q: 'Do I need my glasses while using Refract?',
    a: 'Refract is not a replacement for glasses or contacts. Keep using the vision correction recommended by your eye-care professional for ordinary use. If you explore the prototype without it, treat the result only as an experiment and stop if the display feels uncomfortable.',
  },
  {
    q: 'What does "Plano" mean on my prescription?',
    a: '"Plano" means zero sphere power. It does not mean the eye has no other vision needs, since cylinder, add, and other factors can still matter.',
  },
  {
    q: 'What if my two eyes have different prescriptions?',
    a: 'Refract stores separate OD and OS model inputs, but the current screen-level renderer applies one selected eye profile at a time. That is a software limitation, not a statement about what either eye medically needs.',
  },
  {
    q: 'Why does my prescription have several numbers?',
    a: 'Sphere, cylinder, and axis describe parts of refractive correction. Refract uses those values as inputs to an approximate display model, but they do not fully describe the eye or its optics.',
  },
  {
    q: 'Is Refract validated for long periods of use?',
    a: 'No. Refract has not been clinically validated for long-term use or safety. The prototype changes displayed pixels, but strong processing can feel harsh or disorienting. Use conservative settings, stop if the display feels uncomfortable, and do not treat Refract as vision care.',
  },
  {
    q: 'What is the difference between myopia and hyperopia?',
    a: 'Myopia is commonly associated with minus sphere values and difficulty focusing distant detail without correction. Hyperopia is commonly associated with plus sphere values and can increase focusing demands, especially at closer distances. Individual vision varies.',
  },
]"""
help = help[:faq_start] + new_faq + help[faq_end:]

replacements = [
    (
        'description="No confusing doctor words here. We explain everything in plain, simple language, as if you\'re hearing it for the first time."',
        'description="A plain-language guide to the prescription terms and prototype controls Refract uses. These explanations are educational and are not medical advice."',
    ),
    (
        'tag="How blurry your basic vision is"',
        'tag="The spherical power recorded in a prescription"',
    ),
    (
        "Sphere is the main number. It tells us how much your eyes need help to see clearly.",
        "Sphere is the main spherical refractive value in a glasses prescription. Refract uses it as one input to its approximate display model.",
    ),
    (
        "Minus numbers = Nearsighted",
        "Minus sphere values are commonly used for myopia",
    ),
    (
        "You see close things (like your phone) just fine, but faraway things (like a road sign) look fuzzy.",
        "Myopia commonly makes distant detail harder to focus without appropriate correction. Individual vision varies.",
    ),
    (
        "Plus numbers = Farsighted",
        "Plus sphere values are commonly used for hyperopia",
    ),
    (
        "Faraway things are usually okay, but up-close reading or screens may be the hard part.",
        "Hyperopia can affect focusing demands, especially at closer distances, but the experience varies with age and accommodation.",
    ),
    (
        'Zero or "Plano" = No correction needed',
        'Zero or "Plano" = zero sphere power',
    ),
    (
        "That eye is perfect at basic focusing. Lucky!",
        "This only describes the sphere field. Other prescription values or visual factors can still matter.",
    ),
    (
        "Bigger number (ignoring + or -) = stronger prescription = thicker glasses lens.",
        "A larger absolute sphere value means more spherical lens power. It does not by itself describe overall vision or lens thickness.",
    ),
    (
        'tag="Whether your eye is round like a ball or oval like a football"',
        'tag="The cylindrical lens power used to correct astigmatism"',
    ),
    (
        """Cylinder is all about <strong style={{ color: T.text }}>astigmatism</strong>, a long word that just means
            "your eye isn't a perfect round ball shape.\"""",
        """Cylinder records the amount of <strong style={{ color: T.text }}>cylindrical correction</strong> used for astigmatism. The familiar ball-versus-football analogy is only a rough teaching picture of directional optical differences.""",
    ),
    (
        "Nice round eye, no astigmatism",
        "No cylinder power is specified here",
    ),
    (
        "Oval-shaped eye with astigmatism",
        "Cylinder correction is specified",
    ),
    (
        'tag="Which direction your eye is oval-shaped (only matters if you have cylinder)"',
        'tag="Orientation of the cylindrical correction"',
    ),
    (
        'Axis is a number from <strong style={{ color: T.text }}>1 to 180</strong>. Think of it like a compass angle.',
        'Axis is an angle from <strong style={{ color: T.text }}>1 to 180 degrees</strong> that specifies the orientation of cylinder correction in a prescription.',
    ),
    (
        "The axis angle tells Refract exactly which direction to apply the correction so it lines up perfectly with how your eye is shaped.",
        "Refract uses the axis to rotate the directional component of its approximate point spread function in display space.",
    ),
    (
        "Your glasses or contacts work by physically bending light before it hits your eye. Refract does something similar, but digitally:",
        "Glasses and contacts alter light before it reaches the eye. Refract explores a different idea: preprocessing displayed content using an approximate model. It is not a digital equivalent of a corrective lens:",
    ),
    (
        r"{ n: '1', title: 'Takes your numbers', body: 'Refract reads your sphere, cylinder, and axis to understand the exact shape of your eye\'s blur.' },",
        r"{ n: '1', title: 'Reads model inputs', body: 'Refract combines sphere, cylinder, axis, viewing distance, screen scale, and a pupil assumption as inputs to an approximate display model.' },",
    ),
    (
        r"""{ n: '2', title: 'Calculates the correction', body: 'It works out a mathematical "sharpening filter" that is the opposite of your eye\'s blur, like a lens in software.' },""",
        r"{ n: '2', title: 'Builds modeled blur and correction', body: 'The active path constructs a rotated anisotropic Gaussian point spread function, then derives a bounded spatial correction kernel from that model.' },",
    ),
    (
        r"{ n: '3', title: 'Applies it to your screen', body: 'The correction is applied in real-time to what your screen shows, making it look clear even without glasses.' },",
        r"{ n: '3', title: 'Applies localized display processing', body: 'WebGL2 blends the correction around the current point of attention while leaving the rest of the desktop untouched. A visible effect is not proof of clinical effectiveness.' },",
    ),
    (
        "You can find it on any glasses or contact lens box, or ask your eye doctor for a copy. Alternatively, use the <strong style={{ color: T.text }}>Eye Exam</strong> feature in Refract to get an estimate!",
        "Use professionally measured values when you have them. The <strong style={{ color: T.text }}>Guided Vision Check</strong> can create heuristic prototype inputs for exploration, but it does not estimate a prescription.",
    ),
]

for old, new in replacements:
    if old not in help:
        raise SystemExit(f"Expected Help copy not found: {old[:120]!r}")
    help = help.replace(old, new, 1)

help_path.write_text(help)

ci_path = Path(".github/workflows/ci.yml")
ci = ci_path.read_text()

old_collect = """          collect('docs', new Set(['.md', '.svg']))
          collect('web-demo', new Set(['.ts', '.tsx', '.css', '.html']))
"""
new_collect = """          collect('docs', new Set(['.md', '.svg']))
          collect('web-demo', new Set(['.ts', '.tsx', '.css', '.html']))
          collect('src/renderer/pages', new Set(['.ts', '.tsx']))
          collect('src/renderer/components', new Set(['.ts', '.tsx']))
          publicFiles.push('src/main/index.ts', 'src/main/tray/tray-manager.ts')
"""
if old_collect not in ci:
    raise SystemExit("Could not locate CI public-file collection block")
ci = ci.replace(old_collect, new_collect, 1)

shader_marker = "          const shader = fs.readFileSync('src/overlay/lib/webgl/correction-shader.ts', 'utf8')"
if shader_marker not in ci:
    raise SystemExit("Could not locate CI shader marker")

desktop_guard = """          if (!readme.includes('docs/media/refract-desktop-overlay.gif')) {
            console.error('README is missing the authentic Electron desktop overlay proof')
            process.exit(1)
          }

          const help = fs.readFileSync('src/renderer/pages/Help.tsx', 'utf8')
          const unsupportedHelpClaims = [
            /see it clearly without glasses/i,
            /eyes are completely safe/i,
            /exact shape of your eye/i,
            /making it look clear even without glasses/i,
            /Eye Exam<\\/strong> feature.*estimate/i,
          ]
          if (unsupportedHelpClaims.some((pattern) => pattern.test(help))) {
            console.error('Desktop Help copy contains an unsupported vision or safety claim')
            process.exit(1)
          }

          const desktopPresentation = [
            help,
            fs.readFileSync('src/main/index.ts', 'utf8'),
            fs.readFileSync('src/main/tray/tray-manager.ts', 'utf8'),
            fs.readFileSync('src/renderer/pages/Home.tsx', 'utf8'),
          ].join('\\n')
          if (/Refract: Vision Correction|Vision correction enabled|Vision correction disabled|label: 'Eye Exam'/i.test(desktopPresentation)) {
            console.error('Desktop presentation still contains clinical-sounding product labels')
            process.exit(1)
          }

"""
ci = ci.replace(shader_marker, desktop_guard + shader_marker, 1)
ci_path.write_text(ci)

roots = [
    Path("README.md"),
    Path("docs"),
    Path("web-demo"),
    Path("src/renderer/pages"),
    Path("src/renderer/components"),
    Path("src/main/index.ts"),
    Path("src/main/tray/tray-manager.ts"),
]
bad = []
for root in roots:
    if root.is_file():
        files = [root]
    else:
        files = [
            p for p in root.rglob("*")
            if p.suffix in {".md", ".svg", ".ts", ".tsx", ".css", ".html"}
        ]
    for path in files:
        text = path.read_text(errors="ignore")
        if "\u2014" in text or "\u2013" in text:
            bad.append(str(path))

if bad:
    raise SystemExit("Long dash characters found in: " + ", ".join(sorted(set(bad))))

print("Portfolio presentation edits completed and long dash audit passed.")
