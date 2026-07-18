
const DATA_URL = "./lsesu_question_bank.json";
const STORAGE_KEY = "lsesu-practice-progress-v1";
const MARKS_KEY = "lsesu-practice-marks-v1";
const SUPABASE_URL = "https://bwlcnaruyjazaxyiiumd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_bGhQso88Ml6VEpX4reo8QQ_VjwL7yND";

// Static GitHub Pages frontend: use only the Supabase publishable/anon key.
// Never add a service_role key, database password, JWT secret, or private key here.

const stageLabels = {
  idea: "思路 / Idea",
  key_steps: "主要步骤 / Main Steps",
  full_calculation: "完整解析 / Full Explanation",
};

const sectionLabels = {
  Macro: "Macro",
  Micro: "Micro",
  Quantitative: "Quant",
  "Sample Test": "Sample",
};

const els = {
  entryScreen: document.querySelector("#entryScreen"),
  practiceShell: document.querySelector("#practiceShell"),
  reviewScreen: document.querySelector("#reviewScreen"),
  aboutScreen: document.querySelector("#aboutScreen"),
  entryMeta: document.querySelector("#entryMeta"),
  datasetMeta: document.querySelector("#datasetMeta"),
  userStatus: document.querySelector("#userStatus"),
  topUserStatus: document.querySelector("#topUserStatus"),
  logoutButton: document.querySelector("#logoutButton"),
  startPractice: document.querySelector("#startPractice"),
  assignedPracticeCard: document.querySelector("#assignedPracticeCard"),
  assignedPracticeMode: document.querySelector("#assignedPracticeMode"),
  assignmentScreen: document.querySelector("#assignmentScreen"),
  assignmentMeta: document.querySelector("#assignmentMeta"),
  assignmentUserStatus: document.querySelector("#assignmentUserStatus"),
  assignmentList: document.querySelector("#assignmentList"),
  assignmentRefresh: document.querySelector("#assignmentRefresh"),
  assignmentToEntry: document.querySelector("#assignmentToEntry"),
  reviewMode: document.querySelector("#reviewMode"),
  aboutMode: document.querySelector("#aboutMode"),
  backToEntry: document.querySelector("#backToEntry"),
  openReview: document.querySelector("#openReview"),
  openAbout: document.querySelector("#openAbout"),
  reviewToPractice: document.querySelector("#reviewToPractice"),
  reviewToAbout: document.querySelector("#reviewToAbout"),
  reviewToEntry: document.querySelector("#reviewToEntry"),
  aboutToPractice: document.querySelector("#aboutToPractice"),
  aboutToEntry: document.querySelector("#aboutToEntry"),
  filters: document.querySelector(".filters"),
  topicFilter: document.querySelector("#topicFilter"),
  difficultyFilter: document.querySelector("#difficultyFilter"),
  searchFilter: document.querySelector("#searchFilter"),
  resetFilters: document.querySelector("#resetFilters"),
  randomProblem: document.querySelector("#randomProblem"),
  listTitle: document.querySelector("#listTitle"),
  problemList: document.querySelector("#problemList"),
  problemKicker: document.querySelector("#problemKicker"),
  problemTitle: document.querySelector("#problemTitle"),
  prevProblem: document.querySelector("#prevProblem"),
  nextProblem: document.querySelector("#nextProblem"),
  statement: document.querySelector("#statement"),
  choicePanel: document.querySelector("#choicePanel"),
  submitAnswer: document.querySelector("#submitAnswer"),
  revealAnswer: document.querySelector("#revealAnswer"),
  favoriteProblem: document.querySelector("#favoriteProblem"),
  clearAnswer: document.querySelector("#clearAnswer"),
  answerStatus: document.querySelector("#answerStatus"),
  answerDetail: document.querySelector("#answerDetail"),
  problemStatusTags: document.querySelector("#problemStatusTags"),
  solutionStageControl: document.querySelector("#solutionStageControl"),
  solutionBody: document.querySelector("#solutionBody"),
  problemSource: document.querySelector("#problemSource"),
  statTotal: document.querySelector("#statTotal"),
  statAnswered: document.querySelector("#statAnswered"),
  statCorrect: document.querySelector("#statCorrect"),
  reviewMeta: document.querySelector("#reviewMeta"),
  answeredTitle: document.querySelector("#answeredTitle"),
  answeredList: document.querySelector("#answeredList"),
  mistakeTitle: document.querySelector("#mistakeTitle"),
  mistakeList: document.querySelector("#mistakeList"),
  favoriteTitle: document.querySelector("#favoriteTitle"),
  favoriteList: document.querySelector("#favoriteList"),
};

const state = {
  data: null,
  problems: [],
  filtered: [],
  currentIndex: 0,
  selectedChoice: null,
  revealed: false,
  solutionStage: "idea",
  mode: "entry",
  assignments: [],
  activeAssignmentId: null,
  progress: loadJson(STORAGE_KEY, {}),
  marks: loadJson(MARKS_KEY, {}),
  supabase: null,
  user: null,
  profile: null,
};

function cloudClient() {
  if (state.supabase) return state.supabase;
  if (!window.supabase?.createClient) return null;
  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return state.supabase;
}

async function loadProfile(user) {
  const client = cloudClient();
  if (!client || !user) return null;
  try {
    const { data, error } = await client
      .from("profiles")
      .select("id,email,display_name,role")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data || { id: user.id, email: user.email, role: "student" };
  } catch (error) {
    console.warn("Profile loading skipped:", error);
    return { id: user.id, email: user.email, role: "student" };
  }
}

function renderUserStatus() {
  const label = state.user
    ? `${state.profile?.display_name || state.user.email} · ${state.profile?.role || "student"}`
    : "未登录 / Guest local records";
  [els.userStatus, els.topUserStatus, els.assignmentUserStatus].forEach((node) => {
    if (node) node.textContent = label;
  });
  els.assignedPracticeCard.classList.toggle("is-hidden", state.profile?.role !== "econclubmembers");
  els.logoutButton.classList.toggle("is-hidden", !state.user);
}

async function initAuth() {
  try {
    const client = cloudClient();
    if (!client) {
      renderUserStatus();
      return;
    }
    const { data } = await client.auth.getSession();
    state.user = data.session?.user || null;
    state.profile = state.user ? await loadProfile(state.user) : null;
    renderUserStatus();
    await loadAssignments();
    client.auth.onAuthStateChange(async (_event, session) => {
      state.user = session?.user || null;
      state.profile = state.user ? await loadProfile(state.user) : null;
      renderUserStatus();
      await loadAssignments();
    });
  } catch (error) {
    console.warn("Cloud login unavailable:", error);
    state.user = null;
    state.profile = null;
    renderUserStatus();
  }
}

async function logout() {
  const client = cloudClient();
  if (client) await client.auth.signOut();
  state.user = null;
  state.profile = null;
  renderUserStatus();
}

async function saveAttemptCloud(problem, progress) {
  if (!state.user) return;
  const client = cloudClient();
  if (!client) return;
  // TODO: If future LSESU formats need extra fields, add LSESU-specific columns or metadata.
  await client.from("attempts").insert({
    user_id: state.user.id,
    problem_id: problem.id,
    exam_id: problem.display_name || null,
    year: null,
    level: null,
    form: null,
    number: Number(problem.number) || null,
    topic: problem.topic || null,
    difficulty: problem.section || null,
    selected_answer: progress.choice,
    correct_answer: problem.answer_choice || null,
    is_correct: Boolean(progress.correct),
    time_spent_seconds: null,
    mode: "single",
    contest_type: "LSESU",
    platform: "lsesu-economics-practice-platform",
    source_url: window.location.href,
    submitted_at: progress.submittedAt || new Date().toISOString(),
  });
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) || fallback;
  } catch {
    return fallback;
  }
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.progress));
}

function saveMarks() {
  localStorage.setItem(MARKS_KEY, JSON.stringify(state.marks));
}

function unique(items, getter) {
  return [...new Set(items.map(getter).filter(Boolean))];
}

function fillSelect(select, entries, allLabel) {
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = allLabel;
  select.appendChild(all);
  for (const [value, label] of entries) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }
}

function updateMeta() {
  const text = state.data
    ? `${state.data.summary.section_count || 4} 个分区 / sections · ${state.data.summary.problem_count} 道题 / problems · ${state.data.summary.with_image || 0} 道图示题 / diagram problems`
    : "加载中 / Loading...";
  els.entryMeta.textContent = text;
  els.datasetMeta.textContent = text;
}

function isEconClubMember() {
  return state.profile?.role === "econclubmembers";
}

function assignmentProblems(assignment) {
  const byId = new Map(state.problems.map((problem) => [problem.id, problem]));
  return (assignment?.problem_ids || []).map((id) => byId.get(id)).filter(Boolean);
}

function assignmentDue(value) {
  if (!value) return "未设置截止时间 / No due date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未设置截止时间 / No due date" : `截止 / Due ${new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)}`;
}

function renderAssignments(message = "") {
  els.assignmentList.innerHTML = "";
  els.assignmentMeta.textContent = message || (state.assignments.length ? `${state.assignments.length} 个任务 / assignments` : "暂无已发布 LSESU 任务 / No LSESU assignments published yet.");
  if (!state.assignments.length) {
    const empty = document.createElement("div");
    empty.className = "assignment-empty";
    empty.textContent = "老师暂时还没有发布 LSESU 练习任务。 / Your teacher has not published an LSESU assignment yet.";
    els.assignmentList.append(empty);
    return;
  }
  state.assignments.forEach((assignment) => {
    const problems = assignmentProblems(assignment);
    const answered = problems.filter((problem) => currentProgress(problem)).length;
    const card = document.createElement("article");
    card.className = "assignment-card";
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = assignment.title || "LSESU 练习任务 / LSESU Assignment";
    const note = document.createElement("p");
    note.textContent = assignment.instructions || "提交后即可查看答案和分阶段解析。 / Submit to reveal answers and staged explanations.";
    const meta = document.createElement("p");
    meta.className = "assignment-meta-row";
    meta.textContent = `${assignmentDue(assignment.due_at)} · ${answered}/${problems.length} 已完成 / completed`;
    copy.append(title, note, meta);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = problems.length ? "开始作答 / Start" : "题目未载入 / Unavailable";
    button.disabled = !problems.length;
    button.addEventListener("click", () => startAssignment(assignment.id));
    card.append(copy, button);
    els.assignmentList.append(card);
  });
}

async function loadAssignments() {
  if (!isEconClubMember()) return;
  const client = cloudClient();
  if (!client) return;
  const { data, error } = await client.from("econ_assignments")
    .select("id,title,instructions,problem_ids,due_at,created_at")
    .eq("target_role", "econclubmembers")
    .eq("contest_type", "LSESU")
    .order("created_at", { ascending: false });
  if (error) {
    renderAssignments(`无法读取任务 / Unable to load assignments: ${error.message}`);
    return;
  }
  state.assignments = data || [];
  renderAssignments();
}

async function showAssignments() {
  if (!isEconClubMember()) return;
  state.mode = "assignments";
  els.entryScreen.classList.add("is-hidden");
  els.practiceShell.classList.add("is-hidden");
  els.reviewScreen.classList.add("is-hidden");
  els.aboutScreen.classList.add("is-hidden");
  els.assignmentScreen.classList.remove("is-hidden");
  renderAssignments("读取老师布置的题目中 / Loading assignments...");
  await loadAssignments();
}

function startAssignment(assignmentId) {
  const assignment = state.assignments.find((item) => item.id === assignmentId);
  const problems = assignmentProblems(assignment);
  if (!problems.length) return;
  state.mode = "assignment";
  state.activeAssignmentId = assignmentId;
  state.filtered = problems;
  state.currentIndex = 0;
  state.selectedChoice = currentProgress(problems[0])?.choice || null;
  state.revealed = Boolean(currentProgress(problems[0]));
  els.filters.classList.add("is-hidden");
  els.randomProblem.classList.add("is-hidden");
  els.entryScreen.classList.add("is-hidden");
  els.assignmentScreen.classList.add("is-hidden");
  els.practiceShell.classList.remove("is-hidden");
  render();
}

function showEntry() {
  state.mode = "entry";
  els.entryScreen.classList.remove("is-hidden");
  els.assignmentScreen.classList.add("is-hidden");
  els.practiceShell.classList.add("is-hidden");
  els.reviewScreen.classList.add("is-hidden");
  els.aboutScreen.classList.add("is-hidden");
}

function showPractice() {
  state.mode = "practice";
  state.activeAssignmentId = null;
  els.entryScreen.classList.add("is-hidden");
  els.practiceShell.classList.remove("is-hidden");
  els.assignmentScreen.classList.add("is-hidden");
  els.filters.classList.remove("is-hidden");
  els.randomProblem.classList.remove("is-hidden");
  els.reviewScreen.classList.add("is-hidden");
  els.aboutScreen.classList.add("is-hidden");
  applyFilters(true);
}

function showReview() {
  els.entryScreen.classList.add("is-hidden");
  els.practiceShell.classList.add("is-hidden");
  els.assignmentScreen.classList.add("is-hidden");
  els.reviewScreen.classList.remove("is-hidden");
  els.aboutScreen.classList.add("is-hidden");
  renderReview();
}

function showAbout() {
  els.entryScreen.classList.add("is-hidden");
  els.practiceShell.classList.add("is-hidden");
  els.assignmentScreen.classList.add("is-hidden");
  els.reviewScreen.classList.add("is-hidden");
  els.aboutScreen.classList.remove("is-hidden");
}

function initFilters() {
  const topics = unique(state.problems, (p) => p.topic)
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((topic) => [topic, topic]);
  const sections = unique(state.problems, (p) => p.section)
    .map((section) => [section, section]);
  fillSelect(els.topicFilter, topics, "全部主题 / All Topics");
  fillSelect(els.difficultyFilter, sections, "全部分区 / All Sections");
}

function getFilters() {
  return {
    topic: els.topicFilter.value,
    section: els.difficultyFilter.value,
    search: els.searchFilter.value.trim().toLowerCase(),
  };
}

function applyFilters(keepCurrent = false) {
  const previousId = currentProblem()?.id;
  const filters = getFilters();
  state.filtered = state.problems.filter((problem) => {
    if (filters.topic !== "all" && problem.topic !== filters.topic) return false;
    if (filters.section !== "all" && problem.section !== filters.section) return false;
    if (filters.search) {
      const haystack = [
        problem.id,
        problem.topic,
        problem.section,
        problem.number,
        problem.statement,
        Object.values(problem.choices || {}).join(" "),
      ].join(" ").toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });
  state.currentIndex = 0;
  if (keepCurrent && previousId) {
    const next = state.filtered.findIndex((problem) => problem.id === previousId);
    if (next >= 0) state.currentIndex = next;
  }
  const progress = currentProgress(currentProblem());
  state.selectedChoice = progress?.choice || null;
  state.revealed = Boolean(progress);
  render();
}

function currentProblem() {
  return state.filtered[state.currentIndex] || null;
}

function currentProgress(problem) {
  return problem ? state.progress[problem.id] || null : null;
}

function currentMarks(problem) {
  return problem ? state.marks[problem.id] || {} : {};
}

function answerMatches(problem, choice) {
  return (problem.answer_choices_accepted || []).includes(choice);
}

function setSelected(choice) {
  state.selectedChoice = choice;
  state.revealed = false;
  render();
}

function submitAnswer() {
  const problem = currentProblem();
  if (!problem || !state.selectedChoice) return;
  const correct = answerMatches(problem, state.selectedChoice);
  const previous = state.progress[problem.id] || {};
  state.progress[problem.id] = {
    ...previous,
    choice: state.selectedChoice,
    correct,
    submittedAt: new Date().toISOString(),
    attempts: (previous.attempts || 0) + 1,
    everWrong: Boolean(previous.everWrong || !correct),
  };
  saveAttemptCloud(problem, state.progress[problem.id]);
  state.revealed = true;
  saveProgress();
  render();
}

function revealAnswer() {
  if (!currentProblem()) return;
  state.revealed = true;
  renderProblem();
}

function clearAnswer() {
  const problem = currentProblem();
  if (!problem) return;
  delete state.progress[problem.id];
  state.selectedChoice = null;
  state.revealed = false;
  saveProgress();
  render();
}

function toggleFavorite() {
  const problem = currentProblem();
  if (!problem) return;
  const marks = state.marks[problem.id] || {};
  marks.favorite = !marks.favorite;
  marks.favoriteAt = marks.favorite ? new Date().toISOString() : marks.favoriteAt;
  state.marks[problem.id] = marks;
  saveMarks();
  render();
}

function move(delta) {
  if (!state.filtered.length) return;
  state.currentIndex = Math.max(0, Math.min(state.filtered.length - 1, state.currentIndex + delta));
  const progress = currentProgress(currentProblem());
  state.selectedChoice = progress?.choice || null;
  state.revealed = Boolean(progress);
  render();
}

function chooseRandom() {
  if (!state.filtered.length) return;
  state.currentIndex = Math.floor(Math.random() * state.filtered.length);
  const progress = currentProgress(currentProblem());
  state.selectedChoice = progress?.choice || null;
  state.revealed = Boolean(progress);
  render();
}

function render() {
  renderStats();
  renderList();
  renderProblem();
}

function renderStats() {
  const visible = new Set(state.filtered.map((p) => p.id));
  const progress = Object.entries(state.progress).filter(([id]) => visible.has(id)).map(([, item]) => item);
  els.statTotal.textContent = String(state.filtered.length);
  els.statAnswered.textContent = String(progress.length);
  els.statCorrect.textContent = String(progress.filter((item) => item.correct).length);
  updateMeta();
}

function renderList() {
  els.problemList.innerHTML = "";
  els.listTitle.textContent = `${state.filtered.length} 题 / problems`;
  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "没有匹配题目 / No matching problems";
    els.problemList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  state.filtered.forEach((problem, index) => {
    const button = document.createElement("button");
    const progress = currentProgress(problem);
    const marks = currentMarks(problem);
    button.type = "button";
    button.className = "problem-tile";
    if (index === state.currentIndex) button.classList.add("active");
    if (progress?.correct) button.classList.add("correct");
    if (progress && !progress.correct) button.classList.add("incorrect");
    if (marks.favorite) button.classList.add("favorite");
    button.textContent = `${sectionLabels[problem.section] || problem.section}.${problem.number}`;
    button.title = `${problem.topic} #${problem.number}`;
    button.addEventListener("click", () => {
      state.currentIndex = index;
      const nextProgress = currentProgress(problem);
      state.selectedChoice = nextProgress?.choice || null;
      state.revealed = Boolean(nextProgress);
      render();
    });
    fragment.appendChild(button);
  });
  els.problemList.appendChild(fragment);
}

function textParagraph(text) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}

function renderTextBlock(target, text) {
  target.innerHTML = "";
  const parts = String(text || "").split(/\n{1,}/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts.length ? parts : ["暂无内容 / Not available"]) {
    target.appendChild(textParagraph(part));
  }
}

function renderProblem() {
  const problem = currentProblem();
  if (!problem) {
    els.problemKicker.textContent = "-";
    els.problemTitle.textContent = "没有匹配题目 / No matching problems";
    els.statement.innerHTML = "";
    els.choicePanel.innerHTML = "";
    setAnswerPanel(null);
    return;
  }
  const progress = currentProgress(problem);
  if (!state.selectedChoice && progress?.choice) state.selectedChoice = progress.choice;
  if (progress) state.revealed = true;
  els.problemKicker.textContent = `${problem.topic} · ${problem.section}`;
  els.problemTitle.textContent = `Question ${problem.number} / 第 ${problem.number} 题`;
  renderTextBlock(els.statement, problem.statement);
  renderProblemImage(problem);
  renderChoices(problem, progress);
  setAnswerPanel(problem, progress);
  els.prevProblem.disabled = state.currentIndex === 0;
  els.nextProblem.disabled = state.currentIndex === state.filtered.length - 1;
  els.favoriteProblem.textContent = currentMarks(problem).favorite ? "取消收藏 / Unfavorite" : "收藏 / Favorite";
}

function renderProblemImage(problem) {
  if (!problem.image) return;
  const figure = document.createElement("figure");
  figure.className = "problem-figure";
  const image = document.createElement("img");
  image.src = problem.image;
  image.alt = `${problem.display_name} Question ${problem.number} diagram`;
  image.loading = "lazy";
  const caption = document.createElement("figcaption");
  caption.textContent = "图示 / Diagram from source PDF";
  figure.append(image, caption);
  els.statement.appendChild(figure);
}

function renderChoices(problem, progress) {
  els.choicePanel.innerHTML = "";
  for (const letter of ["A", "B", "C", "D", "E"]) {
    if (!problem.choices?.[letter]) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button";
    if (state.selectedChoice === letter) button.classList.add("selected");
    if (state.revealed || progress) {
      if (answerMatches(problem, letter)) button.classList.add("correct-choice");
      if (state.selectedChoice === letter && !answerMatches(problem, letter)) button.classList.add("wrong-choice");
    }
    const letterSpan = document.createElement("span");
    letterSpan.className = "choice-letter";
    letterSpan.textContent = letter;
    const textSpan = document.createElement("span");
    textSpan.className = "choice-text";
    textSpan.textContent = problem.choices[letter];
    button.append(letterSpan, textSpan);
    button.addEventListener("click", () => setSelected(letter));
    els.choicePanel.appendChild(button);
  }
}

function setAnswerPanel(problem, progress = null) {
  els.answerStatus.className = "answer-status";
  els.answerDetail.innerHTML = "";
  els.problemStatusTags.innerHTML = "";
  els.solutionBody.innerHTML = "";
  if (!problem) {
    els.answerStatus.textContent = "未选择题目 / No problem selected";
    els.solutionStageControl.classList.add("is-hidden");
    return;
  }
  if (progress) {
    els.answerStatus.textContent = progress.correct ? "回答正确 / Correct" : "回答错误 / Incorrect";
    els.answerStatus.classList.add(progress.correct ? "good" : "bad");
  } else if (state.revealed) {
    els.answerStatus.textContent = "已显示答案 / Answer revealed";
    els.answerStatus.classList.add("warn");
  } else {
    els.answerStatus.textContent = "未作答 / Not answered";
  }
  for (const label of [problem.topic, problem.section, problem.image ? "图示题 / Diagram" : "", currentMarks(problem).favorite ? "收藏 / Favorite" : ""]) {
    if (!label) continue;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = label;
    els.problemStatusTags.appendChild(tag);
  }
  const shouldShow = Boolean(state.revealed || progress);
  if (shouldShow) {
    const answer = document.createElement("span");
    answer.textContent = `答案 / Answer: ${problem.answer_choice}`;
    els.answerDetail.appendChild(answer);
    if (problem.answer_value) {
      els.answerDetail.append(` · ${problem.answer_value}`);
    }
  }
  els.solutionStageControl.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    els.solutionBody.appendChild(textParagraph("提交答案后会自动显示解析；作答前也可以点击“看答案/解析”。 / The explanation appears after submission; you may also reveal it before answering."));
  } else {
    const stage = problem.solution_stages?.[state.solutionStage] ? state.solutionStage : "full_calculation";
    els.solutionStageControl.querySelectorAll(".solution-stage-button").forEach((button) => {
      button.classList.toggle("active", button.dataset.stage === stage);
    });
    const source = document.createElement("div");
    source.className = "solution-source-note";
    source.textContent = `${stageLabels[stage]} · 来源 / Source: ${problem.source?.pdf || "LSESU PDF"}`;
    els.solutionBody.appendChild(source);
    const content = document.createElement("div");
    content.className = "solution-stage-content";
    renderTextBlock(content, problem.solution_stages?.[stage] || problem.solution_text);
    els.solutionBody.appendChild(content);
  }
  els.problemSource.textContent = problem.source?.pdf || "PDF 例题 / PDF examples";
}

function problemListFrom(ids) {
  const map = new Map(state.problems.map((p) => [p.id, p]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

function renderCollection(target, problems, emptyText) {
  target.innerHTML = "";
  if (!problems.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyText;
    target.appendChild(empty);
    return;
  }
  for (const problem of problems) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answered-item";
    const progress = currentProgress(problem);
    if (progress?.correct) button.classList.add("correct");
    if (progress && !progress.correct) button.classList.add("incorrect");
    button.innerHTML = `<span><strong>${problem.topic} #${problem.number}</strong><small>${problem.section} · ${progress?.choice ? `你的答案 ${progress.choice}` : "未作答"}</small></span><b>查看 / View</b>`;
    button.addEventListener("click", () => {
      showPractice();
      state.filtered = state.problems.slice();
      state.currentIndex = Math.max(0, state.filtered.findIndex((item) => item.id === problem.id));
      state.selectedChoice = progress?.choice || null;
      state.revealed = true;
      render();
    });
    target.appendChild(button);
  }
}

function renderReview() {
  const answeredIds = Object.keys(state.progress).sort((a, b) => String(state.progress[b].submittedAt).localeCompare(String(state.progress[a].submittedAt)));
  const answered = problemListFrom(answeredIds);
  const mistakes = answered.filter((problem) => state.progress[problem.id] && !state.progress[problem.id].correct);
  const favorites = state.problems.filter((problem) => currentMarks(problem).favorite);
  const correct = answered.filter((problem) => state.progress[problem.id]?.correct).length;
  els.reviewMeta.textContent = answered.length ? `已做 ${answered.length} 题，正确 ${correct} 题 / ${answered.length} answered, ${correct} correct` : "本机还没有保存作答记录 / No local records yet.";
  els.answeredTitle.textContent = `${answered.length} 题 / problems`;
  els.mistakeTitle.textContent = `${mistakes.length} 题 / problems`;
  els.favoriteTitle.textContent = `${favorites.length} 题 / problems`;
  renderCollection(els.answeredList, answered, "还没有已做题目 / No answered problems yet.");
  renderCollection(els.mistakeList, mistakes, "还没有错题 / No mistakes yet.");
  renderCollection(els.favoriteList, favorites, "还没有收藏题 / No favorites yet.");
}

async function init() {
  if (window.LSESU_QUESTION_BANK) {
    state.data = window.LSESU_QUESTION_BANK;
  } else {
    const response = await fetch(DATA_URL);
    state.data = await response.json();
  }
  state.problems = state.data.problems.slice().sort((a, b) => a.section_order - b.section_order || a.number - b.number);
  state.filtered = state.problems.slice();
  initFilters();
  updateMeta();
  showEntry();
  initAuth();
}

els.startPractice.addEventListener("click", showPractice);
els.assignedPracticeMode.addEventListener("click", showAssignments);
els.assignmentRefresh.addEventListener("click", loadAssignments);
els.assignmentToEntry.addEventListener("click", showEntry);
els.reviewMode.addEventListener("click", showReview);
els.aboutMode.addEventListener("click", showAbout);
els.backToEntry.addEventListener("click", showEntry);
els.openReview.addEventListener("click", showReview);
els.openAbout.addEventListener("click", showAbout);
els.reviewToPractice.addEventListener("click", showPractice);
els.reviewToAbout.addEventListener("click", showAbout);
els.reviewToEntry.addEventListener("click", showEntry);
els.aboutToPractice.addEventListener("click", showPractice);
els.aboutToEntry.addEventListener("click", showEntry);
els.topicFilter.addEventListener("change", () => applyFilters(true));
els.difficultyFilter.addEventListener("change", () => applyFilters(true));
els.searchFilter.addEventListener("input", () => applyFilters(true));
els.resetFilters.addEventListener("click", () => {
  els.topicFilter.value = "all";
  els.difficultyFilter.value = "all";
  els.searchFilter.value = "";
  applyFilters();
});
els.randomProblem.addEventListener("click", chooseRandom);
els.submitAnswer.addEventListener("click", submitAnswer);
els.revealAnswer.addEventListener("click", revealAnswer);
els.favoriteProblem.addEventListener("click", toggleFavorite);
els.clearAnswer.addEventListener("click", clearAnswer);
els.prevProblem.addEventListener("click", () => move(-1));
els.nextProblem.addEventListener("click", () => move(1));
els.logoutButton.addEventListener("click", logout);
els.solutionStageControl.querySelectorAll(".solution-stage-button").forEach((button) => {
  button.addEventListener("click", () => {
    state.solutionStage = button.dataset.stage || "idea";
    renderProblem();
  });
});

init().catch((error) => {
  els.entryMeta.textContent = "题库加载失败 / Problem bank failed to load";
  els.datasetMeta.textContent = error.message;
  const hint = document.createElement("p");
  hint.className = "empty";
  hint.textContent = "请确认 index.html 与 app.js 在同一目录，并刷新页面缓存。 / Make sure index.html and app.js are in the same folder, then refresh the page cache.";
  els.entryScreen.querySelector(".entry-copy")?.appendChild(hint);
});
