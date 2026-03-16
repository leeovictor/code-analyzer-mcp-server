# Phase 9 — Tool: `explain_file_structure`

> **Status:** 🔴 Não iniciado | **Prioridade:** P3 — Desprioritizado
> **Pré-requisitos:** Phase 1 + Phase 5 (AST Cache)

## Objetivo

Analisar um arquivo TypeScript/JavaScript via AST e retornar um JSON estruturado com todas as funções, classes, interfaces, imports e exports que ele contém.

---

## Especificação da Tool

### Input Schema

| Parâmetro | Tipo     | Obrigatório | Descrição                            |
|-----------|----------|-------------|--------------------------------------|
| `path`    | `string` | Sim         | Caminho relativo ao ROOT_DIR         |

### Output (JSON em `content[0].text`)

```json
{
  "path": "src/lib/pathGuard.ts",
  "imports": [
    { "module": "path",          "names": ["default as path"] },
    { "module": "../config.js",  "names": ["ROOT_DIR"] }
  ],
  "exports": [
    { "name": "guardPath", "kind": "function" }
  ],
  "functions": [
    {
      "name": "guardPath",
      "kind": "function",
      "async": false,
      "signature": "export function guardPath(inputPath: string): string",
      "startLine": 8,
      "endLine": 16
    }
  ],
  "classes": [],
  "interfaces": []
}
```

---

## Implementação — `src/tools/explainFileStructure.ts`

### Pontos-chave

- `guardPath(path)` obrigatório antes de qualquer acesso
- Usar `getSourceFile(absPath)` do astCache
- **Imports:** `sourceFile.getImportDeclarations()` → `imp.getModuleSpecifierValue()` + `imp.getNamedImports().map(n => n.getName())`
- **Exports:** `sourceFile.getExportedDeclarations()` → mapa de nome → tipo de nó
- **Functions:** `FunctionDeclaration` + `VariableDeclaration` com `ArrowFunction`
- **Classes:** `sourceFile.getClasses()` → para cada classe: nome, métodos, propriedades
- **Interfaces:** `sourceFile.getInterfaces()` → nome + propriedades

```typescript
// src/tools/explainFileStructure.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SyntaxKind } from 'ts-morph';
import { getSourceFile } from '../lib/astCache.js';
import { guardPath } from '../lib/pathGuard.js';
import { ROOT_DIR } from '../config.js';
import path from 'path';

export function registerExplainFileStructure(server: McpServer) {
  server.tool(
    'explain_file_structure',
    'Analisa um arquivo e retorna sua estrutura completa: funções, classes, interfaces, imports e exports',
    { path: z.string().describe('Caminho relativo ao ROOT_DIR') },
    async ({ path: inputPath }) => {
      const absPath = guardPath(inputPath);
      const sf = await getSourceFile(absPath);

      // Imports
      const imports = sf.getImportDeclarations().map((imp) => ({
        module: imp.getModuleSpecifierValue(),
        names: [
          imp.getDefaultImport()?.getText(),
          imp.getNamespaceImport()?.getText(),
          ...imp.getNamedImports().map((n) => n.getName()),
        ].filter(Boolean),
      }));

      // Exports
      const exports: object[] = [];
      for (const [name, decls] of sf.getExportedDeclarations()) {
        for (const decl of decls) {
          const kindName = SyntaxKind[decl.getKind()].replace('Declaration', '').toLowerCase();
          exports.push({ name, kind: kindName });
        }
      }

      // Functions (FunctionDeclaration + Arrow)
      const functions: object[] = [];
      for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
        if (!fn.getName()) continue;
        functions.push({
          name: fn.getName(),
          kind: 'function',
          async: fn.isAsync(),
          signature: `${fn.getModifiers().map(m => m.getText()).join(' ')} function ${fn.getName()}(${fn.getParameters().map(p => p.getText()).join(', ')})${fn.getReturnTypeNode() ? ': ' + fn.getReturnTypeNode()!.getText() : ''}`.trim(),
          startLine: fn.getStartLineNumber(),
          endLine: fn.getEndLineNumber(),
        });
      }
      for (const varDecl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
        const init = varDecl.getInitializer();
        if (!init) continue;
        if (init.getKind() !== SyntaxKind.ArrowFunction && init.getKind() !== SyntaxKind.FunctionExpression) continue;
        functions.push({
          name: varDecl.getName(),
          kind: 'arrow',
          startLine: varDecl.getStartLineNumber(),
          endLine: varDecl.getEndLineNumber(),
        });
      }

      // Classes
      const classes = sf.getClasses().map((cls) => ({
        name: cls.getName(),
        startLine: cls.getStartLineNumber(),
        endLine: cls.getEndLineNumber(),
        methods: cls.getMethods().map((m) => ({ name: m.getName(), static: m.isStatic(), async: m.isAsync() })),
        properties: cls.getProperties().map((p) => ({ name: p.getName(), type: p.getTypeNode()?.getText() })),
      }));

      // Interfaces
      const interfaces = sf.getInterfaces().map((iface) => ({
        name: iface.getName(),
        startLine: iface.getStartLineNumber(),
        properties: iface.getProperties().map((p) => ({ name: p.getName(), type: p.getTypeNode()?.getText() })),
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            path: inputPath,
            imports,
            exports,
            functions,
            classes,
            interfaces,
          }, null, 2),
        }],
      };
    }
  );
}
```

Registrar em `src/server.ts`:

```typescript
import { registerExplainFileStructure } from './tools/explainFileStructure.js';
registerExplainFileStructure(server);
```

---

## Verificação

### Teste no VS Code (Copilot Chat — modo Agent)

| Prompt | Resultado Esperado |
|---|---|
| "Explique a estrutura do arquivo src/lib/pathGuard.ts" | JSON com 1 function (guardPath), 2 imports, 1 export |
| "Explique a estrutura de src/server.ts" | Imports e configuração do server listados |
| "Explique src/arquivo-inexistente.ts" | Erro de arquivo não encontrado |
| "Explique ../../etc/passwd" | Erro: Access denied (pathGuard) |
