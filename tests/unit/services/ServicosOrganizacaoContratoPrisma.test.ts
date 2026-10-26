import { randomUUID } from "crypto";
import { prisma } from "../../../src/infra/PrismaClient";
import { ServicoContratoPrisma } from "../../../src/services/ServicoContratoPrisma";
import { ServicoOrganizacaoPrisma } from "../../../src/services/ServicoOrganizacaoPrisma";

function gerarCnpj(): string {
  const base = randomUUID().replace(/\D/g, "").slice(0, 12).padEnd(12, "0").split("").map(Number);
  const calcularDigito = (numeros: number[], pesos: number[]) => {
    const soma = numeros.reduce((total, numero, indice) => total + numero * pesos[indice]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcularDigito(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito([...base, primeiro], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, primeiro, segundo].join("");
}

describe("serviços Prisma de organização e contrato", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("valida, cadastra, altera e desativa organizações; cadastra e renova contratos com Journal", async () => {
    const organizacoes = new ServicoOrganizacaoPrisma();
    const contratos = new ServicoContratoPrisma();
    const usuarioResponsavel = `teste-etapa7-${randomUUID()}`;
    const cnpj = gerarCnpj();
    let organizacaoId: string | undefined;

    try {
      await expect(organizacoes.cadastrarOrganizacao({
        razaoSocial: "Empresa de Teste",
        cnpj: "00000000000000",
        inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua de teste, 1",
        telefone: "11999999999",
        email: "teste@example.com"
      }, usuarioResponsavel)).rejects.toThrow("CNPJ");

      const organizacao = await organizacoes.cadastrarOrganizacao({
        razaoSocial: "  Empresa de Teste  ",
        cnpj: `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`,
        inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua de teste, 1",
        telefone: "11999999999",
        email: "teste@example.com"
      }, usuarioResponsavel);
      organizacaoId = organizacao.id;
      expect(organizacao.razaoSocial).toBe("Empresa de Teste");
      expect(organizacao.cnpj).toBe(cnpj);

      await expect(organizacoes.cadastrarOrganizacao({
        razaoSocial: "Duplicada",
        cnpj,
        inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua de teste, 2",
        telefone: "11999999999",
        email: "duplicada@example.com"
      }, usuarioResponsavel)).rejects.toThrow("Ja existe uma organizacao");

      await expect(contratos.cadastrarContrato({
        organizacaoId,
        dataVencimento: new Date(Date.now() + 86400000),
        clausulas: ["Clausula 1"],
        valorMensal: 0,
        renovacaoAutomatica: false
      }, usuarioResponsavel)).rejects.toThrow("numero positivo");

      const vencimentoInicial = new Date(Date.now() + 30 * 86400000);
      const contrato = await contratos.cadastrarContrato({
        organizacaoId,
        dataVencimento: vencimentoInicial,
        clausulas: [" Entrega mensal ", "Destinacao correta"],
        valorMensal: 2500,
        renovacaoAutomatica: true
      }, usuarioResponsavel);
      expect(contrato.organizacaoId).toBe(organizacaoId);
      expect(contrato.clausulas).toEqual(["Entrega mensal", "Destinacao correta"]);
      await expect(contratos.buscarContratoPorOrganizacao(organizacaoId)).resolves.toMatchObject({ id: contrato.id });

      await expect(contratos.cadastrarContrato({
        organizacaoId,
        dataVencimento: new Date(Date.now() + 60 * 86400000),
        clausulas: ["Outro contrato"],
        valorMensal: 100,
        renovacaoAutomatica: false
      }, usuarioResponsavel)).rejects.toThrow("ja possui contrato");

      await expect(contratos.renovarContrato(organizacaoId, vencimentoInicial, 1, usuarioResponsavel))
        .rejects.toThrow("posterior ao vencimento atual");
      const novoVencimento = new Date(Date.now() + 90 * 86400000);
      const renovado = await contratos.renovarContrato(organizacaoId, novoVencimento, 1, usuarioResponsavel);
      expect(renovado.dataVencimento.getTime()).toBe(novoVencimento.getTime());
      expect(renovado.versao).toBe(2);
      await expect(contratos.renovarContrato(
        organizacaoId, new Date(Date.now() + 120 * 86400000), 1, usuarioResponsavel
      )).rejects.toThrow("Conflito de versao");

      const endereco = await organizacoes.alterarEndereco(organizacaoId, " Avenida Nova, 50 ", 1, usuarioResponsavel);
      expect(endereco.enderecoCompleto).toBe("Avenida Nova, 50");
      expect(endereco.versao).toBe(2);
      await expect(organizacoes.alterarEndereco(organizacaoId, " Avenida Antiga, 1 ", 1, usuarioResponsavel))
        .rejects.toThrow("Conflito de versao");
      await expect(organizacoes.alterarEndereco(organizacaoId, "   ", 2, usuarioResponsavel))
        .rejects.toThrow("nao pode ser vazio");

      const journal = await prisma.journalTransacao.findMany({ where: { usuarioResponsavel } });
      expect(journal.map((registro) => registro.operacao)).toEqual(expect.arrayContaining([
        "CADASTRAR_ORGANIZACAO",
        "CADASTRAR_CONTRATO",
        "RENOVAR_CONTRATO",
        "ALTERAR_ENDERECO_ORGANIZACAO"
      ]));

      const desativada = await organizacoes.desativarOrganizacao(organizacaoId, 2, usuarioResponsavel);
      expect(desativada.ativo).toBe(false);
      await expect(organizacoes.listarOrganizacoesAtivas()).resolves.not.toContainEqual(
        expect.objectContaining({ id: organizacaoId })
      );
    } finally {
      if (organizacaoId) {
        await prisma.contrato.deleteMany({ where: { organizacaoId } });
        await prisma.organizacao.deleteMany({ where: { id: organizacaoId } });
      }
      await prisma.journalTransacao.deleteMany({ where: { usuarioResponsavel } });
    }
  }, 30000);
});
