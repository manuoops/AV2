import dotenv from "dotenv";

dotenv.config({ quiet: true });

function exigirVariavel(nome: string): string {
  const valor = process.env[nome]?.trim();
  if (!valor) {
    throw new Error(`A variavel de ambiente ${nome} e obrigatoria.`);
  }
  return valor;
}

function lerPorta(): number {
  const valor = process.env.PORT?.trim() || "3000";
  const porta = Number(valor);

  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error("A variavel PORT deve ser um numero inteiro entre 1 e 65535.");
  }

  return porta;
}

function lerDatabaseUrl(): string {
  const valor = exigirVariavel("DATABASE_URL");
  let url: URL;

  try {
    url = new URL(valor);
  } catch {
    throw new Error("A variavel DATABASE_URL nao contem uma URL valida.");
  }

  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) {
    throw new Error("DATABASE_URL deve apontar para um banco PostgreSQL.");
  }

  return valor;
}

function lerSegredoJwt(): string {
  const segredo = exigirVariavel("JWT_SECRET");

  if (Buffer.byteLength(segredo, "utf8") < 32 || /change_me|replace_with/i.test(segredo)) {
    throw new Error("JWT_SECRET deve ter pelo menos 32 bytes aleatorios e nao pode ser um placeholder.");
  }

  return segredo;
}

export const ambiente = Object.freeze({
  porta: lerPorta(),
  databaseUrl: lerDatabaseUrl(),
  jwtSecret: lerSegredoJwt()
});
