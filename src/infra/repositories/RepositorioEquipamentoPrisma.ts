import { Prisma, StatusRastreamento, TipoEquipamento } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

const incluirHistorico = {
  movimentacoes: { orderBy: { dataHora: "asc" as const } }
};

export class RepositorioEquipamentoPrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public criar(dados: Prisma.EquipamentoUncheckedCreateInput) {
    return this.db.equipamento.create({ data: dados, include: incluirHistorico });
  }

  public buscarPorId(id: string) {
    return this.db.equipamento.findUnique({ where: { id }, include: incluirHistorico });
  }

  public buscarPorCodigoBarras(codigoBarrasInterno: string) {
    return this.db.equipamento.findUnique({ where: { codigoBarrasInterno }, include: incluirHistorico });
  }

  public listarPorLote(loteId: string, skip = 0, take = 100) {
    return this.db.equipamento.findMany({
      where: { loteId },
      skip,
      take,
      orderBy: { posicaoNoLote: "asc" },
      include: incluirHistorico
    });
  }

  public contarPorTipo(tipo: TipoEquipamento) {
    return this.db.equipamento.count({ where: { tipo } });
  }

  public listarPorStatus(statusRastreamento: StatusRastreamento, skip = 0, take = 100) {
    return this.db.equipamento.findMany({
      where: { statusRastreamento },
      skip,
      take,
      orderBy: [{ loteId: "asc" }, { posicaoNoLote: "asc" }]
    });
  }

  public resumirPorStatus(statusRastreamento: StatusRastreamento) {
    return this.db.equipamento.aggregate({
      where: { statusRastreamento },
      _count: { _all: true },
      _sum: { pesoQuilogramas: true }
    });
  }

  public contarPorLote(loteId: string) {
    return this.db.equipamento.count({ where: { loteId } });
  }

  public atualizarSeVersao(id: string, versaoEsperada: number, dados: Prisma.EquipamentoUncheckedUpdateInput) {
    return this.db.equipamento.updateMany({
      where: { id, versao: versaoEsperada },
      data: dados
    });
  }
}
