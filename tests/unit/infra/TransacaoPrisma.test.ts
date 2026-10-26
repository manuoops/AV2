import { randomUUID } from "crypto";
import { prisma } from "../../../src/infra/PrismaClient";
import { executarTransacao } from "../../../src/infra/TransacaoPrisma";
import { RepositorioJournalPrisma } from "../../../src/infra/repositories/RepositorioJournalPrisma";

describe("transações Prisma e Journal", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("persiste Journal na tabela dentro da transação e reverte tudo quando ocorre erro", async () => {
    const id = randomUUID();
    const erroEsperado = new Error("falha simulada para confirmar rollback");

    await expect(
      executarTransacao(async (tx) => {
        const journal = new RepositorioJournalPrisma(tx);
        const registro = await journal.registrar({
          id,
          operacao: "TESTE_TRANSACAO",
          entidade: "Teste",
          dadosDepois: { teste: true },
          usuarioResponsavel: "teste"
        });

        const persistidoNaTransacao = await journal.buscarPorId(registro.id);
        expect(persistidoNaTransacao?.operacao).toBe("TESTE_TRANSACAO");

        throw erroEsperado;
      })
    ).rejects.toBe(erroEsperado);

    await expect(prisma.journalTransacao.findUnique({ where: { id } })).resolves.toBeNull();
  });

  it("confirma a transação e retorna o resultado da operação", async () => {
    const resultado = await executarTransacao(async (tx) => {
      const [linha] = await tx.$queryRaw<Array<{ valor: number }>>`SELECT 1 AS valor`;
      return linha?.valor;
    });

    expect(resultado).toBe(1);
  });
});
