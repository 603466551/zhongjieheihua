const STORAGE_KEY = "negotiation-assistant-v2";

const DEFAULT_SCENARIO_PROMPT = [
  "你是二手房约谈陪谈助手，场景在西安高新区二手房约谈中心。",
  "参与方：中介、卖方、买方（用户）。",
  "目标：识别中介潜台词、避免被情绪和时间施压，帮助买方在预算边界内理性沟通。",
  "用户风格：程序员，重逻辑、重证据，不擅长话术但表达清晰。",
  "输出要简短、口语化、可直接照着说，避免官腔。",
  "如果对方缺少可核验证据，优先建议‘先核验再谈价’。",
].join("\n");

const DEFAULT_SETTINGS = {
  speechEngine: "auto",
  speechLanguage: "zh-CN",
  enableModelAnalysis: false,
  apiBase: "https://api.openai.com/v1",
  apiKey: "",
  speechModel: "gpt-4o-mini-transcribe",
  analysisModel: "gpt-4.1-mini",
  scenarioPrompt: DEFAULT_SCENARIO_PROMPT,
};

const RULES = [
  {
    key: "scarcity",
    name: "制造竞争感",
    intent: "让你担心错过房子，逼你更快出价",
    risk: 2,
    keywords: [
      "同楼也有人要",
      "另外一个客户",
      "还有买家",
      "同价也要买",
      "房子很抢手",
      "再不定就没了",
      "今天有人下定",
      "马上被抢",
    ],
  },
  {
    key: "time_pressure",
    name: "时间施压",
    intent: "压缩你思考时间，让你在信息不足时成交",
    risk: 2,
    keywords: ["今天必须定", "今晚前定", "马上签", "现在就定", "过时不候", "再拖就没"],
  },
  {
    key: "price_anchor",
    name: "成交锚定",
    intent: "用不透明成交价抬高你的心理价位",
    risk: 1,
    keywords: ["最近成交", "同小区成交", "市场价", "都卖这个价", "业主底价", "普遍在"],
  },
  {
    key: "emotion_pressure",
    name: "情绪施压",
    intent: "贬低你当前报价，促使你主动抬价",
    risk: 2,
    keywords: ["你这价格不可能", "太低了", "没诚意", "白谈了", "浪费时间", "不现实"],
  },
  {
    key: "concession_trap",
    name: "让步诱导",
    intent: "先让你加价，再说‘我帮你争取’",
    risk: 1,
    keywords: ["我帮你争取", "你再加点", "各退一步", "给我个空间", "我好交代", "再抬一点"],
  },
];

const EVIDENCE_WORDS = [
  "网签",
  "备案",
  "合同",
  "签约",
  "成交截图",
  "单据",
  "带看记录",
  "房本",
  "流水",
];

const state = {
  startPrice: null,
  maxPrice: null,
  currentOffer: null,
  pendingSuggestedOffer: null,
  transcripts: [],
  latestBrokerText: "",
  listening: false,
  speechModeInUse: null,
  browserSpeechSupported: false,
  recognition: null,
  mediaStream: null,
  mediaRecorder: null,
  transcribeQueue: Promise.resolve(),
  analysisTicket: 0,
  settings: { ...DEFAULT_SETTINGS },
};

const el = {
  showAssistantBtn: document.getElementById("showAssistantBtn"),
  showSettingsBtn: document.getElementById("showSettingsBtn"),
  assistantView: document.getElementById("assistantView"),
  settingsView: document.getElementById("settingsView"),
  startPrice: document.getElementById("startPrice"),
  maxPrice: document.getElementById("maxPrice"),
  saveBoundaryBtn: document.getElementById("saveBoundaryBtn"),
  boundaryStatus: document.getElementById("boundaryStatus"),
  currentOffer: document.getElementById("currentOffer"),
  speakerSelect: document.getElementById("speakerSelect"),
  startListenBtn: document.getElementById("startListenBtn"),
  stopListenBtn: document.getElementById("stopListenBtn"),
  micStatus: document.getElementById("micStatus"),
  engineStatus: document.getElementById("engineStatus"),
  interimText: document.getElementById("interimText"),
  manualText: document.getElementById("manualText"),
  sendManualBtn: document.getElementById("sendManualBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  latestBrokerText: document.getElementById("latestBrokerText"),
  plainTalkList: document.getElementById("plainTalkList"),
  hiddenIntentText: document.getElementById("hiddenIntentText"),
  verifyList: document.getElementById("verifyList"),
  riskLevel: document.getElementById("riskLevel"),
  responseList: document.getElementById("responseList"),
  nextOfferText: document.getElementById("nextOfferText"),
  reasonText: document.getElementById("reasonText"),
  analysisSourceText: document.getElementById("analysisSourceText"),
  applyOfferBtn: document.getElementById("applyOfferBtn"),
  transcriptList: document.getElementById("transcriptList"),
  speechEngine: document.getElementById("speechEngine"),
  speechLanguage: document.getElementById("speechLanguage"),
  enableModelAnalysis: document.getElementById("enableModelAnalysis"),
  apiBase: document.getElementById("apiBase"),
  apiKey: document.getElementById("apiKey"),
  speechModel: document.getElementById("speechModel"),
  analysisModel: document.getElementById("analysisModel"),
  scenarioPrompt: document.getElementById("scenarioPrompt"),
  saveModelConfigBtn: document.getElementById("saveModelConfigBtn"),
  resetPromptBtn: document.getElementById("resetPromptBtn"),
  modelConfigStatus: document.getElementById("modelConfigStatus"),
};

init();

function init() {
  bindEvents();
  loadState();
  setupSpeechRecognition();
  renderFromState();
}

function bindEvents() {
  el.showAssistantBtn.addEventListener("click", () => switchView("assistant"));
  el.showSettingsBtn.addEventListener("click", () => switchView("settings"));
  el.saveBoundaryBtn.addEventListener("click", saveBoundary);
  el.sendManualBtn.addEventListener("click", submitManualLine);
  el.clearHistoryBtn.addEventListener("click", clearHistory);
  el.startListenBtn.addEventListener("click", startListening);
  el.stopListenBtn.addEventListener("click", stopListening);
  el.applyOfferBtn.addEventListener("click", applySuggestedOffer);
  el.saveModelConfigBtn.addEventListener("click", saveModelSettings);
  el.resetPromptBtn.addEventListener("click", resetScenarioPrompt);
}

function renderFromState() {
  el.startPrice.value = Number.isFinite(state.startPrice) ? state.startPrice : "";
  el.maxPrice.value = Number.isFinite(state.maxPrice) ? state.maxPrice : "";
  updateCurrentOfferUI();
  setBoundaryStatus(Number.isFinite(state.startPrice) ? "已加载历史边界" : "未设置", false);
  renderSettingsForm();
  renderEmptyAnalysis();
  refreshEngineStatus();
  refreshListenButtons();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (Number.isFinite(parsed.startPrice)) {
      state.startPrice = round1(parsed.startPrice);
    }
    if (Number.isFinite(parsed.maxPrice)) {
      state.maxPrice = round1(parsed.maxPrice);
    }
    if (Number.isFinite(parsed.currentOffer)) {
      state.currentOffer = round1(parsed.currentOffer);
    } else if (Number.isFinite(state.startPrice)) {
      state.currentOffer = state.startPrice;
    }
    state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
  } catch (_error) {
    setBoundaryStatus("读取历史配置失败，请重新保存", true);
  }
}

function saveState() {
  const payload = {
    startPrice: state.startPrice,
    maxPrice: state.maxPrice,
    currentOffer: state.currentOffer,
    settings: state.settings,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function switchView(view) {
  const isAssistant = view === "assistant";
  el.assistantView.classList.toggle("active", isAssistant);
  el.settingsView.classList.toggle("active", !isAssistant);
  el.showAssistantBtn.classList.toggle("active", isAssistant);
  el.showSettingsBtn.classList.toggle("active", !isAssistant);
}

function saveBoundary() {
  const start = Number(el.startPrice.value);
  const max = Number(el.maxPrice.value);

  if (!Number.isFinite(start) || !Number.isFinite(max) || start <= 0 || max <= 0) {
    setBoundaryStatus("请输入有效价格", true);
    return;
  }
  if (start > max) {
    setBoundaryStatus("起始报价不能大于最高可接受价", true);
    return;
  }

  state.startPrice = round1(start);
  state.maxPrice = round1(max);
  state.currentOffer = state.currentOffer && state.currentOffer >= state.startPrice && state.currentOffer <= state.maxPrice
    ? round1(state.currentOffer)
    : round1(state.startPrice);
  state.pendingSuggestedOffer = null;

  updateCurrentOfferUI();
  setBoundaryStatus("价格边界已保存", false);
  saveState();
}

function setBoundaryStatus(text, isError) {
  el.boundaryStatus.textContent = text;
  el.boundaryStatus.style.color = isError ? "#c53030" : "#2f855a";
}

function updateCurrentOfferUI() {
  el.currentOffer.textContent = Number.isFinite(state.currentOffer) ? state.currentOffer : "-";
}

function renderSettingsForm() {
  el.speechEngine.value = state.settings.speechEngine;
  el.speechLanguage.value = state.settings.speechLanguage;
  el.enableModelAnalysis.checked = Boolean(state.settings.enableModelAnalysis);
  el.apiBase.value = state.settings.apiBase;
  el.apiKey.value = state.settings.apiKey;
  el.speechModel.value = state.settings.speechModel;
  el.analysisModel.value = state.settings.analysisModel;
  el.scenarioPrompt.value = state.settings.scenarioPrompt;
  setModelConfigStatus("已加载配置", false);
}

function saveModelSettings() {
  state.settings = {
    speechEngine: el.speechEngine.value,
    speechLanguage: (el.speechLanguage.value || "zh-CN").trim(),
    enableModelAnalysis: Boolean(el.enableModelAnalysis.checked),
    apiBase: (el.apiBase.value || "").trim(),
    apiKey: (el.apiKey.value || "").trim(),
    speechModel: (el.speechModel.value || "").trim(),
    analysisModel: (el.analysisModel.value || "").trim(),
    scenarioPrompt: (el.scenarioPrompt.value || "").trim() || DEFAULT_SCENARIO_PROMPT,
  };
  saveState();
  setupSpeechRecognition();
  refreshEngineStatus();
  refreshListenButtons();
  setModelConfigStatus("配置已保存", false);
}

function resetScenarioPrompt() {
  el.scenarioPrompt.value = DEFAULT_SCENARIO_PROMPT;
  setModelConfigStatus("已恢复默认场景说明，记得点保存配置", false);
}

function setModelConfigStatus(text, isError) {
  el.modelConfigStatus.textContent = text;
  el.modelConfigStatus.style.color = isError ? "#c53030" : "#2f855a";
}

function refreshEngineStatus() {
  const selected = state.settings.speechEngine;
  const browserOk = state.browserSpeechSupported;
  const modelOk = canUseModelSpeech();

  const selectedName =
    selected === "auto"
      ? "自动"
      : selected === "browser"
      ? "仅浏览器语音"
      : selected === "model"
      ? "仅模型语音"
      : "仅手动输入";

  el.engineStatus.textContent = `当前语音引擎：${selectedName}（浏览器语音：${browserOk ? "可用" : "不可用"}；模型语音：${modelOk ? "可用" : "未配置/不可用"}）`;
}

function refreshListenButtons() {
  if (state.listening) {
    el.startListenBtn.disabled = true;
    el.stopListenBtn.disabled = false;
    return;
  }
  const resolved = resolveSpeechMode();
  const canStart = resolved === "browser" || resolved === "model";
  el.startListenBtn.disabled = !canStart;
  el.stopListenBtn.disabled = true;

  if (!canStart) {
    if (state.settings.speechEngine === "manual") {
      setMicStatus("当前配置为仅手动输入", false);
    } else {
      setMicStatus("当前设备不满足语音监听条件，可切换手动输入或配置模型语音", true);
    }
  }
}
function submitManualLine() {
  const text = (el.manualText.value || "").trim();
  if (!text) {
    return;
  }
  addTranscript(el.speakerSelect.value, text, "manual");
  el.manualText.value = "";
}

function clearHistory() {
  state.transcripts = [];
  state.latestBrokerText = "";
  state.pendingSuggestedOffer = null;
  state.analysisTicket += 1;
  el.transcriptList.innerHTML = "";
  renderEmptyAnalysis();
}

function renderEmptyAnalysis() {
  el.latestBrokerText.textContent = "等待中介发言...";
  el.hiddenIntentText.textContent = "等待分析...";
  el.reasonText.textContent = "等待分析...";
  el.nextOfferText.textContent = "暂无建议";
  el.analysisSourceText.textContent = "本地规则引擎";
  fillList(el.plainTalkList, ["等待中介发言后自动翻译..."]);
  fillList(el.verifyList, ["等待中介发言后自动给出核验问题..."]);
  fillOrderedList(el.responseList, ["等待中介发言后自动给出应答建议..."]);
  setRisk("风险级别：-", "");
  el.applyOfferBtn.disabled = true;
}

function setupSpeechRecognition() {
  stopBrowserRecognitionOnly();
  state.recognition = null;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  state.browserSpeechSupported = Boolean(SpeechRecognition);

  if (!SpeechRecognition) {
    refreshEngineStatus();
    refreshListenButtons();
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = state.settings.speechLanguage || "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const text = (event.results[i][0].transcript || "").trim();
      if (!text) {
        continue;
      }
      if (event.results[i].isFinal) {
        addTranscript(el.speakerSelect.value, text, "browser-speech");
      } else {
        interim += text;
      }
    }
    el.interimText.textContent = interim || "实时识别文本会显示在这里";
  };

  recognition.onerror = (event) => {
    const err = event && event.error ? event.error : "unknown";
    if (err === "not-allowed") {
      stopListening("麦克风权限被拒绝，请在浏览器设置中允许", true);
    } else if (err === "service-not-allowed") {
      stopListening("浏览器语音服务不可用，可改为模型语音或手动输入", true);
    } else {
      stopListening(`浏览器语音异常：${err}`, true);
    }
  };

  recognition.onend = () => {
    if (state.listening && state.speechModeInUse === "browser") {
      setTimeout(() => {
        if (state.listening && state.speechModeInUse === "browser") {
          safeStartRecognition();
        }
      }, 180);
    }
  };

  state.recognition = recognition;
  refreshEngineStatus();
  refreshListenButtons();
}

function resolveSpeechMode() {
  const selected = state.settings.speechEngine;
  if (selected === "manual") {
    return "manual";
  }
  if (selected === "browser") {
    return state.browserSpeechSupported ? "browser" : null;
  }
  if (selected === "model") {
    return canUseModelSpeech() ? "model" : null;
  }
  if (state.browserSpeechSupported) {
    return "browser";
  }
  if (canUseModelSpeech()) {
    return "model";
  }
  return null;
}

function canUseModelSpeech() {
  return (
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    Boolean(window.MediaRecorder) &&
    hasModelApiBaseAndKey() &&
    Boolean((state.settings.speechModel || "").trim())
  );
}

function hasModelApiBaseAndKey() {
  return Boolean((state.settings.apiBase || "").trim() && (state.settings.apiKey || "").trim());
}

async function startListening() {
  if (state.listening) {
    return;
  }
  const mode = resolveSpeechMode();
  if (!mode || mode === "manual") {
    refreshListenButtons();
    return;
  }

  if (mode === "browser") {
    startBrowserListening();
    return;
  }

  await startModelListening();
}

function startBrowserListening() {
  if (!state.recognition) {
    setMicStatus("浏览器不支持语音识别", true);
    return;
  }
  state.speechModeInUse = "browser";
  state.listening = true;
  refreshListenButtons();
  setMicStatus("麦克风监听中（浏览器语音）", false);
  safeStartRecognition();
}

function safeStartRecognition() {
  try {
    state.recognition.start();
  } catch (_error) {
    setTimeout(() => {
      if (state.listening && state.speechModeInUse === "browser") {
        try {
          state.recognition.start();
        } catch (_err) {
          stopListening("浏览器语音启动失败，可改用模型语音或手动输入", true);
        }
      }
    }, 120);
  }
}

async function startModelListening() {
  if (!window.isSecureContext) {
    setMicStatus("模型语音需要 HTTPS 页面，手机请走 Cloudflare Pages 地址", true);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const options = {};
    const mimeType = getPreferredMimeType();
    if (mimeType) {
      options.mimeType = mimeType;
    }
    const recorder = new MediaRecorder(stream, options);
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const speaker = el.speakerSelect.value;
        enqueueTranscription(event.data, speaker);
      }
    };
    recorder.onerror = () => {
      stopListening("录音器异常，请重试", true);
    };

    recorder.start(3200);
    state.mediaStream = stream;
    state.mediaRecorder = recorder;
    state.speechModeInUse = "model";
    state.listening = true;
    refreshListenButtons();
    setMicStatus("麦克风监听中（模型语音转写）", false);
  } catch (error) {
    const msg = (error && error.name) || "";
    if (msg === "NotAllowedError") {
      stopListening("麦克风权限被拒绝，请允许后重试", true);
    } else {
      stopListening("无法开启麦克风，请检查浏览器与权限设置", true);
    }
  }
}

function getPreferredMimeType() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((x) => MediaRecorder.isTypeSupported(x)) || "";
}

function enqueueTranscription(blob, speaker) {
  el.interimText.textContent = "模型转写中...";
  state.transcribeQueue = state.transcribeQueue
    .then(async () => {
      const text = await transcribeAudioBlob(blob);
      if (text) {
        addTranscript(speaker, text, "model-speech");
      }
    })
    .catch((error) => {
      const msg = error instanceof Error ? error.message : String(error || "");
      setMicStatus(`模型转写失败：${msg}`, true);
    });
}

async function transcribeAudioBlob(blob) {
  const form = new FormData();
  const lang = (state.settings.speechLanguage || "").trim();
  form.append("file", blob, `segment-${Date.now()}.webm`);
  form.append("model", state.settings.speechModel.trim());
  if (lang) {
    form.append("language", lang);
  }
  form.append("temperature", "0");

  const resp = await fetch(buildApiUrl("/audio/transcriptions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${state.settings.apiKey.trim()}`,
    },
    body: form,
  });

  if (!resp.ok) {
    throw new Error(await extractApiError(resp));
  }

  const data = await resp.json();
  const text = (data && data.text ? data.text : "").trim();
  el.interimText.textContent = "实时识别文本会显示在这里";
  return text;
}

function buildApiUrl(path) {
  const base = (state.settings.apiBase || "").trim().replace(/\/+$/, "");
  return `${base}${path}`;
}

async function extractApiError(resp) {
  try {
    const raw = await resp.text();
    if (!raw) {
      return `${resp.status}`;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.error && parsed.error.message) {
        return `${resp.status} ${parsed.error.message}`;
      }
    } catch (_ignore) {
      // ignore
    }
    return `${resp.status} ${raw.slice(0, 100)}`;
  } catch (_error) {
    return `${resp.status}`;
  }
}

function stopListening(statusText = "麦克风已停止", isError = false) {
  state.listening = false;
  if (state.speechModeInUse === "browser") {
    stopBrowserRecognitionOnly();
  }
  if (state.speechModeInUse === "model") {
    stopModelRecordingOnly();
  }
  state.speechModeInUse = null;
  el.interimText.textContent = "实时识别文本会显示在这里";
  setMicStatus(statusText, isError);
  refreshListenButtons();
}

function stopBrowserRecognitionOnly() {
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch (_error) {
      // ignore
    }
  }
}

function stopModelRecordingOnly() {
  if (state.mediaRecorder) {
    try {
      if (state.mediaRecorder.state !== "inactive") {
        state.mediaRecorder.stop();
      }
    } catch (_error) {
      // ignore
    }
  }
  if (state.mediaStream) {
    state.mediaStream.getTracks().forEach((track) => track.stop());
  }
  state.mediaRecorder = null;
  state.mediaStream = null;
}

function setMicStatus(text, isError) {
  el.micStatus.textContent = text;
  el.micStatus.style.color = isError ? "#c53030" : "#5b6c8d";
}
function addTranscript(speaker, text, source) {
  const clean = (text || "").trim();
  if (!clean) {
    return;
  }

  const item = {
    speaker,
    text: clean,
    source,
    ts: new Date(),
  };
  state.transcripts.push(item);
  renderTranscriptItem(item);

  if (speaker === "broker") {
    analyzeBrokerTurn(clean);
  }
}

function renderTranscriptItem(item) {
  const li = document.createElement("li");
  const head = document.createElement("div");
  head.className = "transcript-head";

  const left = document.createElement("span");
  left.textContent = item.speaker === "broker" ? "中介/卖方" : "我方";

  const right = document.createElement("span");
  right.textContent = item.ts.toLocaleTimeString("zh-CN", { hour12: false });

  head.appendChild(left);
  head.appendChild(right);

  const body = document.createElement("div");
  body.textContent = item.text;

  li.appendChild(head);
  li.appendChild(body);
  el.transcriptList.prepend(li);
}

function analyzeBrokerTurn(text) {
  state.latestBrokerText = text;
  const ruleResult = analyzeWithRules(text);
  renderAnalysis(ruleResult, "rule");

  if (!shouldUseModelAnalysis()) {
    return;
  }

  const ticket = ++state.analysisTicket;
  el.analysisSourceText.textContent = "本地规则 + 模型增强（分析中）";
  analyzeWithModel(text, ruleResult)
    .then((modelResult) => {
      if (ticket !== state.analysisTicket || !modelResult) {
        return;
      }
      renderAnalysis(modelResult, "model");
    })
    .catch((error) => {
      const msg = error instanceof Error ? error.message : String(error || "");
      el.analysisSourceText.textContent = `模型分析失败，已回退本地规则：${msg}`;
    });
}

function shouldUseModelAnalysis() {
  return (
    Boolean(state.settings.enableModelAnalysis) &&
    hasModelApiBaseAndKey() &&
    Boolean((state.settings.analysisModel || "").trim())
  );
}

function analyzeWithRules(text) {
  const norm = text.replace(/\s+/g, "");
  const matched = [];
  let totalRiskScore = 0;

  RULES.forEach((rule) => {
    const hits = rule.keywords.filter((keyword) => norm.includes(keyword));
    if (hits.length > 0) {
      matched.push({
        key: rule.key,
        name: rule.name,
        intent: rule.intent,
        hits,
        score: hits.length,
      });
      totalRiskScore += hits.length * rule.risk;
    }
  });

  const hasEvidence = EVIDENCE_WORDS.some((word) => norm.includes(word));
  const prices = extractPrices(text);
  const quotedPrice = prices.length ? Math.max(...prices) : null;
  const primary = matched.length ? [...matched].sort((a, b) => b.score - a.score)[0] : null;

  let riskLevel = "low";
  if (totalRiskScore >= 4 || (hasKey(matched, "scarcity") && !hasEvidence) || hasKey(matched, "time_pressure")) {
    riskLevel = "high";
  } else if (totalRiskScore >= 2) {
    riskLevel = "medium";
  }

  const plainTalk = buildPlainTalk(text, matched, hasEvidence, quotedPrice);
  const hiddenIntent = primary
    ? primary.intent
    : "暂未识别明显施压套路，先继续让对方给可核验信息，再谈价格。";
  const verifyQuestions = buildVerifyQuestions(matched, hasEvidence, quotedPrice);
  const suggestion = suggestOffer({
    quotedPrice,
    riskLevel,
    hasEvidence,
    matched,
  });
  const responses = buildRuleResponses({
    quotedPrice,
    hasEvidence,
    suggestion,
  });
  const reason = buildReason({
    riskLevel,
    quotedPrice,
    hasEvidence,
    suggestion,
    matched,
  });

  return {
    plainTalk,
    hiddenIntent,
    verifyQuestions,
    responses,
    suggestion,
    reason,
    riskLevel,
    sourceLabel: "本地规则引擎",
  };
}

function hasKey(matched, key) {
  return matched.some((x) => x.key === key);
}

function buildPlainTalk(text, matched, hasEvidence, quotedPrice) {
  const result = [];
  const norm = text.replace(/\s+/g, "");

  if (hasKey(matched, "scarcity")) {
    result.push("他在制造‘你再不定就会被别人抢走’的紧张感，核心目的是让你更快加价。");
  }
  if (hasKey(matched, "time_pressure")) {
    result.push("他在压缩你的思考时间，想让你在信息不完整时立刻成交。");
  }
  if (hasKey(matched, "price_anchor")) {
    result.push("他在用‘市场价/最近成交’给你做心理锚定，想把你的心理价位抬高。");
  }
  if (hasKey(matched, "emotion_pressure")) {
    result.push("他在通过否定你的报价来打击信心，目的是让你先让步。");
  }
  if (hasKey(matched, "concession_trap")) {
    result.push("他说‘我去帮你争取’通常是在引导你先加一口，再把你绑定到更高区间。");
  }

  const mentionSameBuilding = norm.includes("同楼") || norm.includes("同小区");
  const mentionSamePrice = norm.includes("同价") || norm.includes("一样价格");
  const mentionOtherBuyer = norm.includes("另外一个客户") || norm.includes("也想要") || norm.includes("也在谈");
  if (mentionSameBuilding && mentionOtherBuyer) {
    result.push("‘同楼还有人同价要买’常用于催单，先当作未核验信息，不要直接跟价。");
  } else if (mentionSamePrice && mentionOtherBuyer) {
    result.push("‘有人同价竞争’是在放大竞争压力，真实性必须靠证据，不靠口头。");
  }

  if (!hasEvidence) {
    result.push("当前主要是口头说法，关键事实证据不足，先核验再谈价。");
  }
  if (Number.isFinite(quotedPrice)) {
    result.push(`本句出现价格锚点 ${quotedPrice} 万，先确认该价格对应的真实条件和凭据。`);
  }

  if (!result.length) {
    result.push("这句话暂未命中典型套路，先保持节奏，继续要事实材料。");
  }
  return result.slice(0, 3);
}

function buildVerifyQuestions(matched, hasEvidence, quotedPrice) {
  const list = [];
  list.push("你提到的成交或竞争信息，能给到可核验材料吗？比如网签时间、楼栋楼层、面积与成交总价。");

  if (hasKey(matched, "scarcity")) {
    list.push("你说还有客户在谈，请给出时间点和进度证据（隐私可打码），否则我们按未发生处理。");
  }
  if (hasKey(matched, "price_anchor")) {
    list.push("你说‘最近成交’，请提供同户型同朝向同楼层段的样本，不同条件不能直接类比。");
  }
  if (!hasEvidence) {
    list.push("在证据出来前，我们只接受现有报价，不接受临场情绪催单。");
  }
  if (Number.isFinite(quotedPrice)) {
    list.push(`${quotedPrice} 万包含哪些交易条件？是否含家具、税费分担、交房时间和违约条款？`);
  }

  return list.slice(0, 3);
}

function suggestOffer({ quotedPrice, riskLevel, hasEvidence, matched }) {
  if (!Number.isFinite(state.startPrice) || !Number.isFinite(state.maxPrice)) {
    return {
      action: "hold",
      offer: null,
      text: "请先保存价格边界，再使用下一口价建议。",
    };
  }

  const current = Number.isFinite(state.currentOffer) ? state.currentOffer : state.startPrice;
  const step = calcStep(state.startPrice, state.maxPrice);

  if (!Number.isFinite(quotedPrice)) {
    return {
      action: "hold",
      offer: current,
      text: `对方未给明确价格，先守住 ${current} 万不动。`,
    };
  }

  if (quotedPrice > state.maxPrice) {
    return {
      action: "walk_or_wait",
      offer: current,
      text: `对方口径 ${quotedPrice} 万超过你方上限 ${state.maxPrice} 万，建议不加价。`,
    };
  }

  const hasPressure = hasKey(matched, "scarcity") || hasKey(matched, "time_pressure") || hasKey(matched, "emotion_pressure");
  if ((riskLevel === "high" || hasPressure) && !hasEvidence) {
    return {
      action: "hold",
      offer: current,
      text: `当前更像施压话术，先维持 ${current} 万，拿到证据后再动。`,
    };
  }

  if (current >= state.maxPrice) {
    return {
      action: "hold",
      offer: state.maxPrice,
      text: `当前已到预算上限 ${state.maxPrice} 万，不建议再加。`,
    };
  }

  const target = Math.min(state.maxPrice, quotedPrice - step);
  const next = round1(Math.min(target, current + step));
  if (next <= current) {
    return {
      action: "hold",
      offer: current,
      text: `维持 ${current} 万，等待对方给出实质让步。`,
    };
  }

  return {
    action: "raise_small",
    offer: next,
    text: `可试探到 ${next} 万（小步加价，不一次给到底）。`,
  };
}

function buildRuleResponses({ quotedPrice, hasEvidence, suggestion }) {
  const current = Number.isFinite(state.currentOffer) ? state.currentOffer : "待设置";
  const upper = Number.isFinite(state.maxPrice) ? state.maxPrice : "待设置";
  const lines = [];

  lines.push("我们按可核验信息决策，你先把相关证据给到，我们看完马上回应。");

  if (Number.isFinite(quotedPrice)) {
    lines.push(`你提到 ${quotedPrice} 万我们听到了，但我们不会因为口头消息直接改价。`);
  } else {
    lines.push(`当前我们报价 ${current} 万先不变，先核验事实。`);
  }

  if (suggestion.action === "raise_small" && Number.isFinite(suggestion.offer)) {
    lines.push(`在关键条件确认无误的前提下，我们最多可以推进到 ${suggestion.offer} 万。`);
  } else if (!hasEvidence) {
    lines.push("在证据前先不谈新的加价幅度，这样对双方都公平。");
  } else {
    lines.push(`我们的预算上限是 ${upper} 万，超过上限就不符合家庭财务计划。`);
  }

  return lines.slice(0, 3);
}

function buildReason({ riskLevel, quotedPrice, hasEvidence, suggestion, matched }) {
  const parts = [];
  parts.push(`风险级别：${riskLevel === "high" ? "高" : riskLevel === "medium" ? "中" : "低"}。`);
  if (matched.length) {
    parts.push(`命中策略：${matched.map((x) => x.name).join("、")}。`);
  } else {
    parts.push("未命中明显套路关键词。");
  }
  parts.push(Number.isFinite(quotedPrice) ? `提及价格锚点：${quotedPrice} 万。` : "未识别到明确价格锚点。");
  parts.push(hasEvidence ? "存在部分可核验词。" : "缺少可核验证据。");
  parts.push(`执行建议：${suggestion.text}`);
  return parts.join("");
}
async function analyzeWithModel(text, ruleResult) {
  const messages = buildModelMessages(text, ruleResult);
  const payload = {
    model: state.settings.analysisModel.trim(),
    messages,
    temperature: 0.2,
    response_format: { type: "json_object" },
  };

  let content = "";
  try {
    content = await requestChatCompletion(payload);
  } catch (_firstErr) {
    const fallbackPayload = {
      ...payload,
      response_format: undefined,
    };
    content = await requestChatCompletion(fallbackPayload);
  }

  const parsed = safeParseModelJson(content);
  if (!parsed) {
    return null;
  }
  return mergeModelResult(ruleResult, parsed);
}

function buildModelMessages(text, ruleResult) {
  const recentContext = state.transcripts
    .slice(-6)
    .map((x) => `${x.speaker === "broker" ? "中介/卖方" : "我方"}: ${x.text}`)
    .join("\n");

  const boundaryText = Number.isFinite(state.startPrice) && Number.isFinite(state.maxPrice)
    ? `起始报价 ${state.startPrice} 万，最高可接受价 ${state.maxPrice} 万，当前报价 ${state.currentOffer} 万。`
    : "价格边界暂未设置。";

  const userPrompt = [
    "请基于以下内容进行话术分析，并严格输出 JSON：",
    boundaryText,
    `最新中介原话：${text}`,
    `最近上下文：\n${recentContext || "无"}`,
    `本地规则初判：风险 ${ruleResult.riskLevel}；潜台词 ${ruleResult.hiddenIntent}`,
    "",
    "JSON 字段要求：",
    "{",
    '  "plain_talk": ["最多3条，大白话翻译"],',
    '  "hidden_intent": "1句核心目的",',
    '  "risk_level": "low|medium|high",',
    '  "verify_questions": ["最多3条核验问题"],',
    '  "reply_lines": ["最多3条可直接说出口的话"],',
    '  "next_offer_advice": "下一口价建议描述",',
    '  "next_offer_value": "数字或 null，单位万元",',
    '  "reasoning": "简短解释"',
    "}",
    "注意：",
    "1) 任何建议不得突破买方最高可接受价。",
    "2) 证据不足时优先建议‘先核验再谈价’。",
    "3) 口吻要口语化，像现场能直接说的话。",
  ].join("\n");

  const systemPrompt = [
    state.settings.scenarioPrompt || DEFAULT_SCENARIO_PROMPT,
    "",
    "你必须返回合法 JSON，不能输出 JSON 以外的文本。",
  ].join("\n");

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];
}

async function requestChatCompletion(payload) {
  const body = {};
  Object.keys(payload).forEach((key) => {
    if (payload[key] !== undefined) {
      body[key] = payload[key];
    }
  });

  const resp = await fetch(buildApiUrl("/chat/completions"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.settings.apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(await extractApiError(resp));
  }
  const data = await resp.json();
  const content = data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content
    : "";
  return typeof content === "string" ? content : "";
}

function safeParseModelJson(text) {
  if (!text) {
    return null;
  }
  const direct = tryParseJson(text);
  if (direct) {
    return direct;
  }
  const blockMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (blockMatch && blockMatch[1]) {
    return tryParseJson(blockMatch[1]);
  }
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
    return tryParseJson(text.slice(braceStart, braceEnd + 1));
  }
  return null;
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function mergeModelResult(ruleResult, modelJson) {
  const merged = { ...ruleResult };

  const plain = normalizeStringList(modelJson.plain_talk, 3);
  if (plain.length) {
    merged.plainTalk = plain;
  }

  if (typeof modelJson.hidden_intent === "string" && modelJson.hidden_intent.trim()) {
    merged.hiddenIntent = modelJson.hidden_intent.trim();
  }

  const verify = normalizeStringList(modelJson.verify_questions, 3);
  if (verify.length) {
    merged.verifyQuestions = verify;
  }

  const replies = normalizeStringList(modelJson.reply_lines, 3);
  if (replies.length) {
    merged.responses = replies;
  }

  const risk = normalizeRisk(modelJson.risk_level);
  if (risk) {
    merged.riskLevel = risk;
  }

  merged.suggestion = mergeSuggestion(merged.suggestion, modelJson);
  if (typeof modelJson.reasoning === "string" && modelJson.reasoning.trim()) {
    merged.reason = modelJson.reasoning.trim();
  }
  merged.sourceLabel = "本地规则 + 模型增强";
  return merged;
}

function normalizeStringList(value, max) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

function normalizeRisk(value) {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }
  return "";
}

function mergeSuggestion(ruleSuggestion, modelJson) {
  const advice = typeof modelJson.next_offer_advice === "string" ? modelJson.next_offer_advice.trim() : "";
  const rawValue = Number(modelJson.next_offer_value);

  if (!Number.isFinite(rawValue)) {
    if (advice) {
      return { ...ruleSuggestion, text: advice };
    }
    return ruleSuggestion;
  }

  let offer = round1(rawValue);
  if (Number.isFinite(state.maxPrice) && offer > state.maxPrice) {
    return {
      action: "walk_or_wait",
      offer: state.currentOffer,
      text: `模型建议价 ${offer} 万超过你方上限 ${state.maxPrice} 万，已按上限策略处理。`,
    };
  }

  if (Number.isFinite(state.startPrice) && offer < state.startPrice) {
    offer = state.startPrice;
  }

  const current = Number.isFinite(state.currentOffer) ? state.currentOffer : state.startPrice;
  if (Number.isFinite(current) && offer <= current) {
    return {
      action: "hold",
      offer: current,
      text: advice || `模型建议暂不加价，先维持 ${current} 万。`,
    };
  }

  return {
    action: "raise_small",
    offer,
    text: advice || `模型建议可推进到 ${offer} 万。`,
  };
}

function renderAnalysis(analysis, source) {
  el.latestBrokerText.textContent = state.latestBrokerText || "等待中介发言...";
  fillList(el.plainTalkList, analysis.plainTalk);
  el.hiddenIntentText.textContent = analysis.hiddenIntent;
  fillList(el.verifyList, analysis.verifyQuestions);
  fillOrderedList(el.responseList, analysis.responses);
  el.nextOfferText.textContent = analysis.suggestion.text;
  el.reasonText.textContent = analysis.reason;
  el.analysisSourceText.textContent = source === "model" ? analysis.sourceLabel : "本地规则引擎";
  setRisk(
    `风险级别：${analysis.riskLevel === "high" ? "高" : analysis.riskLevel === "medium" ? "中" : "低"}`,
    analysis.riskLevel
  );

  if (analysis.suggestion.action === "raise_small" && Number.isFinite(analysis.suggestion.offer)) {
    state.pendingSuggestedOffer = analysis.suggestion.offer;
    el.applyOfferBtn.disabled = false;
  } else {
    state.pendingSuggestedOffer = null;
    el.applyOfferBtn.disabled = true;
  }
}

function fillList(target, lines) {
  target.innerHTML = "";
  (lines && lines.length ? lines : ["暂无"]).forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    target.appendChild(li);
  });
}

function fillOrderedList(target, lines) {
  target.innerHTML = "";
  (lines && lines.length ? lines : ["暂无"]).forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    target.appendChild(li);
  });
}

function setRisk(text, level) {
  el.riskLevel.textContent = text;
  el.riskLevel.classList.remove("high", "medium", "low");
  if (level) {
    el.riskLevel.classList.add(level);
  }
}

function applySuggestedOffer() {
  if (!Number.isFinite(state.pendingSuggestedOffer)) {
    return;
  }
  state.currentOffer = round1(state.pendingSuggestedOffer);
  state.pendingSuggestedOffer = null;
  updateCurrentOfferUI();
  saveState();
  el.applyOfferBtn.disabled = true;
}

function extractPrices(text) {
  const prices = [];
  const withUnit = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:万|w|W)/g)];
  withUnit.forEach((m) => prices.push(round1(Number(m[1]))));

  if (prices.length) {
    return prices;
  }

  const plainNums = [...text.matchAll(/\b(\d{3,4}(?:\.\d+)?)\b/g)];
  plainNums.forEach((m) => {
    const value = Number(m[1]);
    if (value >= 100 && value <= 2000) {
      prices.push(round1(value));
    }
  });
  return prices;
}

function calcStep(start, max) {
  const span = Math.max(0, max - start);
  if (span <= 5) {
    return 0.3;
  }
  if (span <= 10) {
    return 0.5;
  }
  return round1(Math.max(0.8, span / 10));
}

function round1(num) {
  return Math.round(num * 10) / 10;
}
