import { Prisma } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

export class RepositorioOrganizacaoPrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public criar(dados: Prisma.OrganizacaoCreateInput) {
    return this.db.organizacao.create({ data: dados });
  }

  public buscarPorId(id: string) {
    return this.db.organizacao.findUnique({ where: { id } });
  }

  public buscarPorCnpj(cnpj: string) {
    return this.db.organizacao.findUnique({ where: { cnpj } });
  }

  public listarAtivas(skip = 0, take = 100) {
    return this.db.organizacao.findMany({
      where: { ativo: true },
      skip,
      take,
      orderBy: { razaoSocial: "asc" }
    });
  }

  public atualizarSeVersao(id: string, versaoEsperada: number, dados: Prisma.OrganizacaoUpdateInput) {
    return this.db.organizacao.updateMany({ where: { id, versao: versaoEsperada }, data: dados });
  }
}
