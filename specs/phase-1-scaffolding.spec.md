# Phase 1 — Scaffolding & Infraestrutura Base

> **Status:** ✅ Concluído | **Prioridade:** P0 — Pré-requisito obrigatório para todas as fases

## Objetivo

Criar a estrutura mínima do projeto para que o MCP server compile, inicialize via stdio e seja detectado pelo VS Code GitHub Copilot como um servidor MCP funcional. Ao final desta fase o servidor sobe sem nenhuma tool registrada, mas aparece no painel MCP do VS Code.

## Pré-requisitos do Ambiente

- Node.js v20+
- npm v10+
- VS Code com extensão **GitHub Copilot** instalada (v1.290+)

---

## Passos de Implementação

### 1.1 — Inicializar projeto Node.js

```bash
npm init -y
```

### 1.2 — Instalar dependências

```bash
# Produção
npm install @modelcontextprotocol/sdk ts-morph glob minimatch zod

# Desenvolvimento
npm install -D typescript @types/node tsx
```

### 1.3 — Criar `tsconfig.json`

Criar na raiz do projeto:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 1.4 — Atualizar `package.json`

Adicionar os campos abaixo (manter campos existentes gerados pelo `npm init`):

```json
{
  "type": "module",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts"
  }
}
```

> **Importante:** `"type": "module"` é obrigatório para ESM com Node16. Todos os imports TypeScript devem usar extensão `.js` (ex: `import { guardPath } from '../lib/pathGuard.js'`).

### 1.5 — Criar estrutura de diretórios

```bash
mkdir -p src/tools src/lib
```

Estrutura esperada ao final desta fase:

```
src/
  server.ts
  config.ts
  lib/
    pathGuard.ts
    astCache.ts         ← placeholder vazio por enquanto
  tools/
    listFiles.ts        ← placeholder
    searchCode.ts       ← placeholder
    getFileContent.ts   ← placeholder
    findFunction.ts     ← placeholder
    findReferences.ts   ← placeholder
    dependencyGraph.ts  ← placeholder
    explainFileStructure.ts  ← placeholder
```

### 1.6 — Implementar `src/config.ts`

```typescript
import path from 'path';

export const ROOT_DIR = (() => {
  const fromEnv = process.env.ROOT_DIR;
  const fromArg = process.argv[2];
  const dir = fromEnv ?? fromArg;

  if (!dir) {
    throw new Error(
      'ROOT_DIR must be set via ROOT_DIR environment variable or as the first CLI argument'
    );
  }

  return path.resolve(dir);
})();

export const MAX_FILE_SIZE_BYTES = 100_000; // 100 KB
export const MAX_SEARCH_RESULTS = 50;
export const CONTEXT_LINES = 2;
```

### 1.7 — Implementar `src/lib/pathGuard.ts`

```typescript
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
```

### 1.8 — Implementar `src/server.ts` (stubs)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({
  name: 'code-analyzer',
  version: '1.0.0',
});

// Tools serão registradas nas próximas fases:
// import { registerListFiles } from './tools/listFiles.js';
// import { registerGetFileContent } from './tools/getFileContent.js';
// import { registerSearchCode } from './tools/searchCode.js';
// import { registerFindFunction } from './tools/findFunction.js';
// import { registerFindReferences } from './tools/findReferences.js';
// import { registerDependencyGraph } from './tools/dependencyGraph.js';
// import { registerExplainFileStructure } from './tools/explainFileStructure.js';

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[code-analyzer] MCP server started. ROOT_DIR:', process.env.ROOT_DIR);
}

main().catch((err) => {
  console.error('[code-analyzer] Fatal error:', err);
  process.exit(1);
});
```

### 1.9 — Criar `.mcp.json` em `.vscode`

Este arquivo registra o servidor no VS Code. Deve estar **na raiz do workspace aberto no VS Code**.

```json
{
  "servers": {
    "code-analyzer": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/server.js"],
      "env": {
        "ROOT_DIR": "${workspaceFolder}"
      }
    }
  }
}
```

> O VS Code substitui `${workspaceFolder}` pelo diretório raiz do workspace automaticamente.

---

## Verificação

### ✅ 1. Compilação sem erros

```bash
npm run build
```

Esperado:
- Saída vazia (sem erros)
- Pasta `dist/` criada contendo `server.js`, `config.js`, `lib/pathGuard.js`

### ✅ 2. Servidor inicia manualmente

```bash
ROOT_DIR=/home/leonardo/Projects/mcp-server-ai-test node dist/server.js
```

Esperado no stderr:
```
[code-analyzer] MCP server started. ROOT_DIR: /home/leonardo/Projects/mcp-server-ai-test
```

O processo fica em execução aguardando mensagens MCP via stdin. Use `Ctrl+C` para encerrar.

### ✅ 3. Servidor detectado no VS Code

1. Abrir VS Code no diretório `/home/leonardo/Projects/mcp-server-ai-test`
2. Abrir Command Palette: `Ctrl+Shift+P`
3. Executar: **`MCP: List Servers`**
4. Verificar que `code-analyzer` aparece na lista
5. Se status for `stopped`, clicar em **Start**

### ✅ 4. pathGuard bloqueia path traversal

Criar o arquivo de teste temporário `test-guard.mjs`:

```js
// test-guard.mjs
process.env.ROOT_DIR = '/home/leonardo/Projects/mcp-server-ai-test';
const { guardPath } = await import('./dist/lib/pathGuard.js');

// Deve resolver com sucesso
console.log('✅ Dentro do root:', guardPath('src/server.ts'));

// Deve lançar erro
try {
  guardPath('../../etc/passwd');
  console.error('❌ FALHA: deveria ter bloqueado path traversal');
} catch (e) {
  console.log('✅ Path traversal bloqueado:', e.message);
}
```

```bash
node test-guard.mjs
```

Esperado:
```
✅ Dentro do root: /home/leonardo/Projects/mcp-server-ai-test/src/server.ts
✅ Path traversal bloqueado: Access denied: path "../../etc/passwd" resolves outside the root directory
```

---

## Teste no VS Code (Copilot Chat)

Após iniciar o servidor:

1. Abrir **Copilot Chat** (`Ctrl+Alt+I`)
2. Selecionar modo **Agent** (ícone de agente)
3. Digitar o prompt abaixo:

> "Quais servidores MCP estão disponíveis e quais ferramentas cada um expõe?"

Esperado: Copilot lista o servidor `code-analyzer` (sem tools ainda, pois estão como stubs).

---

## Problemas Comuns

| Problema | Causa Provável | Solução |
|---|---|---|
| `Cannot find module` ao compilar | Imports sem extensão `.js` | Adicionar `.js` no final de todos os imports locais |
| Servidor não aparece no VS Code | `.mcp.json` não está na raiz do workspace | Verificar que o arquivo está onde o workspace está aberto |
| `ROOT_DIR` undefined | Variável de ambiente não passada | Verificar `env` no `.mcp.json` |
| `ERR_UNKNOWN_FILE_EXTENSION` | `"type": "module"` faltando | Adicionar ao `package.json` |
