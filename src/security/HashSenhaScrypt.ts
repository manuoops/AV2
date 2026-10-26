import { randomBytes, scrypt, timingSafeEqual } from "crypto";

const TAMANHO_SALT = 16;
const TAMANHO_HASH = 64;
const CUSTO = 32768;
const BLOCO = 8;
const PARALELISMO = 1;
const MEMORIA_MAXIMA = 64 * 1024 * 1024;

function derivarHash(senha: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      senha,
      salt,
      TAMANHO_HASH,
      { N: CUSTO, r: BLOCO, p: PARALELISMO, maxmem: MEMORIA_MAXIMA },
      (erro, chave) => erro ? reject(erro) : resolve(chave)
    );
  });
}

export class HashSenhaScrypt {
  public static async gerar(senha: string): Promise<string> {
    const salt = randomBytes(TAMANHO_SALT);
    const hash = await derivarHash(senha, salt);
    return `scrypt$${CUSTO}$${BLOCO}$${PARALELISMO}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
  }

  public static async verificar(senha: string, hashArmazenado: string): Promise<boolean> {
    if (!senha || typeof hashArmazenado !== "string") {
      return false;
    }

    const partes = hashArmazenado.split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") {
      return false;
    }

    const [, custo, bloco, paralelismo, saltCodificado, hashCodificado] = partes;
    if (
      Number(custo) !== CUSTO ||
      Number(bloco) !== BLOCO ||
      Number(paralelismo) !== PARALELISMO ||
      !saltCodificado ||
      !hashCodificado
    ) {
      return false;
    }

    const salt = Buffer.from(saltCodificado, "base64url");
    const hashEsperado = Buffer.from(hashCodificado, "base64url");
    if (salt.length !== TAMANHO_SALT || hashEsperado.length !== TAMANHO_HASH) {
      return false;
    }

    const hashCalculado = await derivarHash(senha, salt);
    return timingSafeEqual(hashEsperado, hashCalculado);
  }
}
