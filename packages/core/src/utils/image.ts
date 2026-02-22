import { createCanvas, type Canvas, type CanvasRenderingContext2D } from 'canvas';
import sharp from 'sharp';
import type { ChallengeImage } from '../types.js';

export interface CanvasSize {
  width: number;
  height: number;
}

/** Create a node-canvas with the given dimensions */
export function makeCanvas(width: number, height: number): { canvas: Canvas; ctx: CanvasRenderingContext2D } {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  return { canvas, ctx };
}

/** Convert a canvas to a ChallengeImage 256×256 WebP buffer */
export async function canvasToImage(canvas: Canvas): Promise<ChallengeImage> {
  const pngBuffer = canvas.toBuffer('image/png');
  const optimized = await sharp(pngBuffer).resize(256, 256).webp().toBuffer();
  return {
    data: optimized,
    mimeType: 'image/webp',
    width: 256,
    height: 256,
  };
}

/** Get a binary mask of rendered text (true = text pixel) */
export function getTextMask(
  text: string,
  font: string,
  width: number,
  height: number,
): boolean[][] {
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'white';
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);

  const imageData = ctx.getImageData(0, 0, width, height);
  const mask: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    mask[y] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      mask[y][x] = imageData.data[idx] > 128; // white = text
    }
  }
  return mask;
}
