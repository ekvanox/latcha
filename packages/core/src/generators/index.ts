import type { CaptchaGenerator } from '../types.js';
import { GridOverlayGenerator } from './grid-overlay.js';
import { ProximityTextGenerator } from './proximity-text.js';
import { PartialOcclusionGenerator } from './partial-occlusion.js';

const generators: CaptchaGenerator[] = [
  new GridOverlayGenerator(),
  new ProximityTextGenerator(),
  new PartialOcclusionGenerator(),
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
