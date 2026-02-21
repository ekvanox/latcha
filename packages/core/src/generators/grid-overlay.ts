import type { CanvasRenderingContext2D } from 'canvas';
import type { Challenge, GeneratorConfig, ChallengeImage } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage } from '../utils/image.js';
import { randomInt, randomPick, shuffle } from '../utils/random.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

type PatternType = 'diagonal-grid' | 'crosshatch' | 'concentric-circles' | 'honeycomb';

const PATTERN_TYPES: PatternType[] = ['diagonal-grid', 'crosshatch', 'concentric-circles', 'honeycomb'];

const FONTS = [
  'bold 72px Arial',
  'bold 72px Helvetica',
  'bold 80px Impact',
  'bold 68px Verdana',
  'bold 72px "Courier New"',
];

export class GridOverlayGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: 'grid-overlay',
    name: 'Grid Overlay',
    description: 'Text rendered behind dense geometric patterns that humans trivially read through but VLMs cannot',
    format: 'multiple-choice',
    difficulty: 'easy',
  };

  async generate(): Promise<Challenge> {
    const shell = this.createChallengeShell();
    const token = this.generateRandomToken();
    const distractors = this.generatePermutationDistractors(token, 3);
    const options = shuffle([token, ...distractors]);

    const image = await this.renderImage(token);

    return {
      ...shell,
      images: [image],
      question: 'What 4–5 letter sequence do you see in this image?',
      options,
      correctAnswer: token,
      metadata: { token, distractors, pattern: 'grid-overlay' },
    };
  }

  private async renderImage(word: string): Promise<ChallengeImage> {
    const width = 400;
    const height = 200;
    const { canvas, ctx } = makeCanvas(width, height);

    // Random background color (light)
    const bgHue = randomInt(0, 360);
    ctx.fillStyle = `hsl(${bgHue}, 20%, 90%)`;
    ctx.fillRect(0, 0, width, height);

    // Render the text
    const font = randomPick(FONTS);
    const textHue = (bgHue + randomInt(120, 240)) % 360; // contrasting hue
    ctx.fillStyle = `hsl(${textHue}, 70%, 30%)`;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, width / 2, height / 2);

    // Draw overlay pattern
    const pattern = randomPick(PATTERN_TYPES);
    const lineOpacity = 0.3 + Math.random() * 0.3; // 0.3-0.6
    const lineWidth = 1 + Math.random() * 2; // 1-3px
    const patternHue = randomInt(0, 360);
    ctx.strokeStyle = `hsla(${patternHue}, 60%, 40%, ${lineOpacity})`;
    ctx.lineWidth = lineWidth;

    this.drawPattern(ctx, width, height, pattern);

    return canvasToImage(canvas);
  }

  private drawPattern(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pattern: PatternType,
  ): void {
    const spacing = randomInt(8, 20);

    switch (pattern) {
      case 'diagonal-grid':
        this.drawDiagonalGrid(ctx, width, height, spacing);
        break;
      case 'crosshatch':
        this.drawCrosshatch(ctx, width, height, spacing);
        break;
      case 'concentric-circles':
        this.drawConcentricCircles(ctx, width, height, spacing);
        break;
      case 'honeycomb':
        this.drawHoneycomb(ctx, width, height, spacing);
        break;
    }
  }

  private drawDiagonalGrid(ctx: CanvasRenderingContext2D, w: number, h: number, spacing: number): void {
    // Diagonal lines from top-left to bottom-right
    for (let i = -h; i < w + h; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i - h, h);
      ctx.stroke();
    }
    // Diagonal lines from top-right to bottom-left
    for (let i = -h; i < w + h; i += spacing) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  }

  private drawCrosshatch(ctx: CanvasRenderingContext2D, w: number, h: number, spacing: number): void {
    // Horizontal lines
    for (let y = 0; y < h; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Vertical lines
    for (let x = 0; x < w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }

  private drawConcentricCircles(ctx: CanvasRenderingContext2D, w: number, h: number, spacing: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);
    for (let r = spacing; r < maxRadius; r += spacing) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawHoneycomb(ctx: CanvasRenderingContext2D, w: number, h: number, spacing: number): void {
    const hexSize = spacing * 1.5;
    const hexHeight = hexSize * Math.sqrt(3);
    for (let row = -1; row < h / hexHeight + 1; row++) {
      for (let col = -1; col < w / (hexSize * 1.5) + 1; col++) {
        const x = col * hexSize * 1.5;
        const y = row * hexHeight + (col % 2 ? hexHeight / 2 : 0);
        this.drawHexagon(ctx, x, y, hexSize * 0.6);
      }
    }
  }

  private drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + size * Math.cos(angle);
      const y = cy + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  private generateRandomToken(): string {
    const length = randomInt(4, 6); // 4 or 5
    const letters = shuffle(ALPHABET.split('')).slice(0, length);
    return letters.join('');
  }

  /** Generate distractors as permutations of the same letters */
  private generatePermutationDistractors(word: string, count: number): string[] {
    const distractors = new Set<string>();
    let attempts = 0;
    while (distractors.size < count && attempts < 200) {
      attempts++;
      const distractor = shuffle([...word]).join('');
      if (distractor !== word && !distractors.has(distractor)) {
        distractors.add(distractor);
      }
    }

    return [...distractors];
  }
}
