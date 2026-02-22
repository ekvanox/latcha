# Latcha — The LLM-Proof CAPTCHA

> **HackEurope Stockholm 2025 submission** 🏆

Latcha is a next-generation CAPTCHA that exploits a fundamental gap between human and artificial intelligence: **humans are extraordinarily good at recognising faces**, even when they are subtly hidden inside another image. State-of-the-art multimodal LLMs are not.

![Latcha captcha](apps/web/public/captcha.png)

In each challenge, users see a 3 × 3 grid of AI-generated images and must identify which cells contain a hidden human face. The faces are embedded in a way that feels intuitive for people but consistently fools AI systems — making Latcha especially resistant to automated attacks.

---

## Why Latcha?

Modern bots have caught up with traditional CAPTCHAs. GPT-4o and similar models now solve reCAPTCHA v2 with ~80 % accuracy. Through our own benchmarking research we found that face-in-image challenges are a category where AI accuracy drops dramatically while human solve rates stay above **93 %** — that gap is what Latcha is built on.

|                            | Human     | AI (LLMs) |
| -------------------------- | --------- | --------- |
| Latcha face-grid challenge | **~93 %** | **0%**    |
| reCAPTCHA v2 (baseline)    | ~96 %     | ~80 %\*   |

<sub>\* Based on published benchmarks and internal evaluation runs.</sub>

---

## How it works

1. **Face sourcing** — Real human faces are sourced from [thispersondoesnotexist.com](https://thispersondoesnotexist.com), ensuring no real person's likeness is used.
2. **Background removal** — Each face is processed through `fal-ai/bria/background/remove` to isolate the subject on a clean greyscale control map.
3. **Illusion diffusion** — The control map feeds into `fal-ai/illusion-diffusion` (a ControlNet-driven model) which embeds the face into a richly textured AI-generated scene.
4. **Grid assembly** — 2–5 of the 9 grid cells receive an embedded face; the rest are blank control images rendered with the same scene prompt — ensuring visual coherence.
5. **Server-side verification** — The user's selection is checked against the signed, server-stored answer. A verification token is issued on success.
6. **Adaptive difficulty** — The ControlNet `conditioning_scale` parameter controls how strongly the face is embedded, letting you tune CAPTCHA difficulty without changing any other logic.

---

## Repository layout

```
latcha/
├── apps/
│   └── web/                  # Next.js marketing + dashboard site (latcha.dev)
├── packages/
│   ├── core/                 # Challenge generation, verification, types
│   │   └── src/
│   │       ├── generators/   # All CAPTCHA generator implementations
│   │       │   ├── illusion-faces.ts      ← primary face-in-image challenge
│   │       │   ├── grid-overlay.ts
│   │       │   ├── proximity-text.ts
│   │       │   ├── partial-occlusion.ts
│   │       │   ├── illusory-contours.ts
│   │       │   ├── abutting-grating.ts
│   │       │   └── emerging-image.ts
│   │       ├── challenge/    # Builder + server-side verifier
│   │       ├── types.ts
│   │       └── index.ts
│   ├── react/                # @latcha/react — drop-in React widget (npm)
│   └── eval/                 # LLM evaluation harness
├── scripts/
│   ├── generate-and-upload.ts  # Batch-generate challenges and store in Supabase
│   ├── supabase-eval.ts        # Run LLM benchmark against stored challenges
│   └── illusion-faces-eval.ts  # Targeted face-challenge benchmark
└── generations/
    └── face-sources/           # Source face images (add your own JPG/PNG/WebP)
```

---

## Packages

### `@latcha/core`

The engine. Provides generators, the challenge builder, and server-side verification.

```ts
import { buildChallenge, verify } from "@latcha/core";

// Generate a challenge
const challenge = await buildChallenge("illusion-faces");

// Later, verify the user's answer
const result = await verify({
  challengeId: challenge.id,
  answer: ["1", "4", "7"],
});
```

**Generators shipped:**

| ID                  | Name              | Format           | Difficulty |
| ------------------- | ----------------- | ---------------- | ---------- |
| `illusion-faces`    | Illusion Faces    | select-all       | Hard       |
| `grid-overlay`      | Grid Overlay      | select-all       | Medium     |
| `proximity-text`    | Proximity Text    | multiple-choice  | Medium     |
| `partial-occlusion` | Partial Occlusion | select-one-image | Medium     |
| `illusory-contours` | Illusory Contours | multiple-choice  | Hard       |
| `abutting-grating`  | Abutting Grating  | select-one-image | Easy       |
| `emerging-image`    | Emerging Image    | select-one-image | Medium     |

### `@latcha/react`

Drop-in React widget. Requires no API key for basic usage.

```bash
npm install @latcha/react
```

```tsx
import { LatchaWidget } from "@latcha/react";

function ContactForm() {
  const [verified, setVerified] = useState(false);

  return (
    <form>
      <LatchaWidget onVerify={() => setVerified(true)} />
      <button type="submit" disabled={!verified}>
        Submit
      </button>
    </form>
  );
}
```

**Props:**

| Prop       | Type                      | Default                           | Description                      |
| ---------- | ------------------------- | --------------------------------- | -------------------------------- |
| `onVerify` | `(token: string) => void` | —                                 | Fires on successful verification |
| `onError`  | `(err: Error) => void`    | —                                 | Fires on network / API failure   |
| `apiBase`  | `string`                  | `"https://latcha.dev/api/latcha"` | Override for self-hosting        |
| `theme`    | `"light" \| "dark"`       | `"light"`                         | Widget colour scheme             |

---

## Getting started (development)

### Prerequisites

- Node.js ≥ 18
- [pnpm](https://pnpm.io) ≥ 10
- A [fal.ai](https://fal.ai) API key (for challenge generation)
- A [Supabase](https://supabase.com) project (for storing challenges)
- An [OpenRouter](https://openrouter.ai) API key (for LLM evaluation)

### Setup

```bash
git clone https://github.com/ekvanox/lacha.git
cd lacha

pnpm install

cp .env.example .env
# Fill in your keys in .env
```

### Environment variables

```env
FAL_KEY=                      # fal.ai key — required for generation
NEXT_PUBLIC_SUPABASE_URL=     # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_CHALLENGES_TABLE=captcha_challenges
OPENROUTER_API_KEY=           # For LLM evaluation scripts
```

### Run the web app

```bash
pnpm dev          # starts all packages + apps in watch mode
# or
pnpm --filter web dev
```

### Generate challenges

Add face source images (JPG / PNG / WebP) to `generations/face-sources/`, then:

```bash
pnpm generate     # generates challenges and uploads to Supabase
```

### Run LLM benchmarks

```bash
pnpm supabase-eval          # benchmark all challenge types against multiple LLMs
pnpm illusion-faces-eval    # benchmark only the face-in-image challenge
```

---

## Tech stack

| Layer            | Technology                                           |
| ---------------- | ---------------------------------------------------- |
| Web app          | Next.js (App Router), Tailwind CSS, shadcn/ui        |
| Core library     | TypeScript, Node.js                                  |
| Image processing | sharp, Canvas                                        |
| AI generation    | fal.ai (illusion-diffusion, bria background removal) |
| Storage          | Supabase (Postgres + Storage)                        |
| Hosting          | Vercel + Cloudflare                                  |
| Payments         | Stripe                                               |
| Build system     | Turborepo + pnpm workspaces                          |

---

## Live links

- **Landing page:** [latcha.dev](https://latcha.dev)
- **Dashboard / Demo:** [latcha.dev/dashboard](https://latcha.dev/dashboard)
- **Research:** [latcha.dev/research](https://latcha.dev/research)
- **Matcha Cafe demo:** [matcha-meadow-hub.lovable.app](https://matcha-meadow-hub.lovable.app)

---

## Related research

The following papers and articles informed Latcha's design and directly validate our core hypothesis — that visual illusions and image-in-image embedding create a reliable human-easy / AI-hard boundary.

---

### [Seeing Through the Mask: Rethinking Adversarial Examples for CAPTCHAs](https://arxiv.org/abs/2409.05558)

_arXiv 2409.05558 · 2024_

Demonstrates that adding semi-transparent masks over CAPTCHA images drops AI classifier accuracy by **more than 50 percentage points**, with robust vision-transformer models losing up to **80 pp**. The key insight is that changes which preserve semantic meaning for humans can catastrophically confuse even the strongest models — the same principle underlying Latcha's illusion-diffusion approach.

---

### [ASCIIEval: Benchmarking Models' Visual Perception in Text Strings via ASCII Art](https://arxiv.org/abs/2410.01733)

_arXiv 2410.01733 · 2024_

Reveals a **20+ percentage-point accuracy gap** between proprietary and open-source multimodal LLMs when recognising visual concepts embedded within character sequences. Models are highly sensitive to the representation length and struggle to fuse text and image modalities simultaneously. This aligns with Latcha's observation that LLMs fail at detecting structure hidden _within_ images, even when they can recognise both layers independently.

---

### [IllusionCAPTCHA: A CAPTCHA based on Visual Illusion](https://arxiv.org/abs/2502.05461)

_arXiv 2502.05461 · 2025_

The closest academic parallel to Latcha. IllusionCAPTCHA applies visual illusions to create challenges that fool LLMs **100 % of the time** in their evaluation, while achieving an **86.95 % first-attempt human pass rate**. Latcha extends this idea with a specific focus on embedded human faces — a category where the human cognitive advantage is especially pronounced — and couples it with a production-ready npm package and server-side verification pipeline.

---

### [Benchmarking Leading AI Agents Against CAPTCHAs — Roundtable Research](https://research.roundtable.ai/captcha-benchmarking/)

_Roundtable Research · 2025_

Real-world benchmark of Claude Sonnet, Gemini 2.5 Pro, and GPT-5 solving Google reCAPTCHA v2, finding **success rates between 28 % and 60 %** depending on the model and CAPTCHA type. These numbers underscore that even the weakest frontier model can now bypass traditional CAPTCHAs a material fraction of the time, motivating Latcha's fundamentally different approach.

---

## License

MIT

---

Made with ❤️ at **HackEurope Stockholm**
