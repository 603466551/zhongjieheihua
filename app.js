const state = {
  startPrice: null,
  maxPrice: null,
  currentOffer: null,
  pendingSuggestedOffer: null,
  transcripts: [],
  recognition: null,
  listening: false,
};

const tacticRules = [
  {
    name: "制造稀缺",
    intent: "让你相信房源很抢手，尽快抬价或下定",
    keywords: ["有人要买", "别人在看", "很多人看", "刚有人谈", "房源很抢手", "手慢就没"],
    risk: 2,
  },
  {
    name: "时间施压",
    intent: "缩短你的思考时间，让你在信息不足时决策",
    keywords: ["今天必须", "现在定", "马上签", "今晚前", "再不定", "过时不候"],
    risk: 2,
  },
  {
    name: "成交锚定",
    intent: "用不透明成交案例把心理价位往上拉",
    keywords: ["最近成交", "同小区成交", "市场价", "都卖这个价", "业主底价", "普遍在"],
    risk: 1,
  },
  {
    name: "情绪施压",
    intent: "打击你当前报价合理性，让你主动加价",
    keywords: ["你这个价不可能", "太低了", "没诚意", "白谈了", "浪费时间", "不现实"],
    risk: 2,
  },
  {
    name: "让步诱导",
    intent: "用“我去帮你谈”引导你先加一口",
    keywords: ["我帮你争取", "你再加点", "各退一步", "给我个空间", "我好交代", "再抬一点"],
    risk: 1,
  },
];

const evidenceWords = ["网签", "备案", "合同", "截图", "流水", "签约", "带看记录", "单据", "房本"];

const el = {
  startPrice: document.getElementById("startPrice"),
  maxPrice: document.getElementById("maxPrice"),
  saveConfigBtn: document.getElementById("saveConfigBtn"),
  configStatus: document.getElementById("configStatus"),
  currentOffer: document.getElementById("currentOffer"),
  speakerSelect: document.getElementById("speakerSelect"),
  startListenBtn: document.getElementById("startListenBtn"),
  stopListenBtn: document.getElementById("stopListenBtn"),
  micStatus: document.getElementById("micStatus"),
  interimText: document.getElementById("interimText"),
  manualText: document.getElementById("manualText"),
  sendManualBtn: document.getElementById("sendManualBtn"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn"),
  transcriptList: document.getElementById("transcriptList"),
  riskLevel: document.getElementById("riskLevel"),
  tacticsList: document.getElementById("tacticsList"),
  intentText: document.getElementById("intentText"),
  responseList: document.getElementById("responseList"),
  nextOfferText: document.getElementById("nextOfferText"),
  reasonText: document.getElementById("reasonText"),
  applyOfferBtn: document.getElementById("applyOfferBtn"),
};

init();

function init() {
  loadConfig();
  bindEvents();
  setupSpeechRecognition();
}

function bindEvents() {
  el.saveConfigBtn.addEventListener("click", saveConfig);
  el.sendManualBtn.addEventListener("click", submitManualLine);
  el.clearHistoryBtn.addEventListener("click", clearHistory);
  el.startListenBtn.addEventListener("click", startListening);
  el.stopListenBtn.addEventListener("click", stopListening);
  el.applyOfferBtn.addEventListener("click", applySuggestedOffer);
}

function saveConfig() {
  const start = Number(el.startPrice.value);
  const max = Number(el.maxPrice.value);

  if (!Number.isFinite(start) || !Number.isFinite(max) || start <= 0 || max <= 0) {
    setConfigStatus("请填写有效的价格数字", true);
    return;
  }
  if (start > max) {
    setConfigStatus("起始报价不能大于最高可接受价", true);
    return;
  }

  state.startPrice = round1(start);
  state.maxPrice = round1(max);
  state.currentOffer = round1(start);
  state.pendingSuggestedOffer = null;
  updateCurrentOffer();
  setConfigStatus("价格边界已保存", false);
  saveToStorage();
}

function setConfigStatus(text, isError) {
  el.configStatus.textContent = text;
  el.configStatus.style.color = isError ? "#c53030" : "#2f855a";
}

function updateCurrentOffer() {
  el.currentOffer.textContent = state.currentOffer ?? "-";
}

function loadConfig() {
  try {
    const raw = localStorage.getItem("negotiation-config-v1");
    if (!raw) {
      return;
    }
    const cfg = JSON.parse(raw);
    if (!cfg || !cfg.startPrice || !cfg.maxPrice) {
      return;
    }
    state.startPrice = round1(Number(cfg.startPrice));
    state.maxPrice = round1(Number(cfg.maxPrice));
    state.currentOffer = round1(Number(cfg.currentOffer ?? cfg.startPrice));
    el.startPrice.value = state.startPrice;
    el.maxPrice.value = state.maxPrice;
    updateCurrentOffer();
    setConfigStatus("已加载上次边界", false);
  } catch (_error) {
    setConfigStatus("历史配置读取失败，可重新填写", true);
  }
}

function saveToStorage() {
  const cfg = {
    startPrice: state.startPrice,
    maxPrice: state.maxPrice,
    currentOffer: state.currentOffer,
  };
  localStorage.setItem("negotiation-config-v1", JSON.stringify(cfg));
}

function clearHistory() {
  state.transcripts = [];
  state.pendingSuggestedOffer = null;
  el.transcriptList.innerHTML = "";
  el.tacticsList.innerHTML = "";
  el.intentText.textContent = "等待中介发言...";
  el.responseList.innerHTML = "";
  el.nextOfferText.textContent = "暂无建议";
  el.reasonText.textContent = "等待中介发言...";
  setRisk("风险级别：-", "");
  el.applyOfferBtn.disabled = true;
}

function submitManualLine() {
  const text = el.manualText.value.trim();
  if (!text) {
    return;
  }
  const speaker = el.speakerSelect.value;
  addTranscript(speaker, text);
  el.manualText.value = "";
}

function setupSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    el.micStatus.textContent = "当前浏览器不支持语音识别，请用手动输入";
    el.startListenBtn.disabled = true;
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = true;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const piece = event.results[i][0].transcript.trim();
      if (!piece) {
        continue;
      }
      if (event.results[i].isFinal) {
        addTranscript(el.speakerSelect.value, piece);
      } else {
        interim += piece;
      }
    }
    el.interimText.textContent = interim || "实时识别文本会显示在这里";
  };

  recognition.onerror = () => {
    el.micStatus.textContent = "识别异常，请重试或改为手动输入";
    stopListening();
  };

  recognition.onend = () => {
    if (state.listening) {
      try {
        recognition.start();
      } catch (_error) {
        stopListening();
      }
    }
  };

  state.recognition = recognition;
}

function startListening() {
  if (!state.recognition) {
    return;
  }
  try {
    state.listening = true;
    state.recognition.start();
    el.startListenBtn.disabled = true;
    el.stopListenBtn.disabled = false;
    el.micStatus.textContent = "麦克风监听中";
  } catch (_error) {
    el.micStatus.textContent = "麦克风启动失败，请检查权限";
    state.listening = false;
  }
}

function stopListening() {
  state.listening = false;
  if (state.recognition) {
    state.recognition.stop();
  }
  el.startListenBtn.disabled = false;
  el.stopListenBtn.disabled = true;
  el.micStatus.textContent = "麦克风已停止";
  el.interimText.textContent = "实时识别文本会显示在这里";
}

function addTranscript(speaker, text) {
  const item = {
    speaker,
    text,
    ts: new Date(),
  };
  state.transcripts.push(item);
  renderTranscriptItem(item);

  if (speaker === "broker") {
    const analysis = analyzeBrokerLine(text);
    renderAnalysis(analysis);
  }
}

function renderTranscriptItem(item) {
  const li = document.createElement("li");
  const head = document.createElement("div");
  head.className = "transcript-head";

  const who = item.speaker === "broker" ? "中介/业主方" : "我方";
  const left = document.createElement("span");
  left.textContent = who;
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

function analyzeBrokerLine(text) {
  const norm = text.replace(/\s+/g, "");
  const matched = [];
  let totalRiskScore = 0;

  tacticRules.forEach((rule) => {
    const hitWords = rule.keywords.filter((word) => norm.includes(word));
    if (hitWords.length > 0) {
      matched.push({
        name: rule.name,
        intent: rule.intent,
        hits: hitWords,
        score: hitWords.length,
      });
      totalRiskScore += hitWords.length * rule.risk;
    }
  });

  const hasEvidence = evidenceWords.some((w) => norm.includes(w));
  const prices = extractPrices(text);
  const quotedPrice = prices.length ? Math.max(...prices) : null;
  const primary = matched.length ? matched.sort((a, b) => b.score - a.score)[0] : null;

  const intent = primary
    ? primary.intent
    : "暂未识别明显套路，先保持节奏，继续让对方给可验证信息";

  let riskLevel = "low";
  if (totalRiskScore >= 5 || (!hasEvidence && hasUrgencyOrScarcity(matched))) {
    riskLevel = "high";
  } else if (totalRiskScore >= 2) {
    riskLevel = "medium";
  }

  const suggestion = suggestOffer(quotedPrice, riskLevel, hasEvidence);
  const responses = buildResponses({
    riskLevel,
    quotedPrice,
    hasEvidence,
    suggestion,
  });

  return {
    matched,
    intent,
    riskLevel,
    quotedPrice,
    hasEvidence,
    responses,
    suggestion,
    reason: buildReason(riskLevel, quotedPrice, hasEvidence, suggestion),
  };
}

function hasUrgencyOrScarcity(matched) {
  return matched.some((x) => x.name === "制造稀缺" || x.name === "时间施压");
}

function suggestOffer(quotedPrice, riskLevel, hasEvidence) {
  if (!Number.isFinite(state.startPrice) || !Number.isFinite(state.maxPrice)) {
    return { action: "hold", offer: null, text: "请先保存价格边界后再使用建议价" };
  }

  const step = calcStep(state.startPrice, state.maxPrice);
  const current = state.currentOffer ?? state.startPrice;

  if (!quotedPrice) {
    return {
      action: "hold",
      offer: current,
      text: `未出现明确价格，先守住 ${current} 万，继续索要可验证信息`,
    };
  }

  if (quotedPrice > state.maxPrice) {
    return {
      action: "walk_or_wait",
      offer: current,
      text: `对方报价 ${quotedPrice} 万已超过你方上限 ${state.maxPrice} 万，先不加价`,
    };
  }

  if (!hasEvidence && riskLevel !== "low") {
    return {
      action: "hold",
      offer: current,
      text: "当前更像施压话术，先不加价，先要证据",
    };
  }

  const capTarget = Math.min(state.maxPrice, quotedPrice - step);
  const next = round1(Math.min(capTarget, current + step));
  if (next <= current) {
    return {
      action: "hold",
      offer: current,
      text: `维持 ${current} 万，等待对方给出真实让步`,
    };
  }

  return {
    action: "raise_small",
    offer: next,
    text: `可小幅试探到 ${next} 万（单次加价步长约 ${step} 万）`,
  };
}

function buildResponses({ riskLevel, quotedPrice, hasEvidence, suggestion }) {
  const current = Number.isFinite(state.currentOffer) ? state.currentOffer : "待设置";
  const upper = Number.isFinite(state.maxPrice) ? state.maxPrice : "待设置";
  const responses = [];

  if (riskLevel === "high") {
    responses.push("我理解你着急成交，但我们只按可核验信息决策。请先给网签/备案或可验证成交依据。");
    responses.push("如果今天必须定，那我们先暂停。我们不在信息不充分时做承诺。");
  } else {
    responses.push("你说的情况我听到了，我们按数据来。请把可验证成交样本发我看一下。");
  }

  if (Number.isFinite(quotedPrice)) {
    responses.push(`你提到 ${quotedPrice} 万，我们目前在 ${current} 万附近谈。若业主有实质让步，我们再同步调整。`);
  } else {
    responses.push(`当前我们报价 ${current} 万不变，先把房源真实成交和房况细节核完。`);
  }

  if (suggestion.action === "raise_small" && Number.isFinite(suggestion.offer)) {
    responses.push(`我们可以把诚意推进到 ${suggestion.offer} 万，但前提是今天确认关键条件并可签约。`);
  } else if (!hasEvidence) {
    responses.push("先别讨论加价幅度，你把事实材料给到，我们看完马上回复。");
  } else {
    responses.push(`我们的预算上限非常接近 ${upper} 万，再往上就不符合家庭财务计划。`);
  }

  return responses.slice(0, 3);
}

function buildReason(riskLevel, quotedPrice, hasEvidence, suggestion) {
  const parts = [];
  parts.push(`风险判断：${riskLevel === "high" ? "高" : riskLevel === "medium" ? "中" : "低"}。`);
  if (Number.isFinite(quotedPrice)) {
    parts.push(`识别到对方提及价格 ${quotedPrice} 万。`);
  } else {
    parts.push("未识别到明确价格锚点。");
  }
  parts.push(hasEvidence ? "对话中出现了部分可核验信息词。" : "对话中缺少可核验凭据。");
  parts.push(`执行建议：${suggestion.text}。`);
  return parts.join("");
}

function renderAnalysis(analysis) {
  if (!analysis.matched.length) {
    el.tacticsList.innerHTML = "<li>未命中典型套路关键词，继续观察</li>";
  } else {
    el.tacticsList.innerHTML = "";
    analysis.matched.forEach((m) => {
      const li = document.createElement("li");
      li.textContent = `${m.name}（命中：${m.hits.join("、")}）`;
      el.tacticsList.appendChild(li);
    });
  }

  el.intentText.textContent = analysis.intent;
  setRisk(
    `风险级别：${analysis.riskLevel === "high" ? "高" : analysis.riskLevel === "medium" ? "中" : "低"}`,
    analysis.riskLevel
  );

  el.responseList.innerHTML = "";
  analysis.responses.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    el.responseList.appendChild(li);
  });

  el.nextOfferText.textContent = analysis.suggestion.text;
  el.reasonText.textContent = analysis.reason;

  if (analysis.suggestion.action === "raise_small" && Number.isFinite(analysis.suggestion.offer)) {
    state.pendingSuggestedOffer = analysis.suggestion.offer;
    el.applyOfferBtn.disabled = false;
  } else {
    state.pendingSuggestedOffer = null;
    el.applyOfferBtn.disabled = true;
  }
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
  updateCurrentOffer();
  saveToStorage();
  el.applyOfferBtn.disabled = true;
}

function extractPrices(text) {
  const prices = [];
  const wanMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*万/g)];
  wanMatches.forEach((m) => prices.push(round1(Number(m[1]))));

  if (prices.length) {
    return prices;
  }

  const plainNums = [...text.matchAll(/\b(\d{3}(?:\.\d+)?)\b/g)];
  plainNums.forEach((m) => {
    const n = Number(m[1]);
    if (n >= 100 && n <= 2000) {
      prices.push(round1(n));
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
