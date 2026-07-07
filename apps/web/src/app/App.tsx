import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurrentUserDto, ParticipantDto } from "@collabhub/shared-types";
import { AppShell, type AppView } from "../shared/AppShell.js";
import { ApiClient, apiBaseUrl } from "../shared/api.js";

const tokenStorageKey = "collabhub.v2.token";
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
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
    if (nextToken) {
      localStorage.setItem(tokenStorageKey, nextToken);
    } else {
      localStorage.removeItem(tokenStorageKey);
    }
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

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    void loadParticipants().catch((unknownError) => setError(readError(unknownError)));
  }, [currentUser, loadParticipants]);

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
  }

  async function handleLogout() {
    setError(null);
    await api.logout().catch(() => undefined);
    setToken(null);
    setCurrentUser(null);
    setParticipants([]);
    setActiveView("overview");
  }

  if (isBooting) {
    return <SplashScreen />;
  }

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
        <ParticipantTableScreen participant={selectedParticipant} />
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

type OverviewScreenProps = {
  currentUser: CurrentUserDto;
  onOpenParticipant: (participantId: string) => void;
  participants: ParticipantDto[];
};

function OverviewScreen({ currentUser, onOpenParticipant, participants }: OverviewScreenProps) {
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Общее</h1>
          <p>Первый API-экран v2: авторизация, роли и участники уже приходят с backend.</p>
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
            <p>Сейчас это нейтральная сетка. Следующий API-слой подключит реальные слоты и комментарии.</p>
          </div>
          <Legend />
        </header>
        <AvailabilityGrid />
      </section>
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Участники</h2>
            <p>Открывайте личную таблицу участника для просмотра.</p>
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
          <p>Список профилей из базы данных v2.</p>
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
  if (participants.length === 0) {
    return <div className="empty-state">Пока нет участников.</div>;
  }

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

function ParticipantTableScreen({ participant }: { participant: ParticipantDto }) {
  return (
    <>
      <header className="page-head compact">
        <div>
          <span className="avatar-dot" style={{ background: participant.color }} />
          <h1>{participant.displayName}</h1>
          <p>{participant.interests.length ? participant.interests.join(", ") : "интересы не указаны"}</p>
        </div>
      </header>
      <section className="surface">
        <header className="surface-head">
          <div>
            <h2>Личная таблица</h2>
            <p>Просмотр подключен. Редактирование появится после API расписаний.</p>
          </div>
        </header>
        <AvailabilityGrid />
      </section>
    </>
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
      <span><i className="key many-free" />много свободных</span>
      <span><i className="key some-free" />есть свободные</span>
      <span><i className="key maybe" />возможно</span>
      <span><i className="key busy" />заняты</span>
      <span><i className="key unknown" />нет данных</span>
    </div>
  );
}

function AvailabilityGrid() {
  return (
    <div className="availability-grid" role="table" aria-label="Недельная таблица доступности">
      <div className="cell head" />
      {days.map((day) => (
        <div className="cell head" key={day}>
          {day}
        </div>
      ))}
      {hours.map((hour) => (
        <div className="availability-row" key={hour} role="row">
          <div className="cell time">{hour}</div>
          {days.map((day) => (
            <button className="cell slot unknown" key={`${day}-${hour}`} title={`${day} ${hour}: нет данных`} />
          ))}
        </div>
      ))}
    </div>
  );
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Что-то пошло не так";
}
