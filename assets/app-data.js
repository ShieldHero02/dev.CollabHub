(function () {
  const CH = window.CH = window.CH || {};
  CH.toast = CH.toast || function () {};
  CH.dataVersion = 1;
  CH.storageKey = "collabhub.userData";
  CH.legacyStorageKeys = ["collabhub.expandable.v3"];
  CH.dbName = "collabhub-user-data";
  CH.dbStore = "records";
  CH.dbRecordKey = "state";
  CH.bootstrapDataUrl = "data/dev-seed.json";
  CH.sessionKey = "collabhub.session.v1";
  CH.days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  CH.statuses = {
    free: { label: "Свободен", color: "#35aa5c" },
    busy: { label: "Занят", color: "#a94448" },
    maybe: { label: "Возможно", color: "#b8a142" },
    stream: { label: "Стрим", color: "#4aa3df" },
    work: { label: "Работа", color: "#446fc6" },
    study: { label: "Учеба", color: "#c47b37" },
    unknown: { label: "Нет данных", color: "#3e4853" }
  };
  CH.eventStatuses = { going: "идет", maybe: "возможно", no: "не идет" };

  CH.id = function () {
    return Math.random().toString(36).slice(2, 10);
  };

  CH.blankSchedule = function (fill) {
    return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => fill || "unknown"));
  };

  CH.today = function () {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  };

  CH.toDateKey = function (date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return [
      copy.getFullYear(),
      String(copy.getMonth() + 1).padStart(2, "0"),
      String(copy.getDate()).padStart(2, "0")
    ].join("-");
  };

  CH.fromDateKey = function (key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  CH.addDays = function (date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  CH.startOfWeek = function (date) {
    const copy = new Date(date);
    const day = (copy.getDay() + 6) % 7;
    copy.setDate(copy.getDate() - day);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  CH.formatDate = function (date) {
    return `${CH.days[(date.getDay() + 6) % 7]} ${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  CH.legacyDemo = function () {
    const participants = [
      { id: "anna", name: "Аня", color: "#55dd78", interests: ["Minecraft", "кооп", "вечер"] },
      { id: "max", name: "Макс", color: "#9b6cff", interests: ["PUBG", "Twitch", "хорроры"] },
      { id: "dima", name: "Дима", color: "#4aa3df", interests: ["Dota", "кооп"] },
      { id: "lena", name: "Лена", color: "#d88945", interests: ["инди", "Minecraft"] },
      { id: "igor", name: "Игорь", color: "#d9bd4c", interests: ["PUBG", "стримы"] }
    ];
    const schedules = {};
    const dateSchedules = {};
    const comments = {};
    const baseMonday = CH.startOfWeek(CH.today());
    participants.forEach((person, index) => {
      schedules[person.id] = CH.blankSchedule("unknown");
      dateSchedules[person.id] = {};
      comments[person.id] = {};
      for (let day = 0; day < 7; day++) {
        for (let hour = 0; hour < 24; hour++) {
          let value = "unknown";
          if (hour >= 9 && hour <= 17 && day < 5) value = index % 3 === 0 ? "work" : index % 3 === 1 ? "study" : "busy";
          if (hour >= 18 && hour <= 23) value = (day + index) % 2 === 0 ? "free" : "maybe";
          if (day === 5 && hour >= 12) value = "free";
          if (day === 6 && index === 2) value = "free";
          if (index === 1 && day === 4 && hour >= 20 && hour <= 22) value = "stream";
          schedules[person.id][day][hour] = value;
        }
        const key = CH.toDateKey(CH.addDays(baseMonday, day));
        dateSchedules[person.id][key] = [...schedules[person.id][day]];
      }
    });
    return {
      participants,
      schedules,
      dateSchedules,
      comments,
      accounts: [
        { id: "master", role: "master", name: "Master", login: "master", participantId: null, teamId: null },
        ...participants.map((person, index) => ({ id: `acc_${person.id}`, role: index === 1 ? "teamlead" : "member", name: person.name, login: person.id, participantId: person.id, teamId: index < 3 ? "team_stream" : "team_games" }))
      ],
      teams: [
        { id: "team_stream", name: "Стрим-команда", color: "#9b6cff", leadId: "max", members: ["anna", "max", "dima"] },
        { id: "team_games", name: "Кооп-команда", color: "#43c96b", leadId: "lena", members: ["lena", "igor"] }
      ],
      settings: {
        tableScale: "compact",
        planningMode: "week",
        activeDate: CH.toDateKey(CH.today())
      },
      presets: [
        { id: CH.id(), name: "Вечер свободен", start: 18, end: 24, status: "free" },
        { id: CH.id(), name: "Рабочий день занят", start: 9, end: 18, status: "busy" },
        { id: CH.id(), name: "Стрим вечером", start: 20, end: 23, status: "stream" }
      ],
      events: [
        { id: CH.id(), title: "Кооп стрим", date: CH.toDateKey(CH.addDays(baseMonday, 4)), day: 4, start: 20, end: 23, activity: "Twitch", description: "Спокойный общий стрим.", participantStatus: { anna: "going", max: "going", dima: "maybe", lena: "no", igor: "maybe" } },
        { id: CH.id(), title: "Minecraft вечер", date: CH.toDateKey(CH.addDays(baseMonday, 5)), day: 5, start: 18, end: 21, activity: "Minecraft", description: "Доделать базу на сервере.", participantStatus: { anna: "going", max: "maybe", dima: "going", lena: "going", igor: "maybe" } },
        { id: CH.id(), title: "PUBG squad", date: CH.toDateKey(CH.addDays(baseMonday, 2)), day: 2, start: 21, end: 23, activity: "PUBG", description: "Нужны 3-4 человека.", participantStatus: { anna: "maybe", max: "going", dima: "no", lena: "maybe", igor: "going" } }
      ]
    };
  };

  CH.demo = function () {
    return {
      participants: [],
      schedules: {},
      dateSchedules: {},
      comments: {},
      accounts: [],
      teams: [],
      settings: {
        tableScale: "compact",
        planningMode: "week",
        activeDate: CH.toDateKey(CH.today())
      },
      presets: [
        { id: CH.id(), name: "Вечер свободен", start: 18, end: 24, status: "free" },
        { id: CH.id(), name: "Рабочий день занят", start: 9, end: 18, status: "busy" },
        { id: CH.id(), name: "Стрим вечером", start: 20, end: 23, status: "stream" }
      ],
      events: []
    };
  };

  CH.openUserDb = function () {
    if (!("indexedDB" in window)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open(CH.dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CH.dbStore)) db.createObjectStore(CH.dbStore, { keyPath: "key" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  };

  CH.writeUserDb = async function (state) {
    const db = await CH.openUserDb();
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction(CH.dbStore, "readwrite");
      transaction.objectStore(CH.dbStore).put({
        key: CH.dbRecordKey,
        schemaVersion: CH.dataVersion,
        savedAt: new Date().toISOString(),
        state
      });
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
    });
    db.close();
  };

  CH.readUserDb = async function () {
    const db = await CH.openUserDb();
    if (!db) return null;
    return new Promise((resolve) => {
      const transaction = db.transaction(CH.dbStore, "readonly");
      const request = transaction.objectStore(CH.dbStore).get(CH.dbRecordKey);
      request.onsuccess = () => {
        db.close();
        resolve(request.result?.state || null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  };

  CH.readLocalState = function () {
    const keys = [CH.storageKey, ...CH.legacyStorageKeys];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (key !== CH.storageKey) localStorage.setItem(CH.storageKey, JSON.stringify(parsed));
        return parsed;
      } catch (error) {}
    }
    return null;
  };

  CH.canUseBootstrapData = function () {
    return ["dev.collabhub.rogaxiom.com", "localhost", "127.0.0.1", ""].includes(location.hostname);
  };

  CH.persist = function (options) {
    CH.state.schemaVersion = CH.dataVersion;
    CH.state.meta = {
      ...(CH.state.meta || {}),
      schemaVersion: CH.dataVersion,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(CH.storageKey, JSON.stringify(CH.state));
    CH.writeUserDb(CH.state);
    if (options?.toast) CH.toast("Сохранено");
  };

  CH.load = function () {
    try {
      const stored = CH.readLocalState();
      CH.loadedFromUserData = Boolean(stored);
      CH.state = stored || CH.demo();
    } catch (error) {
      CH.loadedFromUserData = false;
      CH.state = CH.demo();
    }
    CH.normalize();
    if (CH.loadedFromUserData) CH.persist();
    return CH.state;
  };

  CH.save = function () {
    CH.persist();
    CH.toast("Сохранено");
  };

  CH.normalize = function () {
    CH.state.schemaVersion = CH.dataVersion;
    CH.state.meta = {
      ...(CH.state.meta || {}),
      schemaVersion: CH.dataVersion
    };
    CH.state.participants = CH.state.participants || [];
    CH.state.schedules = CH.state.schedules || {};
    CH.state.dateSchedules = CH.state.dateSchedules || {};
    CH.state.comments = CH.state.comments || {};
    CH.state.events = CH.state.events || [];
    CH.state.memberPresets = CH.state.memberPresets || {};
    CH.state.presets = CH.state.presets || [
      { id: CH.id(), name: "Вечер свободен", start: 18, end: 24, status: "free" },
      { id: CH.id(), name: "Рабочий день занят", start: 9, end: 18, status: "busy" }
    ];
    CH.state.settings = CH.state.settings || {};
    CH.state.settings.tableScale = CH.state.settings.tableScale || localStorage.getItem("collabhub.tableScale") || "compact";
    CH.state.settings.activeDate = CH.state.settings.activeDate || CH.toDateKey(CH.today());
    CH.state.accounts = CH.state.accounts || [];
    CH.state.teams = CH.state.teams || [];
    CH.state.participants.forEach((person) => {
      if (!CH.state.schedules[person.id]) CH.state.schedules[person.id] = CH.blankSchedule("unknown");
      if (!CH.state.dateSchedules[person.id]) CH.state.dateSchedules[person.id] = {};
      if (!CH.state.comments[person.id]) CH.state.comments[person.id] = {};
      if (!CH.state.memberPresets[person.id]) {
        CH.state.memberPresets[person.id] = CH.state.presets.map((preset) => ({ ...preset, id: CH.id() }));
      }
      const hasAccount = CH.state.accounts.some((account) => account.participantId === person.id);
      if (!hasAccount) CH.state.accounts.push({ id: `acc_${person.id}`, role: "member", name: person.name, login: person.id, participantId: person.id, teamId: null });
    });
    const participantIds = new Set(CH.state.participants.map((person) => person.id));
    CH.state.accounts = CH.state.accounts.filter((account) => !account.participantId || participantIds.has(account.participantId));
    CH.state.teams.forEach((team) => {
      team.members = (team.members || []).filter((id) => participantIds.has(id));
      team.color = team.color || "#9b6cff";
      team.leadId = participantIds.has(team.leadId) ? team.leadId : "";
    });
    CH.state.events.forEach((event) => {
      event.participantStatus = event.participantStatus || {};
      Object.keys(event.participantStatus).forEach((id) => {
        if (!participantIds.has(id)) delete event.participantStatus[id];
      });
      if (!event.date && Number.isInteger(event.day)) {
        event.date = CH.toDateKey(CH.addDays(CH.startOfWeek(CH.fromDateKey(CH.state.settings.activeDate)), event.day));
      }
    });
  };

  CH.restoreFromUserDb = async function () {
    if (CH.loadedFromUserData) return false;
    const restored = await CH.readUserDb();
    if (!restored) return false;
    CH.state = restored;
    CH.normalize();
    CH.persist();
    location.reload();
    return true;
  };

  CH.restoreFromBootstrap = async function () {
    if (CH.loadedFromUserData || !CH.canUseBootstrapData()) return false;
    try {
      const response = await fetch(CH.bootstrapDataUrl, { cache: "no-store" });
      if (!response.ok) return false;
      const restored = await response.json();
      if (!restored.participants || !restored.schedules || !restored.accounts) return false;
      CH.state = restored;
      CH.normalize();
      CH.persist();
      location.reload();
      return true;
    } catch (error) {
      return false;
    }
  };

  CH.restoreSeedData = async function () {
    if (await CH.restoreFromUserDb()) return;
    await CH.restoreFromBootstrap();
  };

  CH.currentUser = function () {
    const id = localStorage.getItem(CH.sessionKey);
    return CH.state.accounts.find((account) => account.id === id) || null;
  };

  CH.hasAccounts = function () {
    return CH.state.accounts.length > 0;
  };

  CH.roles = {
    master: "Мастер",
    admin: "Админ",
    teamlead: "Тимлид",
    member: "Участник",
    guest: "Гость"
  };

  CH.team = function (id) {
    return CH.state.teams.find((team) => team.id === id);
  };

  CH.hashPassword = async function (password) {
    const bytes = new TextEncoder().encode(String(password));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };

  CH.setAccountPassword = async function (account, password) {
    account.pinHash = await CH.hashPassword(password);
    delete account.pin;
  };

  CH.verifyPassword = async function (account, password) {
    if (account.pinHash) return account.pinHash === await CH.hashPassword(password);
    return account.pin === password;
  };

  CH.generatePassword = function (length = 12) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    const values = new Uint32Array(length);
    crypto.getRandomValues(values);
    return [...values].map((value) => alphabet[value % alphabet.length]).join("");
  };

  CH.login = async function (login, pin) {
    const account = CH.state.accounts.find((item) => item.login === login);
    if (!account || !(await CH.verifyPassword(account, pin))) return null;
    if (!account.pinHash) {
      await CH.setAccountPassword(account, pin);
      CH.persist();
    }
    localStorage.setItem(CH.sessionKey, account.id);
    return account;
  };

  CH.logout = function () {
    localStorage.removeItem(CH.sessionKey);
    location.href = "login.html";
  };

  CH.requireAuth = function () {
    if (location.pathname.toLowerCase().endsWith("login.html")) return;
    if (!CH.hasAccounts()) location.href = "login.html";
    if (!CH.currentUser()) location.href = "login.html";
  };

  CH.person = function (id) {
    return CH.state.participants.find((person) => person.id === id);
  };

  CH.deleteParticipant = function (id) {
    const participant = CH.person(id);
    if (!participant) return false;
    CH.state.participants = CH.state.participants.filter((item) => item.id !== id);
    CH.state.accounts = CH.state.accounts.filter((account) => account.participantId !== id);
    CH.state.teams.forEach((team) => {
      team.members = (team.members || []).filter((memberId) => memberId !== id);
      if (team.leadId === id) team.leadId = "";
    });
    delete CH.state.schedules[id];
    delete CH.state.dateSchedules[id];
    delete CH.state.comments[id];
    if (CH.state.memberPresets) delete CH.state.memberPresets[id];
    CH.state.events.forEach((event) => {
      if (event.participantStatus) delete event.participantStatus[id];
    });
    return true;
  };

  CH.deleteAccount = function (id) {
    const account = CH.state.accounts.find((item) => item.id === id);
    if (!account || account.role === "master") return false;
    if (account.participantId && CH.person(account.participantId)) {
      return CH.deleteParticipant(account.participantId);
    }
    CH.state.accounts = CH.state.accounts.filter((item) => item.id !== id);
    return true;
  };

  CH.nowCell = function () {
    const now = new Date();
    return { day: (now.getDay() + 6) % 7, hour: now.getHours() };
  };

  CH.getStatus = function (personId, dateKey, hour) {
    const dated = CH.state.dateSchedules[personId]?.[dateKey]?.[hour];
    if (dated) return dated;
    const day = (CH.fromDateKey(dateKey).getDay() + 6) % 7;
    return CH.state.schedules[personId]?.[day]?.[hour] || "unknown";
  };

  CH.setStatus = function (personId, dateKey, hour, status) {
    if (!CH.state.dateSchedules[personId]) CH.state.dateSchedules[personId] = {};
    if (!CH.state.dateSchedules[personId][dateKey]) {
      const day = (CH.fromDateKey(dateKey).getDay() + 6) % 7;
      CH.state.dateSchedules[personId][dateKey] = [...(CH.state.schedules[personId]?.[day] || Array(24).fill("unknown"))];
    }
    CH.state.dateSchedules[personId][dateKey][hour] = status;
  };

  CH.getComment = function (personId, dateKey, hour) {
    return CH.state.comments[personId]?.[dateKey]?.[hour] || "";
  };

  CH.setComment = function (personId, dateKey, hour, text) {
    CH.state.comments[personId] = CH.state.comments[personId] || {};
    CH.state.comments[personId][dateKey] = CH.state.comments[personId][dateKey] || {};
    if (text.trim()) CH.state.comments[personId][dateKey][hour] = text.trim();
    else delete CH.state.comments[personId][dateKey][hour];
  };

  CH.aggregate = function (dateKey, hour) {
    const groups = { free: [], busy: [], maybe: [], stream: [], work: [], study: [], unknown: [] };
    CH.state.participants.forEach((person) => {
      const value = CH.getStatus(person.id, dateKey, hour);
      groups[value].push(person);
    });
    return groups;
  };

  CH.eventsAt = function (dateKey, hour) {
    return CH.state.events.filter((event) => event.date === dateKey && hour >= Number(event.start) && hour < Number(event.end));
  };

  CH.suggestPeople = function (dateKey, start, end) {
    return CH.state.participants.map((person) => {
      let score = 0;
      for (let hour = start; hour < end; hour++) {
        const status = CH.getStatus(person.id, dateKey, hour);
        if (status === "free" || status === "stream") score += 2;
        if (status === "maybe") score += 1;
      }
      return { person, score };
    }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  };

  CH.availabilityClass = function (groups) {
    const total = Math.max(CH.state.participants.length, 1);
    const free = groups.free.length + groups.stream.length;
    const busy = groups.busy.length + groups.work.length + groups.study.length;
    const known = total - groups.unknown.length;
    if (!known) return "none";
    if (free >= Math.ceil(total * .55)) return "high";
    if (free >= Math.ceil(total * .34)) return "mid";
    if (free > 0) return "low";
    if (groups.maybe.length) return "maybe";
    if (busy >= Math.ceil(total * .5)) return "busy";
    return "none";
  };

  CH.escape = function (value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
  };

  CH.hourLabel = function (hour) {
    return String(hour).padStart(2, "0") + ":00";
  };

  CH.load();
  CH.restoreSeedData();
})();
