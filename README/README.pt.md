<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://img.shields.io/github/downloads/Cynacedia/VRC-Event-Creator/total?style=plastic&labelColor=555&color=blue" alt="Downloads" />
  </a>
</p>
<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.zh.md">中文（简体）</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.ru.md">Русский</a>
</p>
Uma ferramenta tudo-em-um para criação de eventos no VRChat que elimina a configuração repetitiva.
Crie e salve modelos de eventos por grupo, gere datas futuras a partir de padrões recorrentes simples e preencha os detalhes instantaneamente - perfeita para agendar rapidamente encontros semanais, sessões de watch party e eventos da comunidade.

## Capturas de tela
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="Perfis: modelos" />
      <br />
      Perfis: modelos
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="Perfis: regras de agenda" />
      <br />
      Perfis: regras de agenda
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="Criar: selecionar perfil" />
      <br />
      Criar: selecionar perfil
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="Criar: escolher uma data" />
      <br />
      Criar: escolher uma data
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="Criar: revisar e enviar" />
      <br />
      Criar: revisar e enviar
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="Estúdio de temas: interface personalizada" />
      <br />
      Estúdio de temas: interface personalizada
    </td>
  </tr>
</table>

## Download
- Releases do GitHub: https://github.com/Cynacedia/VRC-Event-Creator/releases
- O `.exe` portátil do Windows roda de forma independente (não é necessário Node.js para executá-lo).
- Os dados do app são armazenados no diretório padrão de dados do Electron (mostrado em Configurações > Informações do aplicativo), a menos que você o substitua com `VRC_EVENT_DATA_DIR`.

## Recursos
- Perfis/modelos que preenchem automaticamente os detalhes do evento por grupo.
- Gerador de padrões recorrentes com lista de próximas datas e opção manual de data/hora.
- Assistente de criação de eventos para calendários de grupo.
- Tela de modificar eventos para próximos eventos (grade + modal de edição).
- Estúdio de temas com presets e controle total de cores da UI (suporta #RRGGBBAA).
- Seletor e upload de imagens da galeria para IDs de imagem.
- Localização com seleção de idioma no primeiro início (en, fr, es, de, ja, zh, pt, ko, ru).

## Armazenamento de dados
O app armazena seus arquivos no diretório de dados do Electron (mostrado na seção Configurações > Informações do aplicativo):

- `profiles.json` (modelos de perfil)
- `cache.json` (tokens de sessão)
- `settings.json` (e-mail de contato)
- `themes.json` (predefinições de tema e cores personalizadas)

Você pode substituir o diretório de dados com a variável de ambiente `VRC_EVENT_DATA_DIR`.
Na primeira execução, o app tentará importar um `profiles.json` existente da pasta do projeto.

Não compartilhe arquivos de cache; eles contêm tokens de sessão.

## Notas de uso
- Os perfis exigem Nome do Perfil, Nome do Evento e Descrição antes de continuar.
- É necessário um e-mail de contato na primeira execução para uso da API do VRChat.
- Grupos privados só podem usar Tipo de acesso = Grupo.
- A duração usa DD:HH:MM e é limitada a 31 dias.
- As tags são limitadas a 5 e os idiomas a 3.
- Uploads da galeria: PNG/JPG, 64-2048 px, menos de 10 MB e 64 imagens por conta.
- O VRChat atualmente permite no máximo 10 eventos futuros por vez.

## Atualizações
- Verifica na inicialização e uma vez por hora durante o uso.
- UPDATE leva ao repositório do GitHub quando há uma nova versão.
- Criação e edição de eventos ficam bloqueadas quando UPDATE aparece.
- Sem atualizador automático; atualizações manuais.

## Solução de problemas
- Problemas de login: exclua `cache.json` e faça login novamente (use a pasta de dados mostrada em Sobre).
- Grupos ausentes: sua conta precisa de acesso ao calendário no grupo alvo.
- Limite de taxa: o VRChat pode limitar a criação de eventos. Aguarde e tente novamente, e pare se várias tentativas falharem. Não fique spamando os botões de atualizar ou criar eventos.

## Privacidade e segurança
- Sua senha não é armazenada. Apenas tokens de sessão ficam em cache.
- Não compartilhe `cache.json` nem as pastas de dados do aplicativo.

## Traduções
*As traduções são geradas por máquina e podem estar imprecisas. Contribua com correções, por favor.
- English: ../README.md
- Français: README.fr.md
- Español: README.es.md
- Deutsch: README.de.md
- 日本語: README.ja.md
- 中文（简体）: README.zh.md
- Português: README.pt.md
- 한국어: README.ko.md
- Русский: README.ru.md

## Como funciona
- O app usa Electron:
  - `electron/main.js` lida com chamadas à API do VRChat, persistência de perfis e cache de sessão.
  - `electron/preload.js` expõe métodos IPC para o renderer.
  - `electron/renderer/` renderiza a UI e gerencia o fluxo do assistente.
  - `electron/core/date-utils.js` gera próximas datas a partir de padrões.

## Aviso
Este projeto não é afiliado nem endossado pela VRChat. Use por sua conta e risco.

## Requisitos (compilar a partir do código-fonte)
- Node.js 20+ (22.21.1 recomendado)
- npm
- Uma conta VRChat com permissão para criar eventos para pelo menos um grupo

## Configuração (a partir do código-fonte)
1) Instale as dependências:

```bash
npm install
```

2) Forneça um e-mail de contato para o uso da API do VRChat:
- Digite quando solicitado na primeira execução ou atualize na tela Sobre.

## Executar (a partir do código-fonte)
```bash
npm run start:gui
```

## Compilação
- Build portátil do Windows:

```bash
npm run dist:gui
```

- Builds multiplataforma (requer ferramentas macOS/Linux para DMG/AppImage):

```bash
npm run dist:gui:all
```
