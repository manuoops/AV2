import { StatusRastreamento } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { ServicoRelatorioPrisma } from "../../services/ServicoRelatorioPrisma";
import { criarOpcoesAutenticacaoRotas } from "./OpcoesAutenticacaoRotas";

export function registrarRotasRelatorio(app: FastifyInstance, relatorios: ServicoRelatorioPrisma): void {
  const { autenticado } = criarOpcoesAutenticacaoRotas(app);

  app.get<{ Querystring: { status: StatusRastreamento } }>("/relatorios/status", { ...autenticado }, async (request) =>
    ({ relatorio: await relatorios.gerarRelatorioPorStatus(request.query.status) }));
  app.get<{ Querystring: { organizacaoId: string; inicio: string; fim: string } }>("/relatorios/organizacao", { ...autenticado }, async (request) =>
    ({ relatorio: await relatorios.gerarRelatorioPorOrganizacao(request.query.organizacaoId, { inicio: new Date(request.query.inicio), fim: new Date(request.query.fim) }) }));
  app.get<{ Querystring: { inicio: string; fim: string } }>("/relatorios/financeiro", { ...autenticado }, async (request) =>
    ({ relatorio: await relatorios.gerarRelatorioFinanceiro({ inicio: new Date(request.query.inicio), fim: new Date(request.query.fim) }) }));
}
