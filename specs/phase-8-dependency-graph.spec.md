# Phase 8 — Tool: `dependency_graph`

> **Status:** 🔴 Não iniciado | **Prioridade:** P3 — Desprioritizado
> **Pré-requisitos:** Phase 1 + Phase 5 (AST Cache)

## Objetivo

Analisar imports entre arquivos do projeto e gerar um grafo de dependências. Suporta travessia a partir de um arquivo de entrada (`entryFile`) ou análise de todo o projeto.

---

## Especificação da Tool

### Input Schema

| Parâmetro   | Tipo     | Obrigatório | Descrição                                                |
|-------------|----------|-------------|----------------------------------------------------------|
| `entryFile` | `string` | Não         | Caminho relativo ao ROOT_DIR. Se omitido, analisa tudo   |

### Output (JSON em `content[0].text`)

```json
{
  "entryFile": "src/server.ts",
  "nodes": [
    { "id": "src/server.ts",          "kind": "internal" },
    { "id": "src/config.ts",          "kind": "internal" },
    { "id": "src/tools/listFiles.ts", "kind": "internal" },
    { "id": "@modelcontextprotocol/sdk", "kind": "external" }
  ],
  "edges": [
    { "from": "src/server.ts", "to": "src/config.ts" },
    { "from": "src/server.ts", "to": "@modelcontextprotocol/sdk" },
    { "from": "src/server.ts", "to": "src/tools/listFiles.ts" }
  ]
}
```

---

## Implementação — `src/tools/dependencyGraph.ts`

### Pontos-chave

- Usar ts-morph `sourceFile.getImportDeclarations()` para obter imports
- `importDecl.getModuleSpecifierValue()` retorna o string do import (ex: `'./config.js'`, `'@modelcontextprotocol/sdk'`)
- Imports começando com `.` ou `/` são **internos** → resolver com `path.resolve`
- Demais imports são **externos** (node_modules)
- Se `entryFile` fornecido: BFS/DFS a partir do arquivo, seguindo apenas imports internos
- Se não fornecido: analisar todos os arquivos do projeto
- Usar `guardPath(entryFile)` quando `entryFile` for fornecido

```typescript
// src/tools/dependencyGraph.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SyntaxKind } from 'ts-morph';
import { getSourceFile, getAllSourceFiles } from '../lib/astCache.js';
import { guardPath } from '../lib/pathGuard.js';
import { ROOT_DIR } from '../config.js';
import path from 'path';

interface GraphNode  { id: string; kind: 'internal' | 'external' }
interface GraphEdge  { from: string; to: string }

function rel(absPath: string): string {
  return path.relative(ROOT_DIR, absPath);
}

async function buildGraphFrom(entryAbs: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const queue = [entryAbs];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const relCurrent = rel(current);
    if (!nodes.has(relCurrent)) {
      nodes.set(relCurrent, { id: relCurrent, kind: 'internal' });
    }

    let sf;
    try { sf = await getSourceFile(current); } catch { continue; }

    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      const isInternal = spec.startsWith('.') || spec.startsWith('/');

      if (isInternal) {
        // Resolver extensões .js → .ts para localizar o arquivo
        const base = path.resolve(path.dirname(current), spec).replace(/\.js$/, '');
        const resolved = [base + '.ts', base + '.tsx', base + '/index.ts'].find((p) => {
          try { require('fs').accessSync(p); return true; } catch { return false; }
        }) ?? base + '.ts';

        const relTarget = rel(resolved);
        if (!nodes.has(relTarget)) nodes.set(relTarget, { id: relTarget, kind: 'internal' });
        edges.push({ from: relCurrent, to: relTarget });
        queue.push(resolved);
      } else {
        const extId = spec.split('/')[0];
        if (!nodes.has(extId)) nodes.set(extId, { id: extId, kind: 'external' });
        edges.push({ from: relCurrent, to: extId });
      }
    }
  }

  return { nodes: Array.from(nodes.values()), edges };
}

export function registerDependencyGraph(server: McpServer) {
  server.tool(
    'dependency_graph',
    'Analisa imports e gera o grafo de dependências entre arquivos do projeto',
    { entryFile: z.string().optional().describe('Arquivo de entrada (relativo ao ROOT_DIR). Se omitido, analisa todo o projeto') },
    async ({ entryFile }) => {
      let nodes: GraphNode[];
      let edges: GraphEdge[];

      if (entryFile) {
        const absEntry = guardPath(entryFile);
        ({ nodes, edges } = await buildGraphFrom(absEntry));
      } else {
        // Analisar todos os arquivos
        const allFiles = await getAllSourceFiles();
        const allNodes = new Map<string, GraphNode>();
        const allEdges: GraphEdge[] = [];

        for (const sf of allFiles) {
          const relFrom = rel(sf.getFilePath());
          if (!allNodes.has(relFrom)) allNodes.set(relFrom, { id: relFrom, kind: 'internal' });

          for (const imp of sf.getImportDeclarations()) {
            const spec = imp.getModuleSpecifierValue();
            const isInternal = spec.startsWith('.') || spec.startsWith('/');
            const toId = isInternal ? rel(path.resolve(path.dirname(sf.getFilePath()), spec).replace(/\.js$/, '') + '.ts') : spec.split('/')[0];
            const toKind: 'internal' | 'external' = isInternal ? 'internal' : 'external';
            if (!allNodes.has(toId)) allNodes.set(toId, { id: toId, kind: toKind });
            allEdges.push({ from: relFrom, to: toId });
          }
        }
        nodes = Array.from(allNodes.values());
        edges = allEdges;
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ entryFile: entryFile ?? null, nodes, edges }, null, 2),
        }],
      };
    }
  );
}
```

Registrar em `src/server.ts`:

```typescript
import { registerDependencyGraph } from './tools/dependencyGraph.js';
registerDependencyGraph(server);
```

---

## Verificação

### Teste no VS Code (Copilot Chat — modo Agent)

| Prompt | Resultado Esperado |
|---|---|
| "Gere o grafo de dependências a partir de src/server.ts" | Nós internos + externos, arestas corretas |
| "Gere o grafo de dependências completo do projeto" | Todos os arquivos como nós internos |
| "Quais módulos externos `src/tools/findFunction.ts` depende?" | Nodes com `kind: "external"` conectados ao arquivo |
