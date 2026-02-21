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
    const dotColor = `hsl(0, 0%, ${randomInt(20, 40)}%)`;

    ctx.fillStyle = dotColor;

    // Place dots
    // Foreground (text region): tight grid
    for (let y = 0; y < height; y += fgSpacing) {
      for (let x = 0; x < width; x += fgSpacing) {
        if (y < mask.length && x < mask[0].length && mask[y][x]) {
          const dx = (Math.random() - 0.5) * jitter * 2;
          const dy = (Math.random() - 0.5) * jitter * 2;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Background region: sparse grid
    for (let y = 0; y < height; y += bgSpacing) {
      for (let x = 0; x < width; x += bgSpacing) {
        if (y >= mask.length || x >= mask[0].length || !mask[y][x]) {
          const dx = (Math.random() - 0.5) * jitter * 2;
          const dy = (Math.random() - 0.5) * jitter * 2;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    return canvasToImage(canvas);
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
