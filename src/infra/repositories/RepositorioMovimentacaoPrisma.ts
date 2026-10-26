import { Prisma } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

export class RepositorioMovimentacaoPrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public registrar(dados: Prisma.MovimentacaoUncheckedCreateInput) {
    return this.db.movimentacao.create({ data: dados });
  }

  public listarPorEquipamento(equipamentoId: string, skip = 0, take = 100) {
    return this.db.movimentacao.findMany({
      where: { equipamentoId },
      skip,
      take,
      orderBy: { dataHora: "asc" }
    });
  }
}
