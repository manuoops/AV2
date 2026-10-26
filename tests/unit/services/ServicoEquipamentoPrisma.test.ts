import { randomUUID } from "crypto";
import { EstadoFisico, StatusLote, StatusRastreamento, TipoEquipamento } from "@prisma/client";
import { prisma } from "../../../src/infra/PrismaClient";
import { ServicoEquipamentoPrisma } from "../../../src/services/ServicoEquipamentoPrisma";
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

describe("ServicoEquipamentoPrisma", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("serializa cadastros concorrentes e evita repetir codigo de barras e posicao", async () => {
    const usuarioResponsavel = `teste-equipamento-concorrente-${randomUUID()}`;
    const servicoOrganizacao = new ServicoOrganizacaoPrisma();
    const servicoLote = new ServicoLotePrisma();
    const servico = new ServicoEquipamentoPrisma();
    const organizacao = await servicoOrganizacao.cadastrarOrganizacao({
      razaoSocial: "Organizacao teste concorrente",
      cnpj: gerarCnpj(),
      inscricaoEstadual: "ISENTO",
      enderecoCompleto: "Rua de teste, 30",
      telefone: "11999999999",
      email: "equipamento-concorrente@example.com"
    }, usuarioResponsavel);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const lote = await servicoLote.criarLote({
      dataEntrada: hoje,
      organizacaoId: organizacao.id,
      notaFiscal: `NF-${randomUUID()}`,
      transportadora: "Transportadora teste"
    }, usuarioResponsavel);

    try {
      const criarDados = (sufixo: string) => ({
        tipo: TipoEquipamento.MONITOR,
        marca: "Marca teste",
        modelo: `Modelo concorrente ${sufixo}`,
        anoFabricacao: 2023,
        estadoFisico: EstadoFisico.NOVO,
        pesoQuilogramas: 1.5,
        loteId: lote.id
      });
      const cadastrados = await Promise.all([
        servico.cadastrarEquipamento(criarDados("A"), usuarioResponsavel),
        servico.cadastrarEquipamento(criarDados("B"), usuarioResponsavel)
      ]);
      expect(cadastrados[0]?.codigoBarrasInterno).not.toBe(cadastrados[1]?.codigoBarrasInterno);
      expect([cadastrados[0]?.posicaoNoLote, cadastrados[1]?.posicaoNoLote].sort()).toEqual([1, 2]);
    } finally {
      await prisma.equipamento.deleteMany({ where: { loteId: lote.id } });
      await prisma.lote.deleteMany({ where: { id: lote.id } });
      await prisma.organizacao.deleteMany({ where: { id: organizacao.id } });
      await prisma.journalTransacao.deleteMany({ where: { usuarioResponsavel } });
    }
  }, 30000);

  it("gera codigos e posicoes sem colisao, valida mudancas por versao e registra rastreabilidade", async () => {
    const usuarioResponsavel = `teste-equipamento-${randomUUID()}`;
    const cnpj = gerarCnpj();
    const rollback = new Error("rollback do teste de equipamento");

    await expect(prisma.$transaction(async (tx) => {
      const transacionar = async <T>(operacao: (executor: typeof tx) => Promise<T>) => operacao(tx);
      const servicoOrganizacao = new ServicoOrganizacaoPrisma(transacionar, tx);
      const servicoLote = new ServicoLotePrisma(transacionar, tx);
      const servico = new ServicoEquipamentoPrisma(transacionar, tx);
      const organizacao = await servicoOrganizacao.cadastrarOrganizacao({
        razaoSocial: "Organizacao teste equipamento",
        cnpj,
        inscricaoEstadual: "ISENTO",
        enderecoCompleto: "Rua de teste, 20",
        telefone: "11999999999",
        email: "equipamento@example.com"
      }, usuarioResponsavel);
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const lote = await servicoLote.criarLote({
        dataEntrada: hoje,
        organizacaoId: organizacao.id,
        notaFiscal: `NF-${randomUUID()}`,
        transportadora: "Transportadora teste"
      }, usuarioResponsavel);
      const loteFinalizado = await servicoLote.criarLote({
        dataEntrada: hoje,
        organizacaoId: organizacao.id,
        notaFiscal: `NF-${randomUUID()}`,
        transportadora: "Transportadora teste"
      }, usuarioResponsavel);

      expect(servico.gerarCodigoBarras(TipoEquipamento.NOTEBOOK, 12)).toBe("NTB-000012");
      expect(() => servico.gerarCodigoBarras(TipoEquipamento.NOTEBOOK, 0)).toThrow("inteiro positivo");

      await expect(servico.cadastrarEquipamento({
        tipo: TipoEquipamento.NOTEBOOK,
        marca: "Marca teste",
        modelo: "Modelo invalido",
        anoFabricacao: new Date().getFullYear() + 1,
        estadoFisico: EstadoFisico.BOM_ESTADO,
        pesoQuilogramas: 2,
        loteId: lote.id
      }, usuarioResponsavel)).rejects.toThrow("anoFabricacao");

      const dados = (sufixo: string) => ({
        tipo: TipoEquipamento.NOTEBOOK,
        marca: "  Marca teste  ",
        modelo: `Modelo ${sufixo}`,
        anoFabricacao: 2022,
        estadoFisico: EstadoFisico.BOM_ESTADO,
        pesoQuilogramas: 2.5,
        loteId: lote.id
      });
      const primeiro = await servico.cadastrarEquipamento(dados("A"), usuarioResponsavel);
      const segundo = await servico.cadastrarEquipamento(dados("B"), usuarioResponsavel);
      expect(primeiro.codigoBarrasInterno).toMatch(/^NTB-\d{6}$/);
      expect(segundo.codigoBarrasInterno).toMatch(/^NTB-\d{6}$/);
      expect(primeiro.codigoBarrasInterno).not.toBe(segundo.codigoBarrasInterno);
      expect([primeiro.posicaoNoLote, segundo.posicaoNoLote].sort()).toEqual([1, 2]);
      expect(primeiro.marca).toBe("Marca teste");

      await tx.lote.update({ where: { id: loteFinalizado.id }, data: { statusProcessamento: StatusLote.FINALIZADO } });
      await expect(servico.cadastrarEquipamento({ ...dados("C"), loteId: loteFinalizado.id }, usuarioResponsavel))
        .rejects.toThrow("lote ja finalizado");

      const historicoInicial = await servico.rastrearEquipamento(primeiro.id);
      expect(historicoInicial.organizacao.id).toBe(organizacao.id);
      expect(historicoInicial.equipamento.movimentacoes).toHaveLength(0);

      await expect(servico.atualizarEstadoFisico(
        primeiro.id, EstadoFisico.DANIFICADO_GRAVE, 1, usuarioResponsavel
      )).rejects.toThrow("Justificativa obrigatoria");
      const estadoAtualizado = await servico.atualizarEstadoFisico(
        primeiro.id,
        EstadoFisico.DANIFICADO_GRAVE,
        1,
        usuarioResponsavel,
        "Dano identificado na inspeção"
      );
      expect(estadoAtualizado?.versao).toBe(2);
      await expect(servico.atualizarEstadoFisico(
        primeiro.id, EstadoFisico.INSERVIVEL, 1, usuarioResponsavel, "Atualização atrasada"
      )).rejects.toThrow("Conflito de versao");

      await expect(servico.atualizarStatusRastreamento(
        primeiro.id,
        StatusRastreamento.EM_DESMONTE,
        "Tentativa fora de hora",
        2,
        usuarioResponsavel
      )).rejects.toThrow("depois de passar pela triagem");
      const emTriagem = await servico.atualizarStatusRastreamento(
        primeiro.id,
        StatusRastreamento.EM_TRIAGEM,
        "Inicio da triagem individual",
        2,
        usuarioResponsavel
      );
      expect(emTriagem?.versao).toBe(3);
      const emDesmonte = await servico.atualizarStatusRastreamento(
        primeiro.id,
        StatusRastreamento.EM_DESMONTE,
        "Triagem concluida",
        3,
        usuarioResponsavel
      );
      expect(emDesmonte?.versao).toBe(4);

      const movimentacao1 = await servico.registrarMovimentacao(
        primeiro.id, "Bancada", "Pessoa responsavel", 4, usuarioResponsavel
      );
      const movimentacao2 = await servico.registrarMovimentacao(
        primeiro.id, "Desmonte", "Pessoa responsavel", 5, usuarioResponsavel
      );
      expect(movimentacao1.origem).toBe("RECEBIMENTO");
      expect(movimentacao2.origem).toBe("Bancada");
      await expect(servico.registrarMovimentacao(
        primeiro.id, "Local obsoleto", "Pessoa responsavel", 5, usuarioResponsavel
      )).rejects.toThrow("Conflito de versao");

      const historico = await servico.rastrearEquipamento(primeiro.id);
      expect(historico.equipamento.movimentacoes.map((movimento) => movimento.destino)).toEqual(["Bancada", "Desmonte"]);
      expect(historico.equipamento.versao).toBe(6);

      const journal = await tx.journalTransacao.findMany({ where: { usuarioResponsavel } });
      expect(journal.map((registro) => registro.operacao)).toEqual(expect.arrayContaining([
        "CADASTRAR_EQUIPAMENTO",
        "ATUALIZAR_ESTADO_FISICO",
        "ATUALIZAR_STATUS_RASTREAMENTO",
        "REGISTRAR_MOVIMENTACAO"
      ]));
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);

    await expect(prisma.organizacao.findUnique({ where: { cnpj } })).resolves.toBeNull();
    await expect(prisma.journalTransacao.count({ where: { usuarioResponsavel } })).resolves.toBe(0);
  }, 60000);
});
