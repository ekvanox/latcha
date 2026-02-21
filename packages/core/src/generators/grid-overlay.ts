import type { CanvasRenderingContext2D } from 'canvas';
import type { Challenge, GeneratorConfig, ChallengeImage } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage } from '../utils/image.js';
import { randomInt, randomPick, shuffle } from '../utils/random.js';

// Word pool: short, common words that are easy for humans to read
const WORDS = [
  'ALPHA', 'BRAVO', 'DELTA', 'EAGLE', 'FLAME', 'GRAPE', 'HORSE', 'IVORY',
  'JOKER', 'KNIFE', 'LEMON', 'MAPLE', 'NOBLE', 'OCEAN', 'PEARL', 'QUEST',
  'RAVEN', 'SOLAR', 'TIGER', 'ULTRA', 'VIVID', 'WALTZ', 'XENON', 'YACHT',
  'ZEBRA', 'STORM', 'BLAZE', 'CRANE', 'DRIFT', 'FROST', 'GLEAM', 'HAVEN',
  'FLUX', 'BOLD', 'CALM', 'DARK', 'ECHO', 'FERN', 'GLOW', 'HAZE',
  'JADE', 'KITE', 'LUNA', 'MIST', 'NOVA', 'OPAL', 'PINE', 'ROSE',
  'SILK', 'TIDE', 'VOLT', 'WAVE', 'ZINC', 'APEX', 'BEAM', 'CUBE',
];

// Letter substitutions for generating plausible distractors
const SIMILAR_LETTERS: Record<string, string[]> = {
  A: ['H', 'R', 'K'], B: ['D', 'P', 'R'], C: ['G', 'O', 'Q'],
  D: ['B', 'P', 'O'], E: ['F', 'B', 'L'], F: ['E', 'P', 'T'],
  G: ['C', 'Q', 'O'], H: ['N', 'M', 'K'], I: ['L', 'T', 'J'],
  J: ['I', 'L', 'T'], K: ['H', 'X', 'R'], L: ['I', 'T', 'J'],
  M: ['N', 'W', 'H'], N: ['M', 'H', 'W'], O: ['Q', 'C', 'D'],
  P: ['B', 'D', 'R'], Q: ['O', 'G', 'C'], R: ['B', 'P', 'K'],
  S: ['Z', 'C', 'G'], T: ['I', 'L', 'F'], U: ['V', 'W', 'Y'],
  V: ['U', 'W', 'Y'], W: ['M', 'V', 'N'], X: ['K', 'Z', 'Y'],
  Y: ['V', 'X', 'T'], Z: ['S', 'X', 'N'],
};

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
    const word = randomPick(WORDS);
    const distractors = this.generateDistractors(word, 3);
    const options = shuffle([word, ...distractors]);

    const image = await this.renderImage(word);

    return {
      ...shell,
      images: [image],
      question: 'What word do you see in this image?',
      options,
      correctAnswer: word,
      metadata: { word, distractors, pattern: 'grid-overlay' },
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

  /** Generate distractor words that are visually similar to the target */
  private generateDistractors(word: string, count: number): string[] {
    const distractors = new Set<string>();
    let attempts = 0;
    while (distractors.size < count && attempts < 50) {
      attempts++;
      const distractor = this.mutateWord(word);
      if (distractor !== word && !distractors.has(distractor)) {
        distractors.add(distractor);
      }
    }
    // If we couldn't generate enough, pick random words
    while (distractors.size < count) {
      const fallback = randomPick(WORDS);
      if (fallback !== word && !distractors.has(fallback)) {
        distractors.add(fallback);
      }
    }
    return [...distractors];
  }

  private mutateWord(word: string): string {
    const chars = word.split('');
    const strategy = randomInt(0, 3);

    switch (strategy) {
      case 0: {
        // Swap one letter with a visually similar one
        const pos = randomInt(0, chars.length);
        const subs = SIMILAR_LETTERS[chars[pos]];
        if (subs) chars[pos] = randomPick(subs);
        break;
      }
      case 1: {
        // Swap two adjacent letters
        const pos = randomInt(0, chars.length - 1);
        [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
        break;
      }
      case 2: {
        // Replace a random letter
        const pos = randomInt(0, chars.length);
        const newChar = String.fromCharCode(65 + randomInt(0, 26));
        if (newChar !== chars[pos]) chars[pos] = newChar;
        break;
      }
    }
    return chars.join('');
  }
}
