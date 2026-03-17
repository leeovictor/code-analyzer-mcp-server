import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SyntaxKind } from 'ts-morph';
import { getAllSourceFiles } from '../lib/astCache.js';
import path from 'path';
import { ROOT_DIR } from '../config.js';

const MAX_SNIPPET_LINES = 60;

function truncateSnippet(text: string): string {
  const lines = text.split('\n');
  if (lines.length <= MAX_SNIPPET_LINES) return text;
  return lines.slice(0, MAX_SNIPPET_LINES).join('\n') + `\n... [truncado: ${lines.length - MAX_SNIPPET_LINES} linhas omitidas]`;
}

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
