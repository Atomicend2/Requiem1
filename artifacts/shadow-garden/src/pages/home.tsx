import { useGetCommunityStats } from "@workspace/api-client-react/src/generated/api";
import { Button } from "@/components/ui/button";
import { Users, CreditCard, Shield, Activity, ArrowRight, Zap, Sword, Coins } from "lucide-react";

export default function Home() {
  const { data: stats, isLoading } = useGetCommunityStats();

  return (
    <div className="min-h-[100dvh]">

      {/* ── Hero ───────────────────────────────────────────── */}
      <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">

        {/* Grid overlay — the signature element */}
        <div className="absolute inset-0 grid-overlay opacity-60" />
        <div className="absolute inset-0 scanline" />

        {/* Ambient glows */}
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full bg-cyan-400/[0.04] blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[10%] right-[-5%] w-[400px] h-[400px] rounded-full bg-violet-600/[0.05] blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-background to-transparent pointer-events-none" />

        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto">

          {/* Status chip */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-400/20 bg-cyan-400/[0.05] text-cyan-400 text-[11px] font-mono tracking-[0.2em] uppercase mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_6px_rgba(0,255,255,1)]" />
            System Online — Join the Order
          </div>

          {/* Main headline */}
          <h1 className="mb-6" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            <span className="block text-[11px] font-mono text-white/20 tracking-[0.5em] uppercase mb-4">
              Requiem Order
            </span>
            <span className="block text-5xl sm:text-7xl md:text-8xl font-bold leading-[0.9] tracking-tight text-white">
              Collect.<br />
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(135deg, #00FFFF 0%, #7C3AED 100%)" }}>
                Conquer.
              </span>
            </span>
          </h1>

          <p className="text-base md:text-lg text-white/35 mb-12 max-w-lg mx-auto leading-relaxed font-light">
            A WhatsApp-native card game with guilds, economy, and ranked combat. 35,000+ cards. One community.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="https://chat.whatsapp.com/IZi7UphEO9O76lY8dFYUYn?mode=gi_t" target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto h-12 px-8 bg-cyan-400 hover:bg-cyan-300 text-[#06060e] font-bold tracking-wide text-sm rounded-md transition-all duration-200 hover:shadow-[0_0_24px_rgba(0,255,255,0.4)] flex items-center gap-2">
                Join on WhatsApp
                <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
            <a href="#stats" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-12 px-8 border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/[0.04] font-medium text-sm rounded-md transition-all duration-200">
                View Stats
              </Button>
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-30">
          <div className="w-px h-10 bg-gradient-to-b from-transparent via-cyan-400 to-transparent" />
        </div>
      </section>

      {/* ── Stats ──────────────────────────────────────────── */}
      <section id="stats" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[10px] font-mono text-cyan-400/40 tracking-[0.4em] uppercase mb-2">Live</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Community Stats</h2>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1,2,3,4].map(i => <div key={i} className="h-28 glass-card rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users}      label="Members"       value={stats?.totalMembers ?? 0}        color="cyan" />
              <StatCard icon={CreditCard} label="Cards"         value={stats?.totalCards ?? 0}          color="violet" />
              <StatCard icon={Shield}     label="Guilds"        value={stats?.totalGuilds ?? 0}         color="cyan" />
              <StatCard icon={Activity}   label="Bots Online"   value={(stats as any)?.totalBots ?? 0}  color="violet" />
            </div>
          )}
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[10px] font-mono text-cyan-400/40 tracking-[0.4em] uppercase mb-2">Features</p>
            <h2 className="text-2xl md:text-3xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>What You Get</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="glass-card rounded-xl p-5 group cursor-default">
                <div className="w-9 h-9 rounded-lg bg-cyan-400/[0.07] border border-cyan-400/15 flex items-center justify-center mb-4 group-hover:border-cyan-400/30 transition-colors">
                  <f.icon className="w-4 h-4 text-cyan-400" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1.5" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{f.title}</h3>
                <p className="text-xs text-white/35 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────── */}
      <section className="py-24 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 grid-overlay opacity-30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cyan-400/[0.02] to-transparent pointer-events-none" />
        <div className="relative z-10 max-w-xl mx-auto">
          <p className="text-[10px] font-mono text-cyan-400/40 tracking-[0.5em] uppercase mb-4">Ready?</p>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Join the Order
          </h2>
          <p className="text-sm text-white/30 mb-8">Connect on WhatsApp and start building your collection today.</p>
          <a href="https://chat.whatsapp.com/IZi7UphEO9O76lY8dFYUYn?mode=gi_t" target="_blank" rel="noopener noreferrer">
            <Button size="lg" className="h-12 px-10 bg-cyan-400 hover:bg-cyan-300 text-[#06060e] font-bold text-sm tracking-wide rounded-md hover:shadow-[0_0_24px_rgba(0,255,255,0.4)] transition-all flex items-center gap-2 mx-auto">
              <Zap className="w-4 h-4" />
              Join Requiem Order
            </Button>
          </a>
        </div>
      </section>
    </div>
  );
}

const FEATURES = [
  { icon: CreditCard, title: "Card Codex",    desc: "35,000+ cards from Shoob, tiered T1–TX. Collect, trade, and flex your rarest pulls." },
  { icon: Shield,     title: "Guilds",        desc: "Form alliances, pool resources, and dominate the guild leaderboard together." },
  { icon: Sword,      title: "Combat",        desc: "Dungeon raids, class unlocks, and PvP battles with real stakes." },
  { icon: Coins,      title: "Economy",       desc: "Earn gold, bank wealth, trade on the marketplace, and spin the gacha." },
  { icon: Users,      title: "Community",     desc: "WhatsApp-native with moderation, anti-spam, and real-time rankings." },
  { icon: Zap,        title: "Gacha",         desc: "Exclusive legendary pulls for members only. Chase your next TS-tier card." },
];

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: "cyan" | "violet" }) {
  const isCyan = color === "cyan";
  return (
    <div className="glass-card rounded-xl p-5">
      <Icon className={`w-4 h-4 mb-3 ${isCyan ? "text-cyan-400" : "text-violet-400"}`} />
      <p className={`text-2xl font-bold font-mono mb-0.5 ${isCyan ? "text-cyan-400" : "text-violet-400"}`}>
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-white/30 uppercase tracking-wider">{label}</p>
    </div>
  );
}
