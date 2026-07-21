(function recommendationEngine(global) {
  "use strict";

  const VERSION = "43";
  const DAY_ZONE = "Asia/Shanghai";
  const MATH_DIMENSIONS = [
    ["prealgebra", "基础运算"],
    ["algebra", "代数"],
    ["geometry", "几何"],
    ["number_theory", "数论"],
    ["counting_probability", "计数概率"],
    ["precalculus", "预备微积分"],
    ["amc10", "AMC 10"],
    ["amc12", "AMC 12"],
  ];
  const ECON_DIMENSIONS = [
    ["principles", "经济学原理"],
    ["supply", "供需与均衡"],
    ["elasticity", "弹性"],
    ["production", "成本与生产"],
    ["markets", "市场结构"],
    ["growth", "GDP与增长"],
    ["inflation", "通胀与CPI"],
    ["policy", "政策与定量"],
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function dayKey(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: DAY_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function dayStartIso(key = dayKey()) {
    return new Date(`${key}T00:00:00+08:00`).toISOString();
  }

  function hash(text) {
    let value = 2166136261;
    for (let index = 0; index < String(text).length; index += 1) {
      value ^= String(text).charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function randomFor(seed) {
    let value = hash(seed) || 1;
    return function next() {
      value += 0x6d2b79f5;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
  }

  function contest(attempt) {
    return String(attempt?.contest_type || "").toUpperCase();
  }

  function latestByProblem(attempts) {
    const latest = new Map();
    for (const attempt of attempts || []) {
      if (!attempt?.problem_id) continue;
      const previous = latest.get(attempt.problem_id);
      if (!previous || String(attempt.submitted_at || "") > String(previous.submitted_at || "")) {
        latest.set(attempt.problem_id, attempt);
      }
    }
    return latest;
  }

  function historyBeforeToday(attempts, key = dayKey()) {
    const cutoff = dayStartIso(key);
    return (attempts || []).filter((attempt) => String(attempt.submitted_at || "") < cutoff);
  }

  function mathTopic(value) {
    const topic = String(value || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (topic.includes("prealgebra") || topic.includes("arithmetic")) return "prealgebra";
    if (topic.includes("precalculus") || topic.includes("trig")) return "precalculus";
    if (topic.includes("geometry")) return "geometry";
    if (topic.includes("number")) return "number_theory";
    if (topic.includes("count") || topic.includes("probab") || topic.includes("combin")) return "counting_probability";
    return "algebra";
  }

  function econTopic(value) {
    const topic = String(value || "").toLowerCase();
    if (/elastic/.test(topic)) return "elasticity";
    if (/cpi|inflation|price level/.test(topic)) return "inflation";
    if (/gdp|growth|macro/.test(topic)) return "growth";
    if (/fiscal|monetary|policy|quant|sample/.test(topic)) return "policy";
    if (/cost|production/.test(topic)) return "production";
    if (/competitive|market structure|monopoly|oligopoly|micro/.test(topic)) return "markets";
    if (/demand|supply|equilibrium/.test(topic)) return "supply";
    return "principles";
  }

  function difficultyWeight(attempt) {
    const type = contest(attempt);
    const number = Number(attempt?.number) || 1;
    if (type === "AMC") {
      const levelBoost = Number(attempt.level) === 12 ? 0.9 : 0;
      return clamp(0.75 + number / 28 + levelBoost, 0.8, 1.9);
    }
    if (type === "LSESU") return 1.55;
    const label = String(attempt?.difficulty || "");
    if (/高|hard|challenge|sample/i.test(label)) return 1.45;
    if (/中|medium|advanced/i.test(label)) return 1.15;
    return 1;
  }

  function scoreRows(rows) {
    if (!rows.length) return { score: 50, accuracy: 0, count: 0, confidence: 0 };
    const correct = rows.filter((row) => row.is_correct).length;
    const accuracy = correct / rows.length;
    const confidence = clamp(rows.length / 10, 0, 1);
    const accuracyScore = accuracy * 100;
    return {
      score: Math.round(50 * (1 - confidence) + accuracyScore * confidence),
      accuracy,
      count: rows.length,
      confidence,
    };
  }

  function report(attempts, domain) {
    const isMath = domain === "math";
    const source = (attempts || []).filter((attempt) => isMath
      ? contest(attempt) === "AMC"
      : ["NEC", "LSESU"].includes(contest(attempt)));
    const latest = [...latestByProblem(source).values()];
    const dimensions = (isMath ? MATH_DIMENSIONS : ECON_DIMENSIONS).map(([key, label]) => {
      let rows;
      if (isMath && key === "amc10") rows = latest.filter((row) => Number(row.level) === 10);
      else if (isMath && key === "amc12") rows = latest.filter((row) => Number(row.level) === 12);
      else rows = latest.filter((row) => (isMath ? mathTopic(row.topic) : econTopic(row.topic)) === key);
      return { key, label, ...scoreRows(rows) };
    });
    const total = latest.length;
    const correct = latest.filter((row) => row.is_correct).length;
    const overall = total
      ? Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length)
      : 50;
    const weakest = dimensions.slice().sort((a, b) => a.score - b.score || b.count - a.count)[0];
    return { domain, dimensions, overall, total, correct, weakest };
  }

  function problemTopic(problem, domain) {
    return domain === "math"
      ? mathTopic(problem.primary_topic || problem.topic || problem.topic_key)
      : econTopic(problem.topic || problem.section);
  }

  function problemDifficulty(problem, domain, selectedContest) {
    if (domain === "math") {
      const levelBase = Number(problem.level) === 12 ? 3 : 1;
      return clamp(levelBase + (Number(problem.number) || 1) / 14, 1, 4.9);
    }
    if (selectedContest === "LSESU") return 4.2 + (String(problem.section || "") === "Sample Test" ? 0.5 : 0);
    return clamp(Number(problem.difficulty_level) || (/高|hard/i.test(problem.difficulty || "") ? 3 : 2), 1, 3.5);
  }

  function mathTarget(attempts) {
    const rows = [...latestByProblem((attempts || []).filter((row) => contest(row) === "AMC")).values()]
      .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")))
      .slice(0, 30);
    if (!rows.length) return 1.8;
    const weighted = scoreRows(rows);
    return clamp(1.45 + weighted.accuracy * 3.45, 1.6, 4.9);
  }

  function selectEconomyContest(attempts) {
    const latest = [...latestByProblem(attempts || []).values()];
    const nec = latest.filter((row) => contest(row) === "NEC")
      .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")))
      .slice(0, 30);
    const lsesu = latest.filter((row) => contest(row) === "LSESU")
      .sort((a, b) => String(b.submitted_at || "").localeCompare(String(a.submitted_at || "")))
      .slice(0, 15);
    if (lsesu.length >= 15 && scoreRows(lsesu).accuracy < 0.55) return "NEC";
    if (nec.length < 15 || scoreRows(nec).accuracy < 0.75) return "NEC";
    const topicScores = ECON_DIMENSIONS.map(([key]) => scoreRows(nec.filter((row) => econTopic(row.topic) === key)))
      .filter((item) => item.count >= 2);
    return topicScores.some((item) => item.accuracy < 0.6) ? "NEC" : "LSESU";
  }

  function recommend(problems, attempts, options) {
    const { userId, date = dayKey(), domain, selectedContest, count = 5 } = options;
    const frozen = historyBeforeToday(attempts, date);
    const relevant = frozen.filter((row) => domain === "math"
      ? contest(row) === "AMC"
      : contest(row) === selectedContest);
    const latest = latestByProblem(relevant);
    const everCorrect = new Set(relevant.filter((row) => row.is_correct).map((row) => row.problem_id));
    const latestWrong = new Set([...latest].filter(([, row]) => !row.is_correct).map(([id]) => id));
    const domainReport = report(relevant, domain);
    const weakness = new Map(domainReport.dimensions.map((item) => [item.key, 100 - item.score]));
    const target = domain === "math" ? mathTarget(relevant) : selectedContest === "LSESU" ? 4.5 : 2.1;
    const random = randomFor(`${userId}:${date}:${domain}:${selectedContest || "AMC"}`);
    const candidates = (problems || []).filter((problem) => {
      if (!problem?.id || everCorrect.has(problem.id)) return false;
      if (domain === "math") return Number(problem.level) === 10 || Number(problem.level) === 12;
      return String(problem.type || selectedContest).toUpperCase() === selectedContest;
    }).map((problem) => {
      const topic = problemTopic(problem, domain);
      const difficulty = problemDifficulty(problem, domain, selectedContest);
      const review = latestWrong.has(problem.id);
      const score = (weakness.get(topic) || 50) * 0.9 - Math.abs(difficulty - target) * 19 + (review ? 30 : 0) + random() * 9;
      return { problem, review, score, topic, difficulty };
    }).sort((a, b) => b.score - a.score || String(a.problem.id).localeCompare(String(b.problem.id)));

    const chosen = [];
    const reviewLimit = Math.min(2, candidates.filter((item) => item.review).length);
    chosen.push(...candidates.filter((item) => item.review).slice(0, reviewLimit));
    for (const item of candidates) {
      if (chosen.length >= count) break;
      if (item.review) continue;
      if (!chosen.some((entry) => entry.problem.id === item.problem.id)) chosen.push(item);
    }
    return chosen.slice(0, count).map((item) => ({
      ...item.problem,
      recommendation_reason: item.review ? "错题复习" : `${domainReport.weakest?.label || "薄弱项"}强化`,
    }));
  }

  function buildPlan({ userId, attempts, amcProblems = [], necProblems = [], lsesuProblems = [], date = dayKey() }) {
    const frozen = historyBeforeToday(attempts, date);
    const economyContest = selectEconomyContest(frozen);
    const economyProblems = economyContest === "LSESU" ? lsesuProblems : necProblems;
    return {
      date,
      economyContest,
      math: recommend(amcProblems, attempts, { userId, date, domain: "math", selectedContest: "AMC" }),
      economy: recommend(economyProblems, attempts, { userId, date, domain: "economy", selectedContest: economyContest }),
      mathReport: report(attempts, "math"),
      economyReport: report(attempts, "economy"),
    };
  }

  function drawRadar(canvas, dimensions, options = {}) {
    if (!canvas || !dimensions?.length) return;
    const ratio = global.devicePixelRatio || 1;
    const size = Math.max(280, canvas.clientWidth || 320);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    const context = canvas.getContext("2d");
    context.scale(ratio, ratio);
    context.clearRect(0, 0, size, size);
    const center = size / 2;
    const radius = size * 0.31;
    const count = dimensions.length;
    const point = (index, value = 1) => {
      const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
      return [center + Math.cos(angle) * radius * value, center + Math.sin(angle) * radius * value];
    };
    context.strokeStyle = "rgba(8, 63, 52, .16)";
    context.lineWidth = 1;
    for (let ring = 1; ring <= 4; ring += 1) {
      context.beginPath();
      dimensions.forEach((_, index) => {
        const [x, y] = point(index, ring / 4);
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.closePath();
      context.stroke();
    }
    dimensions.forEach((item, index) => {
      const [x, y] = point(index);
      context.beginPath();
      context.moveTo(center, center);
      context.lineTo(x, y);
      context.stroke();
      const [labelX, labelY] = point(index, 1.22);
      context.fillStyle = "#52645f";
      context.font = "600 11px system-ui, sans-serif";
      context.textAlign = labelX < center - 8 ? "right" : labelX > center + 8 ? "left" : "center";
      context.textBaseline = labelY < center ? "bottom" : "top";
      context.fillText(item.label, labelX, labelY);
    });
    context.beginPath();
    dimensions.forEach((item, index) => {
      const [x, y] = point(index, clamp(item.score, 0, 100) / 100);
      if (index) context.lineTo(x, y); else context.moveTo(x, y);
    });
    context.closePath();
    context.fillStyle = options.fill || "rgba(10, 107, 87, .22)";
    context.strokeStyle = options.stroke || "#0a6b57";
    context.lineWidth = 2;
    context.fill();
    context.stroke();
  }

  global.SZZXRecommendations = {
    VERSION,
    dayKey,
    historyBeforeToday,
    report,
    selectEconomyContest,
    recommend,
    buildPlan,
    drawRadar,
  };
}(window));
