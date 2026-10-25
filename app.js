/**
 * WorkTime Tracker - Interactive Monthly Work Hours Management
 */

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const DAY_NAMES = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

const DAY_TYPES = {
  "Р": { label: "Р (Рабочий)", norm: 8.0, cssClass: "badge-work", rowClass: "" },
  "ПР": { label: "ПР (Предпразд.)", norm: 7.0, cssClass: "badge-short", rowClass: "row-short" },
  "В": { label: "В (Выходной)", norm: 0.0, cssClass: "badge-weekend", rowClass: "row-weekend" },
  "П": { label: "П (Праздник)", norm: 0.0, cssClass: "badge-holiday", rowClass: "row-holiday" },
  "О": { label: "О (Отпуск)", norm: 0.0, cssClass: "badge-vacation", rowClass: "row-vacation" },
  "Б": { label: "Б (Больничный)", norm: 0.0, cssClass: "badge-sick", rowClass: "row-sick" }
};

const DEFAULT_SETTINGS = {
  workHours: 8.0,
  shortHours: 7.0,
  defaultStart: "09:00",
  defaultEnd: "18:00",
  defaultLunch: 1.0
};

class WorkTimeTracker {
  constructor() {
    this.currentDate = new Date();
    this.currentYear = this.currentDate.getFullYear();
    this.currentMonth = this.currentDate.getMonth() + 1; // 1-12
    
    this.settings = this.loadSettings();
    this.storageKey = "worktime_tracker_data";

    this.initDOM();
    this.bindEvents();
    this.render();

    // Refresh the "today" card every 30s so an open shift ticks up live
    setInterval(() => this.updateTodayDelta(), 30000);
  }

  loadSettings() {
    try {
      const saved = localStorage.getItem("worktime_tracker_settings");
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    } catch (e) {
      console.warn("Failed to load settings:", e);
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    DAY_TYPES["Р"].norm = this.settings.workHours;
    DAY_TYPES["ПР"].norm = this.settings.shortHours;
    try {
      localStorage.setItem("worktime_tracker_settings", JSON.stringify(this.settings));
    } catch (e) {
      console.error("Storage error:", e);
    }
  }

  getMonthKey(year = this.currentYear, month = this.currentMonth) {
    return `${year}-${String(month).padStart(2, "0")}`;
  }

  getAllData() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error("Error reading storage:", e);
      return {};
    }
  }

  getMonthData(year = this.currentYear, month = this.currentMonth) {
    const all = this.getAllData();
    const key = this.getMonthKey(year, month);
    return all[key] || {};
  }

  saveMonthData(monthData, year = this.currentYear, month = this.currentMonth) {
    const all = this.getAllData();
    const key = this.getMonthKey(year, month);
    all[key] = monthData;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(all));
    } catch (e) {
      console.error("Error saving data:", e);
    }
  }

  initDOM() {
    this.monthSelect = document.getElementById("month-select");
    this.yearInput = document.getElementById("year-input");
    this.prevMonthBtn = document.getElementById("prev-month-btn");
    this.nextMonthBtn = document.getElementById("next-month-btn");
    this.todayBtn = document.getElementById("today-btn");
    
    this.tbody = document.getElementById("timesheet-tbody");
    
    // KPI elements
    this.kpiPlan = document.getElementById("kpi-plan");
    this.kpiPlanDays = document.getElementById("kpi-plan-days");
    this.kpiFact = document.getElementById("kpi-fact");
    this.kpiFactDays = document.getElementById("kpi-fact-days");
    this.kpiDelta = document.getElementById("kpi-delta");
    this.kpiDeltaStatus = document.getElementById("kpi-delta-status");
    this.kpiProgressPct = document.getElementById("kpi-progress-pct");
    this.kpiProgressBar = document.getElementById("kpi-progress-bar");
    
    // "Delta as of today" card
    this.kpiTodayDelta = document.getElementById("kpi-today-delta");
    this.kpiTodayStatus = document.getElementById("kpi-today-status");
    this.kpiTodayDetail = document.getElementById("kpi-today-detail");

    // Totals
    this.totalFact = document.getElementById("total-fact");
    this.totalPlan = document.getElementById("total-plan");
    this.totalDelta = document.getElementById("total-delta");
    
    // Populate month options
    this.monthSelect.innerHTML = "";
    MONTH_NAMES.forEach((name, idx) => {
      const opt = document.createElement("option");
      opt.value = idx + 1;
      opt.textContent = name;
      this.monthSelect.appendChild(opt);
    });

    this.monthSelect.value = this.currentMonth;
    this.yearInput.value = this.currentYear;
  }

  bindEvents() {
    this.monthSelect.addEventListener("change", (e) => {
      this.currentMonth = parseInt(e.target.value, 10);
      this.render();
    });

    this.yearInput.addEventListener("change", (e) => {
      const val = parseInt(e.target.value, 10);
      if (val >= 2000 && val <= 2100) {
        this.currentYear = val;
        this.render();
      }
    });

    this.prevMonthBtn.addEventListener("click", () => this.changeMonth(-1));
    this.nextMonthBtn.addEventListener("click", () => this.changeMonth(1));
    this.todayBtn.addEventListener("click", () => {
      const now = new Date();
      this.currentYear = now.getFullYear();
      this.currentMonth = now.getMonth() + 1;
      this.monthSelect.value = this.currentMonth;
      this.yearInput.value = this.currentYear;
      this.render();
    });

    // Toolbar actions
    document.getElementById("fill-defaults-btn").addEventListener("click", () => this.fillDefaults());
    document.getElementById("clear-month-btn").addEventListener("click", () => this.clearMonth());
    document.getElementById("export-csv-btn").addEventListener("click", () => this.exportCSV());
    document.getElementById("backup-btn").addEventListener("click", () => this.backupJSON());
    document.getElementById("import-json-input").addEventListener("change", (e) => this.importJSON(e));
    document.getElementById("print-btn").addEventListener("click", () => window.print());

    // Settings Modal
    const modal = document.getElementById("settings-modal");
    document.getElementById("settings-btn").addEventListener("click", () => {
      document.getElementById("setting-work-hours").value = this.settings.workHours;
      document.getElementById("setting-short-hours").value = this.settings.shortHours;
      document.getElementById("setting-default-start").value = this.settings.defaultStart;
      document.getElementById("setting-default-end").value = this.settings.defaultEnd;
      document.getElementById("setting-default-lunch").value = this.settings.defaultLunch;
      modal.style.display = "flex";
    });

    document.getElementById("settings-close-btn").addEventListener("click", () => {
      modal.style.display = "none";
    });

    document.getElementById("settings-save-btn").addEventListener("click", () => {
      this.saveSettings({
        workHours: parseFloat(document.getElementById("setting-work-hours").value) || 8.0,
        shortHours: parseFloat(document.getElementById("setting-short-hours").value) || 7.0,
        defaultStart: document.getElementById("setting-default-start").value || "09:00",
        defaultEnd: document.getElementById("setting-default-end").value || "18:00",
        defaultLunch: parseFloat(document.getElementById("setting-default-lunch").value) || 1.0
      });
      modal.style.display = "none";
      this.render();
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  changeMonth(delta) {
    let m = this.currentMonth + delta;
    let y = this.currentYear;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    this.currentMonth = m;
    this.currentYear = y;
    this.monthSelect.value = m;
    this.yearInput.value = y;
    this.render();
  }

  getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  }

  calcFactHours(startStr, endStr, lunchHours) {
    if (!startStr || !endStr) return 0;
    const [sh, sm] = startStr.split(":").map(Number);
    const [eh, em] = endStr.split(":").map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
    
    let startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin < startMin) endMin += 1440; // Midnight rollover
    
    const lunchMin = Math.round((lunchHours || 0) * 60);
    const workedMin = Math.max(0, endMin - startMin - lunchMin);
    return Math.round((workedMin / 60) * 100) / 100;
  }

  render() {
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const monthData = this.getMonthData();

    this.tbody.innerHTML = "";
    let totalPlan = 0;
    let totalFact = 0;
    let plannedDaysCount = 0;
    let workedDaysCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
      const dayOfWeekIdx = dateObj.getDay(); // 0 is Sun, 6 is Sat
      const dayOfWeekName = DAY_NAMES[dayOfWeekIdx];
      const isWeekend = dayOfWeekIdx === 0 || dayOfWeekIdx === 6;

      const record = monthData[day] || {
        type: isWeekend ? "В" : "Р",
        start: "",
        end: "",
        lunch: isWeekend ? 0 : this.settings.defaultLunch,
        notes: ""
      };

      const typeMeta = DAY_TYPES[record.type] || DAY_TYPES["Р"];
      const planHours = typeMeta.norm;
      const factHours = this.calcFactHours(record.start, record.end, record.lunch);
      const deltaHours = Math.round((factHours - planHours) * 100) / 100;

      totalPlan += planHours;
      totalFact += factHours;
      if (planHours > 0) plannedDaysCount++;
      if (factHours > 0) workedDaysCount++;

      const tr = document.createElement("tr");
      if (typeMeta.rowClass) {
        tr.className = typeMeta.rowClass;
      } else if (isWeekend && record.type === "В") {
        tr.className = "row-weekend";
      }

      if (this.isToday(this.currentYear, this.currentMonth, day)) {
        tr.classList.add("row-today");
        tr.id = "row-today";
      }

      const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}`;
      const deltaSign = deltaHours > 0 ? "+" : "";
      const deltaClass = deltaHours > 0 ? "positive" : (deltaHours < 0 ? "negative" : "zero");

      tr.innerHTML = `
        <td class="col-num">${day}</td>
        <td class="col-date">${dateFormatted}</td>
        <td class="col-day">${dayOfWeekName}</td>
        <td class="col-type">
          <select class="table-input type-select" data-day="${day}" data-field="type">
            ${Object.keys(DAY_TYPES).map(k => `
              <option value="${k}" ${record.type === k ? "selected" : ""}>${k}</option>
            `).join("")}
          </select>
        </td>
        <td class="col-time">
          <input type="time" class="table-input time-input" data-day="${day}" data-field="start" value="${record.start || ""}">
        </td>
        <td class="col-time">
          <input type="time" class="table-input time-input" data-day="${day}" data-field="end" value="${record.end || ""}">
        </td>
        <td class="col-lunch">
          <input type="number" class="table-input lunch-input" data-day="${day}" data-field="lunch" min="0" max="6" step="0.25" value="${record.lunch !== undefined ? record.lunch : ""}">
        </td>
        <td class="col-hours text-right">${factHours > 0 ? factHours.toFixed(2) : "-"}</td>
        <td class="col-hours text-right">${planHours > 0 ? planHours.toFixed(2) : "-"}</td>
        <td class="col-delta text-right">
          <span class="delta-tag ${deltaClass}">${deltaSign}${deltaHours.toFixed(2)}</span>
        </td>
        <td class="col-notes">
          <input type="text" class="table-input" data-day="${day}" data-field="notes" placeholder="Задачи, проекты..." value="${record.notes || ""}">
        </td>
        <td class="col-actions">
          <button class="row-clear-btn" data-day="${day}" title="Очистить день">✕</button>
        </td>
      `;

      this.tbody.appendChild(tr);
    }

    this.updateKPIs(totalPlan, totalFact, plannedDaysCount, workedDaysCount);
    this.updateTodayDelta(monthData);
    this.bindTableInputs();
  }

  isToday(year, month, day) {
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
  }

  /** Default (empty) record for a day, same as used when rendering. */
  getDefaultRecord(year, month, day) {
    const dow = new Date(year, month - 1, day).getDay();
    const isWeekend = dow === 0 || dow === 6;
    return {
      type: isWeekend ? "В" : "Р",
      start: "",
      end: "",
      lunch: isWeekend ? 0 : this.settings.defaultLunch,
      notes: ""
    };
  }

  /**
   * Cumulative balance "as of today".
   *
   * Rules:
   *  - viewed month is in the future  -> nothing to compare yet;
   *  - viewed month is in the past    -> whole month (equals monthly balance);
   *  - viewed month is the current one -> days 1..today:
   *      * past days count fully (plan vs fact);
   *      * today with start but no end is "live": end = current time;
   *      * today with no start yet is NOT counted in plan
   *        (otherwise the morning balance would always be -8h).
   */
  computeTodayStats(monthData = this.getMonthData()) {
    const now = new Date();
    const nowIdx = now.getFullYear() * 12 + now.getMonth();
    const viewIdx = this.currentYear * 12 + (this.currentMonth - 1);

    if (viewIdx > nowIdx) return { state: "future" };

    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const isCurrent = viewIdx === nowIdx;
    const lastDay = isCurrent ? now.getDate() : daysInMonth;
    const nowStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    let plan = 0;
    let fact = 0;
    let live = false;
    let today = null;

    for (let day = 1; day <= lastDay; day++) {
      const rec = monthData[day] || this.getDefaultRecord(this.currentYear, this.currentMonth, day);
      const dayPlan = (DAY_TYPES[rec.type] || DAY_TYPES["Р"]).norm;
      const isTodayRow = isCurrent && day === lastDay;

      if (isTodayRow) {
        const started = !!rec.start;
        const ended = !!rec.end;
        let dayFact;
        if (started && !ended) {
          live = true;
          dayFact = this.calcFactHours(rec.start, nowStr, rec.lunch);
        } else {
          dayFact = this.calcFactHours(rec.start, rec.end, rec.lunch);
        }
        const counted = started || dayFact > 0 || dayPlan === 0;
        today = { plan: dayPlan, fact: dayFact, started, ended, counted };
        if (counted) plan += dayPlan;
        fact += dayFact;
      } else {
        plan += dayPlan;
        fact += this.calcFactHours(rec.start, rec.end, rec.lunch);
      }
    }

    plan = Math.round(plan * 100) / 100;
    fact = Math.round(fact * 100) / 100;
    return {
      state: isCurrent ? "current" : "past",
      plan, fact,
      delta: Math.round((fact - plan) * 100) / 100,
      live, today
    };
  }

  updateTodayDelta(monthData) {
    const s = this.computeTodayStats(monthData);
    const fmt = (v) => (v > 0 ? "+" : "") + v.toFixed(2);

    if (s.state === "future") {
      this.kpiTodayDelta.textContent = "—";
      this.kpiTodayDelta.className = "";
      this.kpiTodayStatus.textContent = "Месяц ещё не начался";
      this.kpiTodayDetail.textContent = "";
      return;
    }

    this.kpiTodayDelta.textContent = fmt(s.delta);
    this.kpiTodayDelta.className = s.delta > 0 ? "delta-plus" : (s.delta < 0 ? "delta-minus" : "");

    const liveDot = s.live ? '<span class="kpi-live-dot"></span>' : "";
    const word = s.delta > 0 ? "Опережение" : (s.delta < 0 ? "Отставание" : "Идёшь строго по плану");
    const scope = s.state === "current" ? "на сегодня" : "за весь месяц";
    this.kpiTodayStatus.innerHTML = `${liveDot}${word} ${scope}`;

    const parts = [`Факт ${s.fact.toFixed(2)} ч из ${s.plan.toFixed(2)} ч`];
    if (s.today) {
      const t = s.today;
      if (t.plan > 0) {
        if (!t.started) {
          parts.push(`сегодня не начато (норма ${t.plan.toFixed(2)} ч)`);
        } else {
          const left = Math.round((t.plan - t.fact) * 100) / 100;
          parts.push(left > 0
            ? `сегодня ещё ${left.toFixed(2)} ч до нормы`
            : `сегодня норма выполнена (${fmt(-left)} ч)`);
        }
      } else {
        parts.push("сегодня нерабочий день");
      }
    }
    this.kpiTodayDetail.textContent = parts.join(" • ");
  }

  bindTableInputs() {
    const inputs = this.tbody.querySelectorAll("input, select");
    inputs.forEach(input => {
      input.addEventListener("change", (e) => this.handleFieldChange(e));
    });

    const clearBtns = this.tbody.querySelectorAll(".row-clear-btn");
    clearBtns.forEach(btn => {
      btn.addEventListener("click", (e) => {
        const day = e.currentTarget.getAttribute("data-day");
        this.clearDay(parseInt(day, 10));
      });
    });
  }

  handleFieldChange(e) {
    const target = e.target;
    const day = parseInt(target.getAttribute("data-day"), 10);
    const field = target.getAttribute("data-field");
    let val = target.value;

    if (field === "lunch") {
      val = val === "" ? 0 : parseFloat(val);
    }

    const monthData = this.getMonthData();
    if (!monthData[day]) {
      const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      monthData[day] = {
        type: isWeekend ? "В" : "Р",
        start: "",
        end: "",
        lunch: isWeekend ? 0 : this.settings.defaultLunch,
        notes: ""
      };
    }

    monthData[day][field] = val;

    // Automatic adjustment of lunch if start is entered and lunch was empty
    if (field === "start" && val && (!monthData[day].lunch && monthData[day].lunch !== 0)) {
      monthData[day].lunch = this.settings.defaultLunch;
    }

    this.saveMonthData(monthData);
    this.render();
  }

  clearDay(day) {
    const monthData = this.getMonthData();
    const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

    monthData[day] = {
      type: isWeekend ? "В" : "Р",
      start: "",
      end: "",
      lunch: isWeekend ? 0 : this.settings.defaultLunch,
      notes: ""
    };

    this.saveMonthData(monthData);
    this.render();
  }

  fillDefaults() {
    const monthData = this.getMonthData();
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);

    let filledCount = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
      
      const record = monthData[day] || {
        type: isWeekend ? "В" : "Р",
        start: "",
        end: "",
        lunch: isWeekend ? 0 : this.settings.defaultLunch,
        notes: ""
      };

      if (record.type === "Р" && (!record.start || !record.end)) {
        record.start = this.settings.defaultStart;
        record.end = this.settings.defaultEnd;
        record.lunch = this.settings.defaultLunch;
        filledCount++;
      } else if (record.type === "ПР" && (!record.start || !record.end)) {
        record.start = this.settings.defaultStart;
        // 1 hour earlier
        const [sh, sm] = this.settings.defaultStart.split(":").map(Number);
        const endH = sh + (this.settings.shortHours + this.settings.defaultLunch);
        record.end = `${String(Math.floor(endH)).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
        record.lunch = this.settings.defaultLunch;
        filledCount++;
      }

      monthData[day] = record;
    }

    this.saveMonthData(monthData);
    this.render();
  }

  clearMonth() {
    if (confirm(`Вы уверены, что хотите полностью очистить табель за ${MONTH_NAMES[this.currentMonth - 1]} ${this.currentYear}?`)) {
      this.saveMonthData({});
      this.render();
    }
  }

  updateKPIs(totalPlan, totalFact, plannedDays, workedDays) {
    const delta = Math.round((totalFact - totalPlan) * 100) / 100;
    const progress = totalPlan > 0 ? Math.round((totalFact / totalPlan) * 1000) / 10 : 0;

    this.kpiPlan.textContent = totalPlan.toFixed(2);
    this.kpiPlanDays.textContent = `Норма: ${plannedDays} раб. дней`;

    this.kpiFact.textContent = totalFact.toFixed(2);
    this.kpiFactDays.textContent = `Отработано дней: ${workedDays}`;

    const deltaSign = delta > 0 ? "+" : "";
    this.kpiDelta.textContent = `${deltaSign}${delta.toFixed(2)}`;
    
    if (delta > 0) {
      this.kpiDelta.className = "delta-plus";
      this.kpiDeltaStatus.textContent = `Переработка: +${delta.toFixed(2)} ч`;
    } else if (delta < 0) {
      this.kpiDelta.className = "delta-minus";
      this.kpiDeltaStatus.textContent = `Недоработка: ${delta.toFixed(2)} ч`;
    } else {
      this.kpiDelta.className = "";
      this.kpiDeltaStatus.textContent = "В пределах нормы (баланс 0.00)";
    }

    this.kpiProgressPct.textContent = `${progress.toFixed(1)}%`;
    this.kpiProgressBar.style.width = `${Math.min(100, progress)}%`;
    if (progress >= 100) {
      this.kpiProgressBar.style.backgroundColor = "var(--color-success)";
    } else {
      this.kpiProgressBar.style.backgroundColor = "var(--color-primary)";
    }

    // Totals
    this.totalFact.textContent = `${totalFact.toFixed(2)} ч`;
    this.totalPlan.textContent = `${totalPlan.toFixed(2)} ч`;
    this.totalDelta.textContent = `${deltaSign}${delta.toFixed(2)} ч`;
    this.totalDelta.className = `text-right ${delta > 0 ? "delta-plus" : (delta < 0 ? "delta-minus" : "")}`;
  }

  exportCSV() {
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const monthData = this.getMonthData();

    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel
    csvContent += "№;Дата;День;Тип;Начало;Конец;Обед(ч);Факт(ч);План(ч);Дельта(ч);Примечания\r\n";

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
      const dayOfWeekName = DAY_NAMES[dateObj.getDay()];
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      const record = monthData[day] || {
        type: isWeekend ? "В" : "Р",
        start: "",
        end: "",
        lunch: isWeekend ? 0 : this.settings.defaultLunch,
        notes: ""
      };

      const plan = DAY_TYPES[record.type] ? DAY_TYPES[record.type].norm : 0;
      const fact = this.calcFactHours(record.start, record.end, record.lunch);
      const delta = Math.round((fact - plan) * 100) / 100;
      const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}.${this.currentYear}`;

      const row = [
        day,
        dateFormatted,
        dayOfWeekName,
        record.type,
        record.start || "",
        record.end || "",
        record.lunch || 0,
        fact.toFixed(2),
        plan.toFixed(2),
        delta.toFixed(2),
        `"${(record.notes || "").replace(/"/g, '""')}"`
      ];

      csvContent += row.join(";") + "\r\n";
    }

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worktime_${this.getMonthKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  backupJSON() {
    const allData = this.getAllData();
    const backupObj = {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: this.settings,
      data: allData
    };

    const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `worktime_tracker_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed && parsed.data) {
          if (confirm("Импортировать данные? Существующие записи будут объединены.")) {
            const current = this.getAllData();
            const merged = { ...current, ...parsed.data };
            localStorage.setItem(this.storageKey, JSON.stringify(merged));
            if (parsed.settings) {
              this.saveSettings(parsed.settings);
            }
            alert("Данные успешно импортированы!");
            this.render();
          }
        } else {
          alert("Неверный формат файла бэкапа.");
        }
      } catch (err) {
        alert("Ошибка при чтении файла JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.tracker = new WorkTimeTracker();
});
