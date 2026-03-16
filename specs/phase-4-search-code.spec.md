# Phase 4 — Tool: `search_code`

> **Status:** 🔴 Não iniciado | **Prioridade:** P2 — Desprioritizado
> **Pré-requisito:** Phase 1 completa

## Objetivo

Buscar texto ou padrão regex dentro dos arquivos do projeto, retornando as linhas que fazem match com contexto de linhas ao redor.

---

## Especificação da Tool

### Input Schema

| Parâmetro      | Tipo     | Obrigatório | Descrição                                       |
|----------------|----------|-------------|-------------------------------------------------|
| `query`        | `string` | Sim         | String ou padrão regex a buscar                 |
| `filePattern`  | `string` | Não         | Glob pattern para filtrar arquivos (ex: `*.ts`) |

### Output (JSON em `content[0].text`)

```json
{
  "query": "McpServer",
  "filePattern": "*.ts",
  "totalMatches": 3,
  "truncated": false,
  "results": [
    {
      "file": "src/server.ts",
      "line": 1,
      "match": "import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';",
      "context": {
        "before": [],
        "after": ["import { StdioServerTransport } from '...';"]
      }
    }
  ]
}
```

---

## Implementação — `src/tools/searchCode.ts`

Pontos-chave:
- Usar `glob` com `ROOT_DIR` como `cwd` para listar arquivos (respeitando `filePattern`)
- Ler cada arquivo linha por linha com `readline`
- Tentar compilar `query` como `RegExp`; se inválido, fazer busca literal com `String.includes`
- Retornar no máximo `MAX_SEARCH_RESULTS` (50) resultados
- Incluir `CONTEXT_LINES` (2) linhas antes e depois de cada match

```typescript
// src/tools/searchCode.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { glob } from 'glob';
import fs from 'fs';
import readline from 'readline';
import { ROOT_DIR, MAX_SEARCH_RESULTS, CONTEXT_LINES } from '../config.js';
import path from 'path';

// Ler arquivo retornando linhas
async function readLines(filePath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
    rl.on('line', (line) => lines.push(line));
    rl.on('close', () => resolve(lines));
  });
}

export function registerSearchCode(server: McpServer) {
  server.tool(
    'search_code',
    'Busca texto ou padrão regex dentro do código do projeto',
    {
      query: z.string().describe('Texto ou regex a buscar'),
      filePattern: z.string().optional().describe('Glob pattern de arquivos (ex: *.ts)'),
    },
    async ({ query, filePattern }) => {
      let regex: RegExp;
      try {
        regex = new RegExp(query, 'i');
      } catch {
        regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      }

      const pattern = filePattern ?? '**/*';
      const files = await glob(pattern, {
        cwd: ROOT_DIR,
        nodir: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
      });

      const results: object[] = [];
      let totalMatches = 0;
      let truncated = false;

      for (const relFile of files) {
        if (totalMatches >= MAX_SEARCH_RESULTS) { truncated = true; break; }
        const absFile = path.join(ROOT_DIR, relFile);
        const lines = await readLines(absFile);

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            results.push({
              file: relFile,
              line: i + 1,
              match: lines[i],
              context: {
                before: lines.slice(Math.max(0, i - CONTEXT_LINES), i),
                after: lines.slice(i + 1, i + 1 + CONTEXT_LINES),
              },
            });
            totalMatches++;
            if (totalMatches >= MAX_SEARCH_RESULTS) { truncated = true; break; }
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ query, filePattern, totalMatches, truncated, results }, null, 2),
        }],
      };
    }
  );
}
```

Registrar em `src/server.ts`:

```typescript
import { registerSearchCode } from './tools/searchCode.js';
registerSearchCode(server);
```

---

## Verificação

### Teste no VS Code (Copilot Chat — modo Agent)

| Prompt | Resultado Esperado |
|---|---|
| "Busque onde 'McpServer' é mencionado no código" | Resultados com arquivo e linha |
| "Busque 'import' apenas em arquivos .ts" | Filtrado por `filePattern: "*.ts"` |
| "Busque o padrão regex `export (function\|class)`" | Retorna funções e classes exportadas |
| "Faça uma busca que retorna mais de 50 resultados" | `truncated: true` no output |
