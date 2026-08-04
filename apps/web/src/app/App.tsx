import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AvailabilityCellDto,
  AvailabilityStatusDto,
  CurrentUserDto,
  EventDto,
  EventParticipantStatusDto,
  ParticipantDto
} from "@collabhub/shared-types";
import { AppShell, type AppView } from "../shared/AppShell.js";
import { AccountDto, ApiClient, apiBaseUrl, isUnauthorizedError, type ManagedUserDto, type OAuthProviderStatusDto } from "../shared/api.js";

const tokenStorageKey = "collabhub.v2.token";
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const hours = Array.from({ length: 24 }, (_, hour) => `${hour.toString().padStart(2, "0")}:00`);
const statuses: AvailabilityStatusDto[] = ["unknown", "free", "maybe", "busy", "stream", "work", "study"];
const statusLabels: Record<AvailabilityStatusDto, string> = {
  free: "Свободен",
  busy: "Занят",
  maybe: "Возможно",
  stream: "Стрим",
  work: "Работа",
  study: "Учёба",
  unknown: "Нет данных"
};

export function App() {
  const [token, setTokenState] = useState(() => localStorage.getItem(tokenStorageKey));
  const [currentUser, setCurrentUser] = useState<CurrentUserDto | null>(null);
  const [participants, setParticipants] = useState<ParticipantDto[]>([]);
  const [events, setEvents] = useState<EventDto[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [oauthNotice, setOauthNotice] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [revision, setRevision] = useState(0);
  const snapshotGeneration = useRef(0);
  const appliedRevision = useRef(0);
  const syncCheckInFlight = useRef(false);
  const api = useMemo(() => new ApiClient(token), [token]);

  const setToken = useCallback((nextToken: string | null) => {
    if (nextToken) localStorage.setItem(tokenStorageKey, nextToken);
    else localStorage.removeItem(tokenStorageKey);
    setTokenState(nextToken);
  }, []);

  const clearExpiredSession = useCallback(() => {
    snapshotGeneration.current += 1;
    appliedRevision.current = 0;
    syncCheckInFlight.current = false;
    setIsSyncing(false);
    setToken(null);
    setCurrentUser(null);
    setParticipants([]);
    setEvents([]);
    setActiveView("overview");
    setError("Сессия завершилась. Войдите снова.");
  }, [setToken]);

  const loadSnapshot = useCallback(async () => {
    const generation = ++snapshotGeneration.current;
    setIsSyncing(true);
    try {
      const snapshot = await api.syncSnapshot();
      if (generation !== snapshotGeneration.current || snapshot.revision < appliedRevision.current) return;
      appliedRevision.current = snapshot.revision;
      setParticipants(snapshot.participants);
      setEvents(snapshot.events);
      setRevision(snapshot.revision);
      setSelectedParticipantId((current) => current ?? snapshot.participants[0]?.id ?? null);
      setLastSyncAt(new Date());
      setSyncError(null);
    } catch (unknownError) {
      if (generation !== snapshotGeneration.current) return;
      if (isUnauthorizedError(unknownError)) {
        clearExpiredSession();
        return;
      }
      setSyncError(readError(unknownError));
      throw unknownError;
    } finally {
      if (generation === snapshotGeneration.current) setIsSyncing(false);
    }
  }, [api, clearExpiredSession]);

  const checkForUpdates = useCallback(async () => {
    if (syncCheckInFlight.current) return;
    syncCheckInFlight.current = true;
    setIsSyncing(true);
    try {
      const latest = await api.syncRevision();
      if (latest.revision !== revision) {
        await loadSnapshot();
      } else {
        setLastSyncAt(new Date());
        setSyncError(null);
      }
    } catch (unknownError) {
      if (isUnauthorizedError(unknownError)) {
        clearExpiredSession();
        return;
      }
      setSyncError(readError(unknownError));
    } finally {
      syncCheckInFlight.current = false;
      setIsSyncing(false);
    }
  }, [api, clearExpiredSession, loadSnapshot, revision]);

  const loadSession = useCallback(async () => {
    setError(null);
    const [setupStatus, me] = await Promise.all([api.setupStatus(), api.me()]);
    setNeedsBootstrap(setupStatus.needsBootstrap);
    if (me.authenticated && me.user) {
      setCurrentUser(me.user);
      await loadSnapshot();
    } else {
      setCurrentUser(null);
      setParticipants([]);
      setEvents([]);
    }
  }, [api, loadSnapshot]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get("oauth");
    if (result === "authenticated" || result === "linked") {
      const provider = oauthProviderLabel(url.searchParams.get("provider"));
      setOauthNotice(result === "authenticated" ? `Вход через ${provider} выполнен.` : `${provider} успешно привязан к аккаунту.`);
      url.searchParams.delete("oauth");
      url.searchParams.delete("provider");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);

  useEffect(() => {
    void loadSession()
      .catch((unknownError) => {
        if (isUnauthorizedError(unknownError)) {
          clearExpiredSession();
          return;
        }
        setError(readError(unknownError));
        setCurrentUser(null);
      })
      .finally(() => setIsBooting(false));
  }, [clearExpiredSession, loadSession]);

  useEffect(() => {
    if (!currentUser) return;
    const timer = window.setInterval(() => {
      void checkForUpdates();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [checkForUpdates, currentUser]);

  const selectedParticipant =
    participants.find((participant) => participant.id === selectedParticipantId) ?? participants[0] ?? null;

  async function handleAuth(payload: { login: string; password: string; displayName?: string }) {
    setError(null);
    const response = needsBootstrap
      ? await api.bootstrap({
          login: payload.login,
          password: payload.password,
          displayName: payload.displayName?.trim() || payload.login
        })
      : await api.login({ login: payload.login, password: payload.password });
    setToken(response.token);
    setCurrentUser(response.user);
    await loadSnapshot();
  }

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    setToken(null);
    setCurrentUser(null);
    setParticipants([]);
    setEvents([]);
    snapshotGeneration.current += 1;
    appliedRevision.current = 0;
    setActiveView("overview");
  }

  function handleNavigate(view: AppView) {
    if (view === "my-table" && currentUser?.profileId) {
      setSelectedParticipantId(currentUser.profileId);
    }
    setActiveView(view);
  }

  if (isBooting) return <SplashScreen />;
  if (!currentUser) return <AuthScreen api={api} error={error} mode={needsBootstrap ? "bootstrap" : "login"} notice={oauthNotice} onSubmit={handleAuth} />;

  return (
    <AppShell activeView={activeView} currentUser={currentUser} onLogout={handleLogout} onNavigate={handleNavigate}>
      <div className={`sync-status${syncError ? " failed" : ""}`} role={syncError ? "alert" : "status"}>
        <span>{syncError ? `Не удалось обновить данные: ${syncError}` : lastSyncAt ? `Обновлено в ${lastSyncAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Данные ещё не обновлены"}</span>
        <button className="ghost-button" disabled={isSyncing} onClick={() => void checkForUpdates()} type="button">{isSyncing ? "Проверяем..." : "Проверить обновления"}</button>
      </div>
      {error ? <div className="notice danger">{error}</div> : null}
      {oauthNotice ? <div className="notice success" role="status">{oauthNotice}</div> : null}
      {activeView === "overview" ? (
        <OverviewScreen
          api={api}
          events={events}
          participants={participants}
          revision={revision}
          onOpenParticipant={(participantId) => {
            setSelectedParticipantId(participantId);
            setActiveView("my-table");
          }}
        />
      ) : null}
      {activeView === "participants" ? (
        <ParticipantsScreen
          onOpenParticipant={(participantId) => {
            setSelectedParticipantId(participantId);
            setActiveView("my-table");
          }}
          participants={participants}
        />
      ) : null}
      {activeView === "my-table" && selectedParticipant ? (
        <ParticipantTableScreen api={api} currentUser={currentUser} events={events} participant={selectedParticipant} revision={revision} onSaved={loadSnapshot} />
      ) : null}
      {activeView === "events" ? <EventsScreen api={api} events={events} participants={participants} onChanged={loadSnapshot} /> : null}
      {activeView === "management" && currentUser.permissions.includes("user:manage") ? <ManagementScreen api={api} currentUser={currentUser} onChanged={loadSnapshot} revision={revision} /> : null}
      {activeView === "account" ? <AccountScreen api={api} onChanged={loadSnapshot} /> : null}
    </AppShell>
  );
}

function SplashScreen() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="brand-mark">CH</span>
        <h1>CollabHub</h1>
        <p>Подключаем API...</p>
      </section>
    </main>
  );
}

function AuthScreen({
  api,
  error,
  mode,
  notice,
  onSubmit
}: {
  api: ApiClient;
  error: string | null;
  mode: "bootstrap" | "login";
  notice: string | null;
  onSubmit: (payload: { login: string; password: string; displayName?: string }) => Promise<void>;
}) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderStatusDto[]>([]);

  useEffect(() => {
    void api.oauthProviders().then(setOauthProviders).catch(() => undefined);
  }, [api]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ login, password, displayName });
    } catch (unknownError) {
      setLocalError(readError(unknownError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">
          <span className="brand-mark">CH</span>
          <span>
            <b>CollabHub</b>
            <small>{mode === "bootstrap" ? "первичная настройка" : "вход"}</small>
          </span>
        </div>
        <h1>{mode === "bootstrap" ? "Создать Master" : "Вход"}</h1>
        <p>API: {apiBaseUrl}</p>
        <label>
          Логин
          <input autoComplete="username" onChange={(event) => setLogin(event.target.value)} value={login} />
        </label>
        {mode === "bootstrap" ? (
          <label>
            Имя
            <input onChange={(event) => setDisplayName(event.target.value)} value={displayName} />
          </label>
        ) : null}
        <label>
          Пароль
          <input
            autoComplete={mode === "bootstrap" ? "new-password" : "current-password"}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </label>
        {error || localError ? <div className="notice danger">{localError ?? error}</div> : null}
        {notice ? <div className="notice success" role="status">{notice}</div> : null}
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Проверяем..." : mode === "bootstrap" ? "Создать" : "Войти"}
        </button>
        {mode === "login" ? <OAuthActions mode="login" providers={oauthProviders} /> : null}
      </form>
    </main>
  );
}

function OverviewScreen({
  api,
  events,
  participants,
  revision,
  onOpenParticipant
}: {
  api: ApiClient;
  events: EventDto[];
  participants: ParticipantDto[];
  revision: number;
  onOpenParticipant: (participantId: string) => void;
}) {
  const [cells, setCells] = useState<AvailabilityCellDto[]>([]);
  const [selected, setSelected] = useState<{ date: string; hour: number } | null>(null);
  const availabilityGeneration = useRef(0);
  const weekStart = startOfCurrentWeek();

  useEffect(() => {
    const generation = ++availabilityGeneration.current;
    void api.availabilityWeek(weekStart).then((week) => {
      if (generation === availabilityGeneration.current) setCells(week.cells);
    });
    return () => { availabilityGeneration.current += 1; };
  }, [api, weekStart, revision]);

  const selectedDetails = selected ? cells.filter((cell) => cell.date === selected.date && cell.hour === selected.hour) : [];
  const freeNow = countNow(cells, ["free", "stream"]);
  const freeEvening = countEvening(cells);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Общее</h1>
          <p>Один экран, чтобы быстро понять кого можно позвать.</p>
        </div>
      </header>
      <section className="metrics-grid">
        <MetricCard label="Сейчас свободны" value={freeNow} />
        <MetricCard label="Свободны вечером" value={freeEvening} />
        <MetricCard label="Участники" value={participants.length} />
        <MetricCard label="Ивенты" value={events.length} />
      </section>
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Карта недели</h2>
            <p>Цвет показывает шанс быстро собрать людей. Фиолетовая линия означает ивент поверх расписания.</p>
          </div>
          <Legend />
        </header>
        <div className="table-with-panel">
          <AvailabilityGrid
            cells={aggregateCells(cells, participants.length)}
            events={events}
            onSelect={(cell) => setSelected({ date: cell.date, hour: cell.hour })}
          />
          <OverviewDetails
            cells={selectedDetails}
            events={selected ? eventsAt(events, selected.date, selected.hour) : []}
            participants={participants}
          />
        </div>
      </section>
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Участники</h2>
            <p>Открывайте чужие таблицы для просмотра. Редактировать можно только свою или по роли.</p>
          </div>
        </header>
        <ParticipantList onOpenParticipant={onOpenParticipant} participants={participants} />
      </section>
    </>
  );
}

function ParticipantsScreen({ participants, onOpenParticipant }: { participants: ParticipantDto[]; onOpenParticipant: (id: string) => void }) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Участники</h1>
          <p>Люди первичны. У каждого своя таблица, роли и настройки.</p>
        </div>
      </header>
      <ParticipantList onOpenParticipant={onOpenParticipant} participants={participants} />
    </>
  );
}

function ParticipantList({ participants, onOpenParticipant }: { participants: ParticipantDto[]; onOpenParticipant: (id: string) => void }) {
  if (!participants.length) return <div className="empty-state">Пока нет участников.</div>;
  return (
    <div className="participant-grid">
      {participants.map((participant) => (
        <article className="participant-card" key={participant.id}>
          <span className="avatar-dot" style={{ background: participant.color }} />
          <div>
            <h3>{participant.displayName}</h3>
            <p>{participant.interests.length ? participant.interests.join(", ") : "интересы не указаны"}</p>
          </div>
          <button className="secondary-button" onClick={() => onOpenParticipant(participant.id)} type="button">
            Таблица
          </button>
        </article>
      ))}
    </div>
  );
}

function ParticipantTableScreen({
  api,
  currentUser,
  events,
  participant,
  revision,
  onSaved
}: {
  api: ApiClient;
  currentUser: CurrentUserDto;
  events: EventDto[];
  participant: ParticipantDto;
  revision: number;
  onSaved: () => Promise<void>;
}) {
  const [cells, setCells] = useState<AvailabilityCellDto[]>([]);
  const [dirtyCells, setDirtyCells] = useState<Map<string, AvailabilityCellDto>>(new Map());
  const [selectedCell, setSelectedCell] = useState<AvailabilityCellDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const availabilityGeneration = useRef(0);
  const canEdit = currentUser.profileId === participant.id || currentUser.permissions.includes("schedule:edit:all");
  const weekStart = startOfCurrentWeek();

  useEffect(() => {
    const generation = ++availabilityGeneration.current;
    setDirtyCells(new Map());
    setSelectedCell(null);
    setHasPendingUpdate(false);
    setLoadedRevision(null);
    void api.availabilityWeek(weekStart, participant.id).then((week) => {
      if (generation !== availabilityGeneration.current) return;
      setCells(week.cells);
      setLoadedRevision(revision);
    }).catch((err) => {
      if (generation === availabilityGeneration.current) setError(readError(err));
    });
    return () => { availabilityGeneration.current += 1; };
  }, [api, participant.id, weekStart]);

  useEffect(() => {
    if (loadedRevision === null || loadedRevision === revision) return;
    if (dirtyCells.size > 0) {
      setHasPendingUpdate(true);
      return;
    }
    const generation = ++availabilityGeneration.current;
    void api.availabilityWeek(weekStart, participant.id).then((week) => {
      if (generation !== availabilityGeneration.current) return;
      setCells(week.cells);
      setSelectedCell(null);
      setHasPendingUpdate(false);
      setLoadedRevision(revision);
    }).catch((err) => {
      if (generation === availabilityGeneration.current) setError(readError(err));
    });
  }, [api, dirtyCells.size, loadedRevision, participant.id, revision, weekStart]);

  async function discardAndReload() {
    const generation = ++availabilityGeneration.current;
    setError(null);
    try {
      const week = await api.availabilityWeek(weekStart, participant.id);
      if (generation !== availabilityGeneration.current) return;
      setCells(week.cells);
      setDirtyCells(new Map());
      setSelectedCell(null);
      setHasPendingUpdate(false);
      setLoadedRevision(revision);
    } catch (unknownError) {
      if (generation === availabilityGeneration.current) setError(readError(unknownError));
    }
  }

  function updateCell(nextCell: AvailabilityCellDto) {
    setCells((current) => current.map((cell) => (cellKey(cell) === cellKey(nextCell) ? nextCell : cell)));
    setSelectedCell(nextCell);
    setDirtyCells((current) => {
      const next = new Map(current);
      next.set(cellKey(nextCell), nextCell);
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      await api.saveAvailabilityWeek(participant.id, { cells: [...dirtyCells.values()] });
      setDirtyCells(new Map());
      await onSaved();
    } catch (unknownError) {
      setError(readError(unknownError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <header className="page-head compact">
        <div>
          <span className="avatar-dot" style={{ background: participant.color }} />
          <h1>{participant.displayName}</h1>
          <p>{canEdit ? "Редактируйте ячейки и сохраняйте изменения кнопкой." : "Только просмотр. Изменять можно только свою таблицу."}</p>
        </div>
        {dirtyCells.size ? (
          <button className="primary-button" disabled={isSaving} onClick={save} type="button">
            {isSaving ? "Сохраняем..." : `Сохранить ${dirtyCells.size}`}
          </button>
        ) : null}
      </header>
      {error ? <div className="notice danger">{error}</div> : null}
      {hasPendingUpdate ? <div className="notice update-pending" role="status"><span>В расписании есть внешние обновления. Сохраните свои изменения или отмените их, чтобы загрузить свежую версию.</span><button className="ghost-button" onClick={() => void discardAndReload()} type="button">Отменить мои изменения и обновить</button></div> : null}
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Недельная таблица</h2>
            <p>Комментарии видны в боковой панели. В ячейке показывается только цвет и точка.</p>
          </div>
          <Legend />
        </header>
        <div className="table-with-panel">
          <AvailabilityGrid cells={cells} editable={canEdit} events={events} onChange={updateCell} onSelect={setSelectedCell} />
          <CellDetailsPanel canEdit={canEdit} cell={selectedCell} events={selectedCell ? eventsAt(events, selectedCell.date, selectedCell.hour) : []} onChange={updateCell} />
        </div>
      </section>
    </>
  );
}

function EventsScreen({ api, events, participants, onChanged }: { api: ApiClient; events: EventDto[]; participants: ParticipantDto[]; onChanged: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startHour, setStartHour] = useState(20);
  const [endHour, setEndHour] = useState(22);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setError(null);
    try {
      await api.createEvent({ title, date, startHour, endHour, participantIds: selectedIds });
      setTitle("");
      await onChanged();
    } catch (unknownError) {
      setError(readError(unknownError));
    }
  }

  async function respond(eventId: string, status: EventParticipantStatusDto) {
    await api.respondToEvent(eventId, status);
    await onChanged();
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Ивенты</h1>
          <p>Ивенты отдельным слоем. Пользователь может откликаться, но не редактирует чужое без прав.</p>
        </div>
      </header>
      {error ? <div className="notice danger">{error}</div> : null}
      <section className="surface form-surface">
        <h2>Создать ивент</h2>
        <div className="inline-form">
          <input placeholder="Название" value={title} onChange={(event) => setTitle(event.target.value)} />
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <select value={startHour} onChange={(event) => setStartHour(Number(event.target.value))}>{hours.map((label, hour) => <option key={label} value={hour}>{label}</option>)}</select>
          <select value={endHour} onChange={(event) => setEndHour(Number(event.target.value))}>{Array.from({ length: 24 }, (_, i) => i + 1).map((hour) => <option key={hour} value={hour}>{hour.toString().padStart(2, "0")}:00</option>)}</select>
          <button className="primary-button" onClick={create} type="button">Создать</button>
        </div>
        <div className="check-grid">
          {participants.map((participant) => (
            <label key={participant.id}>
              <input
                checked={selectedIds.includes(participant.id)}
                onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, participant.id] : current.filter((id) => id !== participant.id))}
                type="checkbox"
              />
              {participant.displayName}
            </label>
          ))}
        </div>
      </section>
      <div className="event-list">
        {events.map((event) => (
          <article className="event-card" key={event.id}>
            <b>{event.title}</b>
            <span>{event.date} · {hours[event.startHour]}-{event.endHour.toString().padStart(2, "0")}:00</span>
            <div className="event-people">{event.participants.map((link) => <i key={link.profileId} style={{ background: link.color }} title={`${link.displayName}: ${link.status}`} />)}</div>
            <div className="event-actions">
              <button onClick={() => respond(event.id, "going")} type="button">иду</button>
              <button onClick={() => respond(event.id, "maybe")} type="button">возможно</button>
              <button onClick={() => respond(event.id, "no")} type="button">не иду</button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function AccountScreen({ api, onChanged }: { api: ApiClient; onChanged: () => Promise<void> }) {
  const [account, setAccount] = useState<AccountDto | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderStatusDto[]>([]);

  useEffect(() => {
    void api.account().then(setAccount).catch((err) => setError(readError(err)));
    void api.oauthProviders().then(setOauthProviders).catch(() => undefined);
  }, [api]);

  if (!account?.profile) return <div className="empty-state">Профиль загружается...</div>;

  async function save() {
    if (!account?.profile) return;
    setError(null);
    try {
      await api.saveAccount({
        displayName: account.profile.displayName,
        color: account.profile.color,
        interests: account.profile.interests,
        theme: account.preferences?.theme ?? "dark",
        density: account.preferences?.density ?? "normal",
        timezone: account.preferences?.timezone ?? "UTC",
        showEvents: account.preferences?.showEvents ?? true
      });
      setDirty(false);
      await onChanged();
    } catch (unknownError) {
      setError(readError(unknownError));
    }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Кабинет</h1>
          <p>Личные настройки аккаунта и профиля. Дизайн-код позже можно менять отдельно.</p>
        </div>
        {dirty ? <button className="primary-button" onClick={save} type="button">Сохранить</button> : null}
      </header>
      {error ? <div className="notice danger">{error}</div> : null}
      <section className="surface form-surface">
        <label>Имя<input value={account.profile.displayName} onChange={(event) => { setDirty(true); setAccount({ ...account, profile: { ...account.profile!, displayName: event.target.value } }); }} /></label>
        <label>Цвет<input type="color" value={account.profile.color} onChange={(event) => { setDirty(true); setAccount({ ...account, profile: { ...account.profile!, color: event.target.value } }); }} /></label>
        <label>Интересы<input value={account.profile.interests.join(", ")} onChange={(event) => { setDirty(true); setAccount({ ...account, profile: { ...account.profile!, interests: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) } }); }} /></label>
      </section>
      {oauthProviders.some((item) => item.enabled) ? (
        <section className="surface form-surface oauth-link-section">
          <div><h2>Подключённые сервисы</h2><p>Привяжите стриминговый аккаунт, чтобы использовать его для следующего входа.</p></div>
          <OAuthActions mode="link" providers={oauthProviders} />
        </section>
      ) : null}
    </>
  );
}

function OAuthActions({ mode, providers }: { mode: "login" | "link"; providers: OAuthProviderStatusDto[] }) {
  const enabled = providers.filter((item) => item.enabled);
  if (!enabled.length) return null;
  return (
    <div className="oauth-actions">
      <span>{mode === "login" ? "Или продолжить через" : "Доступные подключения"}</span>
      {enabled.map(({ provider }) => (
        <button className="secondary-button" key={provider} onClick={() => window.location.assign(`${apiBaseUrl}/oauth/${provider}/start?mode=${mode}`)} type="button">
          {mode === "login" ? "Войти" : "Привязать"} через {oauthProviderLabel(provider)}
        </button>
      ))}
    </div>
  );
}

function oauthProviderLabel(provider: string | null) {
  if (provider === "twitch") return "Twitch";
  if (provider === "youtube") return "YouTube";
  return "внешний сервис";
}

const roleHierarchy = ["master", "head_admin", "admin", "manager", "teamlead", "member", "viewer"] as const;
const roleLabels: Record<string, string> = {
  master: "Владелец",
  head_admin: "Главный администратор",
  admin: "Администратор",
  manager: "Организатор",
  teamlead: "Тимлид",
  member: "Участник",
  viewer: "Наблюдатель"
};
const roleDescriptions: Record<string, string> = {
  master: "Владелец системы — изменение запрещено.",
  head_admin: "Управляет сообществом и администраторами.",
  admin: "Управляет участниками, расписанием и событиями.",
  manager: "Организует события и общие активности.",
  teamlead: "Работает с составом и событиями своей команды.",
  member: "Ведёт профиль, расписание и участвует в событиях.",
  viewer: "Только просматривает разрешённые данные."
};

function ManagementScreen({ api, currentUser, onChanged, revision }: { api: ApiClient; currentUser: CurrentUserDto; onChanged: () => Promise<void>; revision: number }) {
  const [users, setUsers] = useState<ManagedUserDto[]>([]);
  const [login, setLogin] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("member");
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadUsers = useCallback(async () => {
    setError(null);
    try {
      setUsers(await api.users());
    } catch (unknownError) {
      setError(readError(unknownError));
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers, revision]);

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setGeneratedPassword(null);
    setIsCreating(true);
    const password = generatePassword();
    try {
      const created = await api.createUser({ login: login.trim(), displayName: displayName.trim(), role, password });
      setGeneratedPassword(password);
      setNotice(`Участник ${created.login} добавлен. Передайте ему временный пароль сейчас.`);
      setLogin("");
      setDisplayName("");
      setRole("member");
      await Promise.all([loadUsers(), onChanged()]);
    } catch (unknownError) {
      setError(readError(unknownError));
    } finally {
      setIsCreating(false);
    }
  }

  const actorRank = roleHierarchy.indexOf(currentUser.role as (typeof roleHierarchy)[number]);
  const roles = roleHierarchy.slice(Math.max(0, actorRank) + 1);
  const visibleUsers = users.filter((user) => {
    const search = query.trim().toLocaleLowerCase();
    const matchesSearch = !search || user.login.toLocaleLowerCase().includes(search) || user.profile?.displayName.toLocaleLowerCase().includes(search);
    return matchesSearch && (roleFilter === "all" || user.role === roleFilter) && (statusFilter === "all" || user.status === statusFilter);
  });

  return (
    <>
      <header className="page-head">
        <div><h1>Управление участниками</h1><p>Добавляйте людей в сообщество и выдавайте им подходящую стартовую роль.</p></div>
      </header>
      {error ? <div className="notice danger" role="alert">{error}</div> : null}
      {notice ? <div className="notice success" role="status">{notice}</div> : null}
      {generatedPassword ? (
        <section className="credential-card" aria-label="Временный пароль">
          <div><b>Временный пароль</b><p>Он показывается только сейчас. Скопируйте и передайте его участнику безопасным способом.</p></div>
          <code>{generatedPassword}</code>
          <button className="secondary-button" onClick={() => void navigator.clipboard.writeText(generatedPassword)} type="button">Копировать</button>
          <button className="ghost-button" onClick={() => setGeneratedPassword(null)} type="button">Я сохранил пароль</button>
        </section>
      ) : null}
      <section className="management-layout">
        <form className="surface form-surface management-form" onSubmit={createUser}>
          <div><h2>Новый участник</h2><p>Пароль будет создан автоматически после добавления.</p></div>
          <label>Логин<input autoComplete="off" minLength={2} maxLength={64} required value={login} onChange={(event) => setLogin(event.target.value)} /></label>
          <label>Отображаемое имя<input minLength={2} maxLength={80} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
          <label>Роль<select value={role} onChange={(event) => setRole(event.target.value)}>{roles.map((item) => <option key={item} value={item}>{roleLabels[item] ?? item}</option>)}</select></label>
          <button className="primary-button" disabled={isCreating} type="submit">{isCreating ? "Добавляем..." : "Добавить участника"}</button>
        </form>
        <section className="surface managed-users">
          <header className="surface-head"><div><h2>Люди сообщества</h2><p>{isLoading ? "Загружаем список..." : `${users.length} аккаунтов`}</p></div><button className="ghost-button" disabled={isLoading} onClick={() => { setIsLoading(true); void loadUsers(); }} type="button">Обновить</button></header>
          <div className="management-filters">
            <label>Поиск<input placeholder="Имя или логин" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label>Роль<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="all">Все роли</option>{Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <label>Статус<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Все статусы</option><option value="active">Активные</option><option value="disabled">Неактивные</option></select></label>
          </div>
          {!isLoading && !users.length ? <div className="empty-state">Пока нет участников.</div> : null}
          {!isLoading && users.length > 0 && !visibleUsers.length ? <div className="empty-state">По этим фильтрам никто не найден.</div> : null}
          <div className="managed-user-list">
            {visibleUsers.map((user) => <ManagedUserRow api={api} currentUser={currentUser} key={user.id} onSaved={async () => { await Promise.all([loadUsers(), onChanged()]); }} roleOptions={roles} user={user} />)}
          </div>
        </section>
      </section>
    </>
  );
}

function ManagedUserRow({ api, currentUser, onSaved, roleOptions, user }: { api: ApiClient; currentUser: CurrentUserDto; onSaved: () => Promise<void>; roleOptions: readonly string[]; user: ManagedUserDto }) {
  const [displayName, setDisplayName] = useState(user.profile?.displayName ?? "");
  const [role, setRole] = useState(user.role);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<"active" | "disabled" | null>(null);
  const [confirmPasswordReset, setConfirmPasswordReset] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const isSelf = user.login === currentUser.login;
  const isMasterAccount = user.role === "master";
  const actorRank = roleHierarchy.indexOf(currentUser.role as (typeof roleHierarchy)[number]);
  const targetRank = roleHierarchy.indexOf(user.role as (typeof roleHierarchy)[number]);
  const isAtOrAboveHierarchy = targetRank >= 0 && actorRank >= 0 && targetRank <= actorRank;
  const protectedAccount = isSelf || isMasterAccount || isAtOrAboveHierarchy;
  const dirty = displayName.trim() !== (user.profile?.displayName ?? "") || role !== user.role;

  useEffect(() => {
    setDisplayName(user.profile?.displayName ?? "");
    setRole(user.role);
  }, [user.profile?.displayName, user.role]);

  async function update(payload: { role?: string; status?: "active" | "disabled"; displayName?: string }) {
    setError(null);
    setIsSaving(true);
    try {
      await api.updateUser(user.id, payload);
      setConfirmStatus(null);
      await onSaved();
    } catch (unknownError) {
      setError(readError(unknownError));
    } finally {
      setIsSaving(false);
    }
  }

  async function resetPassword() {
    const password = generatePassword();
    setError(null);
    setIsSaving(true);
    try {
      await api.resetUserPassword(user.id, password);
      setTemporaryPassword(password);
      setConfirmPasswordReset(false);
    } catch (unknownError) {
      setError(readError(unknownError));
    } finally {
      setIsSaving(false);
    }
  }

  const nextStatus = user.status === "active" ? "disabled" : "active";
  return (
    <article className={`managed-user-row${dirty ? " dirty" : ""}`}>
      <div className="managed-user-identity"><span className="avatar-dot" style={{ background: user.profile?.color ?? "var(--color-unknown)" }} /><div><b>{user.profile?.displayName ?? user.login}</b><small>@{user.login}</small></div></div>
      <label>Имя<input disabled={protectedAccount || isSaving} maxLength={80} minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>Роль<select disabled={protectedAccount || isSaving} title={roleDescriptions[role]} value={role} onChange={(event) => setRole(event.target.value)}>{!roleOptions.includes(role) ? <option value={role}>{roleLabels[role] ?? role}</option> : null}{roleOptions.map((item) => <option key={item} value={item}>{roleLabels[item]}</option>)}</select><small>{roleDescriptions[role]}</small></label>
      <div className="managed-user-state"><span className={`status-badge ${user.status}`}>{user.status === "active" ? "Активен" : "Неактивен"}</span>{protectedAccount ? <small>{isSelf ? "Это ваш аккаунт" : isMasterAccount ? "Владелец защищён" : "Недоступно по иерархии ролей"}</small> : null}</div>
      <div className="managed-user-actions">
        {dirty ? <><span className="unsaved-label">Есть изменения</span><button className="primary-button" disabled={isSaving || displayName.trim().length < 2} onClick={() => void update({ displayName: displayName.trim(), role })} type="button">{isSaving ? "Сохраняем..." : "Сохранить"}</button><button className="ghost-button" disabled={isSaving} onClick={() => { setDisplayName(user.profile?.displayName ?? ""); setRole(user.role); setError(null); }} type="button">Отменить</button></> : null}
        {!protectedAccount && !dirty ? <><button className="ghost-button" disabled={isSaving} onClick={() => { setConfirmPasswordReset(false); setConfirmStatus(nextStatus); }} type="button">{nextStatus === "disabled" ? "Деактивировать" : "Активировать"}</button><button className="ghost-button" disabled={isSaving} onClick={() => { setConfirmStatus(null); setConfirmPasswordReset(true); }} type="button">Сбросить пароль</button></> : null}
      </div>
      {confirmStatus ? <div className="inline-confirm" role="alert"><p>{confirmStatus === "disabled" ? "Отключить вход и доступ этого участника? Данные профиля сохранятся." : "Вернуть участнику доступ к CollabHub?"}</p><button className={confirmStatus === "disabled" ? "danger-button" : "primary-button"} disabled={isSaving} onClick={() => void update({ status: confirmStatus })} type="button">{isSaving ? "Применяем..." : "Подтвердить"}</button><button className="ghost-button" disabled={isSaving} onClick={() => setConfirmStatus(null)} type="button">Отмена</button></div> : null}
      {confirmPasswordReset ? <div className="inline-confirm" role="alert"><p>Создать новый временный пароль для @{user.login}? Все активные сессии участника будут завершены.</p><button className="danger-button" disabled={isSaving} onClick={() => void resetPassword()} type="button">{isSaving ? "Сбрасываем..." : "Сбросить пароль"}</button><button className="ghost-button" disabled={isSaving} onClick={() => setConfirmPasswordReset(false)} type="button">Отмена</button></div> : null}
      {temporaryPassword ? <div className="row-credential" role="status"><div><b>Новый временный пароль для @{user.login}</b><small>Он показывается только сейчас. Передайте его безопасным способом.</small></div><code>{temporaryPassword}</code><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(temporaryPassword)} type="button">Копировать</button><button className="ghost-button" onClick={() => setTemporaryPassword(null)} type="button">Я сохранил пароль</button></div> : null}
      {error ? <div className="row-error" role="alert">{error}</div> : null}
    </article>
  );
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const values = crypto.getRandomValues(new Uint32Array(16));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

function CellDetailsPanel({ canEdit, cell, events, onChange }: { canEdit: boolean; cell: AvailabilityCellDto | null; events: EventDto[]; onChange: (cell: AvailabilityCellDto) => void }) {
  if (!cell) return <aside className="cell-panel"><h3>Ячейка</h3><p>Выберите час в таблице.</p></aside>;
  return (
    <aside className="cell-panel">
      <h3>{formatCellDate(cell.date)} · {hours[cell.hour]}</h3>
      <div className="status-picker">
        {statuses.map((status) => (
          <button className={cell.status === status ? "active" : ""} disabled={!canEdit} key={status} onClick={() => onChange({ ...cell, status })} type="button">
            <i className={`key ${status}`} />{statusLabels[status]}
          </button>
        ))}
      </div>
      <label className="comment-field">
        Комментарий
        <textarea disabled={!canEdit} maxLength={500} onChange={(event) => onChange({ ...cell, comment: event.target.value })} value={cell.comment} />
      </label>
      {events.length ? <EventMiniList events={events} /> : null}
    </aside>
  );
}

function OverviewDetails({ cells, events, participants }: { cells: AvailabilityCellDto[]; events: EventDto[]; participants: ParticipantDto[] }) {
  const byId = new Map(participants.map((item) => [item.id, item.displayName]));
  return (
    <aside className="cell-panel">
      <h3>Детали</h3>
      <DetailGroup title="Свободны" names={cells.filter((cell) => cell.status === "free" || cell.status === "stream").map((cell) => byId.get(cell.profileId) ?? cell.profileId)} />
      <DetailGroup title="Возможно" names={cells.filter((cell) => cell.status === "maybe").map((cell) => byId.get(cell.profileId) ?? cell.profileId)} />
      <DetailGroup title="Заняты" names={cells.filter((cell) => ["busy", "work", "study"].includes(cell.status)).map((cell) => byId.get(cell.profileId) ?? cell.profileId)} />
      {events.length ? <EventMiniList events={events} /> : null}
    </aside>
  );
}

function DetailGroup({ title, names }: { title: string; names: string[] }) {
  return <div><b>{title}</b><p>{names.length ? names.join(", ") : "нет"}</p></div>;
}

function EventMiniList({ events }: { events: EventDto[] }) {
  return <div className="mini-events"><b>Ивенты</b>{events.map((event) => <span key={event.id}>{event.title}</span>)}</div>;
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong></article>;
}

function Legend() {
  return <div className="legend">{statuses.map((status) => <span key={status}><i className={`key ${status}`} />{statusLabels[status]}</span>)}<span><i className="key event" />Ивент</span></div>;
}

function AvailabilityGrid({ cells, editable = false, events = [], onChange, onSelect }: { cells: AvailabilityCellDto[]; editable?: boolean; events?: EventDto[]; onChange?: (cell: AvailabilityCellDto) => void; onSelect?: (cell: AvailabilityCellDto) => void }) {
  const cellMap = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const weekStart = startOfCurrentWeek();
  return (
    <div className="availability-grid" role="table" aria-label="Недельная таблица">
      <div className="cell head" />
      {days.map((day, index) => <div className="cell head" key={day}>{day} {addDays(weekStart, index).slice(5)}</div>)}
      {hours.map((hourLabel, hour) => (
        <div className="availability-row" key={hourLabel} role="row">
          <div className="cell time">{hourLabel}</div>
          {days.map((day, dayIndex) => {
            const date = addDays(weekStart, dayIndex);
            const cell = cellMap.get(`${date}:${hour}`) ?? { profileId: "aggregate", date, hour, status: "unknown" as const, comment: "" };
            const hasEvent = eventsAt(events, date, hour).length > 0;
            return (
              <button className={`cell slot ${cell.status}${cell.comment ? " has-comment" : ""}${hasEvent ? " has-event" : ""}`} key={`${day}-${hour}`} onClick={() => {
                const nextCell = editable ? { ...cell, status: nextStatus(cell.status) } : cell;
                if (editable) onChange?.(nextCell);
                onSelect?.(nextCell);
              }} title={`${day} ${hourLabel}: ${statusLabels[cell.status]}`} type="button" />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function aggregateCells(cells: AvailabilityCellDto[], totalParticipants: number) {
  const grouped = new Map<string, AvailabilityCellDto[]>();
  cells.forEach((cell) => {
    const key = `${cell.date}:${cell.hour}`;
    grouped.set(key, [...(grouped.get(key) ?? []), cell]);
  });
  return [...grouped.entries()].map(([key, group]) => {
    const [date = startOfCurrentWeek(), hour = "0"] = key.split(":");
    return { profileId: "aggregate", date, hour: Number(hour), status: aggregateStatus(group, totalParticipants), comment: "" };
  });
}

function aggregateStatus(cells: AvailabilityCellDto[], totalParticipants: number): AvailabilityStatusDto {
  const free = cells.filter((cell) => cell.status === "free" || cell.status === "stream").length;
  const maybe = cells.filter((cell) => cell.status === "maybe").length;
  const busy = cells.filter((cell) => ["busy", "work", "study"].includes(cell.status)).length;
  if (totalParticipants <= 0) return "unknown";
  if (free >= Math.ceil(totalParticipants * 0.55)) return "free";
  if (free > 0) return "stream";
  if (maybe > 0) return "maybe";
  if (busy > 0) return "busy";
  return "unknown";
}

function eventsAt(events: EventDto[], date: string, hour: number) {
  return events.filter((event) => event.date === date && event.startHour <= hour && event.endHour > hour);
}

function countNow(cells: AvailabilityCellDto[], accepted: AvailabilityStatusDto[]) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const hour = now.getHours();
  return cells.filter((cell) => cell.date === date && cell.hour === hour && accepted.includes(cell.status)).length;
}

function countEvening(cells: AvailabilityCellDto[]) {
  const today = new Date().toISOString().slice(0, 10);
  return new Set(cells.filter((cell) => cell.date === today && cell.hour >= 18 && (cell.status === "free" || cell.status === "stream")).map((cell) => cell.profileId)).size;
}

function nextStatus(status: AvailabilityStatusDto) {
  const index = statuses.indexOf(status);
  return statuses[(index + 1) % statuses.length] ?? "unknown";
}

function cellKey(cell: Pick<AvailabilityCellDto, "date" | "hour">) {
  return `${cell.date}:${cell.hour}`;
}

function startOfCurrentWeek() {
  const date = new Date();
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, daysToAdd: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}

function formatCellDate(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  return `${days[(date.getUTCDay() + 6) % 7]} ${dateKey.slice(5)}`;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Что-то пошло не так";
}
