export class ErroConflitoVersao extends Error {
  constructor() {
    super("Conflito de versao: o registro foi alterado por outra operacao; atualize os dados e tente novamente.");
    this.name = "ErroConflitoVersao";
  }
}

export class ErroPapelUsuarioNaoPermitido extends Error {
  constructor() {
    super("Somente ADMINISTRADOR pode cadastrar usuarios.");
    this.name = "ErroPapelUsuarioNaoPermitido";
  }
}

export function validarVersaoEsperada(versaoEsperada: number): void {
  if (!Number.isInteger(versaoEsperada) || versaoEsperada < 1) {
    throw new Error("versaoEsperada deve ser um numero inteiro positivo.");
  }
}
