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
    delay: "时延 ms",
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
  if (!response.ok) throw new Error(`Cannot load ${path}`);
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function number(value, digits = 2) {
  const n = numeric(value);
  if (n === null) return value ?? "";
  return n.toFixed(digits);
}

function signedNumber(value, digits = 2) {
  const n = numeric(value);
  if (n === null) return "";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

function percent(value, digits = 1) {
  const n = numeric(value);
  if (n === null) return value ?? "";
  return `${(n * 100).toFixed(digits)}%`;
}

function signedPercentPoint(value, digits = 1) {
  const n = numeric(value);
  if (n === null) return "";
  const pp = n * 100;
  return `${pp >= 0 ? "+" : ""}${pp.toFixed(digits)} pp`;
}

function cell(row, key, formatter = number) {
  return formatter(row[key]);
}

function mainSafeRow(rows) {
  return rows.find((row) => row.displayMethod === "SAFE-GPINN") || null;
}

function metricCell(row, safeRow, key, options = {}) {
  const {
    formatter = number,
    deltaFormatter = signedNumber,
    higherBetter = true,
    directional = true,
  } = options;
  const value = numeric(row[key]);
  const safeValue = numeric(safeRow?.[key]);
  const main = escapeHtml(formatter(row[key]));
  if (row.displayMethod === "SAFE-GPINN" || value === null || safeValue === null) {
    return `<span class="main-value">${main}</span>`;
  }

  const diff = value - safeValue;
  const epsilon = 1e-9;
  const better = directional && (higherBetter ? value > safeValue + epsilon : value < safeValue - epsilon);
  const worse = directional && (higherBetter ? value < safeValue - epsilon : value > safeValue + epsilon);
  const deltaClass = better ? "delta-better" : worse ? "delta-worse" : "delta-neutral";
  const delta = escapeHtml(deltaFormatter(diff));
  return `<span class="main-value">${main}</span><span class="delta ${deltaClass}">(${delta})</span>`;
}

function percentNumber(value, digits = 2) {
  const n = numeric(value);
  if (n === null) return value ?? "";
  return (n * 100).toFixed(digits);
}

function formatMeanStd(row, key, stdKey, formatter = number, digits = 2) {
  const mean = numeric(row[key]);
  const std = numeric(row[stdKey]);
  if (mean === null) return escapeHtml(row[key] ?? "");
  const meanText = formatter(mean, digits);
  const stdText = std === null ? "" : ` ± ${formatter(std, digits)}`;
  return `${escapeHtml(meanText)}${escapeHtml(stdText)}`;
}

function metricMeanStdCell(row, safeRow, key, stdKey, options = {}) {
  const {
    formatter = number,
    digits = 2,
    deltaFormatter = signedNumber,
    higherBetter = true,
    directional = true,
  } = options;
  const main = formatMeanStd(row, key, stdKey, formatter, digits);
  const value = numeric(row[key]);
  const safeValue = numeric(safeRow?.[key]);
  if (row.displayMethod === "SAFE-GPINN" || value === null || safeValue === null) {
    return `<span class="main-value">${main}</span>`;
  }
  const diff = value - safeValue;
  const epsilon = 1e-9;
  const better = directional && (higherBetter ? value > safeValue + epsilon : value < safeValue - epsilon);
  const worse = directional && (higherBetter ? value < safeValue - epsilon : value > safeValue + epsilon);
  const deltaClass = better ? "delta-better" : worse ? "delta-worse" : "delta-neutral";
  return `<span class="main-value">${main}</span><span class="delta ${deltaClass}">(${escapeHtml(deltaFormatter(diff))})</span>`;
}

function renderTable(table, headers, rows, rowClass = () => "") {
  table.innerHTML = "";
  const thead = document.createElement("thead");
  const tr = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    if (header.htmlLabel) th.innerHTML = header.label;
    else th.textContent = header.label;
    if (header.keyMetric) th.classList.add("key-metric");
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
      if (header.keyMetric) td.classList.add("key-metric");
      const value = header.value(row);
      if (header.html) td.innerHTML = value;
      else td.textContent = value;
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
    "MADDPG",
    "MAPPO",
    "QMIX",
    "VDN",
    "HAPPO/HATRPO",
    "MAT",
    "CQL",
    "TD3",
    "IQL",
    "Diffusion planner",
    "Two-stage MILP",
    "RH-MPC",
    "Greedy",
    "Load-gain",
  ];
  const rows = state.mainRows
    .map((row) => ({ ...row, displayMethod: cleanMethod(row.method) }))
    .filter((row) => methods.some((m) => row.displayMethod.includes(m)))
    .sort(
      (a, b) =>
        methods.findIndex((m) => a.displayMethod.includes(m)) -
        methods.findIndex((m) => b.displayMethod.includes(m))
    );
  const safe = mainSafeRow(rows);
  const table = document.querySelector("#main-table");
  table.innerHTML = "";
  const tbody = document.createElement("tbody");
  const sections = [
    {
      title: state.lang === "zh" ? "电力层" : "Electrical",
      headers: [
        { label: "R ↑", key: "total_reward", std: "total_reward_std", formatter: number, digits: 2, higherBetter: true },
        { label: "FR ↑", key: "full_restoration_rate", std: "full_restoration_rate_std", formatter: number, digits: 2, higherBetter: true },
        { label: "Failed ↓", key: "remaining_failed_edges", std: "remaining_failed_edges_std", formatter: number, digits: 1, higherBetter: false },
        { label: "Served (%) ↑", key: "mean_served_ratio", std: "mean_served_ratio_std", formatter: percentNumber, digits: 2, deltaFormatter: (v) => signedPercentPoint(v, 1), higherBetter: true },
        { label: "<i>E</i><sub>shed</sub> (kWh) ↓", key: "shed_energy_kwh", std: "shed_energy_kwh_std", formatter: number, digits: 2, higherBetter: false, htmlLabel: true },
        { label: "Edges ↑", key: "restored_edges", std: "restored_edges_std", formatter: number, digits: 1, higherBetter: true },
      ],
    },
    {
      title: state.lang === "zh" ? "交通层" : "Transportation",
      headers: [
        { label: "<i>T</i><sub>end</sub> (min) ↓", key: "terminal_time_min", std: "terminal_time_min_std", formatter: number, digits: 2, higherBetter: false, keyMetric: true, htmlLabel: true },
        { label: "Roads", key: "mean_target_traffic_edge_count", std: "mean_target_traffic_edge_count_std", formatter: number, digits: 1, directional: false },
        { label: "Travel (s) ↓", key: "mean_target_travel_time_s", std: "mean_target_travel_time_s_std", formatter: number, digits: 2, higherBetter: false },
        { label: "Robust (s) ↓", key: "mean_target_robust_travel_time_s", std: "mean_target_robust_travel_time_s_std", formatter: number, digits: 2, higherBetter: false },
        { label: "Action (min) ↓", key: "mean_action_duration_min", std: "mean_action_duration_min_std", formatter: number, digits: 2, higherBetter: false },
        { label: "Feas. (%) ↑", key: "traffic_feasible_rate", std: "traffic_feasible_rate_std", formatter: percentNumber, digits: 1, deltaFormatter: (v) => signedPercentPoint(v, 1), higherBetter: true },
      ],
    },
    {
      title: state.lang === "zh" ? "通信层" : "Communication",
      headers: [
        { label: "PDR (%) ↑", key: "mean_packet_delivery_rate", std: "mean_packet_delivery_rate_std", formatter: percentNumber, digits: 2, deltaFormatter: (v) => signedPercentPoint(v, 1), higherBetter: true, keyMetric: true },
        { label: "Delay (ms) ↓", key: "mean_delay_ms", std: "mean_delay_ms_std", formatter: number, digits: 2, higherBetter: false },
        { label: "Ctrl. (%) ↑", key: "control_available_rate", std: "control_available_rate_std", formatter: percentNumber, digits: 1, deltaFormatter: (v) => signedPercentPoint(v, 1), higherBetter: true },
        { label: "Blocked ↓", key: "blocked_attempts", std: "blocked_attempts_std", formatter: number, digits: 1, higherBetter: false },
        { label: "Relay (%)", key: "relay_action_rate", std: "relay_action_rate_std", formatter: percentNumber, digits: 1, deltaFormatter: (v) => signedPercentPoint(v, 1), directional: false },
        { label: "Powered ctrl. (%) ↑", key: "powered_controller_rate", std: "powered_controller_rate_std", formatter: percentNumber, digits: 1, deltaFormatter: (v) => signedPercentPoint(v, 1), higherBetter: true },
      ],
    },
  ];

  sections.forEach((section) => {
    const sectionRow = document.createElement("tr");
    sectionRow.className = "main-section-row";
    sectionRow.innerHTML = `<th colspan="${section.headers.length + 2}">${escapeHtml(section.title)}</th>`;
    tbody.appendChild(sectionRow);

    const headerRow = document.createElement("tr");
    headerRow.className = "main-subheader-row";
    const methodTh = document.createElement("th");
    methodTh.textContent = l.method;
    const classTh = document.createElement("th");
    classTh.textContent = l.class;
    headerRow.append(methodTh, classTh);
    section.headers.forEach((header) => {
      const th = document.createElement("th");
      if (header.htmlLabel) th.innerHTML = header.label;
      else th.textContent = header.label;
      if (header.keyMetric) th.classList.add("key-metric");
      headerRow.appendChild(th);
    });
    tbody.appendChild(headerRow);

    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (row.displayMethod === "SAFE-GPINN") tr.classList.add("highlight");
      const methodTd = document.createElement("td");
      methodTd.textContent = row.displayMethod;
      const classTd = document.createElement("td");
      classTd.textContent = row.category;
      tr.append(methodTd, classTd);
      section.headers.forEach((header) => {
        const td = document.createElement("td");
        if (header.keyMetric) td.classList.add("key-metric");
        td.innerHTML = metricMeanStdCell(row, safe, header.key, header.std, {
          formatter: header.formatter,
          digits: header.digits,
          deltaFormatter: header.deltaFormatter || signedNumber,
          higherBetter: header.higherBetter,
          directional: header.directional !== false,
        });
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
  table.appendChild(tbody);
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
    `<div style="padding:12px;background:#fff4d2;color:#5b4300">Data loading failed: ${escapeHtml(error.message)}</div>`
  );
});
