import type { CaptchaGenerator } from '../types.js';
import { GridOverlayGenerator } from './grid-overlay.js';
import { ProximityTextGenerator } from './proximity-text.js';
import { PartialOcclusionGenerator } from './partial-occlusion.js';
import { IllusoryContoursGenerator } from './illusory-contours.js';
import { AbuttingGratingGenerator } from './abutting-grating.js';
import { EmergingImageGenerator } from './emerging-image.js';

const generators: CaptchaGenerator[] = [
  new GridOverlayGenerator(),
  new ProximityTextGenerator(),
  new PartialOcclusionGenerator(),
  new IllusoryContoursGenerator(),
  new AbuttingGratingGenerator(),
  new EmergingImageGenerator(),
];

const generatorMap = new Map(generators.map((g) => [g.config.id, g]));

export function getGenerator(id: string): CaptchaGenerator | undefined {
  return generatorMap.get(id);
}

export function getAllGenerators(): CaptchaGenerator[] {
  return [...generators];
}

export function getGeneratorIds(): string[] {
  return generators.map((g) => g.config.id);
}
