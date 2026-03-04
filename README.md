# 🚀 Auto Login & MFA para Projetos

Uma Extensão do Chrome, desenvolvida para simplificar e automatizar o processo de autenticação. Ela gerencia a geração de tokens OAuth2, injeção de cabeçalhos de requisição e extração automatizada de códigos MFA (Multi-Factor Authentication) diretamente do Gmail.

## ✨ Funcionalidades

- **Suporte Multi-Projeto**: Pré-configurado para `Agent`, `Fin`, `MAR`, `Connect` e `Docs`.
- **Injeção Dinâmica de Cabeçalhos**: Injeta automaticamente os headers `auth-token` e `x-api-key` nas requisições com base no projeto selecionado.
- **MFA Automatizado**: 
    - Escaneia seu Gmail silenciosamente em busca do código de verificação mais recente.
    - Valida e-mails recebidos nos últimos 2 minutos.
    - Cola automaticamente o código no campo de MFA.
    - Pula o MFA inteligentemente para projetos específicos (ex: `Docs`).
- **Gerenciamento de Perfis**: Salve e gerencie múltiplos perfis de login com URLs e credenciais específicas.
- **Retentativas Inteligentes**: Tempo de busca aprimorado e gerenciamento confiável de abas para o fluxo de MFA. Limite de 2 tentativas para evitar loops infinitos.
- **Interface Premium**: Design moderno e responsivo com suporte a Modo Escuro e múltiplos temas de cores.

## 🛠️ Instalação

1. Clone ou baixe este repositório.
2. Abra o Chrome e navegue até `chrome://extensions/`.
3. Ative o **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta da extensão.

## ⚙️ Configuração

As configurações da extensão são armazenadas em `config.js`. Você pode personalizar:
- `CLIENT_ID` & `CLIENT_SECRET` para OAuth2.
- `API_KEYS` para cada projeto.
- `TOKEN_ENDPOINT` e outras constantes relacionadas à API.

> [!IMPORTANT]
> Certifique-se de que o seu `config.js` esteja preenchido corretamente com credenciais válidas antes de usar. Veja `config.js.example` como referência.

## 📖 Como Usar

1. Clique no ícone da extensão na barra de ferramentas.
2. Clique em **Adicionar um perfil** para criar sua primeira configuração.
3. Preencha o tipo de projeto, URLs e seu e-mail/login.
4. Clique no ícone do **Foguete (🚀)** ao lado do seu perfil para iniciar o fluxo automatizado.

## 🎨 Personalização de Tema

- **Idioma**: Alterne entre Inglês (EN) e Português (PT).
- **Modo Escuro**: Alterne entre temas claro e escuro usando o ícone de lua/sol.
- **Cores de Destaque**: Escolha entre várias cores (Rosa, Roxo, Azul, Verde) usando o ícone de paleta.

---
*Desenvolvido por Natty com objetivo de aumentar a produtividade.*
