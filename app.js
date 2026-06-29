const state = {
  lang: "en",
  mainRows: [],
  ablationRows: [],
  robustnessRows: [],
};

const labels = {
  en: {
    method: "Method",
    class: "Class",
    reward: "Reward",
    fr: "FR",
    terminal: "Terminal min",
    served: "Served",
    shed: "Shed kWh",
    pdr: "PDR",
    delay: "Delay ms",
    powered: "Powered ctrl",
    restored: "Restored",
    blocked: "Blocked",
    multiplier: "Travel x",
  },
  zh: {
    method: "方法",
    class: "类别",
    reward: "奖励",
    fr: "全恢复率",
    terminal: "终止时间 min",
    served: "服务率",
    shed: "弃供 kWh",
    pdr: "包交付率",
    delay: "延迟 ms",
    powered: "带电控制器",
    restored: "恢复边",
    blocked: "阻塞",
    multiplier: "交通倍率",
  },
};

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quote && next === '"') {
      cell += '"';
      i += 1;
    } else if (ch === '"') {
      quote = !quote;
    } else if (ch === "," && !quote) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quote) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [headers, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]))
  );
}

async function loadCSV(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Cannot load ${path}`);
  }
  return parseCSV(await response.text());
}

function cleanMethod(name) {
  return String(name || "")
    .replace(/~\\cite\{[^}]+\}/g, "")
    .replace("SAFE full current", "SAFE-GPINN")
    .replace("SAFE no controlled predeploy", "w/o controlled predeployment")
    .replace("SAFE no dual channel", "w/o dual channel")
    .replace("SAFE no direct override", "w/o direct override")
    .replace("SAFE no late reward gate", "w/o late reward gate")
    .trim();
}

function number(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value ?? "";
  return n.toFixed(digits);
}

function percent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value ?? "";
  return `${(n * 100).toFixed(digits)}%`;
}

function cell(row, key, formatter = number) {
  return formatter(row[key]);
}

function renderTable(table, headers, rows, rowClass = () => "") {
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header.label;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => {
    const bodyTr = document.createElement("tr");
    const klass = rowClass(row);
    if (klass) bodyTr.className = klass;
    headers.forEach((header) => {
      const td = document.createElement("td");
      td.textContent = header.value(row);
      bodyTr.appendChild(td);
    });
    tbody.appendChild(bodyTr);
  });
  table.append(thead, tbody);
}

function renderMainTable() {
  const l = labels[state.lang];
  const methods = [
    "SAFE-GPINN",
    "RH-MPC",
    "Diffusion planner",
    "Two-stage MILP",
    "IQL",
    "TD3",
    "CQL",
    "QMIX",
    "MAPPO",
    "MADDPG",
    "Greedy",
    "Load-gain",
  ];
  const rows = state.mainRows
    .map((row) => ({ ...row, displayMethod: cleanMethod(row.method) }))
    .filter((row) => methods.some((m) => row.displayMethod.includes(m)))
    .sort((a, b) => methods.findIndex((m) => a.displayMethod.includes(m)) - methods.findIndex((m) => b.displayMethod.includes(m)));
  renderTable(
    document.querySelector("#main-table"),
    [
      { label: l.method, value: (r) => r.displayMethod },
      { label: l.class, value: (r) => r.category },
      { label: l.reward, value: (r) => cell(r, "total_reward") },
      { label: l.fr, value: (r) => percent(r.full_restoration_rate, 0) },
      { label: l.terminal, value: (r) => cell(r, "terminal_time_min") },
      { label: l.served, value: (r) => percent(r.mean_served_ratio, 1) },
      { label: l.shed, value: (r) => cell(r, "shed_energy_kwh") },
      { label: l.pdr, value: (r) => percent(r.mean_packet_delivery_rate, 1) },
      { label: l.delay, value: (r) => cell(r, "mean_delay_ms") },
      { label: l.powered, value: (r) => percent(r.powered_controller_rate, 1) },
    ],
    rows,
    (row) => (row.displayMethod === "SAFE-GPINN" ? "highlight" : "")
  );
}

function renderAblationTable() {
  const l = labels[state.lang];
  const keep = [
    "safe_gpinn__full_current",
    "safe_gpinn__no_controlled_predeployment",
    "safe_gpinn__no_dual_channel",
    "safe_gpinn__no_direct_restore_override",
    "safe_gpinn__no_late_reward_gate",
  ];
  const rows = state.ablationRows
    .filter((row) => keep.includes(row.method_key))
    .map((row) => ({ ...row, displayMethod: cleanMethod(row.method) }));
  renderTable(
    document.querySelector("#ablation-table"),
    [
      { label: l.method, value: (r) => r.displayMethod },
      { label: l.reward, value: (r) => cell(r, "total_reward") },
      { label: l.shed, value: (r) => cell(r, "shed_energy_kwh") },
      { label: l.pdr, value: (r) => percent(r.mean_packet_delivery_rate, 1) },
      { label: l.delay, value: (r) => cell(r, "mean_delay_ms") },
      { label: l.powered, value: (r) => percent(r.powered_controller_rate, 1) },
    ],
    rows,
    (row) => (row.method_key === "safe_gpinn__full_current" ? "highlight" : "")
  );
}

function renderRobustnessTable() {
  const l = labels[state.lang];
  const rows = state.robustnessRows
    .map((row) => ({ ...row, displayMethod: cleanMethod(row.method) }))
    .filter((row) => row.displayMethod === "SAFE-GPINN" || row.displayMethod === "RH-MPC");
  renderTable(
    document.querySelector("#robustness-table"),
    [
      { label: l.multiplier, value: (r) => number(r.robust_travel_time_multiplier, 2) },
      { label: l.method, value: (r) => r.displayMethod },
      { label: l.reward, value: (r) => cell(r, "total_reward") },
      { label: l.fr, value: (r) => percent(r.full_restoration_rate, 0) },
      { label: l.restored, value: (r) => number(r.restored_edges, 0) },
      { label: l.blocked, value: (r) => number(r.blocked_attempts, 0) },
    ],
    rows,
    (row) => (row.displayMethod === "SAFE-GPINN" ? "highlight" : "")
  );
}

function renderAllTables() {
  renderMainTable();
  renderAblationTable();
  renderRobustnessTable();
}

function setLanguage(lang) {
  state.lang = lang;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-en][data-zh]").forEach((node) => {
    node.textContent = node.dataset[lang];
  });
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === lang);
  });
  renderAllTables();
}

async function init() {
  const [mainRows, ablationRows, robustnessRows] = await Promise.all([
    loadCSV("assets/data/main_table.csv"),
    loadCSV("assets/data/ablation_table.csv"),
    loadCSV("assets/data/robustness_table.csv"),
  ]);
  state.mainRows = mainRows;
  state.ablationRows = ablationRows;
  state.robustnessRows = robustnessRows;
  document.querySelectorAll(".lang-btn").forEach((button) => {
    button.addEventListener("click", () => setLanguage(button.dataset.lang));
  });
  setLanguage("en");
}

init().catch((error) => {
  console.error(error);
  document.body.insertAdjacentHTML(
    "afterbegin",
    `<div style="padding:12px;background:#fff4d2;color:#5b4300">Data loading failed: ${error.message}</div>`
  );
});

