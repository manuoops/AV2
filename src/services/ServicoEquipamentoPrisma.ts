import {
  EstadoFisico,
  Prisma,
  StatusLote,
  StatusRastreamento,
  TipoEquipamento
} from "@prisma/client";
import { executarTransacao } from "../infra/TransacaoPrisma";
import { prisma } from "../infra/PrismaClient";
import { RepositorioEquipamentoPrisma } from "../infra/repositories/RepositorioEquipamentoPrisma";
import { RepositorioJournalPrisma } from "../infra/repositories/RepositorioJournalPrisma";
import { RepositorioLotePrisma } from "../infra/repositories/RepositorioLotePrisma";
import { RepositorioMovimentacaoPrisma } from "../infra/repositories/RepositorioMovimentacaoPrisma";
import { RepositorioOrganizacaoPrisma } from "../infra/repositories/RepositorioOrganizacaoPrisma";
import { PrismaExecutor } from "../infra/repositories/PrismaExecutor";

type Transacionador = <T>(operacao: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export interface DadosNovoEquipamento {
  tipo: TipoEquipamento;
  marca: string;
  modelo: string;
  anoFabricacao: number;
  estadoFisico: EstadoFisico;
  pesoQuilogramas: number;
  loteId: string;
}

export interface HistoricoCompletoPrisma {
  equipamento: NonNullable<Awaited<ReturnType<RepositorioEquipamentoPrisma["buscarPorId"]>>>;
  lote: NonNullable<Awaited<ReturnType<RepositorioLotePrisma["buscarPorId"]>>>;
  organizacao: NonNullable<Awaited<ReturnType<RepositorioOrganizacaoPrisma["buscarPorId"]>>>;
}

const PREFIXO_POR_TIPO: Record<TipoEquipamento, string> = {
  COMPUTADOR_MESA: "CPD",
  NOTEBOOK: "NTB",
  MONITOR: "MON",
  IMPRESSORA: "IMP",
  SERVIDOR: "SRV",
  ROTEADOR: "RTD",
  CABO_ESTRUTURADO: "CAB",
  FONTE_ALIMENTACAO: "FNT"
};

const ORDEM_ESTADO_FISICO: Record<EstadoFisico, number> = {
  NOVO: 0,
  BOM_ESTADO: 1,
  USADO_LEVE: 2,
  USADO_MODERADO: 3,
  DANIFICADO_LEVE: 4,
  DANIFICADO_GRAVE: 5,
  INSERVIVEL: 6
};

const ORDEM_STATUS_RASTREAMENTO: Record<StatusRastreamento, number> = {
  AGUARDANDO_TRIAGEM: 0,
  EM_TRIAGEM: 1,
  AGUARDANDO_DESMONTE: 2,
  EM_DESMONTE: 3,
  PECAS_REAPROVEITADAS: 4,
  MATERIAL_RECICLAVEL: 4,
  DESCARTE_SEGURO: 4,
  BAIXA_DEFINITIVA: 5
};

const ANO_MINIMO_FABRICACAO = 1980;
const QUEDA_MINIMA_COM_JUSTIFICATIVA = 2;

export class ServicoEquipamentoPrisma {
  constructor(
    private readonly transacionar: Transacionador = executarTransacao,
    private readonly db: PrismaExecutor = prisma
  ) {}

  public gerarCodigoBarras(tipo: TipoEquipamento, sequencia: number): string {
    if (!Number.isInteger(sequencia) || sequencia < 1) {
      throw new Error("sequencia deve ser um numero inteiro positivo.");
    }
    const prefixo = PREFIXO_POR_TIPO[tipo];
    if (!prefixo) throw new Error(`Tipo de equipamento invalido: '${tipo}'.`);
    return `${prefixo}-${sequencia.toString().padStart(6, "0")}`;
  }

  public async cadastrarEquipamento(dados: DadosNovoEquipamento, usuarioResponsavel: string) {
    this.validarDados(dados);
    return this.transacionar(async (tx) => {
      const lote = await new RepositorioLotePrisma(tx).buscarPorId(dados.loteId);
      if (!lote) throw new Error(`Lote '${dados.loteId}' nao encontrado.`);
      if (lote.statusProcessamento === StatusLote.FINALIZADO) {
        throw new Error("Nao e possivel adicionar equipamento em um lote ja finalizado.");
      }
      const organizacao = await new RepositorioOrganizacaoPrisma(tx).buscarPorId(lote.organizacaoId);
      if (!organizacao?.ativo) throw new Error("A organizacao do lote esta inativa.");

      // Locks transacionais evitam que cadastros concorrentes repitam a sequencia do codigo ou da posicao.
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_advisory_xact_lock(hashtext(${`greencode:codigo:${dados.tipo}`})) IS NULL AS locked
      `;
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_advisory_xact_lock(hashtext(${`greencode:lote:${dados.loteId}`})) IS NULL AS locked
      `;

      const equipamentos = new RepositorioEquipamentoPrisma(tx);
      let sequenciaTipo = (await equipamentos.contarPorTipo(dados.tipo)) + 1;
      let codigoBarrasInterno = this.gerarCodigoBarras(dados.tipo, sequenciaTipo);
      while (await equipamentos.buscarPorCodigoBarras(codigoBarrasInterno)) {
        sequenciaTipo += 1;
        codigoBarrasInterno = this.gerarCodigoBarras(dados.tipo, sequenciaTipo);
      }
      const posicaoNoLote = (await equipamentos.contarPorLote(dados.loteId)) + 1;
      const equipamento = await equipamentos.criar({
        ...dados,
        marca: dados.marca.trim(),
        modelo: dados.modelo.trim(),
        codigoBarrasInterno,
        posicaoNoLote
      });
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "CADASTRAR_EQUIPAMENTO",
        entidade: "Equipamento",
        dadosDepois: {
          id: equipamento.id,
          codigoBarrasInterno,
          loteId: equipamento.loteId,
          posicaoNoLote
        },
        usuarioResponsavel
      });
      return equipamento;
    });
  }

  public buscarEquipamento(id: string) {
    return new RepositorioEquipamentoPrisma(this.db).buscarPorId(id);
  }

  public async rastrearEquipamento(id: string): Promise<HistoricoCompletoPrisma> {
    const equipamento = await new RepositorioEquipamentoPrisma(this.db).buscarPorId(id);
    if (!equipamento) throw new Error(`Equipamento '${id}' nao encontrado.`);
    const lote = await new RepositorioLotePrisma(this.db).buscarPorId(equipamento.loteId);
    if (!lote) throw new Error(`Lote '${equipamento.loteId}' nao encontrado.`);
    const organizacao = await new RepositorioOrganizacaoPrisma(this.db).buscarPorId(lote.organizacaoId);
    if (!organizacao) throw new Error(`Organizacao '${lote.organizacaoId}' nao encontrada.`);
    return { equipamento, lote, organizacao };
  }

  public async atualizarEstadoFisico(
    id: string,
    novoEstado: EstadoFisico,
    versaoEsperada: number,
    usuarioResponsavel: string,
    justificativa?: string
  ) {
    return this.transacionar(async (tx) => {
      const equipamentos = new RepositorioEquipamentoPrisma(tx);
      const atual = await equipamentos.buscarPorId(id);
      if (!atual) throw new Error(`Equipamento '${id}' nao encontrado.`);
      const queda = ORDEM_ESTADO_FISICO[novoEstado] - ORDEM_ESTADO_FISICO[atual.estadoFisico];
      if (queda >= QUEDA_MINIMA_COM_JUSTIFICATIVA && !justificativa?.trim()) {
        throw new Error(`Justificativa obrigatoria: o estado fisico piorou ${queda} categorias.`);
      }

      await this.atualizarComVersao(equipamentos, id, versaoEsperada, {
        estadoFisico: novoEstado,
        versao: { increment: 1 }
      });
      const atualizado = await equipamentos.buscarPorId(id);
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "ATUALIZAR_ESTADO_FISICO",
        entidade: "Equipamento",
        dadosAntes: { id, estadoFisico: atual.estadoFisico, versao: atual.versao },
        dadosDepois: {
          id,
          estadoFisico: novoEstado,
          versao: atualizado!.versao,
          justificativa: justificativa?.trim() || null
        },
        usuarioResponsavel
      });
      return atualizado;
    });
  }

  public async atualizarStatusRastreamento(
    id: string,
    novoStatus: StatusRastreamento,
    justificativa: string,
    versaoEsperada: number,
    usuarioResponsavel: string
  ) {
    if (!justificativa.trim()) throw new Error("Justificativa e obrigatoria para atualizar o status.");
    return this.transacionar(async (tx) => {
      const equipamentos = new RepositorioEquipamentoPrisma(tx);
      const atual = await equipamentos.buscarPorId(id);
      if (!atual) throw new Error(`Equipamento '${id}' nao encontrado.`);
      const entrandoEmDesmonte =
        novoStatus === StatusRastreamento.AGUARDANDO_DESMONTE || novoStatus === StatusRastreamento.EM_DESMONTE;
      if (
        entrandoEmDesmonte &&
        ORDEM_STATUS_RASTREAMENTO[atual.statusRastreamento] < ORDEM_STATUS_RASTREAMENTO.EM_TRIAGEM
      ) {
        throw new Error("Equipamento so pode ir para desmonte depois de passar pela triagem.");
      }

      await this.atualizarComVersao(equipamentos, id, versaoEsperada, {
        statusRastreamento: novoStatus,
        versao: { increment: 1 }
      });
      const atualizado = await equipamentos.buscarPorId(id);
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "ATUALIZAR_STATUS_RASTREAMENTO",
        entidade: "Equipamento",
        dadosAntes: { id, statusRastreamento: atual.statusRastreamento, versao: atual.versao },
        dadosDepois: {
          id,
          statusRastreamento: novoStatus,
          versao: atualizado!.versao,
          justificativa: justificativa.trim()
        },
        usuarioResponsavel
      });
      return atualizado;
    });
  }

  public async registrarMovimentacao(
    id: string,
    destino: string,
    responsavel: string,
    versaoEsperada: number,
    usuarioResponsavel: string,
    observacao = ""
  ) {
    if (!destino.trim()) throw new Error("destino e obrigatorio.");
    if (!responsavel.trim()) throw new Error("responsavel e obrigatorio.");
    return this.transacionar(async (tx) => {
      const equipamentos = new RepositorioEquipamentoPrisma(tx);
      const atual = await equipamentos.buscarPorId(id);
      if (!atual) throw new Error(`Equipamento '${id}' nao encontrado.`);
      const ultimaMovimentacao = atual.movimentacoes.at(-1);
      const origem = ultimaMovimentacao?.destino ?? "RECEBIMENTO";

      await this.atualizarComVersao(equipamentos, id, versaoEsperada, {
        versao: { increment: 1 }
      });
      const movimentacao = await new RepositorioMovimentacaoPrisma(tx).registrar({
        equipamentoId: id,
        origem,
        destino: destino.trim(),
        responsavel: responsavel.trim(),
        observacao: observacao.trim()
      });
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "REGISTRAR_MOVIMENTACAO",
        entidade: "Equipamento",
        dadosAntes: { id, ultimaLocalizacao: origem, versao: atual.versao },
        dadosDepois: {
          id,
          movimentacaoId: movimentacao.id,
          destino: movimentacao.destino,
          responsavel: movimentacao.responsavel,
          versao: versaoEsperada + 1
        },
        usuarioResponsavel
      });
      return movimentacao;
    });
  }

  private validarDados(dados: DadosNovoEquipamento): void {
    if (!Object.values(TipoEquipamento).includes(dados.tipo)) throw new Error("tipo de equipamento invalido.");
    if (!Object.values(EstadoFisico).includes(dados.estadoFisico)) throw new Error("estado fisico invalido.");
    if (!dados.marca.trim()) throw new Error("marca e obrigatoria.");
    if (!dados.modelo.trim()) throw new Error("modelo e obrigatorio.");
    if (!dados.loteId.trim()) throw new Error("loteId e obrigatorio.");
    const anoAtual = new Date().getFullYear();
    if (!Number.isInteger(dados.anoFabricacao) || dados.anoFabricacao < ANO_MINIMO_FABRICACAO || dados.anoFabricacao > anoAtual) {
      throw new Error(`anoFabricacao deve estar entre ${ANO_MINIMO_FABRICACAO} e ${anoAtual}.`);
    }
    if (!Number.isFinite(dados.pesoQuilogramas) || dados.pesoQuilogramas <= 0) {
      throw new Error("pesoQuilogramas deve ser um numero positivo.");
    }
  }

  private async atualizarComVersao(
    equipamentos: RepositorioEquipamentoPrisma,
    id: string,
    versaoEsperada: number,
    dados: Prisma.EquipamentoUncheckedUpdateInput
  ): Promise<void> {
    if (!Number.isInteger(versaoEsperada) || versaoEsperada < 1) {
      throw new Error("versaoEsperada deve ser um numero inteiro positivo.");
    }
    const resultado = await equipamentos.atualizarSeVersao(id, versaoEsperada, dados);
    if (resultado.count === 0) {
      throw new Error("Conflito de versao: o equipamento foi alterado por outra operacao; atualize os dados e tente novamente.");
    }
  }
}
