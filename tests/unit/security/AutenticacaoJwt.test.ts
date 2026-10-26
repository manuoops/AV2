import { randomUUID } from "crypto";
import Fastify from "fastify";
import { PapelUsuario } from "@prisma/client";
import { prisma } from "../../../src/infra/PrismaClient";
import { RepositorioUsuarioPrisma } from "../../../src/infra/repositories/RepositorioUsuarioPrisma";
import { ServicoAutenticacaoPrisma } from "../../../src/services/ServicoAutenticacaoPrisma";
import { registrarAutenticacaoJwt } from "../../../src/http/AutenticacaoJwt";
import { registrarRotasAutenticacao } from "../../../src/http/controladores/ControladorAutenticacao";

describe("rotas de autenticação JWT", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("aplica login, autorização por papel e revoga tokens após mudanças de conta", async () => {
    const prefixo = `jwt-${randomUUID()}`;
    const senha = "SenhaInicial#2026";
    const erroRollback = new Error("rollback do teste JWT");
    let erroInterno: unknown;

    await expect(prisma.$transaction(async (tx) => {
      const repositorio = new RepositorioUsuarioPrisma(tx);
      const servico = new ServicoAutenticacaoPrisma(repositorio);
      const admin = await servico.cadastrarUsuario(`${prefixo}-admin`, senha, PapelUsuario.ADMINISTRADOR);
      const app = Fastify();

      try {
        await registrarAutenticacaoJwt(app, { repositorio });
        registrarRotasAutenticacao(app, servico);
        await app.ready();

        const semToken = await app.inject({ method: "GET", url: "/auth/me" });
        expect(semToken.statusCode).toBe(401);

        const cadastroSemToken = await app.inject({
          method: "POST", url: "/auth/usuarios",
          payload: { usuario: `${prefixo}-sem-token`, senha, papel: PapelUsuario.AUDITORIA }
        });
        expect(cadastroSemToken.statusCode).toBe(401);

        const loginRuim = await app.inject({
          method: "POST", url: "/auth/login", payload: { usuario: admin.usuario, senha: "senha errada" }
        });
        expect(loginRuim.statusCode).toBe(401);

        const loginAdmin = await app.inject({
          method: "POST", url: "/auth/login", payload: { usuario: admin.usuario, senha }
        });
        expect(loginAdmin.statusCode).toBe(200);
        const tokenAdmin = loginAdmin.json().accessToken as string;

        const identidade = await app.inject({
          method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${tokenAdmin}` }
        });
        expect(identidade.statusCode).toBe(200);
        expect(identidade.json()).toMatchObject({ id: admin.id, papel: PapelUsuario.ADMINISTRADOR });

        const criacao = await app.inject({
          method: "POST", url: "/auth/usuarios",
          headers: { authorization: `Bearer ${tokenAdmin}` },
          payload: { usuario: `${prefixo}-auditor`, senha, papel: PapelUsuario.AUDITORIA }
        });
        expect(criacao.statusCode).toBe(201);
        expect(criacao.json()).not.toHaveProperty("hashSenha");
        const auditorId = criacao.json().id as string;

        const listaAdmin = await app.inject({
          method: "GET", url: "/auth/usuarios", headers: { authorization: `Bearer ${tokenAdmin}` }
        });
        expect(listaAdmin.statusCode).toBe(200);
        expect(listaAdmin.json().some((usuario: { id: string }) => usuario.id === auditorId)).toBe(true);

        const criacaoDoAdmin = await app.inject({
          method: "POST", url: "/auth/usuarios",
          headers: { authorization: `Bearer ${tokenAdmin}` },
          payload: { usuario: `${prefixo}-filho`, senha, papel: PapelUsuario.AUDITORIA }
        });
        if (criacaoDoAdmin.statusCode !== 201) throw new Error(criacaoDoAdmin.body);
        const auditorFilhoId = criacaoDoAdmin.json().id as string;

        const acessoElevado = await app.inject({
          method: "POST", url: "/auth/usuarios",
          headers: { authorization: `Bearer ${tokenAdmin}` },
          payload: { usuario: `${prefixo}-adm2`, senha, papel: PapelUsuario.ADMINISTRADOR }
        });
        expect(acessoElevado.statusCode).toBe(201);
        const adminExtraId = acessoElevado.json().id as string;

        const loginAuditor = await app.inject({
          method: "POST", url: "/auth/login",
          payload: { usuario: `${prefixo}-auditor`, senha }
        });
        expect(loginAuditor.statusCode).toBe(200);
        const tokenAuditor = loginAuditor.json().accessToken as string;
        const acessoNegado = await app.inject({
          method: "GET", url: "/auth/usuarios", headers: { authorization: `Bearer ${tokenAuditor}` }
        });
        expect(acessoNegado.statusCode).toBe(200);
        expect(acessoNegado.json().map((usuario: { id: string }) => usuario.id)).toEqual([]);

        const criacaoPeloAuditor = await app.inject({
          method: "POST", url: "/auth/usuarios",
          headers: { authorization: `Bearer ${tokenAuditor}` },
          payload: { usuario: `${prefixo}-sub`, senha, papel: PapelUsuario.AUDITORIA }
        });
        expect(criacaoPeloAuditor.statusCode).toBe(403);

        const tentativaDeElevar = await app.inject({
          method: "POST", url: "/auth/usuarios",
          headers: { authorization: `Bearer ${tokenAuditor}` },
          payload: { usuario: `${prefixo}-adm3`, senha, papel: PapelUsuario.ADMINISTRADOR }
        });
        expect(tentativaDeElevar.statusCode).toBe(403);

        const listaAuditor = await app.inject({
          method: "GET", url: "/auth/usuarios", headers: { authorization: `Bearer ${tokenAuditor}` }
        });
        expect(listaAuditor.statusCode).toBe(200);
        expect(listaAuditor.json()).toEqual([]);

        const listaAdminAtualizada = await app.inject({
          method: "GET", url: "/auth/usuarios", headers: { authorization: `Bearer ${tokenAdmin}` }
        });
        expect(listaAdminAtualizada.json().map((usuario: { id: string }) => usuario.id)).toEqual(
          expect.arrayContaining([auditorId, auditorFilhoId, adminExtraId])
        );

        const desativacao = await app.inject({
          method: "PATCH", url: `/auth/usuarios/${auditorId}/desativar`,
          headers: { authorization: `Bearer ${tokenAdmin}` },
          payload: { versao: 1 }
        });
        expect(desativacao.statusCode).toBe(200);
        const tokenRevogado = await app.inject({
          method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${tokenAuditor}` }
        });
        expect(tokenRevogado.statusCode).toBe(401);

        const trocaSenha = await app.inject({
          method: "PATCH", url: "/auth/senha",
          headers: { authorization: `Bearer ${tokenAdmin}` },
          payload: { senhaAtual: senha, senhaNova: "SenhaNovaSegura#2026" }
        });
        expect(trocaSenha.statusCode).toBe(204);
        const tokenAdminRevogado = await app.inject({
          method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${tokenAdmin}` }
        });
        expect(tokenAdminRevogado.statusCode).toBe(401);

        const novoLogin = await app.inject({
          method: "POST", url: "/auth/login",
          payload: { usuario: admin.usuario, senha: "SenhaNovaSegura#2026" }
        });
        expect(novoLogin.statusCode).toBe(200);
      } catch (erro) {
        erroInterno = erro;
        throw erroRollback;
      } finally {
        await app.close();
      }

      throw erroRollback;
    }, { timeout: 60000 })).rejects.toBe(erroRollback);

    if (erroInterno) throw erroInterno;

    await expect(prisma.usuario.findUnique({ where: { usuario: `${prefixo}-admin` } })).resolves.toBeNull();
  }, 60000);
});
