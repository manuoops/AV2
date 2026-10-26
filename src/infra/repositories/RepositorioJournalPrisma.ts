import { Prisma } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

export class RepositorioJournalPrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public registrar(dados: Prisma.JournalTransacaoCreateInput) {
    return this.db.journalTransacao.create({ data: dados });
  }

  public buscarPorId(id: string) {
    return this.db.journalTransacao.findUnique({ where: { id } });
  }

  public listarPorPeriodo(dataInicio: Date, dataFim: Date, skip = 0, take = 100) {
    return this.db.journalTransacao.findMany({
      where: { timestamp: { gte: dataInicio, lte: dataFim } },
      skip,
      take,
      orderBy: { timestamp: "desc" }
    });
  }
}
