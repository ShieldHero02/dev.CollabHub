import { aggregateAvailability, type AvailabilitySlot } from "@collabhub/domain";
import { AppShell } from "../shared/AppShell.js";
import { OverviewPreview } from "../modules/availability/OverviewPreview.js";

const demoSlots: AvailabilitySlot[] = [
  { profileId: "anna", date: "2026-07-06", hour: 20, status: "free" },
  { profileId: "max", date: "2026-07-06", hour: 20, status: "maybe" },
  { profileId: "leo", date: "2026-07-06", hour: 20, status: "busy" }
];

export function App() {
  const aggregate = aggregateAvailability(demoSlots, 3);

  return (
    <AppShell>
      <section className="hero-panel">
        <div>
          <p className="eyebrow">CollabHub v2 alpha</p>
          <h1>Быстро понять, кого можно позвать</h1>
          <p>
            Новый каркас отделяет дизайн, бизнес-логику, API и базу данных. Эта страница пока
            показывает направление интерфейса, а не финальную фичу.
          </p>
        </div>
        <div className="status-card">
          <span>Проверка domain logic</span>
          <strong>{aggregate}</strong>
        </div>
      </section>
      <OverviewPreview />
    </AppShell>
  );
}

