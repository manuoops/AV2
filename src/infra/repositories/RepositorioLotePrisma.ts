import { Prisma } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

export class RepositorioLotePrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public criar(dados: Prisma.LoteUncheckedCreateInput) {
    return this.db.lote.create({ data: dados });
  }

  public buscarPorId(id: string) {
    return this.db.lote.findUnique({ where: { id }, include: { equipamentos: true } });
  }

  public listarPorPeriodo(dataInicio: Date, dataFim: Date, skip = 0, take = 100) {
    return this.db.lote.findMany({
      where: { dataEntrada: { gte: dataInicio, lte: dataFim } },
      skip,
      take,
      orderBy: { dataEntrada: "asc" },
      include: { equipamentos: true }
    });
  }

  public listarPorOrganizacaoEPeriodo(organizacaoId: string, dataInicio: Date, dataFim: Date, skip = 0, take = 100) {
    return this.db.lote.findMany({
      where: { organizacaoId, dataEntrada: { gte: dataInicio, lte: dataFim } },
      skip,
      take,
      orderBy: { dataEntrada: "asc" },
      include: { equipamentos: true }
    });
  }

  public atualizarSeVersao(id: string, versaoEsperada: number, dados: Prisma.LoteUncheckedUpdateInput) {
    return this.db.lote.updateMany({ where: { id, versao: versaoEsperada }, data: dados });
  }
}
