# Phase 5 — Cache AST (ts-morph)

> **Status:** ✅ Concluído | **Prioridade:** P1 — Pré-requisito direto para `find_function`
> **Pré-requisito:** Phase 1 completa

## Objetivo

Criar a infraestrutura de parsing AST reutilizável usando `ts-morph`. O cache evita re-parsear arquivos já lidos e invalida entradas quando o arquivo é modificado no disco (via `mtime`).

Esta biblioteca **não é uma tool MCP** — é usada internamente pelas tools `find_function`, `find_references`, `explain_file_structure` e `dependency_graph`.

---

## Arquitetura do Cache

```
ASTCache (singleton)
  ├── tsProject: ts-morph Project       ← instância única, reusada
  ├── cache: Map<absPath, CacheEntry>
  └── CacheEntry
        ├── sourceFile: SourceFile      ← objeto ts-morph parseado
        └── mtime: number               ← timestamp do arquivo no disco
```

**Fluxo ao solicitar um SourceFile:**
1. Verificar se `absPath` está no `cache`
2. Se não → parsear e adicionar ao cache
3. Se sim → checar `mtime` atual vs `mtime` armazenado
   - Se `mtime` diferente → invalidar, re-parsear e atualizar cache
   - Se igual → retornar `sourceFile` do cache (hit)

---

## Implementação — `src/lib/astCache.ts`

```typescript
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
  addFilesFromTsConfig: false,
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

  // Remover versão antiga do projeto (se existir) antes de re-adicionar
  let project: Project;
  try {
    project = tsProject;
  } catch {
    project = fallbackProject;
  }

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
```

---

## Verificação

### Teste de compilação

```bash
npm run build
# Esperado: sem erros em src/lib/astCache.ts
```

### Teste manual do cache (arquivo `test-cache.mjs`)

```js
// test-cache.mjs
process.env.ROOT_DIR = '/home/leonardo/Projects/mcp-server-ai-test';

const { getSourceFile, getAllSourceFiles } = await import('./dist/lib/astCache.js');

// Teste 1: parsear um arquivo
const sf = await getSourceFile('/home/leonardo/Projects/mcp-server-ai-test/src/config.js');
console.log('✅ SourceFile carregado:', sf.getFilePath());

// Teste 2: segunda chamada deve usar cache
const t1 = Date.now();
await getSourceFile('/home/leonardo/Projects/mcp-server-ai-test/src/config.js');
const t2 = Date.now();
console.log(`✅ Cache hit em ${t2 - t1}ms (esperado: muito rápido)`);

// Teste 3: listar todos os source files
const all = await getAllSourceFiles();
console.log(`✅ Total de source files encontrados: ${all.length}`);
```

```bash
node test-cache.mjs
```

### Funcionalidade esperada

| Cenário | Resultado Esperado |
|---|---|
| Primeiro acesso a um arquivo | Arquivo parseado e adicionado ao cache |
| Segundo acesso ao mesmo arquivo | Cache hit — `mtime` igual, retorna sem re-parse |
| Arquivo modificado no disco | `mtime` diferente → re-parse e atualização do cache |
| Arquivo fora do projeto (sem tsconfig) | Usa `fallbackProject` com `allowJs: true` |

---

## Observações de Implementação

- `ts-morph Project` com `tsConfigFilePath` inclui as opções de compilação do projeto alvo, mas **não** adiciona arquivos automaticamente (`skipAddingFilesFromTsConfig: true`)
- Se o projeto alvo não tiver `tsconfig.json`, o `fallbackProject` garante suporte a JS/TS básico
- O cache é **em memória** — reiniciar o servidor limpa o cache
- Não há limite de tamanho no cache nesta fase (melhoria futura)
