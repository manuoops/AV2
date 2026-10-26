import { randomUUID } from "crypto";
import { PapelUsuario } from "@prisma/client";
import { criarServidor } from "../../src/http/Servidor";
import { prisma } from "../../src/infra/PrismaClient";
import { executarSeed } from "../../src/seed";

const IDS_LOTES_SEED = [
  "00000000-0000-4000-8000-000000000012",
  "00000000-0000-4000-8000-000000000013",
  "00000000-0000-4000-8000-000000000014"
];

describe("seed de desenvolvimento", () => {
  afterAll(async () => prisma.$disconnect());

  it("provisiona um administrador autenticavel e dados demonstrativos sem duplicar", async () => {
    const abortar = new Error("ROLLBACK_TESTE_SEED");
    await expect(prisma.$transaction(async (tx) => {
      const senhaInicial = "SenhaSeedForte#2026";
      const senhaTentativaTroca = "OutraSenhaSeed#2026";
      await executarSeed(tx, senhaInicial);
      const app = await criarServidor({
        database: tx,
        transacionar: async (operacao) => operacao(tx)
      });

      try {
        const contagemPrimeira = {
          admin: await tx.usuario.count({ where: { usuario: "admin" } }),
          organizacao: await tx.organizacao.count({ where: { cnpj: "11222333000181" } }),
          lotes: await tx.lote.count({ where: { id: { in: IDS_LOTES_SEED } } }),
          equipamentos: await tx.equipamento.count({ where: { codigoBarrasInterno: { startsWith: "SEED-" } } })
        };

        await executarSeed(tx, senhaTentativaTroca);
        const contagemSegunda = {
          admin: await tx.usuario.count({ where: { usuario: "admin" } }),
          organizacao: await tx.organizacao.count({ where: { cnpj: "11222333000181" } }),
          lotes: await tx.lote.count({ where: { id: { in: IDS_LOTES_SEED } } }),
          equipamentos: await tx.equipamento.count({ where: { codigoBarrasInterno: { startsWith: "SEED-" } } })
        };

        expect(contagemPrimeira).toEqual({ admin: 1, organizacao: 1, lotes: 3, equipamentos: 8 });
        expect(contagemSegunda).toEqual(contagemPrimeira);
        expect(await tx.contrato.count({ where: { organizacao: { cnpj: "11222333000181" } } })).toBe(1);

        const equipamentos = await tx.equipamento.findMany({
          where: { codigoBarrasInterno: { startsWith: "SEED-" } },
          select: { statusRastreamento: true }
        });
        expect(new Set(equipamentos.map(({ statusRastreamento }) => statusRastreamento)).size).toBe(8);

        const statusLotes = await tx.lote.findMany({
          where: { id: { in: IDS_LOTES_SEED } },
          select: { statusProcessamento: true }
        });
        expect(new Set(statusLotes.map(({ statusProcessamento }) => statusProcessamento)).size).toBe(3);

        const loginAdmin = await app.inject({
          method: "POST", url: "/auth/login", payload: { usuario: "admin", senha: senhaInicial }
        });
        expect(loginAdmin.statusCode).toBe(200);
        const tokenAdmin = loginAdmin.json<{ accessToken: string }>().accessToken;
        const identidade = await app.inject({
          method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${tokenAdmin}` }
        });
        expect(identidade.statusCode).toBe(200);
        expect(identidade.json()).toMatchObject({ usuario: "admin", papel: PapelUsuario.ADMINISTRADOR });

        const loginComSenhaDaSegundaExecucao = await app.inject({
          method: "POST", url: "/auth/login", payload: { usuario: "admin", senha: senhaTentativaTroca }
        });
        expect(loginComSenhaDaSegundaExecucao.statusCode).toBe(401);

        const usuarioProvisionado = await app.inject({
          method: "POST", url: "/auth/usuarios", headers: { authorization: `Bearer ${tokenAdmin}` },
          payload: {
            usuario: `seed-${randomUUID().slice(0, 8)}`,
            senha: "SenhaDeUsuario#2026",
            papel: PapelUsuario.AUDITORIA
          }
        });
        expect(usuarioProvisionado.statusCode).toBe(201);
        expect(usuarioProvisionado.json()).not.toHaveProperty("hashSenha");

        throw abortar;
      } finally {
        await app.close();
      }
    }, { timeout: 30000 })).rejects.toBe(abortar);
  }, 30000);

  it("recusa senha inicial abaixo do mínimo antes de gravar", async () => {
    await expect(prisma.$transaction((tx) => executarSeed(tx, "curta")))
      .rejects.toThrow("pelo menos 12 bytes");
  });
});
