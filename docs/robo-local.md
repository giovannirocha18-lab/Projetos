# Robôs na máquina local do Giovanni

Decisão do Giovanni (26/11/2026): os robôs que rodavam no GitHub Actions passam a rodar no computador dele, que fica
ligado o dia inteiro. O GitHub segue só guardando o código (o push continua publicando o site pelo Cloudflare).

**O que roda na máquina local** (`robo/local.mjs`, os mesmos scripts de `robo/` que o GitHub rodava):

| Comando | O que faz | Duração |
|---|---|---|
| `node robo/local.mjs` | Rodada da noite: preços da Awin + alertas, lista da Shopee, IA das categorias, auditoria e IA conferindo as buscas | ~1 h a 1h30 |
| `node robo/local.mjs fotos` | IA conferindo as fotos (teto US$ 0,50, 30 min) | até 30 min |
| `node robo/local.mjs so awin` | Só um passo (ou vários: `so awin alertas`) | varia |
| `node robo/local.mjs conferir` | Só confere se as chaves estão preenchidas e respondem | segundos |

**O que NÃO muda:** o robô da noite do Cloudflare (Mercado Livre, buscas prontas, categorias da manhã) continua lá,
chamado pelo Worker relógio. Nada disso depende da máquina local.

O resumo de cada rodada aparece no painel, aba Robô, como antes. Os logs ficam em `.cache/robo-local/<dia>-<modo>/`.

## Roteiro para a conversa local do Claude

Regras que valem sempre:
- **Nunca** pedir, ler em voz alta, imprimir ou mandar ao chat o conteúdo do arquivo `.chaves-robo`. Quem preenche é o
  Giovanni, num editor de texto. O repositório é público: esse arquivo está no `.gitignore` e não pode ser commitado.
- A branch `claude/inspiring-hamilton-wafagr` é a produção: push = publica. Sempre `git pull` antes de mexer.

Passos:
1. Conferir o Node: `node --version` tem de ser 22 ou mais novo (senão instalar de https://nodejs.org, versão LTS).
2. Copiar `robo/chaves-exemplo.txt` para `.chaves-robo` na raiz do projeto e abrir no Bloco de Notas para o Giovanni
   preencher (ver "Onde pegar cada chave" abaixo).
3. `node robo/local.mjs conferir` até tudo aparecer com ✓.
4. Primeiro teste, o mais leve: `node robo/local.mjs so numeros caminhos`. Depois `node robo/local.mjs so awin alertas`
   (uns 10 minutos; a 1ª vez testa as fotos de todas as lojas e pode levar mais) e olhar o painel, aba Robô.
5. Agendar no Windows (Agendador de Tarefas), no horário do Giovanni:
   - **00:15 todo dia**: rodada da noite (termina antes das buscas prontas do Cloudflare, como no GitHub);
   - **05:55 todo dia**: fotos.

   Exemplo (trocar `C:\caminho\Projetos` pela pasta de verdade; rodar num Prompt de Comando):
   ```
   schtasks /Create /TN "VPC robo da noite" /SC DAILY /ST 00:15 /TR "cmd /c cd /d C:\caminho\Projetos && node robo\local.mjs >> .cache\robo-noite.txt 2>&1"
   schtasks /Create /TN "VPC fotos" /SC DAILY /ST 05:55 /TR "cmd /c cd /d C:\caminho\Projetos && node robo\local.mjs fotos >> .cache\robo-fotos.txt 2>&1"
   ```
   Nas propriedades da tarefa: marcar "Executar a tarefa o mais cedo possível após uma inicialização agendada ser
   perdida" e desmarcar "Iniciar a tarefa somente se o computador estiver ligado na rede elétrica". O computador não
   pode estar suspenso (dormindo) nesses horários: em Energia, "Suspender: Nunca".
6. No dia seguinte: conferir a aba Robô do painel e o arquivo `.cache\robo-noite.txt`.

O programa faz `git pull` sozinho no começo de cada rodada (roda sempre o código da produção) e não deixa duas
rodadas iguais rodarem ao mesmo tempo.

## Onde pegar cada chave

O Giovanni já cadastrou todas no GitHub (Settings → Secrets and variables → Actions), mas lá **não dá para ler** o
valor de volta. Então:

- `CLOUDFLARE_ACCOUNT_ID` e `D1_DATABASE_ID`: não são senhas, aparecem no painel do Cloudflare (o ID da conta na página
  inicial da conta; o do banco em Storage & Databases → D1 → o banco do site).
- `CLOUDFLARE_API_TOKEN`: criar um novo no Cloudflare (My Profile → API Tokens → Create Token → Custom token, com a
  permissão **Account → D1 → Edit**, só na conta do site). O antigo continua valendo no GitHub.
- `CHAVE_ROBO`: tem de ser a mesma do Cloudflare Pages. Se o Giovanni não tem o valor guardado, é preciso criar uma
  nova (texto comprido e aleatório, 40+ caracteres) e trocar **nos dois lugares ao mesmo tempo**: Secret `CHAVE_ROBO`
  do projeto no Cloudflare Pages (e publicar de novo, senão o site segue com a antiga) e o arquivo `.chaves-robo`.
  O Worker `relogio-vaiprocarrinho` não usa essa chave (não precisa mexer nele).
- `AWIN_FEED_KEY_PJ`: na Awin (conta PJ), em Ferramentas → Create-a-Feed: é a "apikey" que aparece no link do feed.
- `SHOPEE_FEED_OFICIAL`: o link do feed "Shopee Oficial BR" da área de afiliados da Shopee (Feed de produto).
- `ANTHROPIC_API_KEY`: em console.anthropic.com → API keys, criar uma chave nova só para a máquina local.

Os nomes dos menus podem ter mudado: se não achar, o Giovanni manda um print da tela (sem a chave à mostra).

## Se o GitHub destravar

Não ligar os dois ao mesmo tempo: a rodada da noite do GitHub é disparada pela tarefa agendada do Claude ("Robô da
madrugada"). Com a máquina local rodando, essa tarefa passa a só conferir o resultado. Decidir com o Giovanni qual
fica; para voltar ao GitHub basta apagar as duas tarefas do Agendador (`schtasks /Delete /TN "VPC robo da noite"`).

## Situação em 26/11/2026

Os testes de 26/11 (conferência, `so numeros caminhos`, `so awin alertas`) foram feitos numa **máquina de teste**, não
na que fica ligada sempre. Nada foi agendado nela (e não deve ser). Falta, na máquina que fica ligada:

1. Instalar Node 22+ e Git.
2. `git clone` do projeto na branch `claude/inspiring-hamilton-wafagr` (repositório público, não pede login). Não
   copiar a pasta com arquivos alterados à mão: o robô faz `git pull --ff-only` antes de cada rodada e arquivo
   alterado localmente trava a atualização.
3. Levar o `.chaves-robo` da máquina de teste por pendrive ou rede local (não vai pelo git) e apagar o de lá depois.
   Vale levar também a pasta `.cache` (guarda o teste das fotos; sem ela a 1ª noite testa as ~79 mil de novo).
4. `node robo/local.mjs conferir`, depois `node robo/local.mjs so numeros caminhos`.
5. Agendar 00:15 e 05:55 (acima) e deixar o Windows sem suspender.
6. Avisar a conversa "Robô da madrugada" do Claude: só então ela para de disparar o GitHub e desliga a "Fotos da manhã".

A máquina local só LÊ o repositório: quem escreve a memória (`CLAUDE.md`) e este arquivo é a conversa do Claude na nuvem.
