# Phase 6 — Tool: `find_function` ⭐ PRIORIDADE

> **Status:** 🔴 Não iniciado | **Prioridade:** P0 — Implementar primeiro
> **Pré-requisitos:** Phase 1 (Scaffolding) + Phase 5 (AST Cache)

## Objetivo

Buscar definições de funções por nome em todos os arquivos do projeto, usando análise AST com `ts-morph`. Retorna assinatura completa, localização exata no arquivo e trecho de código.

---

## Especificação da Tool

### Nome da Tool: `find_function`

### Input Schema

| Parâmetro | Tipo     | Obrigatório | Descrição                                              |
|-----------|----------|-------------|--------------------------------------------------------|
| `name`    | `string` | Sim         | Nome da função a buscar (busca case-insensitive parcial) |

### Output (JSON em `content[0].text`)

```json
{
  "name": "guardPath",
  "totalFound": 1,
  "results": [
    {
      "file": "src/lib/pathGuard.ts",
      "name": "guardPath",
      "kind": "function",
      "signature": "export function guardPath(inputPath: string): string",
      "startLine": 8,
      "endLine": 16,
      "snippet": "export function guardPath(inputPath: string): string {\n  const resolved = ...\n}"
    }
  ]
}
```

### Tipos de `kind` retornados

| `kind`        | Descrição                                        |
|---------------|--------------------------------------------------|
| `function`    | `function declaration` no topo de arquivo        |
| `method`      | Método de classe                                 |
| `arrow`       | Arrow function atribuída a variável (`const f = () => {}`) |
| `constructor` | Construtor de classe                             |

---

## Tipos de Funções Buscados via ts-morph

A tool deve buscar **4 tipos** de nós AST:

```
FunctionDeclaration    → function foo() {}
MethodDeclaration      → class A { foo() {} }
Constructor            → class A { constructor() {} }
VariableDeclaration    → const foo = () => {} | const foo = function() {}
```

---

## Implementação Detalhada — `src/tools/findFunction.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SyntaxKind, FunctionDeclaration, MethodDeclaration, VariableDeclaration, ConstructorDeclaration } from 'ts-morph';
import { getAllSourceFiles } from '../lib/astCache.js';
import path from 'path';
import { ROOT_DIR } from '../config.js';

const MAX_SNIPPET_LINES = 60;

/** Trunca o snippet se for muito longo */
function truncateSnippet(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= MAX_SNIPPET_LINES) return text;
  return lines.slice(0, MAX_SNIPPET_LINES).join('\n') + `\n... [truncado: ${lines.length - MAX_SNIPPET_LINES} linhas omitidas]`;
}

/** Caminho relativo ao ROOT_DIR para exibição */
function relativePath(absPath: string): string {
  return path.relative(ROOT_DIR, absPath);
}

interface FunctionMatch {
  file: string;
  name: string;
  kind: 'function' | 'method' | 'arrow' | 'constructor';
  signature: string;
  startLine: number;
  endLine: number;
  snippet: string;
}

export function registerFindFunction(server: McpServer) {
  server.tool(
    'find_function',
    'Busca definições de funções pelo nome usando análise AST. Retorna assinatura, localização e trecho de código.',
    {
      name: z.string().min(1).describe('Nome da função a buscar'),
    },
    async ({ name: searchName }) => {
      const nameLC = searchName.toLowerCase();
      const sourceFiles = await getAllSourceFiles();
      const results: FunctionMatch[] = [];

      for (const sourceFile of sourceFiles) {
        const filePath = relativePath(sourceFile.getFilePath());

        // 1. FunctionDeclaration: function foo() {}
        for (const fn of sourceFile.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
          const fnName = fn.getName();
          if (!fnName || !fnName.toLowerCase().includes(nameLC)) continue;

          const params = fn.getParameters().map((p) => p.getText()).join(', ');
          const returnType = fn.getReturnTypeNode()?.getText() ?? '';
          const modifiers = fn.getModifiers().map((m) => m.getText()).join(' ');
          const asyncKw = fn.isAsync() ? 'async ' : '';
          const signature = [modifiers, `${asyncKw}function ${fnName}(${params})`, returnType ? `: ${returnType}` : '']
            .filter(Boolean)
            .join(' ')
            .trim();

          results.push({
            file: filePath,
            name: fnName,
            kind: 'function',
            signature,
            startLine: fn.getStartLineNumber(),
            endLine: fn.getEndLineNumber(),
            snippet: truncateSnippet(fn.getText()),
          });
        }

        // 2. MethodDeclaration: class A { foo() {} }
        for (const method of sourceFile.getDescendantsOfKind(SyntaxKind.MethodDeclaration)) {
          const methodName = method.getName();
          if (!methodName.toLowerCase().includes(nameLC)) continue;

          const params = method.getParameters().map((p) => p.getText()).join(', ');
          const returnType = method.getReturnTypeNode()?.getText() ?? '';
          const modifiers = method.getModifiers().map((m) => m.getText()).join(' ');
          const asyncKw = method.isAsync() ? 'async ' : '';
          const className = method.getParent()?.getSymbol()?.getName() ?? '?';
          const signature = [modifiers, `${asyncKw}${className}.${methodName}(${params})`, returnType ? `: ${returnType}` : '']
            .filter(Boolean)
            .join(' ')
            .trim();

          results.push({
            file: filePath,
            name: methodName,
            kind: 'method',
            signature,
            startLine: method.getStartLineNumber(),
            endLine: method.getEndLineNumber(),
            snippet: truncateSnippet(method.getText()),
          });
        }

        // 3. Constructor: class A { constructor() {} }
        for (const ctor of sourceFile.getDescendantsOfKind(SyntaxKind.Constructor)) {
          if (!'constructor'.includes(nameLC)) continue;

          const params = ctor.getParameters().map((p) => p.getText()).join(', ');
          const className = ctor.getParent()?.getSymbol()?.getName() ?? '?';
          const signature = `${className}.constructor(${params})`;

          results.push({
            file: filePath,
            name: 'constructor',
            kind: 'constructor',
            signature,
            startLine: ctor.getStartLineNumber(),
            endLine: ctor.getEndLineNumber(),
            snippet: truncateSnippet(ctor.getText()),
          });
        }

        // 4. Arrow functions em VariableDeclaration: const foo = () => {}
        for (const varDecl of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
          const varName = varDecl.getName();
          if (!varName.toLowerCase().includes(nameLC)) continue;

          const initializer = varDecl.getInitializer();
          if (!initializer) continue;

          const isArrow = initializer.getKind() === SyntaxKind.ArrowFunction;
          const isFuncExpr = initializer.getKind() === SyntaxKind.FunctionExpression;
          if (!isArrow && !isFuncExpr) continue;

          const arrowFn = initializer.asKindOrThrow(
            isArrow ? SyntaxKind.ArrowFunction : SyntaxKind.FunctionExpression
          );
          const params = arrowFn.getParameters().map((p) => p.getText()).join(', ');
          const returnType = arrowFn.getReturnTypeNode()?.getText() ?? '';
          const asyncKw = arrowFn.isAsync() ? 'async ' : '';
          const arrow = isArrow ? ' =>' : '';
          const signature = `const ${varName} = ${asyncKw}(${params})${arrow}${returnType ? `: ${returnType}` : ''}`;

          results.push({
            file: filePath,
            name: varName,
            kind: 'arrow',
            signature,
            startLine: varDecl.getStartLineNumber(),
            endLine: varDecl.getEndLineNumber(),
            snippet: truncateSnippet(varDecl.getText()),
          });
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(
            { name: searchName, totalFound: results.length, results },
            null,
            2
          ),
        }],
      };
    }
  );
}
```

---

## Registrar em `src/server.ts`

```typescript
import { registerFindFunction } from './tools/findFunction.js';

// Após criar o server:
registerFindFunction(server);
```

---

## Casos de Borda Tratados

| Cenário | Comportamento Esperado |
|---|---|
| Função não encontrada | `totalFound: 0`, `results: []` |
| Nome parcial (`guard` busca `guardPath`) | Match parcial case-insensitive — retorna a função |
| Função com overloads TypeScript | Cada overload é listado separadamente |
| Arrow function sem nome (IIFE) | Ignorada — `varDecl.getName()` retorna `undefined` |
| Snippet maior que 60 linhas | Truncado com nota de quantas linhas foram omitidas |
| Arquivo com erro de compilação TypeScript | ts-morph parseia mesmo assim (apenas AST, não type-check completo) |
| Diretórios `node_modules` / `dist` | Ignorados pelo `getAllSourceFiles` via glob |

---

## Verificação

### 1. Build sem erros

```bash
npm run build
# Deve compilar sem erros
```

Se houver erros de tipo em `asKindOrThrow`, garantir que está importando corretamente do `ts-morph`.

### 2. Teste manual (antes de testar no VS Code)

Criar `test-find-function.mjs`:

```js
// test-find-function.mjs
process.env.ROOT_DIR = '/home/leonardo/Projects/mcp-server-ai-test';

const { getAllSourceFiles } = await import('./dist/lib/astCache.js');
const { SyntaxKind } = await import('ts-morph');

const sourceFiles = await getAllSourceFiles();
console.log(`📁 Arquivos encontrados: ${sourceFiles.length}`);

for (const sf of sourceFiles) {
  const fns = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
  if (fns.length > 0) {
    console.log(`\n📄 ${sf.getFilePath()}`);
    for (const fn of fns) {
      console.log(`  🔧 function ${fn.getName()} [linha ${fn.getStartLineNumber()}-${fn.getEndLineNumber()}]`);
    }
  }
}
```

```bash
node test-find-function.mjs
```

Esperado: lista de todas as funções encontradas no projeto.

### 3. Teste no VS Code — Copilot Chat (modo Agent)

Após `npm run build` e com o servidor registrado no `.mcp.json`:

| Prompt de Teste | Resultado Esperado |
|---|---|
| "Encontre a função `guardPath`" | Retorna match em `src/lib/pathGuard.ts`, kind: `function`, assinatura correta |
| "Encontre a função `main`" | Retorna match em `src/server.ts`, kind: `function` |
| "Encontre funções com o nome `register`" | Retorna todas as funções cujo nome contém "register" |
| "Encontre o constructor da classe McpServer" | Retorna kind: `constructor` (se existir no projeto analisado) |
| "Encontre a arrow function `truncateSnippet`" | Retorna kind: `arrow` |
| "Encontre a função `xyzNaoExiste`" | `totalFound: 0`, `results: []` |
| "Encontre a função `getSourceFile`" | Retorna match em `src/lib/astCache.ts` |

### 4. Verificar formato do output

O output deve ser JSON válido do tipo:

```json
{
  "name": "guardPath",
  "totalFound": 1,
  "results": [
    {
      "file": "src/lib/pathGuard.ts",
      "name": "guardPath",
      "kind": "function",
      "signature": "export function guardPath(inputPath: string): string",
      "startLine": 8,
      "endLine": 16,
      "snippet": "export function guardPath(inputPath: string): string {\n  ..."
    }
  ]
}
```

### 5. Verificar segurança (pathGuard não necessário aqui)

`find_function` usa `getAllSourceFiles()` que já está limitado ao `ROOT_DIR` internamente pelo glob pattern. Verificar que não há acesso a arquivos fora do root rodando:

```bash
ROOT_DIR=/tmp node dist/server.js
```

E pedindo ao Copilot: "Encontre a função guardPath" — deve retornar `totalFound: 0` (arquivos de outro projeto não são acessados).

---

## Fluxo de Execução (diagrama)

```
find_function("guardPath")
  │
  ├── getAllSourceFiles(ROOT_DIR)
  │     ├── glob("**/*.{ts,tsx,js,jsx}", { cwd: ROOT_DIR, ignore: [...] })
  │     └── Para cada arquivo → getSourceFile(absPath)
  │           ├── Cache hit? → retorna SourceFile em memória
  │           └── Cache miss / mtime mudou? → ts-morph.addSourceFileAtPath()
  │
  ├── Para cada SourceFile:
  │     ├── getDescendantsOfKind(FunctionDeclaration) → filtra por nome
  │     ├── getDescendantsOfKind(MethodDeclaration)   → filtra por nome
  │     ├── getDescendantsOfKind(Constructor)         → filtra "constructor"
  │     └── getDescendantsOfKind(VariableDeclaration) → filtra por nome + verifica ArrowFunction/FunctionExpression
  │
  └── Retorna JSON com todos os matches encontrados
```

---

## Dependências Internas

```
findFunction.ts
  └── astCache.ts (getAllSourceFiles, getSourceFile)
        └── config.ts (ROOT_DIR)
```

`pathGuard.ts` não é chamado diretamente — o glob do `astCache` já restringe ao `ROOT_DIR`.

---

## Possíveis Erros e Soluções

| Erro | Causa | Solução |
|---|---|---|
| `Cannot read properties of undefined (reading 'getKind')` | `initializer` é null | Verificar `if (!initializer) continue` |
| `TypeError: arrowFn.isAsync is not a function` | Tipo errado de nó | Usar `asKindOrThrow` diretamente |
| `totalFound: 0` para função que existe | Arquivo no `dist/` ou `node_modules` | Verificar glob ignore no `getAllSourceFiles` |
| Timeout no VS Code | Muitos arquivos sendo parseados pela primeira vez | Segunda chamada será rápida (cache quente) |
