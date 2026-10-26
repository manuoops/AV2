import { randomUUID } from "crypto";
import { PapelUsuario } from "@prisma/client";
import { prisma } from "../../../src/infra/PrismaClient";
import { RepositorioUsuarioPrisma } from "../../../src/infra/repositories/RepositorioUsuarioPrisma";
import { ServicoAutenticacaoPrisma } from "../../../src/services/ServicoAutenticacaoPrisma";
import { ErroPapelUsuarioNaoPermitido } from "../../../src/services/ErrosServico";

describe("ServicoAutenticacaoPrisma", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria usuário com hash scrypt, autentica, troca senha e desativa", async () => {
    const nome = `auth-${randomUUID()}`;
    const erroRollback = new Error("rollback do teste de autenticação");

    await expect(
      prisma.$transaction(async (tx) => {
        const repositorio = new RepositorioUsuarioPrisma(tx);
        const autenticacao = new ServicoAutenticacaoPrisma(repositorio);
        const criado = await autenticacao.cadastrarUsuario(nome, "SenhaInicial#2026", PapelUsuario.AUDITORIA);

        await expect(autenticacao.cadastrarUsuario(`nao-${randomUUID().slice(0, 8)}`, "SenhaInicial#2026", PapelUsuario.AUDITORIA, criado.id))
          .rejects.toBeInstanceOf(ErroPapelUsuarioNaoPermitido);

        expect(criado).not.toHaveProperty("hashSenha");
        expect(criado.papel).toBe(PapelUsuario.AUDITORIA);
        const persistido = await repositorio.buscarPorId(criado.id);
        expect(persistido?.hashSenha).toMatch(/^scrypt\$32768\$/);

        await expect(autenticacao.autenticar(nome, "senha errada")).resolves.toBeNull();
        const autenticado = await autenticacao.autenticar(nome, "SenhaInicial#2026");
        expect(autenticado?.id).toBe(criado.id);
        expect(autenticado?.ultimoAcesso).toBeInstanceOf(Date);

        await expect(autenticacao.alterarSenha(criado.id, 1, "senha errada", "NovaSenhaSegura#2026"))
          .resolves.toBe(false);
        await expect(autenticacao.alterarSenha(criado.id, 1, "SenhaInicial#2026", "curta"))
          .rejects.toThrow("pelo menos 12 bytes");
        await expect(autenticacao.alterarSenha(criado.id, 1, "SenhaInicial#2026", "NovaSenhaSegura#2026"))
          .resolves.toBe(true);
        await expect(autenticacao.alterarSenha(criado.id, 1, "NovaSenhaSegura#2026", "OutraSenhaSegura#2026"))
          .rejects.toThrow("Conflito de versao");
        await expect(autenticacao.autenticar(nome, "SenhaInicial#2026")).resolves.toBeNull();
        await expect(autenticacao.autenticar(nome, "NovaSenhaSegura#2026")).resolves.toMatchObject({ id: criado.id });

        const listados = await autenticacao.listarUsuarios();
        const usuarioListado = listados.find((usuario) => usuario.id === criado.id);
        expect(usuarioListado).toBeDefined();
        expect(usuarioListado).not.toHaveProperty("hashSenha");

        await expect(autenticacao.desativarUsuario(criado.id, 1)).rejects.toThrow("Conflito de versao");
        const desativado = await autenticacao.desativarUsuario(criado.id, 2);
        expect(desativado.ativo).toBe(false);
        await expect(autenticacao.autenticar(nome, "NovaSenhaSegura#2026")).resolves.toBeNull();

        throw erroRollback;
      }, { timeout: 30000 })
    ).rejects.toBe(erroRollback);

    await expect(prisma.usuario.findUnique({ where: { usuario: nome } })).resolves.toBeNull();
  }, 30000);
});
