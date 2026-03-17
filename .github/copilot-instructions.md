# Copilot Workspace Instructions

## Overview

MCP server para análise de codebases de software. Expõe ferramentas que permitem a um LLM (via GitHub Copilot Agent mode) explorar, navegar e analisar um projeto local: estrutura de arquivos, busca de código, análise AST, dependências e muito mais.

Tecnologias: **Node.js + TypeScript (ESM)**, `@modelcontextprotocol/sdk`, `ts-morph` (AST parser).

## Build & Test

```bash
npm run build   # compila TypeScript → dist/
npm start       # inicia o servidor MCP via stdio
npm run dev     # modo desenvolvimento com hot-reload (tsx watch)
```

Antes de iniciar, garantir que `ROOT_DIR` está definido (ver `.vscode/mcp.json`).

## Architecture & Conventions

### Estrutura de diretórios

```
src/
  server.ts          ← Entry point: inicializa McpServer e registra todas as tools
  config.ts          ← ROOT_DIR (env/CLI), limites de tamanho e busca
  lib/
    pathGuard.ts     ← Segurança: bloqueia acesso fora do ROOT_DIR (path traversal)
    astCache.ts      ← Cache ts-morph Project com invalidação por mtime
  tools/
    listFiles.ts
    getFileContent.ts
    searchCode.ts
    findFunction.ts
    findReferences.ts
    dependencyGraph.ts
    explainFileStructure.ts
specs/               ← especificações detalhadas por fase de implementação
```

### Convenções

- **ESM puro**: `"type": "module"` no `package.json`. Todos os imports locais devem usar extensão `.js` (ex: `import { guardPath } from '../lib/pathGuard.js'`).
- **Registro de tools**: cada tool exporta uma função `registerXxx(server: McpServer)` e é chamada em `server.ts`.
- **Segurança**: `guardPath()` de `lib/pathGuard.ts` deve ser chamado em **toda** operação que receba um path do usuário. Nunca acesse o filesystem sem validar.
- **Retorno das tools**: sempre `{ content: [{ type: 'text', text: JSON.stringify(..., null, 2) }] }`.
- **Limites**: `MAX_FILE_SIZE_BYTES` (100KB) e `MAX_SEARCH_RESULTS` (50) definidos em `config.ts`.

## Common Pitfalls

- Imports locais **sem** extensão `.js` causam `ERR_MODULE_NOT_FOUND` em runtime — sempre usar `.js` mesmo em arquivos `.ts`.
- `ROOT_DIR` não definido causa erro imediato na importação de `config.ts` — garantir que está no `env` do `.vscode/mcp.json`.
- `ts-morph` demora no primeiro parse de projetos grandes — o cache em `astCache.ts` resolve nas chamadas subsequentes.
- O servidor MCP usa **stdio** — qualquer `console.log` vai para o protocolo MCP e pode corromper a comunicação. Usar sempre `console.error` para logs de debug.

## Key Files & Patterns

- [`src/server.ts`](../src/server.ts) — ponto de entrada; adicionar `registerXxx(server)` aqui ao implementar cada nova tool.
- [`src/config.ts`](../src/config.ts) — todos os limites e o `ROOT_DIR` ficam aqui; não hardcode valores nas tools.
- [`src/lib/pathGuard.ts`](../src/lib/pathGuard.ts) — **chamar sempre** antes de qualquer leitura de arquivo.
- [`src/lib/astCache.ts`](../src/lib/astCache.ts) — usar `getSourceFile(absPath)` e `getAllSourceFiles()` em vez de instanciar `ts-morph Project` diretamente nas tools.
- [`specs/`](../specs/) — cada fase tem um `.spec.md` com implementação detalhada, casos de borda e prompts de teste no VS Code.

## Ordem de Implementação (specs)

| Spec | Prioridade | Status |
|---|---|---|
| `specs/phase-1-scaffolding.spec.md` | P0 | ✅ Concluído |
| `specs/phase-5-ast-cache.spec.md`   | P1 | ✅ Concluído |
| `specs/phase-6-find-function.spec.md` | P0 ⭐ | 🔴 Próximo |
| `specs/phase-2-list-files.spec.md` | P2 | 🔴 Desprioritizado |
| `specs/phase-3-get-file-content.spec.md` | P2 | 🔴 Desprioritizado |
| `specs/phase-4-search-code.spec.md` | P2 | 🔴 Desprioritizado |
| `specs/phase-7-find-references.spec.md` | P3 | 🔴 Desprioritizado |
| `specs/phase-8-dependency-graph.spec.md` | P3 | 🔴 Desprioritizado |
| `specs/phase-9-explain-file-structure.spec.md` | P3 | 🔴 Desprioritizado |

## Testando no VS Code

1. `npm run build`
2. Command Palette → **MCP: List Servers** → confirmar `code-analyzer` ativo
3. Copilot Chat → modo **Agent** → usar as tools diretamente no chat
