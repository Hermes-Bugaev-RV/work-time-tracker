/**
 * WorkTime Tracker - Interactive Monthly Work Hours Management
 */

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
];

const MONTH_NAMES_GENITIVE = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря"
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

/**
 * Чистые вспомогательные функции для задач, заметок и журнала.
 * Вынесены отдельно, чтобы их можно было тестировать без браузера.
 */
const WorkTimeHelpers = {
  // Экранирование HTML-спецсимволов перед вставкой в шаблоны
  escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  // Подсветка найденного фрагмента на уже экранированном тексте
  highlightText(str, query) {
    const safe = WorkTimeHelpers.escapeHtml(str);
    const trimmed = String(query ?? "").trim();
    if (!trimmed) return safe;
    const escapedQuery = WorkTimeHelpers.escapeHtml(trimmed)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return safe.replace(new RegExp(`(${escapedQuery})`, "gi"), '<mark class="journal-highlight">$1</mark>');
  },

  generateTaskId() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  },

  // Приведение массива задач к безопасному виду (совместимость со старыми данными)
  normalizeTasks(rawTasks) {
    if (!Array.isArray(rawTasks)) return [];
    return rawTasks
      .filter((t) => t && typeof t.text === "string" && t.text.trim().length > 0)
      .map((t, idx) => ({
        id: typeof t.id === "string" && t.id ? t.id : `t_legacy_${idx}`,
        text: t.text.trim(),
        done: Boolean(t.done)
      }));
  },

  normalizeDayRecord(rec, defaultRec) {
    const base = { ...defaultRec, ...(rec || {}) };
    return {
      ...base,
      notes: typeof base.notes === "string" ? base.notes : "",
      tasks: WorkTimeHelpers.normalizeTasks(base.tasks)
    };
  },

  // Сводка по задачам и заметке одного дня для превью в строке/карточке
  summarizeDayContent(record) {
    const tasks = WorkTimeHelpers.normalizeTasks(record && record.tasks);
    const notes = typeof (record && record.notes) === "string" ? record.notes : "";
    const trimmedNotes = notes.trim();
    const totalTasks = tasks.length;
    const doneTasks = tasks.filter((t) => t.done).length;
    const openTasks = totalTasks - doneTasks;
    const hasNotes = trimmedNotes.length > 0;
    const isEmpty = totalTasks === 0 && !hasNotes;

    let previewText = "";
    if (totalTasks > 0) {
      previewText = tasks.map((t) => `${t.done ? "✓" : "○"} ${t.text}`).join(" · ");
    } else if (hasNotes) {
      previewText = trimmedNotes.replace(/\s+/g, " ");
    }

    return { totalTasks, doneTasks, openTasks, hasNotes, isEmpty, previewText };
  },

  // Форматирование задач и заметок дня в многострочный текст (CSV / печать)
  formatDayNotesForExport(record) {
    const tasks = WorkTimeHelpers.normalizeTasks(record && record.tasks);
    const notes = typeof (record && record.notes) === "string" ? record.notes.trim() : "";
    const lines = tasks.map((t) => `${t.done ? "[x]" : "[ ]"} ${t.text}`);
    if (notes) {
      if (lines.length > 0) lines.push("");
      lines.push(notes);
    }
    return lines.join("\n");
  },

  // Фильтрация, поиск и сортировка записей журнала за месяц
  filterJournalEntries(entries, { query = "", filter = "all", sortOrder = "asc" } = {}) {
    const q = String(query ?? "").trim().toLowerCase();

    const filtered = entries.filter((entry) => {
      const summary = WorkTimeHelpers.summarizeDayContent(entry.record);
      if (summary.isEmpty) return false;

      if (filter === "open" && summary.openTasks === 0) return false;
      if (filter === "done" && summary.doneTasks === 0) return false;
      if (filter === "notes" && !summary.hasNotes) return false;

      if (q) {
        const inDate = entry.dateFormatted.toLowerCase().includes(q) ||
          entry.dayOfWeekName.toLowerCase().includes(q);
        const inNotes = (entry.record.notes || "").toLowerCase().includes(q);
        const inTasks = (entry.record.tasks || []).some((t) => t.text.toLowerCase().includes(q));
        if (!inDate && !inNotes && !inTasks) return false;
      }

      return true;
    });

    filtered.sort((a, b) => (sortOrder === "desc" ? b.day - a.day : a.day - b.day));

    let totalTasks = 0;
    let doneTasks = 0;
    let notesDaysCount = 0;
    for (const item of filtered) {
      const s = WorkTimeHelpers.summarizeDayContent(item.record);
      totalTasks += s.totalTasks;
      doneTasks += s.doneTasks;
      if (s.hasNotes) notesDaysCount++;
    }

    return {
      entries: filtered,
      stats: {
        daysCount: filtered.length,
        totalTasks,
        doneTasks,
        openTasks: totalTasks - doneTasks,
        notesDaysCount
      }
    };
  },

  // Сборка текстовой сводки по отфильтрованным дням для копирования в отчёт
  buildPlainTextReport(year, month, filteredEntries) {
    const header = `Задачи и заметки — ${MONTH_NAMES[month - 1]} ${year}`;
    if (!filteredEntries.length) return `${header}\n\nЗаписей нет.`;

    const blocks = filteredEntries.map((entry) => {
      const hoursLabel = entry.factHours > 0 ? ` — ${entry.factHours.toFixed(2)} ч` : "";
      const lines = [`${entry.dateFormatted} (${entry.dayOfWeekName})${hoursLabel}`];
      const tasks = WorkTimeHelpers.normalizeTasks(entry.record.tasks);
      for (const t of tasks) {
        lines.push(`  ${t.done ? "[x]" : "[ ]"} ${t.text}`);
      }
      const noteText = (entry.record.notes || "").trim();
      if (noteText) {
        lines.push(`  Заметка: ${noteText.replace(/\n/g, "\n  ")}`);
      }
      return lines.join("\n");
    });

    return `${header}\n\n${blocks.join("\n\n")}`;
  }
};

/**
 * Theme handling: mode is "auto" (follow the OS), "light" or "dark".
 * The effective theme is always written to <html data-theme="light|dark">,
 * so CSS only needs one dark selector. The inline script in <head> applies
 * the saved mode before first paint; this class takes over afterwards.
 */
const THEME_STORAGE_KEY = "worktime_tracker_theme";
const THEME_MODES = ["auto", "light", "dark"];
const THEME_META = {
  auto:  { icon: "🌗", label: "Авто" },
  light: { icon: "☀️", label: "Светлая" },
  dark:  { icon: "🌙", label: "Тёмная" }
};
const THEME_COLORS = { light: "#f8fafc", dark: "#0b1220" };

class ThemeManager {
  constructor() {
    this.root = document.documentElement;
    this.btn = document.getElementById("theme-btn");
    this.icon = document.getElementById("theme-icon");
    this.label = document.getElementById("theme-label");
    this.mq = window.matchMedia("(prefers-color-scheme: dark)");

    this.mode = this.readMode();
    this.apply();

    this.btn.addEventListener("click", () => this.cycle());
    // In "auto" mode follow OS theme changes live (e.g. sunset schedule)
    const onSystemChange = () => { if (this.mode === "auto") this.apply(); };
    if (this.mq.addEventListener) this.mq.addEventListener("change", onSystemChange);
    else if (this.mq.addListener) this.mq.addListener(onSystemChange);
  }

  readMode() {
    try {
      const m = localStorage.getItem(THEME_STORAGE_KEY);
      return THEME_MODES.includes(m) ? m : "auto";
    } catch (e) {
      return "auto";
    }
  }

  effectiveTheme() {
    if (this.mode === "auto") return this.mq.matches ? "dark" : "light";
    return this.mode;
  }

  cycle() {
    this.mode = THEME_MODES[(THEME_MODES.indexOf(this.mode) + 1) % THEME_MODES.length];
    try { localStorage.setItem(THEME_STORAGE_KEY, this.mode); } catch (e) { /* private mode */ }
    this.apply();
  }

  apply() {
    const theme = this.effectiveTheme();
    this.root.setAttribute("data-theme", theme);
    this.root.setAttribute("data-theme-mode", this.mode);

    const meta = THEME_META[this.mode];
    this.icon.textContent = meta.icon;
    this.label.textContent = meta.label;
    this.btn.setAttribute("aria-label", `Тема оформления: ${meta.label.toLowerCase()}. Нажмите, чтобы переключить`);
    this.btn.title = `Тема: ${meta.label}`;

    // Browser UI colour (Android address bar etc.): a manual choice must
    // override the media-specific tags, so replace them with a single one.
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const tc = document.createElement("meta");
    tc.name = "theme-color";
    tc.content = THEME_COLORS[theme];
    document.head.appendChild(tc);
  }
}

class WorkTimeTracker {
  constructor() {
    this.currentDate = new Date();
    this.currentYear = this.currentDate.getFullYear();
    this.currentMonth = this.currentDate.getMonth() + 1; // 1-12
    
    this.settings = this.loadSettings();
    DAY_TYPES["Р"].norm = this.settings.workHours;
    DAY_TYPES["ПР"].norm = this.settings.shortHours;
    this.storageKey = "worktime_tracker_data";

    // Состояние вкладок, панели дня и журнала задач
    this.activeView = "timesheet";
    this.drawerDay = null;
    this.journalQuery = "";
    this.journalFilter = "all";
    this.journalSort = "asc";
    this.notesSaveTimer = null;
    this.lastFocusedBeforeDrawer = null;

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

    // Вкладки и контейнер журнала
    this.tabTimesheetBtn = document.getElementById("tab-timesheet-btn");
    this.tabJournalBtn = document.getElementById("tab-journal-btn");
    this.journalTabBadge = document.getElementById("journal-tab-badge");
    this.timesheetView = document.getElementById("timesheet-view");
    this.journalView = document.getElementById("journal-view");

    // Элементы журнала за месяц
    this.journalSearchInput = document.getElementById("journal-search-input");
    this.journalSearchClear = document.getElementById("journal-search-clear");
    this.journalFilterBtns = Array.from(document.querySelectorAll(".filter-chip[data-filter]"));
    this.journalSortBtn = document.getElementById("journal-sort-btn");
    this.journalCopyBtn = document.getElementById("journal-copy-btn");
    this.journalSummary = document.getElementById("journal-summary");
    this.journalList = document.getElementById("journal-list");

    // Элементы выдвижной панели дня
    this.drawerOverlay = document.getElementById("day-drawer-overlay");
    this.drawerEl = document.getElementById("day-drawer");
    this.drawerPrevBtn = document.getElementById("drawer-prev-day-btn");
    this.drawerNextBtn = document.getElementById("drawer-next-day-btn");
    this.drawerDateTitle = document.getElementById("drawer-date-title");
    this.drawerDayBadge = document.getElementById("drawer-day-badge");
    this.drawerCloseBtn = document.getElementById("drawer-close-btn");
    this.drawerMetaBar = document.getElementById("drawer-meta-bar");
    this.drawerTasksCounter = document.getElementById("drawer-tasks-counter");
    this.drawerToggleAllBtn = document.getElementById("drawer-toggle-all-btn");
    this.drawerTasksProgress = document.getElementById("drawer-tasks-progress");
    this.drawerTasksProgressFill = document.getElementById("drawer-tasks-progress-fill");
    this.drawerTaskForm = document.getElementById("drawer-task-form");
    this.drawerTaskInput = document.getElementById("drawer-task-input");
    this.drawerTaskList = document.getElementById("drawer-task-list");
    this.drawerTaskEmpty = document.getElementById("drawer-task-empty");
    this.drawerSaveStatus = document.getElementById("drawer-save-status");
    this.drawerNotesTextarea = document.getElementById("drawer-notes-textarea");
    this.drawerClearNotesBtn = document.getElementById("drawer-clear-notes-btn");
    this.drawerDoneBtn = document.getElementById("drawer-done-btn");
    
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
      this.closeDayDrawer();
      this.currentMonth = parseInt(e.target.value, 10);
      this.render();
    });

    this.yearInput.addEventListener("change", (e) => {
      const val = parseInt(e.target.value, 10);
      if (val >= 2000 && val <= 2100) {
        this.closeDayDrawer();
        this.currentYear = val;
        this.render();
      }
    });

    this.prevMonthBtn.addEventListener("click", () => this.changeMonth(-1));
    this.nextMonthBtn.addEventListener("click", () => this.changeMonth(1));
    this.todayBtn.addEventListener("click", () => {
      this.closeDayDrawer();
      const now = new Date();
      this.currentYear = now.getFullYear();
      this.currentMonth = now.getMonth() + 1;
      this.monthSelect.value = this.currentMonth;
      this.yearInput.value = this.currentYear;
      this.render();
    });

    // Toolbar actions
    this.gotoTodayBtn = document.getElementById("goto-today-btn");
    this.gotoTodayBtn.addEventListener("click", () => {
      if (this.activeView === "journal") {
        const card = document.getElementById("journal-card-today");
        if (card) {
          card.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        this.setActiveView("timesheet");
      }
      const row = document.getElementById("row-today");
      if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    document.getElementById("fill-defaults-btn").addEventListener("click", () => this.fillDefaults());
    document.getElementById("clear-month-btn").addEventListener("click", () => this.clearMonth());
    document.getElementById("export-csv-btn").addEventListener("click", () => this.exportCSV());
    document.getElementById("backup-btn").addEventListener("click", () => this.backupJSON());
    document.getElementById("import-json-input").addEventListener("change", (e) => this.importJSON(e));
    document.getElementById("print-btn").addEventListener("click", () => window.print());

    // Переключение вкладок Табель / Журнал
    this.tabTimesheetBtn.addEventListener("click", () => this.setActiveView("timesheet"));
    this.tabJournalBtn.addEventListener("click", () => this.setActiveView("journal"));

    // Делегирование клика по кнопке заметок/задач в строках таблицы
    this.tbody.addEventListener("click", (e) => {
      const trigger = e.target.closest(".notes-trigger");
      if (trigger) {
        const day = parseInt(trigger.getAttribute("data-day"), 10);
        if (!Number.isNaN(day)) this.openDayDrawer(day);
      }
    });

    // События выдвижной панели дня
    this.drawerCloseBtn.addEventListener("click", () => this.closeDayDrawer());
    this.drawerDoneBtn.addEventListener("click", () => this.closeDayDrawer());
    this.drawerOverlay.addEventListener("click", (e) => {
      if (e.target === this.drawerOverlay) this.closeDayDrawer();
    });
    this.drawerPrevBtn.addEventListener("click", () => this.navigateDrawerDay(-1));
    this.drawerNextBtn.addEventListener("click", () => this.navigateDrawerDay(1));

    this.drawerTaskForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.drawerDay === null) return;
      const text = this.drawerTaskInput.value.trim();
      if (!text) return;
      this.addTask(this.drawerDay, text);
      this.drawerTaskInput.value = "";
      this.drawerTaskInput.focus();
    });

    this.drawerToggleAllBtn.addEventListener("click", () => {
      if (this.drawerDay !== null) this.toggleAllTasks(this.drawerDay);
    });

    this.drawerTaskList.addEventListener("change", (e) => {
      const cb = e.target.closest(".task-checkbox");
      if (cb && this.drawerDay !== null) {
        this.toggleTask(this.drawerDay, cb.getAttribute("data-task-id"));
      }
    });

    this.drawerTaskList.addEventListener("click", (e) => {
      if (this.drawerDay === null) return;
      const delBtn = e.target.closest(".task-delete-btn");
      if (delBtn) {
        this.deleteTask(this.drawerDay, delBtn.getAttribute("data-task-id"));
        return;
      }
      const textEl = e.target.closest(".task-text");
      if (textEl) {
        const li = textEl.closest(".task-item");
        this.startInlineTaskEdit(li, textEl.getAttribute("data-task-id"));
      }
    });

    // Автосохранение многострочной заметки с небольшой задержкой при наборе
    this.drawerNotesTextarea.addEventListener("input", () => {
      if (this.drawerDay === null) return;
      const targetDay = this.drawerDay;
      this.drawerSaveStatus.textContent = "Сохранение...";
      this.drawerSaveStatus.classList.remove("is-saved");
      clearTimeout(this.notesSaveTimer);
      this.notesSaveTimer = setTimeout(() => {
        this.saveDayNotes(targetDay, this.drawerNotesTextarea.value);
      }, 250);
    });

    this.drawerNotesTextarea.addEventListener("blur", () => {
      this.flushPendingNoteSave();
    });

    this.drawerClearNotesBtn.addEventListener("click", () => {
      if (this.drawerDay !== null) this.clearDayNotesAndTasks(this.drawerDay);
    });

    // События журнала за месяц
    this.journalSearchInput.addEventListener("input", (e) => {
      this.journalQuery = e.target.value;
      this.journalSearchClear.hidden = !this.journalQuery;
      this.renderJournal();
    });

    this.journalSearchClear.addEventListener("click", () => {
      this.journalQuery = "";
      this.journalSearchInput.value = "";
      this.journalSearchClear.hidden = true;
      this.journalSearchInput.focus();
      this.renderJournal();
    });

    this.journalFilterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        this.journalFilter = btn.getAttribute("data-filter");
        this.journalFilterBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
        this.renderJournal();
      });
    });

    this.journalSortBtn.addEventListener("click", () => {
      this.journalSort = this.journalSort === "asc" ? "desc" : "asc";
      this.journalSortBtn.textContent = this.journalSort === "asc" ? "↑ Сначала старые" : "↓ Сначала новые";
      this.renderJournal();
    });

    this.journalCopyBtn.addEventListener("click", () => this.copyJournalReport());

    this.journalList.addEventListener("change", (e) => {
      const cb = e.target.closest(".journal-task-checkbox");
      if (cb) {
        const day = parseInt(cb.getAttribute("data-day"), 10);
        const taskId = cb.getAttribute("data-task-id");
        if (!Number.isNaN(day) && taskId) this.toggleTask(day, taskId);
      }
    });

    this.journalList.addEventListener("click", (e) => {
      const editBtn = e.target.closest(".journal-edit-btn");
      if (editBtn) {
        const day = parseInt(editBtn.getAttribute("data-day"), 10);
        if (!Number.isNaN(day)) this.openDayDrawer(day);
        return;
      }
      const openTodayBtn = e.target.closest(".journal-open-today-btn");
      if (openTodayBtn) {
        const day = parseInt(openTodayBtn.getAttribute("data-day"), 10);
        if (!Number.isNaN(day)) this.openDayDrawer(day);
        return;
      }
      const resetBtn = e.target.closest(".journal-reset-filter-btn");
      if (resetBtn) {
        this.journalQuery = "";
        this.journalSearchInput.value = "";
        this.journalSearchClear.hidden = true;
        this.journalFilter = "all";
        this.journalFilterBtns.forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-filter") === "all"));
        this.renderJournal();
      }
    });

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

    // Клавиатурная навигация: Esc закрывает панель/модалку, Alt+стрелки листают дни
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this.drawerDay !== null) {
          if (document.activeElement && document.activeElement.classList.contains("task-edit-input")) {
            return;
          }
          this.closeDayDrawer();
        } else if (modal.style.display === "flex") {
          modal.style.display = "none";
        }
      } else if (this.drawerDay !== null && e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        this.navigateDrawerDay(-1);
      } else if (this.drawerDay !== null && e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        this.navigateDrawerDay(1);
      }
    });
  }

  changeMonth(delta) {
    this.closeDayDrawer();
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

  // Возвращает нормализованную запись дня (всегда содержит tasks[] и notes string)
  getNormalizedRecord(day, monthData = this.getMonthData()) {
    const def = this.getDefaultRecord(this.currentYear, this.currentMonth, day);
    return WorkTimeHelpers.normalizeDayRecord(monthData[day], def);
  }

  // Генерация разметки ячейки "Задачи и заметки" (кнопка-превью + полный блок для печати)
  buildNotesCellHTML(day, dateFormatted, record) {
    const summary = WorkTimeHelpers.summarizeDayContent(record);
    const printText = WorkTimeHelpers.escapeHtml(WorkTimeHelpers.formatDayNotesForExport(record));

    if (summary.isEmpty) {
      return `
        <button type="button" class="notes-trigger is-empty" data-day="${day}" aria-label="Добавить задачи или заметку за ${dateFormatted}">
          <span aria-hidden="true">+</span>
          <span>Задачи / заметка</span>
        </button>
        <div class="print-notes-detail"></div>
      `;
    }

    const pills = [];
    if (summary.totalTasks > 0) {
      const doneClass = summary.doneTasks === summary.totalTasks ? " is-all-done" : "";
      pills.push(`<span class="note-pill note-pill-tasks${doneClass}">☑ ${summary.doneTasks}/${summary.totalTasks}</span>`);
    }
    if (summary.hasNotes) {
      pills.push(`<span class="note-pill note-pill-note">📝 Заметка</span>`);
    }

    const ariaParts = [];
    if (summary.totalTasks > 0) ariaParts.push(`задач: ${summary.doneTasks} из ${summary.totalTasks}`);
    if (summary.hasNotes) ariaParts.push("есть заметка");

    return `
      <button type="button" class="notes-trigger" data-day="${day}" aria-label="Открыть записи за ${dateFormatted}: ${ariaParts.join(", ")}">
        <span class="notes-trigger-pills">${pills.join("")}</span>
        <span class="notes-trigger-preview">${WorkTimeHelpers.escapeHtml(summary.previewText)}</span>
      </button>
      <div class="print-notes-detail">${printText}</div>
    `;
  }

  // Точечное обновление ячейки заметок без перерисовки всей таблицы
  updateRowNotesCell(day) {
    const row = this.tbody.querySelector(`tr[data-day="${day}"]`);
    if (!row) return;
    const cell = row.querySelector("td.col-notes");
    if (!cell) return;
    const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}`;
    const record = this.getNormalizedRecord(day);
    cell.innerHTML = this.buildNotesCellHTML(day, dateFormatted, record);
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

      const record = this.getNormalizedRecord(day, monthData);

      const typeMeta = DAY_TYPES[record.type] || DAY_TYPES["Р"];
      const planHours = typeMeta.norm;
      const factHours = this.calcFactHours(record.start, record.end, record.lunch);
      const deltaHours = Math.round((factHours - planHours) * 100) / 100;

      totalPlan += planHours;
      totalFact += factHours;
      if (planHours > 0) plannedDaysCount++;
      if (factHours > 0) workedDaysCount++;

      const tr = document.createElement("tr");
      tr.dataset.day = String(day);
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
        <td class="col-time cell-start" data-label="Начало">
          <input type="time" class="table-input time-input" aria-label="Начало, ${dateFormatted}" data-day="${day}" data-field="start" value="${record.start || ""}">
        </td>
        <td class="col-time cell-end" data-label="Конец">
          <input type="time" class="table-input time-input" aria-label="Конец, ${dateFormatted}" data-day="${day}" data-field="end" value="${record.end || ""}">
        </td>
        <td class="col-lunch cell-lunch" data-label="Обед, ч">
          <input type="number" inputmode="decimal" class="table-input lunch-input" aria-label="Обед, ${dateFormatted}" data-day="${day}" data-field="lunch" min="0" max="6" step="0.25" value="${record.lunch !== undefined ? record.lunch : ""}">
        </td>
        <td class="col-hours cell-fact text-right" data-label="Факт, ч">${factHours > 0 ? factHours.toFixed(2) : "-"}</td>
        <td class="col-hours cell-plan text-right" data-label="План, ч">${planHours > 0 ? planHours.toFixed(2) : "-"}</td>
        <td class="col-delta cell-delta text-right" data-label="Дельта, ч">
          <span class="delta-tag ${deltaClass}">${deltaSign}${deltaHours.toFixed(2)}</span>
        </td>
        <td class="col-notes" data-label="Задачи и заметки">
          ${this.buildNotesCellHTML(day, dateFormatted, record)}
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
    this.updateJournalTabBadge(monthData);
    if (this.activeView === "journal") this.renderJournal();
    if (this.drawerDay !== null) this.renderDrawer();

    // "Go to today" only makes sense while the current month is shown
    this.gotoTodayBtn.hidden = !document.getElementById("row-today");
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
      notes: "",
      tasks: []
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
    monthData[day] = this.getNormalizedRecord(day, monthData);
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
    const existing = this.getNormalizedRecord(day, monthData);
    const summary = WorkTimeHelpers.summarizeDayContent(existing);

    // Защита от случайного удаления задач и заметки при нажатии на крестик в строке
    if (!summary.isEmpty) {
      const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}`;
      if (!confirm(`Очистить время, задачи и заметку за ${dateFormatted}?`)) return;
    }

    monthData[day] = this.getDefaultRecord(this.currentYear, this.currentMonth, day);
    this.saveMonthData(monthData);
    this.render();
  }

  fillDefaults() {
    const monthData = this.getMonthData();
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);

    for (let day = 1; day <= daysInMonth; day++) {
      const record = this.getNormalizedRecord(day, monthData);

      if (record.type === "Р" && (!record.start || !record.end)) {
        record.start = this.settings.defaultStart;
        record.end = this.settings.defaultEnd;
        record.lunch = this.settings.defaultLunch;
      } else if (record.type === "ПР" && (!record.start || !record.end)) {
        record.start = this.settings.defaultStart;
        const [sh, sm] = this.settings.defaultStart.split(":").map(Number);
        const endH = sh + (this.settings.shortHours + this.settings.defaultLunch);
        record.end = `${String(Math.floor(endH)).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
        record.lunch = this.settings.defaultLunch;
      }

      monthData[day] = record;
    }

    this.saveMonthData(monthData);
    this.render();
  }

  clearMonth() {
    if (confirm(`Вы уверены, что хотите полностью очистить табель за ${MONTH_NAMES[this.currentMonth - 1]} ${this.currentYear}?`)) {
      this.closeDayDrawer();
      this.saveMonthData({});
      this.render();
    }
  }

  // =====================================================================
  // Выдвижная панель дня (задачи с чекбоксами + многострочная заметка)
  // =====================================================================

  openDayDrawer(day) {
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const clampedDay = Math.max(1, Math.min(daysInMonth, day));

    if (this.drawerDay !== null && this.drawerDay !== clampedDay) {
      this.flushPendingNoteSave();
    }

    if (this.drawerDay === null) {
      this.lastFocusedBeforeDrawer = document.activeElement;
      this.drawerOverlay.hidden = false;
      document.body.classList.add("drawer-open");
    }

    this.drawerDay = clampedDay;
    this.renderDrawer();

    // На мобильном не фокусируем поле ввода автоматически, чтобы не перекрывать просмотр клавиатурой
    if (window.innerWidth > 900) {
      this.drawerTaskInput.focus();
    } else {
      this.drawerCloseBtn.focus();
    }
  }

  closeDayDrawer() {
    if (this.drawerDay === null) return;
    this.flushPendingNoteSave();
    this.drawerDay = null;
    this.drawerOverlay.hidden = true;
    document.body.classList.remove("drawer-open");

    if (this.lastFocusedBeforeDrawer && typeof this.lastFocusedBeforeDrawer.focus === "function" &&
        document.body.contains(this.lastFocusedBeforeDrawer)) {
      this.lastFocusedBeforeDrawer.focus();
    }
    this.lastFocusedBeforeDrawer = null;
  }

  navigateDrawerDay(delta) {
    if (this.drawerDay === null) return;
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const nextDay = this.drawerDay + delta;
    if (nextDay < 1 || nextDay > daysInMonth) return;
    this.openDayDrawer(nextDay);
  }

  renderDrawer() {
    if (this.drawerDay === null) return;

    const day = this.drawerDay;
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
    const dayOfWeekName = DAY_NAMES[dateObj.getDay()];
    const record = this.getNormalizedRecord(day);
    const typeMeta = DAY_TYPES[record.type] || DAY_TYPES["Р"];

    this.drawerDateTitle.textContent = `${day} ${MONTH_NAMES_GENITIVE[this.currentMonth - 1]}, ${dayOfWeekName}`;
    this.drawerDayBadge.className = `badge ${typeMeta.cssClass}`;
    this.drawerDayBadge.textContent = typeMeta.label;
    this.drawerPrevBtn.disabled = day <= 1;
    this.drawerNextBtn.disabled = day >= daysInMonth;

    // Контекстная строка с рабочим временем этого дня
    const factHours = this.calcFactHours(record.start, record.end, record.lunch);
    const planHours = typeMeta.norm;
    const deltaHours = Math.round((factHours - planHours) * 100) / 100;
    const deltaSign = deltaHours > 0 ? "+" : "";
    const deltaClass = deltaHours > 0 ? "delta-plus" : (deltaHours < 0 ? "delta-minus" : "");

    if (record.start && record.end) {
      this.drawerMetaBar.innerHTML = `
        <span>Время: <strong>${WorkTimeHelpers.escapeHtml(record.start)}–${WorkTimeHelpers.escapeHtml(record.end)}</strong></span>
        <span>Обед: <strong>${Number(record.lunch || 0).toFixed(2).replace(/\.00$/, "")} ч</strong></span>
        <span>Факт: <strong>${factHours.toFixed(2)} ч</strong></span>
        <span>Дельта: <strong class="${deltaClass}">${deltaSign}${deltaHours.toFixed(2)} ч</strong></span>
      `;
    } else if (record.start) {
      this.drawerMetaBar.innerHTML = `
        <span>Начало: <strong>${WorkTimeHelpers.escapeHtml(record.start)}</strong> (смена не закрыта)</span>
        <span>План: <strong>${planHours.toFixed(2)} ч</strong></span>
      `;
    } else {
      this.drawerMetaBar.innerHTML = `
        <span>Рабочее время не заполнено</span>
        <span>План: <strong>${planHours.toFixed(2)} ч</strong></span>
      `;
    }

    this.renderDrawerTasks(record);
    this.drawerNotesTextarea.value = record.notes;
    this.drawerSaveStatus.textContent = "";
    this.drawerSaveStatus.classList.remove("is-saved");

    const summary = WorkTimeHelpers.summarizeDayContent(record);
    this.drawerClearNotesBtn.disabled = summary.isEmpty;
  }

  renderDrawerTasks(record) {
    const tasks = record.tasks || [];
    const total = tasks.length;
    const done = tasks.filter((t) => t.done).length;

    if (total === 0) {
      this.drawerTasksCounter.textContent = "";
      this.drawerToggleAllBtn.hidden = true;
      this.drawerTasksProgress.hidden = true;
      this.drawerTaskList.innerHTML = "";
      this.drawerTaskEmpty.hidden = false;
      return;
    }

    this.drawerTasksCounter.textContent = `${done} / ${total}`;
    this.drawerToggleAllBtn.hidden = false;
    this.drawerToggleAllBtn.textContent = done === total ? "Снять отметки" : "Отметить все";
    this.drawerTasksProgress.hidden = false;
    this.drawerTasksProgressFill.style.width = `${Math.round((done / total) * 100)}%`;
    this.drawerTaskEmpty.hidden = true;

    this.drawerTaskList.innerHTML = tasks.map((task) => `
      <li class="task-item${task.done ? " is-done" : ""}" data-task-id="${WorkTimeHelpers.escapeHtml(task.id)}">
        <label class="task-check-wrap">
          <input type="checkbox" class="task-checkbox" data-task-id="${WorkTimeHelpers.escapeHtml(task.id)}" ${task.done ? "checked" : ""} aria-label="Отметить задачу выполненной">
        </label>
        <span class="task-text" data-task-id="${WorkTimeHelpers.escapeHtml(task.id)}" title="Нажмите, чтобы изменить">${WorkTimeHelpers.escapeHtml(task.text)}</span>
        <button type="button" class="task-delete-btn" data-task-id="${WorkTimeHelpers.escapeHtml(task.id)}" title="Удалить задачу" aria-label="Удалить задачу">&times;</button>
      </li>
    `).join("");
  }

  startInlineTaskEdit(li, taskId) {
    if (!li || !taskId || this.drawerDay === null) return;
    if (li.querySelector(".task-edit-input")) return;

    const day = this.drawerDay;
    const record = this.getNormalizedRecord(day);
    const task = record.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const textSpan = li.querySelector(".task-text");
    const input = document.createElement("input");
    input.type = "text";
    input.className = "form-input task-edit-input";
    input.value = task.text;
    input.setAttribute("aria-label", "Редактировать текст задачи");
    textSpan.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const commit = () => {
      if (finished) return;
      finished = true;
      const trimmed = input.value.trim();
      if (trimmed && trimmed !== task.text) {
        this.editTaskText(day, taskId, trimmed);
      } else {
        this.renderDrawerTasks(this.getNormalizedRecord(day));
      }
    };
    const cancel = () => {
      if (finished) return;
      finished = true;
      this.renderDrawerTasks(this.getNormalizedRecord(day));
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    });
    input.addEventListener("blur", commit);
  }

  // Общее обновление UI после изменения задач или заметки одного дня
  afterDayContentMutated(day, { refreshDrawerTasks = true } = {}) {
    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    this.updateRowNotesCell(day);
    this.updateJournalTabBadge(monthData);

    if (this.drawerDay === day) {
      if (refreshDrawerTasks) this.renderDrawerTasks(record);
      this.drawerClearNotesBtn.disabled = WorkTimeHelpers.summarizeDayContent(record).isEmpty;
    }

    if (this.activeView === "journal") {
      this.renderJournal();
    }
  }

  addTask(day, text) {
    const clean = String(text ?? "").trim();
    if (!clean) return;

    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    record.tasks.push({
      id: WorkTimeHelpers.generateTaskId(),
      text: clean,
      done: false
    });
    monthData[day] = record;
    this.saveMonthData(monthData);
    this.afterDayContentMutated(day);
  }

  toggleTask(day, taskId) {
    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    const task = record.tasks.find((t) => t.id === taskId);
    if (!task) return;

    task.done = !task.done;
    monthData[day] = record;
    this.saveMonthData(monthData);
    this.afterDayContentMutated(day);
  }

  editTaskText(day, taskId, newText) {
    const clean = String(newText ?? "").trim();
    if (!clean) return;

    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    const task = record.tasks.find((t) => t.id === taskId);
    if (!task) return;

    task.text = clean;
    monthData[day] = record;
    this.saveMonthData(monthData);
    this.afterDayContentMutated(day);
  }

  deleteTask(day, taskId) {
    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    record.tasks = record.tasks.filter((t) => t.id !== taskId);
    monthData[day] = record;
    this.saveMonthData(monthData);
    this.afterDayContentMutated(day);
  }

  toggleAllTasks(day) {
    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    if (!record.tasks.length) return;

    const allDone = record.tasks.every((t) => t.done);
    record.tasks = record.tasks.map((t) => ({ ...t, done: !allDone }));
    monthData[day] = record;
    this.saveMonthData(monthData);
    this.afterDayContentMutated(day);
  }

  saveDayNotes(day, text) {
    clearTimeout(this.notesSaveTimer);
    this.notesSaveTimer = null;

    const monthData = this.getMonthData();
    const record = this.getNormalizedRecord(day, monthData);
    const normalized = String(text ?? "");
    if (record.notes === normalized) {
      if (this.drawerDay === day) {
        this.drawerSaveStatus.textContent = "Сохранено ✓";
        this.drawerSaveStatus.classList.add("is-saved");
      }
      return;
    }

    record.notes = normalized;
    monthData[day] = record;
    this.saveMonthData(monthData);
    this.afterDayContentMutated(day, { refreshDrawerTasks: false });

    if (this.drawerDay === day) {
      this.drawerSaveStatus.textContent = "Сохранено ✓";
      this.drawerSaveStatus.classList.add("is-saved");
    }
  }

  flushPendingNoteSave() {
    if (this.notesSaveTimer !== null && this.drawerDay !== null) {
      this.saveDayNotes(this.drawerDay, this.drawerNotesTextarea.value);
    }
  }

  clearDayNotesAndTasks(day) {
    const record = this.getNormalizedRecord(day);
    if (WorkTimeHelpers.summarizeDayContent(record).isEmpty) return;

    const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}`;
    if (!confirm(`Очистить все задачи и заметку за ${dateFormatted}? Рабочее время останется без изменений.`)) {
      return;
    }

    clearTimeout(this.notesSaveTimer);
    this.notesSaveTimer = null;

    const monthData = this.getMonthData();
    const updated = this.getNormalizedRecord(day, monthData);
    updated.tasks = [];
    updated.notes = "";
    monthData[day] = updated;
    this.saveMonthData(monthData);

    if (this.drawerDay === day) {
      this.drawerNotesTextarea.value = "";
      this.drawerSaveStatus.textContent = "";
      this.drawerSaveStatus.classList.remove("is-saved");
    }
    this.afterDayContentMutated(day);
  }

  // =====================================================================
  // Вкладки и сводный журнал задач и заметок за месяц
  // =====================================================================

  setActiveView(view) {
    this.activeView = view === "journal" ? "journal" : "timesheet";
    const isJournal = this.activeView === "journal";

    this.timesheetView.hidden = isJournal;
    this.journalView.hidden = !isJournal;

    this.tabTimesheetBtn.classList.toggle("is-active", !isJournal);
    this.tabTimesheetBtn.setAttribute("aria-selected", String(!isJournal));
    this.tabJournalBtn.classList.toggle("is-active", isJournal);
    this.tabJournalBtn.setAttribute("aria-selected", String(isJournal));

    if (isJournal) this.renderJournal();
  }

  getMonthEntries(monthData = this.getMonthData()) {
    const daysInMonth = this.getDaysInMonth(this.currentYear, this.currentMonth);
    const entries = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
      const dayOfWeekName = DAY_NAMES[dateObj.getDay()];
      const record = this.getNormalizedRecord(day, monthData);
      const typeMeta = DAY_TYPES[record.type] || DAY_TYPES["Р"];
      const factHours = this.calcFactHours(record.start, record.end, record.lunch);
      const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}`;

      entries.push({
        day,
        dateFormatted,
        dayOfWeekName,
        record,
        typeMeta,
        factHours,
        planHours: typeMeta.norm,
        isToday: this.isToday(this.currentYear, this.currentMonth, day)
      });
    }
    return entries;
  }

  updateJournalTabBadge(monthData = this.getMonthData()) {
    const allEntries = this.getMonthEntries(monthData);
    const { stats } = WorkTimeHelpers.filterJournalEntries(allEntries, { filter: "all" });
    this.journalTabBadge.textContent = String(stats.daysCount);
    this.tabJournalBtn.title = `Дней с записями: ${stats.daysCount}, задач: ${stats.doneTasks}/${stats.totalTasks}`;
  }

  renderJournal() {
    const allEntries = this.getMonthEntries();
    const unfiltered = WorkTimeHelpers.filterJournalEntries(allEntries, { filter: "all" });
    const { entries, stats } = WorkTimeHelpers.filterJournalEntries(allEntries, {
      query: this.journalQuery,
      filter: this.journalFilter,
      sortOrder: this.journalSort
    });

    this.journalSummary.innerHTML = `
      <span>Дней показано: <strong>${stats.daysCount}</strong></span>
      <span>Задач выполнено: <strong>${stats.doneTasks} / ${stats.totalTasks}</strong></span>
      <span>Дней с заметками: <strong>${stats.notesDaysCount}</strong></span>
    `;

    this.journalCopyBtn.disabled = entries.length === 0;

    if (unfiltered.entries.length === 0) {
      const now = new Date();
      const isCurrentMonth = now.getFullYear() === this.currentYear && now.getMonth() + 1 === this.currentMonth;
      const ctaDay = isCurrentMonth ? now.getDate() : 1;
      const ctaLabel = isCurrentMonth ? "Добавить запись за сегодня" : "Добавить запись за 1-е число";

      this.journalList.innerHTML = `
        <div class="journal-empty">
          <div class="journal-empty-icon" aria-hidden="true">📝</div>
          <h3>За ${MONTH_NAMES[this.currentMonth - 1]} ${this.currentYear} записей пока нет</h3>
          <p>Добавляйте выполненные задачи и заметки в выдвижной панели любого дня — они автоматически соберутся здесь в хронологическую сводку.</p>
          <button type="button" class="btn btn-primary journal-open-today-btn" data-day="${ctaDay}">
            + ${ctaLabel}
          </button>
        </div>
      `;
      return;
    }

    if (entries.length === 0) {
      this.journalList.innerHTML = `
        <div class="journal-empty">
          <div class="journal-empty-icon" aria-hidden="true">🔍</div>
          <h3>По текущему фильтру ничего не найдено</h3>
          <p>Попробуйте изменить поисковый запрос или сбросить фильтр.</p>
          <button type="button" class="btn btn-secondary journal-reset-filter-btn">
            Сбросить фильтры
          </button>
        </div>
      `;
      return;
    }

    const q = this.journalQuery;
    this.journalList.innerHTML = entries.map((entry) => {
      const { day, dateFormatted, dayOfWeekName, record, typeMeta, factHours, isToday } = entry;
      const tasks = record.tasks || [];
      const noteText = (record.notes || "").trim();
      const hoursText = factHours > 0 ? `${factHours.toFixed(2)} ч` : "время не указано";

      const tasksHTML = tasks.length > 0
        ? `<ul class="journal-card-tasks">${tasks.map((t) => `
            <li class="journal-task-row${t.done ? " is-done" : ""}">
              <label class="journal-task-toggle">
                <span class="task-check-wrap">
                  <input type="checkbox" class="task-checkbox journal-task-checkbox" data-day="${day}" data-task-id="${WorkTimeHelpers.escapeHtml(t.id)}" ${t.done ? "checked" : ""} aria-label="Переключить статус задачи">
                </span>
                <span class="journal-task-label">${WorkTimeHelpers.highlightText(t.text, q)}</span>
              </label>
            </li>
          `).join("")}</ul>`
        : "";

      const noteHTML = noteText
        ? `<div class="journal-card-note">${WorkTimeHelpers.highlightText(noteText, q)}</div>`
        : "";

      return `
        <article class="journal-card${isToday ? " is-today" : ""}" ${isToday ? 'id="journal-card-today"' : ""} data-day="${day}">
          <div class="journal-card-header">
            <div class="journal-card-meta">
              <span class="journal-card-date">${WorkTimeHelpers.highlightText(dateFormatted, q)}, ${WorkTimeHelpers.highlightText(dayOfWeekName, q)}</span>
              <span class="badge ${typeMeta.cssClass}">${WorkTimeHelpers.escapeHtml(record.type)}</span>
              <span class="journal-card-hours">${hoursText}</span>
            </div>
            <button type="button" class="btn btn-secondary btn-sm journal-edit-btn" data-day="${day}">
              ✏️ Открыть день
            </button>
          </div>
          ${tasksHTML}
          ${noteHTML}
        </article>
      `;
    }).join("");
  }

  copyJournalReport() {
    const allEntries = this.getMonthEntries();
    const { entries } = WorkTimeHelpers.filterJournalEntries(allEntries, {
      query: this.journalQuery,
      filter: this.journalFilter,
      sortOrder: this.journalSort
    });
    const reportText = WorkTimeHelpers.buildPlainTextReport(this.currentYear, this.currentMonth, entries);

    const onCopied = () => {
      const prev = this.journalCopyBtn.textContent;
      this.journalCopyBtn.textContent = "✓ Скопировано";
      setTimeout(() => {
        this.journalCopyBtn.textContent = prev;
      }, 1800);
    };

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(reportText).then(onCopied).catch(() => {
        this.fallbackCopyText(reportText);
        onCopied();
      });
    } else {
      this.fallbackCopyText(reportText);
      onCopied();
    }
  }

  fallbackCopyText(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    ta.remove();
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
    csvContent += "№;Дата;День;Тип;Начало;Конец;Обед(ч);Факт(ч);План(ч);Дельта(ч);Задачи и заметки\r\n";

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(this.currentYear, this.currentMonth - 1, day);
      const dayOfWeekName = DAY_NAMES[dateObj.getDay()];
      const record = this.getNormalizedRecord(day, monthData);

      const plan = DAY_TYPES[record.type] ? DAY_TYPES[record.type].norm : 0;
      const fact = this.calcFactHours(record.start, record.end, record.lunch);
      const delta = Math.round((fact - plan) * 100) / 100;
      const dateFormatted = `${String(day).padStart(2, "0")}.${String(this.currentMonth).padStart(2, "0")}.${this.currentYear}`;
      const combinedNotes = WorkTimeHelpers.formatDayNotesForExport(record);

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
        `"${combinedNotes.replace(/"/g, '""')}"`
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
      version: 2,
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

window.WorkTimeHelpers = WorkTimeHelpers;

document.addEventListener("DOMContentLoaded", () => {
  window.theme = new ThemeManager();
  window.tracker = new WorkTimeTracker();
});
