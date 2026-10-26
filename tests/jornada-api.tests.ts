import { randomUUID } from "crypto";
import { EstadoFisico, PapelUsuario, Prisma, StatusRastreamento, TipoEquipamento } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { criarServidor } from "../src/http/Servidor";
import { prisma } from "../src/infra/PrismaClient";
import { RepositorioUsuarioPrisma } from "../src/infra/repositories/RepositorioUsuarioPrisma";
import { ServicoAutenticacaoPrisma } from "../src/services/ServicoAutenticacaoPrisma";

jest.setTimeout(120_000);

function gerarCnpj(): string {
  const base = randomUUID().replace(/\D/g, "").slice(0, 12).padEnd(12, "0").split("").map(Number);
  const calcular = (numeros: number[], pesos: number[]) => {
    const resto = numeros.reduce((soma, numero, indice) => soma + numero * pesos[indice]!, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcular(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcular([...base, primeiro], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, primeiro, segundo].join("");
}

describe("jornada da GreenCode API", () => {
  afterAll(async () => prisma.$disconnect());

  it("autentica papéis, executa o ciclo de organização/lote/equipamento e consulta relatórios", async () => {
    const abortar = new Error("ROLLBACK_JORNADA_API");
    const senhaAdmin = "AdminApiForte#2026";
    const senhaUsuario = "UsuarioApiForte#2026";

    await expect(prisma.$transaction(async (tx) => {
      const transacionar = async <T>(operacao: (executor: Prisma.TransactionClient) => Promise<T>) => operacao(tx);
      const app: FastifyInstance = await criarServidor({ database: tx, transacionar });
      try {
        const autenticacao = new ServicoAutenticacaoPrisma(new RepositorioUsuarioPrisma(tx));
        const sufixo = randomUUID().slice(0, 8);
        const usuarioAdmin = `admin-${sufixo}`;
        await autenticacao.cadastrarUsuario(usuarioAdmin, senhaAdmin, PapelUsuario.ADMINISTRADOR);

        const loginAdmin = await app.inject({ method: "POST", url: "/auth/login", payload: { usuario: usuarioAdmin, senha: senhaAdmin } });
        if (loginAdmin.statusCode !== 200) throw new Error(`login admin: ${loginAdmin.statusCode} ${loginAdmin.body}`);
        expect(loginAdmin.statusCode).toBe(200);
        const tokenAdmin = loginAdmin.json<{ accessToken: string }>().accessToken;

        const criarUsuario = async (usuario: string, papel: PapelUsuario) => {
          const resposta = await app.inject({
            method: "POST", url: "/auth/usuarios", headers: { authorization: `Bearer ${tokenAdmin}` },
            payload: { usuario, senha: senhaUsuario, papel }
          });
          expect(resposta.statusCode).toBe(201);
        };
        const operador = `operador-${sufixo}`;
        const almoxarife = `almox-${sufixo}`;
        const auditora = `audit-${sufixo}`;
        await criarUsuario(operador, PapelUsuario.OPERADOR_CADASTRO);
        await criarUsuario(almoxarife, PapelUsuario.GESTOR_ALMOXARIFADO);
        await criarUsuario(auditora, PapelUsuario.AUDITORIA);

        const obterToken = async (usuario: string) => {
          const resposta = await app.inject({ method: "POST", url: "/auth/login", payload: { usuario, senha: senhaUsuario } });
          expect(resposta.statusCode).toBe(200);
          return resposta.json<{ accessToken: string }>().accessToken;
        };
        const tokenOperador = await obterToken(operador);
        const tokenAlmoxarife = await obterToken(almoxarife);
        const tokenAuditora = await obterToken(auditora);

        const organizacaoPayload = {
          razaoSocial: `Organizacao jornada ${sufixo}`, cnpj: gerarCnpj(), inscricaoEstadual: "ISENTO",
          enderecoCompleto: "Rua da Jornada, 25", telefone: "11999999999", email: `jornada-${sufixo}@example.com`
        };
        const criada = await app.inject({ method: "POST", url: "/organizacoes", headers: { authorization: `Bearer ${tokenOperador}` }, payload: organizacaoPayload });
        expect(criada.statusCode).toBe(201);
        const organizacaoId = criada.json<{ id: string }>().id;

        const vencimento = new Date();
        vencimento.setFullYear(vencimento.getFullYear() + 1);
        const contrato = await app.inject({
          method: "POST", url: "/contratos", headers: { authorization: `Bearer ${tokenOperador}` },
          payload: {
            organizacaoId, dataVencimento: vencimento.toISOString(), clausulas: ["Contrato de teste de jornada"],
            valorMensal: 1500, renovacaoAutomatica: true
          }
        });
        expect(contrato.statusCode).toBe(201);

        const dataHoje = new Date().toISOString().slice(0, 10);
        const amanha = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
        const lote = await app.inject({
          method: "POST", url: "/lotes", headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: { dataEntrada: new Date().toISOString(), organizacaoId, notaFiscal: `NF-${sufixo}`, transportadora: "Logistica de teste" }
        });
        expect(lote.statusCode).toBe(201);
        const loteCriado = lote.json<{ id: string; versao: number }>();
        const loteId = loteCriado.id;

        const equipamento = await app.inject({
          method: "POST", url: "/equipamentos", headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: {
            tipo: TipoEquipamento.NOTEBOOK, marca: "GreenCode", modelo: "Modelo API",
            anoFabricacao: 2022, estadoFisico: EstadoFisico.BOM_ESTADO, pesoQuilogramas: 2.5, loteId
          }
        });
        expect(equipamento.statusCode).toBe(201);
        const equipamentoCriado = equipamento.json<{ id: string; codigoBarrasInterno: string; versao: number }>();
        expect(equipamentoCriado.codigoBarrasInterno).toMatch(/^NTB-/);

        const triagemInicial = await app.inject({
          method: "POST", url: `/lotes/${loteId}/processar-triagem`,
          headers: { authorization: `Bearer ${tokenAlmoxarife}` }, payload: { versao: loteCriado.versao }
        });
        if (triagemInicial.statusCode !== 200) throw new Error(`triagem inicial: ${triagemInicial.statusCode} ${triagemInicial.body}`);
        expect(triagemInicial.statusCode).toBe(200);
        const loteEmTriagem = triagemInicial.json<{ statusProcessamento: string; versao: number }>();
        expect(loteEmTriagem.statusProcessamento).toBe("EM_TRIAGEM");

        const versaoAntiga = await app.inject({
          method: "PATCH", url: `/equipamentos/${equipamentoCriado.id}/estado`, headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: { estadoFisico: EstadoFisico.USADO_LEVE, versao: 1 }
        });
        expect(versaoAntiga.statusCode).toBe(409);

        const aguardandoDesmonte = await app.inject({
          method: "PATCH", url: `/equipamentos/${equipamentoCriado.id}/status`, headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: { statusRastreamento: StatusRastreamento.AGUARDANDO_DESMONTE, justificativa: "Triagem concluida", versao: 2 }
        });
        expect(aguardandoDesmonte.statusCode).toBe(200);
        const triagemConcluida = await app.inject({
          method: "POST", url: `/lotes/${loteId}/processar-triagem`,
          headers: { authorization: `Bearer ${tokenAlmoxarife}` }, payload: { versao: loteEmTriagem.versao }
        });
        if (triagemConcluida.statusCode !== 200) throw new Error(`triagem concluida: ${triagemConcluida.statusCode} ${triagemConcluida.body}`);
        expect(triagemConcluida.statusCode).toBe(200);
        expect(triagemConcluida.json<{ statusProcessamento: string }>().statusProcessamento).toBe("TRIAGEM_CONCLUIDA");

        const emDesmonte = await app.inject({
          method: "PATCH", url: `/equipamentos/${equipamentoCriado.id}/status`, headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: { statusRastreamento: StatusRastreamento.EM_DESMONTE, justificativa: "Inicio do desmonte", versao: 3 }
        });
        if (emDesmonte.statusCode !== 200) throw new Error(`em desmonte: ${emDesmonte.statusCode} ${emDesmonte.body}`);
        expect(emDesmonte.statusCode).toBe(200);
        const primeiraMovimentacao = await app.inject({
          method: "POST", url: `/equipamentos/${equipamentoCriado.id}/movimentacoes`, headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: {
            destino: "Bancada de desmontagem", responsavel: "Equipe GreenCode", versao: 4,
            observacao: "Equipamento recebido para desmontagem"
          }
        });
        expect(primeiraMovimentacao.statusCode).toBe(201);
        expect(primeiraMovimentacao.json()).toMatchObject({ origem: "RECEBIMENTO", destino: "Bancada de desmontagem" });

        const segundaMovimentacao = await app.inject({
          method: "POST", url: `/equipamentos/${equipamentoCriado.id}/movimentacoes`, headers: { authorization: `Bearer ${tokenAlmoxarife}` },
          payload: {
            destino: "Area de separacao de componentes", responsavel: "Equipe de desmontagem", versao: 5,
            observacao: "Componentes separados para avaliacao e reaproveitamento"
          }
        });
        expect(segundaMovimentacao.statusCode).toBe(201);
        expect(segundaMovimentacao.json()).toMatchObject({
          origem: "Bancada de desmontagem",
          destino: "Area de separacao de componentes",
          responsavel: "Equipe de desmontagem"
        });

        const rastreabilidade = await app.inject({ method: "GET", url: `/equipamentos/${equipamentoCriado.id}/rastreabilidade`, headers: { authorization: `Bearer ${tokenAuditora}` } });
        if (rastreabilidade.statusCode !== 200) throw new Error(`rastreabilidade: ${rastreabilidade.statusCode} ${rastreabilidade.body}`);
        expect(rastreabilidade.statusCode).toBe(200);
        expect(rastreabilidade.json().equipamento.movimentacoes).toHaveLength(2);
        expect(rastreabilidade.json().equipamento.movimentacoes).toMatchObject([
          { origem: "RECEBIMENTO", destino: "Bancada de desmontagem" },
          { origem: "Bancada de desmontagem", destino: "Area de separacao de componentes" }
        ]);

        const relatorioOrganizacao = await app.inject({
          method: "GET", url: `/relatorios/organizacao?organizacaoId=${organizacaoId}&inicio=${dataHoje}&fim=${amanha}`,
          headers: { authorization: `Bearer ${tokenAuditora}` }
        });
        expect(relatorioOrganizacao.statusCode).toBe(200);
        expect(relatorioOrganizacao.json<{ relatorio: string }>().relatorio).toContain(loteId);

        const relatorioStatus = await app.inject({ method: "GET", url: "/relatorios/status?status=EM_DESMONTE", headers: { authorization: `Bearer ${tokenAuditora}` } });
        expect(relatorioStatus.statusCode).toBe(200);
        expect(relatorioStatus.json<{ relatorio: string }>().relatorio).toContain(equipamentoCriado.codigoBarrasInterno);

        const relatorioFinanceiro = await app.inject({ method: "GET", url: `/relatorios/financeiro?inicio=${dataHoje}&fim=${amanha}`, headers: { authorization: `Bearer ${tokenAuditora}` } });
        expect(relatorioFinanceiro.statusCode).toBe(200);
        expect(relatorioFinanceiro.json<{ relatorio: string }>().relatorio).toContain("R$ 1500.00");

        const acessoNegado = await app.inject({ method: "POST", url: "/organizacoes", headers: { authorization: `Bearer ${tokenAuditora}` }, payload: organizacaoPayload });
        expect(acessoNegado.statusCode).toBe(403);
      } finally {
        await app.close();
      }
      throw abortar;
    })).rejects.toBe(abortar);
  }, 60000);
});
