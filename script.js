const appConfig = window.APP_CONFIG || {};

const scenes = {
  intro: document.querySelector('[data-scene="intro"]'),
  form: document.querySelector('[data-scene="form"]'),
  success: document.querySelector('[data-scene="success"]')
};

const elements = {
  yesButton: document.getElementById("yesButton"),
  noButton: document.getElementById("noButton"),
  introActions: document.getElementById("introActions"),
  runawayNote: document.getElementById("runawayNote"),
  form: document.getElementById("dateForm"),
  questions: Array.from(document.querySelectorAll(".question")),
  backButton: document.getElementById("backButton"),
  nextButton: document.getElementById("nextButton"),
  submitButton: document.getElementById("submitButton"),
  stepBadge: document.getElementById("stepBadge"),
  progressBar: document.getElementById("progressBar"),
  statusBadge: document.getElementById("statusBadge"),
  toast: document.getElementById("toast"),
  dateInput: document.getElementById("dateInput"),
  timeInput: document.getElementById("timeInput"),
  successMessage: document.getElementById("successMessage"),
  restartButton: document.getElementById("restartButton"),
  compileButton: document.getElementById("compileButton"),
  compileBar: document.getElementById("compileBar"),
  compileLog: document.getElementById("compileLog"),
  captchaToggle: document.getElementById("captchaToggle"),
  captchaText: document.getElementById("captchaText"),
  openMapButton: document.getElementById("openMapButton"),
  mapModal: document.getElementById("mapModal"),
  mapBackdrop: document.getElementById("mapBackdrop"),
  closeMapButton: document.getElementById("closeMapButton"),
  mapSearchInput: document.getElementById("mapSearchInput"),
  searchMapButton: document.getElementById("searchMapButton"),
  mapResult: document.getElementById("mapResult"),
  mapSummary: document.getElementById("mapSummary"),
  confirmMapButton: document.getElementById("confirmMapButton")
};

let currentQuestion = 0;
let toastTimer = null;
let compileTimer = null;
let captchaApproved = false;
let captchaBusy = false;
let mapInstance = null;
let mapMarker = null;
let selectedMapPoint = null;

setMinimumDate();
setDefaultTime();
setStatusBadge();
updateQuestionUI();
resetNoButtonPosition();

elements.yesButton.addEventListener("click", () => {
  switchScene("form");
  showToast("Кнопка «Да» сработала. Сессия планирования открыта.");
});

["mouseenter", "focus", "touchstart", "click"].forEach((eventName) => {
  elements.noButton.addEventListener(eventName, runawayNoButton, { passive: false });
});

elements.backButton.addEventListener("click", () => {
  if (currentQuestion === 0) {
    switchScene("intro");
    resetNoButtonPosition();
    return;
  }

  currentQuestion -= 1;
  updateQuestionUI();
});

elements.nextButton.addEventListener("click", () => {
  if (!validateCurrentQuestion()) {
    return;
  }

  currentQuestion += 1;
  updateQuestionUI();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateCurrentQuestion()) {
    return;
  }

  const payload = collectFormData();
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "Отправляем...";

  try {
    const result = await sendToTelegram(payload);
    elements.successMessage.textContent = result;
    switchScene("success");
  } catch (error) {
    showToast(error.message);
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "Отправить анкету";
  }
});

elements.restartButton.addEventListener("click", () => {
  elements.form.reset();
  setMinimumDate();
  setDefaultTime();
  setStatusBadge();
  currentQuestion = 0;
  captchaApproved = false;
  captchaBusy = false;
  selectedMapPoint = null;
  elements.captchaToggle.setAttribute("aria-pressed", "false");
  elements.captchaToggle.classList.remove("captcha-box--active", "captcha-box--loading");
  elements.captchaText.textContent = "Я готова пойти на свидание и провести его как минимум хорошо";
  elements.submitButton.disabled = false;
  elements.submitButton.textContent = "Отправить анкету";
  elements.compileBar.style.width = "0%";
  elements.compileLog.textContent = "Сборка плана ожидает запуска. Ошибок пока нет, но есть интрига.";
  elements.mapResult.textContent = "Точка ещё не выбрана.";
  elements.mapSummary.textContent = "Можно выбрать точное место на карте и отправить координаты вместе с анкетой.";
  elements.mapSearchInput.value = "";
  updateQuestionUI();
  resetNoButtonPosition();
  switchScene("intro");
});

elements.compileButton.addEventListener("click", runDateCompiler);
elements.captchaToggle.addEventListener("click", toggleCaptcha);
elements.openMapButton.addEventListener("click", openMapModal);
elements.mapBackdrop.addEventListener("click", closeMapModal);
elements.closeMapButton.addEventListener("click", closeMapModal);
elements.searchMapButton.addEventListener("click", searchMapLocation);
elements.confirmMapButton.addEventListener("click", confirmMapSelection);
elements.mapSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    searchMapLocation();
  }
});

function runawayNoButton(event) {
  event.preventDefault();

  const container = elements.introActions.getBoundingClientRect();
  const button = elements.noButton.getBoundingClientRect();
  const maxX = Math.max(container.width - button.width, 0);
  const maxY = Math.max(container.height - button.height, 0);

  const nextX = Math.random() * maxX;
  const nextY = Math.random() * maxY;
  elements.noButton.style.left = `${nextX}px`;
  elements.noButton.style.top = `${nextY}px`;
  elements.noButton.style.right = "auto";

  const jokes = [
    "Кнопка «Нет» ушла на рефакторинг.",
    "Отказ не прошёл code review.",
    "404: отрицательный ответ не найден.",
    "Эта кнопка предпочла graceful shutdown."
  ];

  elements.runawayNote.textContent = jokes[Math.floor(Math.random() * jokes.length)];
}

function validateCurrentQuestion() {
  const question = elements.questions[currentQuestion];
  const requiredFields = Array.from(question.querySelectorAll("[required]"));

  if (currentQuestion === elements.questions.length - 1 && !captchaApproved) {
    showToast("Сначала пройди проверку намерений. Без неё отправка закрыта.");
    elements.captchaToggle.focus();
    return false;
  }

  for (const field of requiredFields) {
    if (field.type === "radio") {
      const groupChecked = question.querySelector(`input[name="${field.name}"]:checked`);
      if (!groupChecked) {
        showToast("Нужно выбрать вариант ответа, иначе анкета обижается.");
        return false;
      }
      continue;
    }

    if (!field.value) {
      showToast("Заполни поле перед переходом дальше.");
      field.focus();
      return false;
    }
  }

  return true;
}

function updateQuestionUI() {
  elements.questions.forEach((question, index) => {
    question.classList.toggle("question--active", index === currentQuestion);
  });

  const totalSteps = elements.questions.length;
  const currentStep = currentQuestion + 1;

  elements.stepBadge.textContent = `Шаг ${currentStep} из ${totalSteps}`;
  elements.progressBar.style.width = `${(currentStep / totalSteps) * 100}%`;

  const isLastStep = currentQuestion === totalSteps - 1;
  elements.backButton.textContent = currentQuestion === 0 ? "К вопросу про свидание" : "Назад";
  elements.nextButton.classList.toggle("hidden", isLastStep);
  elements.submitButton.classList.toggle("hidden", !isLastStep);
}

function switchScene(targetScene) {
  Object.values(scenes).forEach((scene) => {
    scene.classList.remove("scene--active");
  });

  scenes[targetScene].classList.add("scene--active");
}

function collectFormData() {
  const formData = new FormData(elements.form);
  const mustHave = formData.getAll("mustHave");

  return {
    dateStyle: formData.get("dateStyle"),
    date: formData.get("date"),
    time: formData.get("time"),
    place: formData.get("place"),
    mustHave: mustHave.length ? mustHave.join(", ") : "Ничего не выбрано, человек доверяет судьбе",
    vibe: formData.get("vibe"),
    comment: formData.get("comment") || "Без комментария",
    mapPoint: selectedMapPoint
  };
}

async function sendToTelegram(payload) {
  if (!appConfig.telegramBotToken || !appConfig.telegramChatId) {
    throw new Error("Telegram не настроен: добавь токен и chat id в config.js или через GitHub Secrets.");
  }

  const text = [
    "💕 Новая анкета на свидание",
    "",
    `Формат свидания: ${payload.dateStyle}`,
    `Дата: ${payload.date}`,
    `Время: ${payload.time}`,
    `Место: ${payload.place}`,
    payload.mapPoint
      ? `Координаты: ${payload.mapPoint.lat.toFixed(6)}, ${payload.mapPoint.lng.toFixed(6)}`
      : "Координаты: не выбраны",
    payload.mapPoint?.label
      ? `Точка на карте: ${payload.mapPoint.label}`
      : "Точка на карте: не указана",
    `Нужно взять: ${payload.mustHave}`,
    `Вайб: ${payload.vibe}`,
    `Комментарий: ${payload.comment}`
  ].join("\n");

  const response = await fetch(
    `https://api.telegram.org/bot${appConfig.telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: appConfig.telegramChatId,
        text
      })
    }
  );

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error("Telegram ответил ошибкой. Проверь токен, chat id и права бота.");
  }

  return "Твои пожелания уже получены. Подготовка к свиданию пошла без права на откат.";
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("toast--visible");

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("toast--visible");
  }, 2800);
}

function setMinimumDate() {
  const today = new Date();
  const isoDate = today.toISOString().split("T")[0];
  elements.dateInput.min = isoDate;

  if (!elements.dateInput.value) {
    elements.dateInput.value = isoDate;
  }
}

function setDefaultTime() {
  if (!elements.timeInput.value) {
    elements.timeInput.value = "19:00";
  }
}

function setStatusBadge() {
  const statuses = [
    "Date runtime: stable build",
    "commit: feelings pushed",
    "No critical bugs in schedule"
  ];

  elements.statusBadge.textContent = statuses[Math.floor(Math.random() * statuses.length)];
}

function runDateCompiler() {
  window.clearInterval(compileTimer);

  const phases = [
    { value: 18, text: "Проверка адекватности расписания..." },
    { value: 42, text: "Компиляция плана без скучных мест..." },
    { value: 71, text: "Линковка нормального вайба..." },
    { value: 100, text: "Сборка завершена. План свидания готов." }
  ];

  let phaseIndex = 0;
  elements.compileBar.style.width = "8%";
  elements.compileLog.textContent = "Запуск пайплайна подготовки...";

  compileTimer = window.setInterval(() => {
    const phase = phases[phaseIndex];
    elements.compileBar.style.width = `${phase.value}%`;
    elements.compileLog.textContent = phase.text;
    phaseIndex += 1;

    if (phaseIndex >= phases.length) {
      window.clearInterval(compileTimer);
      runMicroShake();
      setStatusBadge();
      showToast("Date compiler завершил сборку без единого warning.");
    }
  }, 480);
}

function toggleCaptcha() {
  if (captchaBusy) {
    return;
  }

  if (captchaApproved) {
    captchaApproved = false;
    elements.captchaToggle.setAttribute("aria-pressed", "false");
    elements.captchaToggle.classList.remove("captcha-box--active");
    elements.captchaText.textContent = "Я готова пойти на свидание и провести его как минимум хорошо";
    return;
  }

  captchaBusy = true;
  elements.captchaToggle.classList.add("captcha-box--loading");
  elements.captchaText.textContent = "Проверяем, что это уверенное «да», а не случайный клик...";

  window.setTimeout(() => {
    captchaBusy = false;
    captchaApproved = true;
    elements.captchaToggle.setAttribute("aria-pressed", "true");
    elements.captchaToggle.classList.remove("captcha-box--loading");
    elements.captchaToggle.classList.add("captcha-box--active");
    elements.captchaText.textContent = "Проверка пройдена: настрой хороший, намерения серьёзные";
    runMicroShake();
    showToast("Проверка пройдена. Скучный сценарий отклонён.");
  }, 1400);
}

function runMicroShake() {
  elements.form.classList.remove("scene--micro-shake");
  void elements.form.offsetWidth;
  elements.form.classList.add("scene--micro-shake");

  window.setTimeout(() => {
    elements.form.classList.remove("scene--micro-shake");
  }, 450);
}

function resetNoButtonPosition() {
  elements.noButton.style.left = "";
  elements.noButton.style.top = "";
  elements.noButton.style.right = "";
}

function openMapModal() {
  elements.mapModal.classList.remove("hidden");
  elements.mapModal.setAttribute("aria-hidden", "false");

  window.setTimeout(() => {
    ensureMap();
    if (mapInstance) {
      mapInstance.invalidateSize();
    }
  }, 20);
}

function closeMapModal() {
  elements.mapModal.classList.add("hidden");
  elements.mapModal.setAttribute("aria-hidden", "true");
}

function ensureMap() {
  if (mapInstance || typeof L === "undefined") {
    return;
  }

  mapInstance = L.map("mapCanvas").setView([55.751244, 37.618423], 11);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(mapInstance);

  mapInstance.on("click", async (event) => {
    setMapPoint(event.latlng.lat, event.latlng.lng);
    await hydrateMapLabel(event.latlng.lat, event.latlng.lng);
  });
}

function setMapPoint(lat, lng) {
  const currentLabel = selectedMapPoint?.label || "";
  selectedMapPoint = { lat, lng, label: currentLabel };

  if (!mapMarker) {
    mapMarker = L.marker([lat, lng]).addTo(mapInstance);
  } else {
    mapMarker.setLatLng([lat, lng]);
  }

  elements.mapResult.textContent = `Выбрана точка: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

async function hydrateMapLabel(lat, lng) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    );
    const data = await response.json();
    selectedMapPoint = {
      lat,
      lng,
      label: data.display_name || ""
    };
    elements.mapResult.textContent = selectedMapPoint.label
      ? `Выбрана точка: ${selectedMapPoint.label}`
      : `Выбрана точка: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  } catch {
    elements.mapResult.textContent = `Выбрана точка: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

async function searchMapLocation() {
  const query = elements.mapSearchInput.value.trim();
  if (!query) {
    showToast("Введи адрес или название места для поиска.");
    return;
  }

  ensureMap();
  elements.mapResult.textContent = "Ищем место...";

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`
    );
    const results = await response.json();
    if (!results.length) {
      elements.mapResult.textContent = "Ничего не найдено. Попробуй другой запрос.";
      return;
    }

    const match = results[0];
    const lat = Number(match.lat);
    const lng = Number(match.lon);
    mapInstance.setView([lat, lng], 15);
    setMapPoint(lat, lng);
    selectedMapPoint.label = match.display_name || query;
    elements.mapResult.textContent = `Найдено: ${selectedMapPoint.label}`;
  } catch {
    elements.mapResult.textContent = "Поиск не сработал. Можно просто ткнуть точку на карте.";
  }
}

function confirmMapSelection() {
  if (!selectedMapPoint) {
    showToast("Сначала выбери точку на карте.");
    return;
  }

  elements.mapSummary.textContent = selectedMapPoint.label
    ? `Выбрано место: ${selectedMapPoint.label}`
    : `Выбраны координаты: ${selectedMapPoint.lat.toFixed(6)}, ${selectedMapPoint.lng.toFixed(6)}`;

  closeMapModal();
  showToast("Точка на карте сохранена.");
}
