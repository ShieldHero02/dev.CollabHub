import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AvailabilityCellDto,
  AvailabilityStatusDto,
  CurrentUserDto,
  ParticipantDto
} from "@collabhub/shared-types";
import { AppShell, type AppView } from "../shared/AppShell.js";
import { ApiClient, apiBaseUrl } from "../shared/api.js";

const tokenStorageKey = "collabhub.v2.token";
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const statuses: AvailabilityStatusDto[] = ["unknown", "free", "maybe", "busy", "stream", "work", "study"];
const statusLabels: Record<AvailabilityStatusDto, string> = {
  free: "Свободен",
  busy: "Занят",
  maybe: "Возможно",
  stream: "Стрим",
  work: "Работа",
  study: "Учеба",
  unknown: "Нет данных"
};
const hours = Array.from({ length: 24 }, (_, hour) => `${hour.toString().padStart(2, "0")}:00`);

export function App() {
  const [token, setTokenState] = useState(() => localStorage.getItem(tokenStorageKey));
  const [currentUser, setCurrentUser] = useState<CurrentUserDto | null>(null);
  const [participants, setParticipants] = useState<ParticipantDto[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => new ApiClient(token), [token]);

  const setToken = useCallback((nextToken: string | null) => {
    if (nextToken) localStorage.setItem(tokenStorageKey, nextToken);
    else localStorage.removeItem(tokenStorageKey);
    setTokenState(nextToken);
  }, []);

  const loadParticipants = useCallback(async () => {
    const nextParticipants = await api.participants();
    setParticipants(nextParticipants);
    setSelectedParticipantId((currentId) => currentId ?? nextParticipants[0]?.id ?? null);
  }, [api]);

  const loadSession = useCallback(async () => {
    setError(null);
    const [setupStatus, me] = await Promise.all([api.setupStatus(), api.me()]);
    setNeedsBootstrap(setupStatus.needsBootstrap);

    if (me.authenticated && me.user) {
      setCurrentUser(me.user);
      await loadParticipants();
    } else {
      setCurrentUser(null);
      setParticipants([]);
    }
  }, [api, loadParticipants]);

  useEffect(() => {
    void loadSession()
      .catch((unknownError) => {
        setError(readError(unknownError));
        setCurrentUser(null);
      })
      .finally(() => setIsBooting(false));
  }, [loadSession]);

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
    await loadParticipants();
  }

  async function handleLogout() {
    setError(null);
    await api.logout().catch(() => undefined);
    setToken(null);
    setCurrentUser(null);
    setParticipants([]);
    setActiveView("overview");
  }

  if (isBooting) return <SplashScreen />;

  if (!currentUser) {
    return (
      <AuthScreen
        error={error}
        mode={needsBootstrap ? "bootstrap" : "login"}
        onSubmit={handleAuth}
      />
    );
  }

  return (
    <AppShell
      activeView={activeView}
      currentUser={currentUser}
      onLogout={handleLogout}
      onNavigate={setActiveView}
    >
      {error ? <div className="notice danger">{error}</div> : null}
      {activeView === "overview" ? (
        <OverviewScreen
          api={api}
          currentUser={currentUser}
          onOpenParticipant={(participantId) => {
            setSelectedParticipantId(participantId);
            setActiveView("member");
          }}
          participants={participants}
        />
      ) : null}
      {activeView === "participants" ? (
        <ParticipantsScreen
          onOpenParticipant={(participantId) => {
            setSelectedParticipantId(participantId);
            setActiveView("member");
          }}
          participants={participants}
        />
      ) : null}
      {activeView === "member" && selectedParticipant ? (
        <ParticipantTableScreen api={api} currentUser={currentUser} participant={selectedParticipant} />
      ) : null}
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

type AuthScreenProps = {
  error: string | null;
  mode: "bootstrap" | "login";
  onSubmit: (payload: { login: string; password: string; displayName?: string }) => Promise<void>;
};

function AuthScreen({ error, mode, onSubmit }: AuthScreenProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

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
        <h1>{mode === "bootstrap" ? "Создать master" : "Вход"}</h1>
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
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Проверяем..." : mode === "bootstrap" ? "Создать" : "Войти"}
        </button>
      </form>
    </main>
  );
}

function OverviewScreen({
  api,
  currentUser,
  onOpenParticipant,
  participants
}: {
  api: ApiClient;
  currentUser: CurrentUserDto;
  onOpenParticipant: (participantId: string) => void;
  participants: ParticipantDto[];
}) {
  const [cells, setCells] = useState<AvailabilityCellDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    void api.availabilityWeek(startOfCurrentWeek())
      .then((week) => setCells(week.cells))
      .finally(() => setIsLoading(false));
  }, [api]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Общее</h1>
          <p>Сводка строится из backend и базы данных. Локальный браузер больше не источник правды.</p>
        </div>
      </header>
      <section className="metrics-grid">
        <MetricCard label="Участников" value={participants.length} />
        <MetricCard label="Роль" value={currentUser.role} />
        <MetricCard label="Права" value={currentUser.permissions.length} />
      </section>
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Карта недели</h2>
            <p>{isLoading ? "Загружаем расписание..." : "Агрегированная доступность по всем видимым участникам."}</p>
          </div>
          <Legend />
        </header>
        <AvailabilityGrid cells={aggregateCells(cells, participants.length)} />
      </section>
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Участники</h2>
            <p>Откройте личную таблицу участника для просмотра или редактирования по правам.</p>
          </div>
        </header>
        <ParticipantList onOpenParticipant={onOpenParticipant} participants={participants} />
      </section>
    </>
  );
}

function ParticipantsScreen({
  onOpenParticipant,
  participants
}: {
  onOpenParticipant: (participantId: string) => void;
  participants: ParticipantDto[];
}) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Участники</h1>
          <p>Профили из базы данных v2.</p>
        </div>
      </header>
      <ParticipantList onOpenParticipant={onOpenParticipant} participants={participants} />
    </>
  );
}

function ParticipantList({
  onOpenParticipant,
  participants
}: {
  onOpenParticipant: (participantId: string) => void;
  participants: ParticipantDto[];
}) {
  if (participants.length === 0) return <div className="empty-state">Пока нет участников.</div>;

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
  participant
}: {
  api: ApiClient;
  currentUser: CurrentUserDto;
  participant: ParticipantDto;
}) {
  const [cells, setCells] = useState<AvailabilityCellDto[]>([]);
  const [dirtyCells, setDirtyCells] = useState<Map<string, AvailabilityCellDto>>(new Map());
  const [selectedCell, setSelectedCell] = useState<AvailabilityCellDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canEdit =
    currentUser.profileId === participant.id ||
    currentUser.permissions.includes("schedule:edit:all");

  useEffect(() => {
    setIsLoading(true);
    setError(null);
    setDirtyCells(new Map());
    setSelectedCell(null);
    void api.availabilityWeek(startOfCurrentWeek(), participant.id)
      .then((week) => setCells(week.cells))
      .catch((unknownError) => setError(readError(unknownError)))
      .finally(() => setIsLoading(false));
  }, [api, participant.id]);

  function updateCell(nextCell: AvailabilityCellDto) {
    setCells((current) => current.map((cell) => cellKey(cell) === cellKey(nextCell) ? nextCell : cell));
    setSelectedCell(nextCell);
    setDirtyCells((current) => {
      const next = new Map(current);
      next.set(cellKey(nextCell), nextCell);
      return next;
    });
  }

  async function save() {
    setError(null);
    setIsSaving(true);
    try {
      await api.saveAvailabilityWeek(participant.id, {
        cells: [...dirtyCells.values()].map((cell) => ({
          date: cell.date,
          hour: cell.hour,
          status: cell.status,
          comment: cell.comment
        }))
      });
      setDirtyCells(new Map());
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
          <p>{participant.interests.length ? participant.interests.join(", ") : "интересы не указаны"}</p>
        </div>
        {dirtyCells.size > 0 ? (
          <button className="primary-button" disabled={isSaving} onClick={save} type="button">
            {isSaving ? "Сохраняем..." : `Сохранить ${dirtyCells.size}`}
          </button>
        ) : null}
      </header>
      {error ? <div className="notice danger">{error}</div> : null}
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Личная таблица</h2>
            <p>{isLoading ? "Загружаем неделю..." : canEdit ? "Клик по ячейке меняет статус и открывает детали. Сохранение только по кнопке." : "Только просмотр."}</p>
          </div>
          <Legend />
        </header>
        <div className="table-with-panel">
          <AvailabilityGrid cells={cells} editable={canEdit} onChange={updateCell} onSelect={setSelectedCell} />
          <CellDetailsPanel canEdit={canEdit} cell={selectedCell} onChange={updateCell} />
        </div>
      </section>
    </>
  );
}

function CellDetailsPanel({
  canEdit,
  cell,
  onChange
}: {
  canEdit: boolean;
  cell: AvailabilityCellDto | null;
  onChange: (cell: AvailabilityCellDto) => void;
}) {
  if (!cell) {
    return (
      <aside className="cell-panel">
        <h3>Ячейка</h3>
        <p>Выберите час в таблице.</p>
      </aside>
    );
  }

  return (
    <aside className="cell-panel">
      <h3>{formatCellDate(cell.date)} · {hours[cell.hour]}</h3>
      <div className="status-picker">
        {statuses.map((status) => (
          <button
            className={cell.status === status ? "active" : ""}
            disabled={!canEdit}
            key={status}
            onClick={() => onChange({ ...cell, status })}
            type="button"
          >
            <i className={`key ${status}`} />
            {statusLabels[status]}
          </button>
        ))}
      </div>
      <label className="comment-field">
        Комментарий
        <textarea
          disabled={!canEdit}
          maxLength={500}
          onChange={(event) => onChange({ ...cell, comment: event.target.value })}
          placeholder="Что важно знать в это время"
          value={cell.comment}
        />
      </label>
    </aside>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Legend() {
  return (
    <div className="legend">
      {statuses.map((status) => (
        <span key={status}><i className={`key ${status}`} />{statusLabels[status]}</span>
      ))}
    </div>
  );
}

function AvailabilityGrid({
  cells,
  editable = false,
  onChange,
  onSelect
}: {
  cells: AvailabilityCellDto[];
  editable?: boolean;
  onChange?: (cell: AvailabilityCellDto) => void;
  onSelect?: (cell: AvailabilityCellDto) => void;
}) {
  const cellMap = new Map(cells.map((cell) => [cellKey(cell), cell]));
  const weekStart = startOfCurrentWeek();

  return (
    <div className="availability-grid" role="table" aria-label="Недельная таблица доступности">
      <div className="cell head" />
      {days.map((day, index) => (
        <div className="cell head" key={day}>
          {day} {addDays(weekStart, index).slice(5)}
        </div>
      ))}
      {hours.map((hourLabel, hour) => (
        <div className="availability-row" key={hourLabel} role="row">
          <div className="cell time">{hourLabel}</div>
          {days.map((day, dayIndex) => {
            const date = addDays(weekStart, dayIndex);
            const cell = cellMap.get(`${date}:${hour}`) ?? {
              profileId: "aggregate",
              date,
              hour,
              status: "unknown" as const,
              comment: ""
            };
            return (
              <button
                className={`cell slot ${cell.status}${cell.comment ? " has-comment" : ""}`}
                disabled={!editable && !onSelect}
                key={`${day}-${hourLabel}`}
                onClick={() => {
                  const nextCell = editable ? { ...cell, status: nextStatus(cell.status) } : cell;
                  if (editable) onChange?.(nextCell);
                  onSelect?.(nextCell);
                }}
                title={`${day} ${hourLabel}: ${statusLabels[cell.status]}${cell.comment ? `, ${cell.comment}` : ""}`}
                type="button"
              />
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
    return {
      profileId: "aggregate",
      date,
      hour: Number(hour),
      status: aggregateStatus(group, totalParticipants),
      comment: ""
    };
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
