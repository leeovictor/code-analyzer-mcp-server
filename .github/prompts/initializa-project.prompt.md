Quero criar um MCP (Model Context Protocol) server para análise de codebases de software.

Objetivo:
Criar um servidor que exponha ferramentas que permitam a um LLM explorar, entender e analisar uma base de código local. O MCP server deve permitir navegar na estrutura do projeto, buscar código, entender dependências e analisar relações entre funções e arquivos.

Tecnologia desejada:
- Node.js
- TypeScript
- usar o SDK oficial do Model Context Protocol
- parser de AST para JavaScript/TypeScript (ex: ts-morph ou babel)

O servidor deve funcionar sobre um diretório local contendo um projeto.

Ferramentas que o MCP server deve export:

1) list_files
Descrição:
Lista todos os arquivos do projeto.

Parâmetros:
- path (opcional): caminho relativo

Retorno:
- lista de arquivos e diretórios

---

2) search_code

Descrição:
Busca texto ou padrão dentro do código.

Parâmetros:
- query: string
- filePattern (opcional): ex "*.ts"

Retorno:
- arquivos encontrados
- linhas relevantes
- contexto de algumas linhas antes/depois

---

3) get_file_content

Descrição:
Retorna o conteúdo de um arquivo.

Parâmetros:
- path: caminho do arquivo

Retorno:
- conteúdo do arquivo
- número de linhas

---

4) find_function

Descrição:
Busca uma função pelo nome usando AST.

Parâmetros:
- name: nome da função

Retorno:
- arquivo
- assinatura da função
- trecho de código
- posição no arquivo

---

5) find_references

Descrição:
Encontra onde uma função ou símbolo é usado.

Parâmetros:
- symbol: nome da função ou variável

Retorno:
- lista de arquivos
- linha da referência
- trecho do código

---

6) dependency_graph

Descrição:
Analisa imports e gera o grafo de dependências entre arquivos.

Parâmetros:
- entryFile (opcional)

Retorno:
- lista de dependências
- relações entre arquivos

---

7) explain_file_structure

Descrição:
Analisa um arquivo e retorna:

- funções
- classes
- interfaces
- imports
- exports

Usar AST para isso.

Parâmetros:
- path

Retorno:
estrutura JSON com os elementos do arquivo.

---

Requisitos de implementação:

- usar ts-morph para parsing AST
- evitar ler arquivos fora do diretório raiz
- limitar tamanho máximo de resposta
- retornar dados estruturados (JSON)

Estrutura do projeto sugerida:

/mcp-code-analyzer
  /src
    server.ts
    config.ts
    /tools
       listFiles.ts
       searchCode.ts
       getFileContent.ts
       findFunction.ts
       findReferences.ts
       dependencyGraph.ts
       explainFileStructure.ts

Extras interessantes:

- cache de parsing AST
- indexação inicial do projeto
- suporte a múltiplas linguagens no futuro

Saída esperada:

- estrutura do projeto
- implementação do MCP server
- implementação de cada tool
- instruções para rodar