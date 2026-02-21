import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createCanvas } from "canvas";
import { config as loadDotenv } from "dotenv";
import { fal } from "@fal-ai/client";

const repoRoot = resolve(process.cwd());

loadDotenv({ path: resolve(repoRoot, ".env") });
loadDotenv({ path: resolve(repoRoot, ".env.local"), override: false });

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) {
  throw new Error("FAL_KEY is not set. Add it to your environment or .env file.");
}

fal.config({ credentials: FAL_KEY });

const SIZE = 512;
const GENERATIONS_ROOT = resolve(repoRoot, "generations");
const GENERATION_TYPE = "illusion-generations";
const TYPE_DIR = resolve(GENERATIONS_ROOT, GENERATION_TYPE);
const CHALLENGE_DIR = resolve(TYPE_DIR, "challenge");
const METADATA_PATH = resolve(TYPE_DIR, "metadata.json");
const UPPERCASE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ENVIRONMENT_PROMPTS = [
  "a dense urban street market with layered shop signs, awnings, and crowds",
  "a neon-lit subway station with tiled walls, route maps, and commuters",
  "a packed library aisle with bookshelves, labels, and reading tables",
  "a supermarket produce section with stacked crates, price tags, and signage",
  "an airport departure hall with display boards, queues, and gate signs",
  "a shipping container yard with stacked containers, cranes, and lane markings",
  "a server room corridor with cable trays, blinking LEDs, and rack labels",
  "a factory assembly line with repeating machinery, warning stripes, and tools",
  "a train station platform with timetable boards, pillars, and tracks",
  "a downtown crosswalk at rush hour with road markings, billboards, and traffic",
  "a botanical greenhouse with grid-like glass panels, dense plants, and pathways",
  "a warehouse interior with pallet stacks, barcode labels, and shelving rows",
  "a university lecture hall with seat rows, notes, and projection screens",
  "a construction site with scaffolding grids, caution tape, and equipment",
  "a data center operations room with monitors, consoles, and status lights",
  "a newsroom floor with desk clusters, monitors, cables, and wall screens",
  "a busy port terminal with stacked cargo, gantry cranes, and painted markings",
  "a subway map wall mural with intersecting lines, icons, and station labels",
  "a city alley full of posters, utility pipes, vents, and textured walls",
  "an autumn forest trail with layered branches, leaves, trunks, and dappled light",
] as const;
const PROMPT_STYLE_SUFFIX = "detailed, high texture, visually rich, masterpiece";
const COMMON_FONTS = [
  "Arial",
  "Helvetica",
  "Verdana",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
] as const;

const conditioningScale = Number(process.env.CONTROLNET_CONDITIONING_SCALE ?? "0.8");

interface StoredChallengeEntry {
  challengeId: string;
  imageUuid: string;
  imageFileName: string;
  answerAlternatives: string[];
  correctAlternative: string;
  generationTimeMs: number;
  generationTimestamp: string;
  question: string;
  generationSpecificMetadata: Record<string, unknown>;
}

interface GenerationMetadataFile {
  schemaVersion: 1;
  generationType: string;
  updatedAt: string;
  challenges: StoredChallengeEntry[];
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickRandomFont(): (typeof COMMON_FONTS)[number] {
  const idx = Math.floor(Math.random() * COMMON_FONTS.length);
  return COMMON_FONTS[idx] ?? "Arial";
}

function pickRandomCapitalLetter(): string {
  const offset = Math.floor(Math.random() * UPPERCASE_ALPHABET.length);
  return UPPERCASE_ALPHABET[offset] ?? "A";
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy;
}

function buildCharacterAlternatives(correctCharacter: string): {
  answerOptions: string[];
  correctIndex: number;
  otherPotentialCharacters: string[];
} {
  const remaining = shuffled(
    UPPERCASE_ALPHABET.split("").filter((ch) => ch !== correctCharacter),
  );

  const answerOptions = shuffled([correctCharacter, ...remaining.slice(0, 3)]);
  const correctIndex = answerOptions.indexOf(correctCharacter);
  const otherPotentialCharacters = remaining.slice(3, 7);

  return {
    answerOptions,
    correctIndex,
    otherPotentialCharacters,
  };
}

function pickRandomEnvironmentPrompt(): string {
  const idx = Math.floor(Math.random() * ENVIRONMENT_PROMPTS.length);
  return ENVIRONMENT_PROMPTS[idx] ?? ENVIRONMENT_PROMPTS[0];
}

function extractImageUrl(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected response shape from fal: data is not an object.");
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

  throw new Error(`Could not find an output image URL in response: ${JSON.stringify(data)}`);
}

async function downloadImageToFile(url: string, filePath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download image from ${url}: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));
}

async function readMetadata(): Promise<GenerationMetadataFile> {
  try {
    const metadataRaw = await readFile(METADATA_PATH, "utf8");
    const parsed = JSON.parse(metadataRaw) as GenerationMetadataFile;

    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.challenges)) {
      throw new Error("Invalid metadata shape");
    }

    return {
      schemaVersion: 1,
      generationType: GENERATION_TYPE,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      challenges: parsed.challenges,
    };
  } catch {
    return {
      schemaVersion: 1,
      generationType: GENERATION_TYPE,
      updatedAt: new Date().toISOString(),
      challenges: [],
    };
  }
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  await mkdir(CHALLENGE_DIR, { recursive: true });

  const controlImageId = randomUUID();
  const outputImageId = randomUUID();

  const controlPath = resolve(CHALLENGE_DIR, `${controlImageId}.png`);
  const outputPath = resolve(CHALLENGE_DIR, `${outputImageId}.png`);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);

  const glyphCanvas = createCanvas(SIZE, SIZE);
  const glyphCtx = glyphCanvas.getContext("2d");

  const character = pickRandomCapitalLetter();
  const { answerOptions, correctIndex, otherPotentialCharacters } =
    buildCharacterAlternatives(character);
  const environmentPrompt = pickRandomEnvironmentPrompt();
  const prompt = `${environmentPrompt}, ${PROMPT_STYLE_SUFFIX}`;
  const fontFamily = pickRandomFont();
  const fontSize = Math.floor(randomInRange(260, 410));
  glyphCtx.fillStyle = "#fff";
  glyphCtx.textAlign = "left";
  glyphCtx.textBaseline = "alphabetic";
  glyphCtx.font = `bold ${fontSize}px \"${fontFamily}\", sans-serif`;

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

  const noiseConfig = {
    darkenProbability: 0.36,
    darkenMin: 18,
    darkenMax: 130,
    alphaDropProbability: 0.11,
    alphaScaleMin: 0.25,
    alphaScaleMax: 0.72,
    erasureStrokeCount: 12,
    erasureLineWidthMin: 1.2,
    erasureLineWidthMax: 3.4,
    erasureAlphaMin: 0.12,
    erasureAlphaMax: 0.3,
  };

  glyphCtx.fillText(character, x, y);

  const imageData = glyphCtx.getImageData(0, 0, SIZE, SIZE);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) continue;

    if (Math.random() < noiseConfig.darkenProbability) {
      const darken = Math.floor(randomInRange(noiseConfig.darkenMin, noiseConfig.darkenMax));
      data[i] = Math.max(0, data[i] - darken);
      data[i + 1] = Math.max(0, data[i + 1] - darken);
      data[i + 2] = Math.max(0, data[i + 2] - darken);
    }

    if (Math.random() < noiseConfig.alphaDropProbability) {
      data[i + 3] = Math.floor(
        alpha * randomInRange(noiseConfig.alphaScaleMin, noiseConfig.alphaScaleMax),
      );
    }
  }
  glyphCtx.putImageData(imageData, 0, 0);

  glyphCtx.save();
  glyphCtx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < noiseConfig.erasureStrokeCount; i++) {
    glyphCtx.beginPath();
    glyphCtx.lineWidth = randomInRange(
      noiseConfig.erasureLineWidthMin,
      noiseConfig.erasureLineWidthMax,
    );
    glyphCtx.strokeStyle = `rgba(0, 0, 0, ${randomInRange(noiseConfig.erasureAlphaMin, noiseConfig.erasureAlphaMax)})`;
    glyphCtx.moveTo(randomInRange(0, SIZE), randomInRange(0, SIZE));
    glyphCtx.lineTo(randomInRange(0, SIZE), randomInRange(0, SIZE));
    glyphCtx.stroke();
  }
  glyphCtx.restore();

  ctx.drawImage(glyphCanvas, 0, 0);

  const controlPng = canvas.toBuffer("image/png");
  await writeFile(controlPath, controlPng);
  console.log(`Saved control image: ${controlPath}`);
  console.log(
    `Character settings → char: ${character}, font: ${fontFamily}, size: ${fontSize}, x: ${x.toFixed(1)}, y: ${y.toFixed(1)}, controlnet_conditioning_scale: ${conditioningScale}`,
  );
  console.log(
    `Answer options → ${answerOptions.join(", ")} (correct index: ${correctIndex}, other potential characters: ${otherPotentialCharacters.join(", ")})`,
  );
  console.log(`Scene prompt → ${prompt}`);

  const controlBytes = Uint8Array.from(controlPng);
  const controlBlob = new Blob([controlBytes], { type: "image/png" });
  const controlImageUrl = await fal.storage.upload(controlBlob);
  console.log(`Control image URL: ${controlImageUrl}`);

  const result = await fal.subscribe("fal-ai/illusion-diffusion", {
    input: {
      prompt,
      image_url: controlImageUrl,
      controlnet_conditioning_scale: conditioningScale,
    },
    logs: true,
  });

  const outputUrl = extractImageUrl(result.data);
  await downloadImageToFile(outputUrl, outputPath);

  const metadata = await readMetadata();

  metadata.challenges.push({
    challengeId: randomUUID(),
    imageUuid: outputImageId,
    imageFileName: `${outputImageId}.png`,
    answerAlternatives: answerOptions,
    correctAlternative: answerOptions[correctIndex] ?? character,
    generationTimeMs: Date.now() - startedAt,
    generationTimestamp: new Date().toISOString(),
    question: "Which capital letter is hidden in this image?",
    generationSpecificMetadata: {
      prompt,
      environmentPrompt,
      controlnetConditioningScale: conditioningScale,
      character: {
        correct: character,
        answerOptions,
        correctIndex,
        correctOption: answerOptions[correctIndex],
        otherPotentialCharacters,
      },
      font: {
        family: fontFamily,
        size: fontSize,
      },
      position: {
        x,
        y,
        margin,
        bounds: { minX, maxX, minY, maxY },
        metrics: { charWidth, ascent, descent },
      },
      noise: noiseConfig,
      imageRefs: [
        {
          uuid: outputImageId,
          fileName: `${outputImageId}.png`,
          mimeType: "image/png",
          role: "challenge-output",
          outputUrl,
        },
        {
          uuid: controlImageId,
          fileName: `${controlImageId}.png`,
          mimeType: "image/png",
          role: "control",
          uploadedUrl: controlImageUrl,
        },
      ],
    },
  });

  metadata.updatedAt = new Date().toISOString();
  await writeFile(METADATA_PATH, JSON.stringify(metadata, null, 2), "utf8");

  console.log(`Saved output image: ${outputPath}`);
  console.log(`Saved metadata file: ${METADATA_PATH}`);
  console.log(`Output image URL: ${outputUrl}`);
  console.log(
    "Tip: default scale is 0.8. If the character is too hidden, try CONTROLNET_CONDITIONING_SCALE=1.2.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
