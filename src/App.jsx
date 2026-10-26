import { useState, useEffect, useCallback } from 'react';
import { getEpidemicData } from './services/api';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Brush, ReferenceLine, Area
} from 'recharts';

// ─── Color tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#0d1117',
  surface:   '#161b22',
  border:    '#21262d',
  borderAlt: '#30363d',
  textPri:   '#e6edf3',
  textSec:   '#8b949e',
  textMut:   '#484f58',
  blue:      '#58a6ff',
  blueGlow:  'rgba(88,166,255,0.15)',
  red:       '#ff7b72',
  redGlow:   'rgba(255,123,114,0.12)',
  green:     '#3fb950',
  greenGlow: 'rgba(63,185,80,0.12)',
  yellow:    '#d29922',
  purple:    '#bc8cff',
  accent:    '#1f6feb',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtNum = (v) => {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toLocaleString();
};

const logTick = (v) => {
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`;
  return v;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.borderAlt}`,
      borderRadius: 8, padding: '10px 14px', fontSize: 13,
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <p style={{ color: C.textSec, margin: '0 0 8px', fontSize: 11, fontFamily: 'monospace' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 4 }}>
          <span style={{ color: p.color, fontWeight: 500 }}>{p.name}</span>
          <span style={{ color: C.textPri, fontFamily: 'monospace' }}>{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

const KpiCard = ({ label, value, color, sub }) => (
  <div style={{
    background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: '16px 20px', flex: '1 1 140px', minWidth: 130,
  }}>
    <div style={{ color: C.textSec, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
    <div style={{ color: color || C.textPri, fontSize: 24, fontWeight: 700, fontFamily: 'monospace', letterSpacing: -1 }}>{value}</div>
    {sub && <div style={{ color: C.textMut, fontSize: 11, marginTop: 4 }}>{sub}</div>}
  </div>
);

const SliderRow = ({ label, value, min, max, step, onChange, color, format }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ color: C.textSec, fontSize: 13 }}>{label}</span>
      <span style={{ color: color, fontFamily: 'monospace', fontSize: 13, fontWeight: 700 }}>
        {format ? format(value) : value}
      </span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
    />
    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
      <span style={{ color: C.textMut, fontSize: 10 }}>{min}</span>
      <span style={{ color: C.textMut, fontSize: 10 }}>{max}</span>
    </div>
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────
const COUNTRIES = [
  { value: 'Morocco', label: '🇲🇦 Maroc' },
  { value: 'France',  label: '🇫🇷 France' },
  { value: 'USA',     label: '🇺🇸 États-Unis' },
];

export default function App() {
  const [country, setCountry]       = useState('Morocco');
  const [beta, setBeta]             = useState(0.30);
  const [gamma, setGamma]           = useState(0.05);
  const [logScale, setLogScale]     = useState(false);
  const [showProj, setShowProj]     = useState(true);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [apiData, setApiData]       = useState(null);
  const [chartData, setChartData]   = useState([]);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    getEpidemicData(country, beta, gamma)
      .then(res => {
        setApiData(res);
        const combined = [
          ...res.historical,
          ...(showProj ? res.projection : []),
        ];
        setChartData(combined);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message || 'Erreur réseau');
        setLoading(false);
      });
  }, [country, beta, gamma, showProj]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Recompute chart when projection toggle changes (no refetch needed)
  useEffect(() => {
    if (!apiData) return;
    const combined = [
      ...apiData.historical,
      ...(showProj ? apiData.projection : []),
    ];
    setChartData(combined);
  }, [showProj, apiData]);

  const meta   = apiData?.meta;
  const R0_val = meta?.R0 ?? '—';
  const lastH  = apiData?.historical?.at(-1);

  // Projection start index for reference line
  const projStartDate = apiData?.historical?.at(-1)?.date;

  // Ticks for log scale: skip 0 and negatives
  const safeLog = (v) => (v <= 0 ? null : v);

  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.textPri, fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ borderBottom: `1px solid ${C.border}`, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
            <span style={{ color: C.textPri, fontWeight: 700, fontSize: 18, letterSpacing: -0.3 }}>
              Dashboard Épidémiologique
            </span>
            <span style={{ background: C.accent, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.05em' }}>
              SIMLR
            </span>
          </div>
          <div style={{ color: C.textMut, fontSize: 12, marginTop: 3, marginLeft: 18 }}>
            Filière GLD — ENSEM · Données JHU CSSE
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {COUNTRIES.map(c => (
            <button key={c.value}
              onClick={() => setCountry(c.value)}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500,
                background: country === c.value ? C.accent : 'transparent',
                color: country === c.value ? '#fff' : C.textSec,
                border: `1px solid ${country === c.value ? C.accent : C.border}`,
                transition: 'all 0.15s',
              }}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── KPI Row ── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <KpiCard label="Population"    value={meta ? fmtNum(meta.population)   : '—'} color={C.textPri} />
          <KpiCard label="Infectés actifs" value={lastH ? fmtNum(lastH.infected) : '—'} color={C.red}   sub="dernier jour historique" />
          <KpiCard label="Guéris cumulés"  value={lastH ? fmtNum(lastH.recovered): '—'} color={C.green} sub="estimé à 94%" />
          <KpiCard label="β (transmission)"value={meta ? meta.beta : '—'}               color={C.blue}  sub="contacts infectieux/jour" />
          <KpiCard label="γ (guérison)"    value={meta ? meta.gamma : '—'}              color={C.purple} sub="taux de sortie/jour" />
          <KpiCard
            label="R₀ = β/γ"
            value={R0_val}
            color={parseFloat(R0_val) > 1 ? C.red : C.green}
            sub={parseFloat(R0_val) > 1 ? '⚠ épidémie active' : '✓ sous contrôle'}
          />
        </div>

        {/* ── Main grid: chart + sidebar ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>

          {/* ── Chart card ── */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '20px 16px 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingRight: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>Courbes SIR — Analyse temporelle</div>
                <div style={{ color: C.textMut, fontSize: 12, marginTop: 2 }}>Données réelles + projection SIR ({meta?.R0 != null ? `R₀ = ${meta.R0}` : '…'})</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setLogScale(!logScale)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: logScale ? C.blueGlow : 'transparent',
                    color: logScale ? C.blue : C.textSec,
                    border: `1px solid ${logScale ? C.blue : C.border}`,
                    fontWeight: 600, transition: 'all 0.15s',
                  }}>
                  Échelle log
                </button>
                <button
                  onClick={() => setShowProj(!showProj)}
                  style={{
                    padding: '5px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                    background: showProj ? 'rgba(188,140,255,0.12)' : 'transparent',
                    color: showProj ? C.purple : C.textSec,
                    border: `1px solid ${showProj ? C.purple : C.border}`,
                    fontWeight: 600, transition: 'all 0.15s',
                  }}>
                  Projection
                </button>
              </div>
            </div>

            {loading ? (
              <div style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ color: C.textMut, fontSize: 13 }}>Chargement des données JHU…</span>
              </div>
            ) : error ? (
              <div style={{ height: 440, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <div style={{ color: C.red, fontSize: 14 }}>⚠ {error}</div>
                <button onClick={fetchData} style={{ padding: '6px 14px', background: C.accent, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Réessayer</button>
              </div>
            ) : (
              <div style={{ width: '100%', height: 460 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ top: 4, right: 12, left: 10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />

                    <XAxis
                      dataKey="date"
                      stroke={C.textMut}
                      tick={{ fill: C.textMut, fontSize: 11 }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />

                    <YAxis
                      scale={logScale ? 'log' : 'auto'}
                      domain={logScale ? ['auto', 'auto'] : ['auto', 'auto']}
                      allowDataOverflow={false}
                      tickFormatter={logScale ? logTick : fmtNum}
                      width={70}
                      stroke={C.textMut}
                      tick={{ fill: C.textMut, fontSize: 11 }}
                      tickLine={false}
                      allowDecimals={false}
                    />

                    <Tooltip content={<CustomTooltip />} />

                    <Legend
                      verticalAlign="top"
                      height={32}
                      wrapperStyle={{ fontSize: 12, color: C.textSec, paddingBottom: 4 }}
                    />

                    {/* Reference line at projection start */}
                    {showProj && projStartDate && (
                      <ReferenceLine
                        x={projStartDate}
                        stroke={C.purple}
                        strokeDasharray="4 3"
                        label={{ value: 'Projection →', position: 'insideTopRight', fill: C.purple, fontSize: 11 }}
                      />
                    )}

                    <Line
                      type="monotone"
                      dataKey="susceptible"
                      name="S — Susceptibles"
                      stroke={C.blue}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, fill: C.blue, strokeWidth: 0 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="infected"
                      name="I — Infectés actifs"
                      stroke={C.red}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: C.red, strokeWidth: 0 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="recovered"
                      name="R — Guéris"
                      stroke={C.green}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 5, fill: C.green, strokeWidth: 0 }}
                      connectNulls
                    />

                    <Brush
                      dataKey="date"
                      height={32}
                      stroke={C.borderAlt}
                      fill={C.bg}
                      travellerWidth={6}
                      tickFormatter={(v) => v?.slice(0, 7)}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* ── Sidebar: parameters ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Param card */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Paramètres du modèle SIR</div>
              <div style={{ color: C.textMut, fontSize: 11, marginBottom: 18 }}>Modifie β et γ pour voir la projection</div>

              <SliderRow
                label="β — Taux de transmission"
                value={beta}
                min={0.01} max={1.0} step={0.01}
                onChange={setBeta}
                color={C.blue}
                format={(v) => v.toFixed(2)}
              />
              <SliderRow
                label="γ — Taux de guérison"
                value={gamma}
                min={0.001} max={0.5} step={0.001}
                onChange={setGamma}
                color={C.green}
                format={(v) => v.toFixed(3)}
              />

              {/* R0 gauge */}
              <div style={{ background: C.bg, borderRadius: 8, padding: '12px 14px', marginTop: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: C.textSec, fontSize: 12 }}>R₀ = β / γ</span>
                  <span style={{
                    fontFamily: 'monospace', fontWeight: 700, fontSize: 18,
                    color: (beta / gamma) > 1 ? C.red : C.green
                  }}>
                    {(beta / gamma).toFixed(2)}
                  </span>
                </div>
                <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(100, (beta / gamma / 10) * 100)}%`,
                    background: (beta / gamma) > 1 ? C.red : C.green,
                    borderRadius: 3, transition: 'width 0.3s, background 0.3s',
                  }} />
                </div>
                <div style={{ color: C.textMut, fontSize: 10, marginTop: 5 }}>
                  {(beta / gamma) > 2 ? '🔴 Épidémie rapide' : (beta / gamma) > 1 ? '🟡 Propagation active' : '🟢 Épidémie en déclin'}
                </div>
              </div>

              <button
                onClick={fetchData}
                disabled={loading}
                style={{
                  width: '100%', marginTop: 16, padding: '9px 0', borderRadius: 7,
                  background: loading ? C.borderAlt : C.accent, color: '#fff',
                  border: 'none', fontWeight: 600, fontSize: 13, cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}>
                {loading ? 'Chargement…' : '⟳ Appliquer la projection'}
              </button>
            </div>

            {/* Legend card */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 18px', fontSize: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Compartiments SIR</div>
              {[
                { color: C.blue,   letter: 'S', name: 'Susceptibles', desc: 'Population non encore infectée' },
                { color: C.red,    letter: 'I', name: 'Infectés',     desc: 'Cas actifs estimés' },
                { color: C.green,  letter: 'R', name: 'Guéris/Retirés', desc: '94% des cas cumulés' },
              ].map(c => (
                <div key={c.letter} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: `${c.color}20`, border: `1.5px solid ${c.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: c.color, fontWeight: 700, fontSize: 13 }}>{c.letter}</div>
                  <div>
                    <div style={{ color: C.textPri, fontWeight: 500 }}>{c.name}</div>
                    <div style={{ color: C.textMut, fontSize: 11, marginTop: 1 }}>{c.desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 6, paddingTop: 10, color: C.textMut, fontSize: 11 }}>
                Ligne <span style={{ color: C.purple }}>━━</span> : début projection
              </div>
            </div>

          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        #root { width: 100%; max-width: 100%; border: none; min-height: 100svh; }
        input[type=range] { height: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
