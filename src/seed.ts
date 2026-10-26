import { EstadoFisico, PapelUsuario, StatusLote, StatusRastreamento, TipoEquipamento } from "@prisma/client";
import { prisma } from "./infra/PrismaClient";
import { PrismaExecutor as ExecutorPrisma } from "./infra/repositories/PrismaExecutor";
import { HashSenhaScrypt } from "./security/HashSenhaScrypt";

const USUARIO_ADMINISTRADOR = "admin";
const CNPJ_ORGANIZACAO_EXEMPLO = "11222333000181";
const ID_LOTE_RECEBIDO = "00000000-0000-4000-8000-000000000012";
const ID_LOTE_EM_TRIAGEM = "00000000-0000-4000-8000-000000000013";
const ID_LOTE_TRIAGEM_CONCLUIDA = "00000000-0000-4000-8000-000000000014";
const LOTES_DEMONSTRACAO = [
  {
    id: ID_LOTE_RECEBIDO,
    notaFiscal: "NF-SEED-0001",
    statusProcessamento: StatusLote.RECEBIDO,
    observacoes: "Lote demonstrativo aguardando triagem."
  },
  {
    id: ID_LOTE_EM_TRIAGEM,
    notaFiscal: "NF-SEED-0002",
    statusProcessamento: StatusLote.EM_TRIAGEM,
    observacoes: "Lote demonstrativo em triagem."
  },
  {
    id: ID_LOTE_TRIAGEM_CONCLUIDA,
    notaFiscal: "NF-SEED-0003",
    statusProcessamento: StatusLote.TRIAGEM_CONCLUIDA,
    observacoes: "Lote demonstrativo com triagem concluida e destinos variados."
  }
];

const EQUIPAMENTOS_DEMONSTRACAO = [
  {
    codigoBarrasInterno: "SEED-NTB-000001",
    tipo: TipoEquipamento.NOTEBOOK,
    marca: "GreenCode",
    modelo: "Notebook demonstrativo",
    anoFabricacao: 2022,
    estadoFisico: EstadoFisico.USADO_LEVE,
    pesoQuilogramas: 2.4,
    loteId: ID_LOTE_RECEBIDO,
    posicaoNoLote: 1,
    statusRastreamento: StatusRastreamento.AGUARDANDO_TRIAGEM
  },
  {
    codigoBarrasInterno: "SEED-MON-000001",
    tipo: TipoEquipamento.MONITOR,
    marca: "GreenCode",
    modelo: "Monitor em triagem",
    anoFabricacao: 2021,
    estadoFisico: EstadoFisico.BOM_ESTADO,
    pesoQuilogramas: 4.8,
    loteId: ID_LOTE_EM_TRIAGEM,
    posicaoNoLote: 1,
    statusRastreamento: StatusRastreamento.EM_TRIAGEM
  },
  {
    codigoBarrasInterno: "SEED-CPD-000001",
    tipo: TipoEquipamento.COMPUTADOR_MESA,
    marca: "GreenCode",
    modelo: "Desktop aguardando desmonte",
    anoFabricacao: 2020,
    estadoFisico: EstadoFisico.USADO_MODERADO,
    pesoQuilogramas: 8.5,
    loteId: ID_LOTE_TRIAGEM_CONCLUIDA,
    posicaoNoLote: 1,
    statusRastreamento: StatusRastreamento.AGUARDANDO_DESMONTE
  },
  {
    codigoBarrasInterno: "SEED-IMP-000001",
    tipo: TipoEquipamento.IMPRESSORA,
    marca: "GreenCode",
    modelo: "Impressora em desmonte",
    anoFabricacao: 2019,
    estadoFisico: EstadoFisico.DANIFICADO_LEVE,
    pesoQuilogramas: 6.2,
    loteId: ID_LOTE_TRIAGEM_CONCLUIDA,
    posicaoNoLote: 2,
    statusRastreamento: StatusRastreamento.EM_DESMONTE
  },
  {
    codigoBarrasInterno: "SEED-RTD-000001",
    tipo: TipoEquipamento.ROTEADOR,
    marca: "GreenCode",
    modelo: "Roteador para reaproveitamento",
    anoFabricacao: 2023,
    estadoFisico: EstadoFisico.BOM_ESTADO,
    pesoQuilogramas: 0.8,
    loteId: ID_LOTE_TRIAGEM_CONCLUIDA,
    posicaoNoLote: 3,
    statusRastreamento: StatusRastreamento.PECAS_REAPROVEITADAS
  },
  {
    codigoBarrasInterno: "SEED-CAB-000001",
    tipo: TipoEquipamento.CABO_ESTRUTURADO,
    marca: "GreenCode",
    modelo: "Cabos para reciclagem",
    anoFabricacao: 2024,
    estadoFisico: EstadoFisico.USADO_LEVE,
    pesoQuilogramas: 1.1,
    loteId: ID_LOTE_TRIAGEM_CONCLUIDA,
    posicaoNoLote: 4,
    statusRastreamento: StatusRastreamento.MATERIAL_RECICLAVEL
  },
  {
    codigoBarrasInterno: "SEED-SRV-000001",
    tipo: TipoEquipamento.SERVIDOR,
    marca: "GreenCode",
    modelo: "Servidor para descarte seguro",
    anoFabricacao: 2018,
    estadoFisico: EstadoFisico.DANIFICADO_GRAVE,
    pesoQuilogramas: 12.5,
    loteId: ID_LOTE_TRIAGEM_CONCLUIDA,
    posicaoNoLote: 5,
    statusRastreamento: StatusRastreamento.DESCARTE_SEGURO
  },
  {
    codigoBarrasInterno: "SEED-FNT-000001",
    tipo: TipoEquipamento.FONTE_ALIMENTACAO,
    marca: "GreenCode",
    modelo: "Fonte com baixa definitiva",
    anoFabricacao: 2017,
    estadoFisico: EstadoFisico.INSERVIVEL,
    pesoQuilogramas: 1.7,
    loteId: ID_LOTE_TRIAGEM_CONCLUIDA,
    posicaoNoLote: 6,
    statusRastreamento: StatusRastreamento.BAIXA_DEFINITIVA
  }
];

export async function executarSeed(db: ExecutorPrisma, senhaAdministrador: string): Promise<void> {
  if (Buffer.byteLength(senhaAdministrador, "utf8") < 12) {
    throw new Error("SEED_ADMIN_PASSWORD deve ter pelo menos 12 bytes.");
  }

  const hashSenha = await HashSenhaScrypt.gerar(senhaAdministrador);
  await db.usuario.upsert({
    where: { usuario: USUARIO_ADMINISTRADOR },
    update: {},
    create: { usuario: USUARIO_ADMINISTRADOR, hashSenha, papel: PapelUsuario.ADMINISTRADOR }
  });

  const organizacao = await db.organizacao.upsert({
    where: { cnpj: CNPJ_ORGANIZACAO_EXEMPLO },
    update: {},
    create: {
      razaoSocial: "Organizacao demonstrativa GreenCode",
      cnpj: CNPJ_ORGANIZACAO_EXEMPLO,
      inscricaoEstadual: "ISENTO",
      enderecoCompleto: "Rua das Palmeiras, 120 - Sao Paulo/SP",
      telefone: "1130000000",
      email: "contato@organizacao-demo.example"
    }
  });

  const vencimento = new Date();
  vencimento.setFullYear(vencimento.getFullYear() + 2);
  await db.contrato.upsert({
    where: { organizacaoId: organizacao.id },
    update: {},
    create: {
      organizacaoId: organizacao.id,
      dataAssinatura: new Date(),
      dataVencimento: vencimento,
      clausulas: ["Contrato demonstrativo para ambiente de desenvolvimento"],
      valorMensal: "1500.00",
      renovacaoAutomatica: true
    }
  });

  for (const lote of LOTES_DEMONSTRACAO) {
    await db.lote.upsert({
      where: { id: lote.id },
      update: {},
      create: {
        ...lote,
        dataEntrada: new Date(),
        organizacaoId: organizacao.id,
        transportadora: "Transportadora demonstrativa"
      }
    });
  }

  for (const equipamento of EQUIPAMENTOS_DEMONSTRACAO) {
    await db.equipamento.upsert({
      where: { codigoBarrasInterno: equipamento.codigoBarrasInterno },
      update: {},
      create: equipamento
    });
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed demonstrativo nao pode ser executado em producao.");
  }
  const senha = process.env.SEED_ADMIN_PASSWORD;
  if (!senha) throw new Error("Defina SEED_ADMIN_PASSWORD no ambiente antes de executar o seed.");

  await prisma.$transaction((tx) => executarSeed(tx, senha));
  console.log("Seed concluido: administrador e dados demonstrativos estao prontos.");
}

if (require.main === module) {
  main()
    .catch((erro: unknown) => {
      console.error("Falha ao executar seed:", erro instanceof Error ? erro.message : erro);
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
