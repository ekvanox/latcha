import type { Challenge, GeneratorConfig, ChallengeImage } from "../types.js";
import { BaseGenerator } from "./base.js";
import { shuffle } from "../utils/random.js";
import { fal } from "@fal-ai/client";
import sharp from "sharp";
import { readdir } from "node:fs/promises";
import { resolve, extname } from "node:path";

const SIZE = 512;
const GRID_CELLS = 9;
const FACE_SOURCES_DIR_NAME = "face-sources";

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

const DEFAULT_CONDITIONING_SCALE = 1.1;

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
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

async function loadFaceSourcePaths(repoRoot: string): Promise<string[]> {
  const facesDir = resolve(repoRoot, "generations", FACE_SOURCES_DIR_NAME);

  let entries: string[];
  try {
    entries = await readdir(facesDir);
  } catch {
    throw new Error(
      `illusion-faces: face-sources directory not found at ${facesDir}. ` +
        `Create the directory and add face image files (JPG/PNG/WebP).`,
    );
  }

  const imageFiles = entries.filter((f) =>
    SUPPORTED_EXTENSIONS.has(extname(f).toLowerCase()),
  );

  if (imageFiles.length === 0) {
    throw new Error(
      `illusion-faces: no image files found in ${facesDir}. ` +
        `Add JPG or PNG close-up face photos to this directory.`,
    );
  }

  return imageFiles.map((f) => resolve(facesDir, f));
}

async function renderFaceControlImage(faceFilePath: string): Promise<Buffer> {
  // Cover-fit the face to 512×512 and apply mild degradation to make AI
  // detection harder while keeping it visually perceivable by humans.
  const resized = await sharp(faceFilePath)
    .resize(SIZE, SIZE, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  const brightness = 0.88 + Math.random() * 0.12; // 0.88–1.0
  const blurSigma = 0.4 + Math.random() * 0.3; // 0.4–0.7

  return sharp(resized)
    .modulate({ brightness })
    .blur(blurSigma)
    .png()
    .toBuffer();
}

async function renderBlackControlImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

async function generateCellImage(
  controlPng: Buffer,
  prompt: string,
  conditioningScale: number,
): Promise<ChallengeImage> {
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

  return {
    data: outputBuffer,
    mimeType: "image/png",
    width: SIZE,
    height: SIZE,
  };
}

export class IllusionFacesGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: "illusion-faces",
    name: "Illusion Faces",
    description:
      "A 3×3 grid of AI-generated images where 2–5 cells hide a human face. Select all cells containing a hidden face.",
    format: "select-all",
    difficulty: "hard",
  };

  async generate(): Promise<Challenge> {
    const falKey = process.env.FAL_KEY;
    if (!falKey) {
      throw new Error(
        "FAL_KEY environment variable is required for illusion-faces generator.",
      );
    }
    fal.config({ credentials: falKey });

    // process.cwd() is always repo root when invoked from scripts/
    const repoRoot = process.cwd();
    const facePaths = await loadFaceSourcePaths(repoRoot);

    const shell = this.createChallengeShell();
    const conditioningScale = Number(
      process.env.CONTROLNET_CONDITIONING_SCALE ?? String(DEFAULT_CONDITIONING_SCALE),
    );

    // Pick how many cells will have faces (2–5)
    const faceCount = randomInt(2, 6);

    // Pick which cell indices (1-based) will have faces
    const allCellIndices = Array.from({ length: GRID_CELLS }, (_, i) => i + 1);
    const shuffledIndices = shuffle(allCellIndices);
    const faceCellIndices = shuffledIndices
      .slice(0, faceCount)
      .sort((a, b) => a - b);
    const faceCellSet = new Set(faceCellIndices);

    // Assign a unique face file to each face cell (wrap-around if fewer files than cells)
    const shuffledPaths = shuffle([...facePaths]);
    if (shuffledPaths.length < faceCount) {
      console.warn(
        `illusion-faces: only ${shuffledPaths.length} face source(s) available for ${faceCount} face cell(s). ` +
          `Some faces will repeat. Add more images to generations/face-sources/ for better variety.`,
      );
    }
    const cellFacePaths: Record<number, string> = {};
    for (let i = 0; i < faceCellIndices.length; i++) {
      cellFacePaths[faceCellIndices[i]!] =
        shuffledPaths[i % shuffledPaths.length]!;
    }

    // Pick a single environment prompt for all cells (visual coherence)
    const environmentPrompt =
      ENVIRONMENT_PROMPTS[randomInt(0, ENVIRONMENT_PROMPTS.length)]!;
    const prompt = `${environmentPrompt}, ${PROMPT_STYLE_SUFFIX}`;

    // Generate all 9 cells
    const images: ChallengeImage[] = [];
    for (let cell = 1; cell <= GRID_CELLS; cell++) {
      const isFaceCell = faceCellSet.has(cell);
      process.stdout.write(
        `  [illusion-faces] cell ${cell}/${GRID_CELLS} (${isFaceCell ? "face" : "blank"})...\n`,
      );

      const controlPng = isFaceCell
        ? await renderFaceControlImage(cellFacePaths[cell]!)
        : await renderBlackControlImage();

      const image = await generateCellImage(controlPng, prompt, conditioningScale);
      images.push(image);
    }

    // correctAnswer: sorted array of 1-based cell index strings
    const correctAnswer = faceCellIndices.map(String);

    return {
      ...shell,
      images,
      question: "Select all images with hidden faces.",
      correctAnswer,
      metadata: {
        format: "select-all",
        cellCount: GRID_CELLS,
        faceCount,
        faceCellIndices,
        // Store only basenames (not full paths) for portability
        cellFacePaths: Object.fromEntries(
          Object.entries(cellFacePaths).map(([k, v]) => [
            k,
            (v as string).split("/").pop(),
          ]),
        ),
        environmentPrompt,
        prompt,
        conditioningScale,
      },
    };
  }
}
