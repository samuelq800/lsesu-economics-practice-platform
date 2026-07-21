(function competitionAdmin() {
  "use strict";

  const CONTEST = "LSESU";
  const adminState = { profiles: [], attempts: [], assignments: [], draft: [] };
  const els = {
    card: document.querySelector("#competitionAdminCard"), screen: document.querySelector("#competitionAdminScreen"), meta: document.querySelector("#competitionAdminMeta"), refresh: document.querySelector("#competitionAdminRefresh"), export: document.querySelector("#competitionAdminExport"), students: document.querySelector("#competitionAdminStudents"), attempts: document.querySelector("#competitionAdminAttempts"), accuracy: document.querySelector("#competitionAdminAccuracy"), active: document.querySelector("#competitionAdminActive"), student: document.querySelector("#competitionAdminStudent"), topic: document.querySelector("#competitionAdminTopic"), difficulty: document.querySelector("#competitionAdminDifficulty"), from: document.querySelector("#competitionAdminFrom"), to: document.querySelector("#competitionAdminTo"), studentTitle: document.querySelector("#competitionAdminStudentTitle"), studentRows: document.querySelector("#competitionAdminStudentRows"), problemTitle: document.querySelector("#competitionAdminProblemTitle"), problemRows: document.querySelector("#competitionAdminProblemRows"), recentTitle: document.querySelector("#competitionAdminRecentTitle"), recentRows: document.querySelector("#competitionAdminRecentRows"), assignmentTitle: document.querySelector("#competitionAdminAssignmentTitle"), assignmentName: document.querySelector("#competitionAdminAssignmentName"), assignmentDue: document.querySelector("#competitionAdminAssignmentDue"), assignmentProblem: document.querySelector("#competitionAdminAssignmentProblem"), addProblem: document.querySelector("#competitionAdminAddProblem"), assignmentNotes: document.querySelector("#competitionAdminAssignmentNotes"), draft: document.querySelector("#competitionAdminDraft"), publish: document.querySelector("#competitionAdminPublish"), assignmentMessage: document.querySelector("#competitionAdminAssignmentMessage"), assignmentList: document.querySelector("#competitionAdminAssignmentList"),
  };

  const isAdmin = () => state.profile?.role === "admin";
  const percent = (part, total) => total ? `${Math.round(part / total * 100)}%` : "0%";
  const profileFor = (userId) => adminState.profiles.find((profile) => profile.id === userId) || {};
  const problemFor = (problemId) => state.problems.find((problem) => problem.id === problemId);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function dateTime(value) {
    if (!value) return "-";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  }

  function fillSelect(select, rows, label) {
    const previous = select.value;
    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = label;
    select.appendChild(all);
    rows.forEach(([value, text]) => { const option = document.createElement("option"); option.value = value; option.textContent = text; select.appendChild(option); });
    if ([...select.options].some((option) => option.value === previous)) select.value = previous;
  }

  function renderAccess() {
    const hidden = !isAdmin();
    els.card.classList.toggle("is-hidden", hidden);
    document.querySelectorAll(".admin-shortcut").forEach((button) => button.classList.toggle("is-hidden", hidden));
    if (hidden) els.screen.classList.add("is-hidden");
  }

  function filteredAttempts() {
    const from = els.from.value ? new Date(`${els.from.value}T00:00:00`) : null;
    const to = els.to.value ? new Date(`${els.to.value}T23:59:59`) : null;
    return adminState.attempts.filter((attempt) => {
      if (els.student.value !== "all" && attempt.user_id !== els.student.value) return false;
      if (els.topic.value !== "all" && attempt.topic !== els.topic.value) return false;
      if (els.difficulty.value !== "all" && attempt.difficulty !== els.difficulty.value) return false;
      const submitted = new Date(attempt.submitted_at || 0);
      if (from && submitted < from) return false;
      if (to && submitted > to) return false;
      return true;
    });
  }

  function setupFilters() {
    fillSelect(els.student, adminState.profiles.map((profile) => [profile.id, profile.display_name || profile.email || profile.id]), "全部学生 / All Students");
    const topics = [...new Set(adminState.attempts.map((row) => row.topic).filter(Boolean))].sort();
    const difficulties = [...new Set(adminState.attempts.map((row) => row.difficulty).filter(Boolean))].sort();
    fillSelect(els.topic, topics.map((value) => [value, value]), "全部主题 / All Topics");
    fillSelect(els.difficulty, difficulties.map((value) => [value, value]), "全部难度 / All Difficulty");
  }

  function renderDashboard() {
    const attempts = filteredAttempts();
    const correct = attempts.filter((attempt) => attempt.is_correct).length;
    const activeSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
    els.students.textContent = String(adminState.profiles.length);
    els.attempts.textContent = String(attempts.length);
    els.accuracy.textContent = percent(correct, attempts.length);
    els.active.textContent = String(new Set(attempts.filter((attempt) => new Date(attempt.submitted_at).getTime() >= activeSince).map((attempt) => attempt.user_id)).size);
    els.meta.textContent = `当前筛选 ${attempts.length} 条 ${CONTEST} 作答 / Filtered ${CONTEST} activity`;
    const byStudent = new Map(adminState.profiles.map((profile) => [profile.id, { profile, total: 0, correct: 0, last: "" }]));
    attempts.forEach((attempt) => { const row = byStudent.get(attempt.user_id) || { profile: profileFor(attempt.user_id), total: 0, correct: 0, last: "" }; row.total += 1; if (attempt.is_correct) row.correct += 1; if (String(attempt.submitted_at || "") > row.last) row.last = attempt.submitted_at; byStudent.set(attempt.user_id, row); });
    const studentRows = [...byStudent.values()].sort((a, b) => b.total - a.total);
    els.studentTitle.textContent = `${studentRows.length} students`;
    els.studentRows.innerHTML = studentRows.map((row) => `<tr><td>${escapeHtml(row.profile.display_name || "-")}</td><td>${escapeHtml(row.profile.email || "-")}</td><td>${row.total}</td><td>${row.correct}</td><td>${percent(row.correct, row.total)}</td><td>${dateTime(row.last)}</td></tr>`).join("") || '<tr><td colspan="6">暂无学生数据 / No student data</td></tr>';
    const byProblem = new Map();
    attempts.forEach((attempt) => { const row = byProblem.get(attempt.problem_id) || { id: attempt.problem_id, topic: attempt.topic, total: 0, correct: 0 }; row.total += 1; if (attempt.is_correct) row.correct += 1; byProblem.set(attempt.problem_id, row); });
    const problemRows = [...byProblem.values()].sort((a, b) => b.total - a.total);
    els.problemTitle.textContent = `${problemRows.length} problems`;
    els.problemRows.innerHTML = problemRows.map((row) => `<tr><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.topic || "-")}</td><td>${row.total}</td><td>${percent(row.correct, row.total)}</td></tr>`).join("") || '<tr><td colspan="4">暂无题目数据 / No problem data</td></tr>';
    const recent = attempts.slice().sort((a, b) => String(b.submitted_at).localeCompare(String(a.submitted_at))).slice(0, 100);
    els.recentTitle.textContent = `${recent.length} attempts`;
    els.recentRows.innerHTML = recent.map((attempt) => { const profile = profileFor(attempt.user_id); return `<tr><td>${escapeHtml(profile.display_name || profile.email || "Student")}</td><td>${escapeHtml(attempt.problem_id)}</td><td>${escapeHtml(attempt.selected_answer || "-")}</td><td>${escapeHtml(attempt.correct_answer || "-")}</td><td>${attempt.is_correct ? "正确 / Correct" : "错误 / Wrong"}</td><td>${dateTime(attempt.submitted_at)}</td></tr>`; }).join("") || '<tr><td colspan="6">暂无作答记录 / No attempts</td></tr>';
  }

  function fillProblemSelect() {
    els.assignmentProblem.innerHTML = '<option value="">选择题目 / Select a problem</option>';
    state.problems.forEach((problem) => { const option = document.createElement("option"); option.value = problem.id; option.textContent = `${problem.section || problem.topic} #${problem.number} · ${String(problem.statement || "").slice(0, 70)}`; els.assignmentProblem.appendChild(option); });
  }

  function renderDraft() {
    els.draft.innerHTML = "";
    adminState.draft.forEach((problemId) => { const problem = problemFor(problemId); const chip = document.createElement("span"); chip.className = "admin-assignment-chip"; chip.append(document.createTextNode(problem ? `${problem.section || problem.topic} #${problem.number}` : problemId)); const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.addEventListener("click", () => { adminState.draft = adminState.draft.filter((id) => id !== problemId); renderDraft(); }); chip.appendChild(remove); els.draft.appendChild(chip); });
  }

  function renderAssignments() {
    els.assignmentTitle.textContent = `${adminState.assignments.length} assignments`;
    els.assignmentList.innerHTML = adminState.assignments.map((assignment) => `<article class="admin-assignment-item"><div><strong>${escapeHtml(assignment.title || `${CONTEST} Assignment`)}</strong><small>${assignment.problem_ids?.length || 0} 题 · ${assignment.due_at ? `截止 ${dateTime(assignment.due_at)}` : "无截止日期"}</small></div><button type="button" data-assignment-id="${assignment.id}">撤回 / Remove</button></article>`).join("") || '<p class="empty">还没有发布任务 / No assignments yet.</p>';
    els.assignmentList.querySelectorAll("[data-assignment-id]").forEach((button) => button.addEventListener("click", () => deleteAssignment(button.dataset.assignmentId)));
  }

  async function loadAdmin() {
    if (!isAdmin()) return;
    els.meta.textContent = `正在读取 ${CONTEST} 云端数据... / Loading...`;
    const client = cloudClient();
    const [profiles, attempts, assignments] = await Promise.all([client.from("profiles").select("id,email,display_name,role,created_at").order("created_at", { ascending: false }), client.from("attempts").select("id,user_id,problem_id,topic,difficulty,selected_answer,correct_answer,is_correct,submitted_at").eq("contest_type", CONTEST).order("submitted_at", { ascending: false }).limit(5000), client.from("econ_assignments").select("id,title,instructions,problem_ids,due_at,created_at").eq("contest_type", CONTEST).order("created_at", { ascending: false })]);
    const error = profiles.error || attempts.error || assignments.error;
    if (error) { els.meta.textContent = `读取失败 / Failed: ${error.message}`; return; }
    adminState.profiles = profiles.data || []; adminState.attempts = attempts.data || []; adminState.assignments = assignments.data || [];
    setupFilters(); fillProblemSelect(); renderAssignments(); renderDashboard();
  }

  async function publishAssignment() {
    if (!isAdmin() || !adminState.draft.length) { els.assignmentMessage.textContent = "请至少加入一道题目 / Add at least one problem."; return; }
    els.publish.disabled = true; els.assignmentMessage.textContent = "正在发布…… / Publishing...";
    const { error } = await cloudClient().from("econ_assignments").insert({ created_by: state.user.id, target_role: "econclubmembers", contest_type: CONTEST, title: els.assignmentName.value.trim() || `${CONTEST} 练习 · ${new Date().toLocaleDateString("zh-CN")}`, instructions: els.assignmentNotes.value.trim() || null, problem_ids: adminState.draft, due_at: els.assignmentDue.value ? new Date(`${els.assignmentDue.value}T23:59:59`).toISOString() : null });
    els.publish.disabled = false;
    if (error) { els.assignmentMessage.textContent = `发布失败 / Failed: ${error.message}`; return; }
    adminState.draft = []; els.assignmentName.value = ""; els.assignmentNotes.value = ""; els.assignmentDue.value = ""; renderDraft(); els.assignmentMessage.textContent = "任务已发布给 Econ Club / Published."; await loadAdmin();
  }

  async function deleteAssignment(id) { const { error } = await cloudClient().from("econ_assignments").delete().eq("id", id); if (error) { els.assignmentMessage.textContent = `撤回失败 / Failed: ${error.message}`; return; } await loadAdmin(); }
  function showAdmin() { if (!isAdmin()) return; ["entryScreen", "assignmentScreen", "practiceShell", "reviewScreen", "aboutScreen"].forEach((id) => document.querySelector(`#${id}`)?.classList.add("is-hidden")); els.screen.classList.remove("is-hidden"); loadAdmin(); }
  function closeAdmin() { els.screen.classList.add("is-hidden"); document.querySelector("#entryScreen")?.classList.remove("is-hidden"); }
  function exportCsv() { const rows = filteredAttempts(); const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`; const csv = [["student_email", "student_name", "problem_id", "topic", "selected_answer", "correct_answer", "is_correct", "submitted_at"].join(","), ...rows.map((attempt) => { const profile = profileFor(attempt.user_id); return [profile.email, profile.display_name, attempt.problem_id, attempt.topic, attempt.selected_answer, attempt.correct_answer, attempt.is_correct, attempt.submitted_at].map(cell).join(","); })].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `${CONTEST.toLowerCase()}-admin-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url); }

  document.querySelectorAll("[data-open-competition-admin]").forEach((button) => button.addEventListener("click", showAdmin));
  document.querySelectorAll("[data-close-competition-admin]").forEach((button) => button.addEventListener("click", closeAdmin));
  els.refresh.addEventListener("click", loadAdmin); els.export.addEventListener("click", exportCsv);
  [els.student, els.topic, els.difficulty, els.from, els.to].forEach((control) => control.addEventListener("change", renderDashboard));
  els.addProblem.addEventListener("click", () => { const id = els.assignmentProblem.value; if (id && !adminState.draft.includes(id)) adminState.draft.push(id); els.assignmentProblem.value = ""; renderDraft(); });
  els.publish.addEventListener("click", publishAssignment);
  window.renderCompetitionAdminAccess = renderAccess;
  renderAccess();
}());
