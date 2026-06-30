import { useGetStats, getGetStatsQueryKey, useGetStatsChart, getGetStatsChartQueryKey, useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { MessageSquare, Radio, ListTree, AlertCircle, Clock, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

function StatCard({ title, value, sub, icon: Icon, color }: { title: string; value: number | string; sub?: string; icon: any; color: string }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <div className={`p-2 rounded-md ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey(), refetchInterval: 5000 } });
  const { data: chartRaw } = useGetStatsChart({ query: { queryKey: getGetStatsChartQueryKey(), refetchInterval: 30000 } });
  const { data: sessionsRaw } = useListSessions({ query: { queryKey: getListSessionsQueryKey(), refetchInterval: 5000 } });

  const chartData = Array.isArray(chartRaw) ? chartRaw.map((d) => ({
    ...d,
    date: format(new Date(d.date), "dd MMM", { locale: idLocale }),
  })) : [];

  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];

  const statusColor: Record<string, string> = {
    connected: "text-green-500",
    connecting: "text-yellow-500",
    disconnected: "text-muted-foreground",
    banned: "text-destructive",
  };

  const statusLabel: Record<string, string> = {
    connected: "Terhubung",
    connecting: "Menghubungkan...",
    disconnected: "Terputus",
    banned: "Diblokir",
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Beranda</h1>
        <p className="text-muted-foreground">Ringkasan sistem bot WhatsApp Anda</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Sesi Aktif"
          value={stats?.activeSessions ?? 0}
          sub={`dari ${stats?.totalSessions ?? 0} total sesi`}
          icon={Radio}
          color="bg-green-500/10 text-green-500"
        />
        <StatCard
          title="Pesan Hari Ini"
          value={stats?.messagesToday ?? 0}
          sub={`Total: ${stats?.messagesTotal ?? 0}`}
          icon={MessageSquare}
          color="bg-primary/10 text-primary"
        />
        <StatCard
          title="Aturan Aktif"
          value={stats?.activeRules ?? 0}
          sub={`dari ${stats?.totalRules ?? 0} aturan`}
          icon={ListTree}
          color="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          title="Antrian Tertunda"
          value={stats?.pendingMessages ?? 0}
          sub="Pesan belum dibalas"
          icon={Clock}
          color={(stats?.pendingMessages ?? 0) > 0 ? "bg-yellow-500/10 text-yellow-500" : "bg-muted text-muted-foreground"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-card border-border col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Pesan 7 Hari Terakhir</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, color: "hsl(var(--foreground))" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area type="monotone" dataKey="count" name="Pesan" stroke="hsl(var(--primary))" fill="url(#colorMsg)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Status Sesi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Belum ada sesi. Buka menu Sesi untuk membuat baru.</p>
            ) : (
              sessions.map((s) => (
                <div key={s.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.phoneNumber ?? "Belum login"}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-medium ${statusColor[s.status] ?? "text-muted-foreground"}`}>
                      {statusLabel[s.status] ?? s.status}
                    </span>
                    <div className="flex gap-2 text-[10px] text-muted-foreground">
                      <span>{s.messagesReceived} diterima</span>
                      <span>{s.messagesSent} terkirim</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
