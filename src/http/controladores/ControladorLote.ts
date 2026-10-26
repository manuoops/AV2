import { FastifyInstance } from "fastify";
import { ServicoLotePrisma } from "../../services/ServicoLotePrisma";
import { criarOpcoesAutenticacaoRotas } from "./OpcoesAutenticacaoRotas";

export function registrarRotasLote(app: FastifyInstance, lotes: ServicoLotePrisma): void {
  const { autenticado, gestorAlmoxarifado } = criarOpcoesAutenticacaoRotas(app);

  app.post<{ Body: { dataEntrada?: string; organizacaoId: string; notaFiscal: string; transportadora: string; observacoes?: string } }>("/lotes", { ...gestorAlmoxarifado }, async (request, reply) =>
    reply.code(201).send(await lotes.criarLote({ ...request.body, dataEntrada: request.body.dataEntrada ? new Date(request.body.dataEntrada) : new Date() }, request.user.usuario)));
  app.get<{ Querystring: { inicio: string; fim: string; skip?: string; take?: string } }>("/lotes", { ...autenticado }, async (request) =>
    lotes.consultarLotePorPeriodo(new Date(request.query.inicio), new Date(request.query.fim), Number(request.query.skip ?? 0), Number(request.query.take ?? 100)));
  app.get<{ Params: { id: string } }>("/lotes/:id", { ...autenticado }, async (request) => {
    const lote = await lotes.buscarLote(request.params.id);
    if (!lote) throw new Error(`Lote '${request.params.id}' nao encontrado.`);
    return lote;
  });
  app.post<{ Params: { id: string }; Body: { versao: number } }>("/lotes/:id/processar-triagem", {
    ...gestorAlmoxarifado,
    schema: { body: { type: "object", required: ["versao"], additionalProperties: false, properties: {
      versao: { type: "integer", minimum: 1 }
    } } }
  }, async (request) => lotes.processarTriagem(request.params.id, request.body.versao, request.user.usuario));
  app.get<{ Params: { id: string } }>("/lotes/:id/relatorio-triagem", { ...autenticado }, async (request) =>
    ({ relatorio: await lotes.gerarRelatorioTriagem(request.params.id) }));
}
