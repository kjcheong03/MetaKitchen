import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

const LANG_LABELS: Record<string, string> = {
  en: "English", hi: "Hindi", "hi-en": "Hinglish",
  ta: "Tamil", te: "Telugu", bn: "Bengali", kn: "Kannada", mr: "Marathi",
};

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default async function AdminPage() {
  const [
    { data: sessions },
    { data: recentSessions },
  ] = await Promise.all([
    supabase.from("chat_sessions").select("id, message_count, safety_triggered, language_id, started_at, last_active_at"),
    supabase.from("chat_sessions")
      .select("id, language_id, message_count, safety_triggered, started_at, last_active_at")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const langRaw = sessions;

  // ── Aggregate stats ──────────────────────────────────────────────
  const totalSessions = sessions?.length ?? 0;
  const totalMessages = sessions?.reduce((sum, s) => sum + (s.message_count ?? 0), 0) ?? 0;
  const avgMessages = totalSessions > 0 ? (totalMessages / totalSessions).toFixed(1) : "0";
  const safetyHits = sessions?.filter(s => s.safety_triggered).length ?? 0;

  // Language breakdown
  const langCounts: Record<string, number> = {};
  langRaw?.forEach(s => { langCounts[s.language_id] = (langCounts[s.language_id] ?? 0) + 1; });
  const langEntries = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  const langMax = langEntries[0]?.[1] ?? 1;

  // Sessions per day (last 7 days)
  const days: { label: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-IN", { weekday: "short" });
    const dateStr = d.toISOString().split("T")[0];
    const count = sessions?.filter(s => s.started_at?.startsWith(dateStr)).length ?? 0;
    days.push({ label, count });
  }
  const dayMax = Math.max(...days.map(d => d.count), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#f8faf9", fontFamily: "'Inter', system-ui, sans-serif", color: "#1a2e2a" }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ background: "#075e54", boxShadow: "0 1px 12px rgba(7,94,84,0.18)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 64px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>Dr Aara Analytics</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>Conversation Dashboard</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#25d366", display: "inline-block" }} />
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Live</span>
              </div>
              <a href="/" style={{ fontSize: 12, padding: "6px 14px", borderRadius: 20, background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", textDecoration: "none", border: "1px solid rgba(255,255,255,0.15)" }}>
                ← Back to Dr Aara
              </a>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 64px 48px" }}>

        {/* ── KPI Cards ────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Total Sessions",     value: totalSessions, icon: "💬", accent: "#075e54", sub: "all time" },
            { label: "User Messages",       value: totalMessages, icon: "📨", accent: "#128c7e", sub: "sent by users" },
            { label: "Avg / Session",       value: avgMessages,   icon: "📊", accent: "#25d366", sub: "engagement" },
            { label: "Safety Triggers",     value: safetyHits,    icon: "🛡️", accent: "#e8a000", sub: "guardrail hits" },
          ].map(card => (
            <div key={card.label} style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", boxShadow: "0 1px 4px rgba(7,94,84,0.07), 0 4px 16px rgba(7,94,84,0.05)", border: "1px solid rgba(7,94,84,0.08)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ fontSize: 22 }}>{card.icon}</span>
                <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 20, background: `${card.accent}12`, color: card.accent, fontWeight: 600, letterSpacing: "0.3px", textTransform: "uppercase" }}>{card.sub}</span>
              </div>
              <div style={{ fontSize: 34, fontWeight: 800, color: "#1a2e2a", letterSpacing: "-1px", lineHeight: 1 }}>{card.value}</div>
              <div style={{ fontSize: 12, color: "#7a9e98", marginTop: 6, fontWeight: 500 }}>{card.label}</div>
            </div>
          ))}
        </div>

        {/* ── Charts Row ───────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>

          {/* Sessions bar chart */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px", boxShadow: "0 1px 4px rgba(7,94,84,0.07), 0 4px 16px rgba(7,94,84,0.05)", border: "1px solid rgba(7,94,84,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e2a", marginBottom: 4 }}>Sessions — Last 7 Days</div>
            <div style={{ fontSize: 11, color: "#7a9e98", marginBottom: 20 }}>Daily conversation volume</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
              {days.map(d => (
                <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: d.count > 0 ? "#075e54" : "transparent" }}>{d.count}</span>
                  <div style={{
                    width: "100%",
                    borderRadius: "6px 6px 0 0",
                    height: d.count === 0 ? 4 : Math.max(10, (d.count / dayMax) * 96),
                    background: d.count === 0 ? "#e8f5f3" : "linear-gradient(to top, #075e54, #25d366)",
                    transition: "height 0.3s ease",
                  }} />
                  <span style={{ fontSize: 10, color: "#a8c5bf", fontWeight: 500 }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Language breakdown */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "24px", boxShadow: "0 1px 4px rgba(7,94,84,0.07), 0 4px 16px rgba(7,94,84,0.05)", border: "1px solid rgba(7,94,84,0.08)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e2a", marginBottom: 4 }}>Language Distribution</div>
            <div style={{ fontSize: 11, color: "#7a9e98", marginBottom: 20 }}>Sessions by selected language</div>
            {langEntries.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 96, color: "#a8c5bf", fontSize: 13 }}>No sessions yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {langEntries.map(([id, count]) => (
                  <div key={id}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1a2e2a" }}>{LANG_LABELS[id] ?? id}</span>
                      <span style={{ fontSize: 11, color: "#7a9e98", fontWeight: 500 }}>{count} · {Math.round(count / totalSessions * 100)}%</span>
                    </div>
                    <div style={{ width: "100%", height: 6, borderRadius: 99, background: "#e8f5f3" }}>
                      <div style={{ height: 6, borderRadius: 99, width: `${(count / langMax) * 100}%`, background: "linear-gradient(to right, #075e54, #25d366)" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Safety summary strip ─────────────────────────────────── */}
        <div style={{ background: "linear-gradient(135deg, #075e54 0%, #128c7e 100%)", borderRadius: 16, padding: "20px 28px", marginBottom: 24, display: "flex", alignItems: "center", gap: 32, boxShadow: "0 4px 20px rgba(7,94,84,0.2)" }}>
          <div style={{ fontSize: 28 }}>🛡️</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Safety Guardrails</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>Blocked phrases & medical claim detection</div>
          </div>
          {[
            { label: "Triggered", value: safetyHits, color: "#fbbf24" },
            { label: "Clean sessions", value: totalSessions - safetyHits, color: "#4ade80" },
            { label: "Trigger rate", value: totalSessions > 0 ? `${Math.round((safetyHits / totalSessions) * 100)}%` : "0%", color: "#fff" },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: "center", padding: "0 24px", borderLeft: "1px solid rgba(255,255,255,0.12)" }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: stat.color, letterSpacing: "-0.5px" }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Recent Sessions Table ────────────────────────────────── */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 1px 4px rgba(7,94,84,0.07), 0 4px 16px rgba(7,94,84,0.05)", border: "1px solid rgba(7,94,84,0.08)", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f6f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2e2a" }}>Recent Sessions</div>
              <div style={{ fontSize: 11, color: "#7a9e98", marginTop: 2 }}>Latest 20 conversations</div>
            </div>
            <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#e8f5f3", color: "#075e54", fontWeight: 600 }}>LIVE</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8faf9" }}>
                  {["Session ID", "Language", "Messages", "Safety", "Started", "Last Active"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 20px", fontSize: 11, fontWeight: 600, color: "#7a9e98", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #f0f6f5" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!recentSessions || recentSessions.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: "48px 24px", textAlign: "center", color: "#a8c5bf", fontSize: 13 }}>No sessions yet — start chatting with Dr Aara!</td></tr>
                ) : (
                  recentSessions.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: i < recentSessions.length - 1 ? "1px solid #f5f9f8" : "none" }}>
                      <td style={{ padding: "14px 20px", fontFamily: "monospace", fontSize: 12, color: "#7a9e98" }}>{s.id.slice(0, 8)}…</td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, background: "#e8f5f3", color: "#075e54", fontWeight: 600, fontSize: 11 }}>
                          {LANG_LABELS[s.language_id] ?? s.language_id}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ fontWeight: 700, color: "#1a2e2a" }}>{s.message_count ?? 0}</span>
                        <span style={{ color: "#a8c5bf", fontSize: 11, marginLeft: 4 }}>msgs</span>
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        {s.safety_triggered
                          ? <span style={{ padding: "3px 10px", borderRadius: 20, background: "#fef3c7", color: "#d97706", fontWeight: 600, fontSize: 11 }}>⚠ Triggered</span>
                          : <span style={{ padding: "3px 10px", borderRadius: 20, background: "#dcfce7", color: "#16a34a", fontWeight: 600, fontSize: 11 }}>✓ Clean</span>}
                      </td>
                      <td style={{ padding: "14px 20px", color: "#4a7a72", fontSize: 12 }}>{formatDate(s.started_at)}</td>
                      <td style={{ padding: "14px 20px", color: "#a8c5bf", fontSize: 12 }}>{timeAgo(s.last_active_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#a8c5bf" }}>
        </div>
      </div>
    </div>
  );
}
