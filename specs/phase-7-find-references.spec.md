# Phase 7 — Tool: `find_references`

> **Status:** 🔴 Não iniciado | **Prioridade:** P3 — Desprioritizado
> **Pré-requisitos:** Phase 1 + Phase 5 (AST Cache)

## Objetivo

Encontrar todos os locais onde um símbolo (função, variável, classe) é referenciado no código, combinando análise AST com fallback textual.

---

## Especificação da Tool

### Input Schema

| Parâmetro | Tipo     | Obrigatório | Descrição                            |
|-----------|----------|-------------|--------------------------------------|
| `symbol`  | `string` | Sim         | Nome do símbolo a buscar referências |

### Output (JSON em `content[0].text`)

```json
{
  "symbol": "guardPath",
  "totalFound": 3,
  "results": [
    {
      "file": "src/tools/getFileContent.ts",
      "line": 12,
      "kind": "call",
      "context": "  const resolved = guardPath(inputPath);"
    },
    {
      "file": "src/tools/listFiles.ts",
      "line": 18,
      "kind": "import",
      "context": "import { guardPath } from '../lib/pathGuard.js';"
    }
  ]
}
```

---

## Implementação — `src/tools/findReferences.ts`

### Estratégia

Usar **two-pass approach**:

1. **Pass 1 — AST (ts-morph `findReferences`):** Para cada SourceFile, tentar localizar o símbolo e chamar `symbol.findReferences()`. Mais preciso mas pode ser lento.
2. **Pass 2 — Fallback textual:** Buscar `symbol` como palavra inteira (`\bsymbol\b`) em todos os arquivos. Mais rápido, menos preciso.

Recomendação inicial: implementar o **fallback textual** por ser mais robusto e independente do type-checker. Melhorar com AST depois.

### Pontos-chave de implementação

- Usar `\b${symbol}\b` como regex para evitar matches parciais (ex: `guardPath` não deve dar match em `guardPathStrict`)
- Categorizar o tipo de referência por contexto da linha: `import`, `call`, `declaration`, `type`, `other`
- Limitar a `MAX_SEARCH_RESULTS` resultados
- Excluir `node_modules`, `dist`, `.git`

```typescript
// src/tools/findReferences.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { glob } from 'glob';
import fs from 'fs';
import readline from 'readline';
import { ROOT_DIR, MAX_SEARCH_RESULTS } from '../config.js';
import path from 'path';

function classifyReference(line: string, symbol: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('import')) return 'import';
  if (trimmed.startsWith('export')) return 'export';
  if (new RegExp(`function\\s+${symbol}|const\\s+${symbol}|class\\s+${symbol}`).test(trimmed)) return 'declaration';
  if (trimmed.includes(`${symbol}(`)) return 'call';
  if (trimmed.includes(`: ${symbol}`) || trimmed.includes(`<${symbol}`)) return 'type';
  return 'other';
}

export function registerFindReferences(server: McpServer) {
  server.tool(
    'find_references',
    'Encontra onde um símbolo (função, variável, classe) é referenciado no projeto',
    { symbol: z.string().min(1).describe('Nome do símbolo a buscar') },
    async ({ symbol }) => {
      const symbolRegex = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      const files = await glob('**/*.{ts,tsx,js,jsx}', {
        cwd: ROOT_DIR,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
      });

      const results: object[] = [];
      let truncated = false;

      for (const absFile of files) {
        if (results.length >= MAX_SEARCH_RESULTS) { truncated = true; break; }
        const lines: string[] = await new Promise((resolve) => {
          const acc: string[] = [];
          const rl = readline.createInterface({ input: fs.createReadStream(absFile) });
          rl.on('line', (l) => acc.push(l));
          rl.on('close', () => resolve(acc));
        });

        for (let i = 0; i < lines.length; i++) {
          if (symbolRegex.test(lines[i])) {
            results.push({
              file: path.relative(ROOT_DIR, absFile),
              line: i + 1,
              kind: classifyReference(lines[i], symbol),
              context: lines[i].trim(),
            });
            if (results.length >= MAX_SEARCH_RESULTS) { truncated = true; break; }
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ symbol, totalFound: results.length, truncated, results }, null, 2),
        }],
      };
    }
  );
}
```

Registrar em `src/server.ts`:

```typescript
import { registerFindReferences } from './tools/findReferences.js';
registerFindReferences(server);
```

---

## Verificação

### Teste no VS Code (Copilot Chat — modo Agent)

| Prompt | Resultado Esperado |
|---|---|
| "Onde o símbolo `guardPath` é usado?" | Referências em arquivos de tools, com kind: `import`, `call` |
| "Encontre referências ao símbolo `ROOT_DIR`" | Retorna todos os arquivos que importam/usam `ROOT_DIR` |
| "Onde `McpServer` é referenciado?" | `server.ts` e outros arquivos que importam a classe |
| "Busque referências de um símbolo que não existe: `xyzAbc`" | `totalFound: 0` |
