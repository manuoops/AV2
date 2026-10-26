import { FastifyInstance } from "fastify";
import { PapelUsuario } from "@prisma/client";
import { ServicoAutenticacaoPrisma } from "../../services/ServicoAutenticacaoPrisma";
import { ErroPapelUsuarioNaoPermitido } from "../../services/ErrosServico";

const DURACAO_TOKEN_SEGUNDOS = 15 * 60;

interface CorpoLogin {
  usuario: string;
  senha: string;
}

interface CorpoNovoUsuario {
  usuario: string;
  senha: string;
  papel: PapelUsuario;
}

interface CorpoAlteracaoSenha {
  senhaAtual: string;
  senhaNova: string;
}

interface ParametroId {
  id: string;
}

export function registrarRotasAutenticacao(app: FastifyInstance, servico: ServicoAutenticacaoPrisma): void {
  app.post<{ Body: CorpoLogin }>("/auth/login", {
    schema: {
      body: {
        type: "object",
        required: ["usuario", "senha"],
        additionalProperties: false,
        properties: {
          usuario: { type: "string", minLength: 1, maxLength: 50 },
          senha: { type: "string", minLength: 1, maxLength: 256 }
        }
      }
    }
  }, async (request, reply) => {
    const usuario = await servico.autenticar(request.body.usuario, request.body.senha);
    if (!usuario) return reply.code(401).send({ erro: "UsuÃ¡rio ou senha invÃ¡lidos." });

    return reply.send({
      accessToken: app.jwt.sign({
        sub: usuario.id,
        usuario: usuario.usuario,
        papel: usuario.papel,
        versao: usuario.versao
      }),
      tokenType: "Bearer",
      expiresInSeconds: DURACAO_TOKEN_SEGUNDOS
    });
  });

  app.get("/auth/me", { preHandler: [app.autenticar] }, async (request) => ({
    id: request.user.sub,
    usuario: request.user.usuario,
    papel: request.user.papel
  }));

  app.post<{ Body: CorpoNovoUsuario }>("/auth/usuarios", {
    preHandler: [app.autenticar, app.exigirPapeis([PapelUsuario.ADMINISTRADOR])],
    schema: {
      body: {
        type: "object",
        required: ["usuario", "senha", "papel"],
        additionalProperties: false,
        properties: {
          usuario: { type: "string", minLength: 3, maxLength: 50 },
          senha: { type: "string", minLength: 12, maxLength: 256 },
          papel: { type: "string", enum: Object.values(PapelUsuario) }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const usuario = await servico.cadastrarUsuario(
        request.body.usuario,
        request.body.senha,
        request.body.papel,
        request.user.sub
      );
      return reply.code(201).send(usuario);
    } catch (erro) {
      if (erro instanceof ErroPapelUsuarioNaoPermitido) {
        return reply.code(403).send({ erro: erro.message });
      }
      if (erro instanceof Error && erro.message.startsWith("JÃ¡ existe um usuÃ¡rio")) {
        return reply.code(409).send({ erro: erro.message });
      }
      if (erro instanceof Error && erro.message.includes("deve ter")) {
        return reply.code(400).send({ erro: erro.message });
      }
      throw erro;
    }
  });

  app.get("/auth/usuarios", { preHandler: [app.autenticar] }, async (request) =>
    servico.listarUsuarios(request.user.papel === PapelUsuario.ADMINISTRADOR ? undefined : request.user.sub));

  app.patch<{ Params: ParametroId; Body: { versao: number } }>("/auth/usuarios/:id/desativar", {
    preHandler: [app.autenticar, app.exigirPapeis([PapelUsuario.ADMINISTRADOR])],
    schema: {
      params: {
        type: "object",
        required: ["id"],
        additionalProperties: false,
        properties: { id: { type: "string", format: "uuid" } }
      },
      body: {
        type: "object",
        required: ["versao"],
        additionalProperties: false,
        properties: { versao: { type: "integer", minimum: 1 } }
      }
    }
  }, async (request, reply) => {
    try {
      return await servico.desativarUsuario(request.params.id, request.body.versao);
    } catch (erro) {
      if (erro instanceof Error && erro.message === "UsuÃ¡rio nÃ£o encontrado.") {
        return reply.code(404).send({ erro: erro.message });
      }
      throw erro;
    }
  });

  app.patch<{ Body: CorpoAlteracaoSenha }>("/auth/senha", {
    preHandler: [app.autenticar],
    schema: {
      body: {
        type: "object",
        required: ["senhaAtual", "senhaNova"],
        additionalProperties: false,
        properties: {
          senhaAtual: { type: "string", minLength: 1, maxLength: 256 },
          senhaNova: { type: "string", minLength: 12, maxLength: 256 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const alterada = await servico.alterarSenha(
        request.user.sub,
        request.user.versao,
        request.body.senhaAtual,
        request.body.senhaNova
      );
      if (!alterada) return reply.code(401).send({ erro: "Senha atual invÃ¡lida." });
      return reply.code(204).send();
    } catch (erro) {
      if (erro instanceof Error && erro.message.includes("deve ter")) {
        return reply.code(400).send({ erro: erro.message });
      }
      throw erro;
    }
  });
}
