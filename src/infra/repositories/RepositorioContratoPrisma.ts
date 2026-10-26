import { Prisma } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

export class RepositorioContratoPrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public criar(dados: Prisma.ContratoUncheckedCreateInput) {
    return this.db.contrato.create({ data: dados });
  }

  public buscarPorId(id: string) {
    return this.db.contrato.findUnique({ where: { id } });
  }

  public buscarPorOrganizacao(organizacaoId: string) {
    return this.db.contrato.findUnique({ where: { organizacaoId } });
  }

  public listarPorPeriodo(dataInicio: Date, dataFim: Date, skip = 0, take = 100) {
    return this.db.contrato.findMany({
      where: { dataAssinatura: { gte: dataInicio, lte: dataFim } },
      skip,
      take,
      orderBy: { dataAssinatura: "asc" },
      include: { organizacao: true }
    });
  }

  public atualizarSeVersao(id: string, versaoEsperada: number, dados: Prisma.ContratoUncheckedUpdateInput) {
    return this.db.contrato.updateMany({ where: { id, versao: versaoEsperada }, data: dados });
  }
}
