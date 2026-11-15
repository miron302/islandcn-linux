import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { DESKTOPS, type ActivityToggles, type AppConfig, type DesktopId, type MonitorInfo, type SettingsInit } from "@/shared/types";

const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) => (
  <span className="switch">
    <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <i />
  </span>
);

const Row = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div className="row">
    <div className="label">
      {label}
      {hint ? <small>{hint}</small> : null}
    </div>
    {children}
  </div>
);

const DesktopCards = ({ current, detected, onPick }: { current: DesktopId | null; detected: DesktopId | null; onPick: (id: DesktopId) => void }) => (
  <div className="desktops">
    {DESKTOPS.map((entry) => (
      <button key={entry.id} className="desk" aria-pressed={current === entry.id} onClick={() => onPick(entry.id)}>
        <strong>
          {entry.name}
          {detected === entry.id ? <em>detected</em> : null}
        </strong>
        <span>{entry.note}</span>
      </button>
    ))}
  </div>
);


const MAP_WIDTH = 360;
const PILL_CENTRE_Y = 32.3;
const HALF_FRAME = 212;

/**
 * A small picture of the screen. Drag the pill anywhere on it and the real island follows; click
 * or drag, it applies live. Works the same on every desktop because it only changes the offsets.
 */
const PositionMap = ({ config, monitor, onChange }: { config: AppConfig; monitor: MonitorInfo; onChange: (patch: Partial<AppConfig>) => void }) => {
  const box = useRef<HTMLDivElement>(null);
  const ratio = MAP_WIDTH / monitor.width;
  const height = Math.round(monitor.height * ratio);
  const s = config.scale;
  const flush = config.flushTop ? 13.91 * s : 0;

  const centreX = config.anchor === "left" ? HALF_FRAME * s + config.offsetX : config.anchor === "right" ? monitor.width - HALF_FRAME * s + config.offsetX : monitor.width / 2 + config.offsetX;
  const centreY = config.offsetY - flush + PILL_CENTRE_Y * s;

  const move = (clientX: number, clientY: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.min(monitor.width, Math.max(0, (clientX - rect.left) / ratio));
    const py = Math.min(monitor.height, Math.max(0, (clientY - rect.top) / ratio));
    const offsetX = config.anchor === "left" ? px - HALF_FRAME * s : config.anchor === "right" ? px - (monitor.width - HALF_FRAME * s) : px - monitor.width / 2;
    onChange({ offsetX: Math.round(offsetX), offsetY: Math.round(py - PILL_CENTRE_Y * s + flush) });
  };

  const pillW = 94.85 * s * ratio;
  const pillH = 36.84 * s * ratio;
  return (
    <div
      ref={box}
      style={{ position: "relative", width: MAP_WIDTH, height, background: "#0b0b0d", border: "1px solid #2c2c34", borderRadius: 8, margin: "14px auto", touchAction: "none", cursor: "crosshair", overflow: "hidden" }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        move(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) move(event.clientX, event.clientY);
      }}
    >
      <div style={{ position: "absolute", left: centreX * ratio - pillW / 2, top: centreY * ratio - pillH / 2, width: pillW, height: pillH, borderRadius: pillH / 2, background: "#000", border: "1px solid #46f0c6", boxShadow: "0 0 0 2px rgba(70,240,198,.18)" }} />
      <span style={{ position: "absolute", right: 8, bottom: 6, fontSize: 11, color: "#6c6c76" }}>{monitor.width} x {monitor.height}</span>
    </div>
  );
};

const activityLabels = {
  music: ["Music", "Anything that talks MPRIS: Spotify, browsers, mpv, VLC"],
  battery: ["Battery", "Charging pill when you plug in, red warning when it is low"],
  volume: ["Volume", "A quick readout when the volume or mute changes"],
  brightness: ["Brightness", "A quick readout when the backlight changes"],
  notifications: ["Notifications", "Listens on the session bus; your notification daemon still runs"],
  microphone: ["Microphone in use", "Shows which app is capturing audio"],
  timer: ["Timers", "Start from the right-click menu or islandcn-arch timer 25m"],
  jobs: ["Script progress", "islandcn-arch job <id> <0..1> from any script"],
} as const satisfies Record<keyof ActivityToggles, readonly [string, string]>;

export const Settings = () => {
  const [init, setInit] = useState<SettingsInit | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    void window.settingsApi.init().then((value) => {
      setInit(value);
      setConfig(value.config);
      setRemember(!value.config.askEveryLaunch);
    });
  }, []);

  const update = useCallback(async (patch: Partial<AppConfig>) => {
    setConfig((current) => (current ? { ...current, ...patch } : current));
    const saved = await window.settingsApi.setConfig(patch);
    setConfig(saved);
  }, []);

  const pickDesktop = useCallback(
    async (id: DesktopId) => {
      if (init?.needsChooser) await window.settingsApi.setConfig({ askEveryLaunch: !remember });
      await window.settingsApi.chooseDesktop(id);
      setConfig((current) => (current ? { ...current, desktop: id } : current));
    },
    [init, remember],
  );

  if (!init || !config) return <main />;

  if (init.needsChooser) {
    return (
      <main className="chooser">
        <h1>Which desktop are you on?</h1>
        <p className="sub">islandcn places itself differently on each one. Pick yours, you can change it any time from settings or the right-click menu on the island.</p>
        <DesktopCards current={null} detected={init.detectedDesktop} onPick={(id) => void pickDesktop(id)} />
        <label className="remember">
          <Switch checked={remember} onChange={setRemember} label="Remember my choice" />
          Remember my choice (turn off to be asked every launch)
        </label>
      </main>
    );
  }

  const activities = config.activities;

  return (
    <main>
      <h1>islandcn</h1>
      <p className="sub">Session: {init.session}. Everything here applies live.</p>

      <h2>Desktop environment</h2>
      <DesktopCards current={config.desktop} detected={init.detectedDesktop} onPick={(id) => void pickDesktop(id)} />
      <div className="card" style={{ marginTop: 10 }}>
        <Row label="Ask me every launch" hint="Handy if you hop between desktops. Otherwise your choice is remembered.">
          <Switch checked={config.askEveryLaunch} onChange={(value) => void update({ askEveryLaunch: value })} label="Ask every launch" />
        </Row>
      </div>
      {config.desktop === "hyprland" ? (
        <div className="note">
          To start with Hyprland, add <code>exec-once = islandcn-arch</code> to your <code>hyprland.conf</code>. The login toggle below only covers desktops that read XDG autostart.
        </div>
      ) : null}

      <h2>Size and position</h2>
      <p className="sub">Drag the pill on the screen below to move the real one. Offsets apply live.</p>
      <PositionMap config={config} monitor={init.monitors.find((m) => m.id === config.monitor) ?? init.monitors.find((m) => m.primary) ?? init.monitors[0] ?? { id: "", name: "", primary: true, x: 0, y: 0, width: 1920, height: 1080 }} onChange={(patch) => void update(patch)} />
      <div className="chips" style={{ justifyContent: "center", marginBottom: 12 }}>
        <button className="plain" onClick={() => void update({ anchor: "center", offsetX: 0, offsetY: 0 })}>Top center</button>
        <button className="plain" onClick={() => void update({ anchor: "left", offsetX: 12, offsetY: 0 })}>Top left</button>
        <button className="plain" onClick={() => void update({ anchor: "right", offsetX: -12, offsetY: 0 })}>Top right</button>
      </div>
      <div className="card">
        <Row label="Size" hint={`${Math.round(config.scale * 100)}%`}>
          <input type="range" min={0.5} max={2} step={0.05} value={config.scale} onChange={(event) => void update({ scale: Number(event.target.value) })} aria-label="Size" />
        </Row>
        <Row label="Screen">
          <select value={config.monitor} onChange={(event) => void update({ monitor: event.target.value })}>
            <option value="">Primary</option>
            {init.monitors.map((monitor) => (
              <option key={monitor.id} value={monitor.id}>
                {monitor.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Anchor">
          <span className="seg">
            {(["left", "center", "right"] as const).map((anchor) => (
              <button key={anchor} aria-pressed={config.anchor === anchor} onClick={() => void update({ anchor })}>
                {anchor[0].toUpperCase() + anchor.slice(1)}
              </button>
            ))}
          </span>
        </Row>
        <Row label="Horizontal offset" hint="Pixels. Negative moves left.">
          <input type="number" value={config.offsetX} step={10} onChange={(event) => void update({ offsetX: Number(event.target.value) })} />
        </Row>
        <Row label="Vertical offset" hint="Pixels down from the top edge.">
          <input type="number" value={config.offsetY} step={5} onChange={(event) => void update({ offsetY: Number(event.target.value) })} />
        </Row>
        <Row label="Touch the top edge" hint="Pulls the pill up flush with the screen, like a notch. Some compositors keep windows fully on screen.">
          <Switch checked={config.flushTop} onChange={(value) => void update({ flushTop: value })} label="Touch the top edge" />
        </Row>
        <Row label="Reset position and size">
          <button className="plain" onClick={() => void update({ scale: 1, offsetX: 0, offsetY: 0, anchor: "center", flushTop: false, monitor: "" })}>
            Reset
          </button>
        </Row>
      </div>

      <h2>Live activities</h2>
      <div className="card">
        {(Object.keys(activityLabels) as (keyof ActivityToggles)[]).map((key) => (
          <Row key={key} label={activityLabels[key][0]} hint={activityLabels[key][1]}>
            <Switch checked={activities[key]} onChange={(value) => void update({ activities: { ...activities, [key]: value } })} label={activityLabels[key][0]} />
          </Row>
        ))}
      </div>

      <h2>Music</h2>
      <div className="card">
        <Row label="Preferred player" hint="MPRIS name such as spotify, firefox, mpv. Empty follows whatever is playing.">
          <input type="text" style={{ background: "#0e0e10", color: "inherit", border: "1px solid #2c2c34", borderRadius: 8, padding: "7px 10px", font: "inherit", width: 160 }} value={config.music.player} onChange={(event) => void update({ music: { ...config.music, player: event.target.value } })} />
        </Row>
        <Row label="Keep paused music for" hint="Seconds the island waits after you pause before it leaves.">
          <input type="number" min={0} value={config.music.pausedLingerSec} step={10} onChange={(event) => void update({ music: { ...config.music, pausedLingerSec: Number(event.target.value) } })} />
        </Row>
      </div>

      <h2>Battery</h2>
      <div className="card">
        <Row label="Low battery warning at" hint="Percent.">
          <input type="number" min={5} max={50} value={config.battery.lowPercent} onChange={(event) => void update({ battery: { lowPercent: Number(event.target.value) } })} />
        </Row>
      </div>

      <h2>Timer</h2>
      <div className="card">
        <Row label="Start a timer">
          <span className="chips">
            {[5, 10, 25, 45].map((minutes) => (
              <button key={minutes} className="plain" onClick={() => window.settingsApi.startTimer(minutes)}>
                {minutes} min
              </button>
            ))}
          </span>
        </Row>
      </div>

      <h2>App</h2>
      <div className="card">
        <Row label="Start on login" hint="Writes an XDG autostart entry (GNOME, KDE, XFCE and others).">
          <Switch checked={config.autostart} onChange={(value) => void update({ autostart: value })} label="Start on login" />
        </Row>
        <Row label="Quit islandcn">
          <button className="plain danger" onClick={() => window.settingsApi.quit()}>
            Quit
          </button>
        </Row>
      </div>
      <div className="note">
        Scripts can drive the island: <code>islandcn-arch job backup 0.4 "Backing up"</code>, <code>islandcn-arch notice "Build" "Finished"</code>, <code>islandcn-arch timer 25m Focus</code>.
      </div>
    </main>
  );
};
