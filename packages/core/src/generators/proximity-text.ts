import type { CanvasRenderingContext2D } from 'canvas';
import type { Challenge, GeneratorConfig, ChallengeImage } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage, getTextMask } from '../utils/image.js';
import { randomInt, randomPick, shuffle } from '../utils/random.js';

const CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789'.split('');

export class ProximityTextGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: 'proximity-text',
    name: 'Gestalt Proximity Text',
    description: 'Dot patterns where letter shapes emerge from spacing differences — exploits gestalt proximity grouping',
    format: 'multiple-choice',
    difficulty: 'medium',
  };

  async generate(): Promise<Challenge> {
    const shell = this.createChallengeShell();
    const char = randomPick(CHARS);
    const distractors = this.pickDistractors(char, 3);
    const options = shuffle([char, ...distractors]);

    const image = await this.renderImage(char);

    return {
      ...shell,
      images: [image],
      question: 'What letter or number do you see formed by the dot pattern?',
      options,
      correctAnswer: char,
      metadata: { char, distractors },
    };
  }

  private async renderImage(char: string): Promise<ChallengeImage> {
    const width = 300;
    const height = 300;

    // Get the binary mask for this character
    const mask = getTextMask(char, 'bold 200px Arial', width, height);
    const bounds = this.getMaskBounds(mask, width, height);

    const { canvas, ctx } = makeCanvas(width, height);

    // Background
    const bgLightness = randomInt(88, 96);
    ctx.fillStyle = `hsl(0, 0%, ${bgLightness}%)`;
    ctx.fillRect(0, 0, width, height);

    // Dot parameters
    const dotRadius = 2;
    const fgSpacing = randomInt(8, 12);   // tight spacing for letter
    const bgSpacing = randomInt(18, 25);  // loose spacing for background
    const jitter = 2;
    const centerDropStrength = 0.45 + Math.random() * 0.2;
    const dotColor = `hsl(0, 0%, ${randomInt(20, 40)}%)`;

    ctx.fillStyle = dotColor;

    // Place dots
    // Foreground (text region): tight grid
    for (let y = 0; y < height; y += fgSpacing) {
      for (let x = 0; x < width; x += fgSpacing) {
        if (y < mask.length && x < mask[0].length && mask[y][x]) {
          const keepProbability = this.getForegroundKeepProbability(
            x,
            y,
            bounds,
            centerDropStrength,
          );
          if (Math.random() > keepProbability) continue;

          const dx = (Math.random() - 0.5) * jitter * 2;
          const dy = (Math.random() - 0.5) * jitter * 2;
          this.drawDot(ctx, x + dx, y + dy, dotRadius);
        }
      }
    }

    // Background region: sparse grid
    for (let y = 0; y < height; y += bgSpacing) {
      for (let x = 0; x < width; x += bgSpacing) {
        if (y >= mask.length || x >= mask[0].length || !mask[y][x]) {
          const dx = (Math.random() - 0.5) * jitter * 2;
          const dy = (Math.random() - 0.5) * jitter * 2;
          this.drawDot(ctx, x + dx, y + dy, dotRadius);
        }
      }
    }

    // Random clutter clusters around the character to confuse local pattern matchers
    const clusterCount = randomInt(6, 11);
    for (let c = 0; c < clusterCount; c++) {
      const center = this.pickClusterCenter(bounds, width, height);
      const spread = randomInt(8, 22);
      const clusterDots = randomInt(10, 24);

      for (let i = 0; i < clusterDots; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * spread;

        const x = center.x + Math.cos(angle) * radius + (Math.random() - 0.5) * jitter * 2;
        const y = center.y + Math.sin(angle) * radius + (Math.random() - 0.5) * jitter * 2;

        const xi = Math.round(x);
        const yi = Math.round(y);
        if (xi < 0 || xi >= width || yi < 0 || yi >= height) continue;

        // Keep most clutter outside the target shape, but allow some overlap noise.
        if (mask[yi]?.[xi] && Math.random() < 0.8) continue;

        this.drawDot(ctx, x, y, dotRadius * (0.7 + Math.random() * 0.8));
      }
    }

    return canvasToImage(canvas);
  }

  private drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private getMaskBounds(mask: boolean[][], width: number, height: number): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    cx: number;
    cy: number;
  } {
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let found = false;

    for (let y = 0; y < mask.length; y++) {
      for (let x = 0; x < mask[y].length; x++) {
        if (!mask[y][x]) continue;
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (!found) {
      minX = 0;
      minY = 0;
      maxX = width - 1;
      maxY = height - 1;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };
  }

  private getForegroundKeepProbability(
    x: number,
    y: number,
    bounds: { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number },
    centerDropStrength: number,
  ): number {
    const halfW = Math.max(1, (bounds.maxX - bounds.minX) / 2);
    const halfH = Math.max(1, (bounds.maxY - bounds.minY) / 2);

    const nx = (x - bounds.cx) / halfW;
    const ny = (y - bounds.cy) / halfH;
    const dist = Math.min(1, Math.sqrt(nx * nx + ny * ny));

    // Fewer dots near center, denser edges (supports human gestalt completion).
    const centerBias = 1 - dist;
    const keep = 0.88 - centerBias * centerDropStrength;
    return Math.max(0.25, Math.min(0.95, keep));
  }

  private pickClusterCenter(
    bounds: { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number },
    width: number,
    height: number,
  ): { x: number; y: number } {
    const angle = Math.random() * Math.PI * 2;
    const ring = randomInt(18, 60);
    const rx = ring + (bounds.maxX - bounds.minX) * 0.35;
    const ry = ring + (bounds.maxY - bounds.minY) * 0.35;

    const x = Math.max(0, Math.min(width - 1, bounds.cx + Math.cos(angle) * rx));
    const y = Math.max(0, Math.min(height - 1, bounds.cy + Math.sin(angle) * ry));
    return { x, y };
  }

  private pickDistractors(target: string, count: number): string[] {
    const distractors = new Set<string>();
    while (distractors.size < count) {
      const d = randomPick(CHARS);
      if (d !== target && !distractors.has(d)) {
        distractors.add(d);
      }
    }
    return [...distractors];
  }
}
