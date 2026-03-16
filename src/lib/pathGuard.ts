import path from 'path';
import { ROOT_DIR } from '../config.js';

/**
 * Resolve um caminho relativo ou absoluto e garante que está dentro de ROOT_DIR.
 * Lança erro se o path tentar sair do diretório raiz (path traversal).
 */
export function guardPath(inputPath: string): string {
  const resolved = path.resolve(ROOT_DIR, inputPath);
  const rootWithSep = ROOT_DIR.endsWith(path.sep) ? ROOT_DIR : ROOT_DIR + path.sep;

  if (resolved !== ROOT_DIR && !resolved.startsWith(rootWithSep)) {
    throw new Error(
      `Access denied: path "${inputPath}" resolves outside the root directory`
    );
  }

  return resolved;
}
