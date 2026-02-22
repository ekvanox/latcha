import type { Challenge, GeneratorConfig, ChallengeImage } from "../types.js";
import { BaseGenerator } from "./base.js";
import { shuffle } from "../utils/random.js";
import { createCanvas } from "canvas";
import { fal } from "@fal-ai/client";
import sharp from "sharp";

const SIZE = 512;
const UPPERCASE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GRID_CELLS = 9;

const ENVIRONMENT_PROMPTS = [
  "a dense urban street market with layered shop signs, awnings, and crowds",
  "a packed library aisle with bookshelves, labels, and reading tables",
  "a supermarket produce section with stacked crates, price tags, and signage",
  "an airport departure hall with display boards, queues, and gate signs",
  "a shipping container yard with stacked containers, cranes, and lane markings",
  "a factory assembly line with repeating machinery, warning stripes, and tools",
  "a train station platform with timetable boards, pillars, and tracks",
  "a downtown crosswalk at rush hour with road markings, billboards, and traffic",
  "a botanical greenhouse with grid-like glass panels, dense plants, and pathways",
  "a warehouse interior with pallet stacks, barcode labels, and shelving rows",
  "a university lecture hall with seat rows, notes, and projection screens",
  "a construction site with scaffolding grids, caution tape, and equipment",
  "a newsroom floor with desk clusters, monitors, cables, and wall screens",
  "a subway map wall mural with intersecting lines, icons, and station labels",
  "a city alley full of posters, utility pipes, vents, and textured walls",
  "an autumn forest trail with layered branches, leaves, trunks, and dappled light",
];

const PROMPT_STYLE_SUFFIX =
  "detailed, high texture, visually rich, masterpiece";

const COMMON_FONTS = ["Arial"];

const NOISE_CONFIG = {
  darkenProbability: 0.26,
  darkenMin: 18,
  darkenMax: 130,
  alphaDropProbability: 0.08,
  alphaScaleMin: 0.25,
  alphaScaleMax: 0.72,
  erasureStrokeCount: 12,
  erasureLineWidthMin: 1.2,
  erasureLineWidthMax: 3.4,
  erasureAlphaMin: 0.12,
  erasureAlphaMax: 0.3,
};

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomInRange(min, max));
}

function extractImageUrl(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error(
      "Unexpected response shape from fal: data is not an object.",
    );
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.image_url === "string") return obj.image_url;
  if (typeof obj.output_url === "string") return obj.output_url;
  if (typeof obj.url === "string") return obj.url;

  if (Array.isArray(obj.images) && obj.images.length > 0) {
    const first = obj.images[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object") {
      const firstObj = first as Record<string, unknown>;
      if (typeof firstObj.url === "string") return firstObj.url;
      if (typeof firstObj.image_url === "string") return firstObj.image_url;
    }
  }

  if (obj.image && typeof obj.image === "object") {
    const imageObj = obj.image as Record<string, unknown>;
    if (typeof imageObj.url === "string") return imageObj.url;
    if (typeof imageObj.image_url === "string") return imageObj.image_url;
  }

  throw new Error(
    `Could not find an output image URL in response: ${JSON.stringify(data)}`,
  );
}

/**
 * Renders a 512×512 control image.
 * If `character` is provided, draws it as a white glyph on black with noise.
 * If null, returns a solid black image (blank mask for non-letter cells).
 */
function renderControlImage(character: string | null): Buffer {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  if (character === null) {
    return canvas.toBuffer("image/png");
  }

  const fontFamily = COMMON_FONTS[0]!;
  const fontSize = randomInt(260, 410);

  const glyphCanvas = createCanvas(SIZE, SIZE);
  const glyphCtx = glyphCanvas.getContext("2d");
  glyphCtx.fillStyle = "#fff";
  glyphCtx.textAlign = "left";
  glyphCtx.textBaseline = "alphabetic";
  glyphCtx.font = `bold ${fontSize}px "${fontFamily}", sans-serif`;

  const metrics = glyphCtx.measureText(character);
  const charWidth = metrics.width;
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.75;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25;
  const margin = 20;

  const minX = margin;
  const maxX = Math.max(minX, SIZE - charWidth - margin);
  const minY = ascent + margin;
  const maxY = Math.max(minY, SIZE - descent - margin);

  const x = randomInRange(minX, maxX);
  const y = randomInRange(minY, maxY);

  glyphCtx.fillText(character, x, y);

  // Apply noise to the glyph
  const imageData = glyphCtx.getImageData(0, 0, SIZE, SIZE);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    if (Math.random() < NOISE_CONFIG.darkenProbability) {
      const darken = randomInt(NOISE_CONFIG.darkenMin, NOISE_CONFIG.darkenMax);
      data[i] = Math.max(0, data[i]! - darken);
      data[i + 1] = Math.max(0, data[i + 1]! - darken);
      data[i + 2] = Math.max(0, data[i + 2]! - darken);
    }
    if (Math.random() < NOISE_CONFIG.alphaDropProbability) {
      data[i + 3] = Math.floor(
        alpha *
          randomInRange(NOISE_CONFIG.alphaScaleMin, NOISE_CONFIG.alphaScaleMax),
      );
    }
  }
  glyphCtx.putImageData(imageData, 0, 0);

  // Erasure strokes
  glyphCtx.save();
  glyphCtx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < NOISE_CONFIG.erasureStrokeCount; i++) {
    glyphCtx.beginPath();
    glyphCtx.lineWidth = randomInRange(
      NOISE_CONFIG.erasureLineWidthMin,
      NOISE_CONFIG.erasureLineWidthMax,
    );
    glyphCtx.strokeStyle = `rgba(0, 0, 0, ${randomInRange(NOISE_CONFIG.erasureAlphaMin, NOISE_CONFIG.erasureAlphaMax)})`;
    glyphCtx.moveTo(randomInRange(0, SIZE), randomInRange(0, SIZE));
    glyphCtx.lineTo(randomInRange(0, SIZE), randomInRange(0, SIZE));
    glyphCtx.stroke();
  }
  glyphCtx.restore();

  ctx.drawImage(glyphCanvas, 0, 0);
  return canvas.toBuffer("image/png");
}

async function generateCellImage(
  character: string | null,
  prompt: string,
  conditioningScale: number,
): Promise<ChallengeImage> {
  const controlPng = renderControlImage(character);
  const controlBlob = new Blob([Uint8Array.from(controlPng)], {
    type: "image/png",
  });
  const controlImageUrl = await fal.storage.upload(controlBlob);

  const result = await fal.subscribe("fal-ai/illusion-diffusion", {
    input: {
      prompt,
      image_url: controlImageUrl,
      controlnet_conditioning_scale: conditioningScale,
    },
    logs: false,
  });

  const outputUrl = extractImageUrl(result.data);

  const res = await fetch(outputUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to download output image: ${res.status} ${res.statusText}`,
    );
  }
  const outputBuffer = Buffer.from(await res.arrayBuffer());
  const resized = await sharp(outputBuffer).resize(256, 256).webp().toBuffer();

  return {
    data: resized,
    mimeType: "image/webp",
    width: 256,
    height: 256,
  };
}

export class IllusionDiffusionGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: "illusion-diffusion",
    name: "Illusion Diffusion",
    description:
      "A 3×3 grid of AI-generated images where 2–5 cells hide a letter. Select all cells containing a hidden letter.",
    format: "select-all",
    difficulty: "hard",
  };

  async generate(): Promise<Challenge> {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      throw new Error(
        "FAL_KEY environment variable is required for illusion-diffusion generator.",
      );
    }
    fal.config({ credentials: falKey });

    const shell = this.createChallengeShell();
    const conditioningScale = Number(
      process.env.CONTROLNET_CONDITIONING_SCALE ?? "1",
    );

    // Pick how many cells will have letters (2–5)
    const letterCount = randomInt(2, 6);

    // Pick which cell indices (1-based) will have letters
    const allCellIndices = Array.from({ length: GRID_CELLS }, (_, i) => i + 1);
    const shuffledIndices = shuffle(allCellIndices);
    const letterCellIndices = shuffledIndices.slice(0, letterCount).sort((a, b) => a - b);
    const letterCellSet = new Set(letterCellIndices);

    // Assign a random letter to each letter cell
    const alphabet = UPPERCASE_ALPHABET.split("");
    const shuffledAlphabet = shuffle(alphabet);
    const cellLetters: Record<number, string> = {};
    for (let i = 0; i < letterCellIndices.length; i++) {
      cellLetters[letterCellIndices[i]!] = shuffledAlphabet[i]!;
    }

    // Pick a single environment prompt for all cells (visual coherence)
    const environmentPrompt = ENVIRONMENT_PROMPTS[randomInt(0, ENVIRONMENT_PROMPTS.length)]!;
    const prompt = `${environmentPrompt}, ${PROMPT_STYLE_SUFFIX}`;

    // Generate all 9 cells sequentially
    const images: ChallengeImage[] = [];
    for (let cell = 1; cell <= GRID_CELLS; cell++) {
      const character = letterCellSet.has(cell) ? cellLetters[cell]! : null;
      process.stdout.write(`  [illusion-diffusion] cell ${cell}/${GRID_CELLS} (${character ?? "blank"})...\n`);
      const image = await generateCellImage(character, prompt, conditioningScale);
      images.push(image);
    }

    // correctAnswer: sorted array of 1-based cell index strings
    const correctAnswer = letterCellIndices.map(String);

    return {
      ...shell,
      images,
      question: "Select all images containing a hidden letter.",
      correctAnswer,
      metadata: {
        format: "select-all",
        cellCount: GRID_CELLS,
        letterCount,
        letterCellIndices,
        cellLetters,
        environmentPrompt,
        prompt,
        conditioningScale,
      },
    };
  }
}
