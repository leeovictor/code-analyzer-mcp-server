import { Project, SourceFile } from 'ts-morph';
import fs from 'fs/promises';
import path from 'path';
import { ROOT_DIR } from '../config.js';

interface CacheEntry {
  sourceFile: SourceFile;
  mtime: number;
}

const tsProject = new Project({
  tsConfigFilePath: path.join(ROOT_DIR, 'tsconfig.json'),
  skipAddingFilesFromTsConfig: true,
});

// Fallback: se não houver tsconfig no projeto alvo, usar configurações mínimas
const fallbackProject = new Project({
  compilerOptions: {
    allowJs: true,
    checkJs: false,
  },
  skipAddingFilesFromTsConfig: true,
});

const cache = new Map<string, CacheEntry>();

/**
 * Retorna o SourceFile ts-morph para um caminho absoluto.
 * Usa cache e invalida por mtime.
 */
export async function getSourceFile(absPath: string): Promise<SourceFile> {
  const stat = await fs.stat(absPath);
  const mtime = stat.mtimeMs;
  const cached = cache.get(absPath);

  if (cached && cached.mtime === mtime) {
    return cached.sourceFile;
  }

  // Usar tsProject como padrão
  const project = tsProject;

  const existing = project.getSourceFile(absPath);
  if (existing) {
    project.removeSourceFile(existing);
  }

  const sourceFile = project.addSourceFileAtPath(absPath);
  cache.set(absPath, { sourceFile, mtime });
  return sourceFile;
}

/**
 * Retorna todos os source files .ts/.js dentro de um diretório,
 * usando o cache para evitar re-parsing.
 */
export async function getAllSourceFiles(rootDir: string = ROOT_DIR): Promise<SourceFile[]> {
  const { glob } = await import('glob');
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: rootDir,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
  });

  return Promise.all(files.map((f) => getSourceFile(f)));
}

/**
 * Limpa todo o cache (útil para testes).
 */
export function clearCache(): void {
  cache.clear();
}

export { fallbackProject };

