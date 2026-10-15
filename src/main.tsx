import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Droplets,
  LayoutDashboard,
  CalendarDays,
  Map,
  History,
  Settings,
  Plus,
  ArrowRight,
  ArrowUpRight,
  Clock,
  WifiOff,
  CheckCircle2,
  Leaf,
  X,
  Pause,
  Play,
  Download,
  Menu,
  House,
  ListChecks,
  Building2,
  Shield,
  Tractor,
  Package,
  Sprout,
  Beef,
  Wallet,
  ChartNoAxesCombined,
  MapPinned,
  Files,
  Lightbulb,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { load, save, originalBackup, clearLocalData } from "./storage";
import {
  empty,
  elapsed,
  remaining,
  suggestion,
  validate,
  conflicts,
  csv,
  type Data,
  type Session,
} from "./model";
import { demo } from "./demo";
import "./style.css";
import { Editor } from "./Editor";
import { duration } from "./format";
import { FarmScreen } from "./farmos/FarmScreen";
import { OperationsScreen } from "./farmos/OperationsScreen";
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("An update is ready. Reload WaterTurn now?"))
      void updateSW(true);
  },
});
function App() {
  const [d, setD] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState("Farm Home"),
    [now, setNow] = useState(Date.now()),
    [online, setOnline] = useState(navigator.onLine),
    [moreOpen, setMoreOpen] = useState(false),
    [modal, setModal] = useState<null | { type: string; id?: string }>(null),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState(""),
    [fieldFilter, setFieldFilter] = useState(""),
    [sourceFilter, setSourceFilter] = useState(""),
    [setIdFilter, setSetFilter] = useState(""),
    [period, setPeriod] = useState("all"),
    [statusFilter, setStatusFilter] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [calendar, setCalendar] = useState(false),
    [week, setWeek] = useState(0),
    [imported, setImported] = useState<Data | null>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);
  const lock = useRef(false),
    notified = useRef(new Set<string>());
  const lastClock = useRef({ wall: Date.now(), mono: performance.now() });
  useEffect(() => {
    load()
      .then(setD)
      .catch((e) => setError("Unable to load local data: " + e.message));
    const timer = setInterval(() => {
      const wall = Date.now(),
        mono = performance.now();
      if (
        Math.abs(
          wall - lastClock.current.wall - (mono - lastClock.current.mono),
        ) > 120000
      )
        setError(
          "Device clock changed. Review session times and correct them using Edit. Stored timestamps have been preserved.",
        );
      lastClock.current = { wall, mono };
      setNow(wall);
    }, 1000);
    const net = () => setOnline(navigator.onLine);
    window.addEventListener("online", net);
    window.addEventListener("offline", net);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", net);
      window.removeEventListener("offline", net);
    };
  }, []);
  useEffect(() => {
    if (modal) {
      const previous = document.activeElement as HTMLElement;
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[role=dialog] button")?.focus(),
      );
      return () => previous?.focus();
    }
  }, [modal]);
  useEffect(() => {
    if (!d) return;
    document.documentElement.dataset.theme = d.settings.theme;
    for (const s of d.sessions.filter((s) => s.status === "active")) {
      const r = remaining(s, now);
      const key = s.id + (r <= 0 ? "due" : "soon");
      if (
        r <= d.settings.threshold * 60000 &&
        d.settings.notifications &&
        !notified.current.has(key) &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        new Notification("WaterTurn · Check your water", {
          body: `${s.label}: ${r <= 0 ? "planned move time passed" : "move approaching"}. Water remains running until you record a change.`,
        });
        notified.current.add(key);
      }
    }
  }, [d, now]);
  async function commit(next: Data) {
    if (lock.current) throw Error("A save is already in progress.");
    lock.current = true;
    setBusy(true);
    try {
      const saved = await save(next);
      setD(saved);
      return true;
    } catch (e) {
      setError("Changes were not saved: " + (e as Error).message);
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function action(fn: (x: Data) => void) {
    if (!d) return;
    try {
      const x = structuredClone(d);
      fn(x);
      await commit(x);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!d)
    return (
      <main>
        <h1>WaterTurn</h1>
        <p>{error || "Opening your farm…"}</p>
      </main>
    );
  const data = d;
  const active = d.sessions.filter((s) =>
    ["active", "paused"].includes(s.status),
  );
  const planned = d.sessions
    .filter((s) => s.status === "planned")
    .sort((a, b) => a.start - b.start);
  const completed = d.sessions.filter((s) => s.status === "completed");
  const today = new Date(now).setHours(0, 0, 0, 0);
  const periodStart =
    period === "day"
      ? today
      : period === "week"
        ? today - 6 * 86400000
        : period === "season"
          ? +new Date(new Date(now).getFullYear(), 0, 1)
          : 0;
  const report = completed.filter(
    (s) =>
      s.start >= periodStart &&
      (!fieldFilter || s.fieldId === fieldFilter) &&
      (!setIdFilter || s.setId === setIdFilter) &&
      (!sourceFilter || s.sourceId === sourceFilter) &&
      (!from || s.start >= +new Date(from + "T00:00")) &&
      (!to || s.start <= +new Date(to + "T23:59:59")),
  );
  const time = (n: number) =>
    new Date(n).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: d.settings.timeFormat === "12",
    });
  const date = (n: number) =>
    new Date(n).toLocaleDateString([], { month: "short", day: "numeric" });
  const open = (type: string, id?: string) => {
    setError("");
    setModal({ type, id });
  };
  function SessionCard({ s }: { s: Session }) {
    const r = remaining(s, now),
      tone =
        s.status === "paused"
          ? "muted"
          : r < 0
            ? "danger"
            : r <= data.settings.threshold * 60000
              ? "warning"
              : "good";
    return (
      <article className={"session " + tone}>
        <div className="cardtop">
          <span className="badge">
            <span className="dot" />
            {s.status === "paused"
              ? "Water paused"
              : r < 0
                ? "Planned move overdue"
                : r <= data.settings.threshold * 60000
                  ? "Move approaching"
                  : "Water running"}
          </span>
          <button className="text" onClick={() => open("edit", s.id)}>
            Edit <ArrowUpRight size={15} />
          </button>
        </div>
        <h2>{s.label.split(" · ")[0]}</h2>
        <p className="setname">{s.label.split(" · ")[1]}</p>
        <div className="timerlabel">ELAPSED IRRIGATION TIME</div>
        <div className="timer" aria-label="Elapsed irrigation time">
          {duration(elapsed(s, now))}
          <span>{Math.floor(elapsed(s, now) / 1000) % 60}s</span>
        </div>
        <div className="timedetails">
          <div>
            <span>Started</span>
            <strong>
              {date(s.start)} · {time(s.start)}
            </strong>
          </div>
          <div>
            <span>Planned move{s.status === "paused" ? " · on hold" : ""}</span>
            <strong>{s.status === "paused" ? "Paused" : time(now + r)}</strong>
          </div>
        </div>
        <div className="progress">
          <div
            style={{
              width: `${Math.min(100, (elapsed(s, now) / (s.target * 60000)) * 100)}%`,
            }}
          />
        </div>
        <p className="remaining">
          <Clock size={16} />
          {duration(r)} {r < 0 ? "past target" : "remaining"}
          {r < 0 && <small> · Check conditions; water stays active.</small>}
        </p>
        <p className="source">
          {s.sourceName} <span>·</span> Target: {duration(s.target * 60000)}
        </p>
        <div className="controls">
          <button onClick={() => open("stop", s.id)}>Stop Water</button>
          <button className="primary" onClick={() => open("move", s.id)}>
            Move Water <ArrowRight size={17} />
          </button>
          <button
            aria-label={s.status === "paused" ? "Resume water" : "Pause water"}
            title={s.status === "paused" ? "Resume water" : "Pause water"}
            onClick={() =>
              action((x) => {
                const a = x.sessions.find((v) => v.id === s.id)!;
                if (a.status === "paused") {
                  const c = conflicts(
                    x,
                    a.setId,
                    a.sourceId,
                    now,
                    a.target,
                    false,
                    a.id,
                  );
                  if (
                    c.capacity &&
                    !confirm(
                      "Source capacity exceeded. Confirm an intentional override to resume.",
                    )
                  )
                    return;
                  a.capacityOverride ||= c.capacity;
                  a.pauses.at(-1)!.end = now;
                  a.status = "active";
                } else {
                  a.pauses.push({ start: now });
                  a.status = "paused";
                }
                a.updatedAt = now;
              })
            }
          >
            {s.status === "paused" ? <Play size={18} /> : <Pause size={18} />}
          </button>
        </div>
      </article>
    );
  }
  function Turn({ s }: { s: Session }) {
    const c = conflicts(
      data,
      s.setId,
      s.sourceId,
      s.start,
      s.target,
      true,
      s.id,
    );
    return (
      <div className="turn">
        <div className="turnicon">
          <Droplets size={20} />
        </div>
        <div className="grow">
          <strong>{s.label}</strong>
          <p>
            {s.sourceName} · {duration(s.target * 60000)}
          </p>
          {(c.capacity || c.duplicate.length > 0) && (
            <small className="conflict">
              ⚠ Schedule conflict · review source capacity
            </small>
          )}
        </div>
        <div className="turntime">
          <strong>{time(s.start)}</strong>
          <small>{date(s.start)}</small>
        </div>
        <button className="text" onClick={() => open("edit", s.id)}>
          Edit
        </button>
        <button onClick={() => open("activate", s.id)}>Start</button>
      </div>
    );
  }
  const isFarmPage = [
    "Farm Home",
    "Properties",
    "Tasks",
    "Administration",
  ].includes(page);
  const isOperationsPage = [
    "Crops",
    "Cattle",
    "Equipment",
    "Inventory",
    "Finances",
    "Maps",
    "Reports",
    "Documents",
    "Calendar",
    "Assistant",
  ].includes(page);
  const navLabel=(label:string)=>label==="Dashboard"?"Irrigation":label==="Farm Home"?"Home":label;
  const nav = [
    ["Farm Home", House],
    ["Properties", Building2],
    ["Tasks", ListChecks],
    ["Administration", Shield],
    ["Crops", Sprout],
    ["Cattle", Beef],
    ["Equipment", Tractor],
    ["Inventory", Package],
    ["Finances", Wallet],
    ["Maps", MapPinned],
    ["Reports", ChartNoAxesCombined],
    ["Calendar", CalendarDays],
    ["Documents", Files],
    ["Assistant", Lightbulb],
    ["Dashboard", LayoutDashboard],
    ["Schedule", CalendarDays],
    ["Fields", Map],
    ["History", History],
    ["Settings", Settings],
  ] as const;
  return (
    <div className="app">
      <aside className={moreOpen ? "nav-open" : ""}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Dashboard");
          }}
        >
          <span className="brandicon">
            <Droplets />
          </span>
          <span className="brand-name">
            WaterTurn<span className="brandperiod">.</span>
            <small>FARMOS</small>
          </span>
        </a>
        <div className="farm">
          <span className="eyebrow">YOUR OPERATION</span>
          <strong>
            <Leaf size={15} />
            {d.settings.farmName}
          </strong>
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              aria-label={navLabel(label)}
              className={
                (page === label ? "selected " : "") +
                (["Farm Home", "Dashboard", "Fields", "Tasks"].includes(label)
                  ? "primary-nav"
                  : "secondary-nav")
              }
              onClick={() => {
                setPage(label);
                setMoreOpen(false);
              }}
            >
              <Icon size={20} />
              <span>{navLabel(label)}</span>
              {label === "Dashboard" && active.length > 0 && (
                <b>{active.length}</b>
              )}
            </button>
          ))}
          <button
            className="mobile-more"
            aria-label={moreOpen ? "Close navigation" : "More"}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
          >
            <Menu size={20} />
            <span>{moreOpen ? "Close" : "More"}</span>
          </button>
        </nav>
        <div className="asidebottom">
          <span className="localdot" />
          Local-first. Farm-focused.<p>Your farm data stays on this device.</p>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span className="breadcrumb">
            My operation <span>/</span> {page}
          </span>
          <span className="connection">
            {online ? <CheckCircle2 size={15} /> : <WifiOff size={15} />}{" "}
            {online ? "On this device" : "Offline mode"}
          </span>
        </header>
        <main>
          {isOperationsPage ? (
            <OperationsScreen page={page} data={d} onSave={commit} />
          ) : isFarmPage ? (
            <FarmScreen page={page} data={d} onSave={commit} go={setPage} />
          ) : (
            <>
              <div className="pageheading">
                <div>
                  <p className="eyebrow">
                    {page === "Dashboard"
                      ? "A CLEAR VIEW OF YOUR WATER"
                      : "YOUR FARM, IN HAND"}
                  </p>
                  <h1>
                    {page === "Dashboard"
                      ? "Good " +
                        (new Date(now).getHours() < 12
                          ? "morning"
                          : new Date(now).getHours() < 18
                            ? "afternoon"
                            : "evening") +
                        "."
                      : page}
                  </h1>
                  <p className="subtitle">
                    {page === "Dashboard"
                      ? new Date(now).toLocaleDateString([], {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        }) +
                        " · " +
                        time(now)
                      : (
                          {
                            Fields:
                              "Fields, sets, and the sources that connect them.",
                            Schedule:
                              "Plan the next turn. Start water when it actually happens.",
                            History:
                              "A record of every turn, from start to finish.",
                            Settings: "Make WaterTurn work for your operation.",
                          } as Record<string, string>
                        )[page]}
                  </p>
                </div>
                <button
                  className="primary big"
                  onClick={() => open(page === "Schedule" ? "plan" : "start")}
                >
                  <Plus size={19} />
                  {page === "Schedule" ? "Plan a turn" : "Start Water"}
                </button>
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                  <button
                    aria-label="Dismiss error"
                    onClick={() => setError("")}
                  >
                    <X size={17} />
                  </button>
                </div>
              )}
              {page === "Dashboard" && (
                <>
                  <div className="stats">
                    <div>
                      <span className="statlabel">
                        <Droplets size={17} /> Running now
                      </span>
                      <strong>
                        {active.length}
                        <small> irrigation sets</small>
                      </strong>
                    </div>
                    <div>
                      <span className="statlabel">
                        <Clock size={17} /> Next water move
                      </span>
                      <strong>
                        {active.some((s) => s.status === "active")
                          ? time(
                              Math.min(
                                ...active
                                  .filter((s) => s.status === "active")
                                  .map((s) => now + remaining(s, now)),
                              ),
                            )
                          : "—"}
                      </strong>
                    </div>
                    <div>
                      <span className="statlabel">
                        <CheckCircle2 size={17} /> Completed today
                      </span>
                      <strong>
                        {completed.filter((s) => (s.end ?? 0) >= today).length}
                        <small> sets</small>
                      </strong>
                    </div>
                  </div>
                  <div className="dashboardgrid">
                    <section>
                      <div className="sectiontitle">
                        <h2>
                          Water in the field <span>{active.length}</span>
                        </h2>
                        <span className="live">
                          <i /> LIVE
                        </span>
                      </div>
                      {active.map((s) => (
                        <SessionCard key={s.id} s={s} />
                      ))}
                      {!active.length && (
                        <div className="empty">
                          <Droplets size={40} />
                          <h2>Ready for your next turn.</h2>
                          <p>
                            Start water to keep track of where it’s running.
                          </p>
                          <button
                            className="primary"
                            onClick={() => open("start")}
                          >
                            Start Water
                          </button>
                          {!d.fields.length && (
                            <button onClick={() => setPage("Fields")}>
                              Set up your fields
                            </button>
                          )}
                        </div>
                      )}
                    </section>
                    <section>
                      <div className="sectiontitle">
                        <h2>Up next</h2>
                        <button
                          className="text"
                          onClick={() => setPage("Schedule")}
                        >
                          View schedule <ArrowRight size={15} />
                        </button>
                      </div>
                      <div className="panel">
                        {planned.slice(0, 4).map((s) => (
                          <Turn key={s.id} s={s} />
                        ))}
                        {!planned.length && (
                          <div className="empty compact">
                            <CalendarDays size={28} />
                            <h3>A little planning goes a long way.</h3>
                            <p>Add your upcoming water turns.</p>
                            <button onClick={() => open("plan")}>
                              Plan a turn
                            </button>
                          </div>
                        )}
                        <button
                          className="wide text"
                          onClick={() => open("plan")}
                        >
                          <Plus size={17} /> Add planned turn
                        </button>
                      </div>
                      <div className="fieldnote">
                        <Leaf size={23} />
                        <div>
                          <h3>You’re in control.</h3>
                          <p>
                            Timers help you plan. Water only moves when you do.
                            Always check conditions in the field.
                          </p>
                        </div>
                      </div>
                      <div className="panel compact">
                        <span className="eyebrow">TODAY IN THE FIELD</span>
                        <h3>
                          {duration(
                            active.reduce((n, s) => n + elapsed(s, now), 0),
                          )}
                        </h3>
                        <p className="subtitle">
                          Total elapsed time across open turns
                        </p>
                      </div>
                    </section>
                  </div>
                  {!d.fields.length && (
                    <div className="demobanner">
                      <div>
                        <strong>Take WaterTurn for a test run.</strong>
                        <p>
                          Explore fictional fields, live timers, and a sample
                          rotation.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Load fictional demo data? This replaces the current empty farm.",
                            )
                          )
                            commit(demo()).catch(() => {});
                        }}
                      >
                        Load demo farm <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {page === "Schedule" && (
                <>
                  <div className="toolbar">
                    <button
                      className={!calendar ? "primary" : ""}
                      onClick={() => setCalendar(false)}
                    >
                      Timeline
                    </button>
                    <button
                      className={calendar ? "primary" : ""}
                      onClick={() => setCalendar(true)}
                    >
                      7-day calendar
                    </button>
                    {calendar && (
                      <>
                        <button onClick={() => setWeek(week - 1)}>
                          Previous week
                        </button>
                        <button onClick={() => setWeek(0)}>Today</button>
                        <button onClick={() => setWeek(week + 1)}>
                          Next week
                        </button>
                      </>
                    )}
                  </div>
                  <p className="notice">
                    Planned turns never start automatically. Capacity warnings
                    require a deliberate override.
                  </p>
                  {calendar ? (
                    <div className="week">
                      {Array.from({ length: 7 }, (_, i) => {
                        const day = new Date(today);
                        day.setDate(day.getDate() + week * 7 + i);
                        const end = new Date(day);
                        end.setDate(end.getDate() + 1);
                        return (
                          <section className="panel" key={i}>
                            <h3>
                              {day.toLocaleDateString([], {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                              })}
                            </h3>
                            {[...planned, ...active]
                              .filter(
                                (s) =>
                                  s.start < +end &&
                                  (s.status === "planned"
                                    ? s.start + s.target * 60000
                                    : now + Math.max(0, remaining(s, now))) >
                                    +day,
                              )
                              .map((s) => (
                                <div className="calendaritem" key={s.id}>
                                  <strong>{s.label}</strong>
                                  <p>
                                    {time(s.start)} · {s.status}
                                  </p>
                                  <button onClick={() => open("edit", s.id)}>
                                    Edit turn
                                  </button>
                                </div>
                              ))}
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="panel">
                      {planned.map((s) => (
                        <Turn key={s.id} s={s} />
                      ))}
                      {active.map((s) => (
                        <div className="turn" key={s.id}>
                          <Droplets />
                          <strong>{s.label}</strong>
                          <span>
                            {s.status} · {time(s.start)}
                          </span>
                        </div>
                      ))}
                      {!planned.length && !active.length && (
                        <p className="empty">No turns planned yet.</p>
                      )}
                    </div>
                  )}
                </>
              )}
              {page === "Fields" && (
                <>
                  <div className="toolbar">
                    <button className="primary" onClick={() => open("field")}>
                      + Add field
                    </button>
                    <button onClick={() => open("source")}>+ Add source</button>
                  </div>
                  <div className="fieldgrid">
                    {d.fields.map((f) => (
                      <article
                        className={
                          "panel field " + (f.archived ? "archived" : "")
                        }
                        key={f.id}
                      >
                        <div className="cardtop">
                          <span className="fieldicon">
                            <Leaf />
                          </span>
                          <button
                            className="text"
                            onClick={() => open("field", f.id)}
                          >
                            Edit field
                          </button>
                        </div>
                        <h2>
                          {f.name}
                          {f.archived ? " · Archived" : ""}
                        </h2>
                        <p>
                          {f.acreage} acres · {f.crop || "No crop specified"}
                        </p>
                        <p>
                          {f.method} ·{" "}
                          {d.sources.find((s) => s.id === f.sourceId)?.name}
                        </p>
                        <p>{f.notes}</p>
                        {d.sets
                          .filter((s) => s.fieldId === f.id)
                          .sort((a, b) => a.order - b.order)
                          .map((s) => {
                            const history = completed
                              .filter((r) => r.setId === s.id)
                              .sort((a, b) => (b.end ?? 0) - (a.end ?? 0));
                            const rec = suggestion(d.sessions, s.id);
                            return (
                              <div className="setrow" key={s.id}>
                                <div>
                                  <strong>
                                    {s.name}
                                    {s.archived ? " · Archived" : ""}
                                  </strong>
                                  <p>
                                    {duration(s.duration * 60000)} target ·{" "}
                                    {active.some((a) => a.setId === s.id)
                                      ? "Open turn"
                                      : "Idle"}
                                  </p>
                                  {history[0] && (
                                    <small>
                                      Last: {date(history[0].end!)} ·{" "}
                                      {duration(elapsed(history[0]))}
                                      <br />
                                      Average:{" "}
                                      {duration(
                                        history.reduce(
                                          (a, b) => a + elapsed(b),
                                          0,
                                        ) / history.length,
                                      )}
                                    </small>
                                  )}
                                  {rec && (
                                    <small>
                                      Suggested: {duration(rec.minutes * 60000)}{" "}
                                      · {rec.count} previous turns. Historical
                                      pattern only.
                                    </small>
                                  )}
                                  <small>
                                    {
                                      planned.filter((p) => p.setId === s.id)
                                        .length
                                    }{" "}
                                    upcoming planned turns
                                  </small>
                                </div>
                                <button onClick={() => open("set", s.id)}>
                                  Edit set
                                </button>
                              </div>
                            );
                          })}
                        <button
                          className="wide"
                          onClick={() => open("set:" + f.id)}
                        >
                          + Add irrigation set
                        </button>
                        <button
                          className="text"
                          onClick={() => {
                            setFieldFilter(f.id);
                            setPage("History");
                          }}
                        >
                          View field history <ArrowRight size={15} />
                        </button>
                      </article>
                    ))}
                  </div>
                  <h2 className="sectiontitle">Water sources</h2>
                  <div className="fieldgrid">
                    {d.sources.map((s) => (
                      <div className="panel compact" key={s.id}>
                        <h3>
                          <Droplets size={19} /> {s.name}
                          {s.archived ? " · Archived" : ""}
                        </h3>
                        <p>
                          Capacity: {s.maxConcurrentSets} simultaneous set
                          {s.maxConcurrentSets === 1 ? "" : "s"}
                        </p>
                        <p>{s.notes}</p>
                        <button onClick={() => open("source", s.id)}>
                          Edit source
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {page === "History" && (
                <>
                  <div className="stats">
                    <div>
                      <span>Completed turns</span>
                      <select
                        aria-label="Summary period"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                      >
                        <option value="all">All records</option>
                        <option value="day">Today</option>
                        <option value="week">Last 7 days</option>
                        <option value="season">Season · calendar year</option>
                      </select>
                      <strong>{report.length}</strong>
                    </div>
                    <div>
                      <span>Recorded hours</span>
                      <strong>
                        {(
                          report.reduce((n, s) => n + elapsed(s), 0) / 3600000
                        ).toFixed(1)}
                      </strong>
                    </div>
                    <div>
                      <span>Past target at completion</span>
                      <strong>
                        {
                          report.filter((s) => elapsed(s) > s.target * 60000)
                            .length
                        }
                      </strong>
                    </div>
                  </div>
                  <div className="toolbar">
                    <input
                      aria-label="Search history"
                      placeholder="Search sets or notes…"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                    <select
                      aria-label="Filter field"
                      value={fieldFilter}
                      onChange={(e) => setFieldFilter(e.target.value)}
                    >
                      <option value="">All fields</option>
                      {d.fields.map((f) => (
                        <option value={f.id} key={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter set"
                      value={setIdFilter}
                      onChange={(e) => setSetFilter(e.target.value)}
                    >
                      <option value="">All sets</option>
                      {d.sets
                        .filter(
                          (s) => !fieldFilter || s.fieldId === fieldFilter,
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {d.fields.find((f) => f.id === s.fieldId)?.name} ·{" "}
                            {s.name}
                          </option>
                        ))}
                    </select>
                    <select
                      aria-label="Filter source"
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                    >
                      <option value="">All sources</option>
                      {d.sources.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Filter status"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <option value="">Completed & canceled</option>
                      <option>completed</option>
                      <option>canceled</option>
                    </select>
                    <label>
                      From
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </label>
                    <label>
                      Through
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </label>
                    <button
                      onClick={() =>
                        download("waterturn-history.csv", csv(d), "text/csv")
                      }
                    >
                      Export CSV
                    </button>
                  </div>
                  <div className="panel">
                    {d.sessions
                      .filter(
                        (s) =>
                          ["completed", "canceled"].includes(s.status) &&
                          (!fieldFilter || s.fieldId === fieldFilter) &&
                          (!sourceFilter || s.sourceId === sourceFilter) &&
                          (!setIdFilter || s.setId === setIdFilter) &&
                          s.start >= periodStart &&
                          (!statusFilter || s.status === statusFilter) &&
                          (!from || s.start >= +new Date(from + "T00:00")) &&
                          (!to || s.start <= +new Date(to + "T23:59:59")) &&
                          (s.label + " " + s.notes)
                            .toLowerCase()
                            .includes(filter.toLowerCase()),
                      )
                      .sort((a, b) => b.start - a.start)
                      .map((s) => (
                        <div className="historyrow" key={s.id}>
                          <CheckCircle2 />
                          <div className="grow">
                            <strong>{s.label}</strong>
                            <p>
                              {date(s.start)} {time(s.start)} →{" "}
                              {s.end ? date(s.end) + " " + time(s.end) : "—"} ·{" "}
                              {s.sourceName}
                            </p>
                            <p>{s.notes}</p>
                          </div>
                          <div>
                            <strong>
                              {s.end ? duration(elapsed(s)) : "Canceled"}
                            </strong>
                            <p>Target {duration(s.target * 60000)}</p>
                            {s.end && (
                              <small>
                                {duration(elapsed(s) - s.target * 60000)}{" "}
                                {elapsed(s) > s.target * 60000
                                  ? "over"
                                  : "under"}{" "}
                                target
                              </small>
                            )}
                            <small>
                              {s.status}
                              {s.capacityOverride
                                ? " · Capacity override recorded"
                                : ""}
                            </small>
                          </div>
                          <button onClick={() => open("edit", s.id)}>
                            Edit record
                          </button>
                        </div>
                      ))}
                    {!completed.length && (
                      <p className="empty">Completed turns will appear here.</p>
                    )}
                  </div>
                  <p className="notice">
                    Most recently irrigated:{" "}
                    {[...completed].sort(
                      (a, b) => (b.end ?? 0) - (a.end ?? 0),
                    )[0]?.label ?? "No completed turns"}
                    . Average in selected period:{" "}
                    {report.length
                      ? duration(
                          report.reduce((n, s) => n + elapsed(s), 0) /
                            report.length,
                        )
                      : "—"}
                    .
                  </p>
                  <p className="notice">
                    Recorded hours describe operating time, not applied water
                    volume. {planned.length} planned turns have not been
                    started.
                  </p>
                </>
              )}
              {page === "Settings" && (
                <div className="settingsgrid">
                  <form
                    className="panel form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      action((x) => {
                        x.settings = {
                          ...x.settings,
                          farmName: String(f.get("farmName")),
                          timeFormat: f.get("format") as "12" | "24",
                          theme: f.get("theme") as "light" | "dark" | "system",
                          duration: Number(f.get("duration")),
                          threshold: Number(f.get("threshold")),
                        };
                      });
                    }}
                  >
                    <h2>Your preferences</h2>
                    <label>
                      Farm display name
                      <input
                        name="farmName"
                        defaultValue={d.settings.farmName}
                        required
                      />
                    </label>
                    <label>
                      Time format
                      <select
                        name="format"
                        defaultValue={d.settings.timeFormat}
                      >
                        <option value="12">12 hour</option>
                        <option value="24">24 hour</option>
                      </select>
                    </label>
                    <label>
                      Appearance
                      <select name="theme" defaultValue={d.settings.theme}>
                        <option>system</option>
                        <option>light</option>
                        <option>dark</option>
                      </select>
                    </label>
                    <label>
                      Default duration (minutes)
                      <input
                        name="duration"
                        type="number"
                        min="1"
                        defaultValue={d.settings.duration}
                        required
                      />
                    </label>
                    <label>
                      Reminder threshold (minutes)
                      <input
                        name="threshold"
                        type="number"
                        min="0"
                        defaultValue={d.settings.threshold}
                        required
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Save preferences
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!("Notification" in window)) {
                          setError(
                            "This browser does not support notifications. In-app reminders remain available.",
                          );
                          return;
                        }
                        const permission =
                          await Notification.requestPermission();
                        action((x) => {
                          x.settings.notifications = permission === "granted";
                        });
                      }}
                    >
                      Enable browser reminders
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        action((x) => {
                          x.settings.notifications = false;
                        })
                      }
                    >
                      Disable browser reminders
                    </button>
                    <p className="notice">
                      Notifications:{" "}
                      {d.settings.notifications ? "enabled" : "disabled"}. Best
                      effort while the app is running. Closed-app or
                      sleeping-device alarms are not guaranteed. Use a separate
                      alarm for essential moves.
                    </p>
                  </form>
                  <section className="panel form">
                    <h2>Your data stays yours.</h2>
                    <button
                      onClick={async () => {
                        const backup = await originalBackup();
                        if (backup)
                          download(
                            "waterturn-before-farmos.json",
                            JSON.stringify(backup),
                            "application/json",
                          );
                        else
                          setError(
                            "No legacy migration backup exists on this device.",
                          );
                      }}
                    >
                      Export original irrigation migration backup
                    </button>
                    <p>
                      All farm records are stored in IndexedDB on this browser.
                      No accounts, tracking, or cloud uploads.
                    </p>
                    <p>
                      Clearing browser data, uninstalling, or changing devices
                      can remove your records. Local storage is not a permanent
                      backup.
                    </p>
                    <button
                      onClick={() =>
                        download(
                          "waterturn-backup.json",
                          JSON.stringify(d),
                          "application/json",
                        )
                      }
                    >
                      <Download size={17} /> Export JSON backup
                    </button>
                    <label>
                      Import a JSON backup
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={async (e) => {
                          try {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 20_000_000)
                              throw Error(
                                "Backup exceeds the 20 MB import limit.",
                              );
                            const value = JSON.parse(await file.text());
                            validate(value);
                            setImported(value);
                          } catch (err) {
                            setError((err as Error).message);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {imported && (
                      <div className="importpreview">
                        <h3>Review replacement</h3>
                        <p>
                          {imported.fields.length} fields,{" "}
                          {imported.sets.length} sets,{" "}
                          {imported.sessions.length} turns.
                        </p>
                        <p>
                          This replaces all existing local records. Export your
                          current backup first.
                        </p>
                        <button
                          onClick={() => {
                            if (
                              confirm(
                                "Replace all current farm data with this validated backup?",
                              )
                            )
                              commit(imported)
                                .then(() => setImported(null))
                                .catch(() => {});
                          }}
                        >
                          Confirm full replacement
                        </button>
                        <button onClick={() => setImported(null)}>
                          Cancel import
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            "Replace your farm with clearly fictional demo data? Export a backup first.",
                          )
                        )
                          commit(demo()).catch(() => {});
                      }}
                    >
                      Load fictional demo farm
                    </button>
                    <button
                      className="dangerbutton"
                      onClick={() => {
                        if (
                          prompt(
                            "This permanently clears this browser’s farm data. Type DELETE to confirm.",
                          ) === "DELETE"
                        )
                          (async () => {
                            if (lock.current) return;
                            lock.current = true;
                            setBusy(true);
                            try {
                              setD(await clearLocalData());
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              lock.current = false;
                              setBusy(false);
                            }
                          })();
                      }}
                    >
                      Clear all local data
                    </button>
                    <p className="notice">
                      Install WaterTurn from your browser’s install menu after
                      the first online visit. The production app caches its
                      shell for offline use.
                    </p>
                  </section>
                </div>
              )}
            </>
          )}
          <footer>
            <Droplets size={15} /> Built for the way water moves.
            <span>Private by design · WaterTurn</span>
          </footer>
        </main>
      </div>
      {modal && (
        <div
          className="overlay"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setModal(null);
            if (e.key === "Tab") {
              const items = Array.from(
                e.currentTarget.querySelectorAll<HTMLElement>(
                  "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
                ),
              );
              const first = items[0],
                last = items.at(-1);
              if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
              } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
              }
            }
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setModal(null);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialogtitle"
          >
            <button
              className="close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X />
            </button>
            <Editor
              key={modal.type + modal.id}
              data={d}
              modal={modal}
              busy={busy}
              onSave={async (next) => {
                await commit(next);
                setModal(null);
              }}
              onError={setError}
            />
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
