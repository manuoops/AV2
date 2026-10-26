import { randomUUID } from "crypto";
import { EstadoFisico, TipoEquipamento, StatusRastreamento } from "@prisma/client";
import { prisma } from "../../../src/infra/PrismaClient";
import { ServicoLotePrisma } from "../../../src/services/ServicoLotePrisma";
import { ServicoOrganizacaoPrisma } from "../../../src/services/ServicoOrganizacaoPrisma";

function gerarCnpj(): string {
  const base = randomUUID().replace(/\D/g, "").slice(0, 12).padEnd(12, "0").split("").map(Number);
  const calcular = (numeros: number[], pesos: number[]) => {
    const soma = numeros.reduce((total, numero, indice) => total + numero * pesos[indice]!, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = calcular(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcular([...base, primeiro], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, primeiro, segundo].join("");
}

describe("ServicoLotePrisma", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("cria lote, processa triagem em etapas, consulta periodo e gera relatorio", async () => {
    const servicoOrganizacao = new ServicoOrganizacaoPrisma();
    const servico = new ServicoLotePrisma();
    const usuarioResponsavel = `teste-lote-${randomUUID()}`;
    const organizacao = await servicoOrganizacao.cadastrarOrganizacao({
      razaoSocial: "Organizacao teste lote",
      cnpj: gerarCnpj(),
      inscricaoEstadual: "ISENTO",
      enderecoCompleto: "Rua de teste, 10",
      telefone: "11999999999",
      email: "lote@example.com"
    }, usuarioResponsavel);
    const loteIds: string[] = [];

    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      await expect(servico.criarLote({
        dataEntrada: new Date(Date.now() + 86400000),
        organizacaoId: organizacao.id,
        notaFiscal: "NF-FUTURA",
        transportadora: "Transportadora teste"
      }, usuarioResponsavel)).rejects.toThrow("futura");

      const loteVazio = await servico.criarLote({
        dataEntrada: hoje,
        organizacaoId: organizacao.id,
        notaFiscal: `NF-${randomUUID()}`,
        transportadora: "Transportadora teste"
      }, usuarioResponsavel);
      loteIds.push(loteVazio.id);
      await expect(servico.processarTriagem(loteVazio.id, loteVazio.versao, usuarioResponsavel))
        .rejects.toThrow("nao possui equipamentos");

      const lote = await servico.criarLote({
        dataEntrada: hoje,
        organizacaoId: organizacao.id,
        notaFiscal: `NF-${randomUUID()}`,
        transportadora: " Transportadora teste ",
        observacoes: "  Recebido em bom estado  "
      }, usuarioResponsavel);
      loteIds.push(lote.id);
      expect(lote.transportadora).toBe("Transportadora teste");
      expect(lote.observacoes).toBe("Recebido em bom estado");

      const equipamentos = await Promise.all([1, 2].map((posicaoNoLote) => prisma.equipamento.create({
        data: {
          codigoBarrasInterno: `TESTE-${randomUUID()}`,
          tipo: TipoEquipamento.NOTEBOOK,
          marca: "Marca teste",
          modelo: `Modelo ${posicaoNoLote}`,
          anoFabricacao: 2022,
          estadoFisico: EstadoFisico.BOM_ESTADO,
          pesoQuilogramas: 2.5,
          loteId: lote.id,
          posicaoNoLote
        }
      })));

      const processadoInicial = await servico.processarTriagem(lote.id, lote.versao, usuarioResponsavel);
      expect(processadoInicial?.statusProcessamento).toBe("EM_TRIAGEM");
      expect(processadoInicial?.versao).toBe(2);
      await expect(servico.processarTriagem(lote.id, lote.versao, usuarioResponsavel))
        .rejects.toThrow("Conflito de versao");
      const equipamentosEmTriagem = await prisma.equipamento.findMany({ where: { loteId: lote.id } });
      expect(equipamentosEmTriagem.every((equipamento) => equipamento.statusRastreamento === StatusRastreamento.EM_TRIAGEM)).toBe(true);

      await prisma.equipamento.update({
        where: { id: equipamentos[0]!.id },
        data: { statusRastreamento: StatusRastreamento.MATERIAL_RECICLAVEL, versao: { increment: 1 } }
      });
      await expect(servico.processarTriagem(lote.id, 2, usuarioResponsavel))
        .rejects.toThrow("aguardando triagem individual");
      await expect(prisma.lote.findUnique({ where: { id: lote.id } }))
        .resolves.toMatchObject({ statusProcessamento: "EM_TRIAGEM" });

      await prisma.equipamento.update({
        where: { id: equipamentos[1]!.id },
        data: { statusRastreamento: StatusRastreamento.DESCARTE_SEGURO, versao: { increment: 1 } }
      });
      const concluido = await servico.processarTriagem(lote.id, 2, usuarioResponsavel);
      expect(concluido?.statusProcessamento).toBe("TRIAGEM_CONCLUIDA");
      expect(concluido?.versao).toBe(3);
      await expect(servico.processarTriagem(lote.id, 3, usuarioResponsavel)).rejects.toThrow("nao pode avancar");

      const periodo = await servico.consultarLotePorPeriodo(
        new Date(hoje.getTime() - 86400000),
        new Date(hoje.getTime() + 86400000)
      );
      expect(periodo.map((item) => item.id)).toEqual(expect.arrayContaining([loteVazio.id, lote.id]));
      await expect(servico.consultarLotePorPeriodo(new Date(hoje.getTime() + 1000), hoje))
        .rejects.toThrow("nao pode ser posterior");

      const relatorio = await servico.gerarRelatorioTriagem(lote.id);
      expect(relatorio).toContain("Quantidade de equipamentos: 2");
      expect(relatorio).toContain("Peso total: 5.00 kg");

      const diario = await prisma.journalTransacao.findMany({ where: { usuarioResponsavel } });
      expect(diario.map((entrada) => entrada.operacao)).toEqual(expect.arrayContaining([
        "CRIAR_LOTE",
        "INICIAR_TRIAGEM_LOTE",
        "CONCLUIR_TRIAGEM_LOTE"
      ]));
    } finally {
      await prisma.equipamento.deleteMany({ where: { loteId: { in: loteIds } } });
      await prisma.lote.deleteMany({ where: { id: { in: loteIds } } });
      await prisma.organizacao.deleteMany({ where: { id: organizacao.id } });
      await prisma.journalTransacao.deleteMany({ where: { usuarioResponsavel } });
    }
  }, 30000);
});
