# Segurança

Este documento descreve as decisões de segurança implementadas pela GreenCode API e os cuidados necessários ao executar o projeto. A aplicação é um projeto acadêmico e não substitui uma revisão de segurança antes de uma implantação real.

## Decisões de arquitetura

- **Separação entre HTTP, serviços e repositórios:** controladores validam e encaminham requisições; serviços aplicam regras de negócio; repositórios acessam o PostgreSQL pelo Prisma. Essa divisão mantém as regras fora das rotas, facilita testar políticas sem depender do protocolo HTTP e concentra o acesso a dados.
- **Prisma e PostgreSQL:** o banco relacional mantém relacionamentos e restrições compartilhadas entre todas as operações. As migrações versionam a estrutura e as regras que o Prisma não expressa diretamente.
- **Transações para operações compostas:** quando uma alteração envolve mais de um registro, como atualizar um equipamento, registrar uma movimentação e gravar o Journal, as gravações usam a mesma transação. Assim, ou todos os efeitos são confirmados, ou nenhum deles é persistido.
- **Journal para auditoria:** alterações de organização, contrato, lote e equipamento registram operação, entidade, dados relevantes e usuário responsável dentro da transação correspondente. O evento acompanha a alteração confirmada e não fica registrado quando ela sofre rollback. Senhas, hashes e tokens não devem ser incluídos nos dados de auditoria.
- **Movimentações imutáveis:** um gatilho PostgreSQL bloqueia atualização e exclusão de movimentações para preservar a trilha de localização do equipamento. Correções devem ser representadas por uma nova movimentação, sem apagar o registro anterior.
- **Concorrência otimista:** registros mutáveis possuem `versao`; uma alteração só é aceita se a versão recebida ainda for a atual. O compare-and-swap no banco evita sobrescrever silenciosamente uma atualização concorrente. A API responde `409 Conflict` quando a versão está desatualizada.
- **Restrições também no banco:** chaves únicas, `CHECKs` e gatilhos protegem invariantes mesmo se uma gravação não passar pelos serviços. A aplicação valida os dados para retornar erros compreensíveis; o banco permanece a última barreira para essas regras.

## Autenticação e autorização

- **Hash de senha com scrypt:** senhas são derivadas com scrypt, salt aleatório de 16 bytes, custo `N=32768`, bloco `r=8`, paralelismo `p=1` e resultado de 64 bytes. A função deliberadamente exige mais trabalho e memória que um hash rápido, dificultando ataques offline contra hashes roubados. O salt distinto impede que senhas iguais produzam o mesmo hash. Senhas em texto puro não são armazenadas.
- **JWT Bearer de curta duração:** o login emite tokens válidos por 15 minutos, com ID, nome, papel e versão da credencial. A validade curta limita o tempo de exposição de um token roubado.
- **Revogação consultando o usuário atual:** em cada requisição protegida, o hook JWT verifica assinatura e expiração e confere no banco se o usuário ainda existe, está ativo e mantém nome, papel e versão do token. Isso permite revogar sessões após desativação ou mudança de credencial, mesmo antes da expiração do token.
- **Papel aplicado por rota e no serviço:** operações protegidas exigem os papéis autorizados; por exemplo, somente `ADMINISTRADOR` cadastra ou desativa usuários. A política de cadastro também é verificada pelo serviço para não depender exclusivamente da rota HTTP.
- **Listagem de usuários:** administradores podem consultar todos os usuários; outros papéis recebem apenas registros associados ao seu ID de criador. Respostas públicas removem `hashSenha` antes de sair do serviço.
- **Validação em camadas:** schemas HTTP limitam formato, tamanho e campos aceitos; serviços validam regras de negócio; constraints PostgreSQL protegem invariantes. A camada HTTP não deve ser considerada a única defesa.

## Segredos e configuração

- Mantenha `.env` fora do controle de versão. Envie `env.example` apenas como modelo com valores fictícios; nunca use nele credenciais reais.
- `DATABASE_URL` contém credenciais do banco. Configure um usuário PostgreSQL dedicado com somente os privilégios necessários e use TLS para conexões remotas.
- `JWT_SECRET` precisa ser aleatório e ter pelo menos 32 bytes. A aplicação valida o tamanho e rejeita placeholders conhecidos durante a inicialização. Guarde o valor em um gerenciador de segredos no ambiente implantado.
- `SEED_ADMIN_PASSWORD` define a senha do administrador inicial e deve ter pelo menos 12 bytes. O comando de seed recusa `NODE_ENV=production`, cria dados demonstrativos e usa upserts sem substituir os dados já existentes, inclusive a senha do administrador.
- Não grave senhas, tokens, URLs com credenciais ou conteúdo de `.env` em issues, commits, logs ou mensagens. Se uma credencial for exposta, substitua-a no serviço correspondente e atualize a configuração da aplicação.

## Banco de dados e implantação

- Revise e aplique mudanças com migrações. Use `npm run db:deploy` para aplicar migrações existentes no ambiente implantado; evite alterações manuais que não possam ser reproduzidas.
- Faça backups regulares do PostgreSQL e proteja-os com controles de acesso e retenção apropriados. Teste a restauração dos backups.
- Não desative chaves únicas, `CHECKs` ou gatilhos das migrações para contornar uma validação.
- Fastify escuta em HTTP em `0.0.0.0`. Em qualquer ambiente acessível pela rede, coloque um proxy ou servidor com HTTPS à frente da API, restrinja a exposição de rede e proteja também a conexão remota ao PostgreSQL.
- Configure limites de acesso, monitoramento, atualização de dependências e política de retenção de logs conforme o ambiente. Não exponha logs de erro internos a clientes.

## Relato de vulnerabilidades

Não publique detalhes de uma vulnerabilidade nem credenciais reais em um repositório público. Encaminhe o relato em um canal privado aos mantenedores do projeto, incluindo passos mínimos para reproduzir sem dados pessoais ou segredos. Como este projeto não publica um endereço dedicado de segurança, use o canal privado disponibilizado pelo responsável pelo repositório.
