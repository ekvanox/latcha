import type { CanvasRenderingContext2D } from 'canvas';
import type { Challenge, GeneratorConfig, ChallengeImage } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage } from '../utils/image.js';
import { randomInt, shuffle } from '../utils/random.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export class PartialOcclusionGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: 'partial-occlusion',
    name: 'Partial Occlusion',
    description: 'Text partially hidden behind random bars/shapes — humans do amodal completion, AI degrades at >30% coverage',
    format: 'multiple-choice',
    difficulty: 'medium',
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
      question: 'What 4–5 letter sequence do you see partially hidden in this image?',
      options,
      correctAnswer: token,
      metadata: { token, distractors },
    };
  }

  private async renderImage(word: string): Promise<ChallengeImage> {
    const width = 400;
    const height = 200;
    const { canvas, ctx } = makeCanvas(width, height);

    // Background
    const bgHue = randomInt(0, 360);
    ctx.fillStyle = `hsl(${bgHue}, 15%, 92%)`;
    ctx.fillRect(0, 0, width, height);

    // Render the text clearly first
    const textHue = (bgHue + randomInt(120, 240)) % 360;
    ctx.fillStyle = `hsl(${textHue}, 70%, 25%)`;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, width / 2, height / 2);

    // Draw occluding bars (40-60% coverage)
    const occlusionType = randomInt(0, 3);
    const barColor = `hsl(${bgHue}, 20%, ${randomInt(60, 80)}%)`;
    ctx.fillStyle = barColor;

    const coverage = 0.4 + Math.random() * 0.2; // 40-60%

    switch (occlusionType) {
      case 0:
        this.drawHorizontalBars(ctx, width, height, coverage);
        break;
      case 1:
        this.drawVerticalBars(ctx, width, height, coverage);
        break;
      case 2:
        this.drawRandomBlobs(ctx, width, height, coverage);
        break;
    }

    return canvasToImage(canvas);
  }

  private drawHorizontalBars(ctx: CanvasRenderingContext2D, w: number, h: number, coverage: number): void {
    const barHeight = randomInt(8, 16);
    const totalBarArea = h * coverage;
    const numBars = Math.floor(totalBarArea / barHeight);
    const gap = (h - numBars * barHeight) / (numBars + 1);

    for (let i = 0; i < numBars; i++) {
      const y = gap + i * (barHeight + gap) + (Math.random() - 0.5) * 4;
      ctx.fillRect(0, y, w, barHeight);
    }
  }

  private drawVerticalBars(ctx: CanvasRenderingContext2D, w: number, h: number, coverage: number): void {
    const barWidth = randomInt(8, 16);
    const totalBarArea = w * coverage;
    const numBars = Math.floor(totalBarArea / barWidth);
    const gap = (w - numBars * barWidth) / (numBars + 1);

    for (let i = 0; i < numBars; i++) {
      const x = gap + i * (barWidth + gap) + (Math.random() - 0.5) * 4;
      ctx.fillRect(x, 0, barWidth, h);
    }
  }

  private drawRandomBlobs(ctx: CanvasRenderingContext2D, w: number, h: number, coverage: number): void {
    const targetPixels = w * h * coverage;
    let coveredPixels = 0;

    while (coveredPixels < targetPixels) {
      const bw = randomInt(20, 60);
      const bh = randomInt(15, 40);
      const x = randomInt(0, w - bw);
      const y = randomInt(0, h - bh);
      const radius = Math.min(bw, bh) / 4;

      // Rounded rectangle
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + bw - radius, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
      ctx.lineTo(x + bw, y + bh - radius);
      ctx.quadraticCurveTo(x + bw, y + bh, x + bw - radius, y + bh);
      ctx.lineTo(x + radius, y + bh);
      ctx.quadraticCurveTo(x, y + bh, x, y + bh - radius);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      coveredPixels += bw * bh;
    }
  }

  private generateRandomToken(): string {
    const length = randomInt(4, 6); // 4 or 5
    const letters = shuffle(ALPHABET.split('')).slice(0, length);
    return letters.join('');
  }

  private generatePermutationDistractors(word: string, count: number): string[] {
    const distractors = new Set<string>();
    let attempts = 0;
    while (distractors.size < count && attempts < 200) {
      attempts++;
      const d = shuffle([...word]).join('');
      if (d !== word) distractors.add(d);
    }

    return [...distractors];
  }
}
