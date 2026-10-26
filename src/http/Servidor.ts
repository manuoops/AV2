import Fastify, { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { ambiente } from "../config/Ambiente";
import { prisma } from "../infra/PrismaClient";
import { executarTransacao } from "../infra/TransacaoPrisma";
import { PrismaExecutor } from "../infra/repositories/PrismaExecutor";
import { RepositorioUsuarioPrisma } from "../infra/repositories/RepositorioUsuarioPrisma";
import { ServicoAutenticacaoPrisma } from "../services/ServicoAutenticacaoPrisma";
import { registrarAutenticacaoJwt } from "./AutenticacaoJwt";
import { registrarRotasAutenticacao } from "./controladores/ControladorAutenticacao";
import { registrarRotasOrganizacao } from "./controladores/ControladorOrganizacao";
import { registrarRotasContrato } from "./controladores/ControladorContrato";
import { registrarRotasLote } from "./controladores/ControladorLote";
import { registrarRotasEquipamento } from "./controladores/ControladorEquipamento";
import { registrarRotasRelatorio } from "./controladores/ControladorRelatorio";
import { ServicoOrganizacaoPrisma } from "../services/ServicoOrganizacaoPrisma";
import { ServicoContratoPrisma } from "../services/ServicoContratoPrisma";
import { ServicoLotePrisma } from "../services/ServicoLotePrisma";
import { ServicoEquipamentoPrisma } from "../services/ServicoEquipamentoPrisma";
import { ServicoRelatorioPrisma } from "../services/ServicoRelatorioPrisma";

export interface OpcoesServidor {
  logger?: boolean;
  fastify?: FastifyInstance;
  database?: PrismaExecutor;
  transacionar?: <T>(operacao: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
}

const openApi = {
  openapi: "3.0.3",
  info: { title: "GreenCode API", version: "1.0.0", description: "API de logística reversa de equipamentos eletrônicos." },
  servers: [{ url: "/" }],
  components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
  paths: {
    "/health": { get: { summary: "Verifica disponibilidade", responses: { "200": { description: "Servidor ativo" } } } },
    "/organizacoes": { get: { security: [{ bearerAuth: [] }], summary: "Lista organizacoes ativas", responses: { "200": { description: "Organizacoes" } } }, post: { security: [{ bearerAuth: [] }], summary: "Cadastra organizacao", responses: { "201": { description: "Organizacao criada" } } } },
    "/organizacoes/{id}": { get: { security: [{ bearerAuth: [] }], summary: "Consulta organizacao", responses: { "200": { description: "Organizacao" }, "404": { description: "Nao encontrada" } } } },
    "/organizacoes/{id}/endereco": { patch: { security: [{ bearerAuth: [] }], summary: "Altera endereco", responses: { "200": { description: "Endereco alterado" } } } },
    "/organizacoes/{id}/desativar": { patch: { security: [{ bearerAuth: [] }], summary: "Desativa organizacao", responses: { "200": { description: "Organizacao desativada" } } } },
    "/contratos": { get: { security: [{ bearerAuth: [] }], summary: "Consulta contrato", responses: { "200": { description: "Contrato" } } }, post: { security: [{ bearerAuth: [] }], summary: "Cadastra contrato", responses: { "201": { description: "Contrato criado" } } } },
    "/contratos/{organizacaoId}/renovar": { patch: { security: [{ bearerAuth: [] }], summary: "Renova contrato", responses: { "200": { description: "Contrato renovado" } } } },
    "/lotes": { get: { security: [{ bearerAuth: [] }], summary: "Consulta lotes", responses: { "200": { description: "Lotes" } } }, post: { security: [{ bearerAuth: [] }], summary: "Cadastra lote", responses: { "201": { description: "Lote criado" } } } },
    "/lotes/{id}": { get: { security: [{ bearerAuth: [] }], summary: "Consulta lote", responses: { "200": { description: "Lote" } } } },
    "/lotes/{id}/processar-triagem": { post: { security: [{ bearerAuth: [] }], summary: "Processa triagem do lote", responses: { "200": { description: "Lote processado" } } } },
    "/lotes/{id}/relatorio-triagem": { get: { security: [{ bearerAuth: [] }], summary: "Gera relatorio de triagem", responses: { "200": { description: "Relatorio" } } } },
    "/equipamentos": { post: { security: [{ bearerAuth: [] }], summary: "Cadastra equipamento", responses: { "201": { description: "Equipamento criado" } } } },
    "/equipamentos/{id}": { get: { security: [{ bearerAuth: [] }], summary: "Consulta equipamento", responses: { "200": { description: "Equipamento" } } } },
    "/equipamentos/{id}/rastreabilidade": { get: { security: [{ bearerAuth: [] }], summary: "Consulta rastreabilidade", responses: { "200": { description: "Historico" } } } },
    "/equipamentos/{id}/estado": { patch: { security: [{ bearerAuth: [] }], summary: "Atualiza estado fisico", responses: { "200": { description: "Equipamento atualizado" }, "409": { description: "Conflito de versao" } } } },
    "/equipamentos/{id}/status": { patch: { security: [{ bearerAuth: [] }], summary: "Atualiza status", responses: { "200": { description: "Equipamento atualizado" }, "409": { description: "Conflito de versao" } } } },
    "/equipamentos/{id}/movimentacoes": { post: { security: [{ bearerAuth: [] }], summary: "Registra movimentacao", responses: { "201": { description: "Movimentacao criada" } } } },
    "/relatorios/status": { get: { security: [{ bearerAuth: [] }], summary: "Relatorio por status", responses: { "200": { description: "Relatorio" } } } },
    "/relatorios/organizacao": { get: { security: [{ bearerAuth: [] }], summary: "Relatorio por organizacao e periodo", responses: { "200": { description: "Relatorio" } } } },
    "/relatorios/financeiro": { get: { security: [{ bearerAuth: [] }], summary: "Relatorio financeiro", responses: { "200": { description: "Relatorio" } } } },
    "/auth/login": { post: { summary: "Autentica usuário e retorna JWT", responses: { "200": { description: "Token emitido" }, "401": { description: "Credenciais inválidas" } } } },
    "/auth/me": { get: { security: [{ bearerAuth: [] }], summary: "Retorna usuário autenticado", responses: { "200": { description: "Usuário autenticado" }, "401": { description: "Token inválido" } } } },
    "/auth/usuarios": { get: { security: [{ bearerAuth: [] }], summary: "Lista usuários permitidos ao solicitante", responses: { "200": { description: "Lista de usuários" } } }, post: { security: [{ bearerAuth: [] }], summary: "Cadastra usuário (somente administrador)", responses: { "201": { description: "Usuário criado" }, "400": { description: "Dados inválidos" }, "403": { description: "Acesso negado" } } } },
    "/auth/usuarios/{id}/desativar": { patch: { security: [{ bearerAuth: [] }], summary: "Desativa usuário (administrador)", responses: { "200": { description: "Usuário desativado" }, "403": { description: "Acesso negado" } } } },
    "/auth/senha": { patch: { security: [{ bearerAuth: [] }], summary: "Altera senha do usuário autenticado", responses: { "204": { description: "Senha alterada" }, "401": { description: "Senha atual inválida" } } } }
  }
} as const;

export async function criarServidor(opcoes: OpcoesServidor = {}): Promise<FastifyInstance> {
  const app = opcoes.fastify ?? Fastify({ logger: opcoes.logger ?? false, bodyLimit: 1024 * 1024 });
  const database = opcoes.database ?? prisma;
  const transacionar = opcoes.transacionar ?? executarTransacao;
  const autenticacao = new ServicoAutenticacaoPrisma(new RepositorioUsuarioPrisma(database));
  await registrarAutenticacaoJwt(app, { repositorio: new RepositorioUsuarioPrisma(database) });
  registrarRotasAutenticacao(app, autenticacao);

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/openapi.json", async () => openApi);
  app.get("/", async () => ({ nome: "GreenCode API", documentacao: "/openapi.json", saude: "/health" }));

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ erro: "Rota nao encontrada." }));
  app.setErrorHandler((erro, _request, reply) => {
    const statusCode = (erro as Error & { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send({ erro: erro instanceof Error ? erro.message : "Requisicao invalida." });
    }
    if ((erro as { validation?: unknown }).validation) {
      return reply.code(400).send({ erro: "Requisicao invalida.", detalhes: (erro as Error).message });
    }
    if (erro instanceof Prisma.PrismaClientKnownRequestError) {
      if (erro.code === "P2002") return reply.code(409).send({ erro: "Registro duplicado." });
      if (erro.code === "P2025") return reply.code(404).send({ erro: "Registro nao encontrado." });
      if (erro.code === "P2003" || erro.code === "P2014") return reply.code(400).send({ erro: "Relacionamento invalido." });
    }
    if (erro instanceof Error) {
      if (/ja existe|j.+ existe|ja possui|j.+ possui|conflito de vers/i.test(erro.message)) {
        return reply.code(409).send({ erro: erro.message });
      }
      if (/nao encontrado|não encontrado|nao encontrada|não encontrada/i.test(erro.message)) {
        return reply.code(404).send({ erro: erro.message });
      }
      if (/obrigat|inval|deve |nao pode|não pode|posterior|futura|positivo|vazio|vazia|necessaria|necessaria/i.test(erro.message)) {
        return reply.code(400).send({ erro: erro.message });
      }
    }
    app.log.error(erro);
    return reply.code(500).send({ erro: "Erro interno do servidor." });
  });

  const organizacoes = new ServicoOrganizacaoPrisma(transacionar, database);
  const contratos = new ServicoContratoPrisma(transacionar, database);
  const lotes = new ServicoLotePrisma(transacionar, database);
  const equipamentos = new ServicoEquipamentoPrisma(transacionar, database);
  const relatorios = new ServicoRelatorioPrisma(database);

  registrarRotasOrganizacao(app, organizacoes);
  registrarRotasContrato(app, contratos);
  registrarRotasLote(app, lotes);
  registrarRotasEquipamento(app, equipamentos);
  registrarRotasRelatorio(app, relatorios);

  return app;
}

export async function iniciarServidor(): Promise<FastifyInstance> {
  const app = await criarServidor({ logger: true });
  try {
    await app.listen({ port: ambiente.porta, host: "0.0.0.0" });
    app.log.info(`GreenCode API ouvindo na porta ${ambiente.porta}`);
    return app;
  } catch (erro) {
    await app.close();
    await prisma.$disconnect();
    throw erro;
  }
}
