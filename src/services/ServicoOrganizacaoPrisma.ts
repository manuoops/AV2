import { Prisma } from "@prisma/client";
import { ValidadorCNPJ } from "../validators/ValidadorCNPJ";
import { executarTransacao } from "../infra/TransacaoPrisma";
import { prisma } from "../infra/PrismaClient";
import { PrismaExecutor } from "../infra/repositories/PrismaExecutor";
import { RepositorioContratoPrisma } from "../infra/repositories/RepositorioContratoPrisma";
import { RepositorioJournalPrisma } from "../infra/repositories/RepositorioJournalPrisma";
import { RepositorioOrganizacaoPrisma } from "../infra/repositories/RepositorioOrganizacaoPrisma";
import { ErroConflitoVersao, validarVersaoEsperada } from "./ErrosServico";

type Transacionador = <T>(operacao: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

export interface DadosNovaOrganizacao {
  razaoSocial: string;
  cnpj: string;
  inscricaoEstadual: string;
  enderecoCompleto: string;
  telefone: string;
  email: string;
}

function converterErroPrisma(erro: unknown): never {
  if (erro instanceof Prisma.PrismaClientKnownRequestError) {
    if (erro.code === "P2002") throw new Error("Ja existe uma organizacao cadastrada com este CNPJ.");
  }
  throw erro;
}

export class ServicoOrganizacaoPrisma {
  constructor(
    private readonly transacionar: Transacionador = executarTransacao,
    private readonly db: PrismaExecutor = prisma
  ) {}

  public async cadastrarOrganizacao(dados: DadosNovaOrganizacao, usuarioResponsavel: string) {
    const dadosNormalizados = {
      razaoSocial: dados.razaoSocial.trim(),
      cnpj: dados.cnpj.replace(/\D/g, ""),
      inscricaoEstadual: dados.inscricaoEstadual.trim(),
      enderecoCompleto: dados.enderecoCompleto.trim(),
      telefone: dados.telefone.trim(),
      email: dados.email.trim()
    };
    for (const [campo, valor] of Object.entries(dadosNormalizados)) {
      if (!valor) throw new Error(`O campo ${campo} e obrigatorio.`);
    }
    const validadorCNPJ = new ValidadorCNPJ();
    if (!validadorCNPJ.validar(dadosNormalizados.cnpj)) {
      throw new Error(validadorCNPJ.obterMensagemErro());
    }

    try {
      return await this.transacionar(async (tx) => {
        const organizacoes = new RepositorioOrganizacaoPrisma(tx);
        if (await organizacoes.buscarPorCnpj(dadosNormalizados.cnpj)) {
          throw new Error("Ja existe uma organizacao cadastrada com este CNPJ.");
        }
        const criada = await organizacoes.criar({ ...dadosNormalizados });
        await new RepositorioJournalPrisma(tx).registrar({
          operacao: "CADASTRAR_ORGANIZACAO",
          entidade: "Organizacao",
          dadosDepois: { id: criada.id, razaoSocial: criada.razaoSocial, cnpj: criada.cnpj },
          usuarioResponsavel
        });
        return criada;
      });
    } catch (erro) {
      return converterErroPrisma(erro);
    }
  }

  public buscarOrganizacao(id: string) {
    return new RepositorioOrganizacaoPrisma(this.db).buscarPorId(id);
  }

  public listarOrganizacoesAtivas(skip = 0, take = 100) {
    return new RepositorioOrganizacaoPrisma(this.db).listarAtivas(skip, take);
  }

  public async alterarEndereco(id: string, novoEndereco: string, versaoEsperada: number, usuarioResponsavel: string) {
    validarVersaoEsperada(versaoEsperada);
    const endereco = novoEndereco.trim();
    if (!endereco) throw new Error("O novo endereco nao pode ser vazio.");

    return this.transacionar(async (tx) => {
      const organizacoes = new RepositorioOrganizacaoPrisma(tx);
      const atual = await organizacoes.buscarPorId(id);
      if (!atual) throw new Error(`Organizacao '${id}' nao encontrada.`);
      const resultado = await organizacoes.atualizarSeVersao(id, versaoEsperada, {
        enderecoCompleto: endereco,
        versao: { increment: 1 }
      });
      if (resultado.count === 0) throw new ErroConflitoVersao();
      const atualizada = await organizacoes.buscarPorId(id);
      if (!atualizada) throw new Error(`Organizacao '${id}' nao encontrada.`);
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "ALTERAR_ENDERECO_ORGANIZACAO",
        entidade: "Organizacao",
        dadosAntes: { id, enderecoCompleto: atual.enderecoCompleto },
        dadosDepois: { id, enderecoCompleto: atualizada.enderecoCompleto },
        usuarioResponsavel
      });
      return atualizada;
    });
  }

  public async desativarOrganizacao(id: string, versaoEsperada: number, usuarioResponsavel: string) {
    validarVersaoEsperada(versaoEsperada);
    return this.transacionar(async (tx) => {
      const organizacoes = new RepositorioOrganizacaoPrisma(tx);
      const atual = await organizacoes.buscarPorId(id);
      if (!atual) throw new Error(`Organizacao '${id}' nao encontrada.`);
      if (atual.versao !== versaoEsperada) throw new ErroConflitoVersao();
      if (!atual.ativo) return atual;
      const resultado = await organizacoes.atualizarSeVersao(id, versaoEsperada, {
        ativo: false,
        versao: { increment: 1 }
      });
      if (resultado.count === 0) throw new ErroConflitoVersao();
      const atualizada = await organizacoes.buscarPorId(id);
      if (!atualizada) throw new Error(`Organizacao '${id}' nao encontrada.`);
      await new RepositorioJournalPrisma(tx).registrar({
        operacao: "DESATIVAR_ORGANIZACAO",
        entidade: "Organizacao",
        dadosAntes: { id, ativo: atual.ativo },
        dadosDepois: { id, ativo: atualizada.ativo },
        usuarioResponsavel
      });
      return atualizada;
    });
  }
}
