import { Prisma } from "@prisma/client";
import { prisma } from "../PrismaClient";
import { PrismaExecutor } from "./PrismaExecutor";

export class RepositorioUsuarioPrisma {
  constructor(private readonly db: PrismaExecutor = prisma) {}

  public criar(dados: Prisma.UsuarioCreateInput) {
    return this.db.usuario.create({ data: dados });
  }

  public buscarPorId(id: string) {
    return this.db.usuario.findUnique({ where: { id } });
  }

  public buscarPorNome(usuario: string) {
    return this.db.usuario.findUnique({ where: { usuario } });
  }

  public listar(criadoPorId?: string) {
    return this.db.usuario.findMany({
      ...(criadoPorId ? { where: { criadoPorId } } : {}),
      orderBy: { usuario: "asc" }
    });
  }

  public atualizarSeVersao(id: string, versaoEsperada: number, dados: Prisma.UsuarioUpdateInput) {
    return this.db.usuario.updateMany({ where: { id, versao: versaoEsperada }, data: dados });
  }

  public async registrarAcesso(id: string, versaoEsperada: number, ultimoAcesso: Date) {
    const resultado = await this.db.usuario.updateMany({
      where: { id, versao: versaoEsperada, ativo: true },
      data: { ultimoAcesso }
    });
    return resultado.count === 1;
  }
}
