import { HashSenhaScrypt } from "../../../src/security/HashSenhaScrypt";

describe("HashSenhaScrypt", () => {
  it("gera hashes salgados e verifica somente a senha correspondente", async () => {
    const senha = "UmaSenhaSegura#2026";
    const primeiro = await HashSenhaScrypt.gerar(senha);
    const segundo = await HashSenhaScrypt.gerar(senha);

    expect(primeiro).not.toBe(segundo);
    await expect(HashSenhaScrypt.verificar(senha, primeiro)).resolves.toBe(true);
    await expect(HashSenhaScrypt.verificar("senha incorreta", primeiro)).resolves.toBe(false);
  });

  it("rejeita hashes malformados sem lançar exceção", async () => {
    await expect(HashSenhaScrypt.verificar("senha", "hash-invalido")).resolves.toBe(false);
  });
});
