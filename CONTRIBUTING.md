# Guia de Contribuição

Obrigado por considerar contribuir para o FotoExpress! Este documento fornece diretrizes e instruções para contribuir com o projeto.

## Como Contribuir

### Reportando Bugs

Antes de criar um relatório de bug, verifique o histórico de problemas, pois você pode descobrir que o erro já foi relatado. Se você encontrar um bug, crie um relatório de bug que inclua:

- **Resumo**: Use um título descritivo
- **Descrição exata**: Forneça uma descrição passo a passo para reproduzir o problema
- **Comportamento observado**: Descreva o que você viu
- **Comportamento esperado**: Descreva o que você esperava ver
- **Screenshots**: Se possível, inclua screenshots
- **Ambiente**: Seu sistema operacional, versão do navegador, etc.

### Sugestões de Melhorias

Se você tem uma ideia para uma funcionalidade nova ou melhorias em uma existente:

1. Use um título descritivo
2. Forneça uma descrição detalhada da melhoria sugerida
3. Cite exemplos específicos de como a melhoria seria útil
4. Liste algumas funcionalidades similares em outros softwares, se houver

## Configuração do Desenvolvimento

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Git
- PostgreSQL 13+

### Setup Inicial

1. **Fork o repositório** para sua conta GitHub
2. **Clone seu fork** localmente:
   ```bash
   git clone https://github.com/seu-usuario/fotoexpress.git
   cd fotoexpress
   ```

3. **Crie uma branch** para sua feature:
   ```bash
   git checkout -b feature/sua-feature
   # ou para bugfix:
   git checkout -b fix/seu-bugfix
   ```

4. **Instale dependências**:
   ```bash
   npm install
   ```

5. **Configure variáveis de ambiente**:
   ```bash
   cp .env.example .env
   # Edite .env com suas configurações
   ```

## Padrões de Código

### Estilo de Código

- Use 2 espaços para indentação
- Nomes de variáveis em camelCase
- Nomes de arquivos em kebab-case
- Nomes de componentes em PascalCase
- Use TypeScript quando possível

### Commits

Use mensagens de commit claras e descritivas:

```bash
git commit -m "feat: adiciona reconhecimento facial para busca de fotos"
git commit -m "fix: corrige erro no upload de vídeos"
git commit -m "docs: atualiza documentação da API"
git commit -m "style: formata código conforme ESLint"
```

**Tipos de commit recomendados:**
- `feat:` Nova funcionalidade
- `fix:` Correção de bug
- `docs:` Alterações na documentação
- `style:` Formatação, sem alterações de lógica
- `refactor:` Refatoração de código
- `perf:` Melhorias de performance
- `test:` Adicionar ou atualizar testes

### Testes

- Escreva testes para novas funcionalidades
- Execute testes antes de fazer commit:
  ```bash
  npm test
  ```

- Mantenha a cobertura de testes acima de 80%

### Linting

- Execute linter antes de fazer push:
  ```bash
  npm run lint
  ```

## Processo de Pull Request

1. **Atualize sua branch** com a branch principal:
   ```bash
   git rebase origin/main
   ```

2. **Push sua branch** para seu fork:
   ```bash
   git push origin feature/sua-feature
   ```

3. **Crie um Pull Request** com uma descrição clara:
   - Descreva o que foi feito
   - Referencie issues relacionadas (ex: "Closes #123")
   - Inclua screenshots se relevante

4. **Responda a revisões de código** com prontidão

## Padrões de Nomenclatura

### Branches
- `feature/nome-da-feature` - Para novas funcionalidades
- `fix/nome-do-bugfix` - Para correções
- `docs/nome-da-doc` - Para documentação
- `refactor/nome-do-refactor` - Para refatorações

### Pull Requests
- Formato: `[TYPE] Descrição clara do que foi feito`
- Exemplo: `[FEATURE] Adiciona autenticação via OAuth2`

## Dúvidas?

- 📧 Email: contato@fotoexpress.com
- 💬 Discussões: Use a aba Discussions do GitHub
- 🐛 Issues: Para reportar bugs ou sugerir melhorias

## Código de Conduta

Esperamos que todos os contribuidores:
- Sejam respeitosos e inclusivos
- Não tolerem assédio de qualquer tipo
- Respeitem os direitos autorais e propriedade intelectual
- Sigam as leis locais

Obrigado por contribuir! 🎉
