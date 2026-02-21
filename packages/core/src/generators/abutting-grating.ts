import type { Challenge, ChallengeImage, GeneratorConfig } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage, getTextMask } from '../utils/image.js';
import { randomInt, randomPick, shuffle } from '../utils/random.js';

const CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789'.split('');

export class AbuttingGratingGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: 'abutting-grating',
    name: 'Abutting Grating',
    description:
      'A character boundary is defined by phase-shifted gratings, which humans segment well but models often misread.',
    format: 'multiple-choice',
    difficulty: 'hard',
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
      question: 'Which character emerges from the striped illusion?',
      options,
      correctAnswer: char,
      metadata: { char, family: 'abutting-grating', distractors },
    };
  }

  private async renderImage(char: string): Promise<ChallengeImage> {
    const width = 340;
    const height = 260;
    const { canvas, ctx } = makeCanvas(width, height);

    const mask = getTextMask(char, 'bold 210px Arial', width, height);

    const period = randomInt(9, 14);
    const halfPeriod = period / 2;
    const duty = 0.52 + Math.random() * 0.08;

    const light = randomInt(188, 212);
    const dark = randomInt(118, 148);
    const noiseAmp = randomInt(8, 15);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let y = 0; y < height; y++) {
      // small row jitter to avoid brittle OCR-like alignment
      const rowJitter = (Math.random() - 0.5) * 0.8;

      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inside = !!mask[y]?.[x];
        const phase = inside ? halfPeriod : 0;

        const stripePos = ((x + phase + rowJitter) % period + period) % period;
        const stripe = stripePos < period * duty;

        let value = stripe ? dark : light;

        // texture noise to reduce direct phase-boundary detection
        value += (Math.random() * 2 - 1) * noiseAmp;

        // very subtle contrast balancing inside target region
        if (inside) {
          value += (Math.random() * 2 - 1) * 4;
        }

        const clamped = Math.max(0, Math.min(255, Math.round(value)));
        data[idx] = clamped;
        data[idx + 1] = clamped;
        data[idx + 2] = clamped;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // Peripheral clutter helps suppress simplistic contour-following
    ctx.fillStyle = `hsla(0, 0%, ${randomInt(20, 45)}%, ${0.12 + Math.random() * 0.12})`;
    const blobs = randomInt(14, 28);
    for (let i = 0; i < blobs; i++) {
      const r = randomInt(3, 9);
      const x = randomInt(0, width);
      const y = randomInt(0, height);

      const dx = x - width / 2;
      const dy = y - height / 2;
      if (dx * dx + dy * dy < 75 * 75) continue;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    return canvasToImage(canvas);
  }

  private pickDistractors(target: string, count: number): string[] {
    const out = new Set<string>();
    while (out.size < count) {
      const c = randomPick(CHARS);
      if (c !== target) out.add(c);
    }
    return [...out];
  }
}
