import { Prisma, StatusRastreamento } from "@prisma/client";
import { PrismaExecutor } from "../infra/repositories/PrismaExecutor";
import { RepositorioContratoPrisma } from "../infra/repositories/RepositorioContratoPrisma";
import { RepositorioEquipamentoPrisma } from "../infra/repositories/RepositorioEquipamentoPrisma";
import { RepositorioLotePrisma } from "../infra/repositories/RepositorioLotePrisma";
import { RepositorioOrganizacaoPrisma } from "../infra/repositories/RepositorioOrganizacaoPrisma";

export interface PeriodoRelatorio {
  inicio: Date;
  fim: Date;
}

const LIMITE_RELATORIO = 500;

export class ServicoRelatorioPrisma {
  constructor(private readonly db?: PrismaExecutor) {}

  public async gerarRelatorioPorOrganizacao(organizacaoId: string, periodo: PeriodoRelatorio): Promise<string> {
    this.validarPeriodo(periodo);
    const organizacao = await new RepositorioOrganizacaoPrisma(this.db).buscarPorId(organizacaoId);
    if (!organizacao) throw new Error(`Organizacao '${organizacaoId}' nao encontrada.`);

    const lotes = await new RepositorioLotePrisma(this.db).listarPorOrganizacaoEPeriodo(
      organizacaoId, periodo.inicio, periodo.fim, 0, LIMITE_RELATORIO
    );
    const pesoTotal = lotes.reduce((total, lote) => total + lote.equipamentos.reduce(
      (subtotal, equipamento) => subtotal + equipamento.pesoQuilogramas, 0
    ), 0);
    const linhas = [
      "=== Relatorio por Organizacao ===",
      `Organizacao: ${organizacao.razaoSocial} (CNPJ: ${organizacao.cnpj})`,
      `Periodo: ${this.formatarData(periodo.inicio)} a ${this.formatarData(periodo.fim)}`,
      `Lotes exibidos: ${lotes.length}${lotes.length === LIMITE_RELATORIO ? " (limite do relatorio)" : ""}`,
      ""
    ];
    for (const lote of lotes) {
      const pesoLote = lote.equipamentos.reduce((total, equipamento) => total + equipamento.pesoQuilogramas, 0);
      linhas.push(
        `- Lote ${lote.id} | NF ${lote.notaFiscal} | ${this.formatarData(lote.dataEntrada)} | ` +
        `Status: ${lote.statusProcessamento} | Equipamentos: ${lote.equipamentos.length} | Peso: ${pesoLote.toFixed(2)} kg`
      );
    }
    linhas.push("", `Peso total dos lotes exibidos: ${pesoTotal.toFixed(2)} kg`);
    return linhas.join("\n");
  }

  public async gerarRelatorioPorStatus(status: StatusRastreamento): Promise<string> {
    const equipamentosRepo = new RepositorioEquipamentoPrisma(this.db);
    const [resumo, equipamentos] = await Promise.all([
      equipamentosRepo.resumirPorStatus(status),
      equipamentosRepo.listarPorStatus(status, 0, LIMITE_RELATORIO)
    ]);
    const linhas = [
      "=== Relatorio por Status de Rastreamento ===",
      `Status: ${status}`,
      `Total de equipamentos: ${resumo._count._all}`,
      `Peso total: ${(resumo._sum.pesoQuilogramas ?? 0).toFixed(2)} kg`,
      `Equipamentos detalhados: ${equipamentos.length}${resumo._count._all > equipamentos.length ? ` de ${resumo._count._all}` : ""}`,
      ""
    ];
    for (const equipamento of equipamentos) {
      linhas.push(
        `- ${equipamento.codigoBarrasInterno} | ${equipamento.tipo} | ${equipamento.marca} ${equipamento.modelo} | ` +
        `Lote: ${equipamento.loteId} | Estado fisico: ${equipamento.estadoFisico} | Peso: ${equipamento.pesoQuilogramas.toFixed(2)} kg`
      );
    }
    return linhas.join("\n");
  }

  public async gerarRelatorioFinanceiro(periodo: PeriodoRelatorio): Promise<string> {
    this.validarPeriodo(periodo);
    const contratos = await new RepositorioContratoPrisma(this.db).listarPorPeriodo(
      periodo.inicio, periodo.fim, 0, LIMITE_RELATORIO
    );
    const totalDecimal = contratos.reduce((total, contrato) => total.plus(contrato.valorMensal), new Prisma.Decimal(0));
    const linhas = [
      "=== Relatorio Financeiro (receita de contratos) ===",
      `Periodo: ${this.formatarData(periodo.inicio)} a ${this.formatarData(periodo.fim)}`,
      `Contratos exibidos: ${contratos.length}${contratos.length === LIMITE_RELATORIO ? " (limite do relatorio)" : ""}`,
      ""
    ];
    for (const contrato of contratos) {
      linhas.push(
        `- Contrato ${contrato.id} | Organizacao: ${contrato.organizacao.razaoSocial} | ` +
        `Assinado em: ${this.formatarData(contrato.dataAssinatura)} | Valor mensal: R$ ${contrato.valorMensal.toFixed(2)}`
      );
    }
    linhas.push("", `Receita mensal total (contratos exibidos): R$ ${totalDecimal.toFixed(2)}`);
    return linhas.join("\n");
  }

  private validarPeriodo(periodo: PeriodoRelatorio): void {
    if (!Number.isFinite(periodo.inicio.getTime()) || !Number.isFinite(periodo.fim.getTime())) {
      throw new Error("O periodo informado contem uma data invalida.");
    }
    if (periodo.inicio.getTime() > periodo.fim.getTime()) {
      throw new Error("periodo.inicio nao pode ser posterior a periodo.fim.");
    }
  }

  private formatarData(data: Date): string {
    return data.toISOString().slice(0, 10);
  }
}
