# GreenCode API

API para gestão de logística reversa de equipamentos eletrônicos, construída com Fastify, Prisma e PostgreSQL.

## Requisitos

- Node.js 20 ou superior
- PostgreSQL compatível com a URL do Prisma

## Configuração local

1. Instale as dependências: `npm install`.
2. Copie `env.example` para `.env`.
3. Preencha `DATABASE_URL` com as credenciais do PostgreSQL e defina um `JWT_SECRET` aleatório com pelo menos 32 bytes. Para usar o seed, defina também `SEED_ADMIN_PASSWORD` com pelo menos 12 bytes.
4. Gere o cliente e aplique as migrações:

   ```sh
   npm run db:generate
   npm run db:migrate
   ```

5. Crie o administrador e os registros demonstrativos:

   ```sh
   npm run db:seed
   ```

O seed cria o usuário `admin` somente se ele ainda não existir. A senha é definida em `SEED_ADMIN_PASSWORD`; executar o seed outra vez não troca a senha já cadastrada. Também cria uma organização, seu contrato, três lotes em etapas diferentes e oito equipamentos com estados de rastreamento e condições físicas variados. O seed contém dados de demonstração e não roda quando `NODE_ENV=production`.

## Executar

Para desenvolvimento:

```sh
npm run dev
```

Para compilar e iniciar:

```sh
npm run build
npm start
```

A API escuta em `0.0.0.0` na porta definida por `PORT` (padrão `3000`). A raiz `/` apresenta os caminhos de saúde e documentação. O documento OpenAPI está disponível em `/openapi.json`.

## Rotas principais

Todas as rotas de negócio exigem JWT Bearer, obtido em `POST /auth/login`.

| Recurso | Rotas |
| --- | --- |
| Autenticação e usuários | `/auth/login`, `/auth/me`, `/auth/usuarios`, `/auth/senha` |
| Organizações | `/organizacoes` e `/organizacoes/:id` |
| Contratos | `/contratos` e `/contratos/:organizacaoId/renovar` |
| Lotes | `/lotes`, `/lotes/:id/processar-triagem`, `/lotes/:id/relatorio-triagem` |
| Equipamentos | `/equipamentos`, `/equipamentos/:id/rastreabilidade`, `/equipamentos/:id/status`, `/equipamentos/:id/estado`, `/equipamentos/:id/movimentacoes` |
| Relatórios | `/relatorios/status`, `/relatorios/organizacao`, `/relatorios/financeiro` |

Somente `ADMINISTRADOR` pode cadastrar ou desativar usuários. Os demais papéis recebem `403 Forbidden` ao tentar cadastrar. O administrador pode listar todos os usuários; os outros papéis veem apenas usuários cadastrados por eles, quando existirem registros desse tipo. Os papéis `ADMINISTRADOR` e `OPERADOR_CADASTRO` podem cadastrar e gerenciar organizações e contratos. `ADMINISTRADOR` e `GESTOR_ALMOXARIFADO` podem cadastrar e processar lotes e equipamentos. Usuários autenticados podem consultar e gerar relatórios.

As alterações de endereço e desativação de organização, renovação de contrato, processamento de triagem e desativação de usuário exigem o campo `versao` atual do registro no corpo da requisição. A troca de senha usa a versão incluída no JWT. Se o registro tiver mudado desde a leitura, a API responde `409 Conflict`; consulte o registro novamente e reenvie a alteração com a nova versão.

## Organização do código

- `src/http/Servidor.ts` configura a aplicação, o tratamento de erros e as dependências dos serviços.
- `src/http/controladores/` registra as rotas HTTP separadas por recurso e encaminha as operações aos serviços.
- `src/services/` contém regras de negócio; `src/infra/repositories/` implementa o acesso ao PostgreSQL com Prisma.
- `src/http/AutenticacaoJwt.ts` configura o JWT e os hooks de autenticação; as rotas de login e usuários ficam no controlador de autenticação.

## Banco de dados

- `npm run db:migrate`: cria/aplica migrações de desenvolvimento.
- `npm run db:deploy`: aplica migrações existentes em ambiente de implantação.
- `npm run db:status`: mostra o estado das migrações.

As regras `CHECK` e os gatilhos PostgreSQL estão versionados em `prisma/migrations`. Não aplique `prisma/regras-de-negocio.sql` manualmente depois que as migrações já tiverem sido aplicadas.

## Testes

```sh
npm test -- --runInBand
npm run test:journey
npm run lint
npm run build
```

Os testes de integração usam o PostgreSQL indicado por `DATABASE_URL`. A jornada da API usa uma transação revertida para não deixar os dados de teste no banco.

## Dados legados

A CLI e a persistência em arquivos JSON foram removidas. O diretório `data/` existente não é lido nem migrado automaticamente. Preserve-o até exportar manualmente qualquer dado local que ainda seja necessário.
