import { Validador } from "./Validador";

const PESOS_PRIMEIRO_DIGITO = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const PESOS_SEGUNDO_DIGITO = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

export class ValidadorCNPJ extends Validador<string> {
  public validar(cnpj: string): boolean {
    const cnpjLimpo = (cnpj ?? "").replace(/\D/g, "");

    if (cnpjLimpo.length !== 14) {
      this.mensagemErro = "CNPJ deve conter 14 dígitos.";
      return false;
    }

    if (/^(\d)\1{13}$/.test(cnpjLimpo)) {
      this.mensagemErro = "CNPJ inválido.";
      return false;
    }

    const digitos = cnpjLimpo.split("").map(Number);
    const base12 = digitos.slice(0, 12);

    const primeiroDigito = this.calcularDigitoVerificador(base12, PESOS_PRIMEIRO_DIGITO);
    const base13 = [...base12, primeiroDigito];
    const segundoDigito = this.calcularDigitoVerificador(base13, PESOS_SEGUNDO_DIGITO);

    if (primeiroDigito !== digitos[12] || segundoDigito !== digitos[13]) {
      this.mensagemErro = "CNPJ inválido: dígitos verificadores não conferem.";
      return false;
    }

    this.mensagemErro = "";
    return true;
  }

  private calcularDigitoVerificador(base: number[], pesos: number[]): number {
    let soma = 0;
    for (let indice = 0; indice < base.length; indice++) {
      const digito = base[indice] as number;
      const peso = pesos[indice] as number;
      soma += digito * peso;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }
}