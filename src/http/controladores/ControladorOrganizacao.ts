import { FastifyInstance } from "fastify";
import { ServicoOrganizacaoPrisma } from "../../services/ServicoOrganizacaoPrisma";
import { criarOpcoesAutenticacaoRotas } from "./OpcoesAutenticacaoRotas";

export function registrarRotasOrganizacao(app: FastifyInstance, organizacoes: ServicoOrganizacaoPrisma): void {
  const { autenticado, gestorOrganizacao } = criarOpcoesAutenticacaoRotas(app);

  app.get("/organizacoes", { ...autenticado }, async (request) => {
    const query = request.query as { skip?: string; take?: string };
    return organizacoes.listarOrganizacoesAtivas(Number(query.skip ?? 0), Number(query.take ?? 100));
  });
  app.post<{ Body: { razaoSocial: string; cnpj: string; inscricaoEstadual: string; enderecoCompleto: string; telefone: string; email: string } }>("/organizacoes", {
    ...gestorOrganizacao,
    schema: { body: { type: "object", required: ["razaoSocial", "cnpj", "inscricaoEstadual", "enderecoCompleto", "telefone", "email"], additionalProperties: false, properties: {
      razaoSocial: { type: "string", minLength: 1 }, cnpj: { type: "string", minLength: 11, maxLength: 18 }, inscricaoEstadual: { type: "string", minLength: 1 },
      enderecoCompleto: { type: "string", minLength: 1 }, telefone: { type: "string", minLength: 1 }, email: { type: "string", minLength: 3 }
    } } }
  }, async (request, reply) => {
    try {
      return reply.code(201).send(await organizacoes.cadastrarOrganizacao(request.body, request.user.usuario));
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      if (/existe|duplicate|unique|P2002/i.test(mensagem)) return reply.code(409).send({ erro: mensagem });
      throw erro;
    }
  });
  app.get<{ Params: { id: string } }>("/organizacoes/:id", {
    ...autenticado,
    schema: { params: { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } }
  }, async (request) => {
    const resultado = await organizacoes.buscarOrganizacao(request.params.id);
    if (!resultado) throw new Error(`Organizacao '${request.params.id}' nao encontrada.`);
    return resultado;
  });
  app.patch<{ Params: { id: string }; Body: { enderecoCompleto: string; versao: number } }>("/organizacoes/:id/endereco", {
    ...gestorOrganizacao,
    schema: { body: { type: "object", required: ["enderecoCompleto", "versao"], additionalProperties: false, properties: {
      enderecoCompleto: { type: "string", minLength: 1 }, versao: { type: "integer", minimum: 1 }
    } } }
  }, async (request) => organizacoes.alterarEndereco(
    request.params.id, request.body.enderecoCompleto, request.body.versao, request.user.usuario
  ));
  app.patch<{ Params: { id: string }; Body: { versao: number } }>("/organizacoes/:id/desativar", {
    ...gestorOrganizacao,
    schema: { body: { type: "object", required: ["versao"], additionalProperties: false, properties: {
      versao: { type: "integer", minimum: 1 }
    } } }
  }, async (request) => organizacoes.desativarOrganizacao(
    request.params.id, request.body.versao, request.user.usuario
  ));
}
