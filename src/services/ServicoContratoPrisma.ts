import { Prisma } from "@prisma/client";
import { executarTransacao } from "../infra/TransacaoPrisma";
import { prisma } from "../infra/PrismaClient";
import { RepositorioContratoPrisma } from "../infra/repositories/RepositorioContratoPrisma";
import { RepositorioJournalPrisma } from "../infra/repositories/RepositorioJournalPrisma";
import { RepositorioOrganizacaoPrisma } from "../infra/repositories/RepositorioOrganizacaoPrisma";
import { ErroConflitoVersao, validarVersaoEsperada } from "./ErrosServico";
import { PrismaExecutor } from "../infra/repositories/PrismaExecutor";

type Transacionador = <T>(operacao: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export interface DadosNovoContrato {
  organizacaoId: string;
  dataVencimento: Date;
  clausulas: string[];
  valorMensal: number;
  renovacaoAutomatica: boolean;
}

export class ServicoContratoPrisma {
  constructor(
    private readonly transacionar: Transacionador = executarTransacao,
    private readonly db: PrismaExecutor = prisma
  ) {}

  public async cadastrarContrato(dados: DadosNovoContrato, usuarioResponsavel: string) {
    if (!dados.organizacaoId.trim()) throw new Error("organizacaoId e obrigatorio.");
    if (!Number.isFinite(dados.valorMensal) || dados.valorMensal <= 0) {
      throw new Error("valorMensal deve ser um numero positivo.");
    }
    if (!(dados.dataVencimento instanceof Date) || !Number.isFinite(dados.dataVencimento.getTime())) {
      throw new Error("dataVencimento deve ser uma data valida.");
    }
    if (dados.dataVencimento.getTime() <= Date.now()) {
      throw new Error("dataVencimento deve ser uma data futura.");
    }
    if (!Array.isArray(dados.clausulas) || dados.clausulas.some((clausula) => !clausula.trim())) {
      throw new Error("As clausulas devem ser uma lista de textos nao vazios.");
    }

    return this.transacionar(async (tx) => {
      const organizacao = await new RepositorioOrganizacaoPrisma(tx).buscarPorId(dados.organizacaoId);
      if (!organizacao || !organizacao.ativo) {
        throw new Error(`Organizacao '${dados.organizacaoId}' nao encontrada ou inativa.`);
      }

      const contratos = new RepositorioContratoPrisma(tx);
      if (await contratos.buscarPorOrganizacao(dados.organizacaoId)) {
        throw new Error(`A organizacao '${dados.organizacaoId}' ja possui contrato cadastrado.`);
      }

      const criado = await contratos.criar({
        organizacaoId: dados.organizacaoId,
        dataVencimento: dados.dataVencimento,
        clausulas: dados.clausulas.map((clausula) => clausula.trim()),
        valorMensal: dados.valorMensal,
        renovacaoAutomatica: dados.renovacaoAutomatica
      });
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "CADASTRAR_CONTRATO",
        entidade: "Contrato",
        dadosDepois: {
          id: criado.id,
          organizacaoId: criado.organizacaoId,
          valorMensal: criado.valorMensal.toString(),
          dataVencimento: criado.dataVencimento.toISOString()
        },
        usuarioResponsavel
      });
      return criado;
    });
  }

  public buscarContrato(id: string) {
    return new RepositorioContratoPrisma(this.db).buscarPorId(id);
  }

  public buscarContratoPorOrganizacao(organizacaoId: string) {
    return new RepositorioContratoPrisma(this.db).buscarPorOrganizacao(organizacaoId);
  }

  public async renovarContrato(organizacaoId: string, novoVencimento: Date, versaoEsperada: number, usuarioResponsavel: string) {
    validarVersaoEsperada(versaoEsperada);
    if (!(novoVencimento instanceof Date) || !Number.isFinite(novoVencimento.getTime())) {
      throw new Error("novoVencimento deve ser uma data valida.");
    }
    return this.transacionar(async (tx) => {
      const contratos = new RepositorioContratoPrisma(tx);
      const contrato = await contratos.buscarPorOrganizacao(organizacaoId);
      if (!contrato) throw new Error(`Nenhum contrato encontrado para a organizacao '${organizacaoId}'.`);
      if (contrato.versao !== versaoEsperada) throw new ErroConflitoVersao();
      if (novoVencimento.getTime() <= contrato.dataVencimento.getTime()) {
        throw new Error("Novo vencimento deve ser posterior ao vencimento atual.");
      }

      const resultado = await contratos.atualizarSeVersao(contrato.id, versaoEsperada, {
        dataVencimento: novoVencimento,
        versao: { increment: 1 }
      });
      if (resultado.count === 0) throw new ErroConflitoVersao();
      const atualizado = await contratos.buscarPorId(contrato.id);
      if (!atualizado) throw new Error(`Contrato '${contrato.id}' nao encontrado.`);
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "RENOVAR_CONTRATO",
        entidade: "Contrato",
        dadosAntes: { id: contrato.id, dataVencimento: contrato.dataVencimento.toISOString() },
        dadosDepois: { id: atualizado.id, dataVencimento: atualizado.dataVencimento.toISOString() },
        usuarioResponsavel
      });
      return atualizado;
    });
  }
}
