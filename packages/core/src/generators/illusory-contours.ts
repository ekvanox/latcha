import type { CanvasRenderingContext2D } from "canvas";
import type { Challenge, GeneratorConfig, ChallengeImage } from "../types.js";
import { BaseGenerator } from "./base.js";
import { makeCanvas, canvasToImage } from "../utils/image.js";
import { randomInt, randomPick, shuffle } from "../utils/random.js";

type IllusoryShape =
  | "Square"
  | "Triangle"
  | "Diamond"
  | "Pentagon"
  | "Hexagon"
  | "Star"
  | "No clear shape";

const ALL_OPTIONS: IllusoryShape[] = [
  "Square",
  "Triangle",
  "Diamond",
  "Pentagon",
  "Hexagon",
  "Star",
  "No clear shape",
];

// How many Pac-Man inducers each shape uses
const SHAPE_INDUCER_COUNT: Record<IllusoryShape, number> = {
  Square: 4,
  Triangle: 3,
  Diamond: 4,
  Pentagon: 5,
  Hexagon: 6,
  Star: 5,
  "No clear shape": randomInt(3, 6), // placeholder, computed fresh each call
};

export class IllusoryContoursGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: "illusory-contours",
    name: "Illusory Contours (Kanizsa)",
    description:
      "Kanizsa-style inducers imply a hidden shape that humans perceive strongly but VLMs often miss.",
    format: "multiple-choice",
    difficulty: "hard",
  };

  async generate(): Promise<Challenge> {
    const shell = this.createChallengeShell();
    const targetShape: IllusoryShape = randomPick(ALL_OPTIONS);

    // Always include the correct answer + 3 distractors
    const distractors = shuffle(
      ALL_OPTIONS.filter((o) => o !== targetShape),
    ).slice(0, 3);

    const options = shuffle([targetShape, ...distractors]);

    const image = await this.renderImage(targetShape);

    return {
      ...shell,
      images: [image],
      question: "What shape do the inducers imply in the center of the image?",
      options,
      correctAnswer: targetShape,
      metadata: { targetShape, family: "kanizsa" },
    };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  private async renderImage(
    targetShape: IllusoryShape,
  ): Promise<ChallengeImage> {
    const width = 400;
    const height = 400;
    const { canvas, ctx } = makeCanvas(width, height);

    const bgLightness = randomInt(92, 98);
    const bg = `hsl(0, 0%, ${bgLightness}%)`;
    const fg = `hsl(0, 0%, ${randomInt(6, 16)}%)`;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    switch (targetShape) {
      case "Square":
        this.drawRegularPolygon(ctx, width, height, fg, bg, 4, Math.PI / 4);
        break;
      case "Diamond":
        this.drawRegularPolygon(ctx, width, height, fg, bg, 4, 0);
        break;
      case "Triangle":
        this.drawRegularPolygon(ctx, width, height, fg, bg, 3, -Math.PI / 2);
        break;
      case "Pentagon":
        this.drawRegularPolygon(ctx, width, height, fg, bg, 5, -Math.PI / 2);
        break;
      case "Hexagon":
        this.drawRegularPolygon(ctx, width, height, fg, bg, 6, 0);
        break;
      case "Star":
        this.drawKanizsaStar(ctx, width, height, fg, bg);
        break;
      case "No clear shape":
        this.drawChaosInducers(ctx, width, height, fg, bg);
        break;
    }

    this.drawPeripheralNoise(ctx, width, height, fg);

    return canvasToImage(canvas);
  }

  /**
   * General regular-polygon Kanizsa figure.
   * Places one Pac-Man inducer at each vertex of a regular n-gon,
   * mouth pointing toward the centroid.
   */
  private drawRegularPolygon(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: string,
    bg: string,
    sides: number,
    startAngle: number,
  ): void {
    const cx = width / 2;
    const cy = height / 2;

    // Scale radius to image size; smaller for more sides so they don't overlap
    const baseRadius = Math.min(width, height) * (sides <= 4 ? 0.25 : 0.28);
    const radius = randomInt(
      Math.round(baseRadius * 0.9),
      Math.round(baseRadius * 1.1),
    );
    const r = randomInt(28, 40);
    const opening = Math.PI * (0.28 + Math.random() * 0.1);

    for (let i = 0; i < sides; i++) {
      const a = startAngle + i * ((Math.PI * 2) / sides);
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      this.drawPacmanInducer(ctx, x, y, r, cx, cy, opening, fg, bg);
    }
  }

  /**
   * Star: 5 inducers arranged around a circle, but each mouth points toward
   * the *opposite* vertex (creating a pentagram / star illusion).
   */
  private drawKanizsaStar(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: string,
    bg: string,
  ): void {
    const cx = width / 2;
    const cy = height / 2;
    const outerRadius = randomInt(100, 130);
    const r = randomInt(28, 38);
    const opening = Math.PI * (0.28 + Math.random() * 0.08);
    const base = -Math.PI / 2;

    // Each inducer points to the vertex 2 positions ahead (pentagram skip)
    for (let i = 0; i < 5; i++) {
      const a = base + i * ((Math.PI * 2) / 5);
      const x = cx + Math.cos(a) * outerRadius;
      const y = cy + Math.sin(a) * outerRadius;

      // Target: the vertex two steps ahead in the pentagram
      const targetAngle = base + ((i + 2) % 5) * ((Math.PI * 2) / 5);
      const tx = cx + Math.cos(targetAngle) * outerRadius;
      const ty = cy + Math.sin(targetAngle) * outerRadius;

      this.drawPacmanInducer(ctx, x, y, r, tx, ty, opening, fg, bg);
    }
  }

  /**
   * "No clear shape": random inducer positions with randomly oriented mouths.
   * Nothing aligns, so no shape is perceived.
   */
  private drawChaosInducers(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: string,
    bg: string,
  ): void {
    const cx = width / 2;
    const cy = height / 2;
    const count = randomInt(4, 7);
    const margin = 60;
    const r = randomInt(26, 36);
    const opening = Math.PI * (0.28 + Math.random() * 0.1);

    for (let i = 0; i < count; i++) {
      // Place inducers scattered across the image but not too central
      let x: number, y: number;
      let attempts = 0;
      do {
        x = randomInt(margin, width - margin);
        y = randomInt(margin, height - margin);
        attempts++;
      } while (Math.hypot(x - cx, y - cy) < 55 && attempts < 20);

      // Point mouth in a deliberately wrong direction (away from center)
      const angleToCenter = Math.atan2(cy - y, cx - x);
      // Rotate by ~PI (opposite) plus some random offset
      const wrongAngle = angleToCenter + Math.PI + (Math.random() - 0.5) * 1.2;
      const fakeTargetX = x + Math.cos(wrongAngle) * 200;
      const fakeTargetY = y + Math.sin(wrongAngle) * 200;

      this.drawPacmanInducer(
        ctx,
        x,
        y,
        r,
        fakeTargetX,
        fakeTargetY,
        opening,
        fg,
        bg,
      );
    }
  }

  // ── Low-level primitives ───────────────────────────────────────────────────

  private drawPacmanInducer(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    targetX: number,
    targetY: number,
    opening: number,
    fg: string,
    bg: string,
  ): void {
    // Filled disc
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Cut out wedge pointing inward toward the implied shape center
    const theta =
      Math.atan2(targetY - y, targetX - x) + (Math.random() - 0.5) * 0.06;
    const start = theta - opening / 2;
    const end = theta + opening / 2;

    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius + 0.5, start, end);
    ctx.closePath();
    ctx.fill();
  }

  private drawPeripheralNoise(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: string,
  ): void {
    const n = randomInt(14, 28);
    ctx.fillStyle = fg;

    for (let i = 0; i < n; i++) {
      const r = randomInt(2, 6);
      const x = randomInt(8, width - 8);
      const y = randomInt(8, height - 8);

      // Keep center clean so the illusion dominates
      const dx = x - width / 2;
      const dy = y - height / 2;
      if (dx * dx + dy * dy < 65 * 65) continue;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
