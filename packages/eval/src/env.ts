import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Load environment variables for eval scripts.
 *
 * Order (later files may fill in missing keys):
 * 1) workspace root .env
 * 2) workspace root .env.local
 * 3) package .env
 * 4) package .env.local
 */
export function loadEvalEnv(): void {
  const rootDir = resolve(import.meta.dirname, '../../..');
  const packageDir = resolve(import.meta.dirname, '..');

  const envFiles = [
    resolve(rootDir, '.env'),
    resolve(rootDir, '.env.local'),
    resolve(packageDir, '.env'),
    resolve(packageDir, '.env.local'),
  ];

  for (const file of envFiles) {
    config({ path: file });
  }
}
