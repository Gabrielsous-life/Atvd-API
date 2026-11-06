/* =========================================================
   MITO MILHÃO — script.js
   Jogo de perguntas sobre mitologia inspirado no Show do Milhão.

   APIs utilizadas:
   1. Open Trivia Database (OpenTDB) -> perguntas e alternativas
   2. MyMemory                       -> tradução inglês -> português
   ========================================================= */

// ---------------------------------------------------------
// CONFIGURAÇÕES
// ---------------------------------------------------------
const TOTAL_QUESTIONS = 16;       // perguntas até o milhão
const RESERVE_QUESTIONS = 4;      // perguntas extras usadas quando o jogador pula
const TIME_PER_QUESTION = 45;     // segundos por pergunta

// Categoria 20 = Mythology | type=multiple = 4 alternativas
// encode=url3986 = textos vêm codificados em URL (decodificamos com decodeURIComponent)
const OPENTDB_URL =
  `https://opentdb.com/api.php?amount=${TOTAL_QUESTIONS + RESERVE_QUESTIONS}` +
  `&category=20&type=multiple&encode=url3986`;

const MYMEMORY_URL = "https://api.mymemory.translated.net/get";

const PRIZES = [
  1000, 2000, 3000, 4000, 5000,
  10000, 20000, 30000, 40000, 50000,
  100000, 200000, 300000, 400000, 500000,
  1000000,
];

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };
const DIFFICULTY_LABEL = { easy: "Fácil", medium: "Média", hard: "Difícil" };
const LETTERS = ["A", "B", "C", "D"];

// Deuses que participam da ajuda "Conselho do Olimpo".
// "bonus" ajusta a chance de cada um acertar (Hermes é trapaceiro!)
const GODS = [
  { name: "Atena", title: "deusa da sabedoria", icon: "🦉", bonus: 0.08 },
  { name: "Apolo", title: "deus das profecias", icon: "☀️", bonus: 0 },
  { name: "Hermes", title: "o deus trapaceiro", icon: "🪽", bonus: -0.15 },
];

// ---------------------------------------------------------
// ESTADO DO JOGO
// ---------------------------------------------------------
const state = {
  lang: localStorage.getItem("mitomilhao-lang") || "en",
  questions: [],       // as 16 perguntas da partida
  reserve: [],         // perguntas extras para o pulo
  index: 0,            // pergunta atual (0 a 15)
  prize: 0,            // prêmio garantido até agora
  helps: { skip: 3, oracle: true, council: true, mortals: true },
  eliminated: new Set(),
  timeLeft: TIME_PER_QUESTION,
  timerId: null,
  locked: true,        // bloqueia cliques durante animações
};

// Guarda traduções já feitas para não repetir requisições
const translationCache = new Map();

// ---------------------------------------------------------
// FUNÇÕES AUXILIARES
// ---------------------------------------------------------
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const currentQuestion = () => state.questions[state.index];
const isLastQuestion = () => state.index === TOTAL_QUESTIONS - 1;

// Embaralha um array (algoritmo de Fisher-Yates) sem alterar o original
function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// Converte entidades HTML (ex.: &#39;) em caracteres normais
function decodeHtmlEntities(text) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = text;
  return textarea.value;
}

// Formata valores no estilo do programa: "R$ 5 mil", "R$ 1 MILHÃO"
function formatMoney(value) {
  if (value >= 1000000) return "R$ 1 MILHÃO";
  if (value >= 1000 && value % 1000 === 0) return `R$ ${value / 1000} mil`;
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0, 0);
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function createStars() {
  const sky = $("sky");
  for (let i = 0; i < 170; i++) {
    const star = document.createElement("span");
    const size = Math.random() * 2.2 + 0.6;
    star.className = "star";
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    star.style.width = `${size}px`;
    star.style.height = `${size}px`;
    star.style.animationDuration = `${2 + Math.random() * 4}s`;
    star.style.animationDelay = `${Math.random() * 4}s`;
    sky.appendChild(star);
  }
}

// =========================================================
// >>> CONSUMO DA API 1: OPEN TRIVIA DATABASE (OpenTDB) <<<
// Faz a requisição com fetch() + async/await e devolve as
// perguntas já organizadas no formato que o jogo usa.
// =========================================================
async function fetchQuestions(attempts = 3) {
  // 1) Envia a requisição GET para a API
  const response = await fetch(OPENTDB_URL);

  // 2) Verifica se o servidor respondeu com sucesso (status 200-299)
  if (!response.ok) {
    throw new Error(`O servidor respondeu com erro HTTP ${response.status}.`);
  }

  // 3) Converte o corpo da resposta de JSON para objeto JavaScript
  const data = await response.json();

  // 4) A OpenTDB devolve um "response_code":
  //    0 = sucesso | 1 = perguntas insuficientes | 5 = muitas requisições
  //    (limite de 1 requisição a cada 5 segundos por IP)
  if (data.response_code === 5 && attempts > 1) {
    $("loading-text").textContent = "O Oráculo pediu um instante... tentando de novo";
    await wait(5500);
    return fetchQuestions(attempts - 1);
  }

  if (data.response_code !== 0) {
    throw new Error(`A API não conseguiu enviar as perguntas (código ${data.response_code}).`);
  }

  // 5) Transforma cada resultado no formato usado pelo jogo
  return data.results.map(formatQuestion);
}

// Converte uma pergunta "crua" da OpenTDB para o formato do jogo.
// Exemplo do que chega da API (já decodificado):
// { difficulty: "easy", question: "...", correct_answer: "Zeus",
//   incorrect_answers: ["Ares", "Hades", "Apollo"] }
function formatQuestion(raw) {
  const correct = decodeURIComponent(raw.correct_answer);
  const incorrect = raw.incorrect_answers.map((answer) => decodeURIComponent(answer));

  // Junta a resposta certa com as erradas e embaralha
  const answers = shuffle([correct, ...incorrect]);

  return {
    difficulty: raw.difficulty,
    question: decodeURIComponent(raw.question),
    answers,
    correctIndex: answers.indexOf(correct), // posição da resposta certa
    ptPromise: null,                         // tradução (preenchida sob demanda)
  };
}
// ============ FIM DO CONSUMO DA API OpenTDB ============


// =========================================================
// >>> CONSUMO DA API 2: MYMEMORY (TRADUÇÃO EN -> PT-BR) <<<
// Usada apenas quando o jogador escolhe "Português".
// Se a tradução falhar, o texto original em inglês é mantido.
// =========================================================
async function translateText(text) {
  if (translationCache.has(text)) return translationCache.get(text);

  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // responseStatus 200 = tradução feita | quotaFinished = limite diário atingido
    if (Number(data.responseStatus) !== 200 || data.quotaFinished) {
      return text;
    }

    const translated = decodeHtmlEntities(data.responseData.translatedText);
    translationCache.set(text, translated);
    return translated;
  } catch (error) {
    console.warn("Falha na tradução, mantendo o original:", error);
    return text;
  }
}

// Traduz a pergunta e as 4 alternativas ao mesmo tempo (Promise.all).
// A promessa fica salva na pergunta para não traduzir duas vezes.
function translateQuestion(question) {
  if (!question.ptPromise) {
    const texts = [question.question, ...question.answers];
    question.ptPromise = Promise.all(texts.map(translateText)).then(
      ([translatedQuestion, ...translatedAnswers]) => ({
        question: translatedQuestion,
        answers: translatedAnswers,
      })
    );
  }
  return question.ptPromise;
}
// ============ FIM DO CONSUMO DA API MyMemory ============


// ---------------------------------------------------------
// INÍCIO DA PARTIDA
// ---------------------------------------------------------
async function startGame() {
  showScreen("screen-loading");
  $("loading-text").textContent = "Consultando o Oráculo...";

  try {
    const allQuestions = await fetchQuestions();

    // As 16 primeiras são ordenadas da mais fácil para a mais difícil;
    // as restantes ficam na reserva para a ajuda "Asas de Hermes".
    state.questions = allQuestions
      .slice(0, TOTAL_QUESTIONS)
      .sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
    state.reserve = allQuestions.slice(TOTAL_QUESTIONS);

    state.index = 0;
    state.prize = 0;
    state.helps = { skip: 3, oracle: true, council: true, mortals: true };

    if (state.lang === "pt") {
      $("loading-text").textContent = "Traduzindo as palavras dos deuses...";
      await translateQuestion(state.questions[0]);
    }

    buildLadder();
    showScreen("screen-game");
    showQuestion();
  } catch (error) {
    console.error(error);
    $("error-message").textContent =
      `${error.message} Verifique sua conexão com a internet e tente novamente.`;
    showScreen("screen-error");
  }
}

// ---------------------------------------------------------
// EXIBIÇÃO DA PERGUNTA
// ---------------------------------------------------------
function showQuestion() {
  const question = currentQuestion();
  state.locked = true;
  state.eliminated = new Set();

  $("question-number").textContent = `Pergunta ${state.index + 1} de ${TOTAL_QUESTIONS}`;
  const badge = $("question-difficulty");
  badge.textContent = DIFFICULTY_LABEL[question.difficulty];
  badge.className = `badge ${question.difficulty}`;

  // Cria os 4 botões de alternativa com os dados vindos da API
  const answersBox = $("answers");
  answersBox.innerHTML = "";
  question.answers.forEach((_, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer";
    button.innerHTML = `<span class="answer-letter">${LETTERS[i]}</span><span class="answer-text"></span>`;
    button.addEventListener("click", () => selectAnswer(i));
    answersBox.appendChild(button);
  });

  updateMoney();
  updateLadder();
  updateHelps();

  renderTexts().then(() => {
    if (question !== currentQuestion()) return;
    state.locked = false;
    updateHelps();
    startTimer(true);
    prefetchNextTranslation();
  });
}

// Escreve a pergunta e as alternativas no idioma escolhido
async function renderTexts() {
  const question = currentQuestion();
  let texts = { question: question.question, answers: question.answers };

  if (state.lang === "pt") {
    $("translating").classList.remove("hidden");
    texts = await translateQuestion(question);
    $("translating").classList.add("hidden");
    // Se o jogador trocou de pergunta ou de idioma enquanto esperava, não sobrescreve
    if (question !== currentQuestion() || state.lang !== "pt") return;
  } else {
    $("translating").classList.add("hidden");
  }

  $("question-text").textContent = texts.question;
  document.querySelectorAll(".answer-text").forEach((el, i) => {
    el.textContent = texts.answers[i];
  });
}

// Já traduz a próxima pergunta em segundo plano para o jogo não travar
function prefetchNextTranslation() {
  if (state.lang !== "pt") return;
  const next = state.questions[state.index + 1];
  if (next) translateQuestion(next);
}

function answerButtons() {
  return [...document.querySelectorAll(".answer")];
}

// ---------------------------------------------------------
// VALORES (errar / parar / acertar) E ESCADA DE PRÊMIOS
// ---------------------------------------------------------
function wrongPrize() {
  // Errar a pergunta do milhão = perde tudo; nas outras, leva metade
  return isLastQuestion() ? 0 : Math.floor(state.prize / 2);
}

function updateMoney() {
  $("money-wrong").textContent = formatMoney(wrongPrize());
  $("money-stop").textContent = formatMoney(state.prize);
  $("money-right").textContent = formatMoney(PRIZES[state.index]);
}

function buildLadder() {
  const list = $("ladder-list");
  list.innerHTML = "";
  // Do maior prêmio para o menor
  for (let i = PRIZES.length - 1; i >= 0; i--) {
    const item = document.createElement("li");
    item.dataset.level = i;
    if (i === PRIZES.length - 1) item.classList.add("top");
    item.innerHTML = `<span class="lvl">${i + 1}</span><span>${formatMoney(PRIZES[i])}</span>`;
    list.appendChild(item);
  }
}

function updateLadder() {
  document.querySelectorAll("#ladder-list li").forEach((item) => {
    const level = Number(item.dataset.level);
    item.classList.toggle("current", level === state.index);
    item.classList.toggle("done", level < state.index);
  });
  const current = document.querySelector("#ladder-list li.current");
  if (current) current.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
}

// ---------------------------------------------------------
// CRONÔMETRO
// ---------------------------------------------------------
const RING_LENGTH = 2 * Math.PI * 20; // circunferência do círculo do SVG

function startTimer(reset = false) {
  stopTimer();
  if (reset) state.timeLeft = TIME_PER_QUESTION;
  renderTimer();
  state.timerId = setInterval(() => {
    state.timeLeft--;
    renderTimer();
    if (state.timeLeft <= 0) {
      stopTimer();
      timeUp();
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(state.timerId);
  state.timerId = null;
}

function renderTimer() {
  $("timer-text").textContent = state.timeLeft;
  const offset = RING_LENGTH * (1 - state.timeLeft / TIME_PER_QUESTION);
  $("timer-ring").style.strokeDashoffset = offset;
  $("timer").classList.toggle("warning", state.timeLeft <= 10);
}

function timeUp() {
  if (state.locked) return;
  state.locked = true;
  updateHelps();
  revealAnswer(null);
}

// ---------------------------------------------------------
// VERIFICAÇÃO DA RESPOSTA
// ---------------------------------------------------------
function selectAnswer(index) {
  if (state.locked || state.eliminated.has(index)) return;
  state.locked = true;
  stopTimer();
  updateHelps();

  // Momento de suspense antes de revelar
  answerButtons()[index].classList.add("selected");
  setTimeout(() => revealAnswer(index), 1600);
}

function revealAnswer(index) {
  const question = currentQuestion();
  const buttons = answerButtons();
  buttons.forEach((b) => (b.disabled = true));
  buttons[question.correctIndex].classList.remove("selected");
  buttons[question.correctIndex].classList.add("correct");

  if (index === question.correctIndex) {
    // ACERTOU: ganha o prêmio desta pergunta
    state.prize = PRIZES[state.index];
    updateMoney();

    if (isLastQuestion()) {
      setTimeout(() => endGame("win"), 1800);
    } else {
      showToast(`Certa resposta! Você tem ${formatMoney(state.prize)}`);
      setTimeout(() => {
        state.index++;
        showQuestion();
      }, 1900);
    }
  } else {
    // ERROU (ou o tempo acabou)
    if (index !== null) {
      buttons[index].classList.remove("selected");
      buttons[index].classList.add("wrong");
    }
    setTimeout(() => endGame(index === null ? "timeout" : "wrong"), 2300);
  }
}

// ---------------------------------------------------------
// FIM DE JOGO
// ---------------------------------------------------------
async function endGame(reason) {
  stopTimer();

  let finalPrize = state.prize;
  if (reason === "win") finalPrize = PRIZES[PRIZES.length - 1];
  if (reason === "wrong" || reason === "timeout") finalPrize = wrongPrize();

  const screens = {
    win: {
      icon: "🏆",
      title: "Você é digno do Olimpo!",
      message: "Acertou todas as perguntas e conquistou o prêmio máximo. Zeus está impressionado!",
    },
    stop: {
      icon: "🏛️",
      title: "Uma decisão sábia",
      message: "Como Atena, você soube a hora certa de parar.",
    },
    wrong: {
      icon: "⚱️",
      title: "As Moiras cortaram seu fio",
      message: "Resposta errada! Mas nem os heróis gregos venciam sempre.",
    },
    timeout: {
      icon: "⏳",
      title: "O tempo de Cronos acabou",
      message: "Você não respondeu a tempo.",
    },
  };

  const info = screens[reason];
  $("end-icon").textContent = info.icon;
  $("end-title").textContent = info.title;
  $("end-message").textContent = info.message;
  $("end-prize").textContent = formatMoney(finalPrize);

  // Mostra a resposta certa quando o jogador erra ou o tempo acaba
  const answerBox = $("end-answer");
  if (reason === "wrong" || reason === "timeout") {
    const question = currentQuestion();
    const texts = state.lang === "pt" ? await translateQuestion(question) : question;
    answerBox.textContent = `A resposta certa era: ${LETTERS[question.correctIndex]}) ${texts.answers[question.correctIndex]}`;
    answerBox.classList.remove("hidden");
  } else {
    answerBox.classList.add("hidden");
  }

  // Recorde salvo no navegador (localStorage)
  const best = Number(localStorage.getItem("mitomilhao-best")) || 0;
  const isRecord = finalPrize > best;
  if (isRecord) localStorage.setItem("mitomilhao-best", finalPrize);
  $("end-record").classList.toggle("hidden", !isRecord);

  showScreen("screen-end");
}

// ---------------------------------------------------------
// AJUDAS
// ---------------------------------------------------------
function updateHelps() {
  // Regra clássica: na pergunta do milhão não há ajudas
  const blocked = state.locked || isLastQuestion();
  $("help-skip").disabled = blocked || state.helps.skip === 0 || state.reserve.length === 0;
  $("help-oracle").disabled = blocked || !state.helps.oracle;
  $("help-council").disabled = blocked || !state.helps.council;
  $("help-mortals").disabled = blocked || !state.helps.mortals;
  $("btn-stop").disabled = state.locked;

  const skips = state.helps.skip;
  $("skip-count").textContent = skips === 1 ? "1 pulo" : `${skips} pulos`;
}

// Alternativas que ainda não foram eliminadas
function availableAnswers() {
  return [0, 1, 2, 3].filter((i) => !state.eliminated.has(i));
}

// 🪽 Asas de Hermes — pula para outra pergunta da reserva
function useSkip() {
  if (state.locked || state.helps.skip === 0 || state.reserve.length === 0) return;
  stopTimer();

  // Escolhe na reserva a pergunta com dificuldade mais próxima da atual
  const target = DIFFICULTY_ORDER[currentQuestion().difficulty];
  let bestIndex = 0;
  state.reserve.forEach((q, i) => {
    const diff = Math.abs(DIFFICULTY_ORDER[q.difficulty] - target);
    const bestDiff = Math.abs(DIFFICULTY_ORDER[state.reserve[bestIndex].difficulty] - target);
    if (diff < bestDiff) bestIndex = i;
  });

  const [replacement] = state.reserve.splice(bestIndex, 1);
  state.questions[state.index] = replacement;
  state.helps.skip--;

  showToast("As asas de Hermes levaram você a outra pergunta!");
  showQuestion();
}

// 🔮 Oráculo de Delfos — elimina de 1 a 3 alternativas erradas
function useOracle() {
  if (state.locked || !state.helps.oracle) return;
  state.helps.oracle = false;
  stopTimer();

  const question = currentQuestion();
  const wrongOptions = availableAnswers().filter((i) => i !== question.correctIndex);
  const amount = 1 + Math.floor(Math.random() * 3);
  const toEliminate = shuffle(wrongOptions).slice(0, amount);

  const buttons = answerButtons();
  toEliminate.forEach((i) => {
    state.eliminated.add(i);
    buttons[i].classList.add("eliminated");
    buttons[i].disabled = true;
  });

  const count = toEliminate.length;
  updateHelps();
  openModal({
    title: "🔮 Oráculo de Delfos",
    body: `<p>A Pítia respirou os vapores sagrados e revelou sua profecia:</p>
           <p><strong>${count} alternativa${count > 1 ? "s erradas foram eliminadas" : " errada foi eliminada"}.</strong></p>`,
  });
}

// ⚡ Conselho do Olimpo — três deuses dão a opinião deles
function useCouncil() {
  if (state.locked || !state.helps.council) return;
  state.helps.council = false;
  stopTimer();

  const question = currentQuestion();
  const options = availableAnswers();
  const baseChance = { easy: 0.85, medium: 0.7, hard: 0.55 }[question.difficulty];

  const items = GODS.map((god) => {
    const wrongOptions = options.filter((i) => i !== question.correctIndex);
    const isRight = Math.random() < baseChance + god.bonus || wrongOptions.length === 0;
    const pick = isRight
      ? question.correctIndex
      : wrongOptions[Math.floor(Math.random() * wrongOptions.length)];

    return `<li>
              <span class="god-icon">${god.icon}</span>
              <span><strong>${god.name}</strong><br><small>${god.title}</small></span>
              <span class="god-pick">${LETTERS[pick]}</span>
            </li>`;
  });

  updateHelps();
  openModal({
    title: "⚡ Conselho do Olimpo",
    body: `<p>Os deuses se reuniram e cada um deu seu palpite:</p>
           <ul class="god-list">${items.join("")}</ul>`,
  });
}

// 🏺 Voz dos Mortais — votação da plateia
function useMortals() {
  if (state.locked || !state.helps.mortals) return;
  state.helps.mortals = false;
  stopTimer();

  const question = currentQuestion();
  const options = availableAnswers();
  const correctWeight = { easy: 60, medium: 42, hard: 30 }[question.difficulty];

  // Gera "pesos" aleatórios, com vantagem para a resposta certa
  const weights = [0, 1, 2, 3].map((i) => {
    if (!options.includes(i)) return 0;
    if (i === question.correctIndex) return correctWeight + Math.random() * 25;
    return Math.random() * 28;
  });

  // Converte em porcentagens que somam 100
  const total = weights.reduce((sum, w) => sum + w, 0);
  const percents = weights.map((w) => Math.floor((w / total) * 100));
  const rest = 100 - percents.reduce((sum, p) => sum + p, 0);
  percents[percents.indexOf(Math.max(...percents))] += rest;

  const bars = percents
    .map((p, i) => `<div class="vote">
                      <span class="vote-pct">${p}%</span>
                      <div class="vote-bar" style="height:${Math.max(p, 2)}%"></div>
                      <span class="vote-letter">${LETTERS[i]}</span>
                    </div>`)
    .join("");

  updateHelps();
  openModal({
    title: "🏺 Voz dos Mortais",
    body: `<p>A plateia de mortais da ágora votou:</p><div class="votes">${bars}</div>`,
  });
}

// 🛑 Parar — confirma antes de encerrar
function askStop() {
  if (state.locked) return;
  stopTimer();
  openModal({
    title: "🛑 Parar o jogo?",
    body: `<p>Se parar agora, você leva <strong>${formatMoney(state.prize)}</strong>.</p>`,
    actions: [
      { label: "Continuar jogando", onClick: () => startTimer() },
      { label: `Parar e levar ${formatMoney(state.prize)}`, primary: true, onClick: () => endGame("stop") },
    ],
  });
}

// ---------------------------------------------------------
// MODAL (janela usada pelas ajudas, regras e confirmação)
// ---------------------------------------------------------
function openModal({ title, body, actions }) {
  // Por padrão, o botão "Voltar ao jogo" retoma o cronômetro
  const buttons = actions || [{ label: "Voltar ao jogo", primary: true, onClick: () => startTimer() }];

  $("modal-title").textContent = title;
  $("modal-body").innerHTML = body;

  const box = $("modal-actions");
  box.innerHTML = "";
  buttons.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${action.primary ? "btn-primary" : "btn-ghost"}`;
    button.textContent = action.label;
    button.addEventListener("click", () => {
      $("modal").classList.add("hidden");
      if (action.onClick) action.onClick();
    });
    box.appendChild(button);
  });

  $("modal").classList.remove("hidden");
}

function showRules() {
  openModal({
    title: "📜 Como jogar",
    body: `<ul>
             <li>Responda <strong>16 perguntas</strong> de mitologia; a dificuldade aumenta a cada etapa.</li>
             <li>Você tem <strong>${TIME_PER_QUESTION} segundos</strong> por pergunta.</li>
             <li><strong>Acertar</strong>: sobe para o próximo prêmio.</li>
             <li><strong>Parar</strong>: leva o prêmio que já conquistou.</li>
             <li><strong>Errar</strong>: leva metade do prêmio atual. Errar a pergunta do milhão faz perder tudo.</li>
             <li>Ajudas: 🪽 pular (3x), 🔮 eliminar alternativas, ⚡ opinião dos deuses e 🏺 votação da plateia. Elas não valem na pergunta final.</li>
             <li>Atalho: use as teclas <strong>A, B, C, D</strong> para responder.</li>
           </ul>`,
    actions: [{ label: "Entendi", primary: true }],
  });
}

// ---------------------------------------------------------
// IDIOMA
// ---------------------------------------------------------
function setLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("mitomilhao-lang", lang);
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });

  // Se estiver no meio do jogo, atualiza os textos na hora
  if ($("screen-game").classList.contains("active") && currentQuestion()) {
    renderTexts();
    prefetchNextTranslation();
  }
}

function goHome() {
  stopTimer();
  $("best-score").textContent = formatMoney(Number(localStorage.getItem("mitomilhao-best")) || 0);
  showScreen("screen-start");
}

// ---------------------------------------------------------
// EVENTOS
// ---------------------------------------------------------
$("btn-start").addEventListener("click", startGame);
$("btn-retry").addEventListener("click", startGame);
$("btn-again").addEventListener("click", startGame);
$("btn-rules").addEventListener("click", showRules);
$("help-skip").addEventListener("click", useSkip);
$("help-oracle").addEventListener("click", useOracle);
$("help-council").addEventListener("click", useCouncil);
$("help-mortals").addEventListener("click", useMortals);
$("btn-stop").addEventListener("click", askStop);

document.querySelectorAll("[data-action='home']").forEach((b) => b.addEventListener("click", goHome));
document.querySelectorAll(".lang-btn").forEach((b) => {
  b.addEventListener("click", () => setLanguage(b.dataset.lang));
});

// Teclas A, B, C, D (ou 1 a 4) para responder
document.addEventListener("keydown", (event) => {
  if (!$("screen-game").classList.contains("active")) return;
  if (!$("modal").classList.contains("hidden")) return;
  const key = event.key.toUpperCase();
  const index = LETTERS.indexOf(key) !== -1 ? LETTERS.indexOf(key) : ["1", "2", "3", "4"].indexOf(key);
  if (index !== -1) selectAnswer(index);
});

// ---------------------------------------------------------
// INICIALIZAÇÃO
// ---------------------------------------------------------
createStars();
setLanguage(state.lang);
goHome();
