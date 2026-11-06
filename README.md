# 🏛️ Mito Milhão — O Show dos Deuses

**Mito Milhão** é um jogo de perguntas e respostas sobre **mitologia**, inspirado no programa *Show do Milhão*. O jogador responde 16 perguntas, cada vez mais difíceis, sobre mitologia grega, nórdica, egípcia e outras, até chegar a **R$ 1 milhão**. As perguntas vêm de uma API externa, então cada partida é diferente.

🔗 **Jogo publicado:** https://SEU-USUARIO.github.io/mito-milhao/ *(trocar pelo link real depois de publicar)*

---

## 🎨 Tema e identidade visual

- **Tema:** Mitologia
- **Nome:** Mito Milhão
- **Identidade visual:** mármore (como templos e estátuas gregas), azul escuro e roxo galáxia (o céu noturno do Olimpo).
  - Fundo de galáxia roxa com estrelas que piscam, geradas pelo JavaScript.
  - Pergunta e alternativas em "placas de mármore", feitas só com gradientes CSS.
  - Fonte **Cinzel**, inspirada em inscrições romanas, nos títulos e **Inter** nos textos.
- **Ajudas com tema mitológico:**
  | Ajuda | Equivalente no Show do Milhão | O que faz |
  |---|---|---|
  | 🪽 Asas de Hermes | Pular | Troca a pergunta (3 vezes) |
  | 🔮 Oráculo de Delfos | Cartas | Elimina de 1 a 3 alternativas erradas |
  | ⚡ Conselho do Olimpo | Universitários | Atena, Apolo e Hermes dão palpites |
  | 🏺 Voz dos Mortais | Placas | A plateia vota (gráfico de barras) |

## 🛠️ Tecnologias utilizadas

- **HTML5**: estrutura das telas (`index.html`)
- **CSS3**: visual, animações e layout responsivo (`style.css`)
- **JavaScript**: lógica do jogo e consumo das APIs com `fetch`, `async` e `await` (`script.js`)
- **Open Trivia Database API**: perguntas e alternativas
- **MyMemory API**: tradução das perguntas para português
- **localStorage**: guarda o recorde e o idioma escolhido
- **GitHub Pages**: publicação

---

## 🎮 Como o jogo funciona

1. Na tela inicial, o jogador escolhe o idioma das perguntas (**English** ou **Português**) e clica em **Começar**.
2. O JavaScript busca 20 perguntas de mitologia na API: 16 para a partida e 4 de reserva para os pulos.
3. As perguntas são ordenadas da mais **fácil** para a mais **difícil**.
4. A cada pergunta, o jogador vê três valores:
   - **Errar**: leva metade do prêmio atual (na pergunta do milhão, perde tudo);
   - **Parar**: leva o prêmio que já conquistou;
   - **Acertar**: sobe para o próximo prêmio.
5. Cada pergunta tem **45 segundos**. Se o tempo acabar, conta como erro.
6. Ao clicar numa alternativa, ela fica roxa (suspense) e depois aparece **verde** (certa) ou **vermelha** (errada).
7. O jogo termina quando o jogador erra, para, deixa o tempo acabar ou ganha o milhão. A tela final mostra o prêmio, a resposta certa (se errou) e se foi um novo recorde.
8. O idioma pode ser trocado **a qualquer momento** pelo botão EN/PT no topo do jogo.

Prêmios: R$ 1 mil → 2 → 3 → 4 → 5 mil → 10 → 20 → 30 → 40 → 50 mil → 100 → 200 → 300 → 400 → 500 mil → **R$ 1 MILHÃO**.

---

## 🌐 APIs utilizadas e como os dados são usados

### 1. Open Trivia Database (OpenTDB): perguntas

**Finalidade:** fornecer as perguntas, a resposta correta e as respostas erradas.

URL usada:
```
https://opentdb.com/api.php?amount=20&category=20&type=multiple&encode=url3986
```
| Parâmetro | Significado |
|---|---|
| `amount=20` | 20 perguntas (16 + 4 de reserva) |
| `category=20` | Categoria **Mythology** |
| `type=multiple` | Múltipla escolha (4 alternativas) |
| `encode=url3986` | Textos codificados em URL, para não virem com `&quot;` e outros códigos HTML |

**Como a API é consultada** (função `fetchQuestions()` no `script.js`):
```js
async function fetchQuestions(attempts = 3) {
  const response = await fetch(OPENTDB_URL);   // 1. faz a requisição
  if (!response.ok) throw new Error(...);      // 2. verifica erro HTTP
  const data = await response.json();          // 3. converte o JSON
  if (data.response_code === 5) { ... }        // 4. limite de requisições -> espera e tenta de novo
  return data.results.map(formatQuestion);     // 5. organiza os dados para o jogo
}
```

**Exemplo do que a API devolve** (já decodificado):
```json
{
  "response_code": 0,
  "results": [{
    "difficulty": "easy",
    "category": "Mythology",
    "question": "Who was the Roman god of war?",
    "correct_answer": "Mars",
    "incorrect_answers": ["Jupiter", "Neptune", "Apollo"]
  }]
}
```

**Como o JavaScript usa esses dados** (função `formatQuestion()`):
- `decodeURIComponent()` decodifica os textos;
- `correct_answer` e `incorrect_answers` são juntados num só array e **embaralhados**, para a certa não ficar sempre na mesma letra;
- a posição da resposta certa fica guardada em `correctIndex`, usado para conferir a resposta e para as ajudas;
- `difficulty` serve para ordenar as perguntas, mostrar o selo Fácil/Média/Difícil e calibrar as ajudas: em perguntas difíceis os deuses e a plateia erram mais.

### 2. MyMemory: tradução

**Finalidade:** a OpenTDB só tem perguntas em inglês. Quando o jogador escolhe **Português**, a pergunta e as 4 alternativas são traduzidas.

```
https://api.mymemory.translated.net/get?q=TEXTO&langpair=en|pt-BR
```

**Como funciona** (funções `translateText()` e `translateQuestion()`):
- Cada texto é enviado com `fetch` + `await`, e a tradução vem em `data.responseData.translatedText`;
- a pergunta e as alternativas são traduzidas **ao mesmo tempo** com `Promise.all`;
- as traduções ficam guardadas num `Map` (cache), para não pedir o mesmo texto duas vezes;
- a **próxima pergunta já é traduzida em segundo plano**, para o jogo não ficar esperando;
- se a tradução falhar ou o limite diário acabar, o jogo continua com o texto em inglês.

> No `script.js`, os trechos que consomem as APIs estão marcados com comentários `>>> CONSUMO DA API ... <<<`.

---

## 📋 Etapas de desenvolvimento

1. **Planejamento**: escolha do tema (Mitologia), do nome (Mito Milhão) e das cores (mármore, azul escuro e roxo galáxia). Planejamento das telas: início, carregando, erro, jogo e fim.
2. **Estrutura (HTML)**: criação das telas como `<section>`s, mostradas uma de cada vez.
3. **Visual (CSS)**: textura de mármore com gradientes, fundo de galáxia, animações (suspense, acerto, erro, cronômetro) e layout responsivo para celular.
4. **Consumo da API**: requisição à OpenTDB com `fetch`/`async`/`await`, tratamento de erros e do limite de requisições.
5. **Lógica do jogo**: verificação de resposta, prêmios, cronômetro, ajudas, parar, tela final e recorde.
6. **Tradução**: integração com a API MyMemory e botão para alternar o idioma.
7. **Testes**: partidas completas, testes de erro, tempo esgotado, cada ajuda, troca de idioma e telas de celular.
8. **Publicação**: envio para o GitHub e publicação no GitHub Pages.

---

## 🤖 Uso de Inteligência Artificial

**Ferramenta utilizada:** Claude Code (Claude, da Anthropic)

**Principais prompts:**
1. *"dentro dessa pasta tem uma atvd, vc vai fazer pra mim, mas antes de criar vai me perguntar o tema e tals"*: a IA leu o enunciado e perguntou tema, nome, visual e idioma antes de começar.
2. *"1 - Mito Milhão 2 - Mármore, Azul escuro, Roxo Galaxia 3 - deixe opção em inglês e um opção pra traduzir usando uma api"*: com essas escolhas, a IA criou o HTML, o CSS, o JavaScript e este README.

**Como a IA contribuiu:**
- Conferiu se a OpenTDB tinha perguntas suficientes de mitologia (71 perguntas) e sugeriu o parâmetro `encode=url3986` para evitar problemas com caracteres especiais;
- sugeriu a API MyMemory para a tradução, que é gratuita e não precisa de cadastro;
- gerou a estrutura do jogo e as ajudas com tema mitológico;
- explicou e comentou o código, principalmente os trechos de consumo das APIs.

**O que eu aprendi / compreendi do código:**
- Como `fetch()` faz requisições e por que se usa `await` para esperar a resposta;
- como ler o JSON da API e transformar os dados no formato que o jogo precisa;
- como tratar erros (`try/catch`, `response.ok`, `response_code`);
- como `Promise.all` executa várias requisições ao mesmo tempo;
- como usar `setInterval` no cronômetro e `localStorage` no recorde.

---

## ▶️ Como executar

**Pelo link publicado:** acesse o link do GitHub Pages no topo deste README.

**Localmente:**
1. Baixe ou clone o repositório:
   ```bash
   git clone https://github.com/SEU-USUARIO/mito-milhao.git
   ```
2. Abra o arquivo `index.html` no navegador, ou use a extensão **Live Server** do VS Code.
3. É preciso estar conectado à internet, porque as perguntas vêm da API.

**Controles:** clique nas alternativas ou use as teclas **A, B, C, D**.

---

## 📁 Estrutura

```
mito-milhao/
├── index.html   # estrutura das telas
├── style.css    # identidade visual
├── script.js    # lógica do jogo + consumo das APIs
└── README.md    # documentação
```

## 📚 Créditos

- Perguntas: [Open Trivia Database](https://opentdb.com/) (licença CC BY-SA 4.0)
- Tradução: [MyMemory](https://mymemory.translated.net/)
- Fontes: [Google Fonts](https://fonts.google.com/) (Cinzel e Inter)
