import { EstadoFisico, StatusRastreamento, TipoEquipamento } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { ServicoEquipamentoPrisma } from "../../services/ServicoEquipamentoPrisma";
import { criarOpcoesAutenticacaoRotas } from "./OpcoesAutenticacaoRotas";

export function registrarRotasEquipamento(app: FastifyInstance, equipamentos: ServicoEquipamentoPrisma): void {
  const { autenticado, gestorAlmoxarifado } = criarOpcoesAutenticacaoRotas(app);

  app.post<{ Body: { tipo: TipoEquipamento; marca: string; modelo: string; anoFabricacao: number; estadoFisico: EstadoFisico; pesoQuilogramas: number; loteId: string } }>("/equipamentos", { ...gestorAlmoxarifado }, async (request, reply) =>
    reply.code(201).send(await equipamentos.cadastrarEquipamento(request.body, request.user.usuario)));
  app.get<{ Params: { id: string } }>("/equipamentos/:id", { ...autenticado }, async (request) => {
    const equipamento = await equipamentos.buscarEquipamento(request.params.id);
    if (!equipamento) throw new Error(`Equipamento '${request.params.id}' nao encontrado.`);
    return equipamento;
  });
  app.get<{ Params: { id: string } }>("/equipamentos/:id/rastreabilidade", { ...autenticado }, async (request) =>
    equipamentos.rastrearEquipamento(request.params.id));
  app.patch<{ Params: { id: string }; Body: { estadoFisico: EstadoFisico; versao: number; justificativa?: string } }>("/equipamentos/:id/estado", { ...gestorAlmoxarifado }, async (request) =>
    equipamentos.atualizarEstadoFisico(request.params.id, request.body.estadoFisico, request.body.versao, request.user.usuario, request.body.justificativa));
  app.patch<{ Params: { id: string }; Body: { statusRastreamento: StatusRastreamento; versao: number; justificativa: string } }>("/equipamentos/:id/status", { ...gestorAlmoxarifado }, async (request) =>
    equipamentos.atualizarStatusRastreamento(request.params.id, request.body.statusRastreamento, request.body.justificativa, request.body.versao, request.user.usuario));
  app.post<{ Params: { id: string }; Body: { destino: string; responsavel: string; versao: number; observacao?: string } }>("/equipamentos/:id/movimentacoes", { ...gestorAlmoxarifado }, async (request, reply) =>
    reply.code(201).send(await equipamentos.registrarMovimentacao(request.params.id, request.body.destino, request.body.responsavel, request.body.versao, request.user.usuario, request.body.observacao)));
}
