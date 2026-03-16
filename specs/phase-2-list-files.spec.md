# Phase 2 — Tool: `list_files`

> **Status:** 🔴 Não iniciado | **Prioridade:** P2 — Desprioritizado
> **Pré-requisito:** Phase 1 completa

## Objetivo

Implementar a tool `list_files` que lista arquivos e diretórios do projeto de forma segura, respeitando o `ROOT_DIR`.

---

## Especificação da Tool

### Input Schema

| Parâmetro | Tipo     | Obrigatório | Descrição                                          |
|-----------|----------|-------------|-----------------------------------------------------|
| `path`    | `string` | Não         | Caminho relativo ao ROOT_DIR. Default: raiz do projeto |

### Output (JSON em `content[0].text`)

```json
{
  "path": "src",
  "entries": [
    { "name": "server.ts", "type": "file", "sizeBytes": 1024 },
    { "name": "tools",     "type": "directory" }
  ],
  "total": 2
}
```

---

## Implementação — `src/tools/listFiles.ts`

Pontos-chave:
- Usar `fs.readdir` com `{ withFileTypes: true }` ou `glob`
- Chamar `guardPath(path ?? '.')` antes de qualquer leitura
- Para cada entrada: incluir `name`, `type` (`file` | `directory`), `sizeBytes` (apenas para arquivos)
- Arquivos e diretórios ocultos (`.git`, `node_modules`) opcionalmente filtrados via parâmetro futuro

```typescript
// src/tools/listFiles.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs/promises';
import { guardPath } from '../lib/pathGuard.js';
import { ROOT_DIR } from '../config.js';
import path from 'path';

export function registerListFiles(server: McpServer) {
  server.tool(
    'list_files',
    'Lista arquivos e diretórios do projeto',
    { path: z.string().optional().describe('Caminho relativo ao ROOT_DIR') },
    async ({ path: inputPath }) => {
      const resolvedPath = guardPath(inputPath ?? '.');
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });

      const result = await Promise.all(
        entries.map(async (entry) => {
          const base: { name: string; type: string; sizeBytes?: number } = {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
          };
          if (entry.isFile()) {
            const stat = await fs.stat(path.join(resolvedPath, entry.name));
            base.sizeBytes = stat.size;
          }
          return base;
        })
      );

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ path: inputPath ?? '.', entries: result, total: result.length }, null, 2),
        }],
      };
    }
  );
}
```

Registrar em `src/server.ts`:

```typescript
import { registerListFiles } from './tools/listFiles.js';
registerListFiles(server);
```

---

## Verificação

### Build

```bash
npm run build
```

### Teste no VS Code (Copilot Chat — modo Agent)

| Prompt | Resultado Esperado |
|---|---|
| "Liste os arquivos na raiz do projeto" | JSON com entries da raiz |
| "Liste os arquivos na pasta src/tools" | Apenas arquivos dentro de `src/tools/` |
| "Liste arquivos em `../../etc`" | Erro: Access denied |
