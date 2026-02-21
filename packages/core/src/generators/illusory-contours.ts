import type { CanvasRenderingContext2D } from 'canvas';
import type { Challenge, GeneratorConfig, ChallengeImage } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage } from '../utils/image.js';
import { randomInt, randomPick, shuffle } from '../utils/random.js';

type IllusoryShape = 'Square' | 'Triangle';

const ALL_OPTIONS = ['Square', 'Triangle', 'Circle', 'No clear shape'] as const;

export class IllusoryContoursGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: 'illusory-contours',
    name: 'Illusory Contours (Kanizsa)',
    description:
      'Kanizsa-style inducers imply a hidden shape that humans perceive strongly but VLMs often miss.',
    format: 'multiple-choice',
    difficulty: 'hard',
  };

  async generate(): Promise<Challenge> {
    const shell = this.createChallengeShell();
    const targetShape: IllusoryShape = randomPick(['Square', 'Triangle']);

    const options = shuffle([
      targetShape,
      ...ALL_OPTIONS.filter((option) => option !== targetShape).slice(0, 3),
    ]);

    const image = await this.renderImage(targetShape);

    return {
      ...shell,
      images: [image],
      question: 'Which shape do you perceive in the center?',
      options,
      correctAnswer: targetShape,
      metadata: { targetShape, family: 'kanizsa' },
    };
  }

  private async renderImage(targetShape: IllusoryShape): Promise<ChallengeImage> {
    const width = 360;
    const height = 360;
    const { canvas, ctx } = makeCanvas(width, height);

    const bgLightness = randomInt(92, 98);
    const bg = `hsl(0, 0%, ${bgLightness}%)`;
    const fg = `hsl(0, 0%, ${randomInt(8, 18)}%)`;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    if (targetShape === 'Square') {
      this.drawKanizsaSquare(ctx, width, height, fg, bg);
    } else {
      this.drawKanizsaTriangle(ctx, width, height, fg, bg);
    }

    this.drawPeripheralNoise(ctx, width, height, fg);

    return canvasToImage(canvas);
  }

  private drawKanizsaSquare(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: string,
    bg: string,
  ): void {
    const cx = width / 2;
    const cy = height / 2;
    const halfSide = randomInt(70, 95);
    const r = randomInt(30, 40);
    const opening = Math.PI * (0.3 + Math.random() * 0.08);

    const corners = [
      { x: cx - halfSide, y: cy - halfSide },
      { x: cx + halfSide, y: cy - halfSide },
      { x: cx + halfSide, y: cy + halfSide },
      { x: cx - halfSide, y: cy + halfSide },
    ];

    for (const c of corners) {
      this.drawPacmanInducer(ctx, c.x, c.y, r, cx, cy, opening, fg, bg);
    }
  }

  private drawKanizsaTriangle(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fg: string,
    bg: string,
  ): void {
    const cx = width / 2;
    const cy = height / 2;
    const triRadius = randomInt(95, 115);
    const r = randomInt(32, 42);
    const opening = Math.PI * (0.32 + Math.random() * 0.08);
    const baseRotation = -Math.PI / 2 + (Math.random() - 0.5) * 0.25;

    for (let i = 0; i < 3; i++) {
      const a = baseRotation + i * ((Math.PI * 2) / 3);
      const x = cx + Math.cos(a) * triRadius;
      const y = cy + Math.sin(a) * triRadius;
      this.drawPacmanInducer(ctx, x, y, r, cx, cy, opening, fg, bg);
    }
  }

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

    // Cut out wedge pointing inward
    const theta = Math.atan2(targetY - y, targetX - x) + (Math.random() - 0.5) * 0.08;
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
    const n = randomInt(12, 24);
    ctx.fillStyle = fg;

    for (let i = 0; i < n; i++) {
      const r = randomInt(2, 7);
      const x = randomInt(8, width - 8);
      const y = randomInt(8, height - 8);

      // keep center relatively clean so the illusion dominates
      const dx = x - width / 2;
      const dy = y - height / 2;
      if (dx * dx + dy * dy < 70 * 70) continue;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
