import React, { useMemo, useState } from "react";

import PolarizationEllipsePreview from "./PolarizationEllipsePreview";

// Intentionally lightweight/loose typing: SunStone's App is currently ts-nocheck.
export type PolarizationWrt = "global-xyz" | "section-uvw" | "object-local";
export type PolarizationPlane = "xy" | "xz" | "yz";

export type JonesComponent = {
  amp: number;
  phaseDeg: number;
};

export type SourcePolarization =
  | { kind: "linear" }
  | {
      kind: "circular";
      handedness: "left" | "right";
      plane: PolarizationPlane;
      wrt?: PolarizationWrt;
    }
  | {
      kind: "jones";
      plane: PolarizationPlane;
      wrt?: PolarizationWrt;
      u: JonesComponent;
      v: JonesComponent;
    };

export type SourcePropertiesDialogProps = {
  open: boolean;
  source: any | null;
  dimensionMode: any;

  waveforms: any[];
  onUpsertWaveform: (wf: any) => void;
  onDeleteWaveform: (waveformId: string) => void;

  onChangeSource: (next: any) => void;
  onClose: () => void;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "";
  return String(value);
}

function safeParseNumber(text: string, fallback: number) {
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

function randomId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toDeg(rad: number) {
  return (rad * 180) / Math.PI;
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function isPolarizationKind(kind: unknown): kind is NonNullable<SourcePolarization>["kind"] {
  return kind === "linear" || kind === "circular" || kind === "jones";
}

function isLegacyHelicalPolarization(raw: any): boolean {
  return raw?.kind === "helical";
}

function normalizePolarization(raw: any): SourcePolarization {
  // Legacy migration: helical(axis) -> circular(plane⊥axis)
  if (isLegacyHelicalPolarization(raw)) {
    const handedness = raw?.handedness === "left" ? "left" : "right";
    const axis = raw?.axis;
    const plane: PolarizationPlane = axis === "x" ? "yz" : axis === "y" ? "xz" : "xy";
    return { kind: "circular", handedness, plane };
  }

  const kind = raw?.kind;
  if (!isPolarizationKind(kind)) return { kind: "linear" };

  if (kind === "linear") return { kind: "linear" };

  if (kind === "circular") {
    const handedness = raw?.handedness === "left" ? "left" : "right";
    const plane: PolarizationPlane = raw?.plane === "xz" || raw?.plane === "yz" ? raw.plane : "xy";
    const wrt: PolarizationWrt | undefined =
      raw?.wrt === "section-uvw" || raw?.wrt === "object-local" ? raw.wrt : raw?.wrt === "global-xyz" ? raw.wrt : undefined;
    return { kind: "circular", handedness, plane, wrt };
  }

  // Jones vector mode
  const plane: PolarizationPlane = raw?.plane === "xz" || raw?.plane === "yz" ? raw.plane : "xy";
  const wrt: PolarizationWrt | undefined =
    raw?.wrt === "section-uvw" || raw?.wrt === "object-local" ? raw.wrt : raw?.wrt === "global-xyz" ? raw.wrt : undefined;

  const u: JonesComponent = {
    amp: Number.isFinite(Number(raw?.u?.amp)) ? Number(raw.u.amp) : 1,
    phaseDeg: Number.isFinite(Number(raw?.u?.phaseDeg)) ? Number(raw.u.phaseDeg) : 0,
  };
  const v: JonesComponent = {
    amp: Number.isFinite(Number(raw?.v?.amp)) ? Number(raw.v.amp) : 0,
    phaseDeg: Number.isFinite(Number(raw?.v?.phaseDeg)) ? Number(raw.v.phaseDeg) : 0,
  };

  return { kind: "jones", plane, wrt, u, v };
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  width: "min(920px, 92vw)",
  maxHeight: "min(720px, 92vh)",
  overflow: "auto",
  background: "var(--panel-bg, #1f1f1f)",
  color: "var(--text-color, #eaeaea)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 10,
  boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
  padding: 16,
};

const sectionStyle: React.CSSProperties = {
  borderTop: "1px solid rgba(255, 255, 255, 0.08)",
  paddingTop: 12,
  marginTop: 12,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(12, 1fr)",
  gap: 10,
  alignItems: "center",
};

const labelStyle: React.CSSProperties = {
  gridColumn: "span 4",
  opacity: 0.9,
  fontSize: 13,
};

const fieldStyle: React.CSSProperties = {
  gridColumn: "span 8",
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid rgba(255, 255, 255, 0.16)",
  background: "rgba(255, 255, 255, 0.06)",
  color: "inherit",
};

const buttonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255, 255, 255, 0.16)",
  background: "rgba(255, 255, 255, 0.06)",
  color: "inherit",
  cursor: "pointer",
};

export function SourcePropertiesDialog(props: SourcePropertiesDialogProps) {
  const {
    open,
    source,
    dimensionMode,
    waveforms,
    onUpsertWaveform,
    onDeleteWaveform,
    onChangeSource,
    onClose,
  } = props;

  const [newWaveformName, setNewWaveformName] = useState("New waveform");

  const waveformOptions = useMemo(() => {
    const opts = [...(waveforms ?? [])];
    opts.sort((a: any, b: any) => String(a.label ?? "").localeCompare(String(b.label ?? "")));
    return opts;
  }, [waveforms]);

  if (!open) return null;

  const src = source;

  const effectivePolarization = useMemo(() => {
    return normalizePolarization((src as any)?.polarization);
  }, [src]);

  const set = (patch: any) => {
    if (!src) return;
    onChangeSource({ ...src, ...patch });
  };

  const setPolarization = (patch: any) => {
    if (!src) return;
    onChangeSource({ ...src, polarization: patch });
  };

  const polarizationKind = effectivePolarization.kind;

  // One-way migration of legacy 'helical' values (if any persisted data exists).
  const rawKind = (src as any)?.polarization?.kind;
  React.useEffect(() => {
    if (!src) return;
    if (rawKind !== "helical") return;
    onChangeSource({ ...src, polarization: effectivePolarization });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawKind]);

  const ensureWaveformSelected = (waveformId: string | undefined) => {
    if (!src) return;
    set({ waveformId: waveformId ?? undefined });
  };

  const onOverlayMouseDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const onCreateWaveform = () => {
    const id = randomId("wf");
    onUpsertWaveform({
      id,
      label: newWaveformName.trim() || "Waveform",
      kind: "gaussian",
      data: {
        center_freq: Number.isFinite(Number(src?.centerFreq)) ? Number(src.centerFreq) : 1e14,
        fwidth: Number.isFinite(Number(src?.fwidth)) ? Number(src.fwidth) : 1e13,
      },
    });
    ensureWaveformSelected(id);
  };

  const onDeleteSelectedWaveform = () => {
    if (!src?.waveformId) return;
    const deleted = src.waveformId;
    onDeleteWaveform(deleted);
    ensureWaveformSelected(undefined);
  };

  return (
    <div style={overlayStyle} onMouseDown={onOverlayMouseDown}>
      <div style={dialogStyle} role="dialog" aria-modal="true" aria-label="Source Properties">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Source Properties</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Configure position, waveform, and polarization.</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "start" }}>
            <button style={buttonStyle} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {!src ? (
          <div style={{ marginTop: 12, opacity: 0.8 }}>No source selected.</div>
        ) : (
          <>
            <div style={sectionStyle}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Basic</div>
              <div style={gridStyle}>
                <div style={labelStyle}>Source type</div>
                <div style={fieldStyle}>
                  <input style={inputStyle} value={src.type ?? "gaussian_pulse"} onChange={(e) => set({ type: e.target.value })} />
                </div>

                <div style={labelStyle}>Component</div>
                <div style={fieldStyle}>
                  <select
                    style={inputStyle}
                    value={src.component}
                    onChange={(e) => set({ component: e.target.value })}
                    disabled={polarizationKind !== "linear"}
                  >
                    <option value="Ex">Ex</option>
                    <option value="Ey">Ey</option>
                    <option value="Ez">Ez</option>
                  </select>
                  {polarizationKind !== "linear" ? (
                    <span style={{ fontSize: 12, opacity: 0.75 }}>Linear component is derived from polarization.</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Position</div>
              <div style={gridStyle}>
                <div style={labelStyle}>X</div>
                <div style={fieldStyle}>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={formatNumber(src.position?.[0] ?? 0)}
                    onChange={(e) => set({ position: [safeParseNumber(e.target.value, src.position?.[0] ?? 0), src.position?.[1] ?? 0] })}
                  />
                </div>

                <div style={labelStyle}>Y</div>
                <div style={fieldStyle}>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={formatNumber(src.position?.[1] ?? 0)}
                    onChange={(e) => set({ position: [src.position?.[0] ?? 0, safeParseNumber(e.target.value, src.position?.[1] ?? 0)] })}
                  />
                </div>

                {dimensionMode === "3d" ? (
                  <>
                    <div style={labelStyle}>Z</div>
                    <div style={fieldStyle}>
                      <input
                        style={inputStyle}
                        inputMode="decimal"
                        value={formatNumber(src.z ?? 0)}
                        onChange={(e) => set({ z: safeParseNumber(e.target.value, src.z ?? 0) })}
                      />
                    </div>
                  </>
                ) : null}

                <div style={labelStyle}>Orientation (deg)</div>
                <div style={fieldStyle}>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={formatNumber(toDeg(src.orientation ?? 0))}
                    onChange={(e) =>
                      set({
                        orientation: toRad(clampNumber(safeParseNumber(e.target.value, toDeg(src.orientation ?? 0)), -3600, 3600)),
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Waveform</div>
              <div style={gridStyle}>
                <div style={labelStyle}>Selected waveform</div>
                <div style={fieldStyle}>
                  <select style={inputStyle} value={src.waveformId ?? ""} onChange={(e) => ensureWaveformSelected(e.target.value || undefined)}>
                    <option value="">(none)</option>
                    {waveformOptions.map((wf: any) => (
                      <option key={wf.id} value={wf.id}>
                        {wf.label}
                      </option>
                    ))}
                  </select>
                  <button style={buttonStyle} onClick={onDeleteSelectedWaveform} disabled={!src.waveformId}>
                    Delete
                  </button>
                </div>

                <div style={labelStyle}>New waveform</div>
                <div style={fieldStyle}>
                  <input style={inputStyle} value={newWaveformName} onChange={(e) => setNewWaveformName(e.target.value)} />
                  <button style={buttonStyle} onClick={onCreateWaveform}>
                    Create
                  </button>
                </div>

                <div style={labelStyle}>Center frequency</div>
                <div style={fieldStyle}>
                  <input style={inputStyle} inputMode="decimal" value={formatNumber(src.centerFreq ?? 0)} onChange={(e) => set({ centerFreq: safeParseNumber(e.target.value, src.centerFreq ?? 0) })} />
                </div>

                <div style={labelStyle}>Frequency width</div>
                <div style={fieldStyle}>
                  <input style={inputStyle} inputMode="decimal" value={formatNumber(src.fwidth ?? 0)} onChange={(e) => set({ fwidth: safeParseNumber(e.target.value, src.fwidth ?? 0) })} />
                </div>
              </div>
            </div>

            <div style={sectionStyle}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Polarization</div>
              <div style={gridStyle}>
                <div style={labelStyle}>Mode</div>
                <div style={fieldStyle}>
                  <select
                    style={inputStyle}
                    value={polarizationKind}
                    onChange={(e) => {
                      const kind = e.target.value as any;
                      if (kind === "linear") {
                        setPolarization({ kind: "linear" });
                        return;
                      }
                      if (kind === "circular") {
                        setPolarization({ kind: "circular", handedness: "right", plane: "xy", wrt: "global-xyz" });
                        return;
                      }
                      if (kind === "jones") {
                        setPolarization({
                          kind: "jones",
                          plane: "xy",
                          wrt: "global-xyz",
                          u: { amp: 1, phaseDeg: 0 },
                          v: { amp: 0, phaseDeg: 0 },
                        });
                      }
                    }}
                  >
                    <option value="linear">Linear</option>
                    <option value="circular">Circular</option>
                    <option value="jones">Jones (complex)</option>
                  </select>
                </div>

                {polarizationKind !== "linear" ? (
                  <>
                    <div style={labelStyle}>With respect to</div>
                    <div style={fieldStyle}>
                      <select
                        style={inputStyle}
                        value={(effectivePolarization as any).wrt ?? "global-xyz"}
                        onChange={(e) => {
                          const wrt = e.target.value as PolarizationWrt;
                          if (effectivePolarization.kind === "circular") setPolarization({ ...effectivePolarization, wrt });
                          if (effectivePolarization.kind === "jones") setPolarization({ ...effectivePolarization, wrt });
                        }}
                      >
                        <option value="global-xyz">World XYZ</option>
                        <option value="section-uvw">Section plane UVW</option>
                        <option value="object-local">Object local</option>
                      </select>
                    </div>

                    <div style={labelStyle}>Plane</div>
                    <div style={fieldStyle}>
                      <select
                        style={inputStyle}
                        value={(effectivePolarization as any).plane ?? "xy"}
                        onChange={(e) => {
                          const plane = e.target.value as PolarizationPlane;
                          if (effectivePolarization.kind === "circular") setPolarization({ ...effectivePolarization, plane });
                          if (effectivePolarization.kind === "jones") setPolarization({ ...effectivePolarization, plane });
                        }}
                      >
                        <option value="xy">XY</option>
                        <option value="xz">XZ</option>
                        <option value="yz">YZ</option>
                      </select>
                    </div>
                  </>
                ) : null}

                {effectivePolarization.kind === "circular" ? (
                  <>
                    <div style={labelStyle}>Handedness</div>
                    <div style={fieldStyle}>
                      <select
                        style={inputStyle}
                        value={effectivePolarization.handedness}
                        onChange={(e) => setPolarization({ ...effectivePolarization, handedness: e.target.value === "left" ? "left" : "right" })}
                      >
                        <option value="right">Right</option>
                        <option value="left">Left</option>
                      </select>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>Circular polarization uses equal amplitudes with ±90° phase.</div>
                    </div>
                  </>
                ) : null}

                {effectivePolarization.kind === "jones" ? (
                  <>
                    <div style={labelStyle}>U component (amp, phase°)</div>
                    <div style={fieldStyle}>
                      <input
                        style={inputStyle}
                        inputMode="decimal"
                        value={formatNumber(effectivePolarization.u.amp)}
                        onChange={(e) => setPolarization({ ...effectivePolarization, u: { ...effectivePolarization.u, amp: safeParseNumber(e.target.value, effectivePolarization.u.amp) } })}
                      />
                      <input
                        style={inputStyle}
                        inputMode="decimal"
                        value={formatNumber(effectivePolarization.u.phaseDeg)}
                        onChange={(e) => setPolarization({ ...effectivePolarization, u: { ...effectivePolarization.u, phaseDeg: safeParseNumber(e.target.value, effectivePolarization.u.phaseDeg) } })}
                      />
                    </div>

                    <div style={labelStyle}>V component (amp, phase°)</div>
                    <div style={fieldStyle}>
                      <input
                        style={inputStyle}
                        inputMode="decimal"
                        value={formatNumber(effectivePolarization.v.amp)}
                        onChange={(e) => setPolarization({ ...effectivePolarization, v: { ...effectivePolarization.v, amp: safeParseNumber(e.target.value, effectivePolarization.v.amp) } })}
                      />
                      <input
                        style={inputStyle}
                        inputMode="decimal"
                        value={formatNumber(effectivePolarization.v.phaseDeg)}
                        onChange={(e) => setPolarization({ ...effectivePolarization, v: { ...effectivePolarization.v, phaseDeg: safeParseNumber(e.target.value, effectivePolarization.v.phaseDeg) } })}
                      />
                    </div>

                    <div style={labelStyle}>Preview</div>
                    <div style={fieldStyle}>
                      <PolarizationEllipsePreview
                        aAmp={effectivePolarization.u.amp}
                        aPhaseDeg={effectivePolarization.u.phaseDeg}
                        bAmp={effectivePolarization.v.amp}
                        bPhaseDeg={effectivePolarization.v.phaseDeg}
                        size={140}
                      />
                      <div style={{ fontSize: 12, opacity: 0.75, maxWidth: 340 }}>
                        Ellipse shows the relative field components over time.
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
