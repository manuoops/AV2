import { PapelUsuario, Prisma } from "@prisma/client";
import { RepositorioUsuarioPrisma } from "../infra/repositories/RepositorioUsuarioPrisma";
import { HashSenhaScrypt } from "../security/HashSenhaScrypt";
import { ErroConflitoVersao, ErroPapelUsuarioNaoPermitido, validarVersaoEsperada } from "./ErrosServico";

const TAMANHO_MINIMO_SENHA = 12;
const TAMANHO_MINIMO_USUARIO = 3;
const TAMANHO_MAXIMO_USUARIO = 50;

export type UsuarioPublico = Pick<
  Prisma.UsuarioGetPayload<Record<string, never>>,
  "id" | "usuario" | "papel" | "ativo" | "ultimoAcesso" | "criadoEm" | "versao"
>;

function semHashSenha(usuario: Awaited<ReturnType<RepositorioUsuarioPrisma["buscarPorId"]>>): UsuarioPublico | null {
  if (!usuario) return null;
  const { hashSenha: _hashSenha, ...dadosPublicos } = usuario;
  return dadosPublicos;
}

export class ServicoAutenticacaoPrisma {
  constructor(private readonly repositorio: RepositorioUsuarioPrisma = new RepositorioUsuarioPrisma()) {}

  public async autenticar(usuario: string, senha: string): Promise<UsuarioPublico | null> {
    if (!usuario.trim() || !senha) return null;

    const encontrado = await this.repositorio.buscarPorNome(usuario.trim());
    if (!encontrado || !encontrado.ativo) return null;
    if (!(await HashSenhaScrypt.verificar(senha, encontrado.hashSenha))) return null;

    const ultimoAcesso = new Date();
    const acessoRegistrado = await this.repositorio.registrarAcesso(encontrado.id, encontrado.versao, ultimoAcesso);
    if (!acessoRegistrado) return null;
    return semHashSenha({ ...encontrado, ultimoAcesso });
  }

  public async cadastrarUsuario(
    usuario: string,
    senha: string,
    papel: PapelUsuario,
    criadoPorId?: string
  ): Promise<UsuarioPublico> {
    const nomeNormalizado = usuario.trim();
    this.validarNomeUsuario(nomeNormalizado);
    this.validarSenha(senha);

    if (criadoPorId) {
      const criador = await this.repositorio.buscarPorId(criadoPorId);
      if (!criador?.ativo) throw new Error("O usuario responsavel pelo cadastro nao esta ativo.");
      if (criador.papel !== PapelUsuario.ADMINISTRADOR) {
        throw new ErroPapelUsuarioNaoPermitido();
      }
    }

    try {
      const criado = await this.repositorio.criar({
        usuario: nomeNormalizado,
        hashSenha: await HashSenhaScrypt.gerar(senha),
        papel,
        ...(criadoPorId ? { criadoPor: { connect: { id: criadoPorId } } } : {})
      });
      return semHashSenha(criado)!;
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
        throw new Error("Já existe um usuário com esse nome.");
      }
      throw erro;
    }
  }

  public async listarUsuarios(criadoPorId?: string): Promise<UsuarioPublico[]> {
    const usuarios = await this.repositorio.listar(criadoPorId);
    return usuarios.map((usuario) => semHashSenha(usuario)!);
  }

  public async desativarUsuario(id: string, versaoEsperada: number): Promise<UsuarioPublico> {
    validarVersaoEsperada(versaoEsperada);
    const usuario = await this.repositorio.buscarPorId(id);
    if (!usuario) throw new Error("Usuário não encontrado.");
    if (usuario.versao !== versaoEsperada) throw new ErroConflitoVersao();
    if (!usuario.ativo) return semHashSenha(usuario)!;

    const resultado = await this.repositorio.atualizarSeVersao(id, versaoEsperada, {
      ativo: false,
      versao: { increment: 1 }
    });
    if (resultado.count === 0) throw new ErroConflitoVersao();
    return semHashSenha(await this.repositorio.buscarPorId(id))!;
  }

  public async alterarSenha(id: string, versaoEsperada: number, senhaAtual: string, senhaNova: string): Promise<boolean> {
    validarVersaoEsperada(versaoEsperada);
    const usuario = await this.repositorio.buscarPorId(id);
    if (!usuario || !usuario.ativo || !(await HashSenhaScrypt.verificar(senhaAtual, usuario.hashSenha))) {
      return false;
    }

    if (usuario.versao !== versaoEsperada) throw new ErroConflitoVersao();
    this.validarSenha(senhaNova);
    const resultado = await this.repositorio.atualizarSeVersao(id, versaoEsperada, {
      hashSenha: await HashSenhaScrypt.gerar(senhaNova),
      versao: { increment: 1 }
    });
    if (resultado.count === 0) throw new ErroConflitoVersao();
    return true;
  }

  private validarNomeUsuario(usuario: string): void {
    if (usuario.length < TAMANHO_MINIMO_USUARIO || usuario.length > TAMANHO_MAXIMO_USUARIO) {
      throw new Error(`O nome de usuário deve ter entre ${TAMANHO_MINIMO_USUARIO} e ${TAMANHO_MAXIMO_USUARIO} caracteres.`);
    }
  }

  private validarSenha(senha: string): void {
    if (Buffer.byteLength(senha, "utf8") < TAMANHO_MINIMO_SENHA) {
      throw new Error(`A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} bytes.`);
    }
  }
}
