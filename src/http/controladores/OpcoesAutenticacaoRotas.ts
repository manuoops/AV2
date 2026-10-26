import { PapelUsuario } from "@prisma/client";
import { FastifyInstance } from "fastify";

export function criarOpcoesAutenticacaoRotas(app: FastifyInstance) {
  return {
    autenticado: { preHandler: [app.autenticar] },
    gestorOrganizacao: {
      preHandler: [app.autenticar, app.exigirPapeis([PapelUsuario.OPERADOR_CADASTRO, PapelUsuario.ADMINISTRADOR])]
    },
    gestorAlmoxarifado: {
      preHandler: [app.autenticar, app.exigirPapeis([PapelUsuario.GESTOR_ALMOXARIFADO, PapelUsuario.ADMINISTRADOR])]
    }
  };
}
