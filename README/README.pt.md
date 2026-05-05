<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://gist.githubusercontent.com/Cynacedia/30c5da7160619ca08933e7e3e92afcc3/raw/downloads-badge.svg" alt="Downloads" />
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
  <a href="README.ru.md">Русский</a> |
  <a href="README.nl.md">Nederlands</a>
</p>

Uma ferramenta tudo-em-um para criação de eventos no VRChat que elimina a configuração repetitiva.
Crie e salve modelos de eventos por grupo, gere datas futuras a partir de padrões recorrentes simples e preencha os detalhes instantaneamente. Perfeita para agendar rapidamente encontros semanais, sessões de watch party e eventos da comunidade.

<p align="center">
  <img src=".imgs/1MP-CE_CreationFlow-01-05-26.gif" width="900" alt="Fluxo de criação de eventos (modelo para publicação)" />
</p>

## Modelos e séries nativas, lado a lado

O VRChat agora tem o seu próprio recurso de eventos recorrentes. É ótimo para eventos estáveis que se repetem: depois de criada, a série é mantida pelo próprio VRChat sem que o aplicativo precise estar aberto, e o ciclo inteiro é anunciado uma única vez no momento da criação. Editar uma série em andamento dentro do VRChat normalmente exige apagá-la e recriá-la; este aplicativo cuida desse passo por você quando muda a programação, então o processo se parece com uma edição comum. O detalhe é que não há anúncios por ocorrência: ajustes posteriores em eventos individuais podem passar despercebidos pela sua comunidade.

Os modelos funcionam de outra forma. O fluxo principal é manual: você cria um evento por vez, com o modelo preenchendo o formulário para que não seja preciso digitar os detalhes de novo. A partir daí, uma automação opcional pode continuar publicando os próximos eventos no horário, cada um com seu próprio anúncio para que sua comunidade saiba quando algo novo está chegando. Edições feitas em um evento pendente são divulgadas no momento em que a publicação sai, então mudanças de última hora não passam batido. O detalhe: a publicação automática exige que o aplicativo esteja em execução.

Os dois convivem na mesma aba **Gerenciar agendamentos**. Você pode usar um, o outro ou os dois no mesmo grupo, conforme o que faz mais sentido para o evento.

## Recursos
- Modelos que preenchem automaticamente os detalhes do evento por grupo (com automação opcional para publicar conforme um cronograma).
- Gerador de padrões recorrentes com lista de próximas datas e opção manual de data/hora.
- Suporte a séries nativas do VRChat, em paralelo aos modelos.
- Automação de eventos: publica eventos a partir dos padrões dos modelos enquanto o aplicativo estiver aberto.
- Tela de modificar eventos para próximos eventos (grade + modal de edição, com filtros e intervalo de tempo ajustável).
- Assistente de criação de eventos para calendários de grupo.
- Theme Studio com presets e controle completo das cores da interface (suporta #RRGGBBAA).
- Localização com escolha de idioma na primeira execução (en, fr, es, de, ja, zh, pt, ko, ru, nl).
- Seletor e upload de imagens da galeria para os IDs de imagem.
- Inicialização junto com o sistema + minimização para a bandeja.
- Proteção de instância única para evitar inicializações duplicadas.

### Integrações opcionais (Opções avançadas)

Estão desativadas por padrão e cada uma exige a sua própria configuração. Depois de configurada, cada uma pode ser ligada ou desligada por modelo e por evento:

- **Discord:** cria automaticamente eventos agendados do Discord junto com os eventos do VRChat. Requer criar um bot do Discord e convidá-lo para o seu servidor. ([Guia de configuração](Discord%20Setup/DISCORD_SETUP.pt.md))
- **Calendário:** gera arquivos `.ics` com lembretes, entregues via webhook do Discord ou salvos localmente. ([Guia de configuração](Calendar%20Setup/CALENDAR_SETUP.pt.md))
- **EC Kit** (licença paga): personalização da identidade do webhook por grupo (nome de exibição, avatar, cor do embed) e mensagens personalizadas com imagens anexadas por evento. ([Ko-fi](https://ko-fi.com/s/0735ce5375) · [Licença](https://eckit-worker.cynacedia.workers.dev/license/v1.0))

## Download
- Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases

## Privacidade e armazenamento de dados
Sua senha não é armazenada. Apenas tokens de sessão são armazenados em cache.
O aplicativo armazena seus arquivos no diretório de dados de usuário do Electron (mostrado em Configurações > Informações do aplicativo):

- `profiles.json` (modelos de eventos e configuração de integrações por grupo)
- `series.json` (séries nativas do VRChat acompanhadas localmente)
- `cache.json` (tokens de sessão)
- `settings.json` (configurações do aplicativo)
- `themes.json` (presets de tema e cores personalizadas)
- `pending-events.json` (fila de automação)
- `automation-state.json` (rastreamento de automação)
- `pending-rasterize.json` (criações de série em fila aguardando após um limite de taxa)

Você pode substituir o diretório de dados com a variável de ambiente `VRC_EVENT_DATA_DIR`.
Na primeira execução, o aplicativo tentará importar um `profiles.json` existente da pasta do projeto.

Os tokens de bot (para a integração com o Discord) e as URLs de webhook são criptografados em repouso usando o armazenamento seguro do seu sistema operacional. Eles nunca são enviados a outro lugar além da API do Discord ou da sua URL de webhook.

__**Não compartilhe os arquivos de cache nem as pastas de dados do aplicativo.**__

## Notas de uso
- Modelos exigem um nome de agendamento, nome do evento e uma descrição antes de continuar.
- Grupos privados só podem usar o tipo de acesso = Grupo.
- A duração utiliza DD:HH:MM e é limitada a 31 dias.
- Tags são limitadas a 5 e idiomas a 3.
- Uploads para a galeria são limitados a PNG/JPG, 64-2048 px, menos de 10 MB e 64 imagens por conta.
- O VRChat limita a criação de eventos a 10 por hora por pessoa por grupo.
- Os modelos precisam que o aplicativo esteja aberto para publicar automaticamente. As séries, uma vez criadas, funcionam por conta própria.
- Featured Event e outros toggles especiais exigem permissões específicas de grupo; só aparecem quando permitidos.

## Solução de problemas
- **Problemas de login:** exclua `cache.json` e faça login novamente (use a pasta de dados mostrada em Configurações > Informações do aplicativo).
- **Grupos faltando no menu:** sua conta precisa ter acesso ao calendário no grupo desejado. Se você acabou de ajustar permissões no lado do VRChat, clique em **Resync** para atualizar a lista.
- **Limite de taxa:** o VRChat pode limitar a criação de eventos. Espere e tente de novo; pare se várias tentativas falharem. Não fique apertando os botões de atualizar ou de criar evento repetidamente.
- **Criação de série pausada:** se o VRChat bloquear a criação de uma série por causa do limite de taxa, ela é tentada novamente automaticamente. A aba de Agendamentos mostra quando será a próxima tentativa, com um botão "Tentar agora" caso prefira não esperar.
- **Atualizações:** alguns recursos ficam bloqueados quando há uma atualização pendente. Baixe e execute a versão mais recente.

## Aviso
- Este projeto não é afiliado nem aprovado pelo VRChat. Use por sua conta e risco.
- Os idiomas são traduzidos por máquina e podem ser imprecisos; por favor, contribua com correções.

## Requisitos (compilar a partir do código-fonte)
- Node.js 20+ (22.21.1 recomendado)
- npm
- Uma conta do VRChat com permissão para criar eventos em pelo menos um grupo

---

## Agradecimentos
- [🌸potato🌸](https://x.com/potatovrc), traduções para o japonês
- Garvas, traduções para o francês
- Sometsuki, traduções para o português
- Todos os [contribuidores no GitHub](https://github.com/Cynacedia/VRC-Event-Creator/graphs/contributors)
