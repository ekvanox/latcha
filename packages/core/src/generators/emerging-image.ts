import type { Challenge, ChallengeImage, GeneratorConfig } from '../types.js';
import { BaseGenerator } from './base.js';
import { makeCanvas, canvasToImage, getTextMask } from '../utils/image.js';
import { randomInt, shuffle } from '../utils/random.js';

const ALPHABET = 'ABCDEFGHJKLMNPRSTUVWXYZ';

export class EmergingImageGenerator extends BaseGenerator {
  config: GeneratorConfig = {
    id: 'emerging-image',
    name: 'Emerging Image',
    description:
      'A hidden token emerges from texture statistics (variance/structure), which humans pick up better than current VLMs.',
    format: 'multiple-choice',
    difficulty: 'hard',
  };

  async generate(): Promise<Challenge> {
    const shell = this.createChallengeShell();
    const token = this.generateToken();
    const distractors = this.generatePermutationDistractors(token, 3);
    const options = shuffle([token, ...distractors]);
    const image = await this.renderImage(token);

    return {
      ...shell,
      images: [image],
      question: 'Which 4–5 letter sequence is hidden in the texture?',
      options,
      correctAnswer: token,
      metadata: { token, distractors, family: 'emerging-image' },
    };
  }

  private async renderImage(token: string): Promise<ChallengeImage> {
    const width = 420;
    const height = 220;
    const { canvas, ctx } = makeCanvas(width, height);
    const mask = getTextMask(token, 'bold 140px Arial', width, height);

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    const base = randomInt(132, 162);
    const outsideAmp = randomInt(24, 36);
    const insideAmp = randomInt(7, 14);
    const insideBias = randomInt(-4, 5);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inside = !!mask[y]?.[x];

        const amp = inside ? insideAmp : outsideAmp;
        let value = base + insideBias + (Math.random() * 2 - 1) * amp;

        // add weak oriented field for natural-looking texture
        value += Math.sin((x + y * 0.55) * 0.09) * (inside ? 3 : 7);

        const clamped = Math.max(0, Math.min(255, Math.round(value)));
        data[idx] = clamped;
        data[idx + 1] = clamped;
        data[idx + 2] = clamped;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // add sparse clutter marks away from center to increase ambiguity
    ctx.strokeStyle = `hsla(0, 0%, ${randomInt(15, 35)}%, ${0.18 + Math.random() * 0.1})`;
    ctx.lineWidth = 1;
    const marks = randomInt(18, 34);
    for (let i = 0; i < marks; i++) {
      const x1 = randomInt(0, width);
      const y1 = randomInt(0, height);
      const x2 = x1 + randomInt(-18, 19);
      const y2 = y1 + randomInt(-18, 19);

      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const dx = cx - width / 2;
      const dy = cy - height / 2;
      if (dx * dx + dy * dy < 60 * 60) continue;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    return canvasToImage(canvas);
  }

  private generateToken(): string {
    const length = randomInt(4, 6); // 4 or 5
    const letters = shuffle(ALPHABET.split('')).slice(0, length);
    return letters.join('');
  }

  private generatePermutationDistractors(token: string, count: number): string[] {
    const out = new Set<string>();
    let attempts = 0;

    while (out.size < count && attempts < 200) {
      attempts++;
      const d = shuffle([...token]).join('');
      if (d !== token) out.add(d);
    }

    return [...out];
  }
}
