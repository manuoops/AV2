import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "@fastify/jwt";
import { PapelUsuario } from "@prisma/client";
import { ambiente } from "../config/Ambiente";
import { RepositorioUsuarioPrisma } from "../infra/repositories/RepositorioUsuarioPrisma";

const DURACAO_TOKEN_SEGUNDOS = 15 * 60;

interface ClaimsAutenticacao {
  sub: string;
  usuario: string;
  papel: PapelUsuario;
  versao: number;
}

type HookAutenticacao = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: ClaimsAutenticacao;
    user: ClaimsAutenticacao;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    autenticar: HookAutenticacao;
    exigirPapeis: (papeisPermitidos: PapelUsuario[]) => HookAutenticacao;
  }
}

export interface OpcoesAutenticacaoJwt {
  repositorio?: RepositorioUsuarioPrisma;
}

export async function registrarAutenticacaoJwt(
  fastify: FastifyInstance,
  opcoes: OpcoesAutenticacaoJwt = {}
): Promise<void> {
  const repositorio = opcoes.repositorio ?? new RepositorioUsuarioPrisma();

  await fastify.register(jwt, {
    secret: ambiente.jwtSecret,
    sign: { expiresIn: DURACAO_TOKEN_SEGUNDOS }
  });

  fastify.decorate("autenticar", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ erro: "AutenticaÃ§Ã£o necessÃ¡ria." });
      return;
    }

    const claims = request.user;
    if (!claims.sub || !claims.usuario || !claims.papel || !Number.isInteger(claims.versao)) {
      await reply.code(401).send({ erro: "Token invÃ¡lido." });
      return;
    }

    const usuario = await repositorio.buscarPorId(claims.sub);
    if (
      !usuario ||
      !usuario.ativo ||
      usuario.versao !== claims.versao ||
      usuario.usuario !== claims.usuario ||
      usuario.papel !== claims.papel
    ) {
      await reply.code(401).send({ erro: "Token invÃ¡lido ou revogado." });
    }
  });

  fastify.decorate("exigirPapeis", (papeisPermitidos: PapelUsuario[]) => async (request, reply) => {
    if (!request.user?.sub) {
      await reply.code(401).send({ erro: "AutenticaÃ§Ã£o necessÃ¡ria." });
      return;
    }
    if (!papeisPermitidos.includes(request.user.papel)) {
      await reply.code(403).send({ erro: "Seu papel nÃ£o permite esta operaÃ§Ã£o." });
    }
  });
}
