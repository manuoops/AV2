import { randomUUID } from "crypto";
import { EstadoFisico, Prisma, StatusRastreamento, TipoEquipamento } from "@prisma/client";
import { prisma } from "../../../src/infra/PrismaClient";
import { ServicoRelatorioPrisma } from "../../../src/services/ServicoRelatorioPrisma";

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

describe("ServicoRelatorioPrisma", () => {
  afterAll(async () => prisma.$disconnect());

  it("gera relatorios de organizacao, status e contratos com valores corretos", async () => {
    const data = new Date("2026-05-10T12:00:00.000Z");
    const abortar = new Error("ROLLBACK_TESTE_RELATORIOS");
    await expect(prisma.$transaction(async (tx) => {
      const organizacao = await tx.organizacao.create({ data: {
        razaoSocial: "Organizacao relatorio teste", cnpj: gerarCnpj(), inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua teste", telefone: "11999999999", email: "relatorio@example.com"
      }});
      const lote = await tx.lote.create({ data: {
        dataEntrada: data, organizacaoId: organizacao.id, notaFiscal: "NF-RELATORIO", transportadora: "Teste"
      }});
      await tx.equipamento.create({ data: {
        codigoBarrasInterno: `REL-${randomUUID()}`, tipo: TipoEquipamento.NOTEBOOK, marca: "Marca", modelo: "Modelo",
        anoFabricacao: 2024, estadoFisico: EstadoFisico.BOM_ESTADO, pesoQuilogramas: 2.5, loteId: lote.id,
        posicaoNoLote: 1, statusRastreamento: StatusRastreamento.EM_TRIAGEM
      }});
      await tx.contrato.create({ data: {
        organizacaoId: organizacao.id, dataAssinatura: data, dataVencimento: new Date("2027-05-10T12:00:00.000Z"),
        clausulas: [], valorMensal: new Prisma.Decimal("1234.56")
      }});

      const relatorio = new ServicoRelatorioPrisma(tx);
      const periodo = { inicio: new Date("2026-05-01T00:00:00.000Z"), fim: new Date("2026-05-31T23:59:59.999Z") };
      const porOrganizacao = await relatorio.gerarRelatorioPorOrganizacao(organizacao.id, periodo);
      expect(porOrganizacao).toContain("Lotes exibidos: 1");
      expect(porOrganizacao).toContain("Peso total dos lotes exibidos: 2.50 kg");

      const porStatus = await relatorio.gerarRelatorioPorStatus(StatusRastreamento.EM_TRIAGEM);
      expect(porStatus).toContain("Total de equipamentos: 1");
      expect(porStatus).toContain("Peso total: 2.50 kg");

      const financeiro = await relatorio.gerarRelatorioFinanceiro(periodo);
      expect(financeiro).toContain("Receita mensal total (contratos exibidos): R$ 1234.56");
      expect(financeiro).toContain("Organizacao relatorio teste");
      throw abortar;
    })).rejects.toBe(abortar);
  }, 30000);

  it("rejeita datas invalidas e periodo invertido", async () => {
    const relatorio = new ServicoRelatorioPrisma();
    await expect(relatorio.gerarRelatorioFinanceiro({ inicio: new Date("invalid"), fim: new Date() }))
      .rejects.toThrow("data invalida");
    await expect(relatorio.gerarRelatorioFinanceiro({ inicio: new Date("2026-06-02"), fim: new Date("2026-06-01") }))
      .rejects.toThrow("nao pode ser posterior");
  });
});
