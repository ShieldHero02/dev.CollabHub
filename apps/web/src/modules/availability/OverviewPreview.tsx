import { Fragment } from "react";

const hours = ["18:00", "19:00", "20:00", "21:00", "22:00"];
const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const states = ["some-free", "busy", "unknown", "many-free", "maybe"];

export function OverviewPreview() {
  return (
    <section className="surface">
      <header className="surface-head">
        <div>
          <h2>Карта доступности</h2>
          <p>Первый модуль v2: агрегированная доступность поверх расписаний участников.</p>
        </div>
        <div className="legend">
          <span><i className="key many-free" />много свободных</span>
          <span><i className="key some-free" />есть свободные</span>
          <span><i className="key maybe" />возможно</span>
          <span><i className="key busy" />заняты</span>
        </div>
      </header>
      <div className="preview-grid" role="table" aria-label="Превью карты доступности">
        <div className="cell head" />
        {days.map((day) => <div className="cell head" key={day}>{day}</div>)}
        {hours.map((hour, row) => (
          <Fragment key={hour}>
            <div className="cell time" key={`${hour}-label`}>{hour}</div>
            {days.map((day, col) => {
              const state = states[(row + col) % states.length];
              return <button className={`cell slot ${state}`} key={`${day}-${hour}`} title={`${day} ${hour}`} />;
            })}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
