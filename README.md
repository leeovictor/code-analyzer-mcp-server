# MCP Server AI Test

Este projeto é um servidor MCP (Model Context Protocol) para análise de codebases de software, escrito em Node.js e TypeScript (ESM). Ele expõe ferramentas que permitem a um LLM explorar, navegar e analisar um projeto local, incluindo estrutura de arquivos, busca de código, análise AST, dependências e muito mais.

## Tecnologias Utilizadas
- Node.js + TypeScript (ESM)
- @modelcontextprotocol/sdk
- ts-morph (AST parser)

## Estrutura do Projeto
- `src/` — Código-fonte principal
  - `server.ts` — Ponto de entrada do servidor MCP
  - `config.ts` — Configurações globais
  - `lib/` — Utilitários internos (cache, segurança de paths)
  - `tools/` — Implementação das ferramentas MCP
- `specs/` — Especificações detalhadas por fase de implementação
- `package.json`, `tsconfig.json` — Configuração do projeto

## Como usar
1. Instale as dependências:
   ```bash
   npm install
   ```
2. Compile o projeto:
   ```bash
   npm run build
   ```
3. Inicie o servidor MCP:
   ```bash
   npm start
   ```

> **Nota:** Este é um projeto de estudo, criado para fins de aprendizado e experimentação.
