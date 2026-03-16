# Phase 3 — Tool: `get_file_content`

> **Status:** 🔴 Não iniciado | **Prioridade:** P2 — Desprioritizado
> **Pré-requisito:** Phase 1 completa

## Objetivo

Retornar o conteúdo de um arquivo com controle de tamanho máximo (100KB por default) e proteção contra path traversal.

---

## Especificação da Tool

### Input Schema

| Parâmetro | Tipo     | Obrigatório | Descrição              |
|-----------|----------|-------------|------------------------|
| `path`    | `string` | Sim         | Caminho relativo ao ROOT_DIR |

### Output (JSON em `content[0].text`)

```json
{
  "path": "src/server.ts",
  "content": "import { McpServer }...",
  "lines": 42,
  "truncated": false,
  "sizeBytes": 1345
}
```

Se o arquivo exceder o limite:
```json
{
  "path": "src/big-file.ts",
  "content": "...primeiros 100KB...",
  "lines": 3100,
  "truncated": true,
  "sizeBytes": 250000
}
```

---

## Implementação — `src/tools/getFileContent.ts`

Pontos-chave:
- `guardPath(path)` obrigatório antes de qualquer leitura
- Verificar `stat.size` antes de ler — se maior que `MAX_FILE_SIZE_BYTES`, ler apenas os primeiros bytes
- Contar linhas com `content.split('\n').length`
- `truncated: true` quando o arquivo foi cortado

```typescript
// src/tools/getFileContent.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs/promises';
import { guardPath } from '../lib/pathGuard.js';
import { MAX_FILE_SIZE_BYTES } from '../config.js';

export function registerGetFileContent(server: McpServer) {
  server.tool(
    'get_file_content',
    'Retorna o conteúdo de um arquivo do projeto',
    { path: z.string().describe('Caminho relativo ao ROOT_DIR') },
    async ({ path: inputPath }) => {
      const resolved = guardPath(inputPath);
      const stat = await fs.stat(resolved);
      const truncated = stat.size > MAX_FILE_SIZE_BYTES;

      let content: string;
      if (truncated) {
        const buffer = Buffer.alloc(MAX_FILE_SIZE_BYTES);
        const fh = await fs.open(resolved, 'r');
        await fh.read(buffer, 0, MAX_FILE_SIZE_BYTES, 0);
        await fh.close();
        content = buffer.toString('utf-8');
      } else {
        content = await fs.readFile(resolved, 'utf-8');
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: inputPath,
            content,
            lines: content.split('\n').length,
            truncated,
            sizeBytes: stat.size,
          }, null, 2),
        }],
      };
    }
  );
}
```

Registrar em `src/server.ts`:

```typescript
import { registerGetFileContent } from './tools/getFileContent.js';
registerGetFileContent(server);
```

---

## Verificação

### Teste no VS Code (Copilot Chat — modo Agent)

| Prompt | Resultado Esperado |
|---|---|
| "Mostre o conteúdo do arquivo src/server.ts" | JSON com conteúdo completo, `truncated: false` |
| "Mostre o conteúdo de um arquivo grande (>100KB)" | `truncated: true`, conteúdo cortado |
| "Mostre o conteúdo de `../../etc/passwd`" | Erro: Access denied |
| "Mostre o conteúdo de src/arquivo-inexistente.ts" | Erro de arquivo não encontrado |
