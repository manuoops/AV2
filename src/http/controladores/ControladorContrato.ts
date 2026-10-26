import { FastifyInstance } from "fastify";
import { ServicoContratoPrisma } from "../../services/ServicoContratoPrisma";
import { criarOpcoesAutenticacaoRotas } from "./OpcoesAutenticacaoRotas";

export function registrarRotasContrato(app: FastifyInstance, contratos: ServicoContratoPrisma): void {
  const { autenticado, gestorOrganizacao } = criarOpcoesAutenticacaoRotas(app);

  app.post<{ Body: { organizacaoId: string; dataVencimento: string; clausulas: string[]; valorMensal: number; renovacaoAutomatica?: boolean } }>("/contratos", { ...gestorOrganizacao }, async (request, reply) =>
    reply.code(201).send(await contratos.cadastrarContrato({ ...request.body, dataVencimento: new Date(request.body.dataVencimento), renovacaoAutomatica: request.body.renovacaoAutomatica ?? false }, request.user.usuario)));
  app.get<{ Querystring: { organizacaoId: string } }>("/contratos", { ...autenticado }, async (request) => {
    if (request.query.organizacaoId) return contratos.buscarContratoPorOrganizacao(request.query.organizacaoId);
    throw Object.assign(new Error("organizacaoId e obrigatorio."), { statusCode: 400 });
  });
  app.patch<{ Params: { organizacaoId: string }; Body: { dataVencimento: string; versao: number } }>("/contratos/:organizacaoId/renovar", {
    ...gestorOrganizacao,
    schema: { body: { type: "object", required: ["dataVencimento", "versao"], additionalProperties: false, properties: {
      dataVencimento: { type: "string", format: "date-time" }, versao: { type: "integer", minimum: 1 }
    } } }
  }, async (request) => contratos.renovarContrato(
    request.params.organizacaoId,
    new Date(request.body.dataVencimento),
    request.body.versao,
    request.user.usuario
  ));
}
