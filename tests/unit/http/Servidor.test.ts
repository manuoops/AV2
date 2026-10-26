import { randomUUID } from "crypto";
import { FastifyInstance } from "fastify";
import { PapelUsuario } from "@prisma/client";
import { prisma } from "../../../src/infra/PrismaClient";
import { criarServidor } from "../../../src/http/Servidor";
import { ServicoAutenticacaoPrisma } from "../../../src/services/ServicoAutenticacaoPrisma";

function gerarCnpj(): string {
  const base = randomUUID().replace(/\D/g, "").slice(0, 12).padEnd(12, "0").split("").map(Number);
  const digito = (valores: number[], pesos: number[]) => {
    const resto = valores.reduce((soma, valor, indice) => soma + valor * pesos[indice]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = digito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digito([...base, primeiro], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, primeiro, segundo].join("");
}

describe("Servidor Fastify", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await criarServidor();
  });

  afterAll(async () => {
    await app.close();
  });

  it("expõe health check e documentação OpenAPI", async () => {
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: "ok" });

    const docs = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(docs.statusCode).toBe(200);
    expect(docs.json()).toMatchObject({
      openapi: "3.0.3",
      info: { title: "GreenCode API" },
      paths: expect.objectContaining({ "/organizacoes": expect.any(Object), "/relatorios/financeiro": expect.any(Object) })
    });
  });

  it("valida o corpo do login e protege rotas com JWT", async () => {
    const corpoInvalido = await app.inject({ method: "POST", url: "/auth/login", payload: { usuario: "admin" } });
    expect(corpoInvalido.statusCode).toBe(400);

    const semToken = await app.inject({ method: "GET", url: "/auth/me" });
    expect(semToken.statusCode).toBe(401);

    const rotaProtegida = await app.inject({ method: "POST", url: "/organizacoes", payload: {
      razaoSocial: "Organizacao teste", cnpj: "11222333000181", inscricaoEstadual: "ISENTO",
      enderecoCompleto: "Rua teste", telefone: "11999999999", email: "teste@example.com"
    } });
    expect(rotaProtegida.statusCode).toBe(401);
  });

  it("responde 404 para caminhos inexistentes e encerra sem erro", async () => {
    const resposta = await app.inject({ method: "GET", url: "/rota-que-nao-existe" });
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toEqual({ erro: "Rota nao encontrada." });
    await app.ready();
  });

  it("autentica, aplica permissao por papel e trata conflito de cadastro como 409", async () => {
    const sufixo = randomUUID();
    const nomeOperador = `api-op-${sufixo.slice(0, 8)}`;
    const nomeAlmoxarife = `api-alm-${sufixo.slice(0, 8)}`;
    const senha = "SenhaForte#Api2026";
    const cnpj = gerarCnpj();
    let organizacaoId: string | undefined;
    const autenticacao = new ServicoAutenticacaoPrisma();

    try {
      await autenticacao.cadastrarUsuario(nomeOperador, senha, PapelUsuario.OPERADOR_CADASTRO);
      await autenticacao.cadastrarUsuario(nomeAlmoxarife, senha, PapelUsuario.GESTOR_ALMOXARIFADO);
      const loginOperador = await app.inject({ method: "POST", url: "/auth/login", payload: { usuario: nomeOperador, senha } });
      expect(loginOperador.statusCode).toBe(200);
      const tokenOperador = loginOperador.json<{ accessToken: string }>().accessToken;

      const corpoOrganizacao = {
        razaoSocial: "Organizacao API teste", cnpj, inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua da API, 100", telefone: "11999999999", email: "api@example.com"
      };
      const criada = await app.inject({ method: "POST", url: "/organizacoes", headers: { authorization: `Bearer ${tokenOperador}` }, payload: corpoOrganizacao });
      expect(criada.statusCode).toBe(201);
      organizacaoId = criada.json<{ id: string }>().id;

      const enderecoAtualizado = await app.inject({
        method: "PATCH",
        url: `/organizacoes/${organizacaoId}/endereco`,
        headers: { authorization: `Bearer ${tokenOperador}` },
        payload: { enderecoCompleto: "Rua atualizada, 100", versao: 1 }
      });
      expect(enderecoAtualizado.statusCode).toBe(200);
      expect(enderecoAtualizado.json()).toMatchObject({ enderecoCompleto: "Rua atualizada, 100", versao: 2 });
      const enderecoDesatualizado = await app.inject({
        method: "PATCH",
        url: `/organizacoes/${organizacaoId}/endereco`,
        headers: { authorization: `Bearer ${tokenOperador}` },
        payload: { enderecoCompleto: "Rua antiga, 100", versao: 1 }
      });
      expect(enderecoDesatualizado.statusCode).toBe(409);

      const duplicada = await app.inject({ method: "POST", url: "/organizacoes", headers: { authorization: `Bearer ${tokenOperador}` }, payload: corpoOrganizacao });
      expect(duplicada.statusCode).toBe(409);

      const loginAlmoxarife = await app.inject({ method: "POST", url: "/auth/login", payload: { usuario: nomeAlmoxarife, senha } });
      const tokenAlmoxarife = loginAlmoxarife.json<{ accessToken: string }>().accessToken;
      const proibida = await app.inject({ method: "POST", url: "/organizacoes", headers: { authorization: `Bearer ${tokenAlmoxarife}` }, payload: corpoOrganizacao });
      expect(proibida.statusCode).toBe(403);

      const lista = await app.inject({ method: "GET", url: "/organizacoes", headers: { authorization: `Bearer ${tokenOperador}` } });
      expect(lista.statusCode).toBe(200);
      expect(lista.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: organizacaoId })]));
    } finally {
      if (organizacaoId) {
        await prisma.journalTransacao.deleteMany({ where: { usuarioResponsavel: nomeOperador, entidade: "Organizacao" } });
        await prisma.organizacao.deleteMany({ where: { id: organizacaoId } });
      }
      await prisma.usuario.deleteMany({ where: { usuario: { in: [nomeOperador, nomeAlmoxarife] } } });
    }
  }, 30000);

  it("escuta em porta efemera e fecha o socket graciosamente", async () => {
    const servidor = await criarServidor();
    await servidor.listen({ host: "127.0.0.1", port: 0 });
    expect(servidor.addresses()[0]?.port).toBeGreaterThan(0);
    await expect(servidor.close()).resolves.toBeUndefined();
  });
});
