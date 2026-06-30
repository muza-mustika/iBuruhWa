import { useState, useEffect, useRef } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { loadSettings, saveSettings, resetSettings, DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Save, RotateCcw, CheckCircle2, Globe, Monitor, Database, Loader2, XCircle, RefreshCw, Shield, Webhook, Terminal, Plug } from "lucide-react";

type DbStatus = { dbConnected: boolean; maskedUrl: string | null; message: string };

function useDbStatus() {
  const [status, setStatus] = useState<DbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const fetch_ = async () => {
    setLoading(true);
    try { setStatus(await (await fetch("/api/setup/status")).json()); } catch { setStatus({ dbConnected: false, maskedUrl: null, message: "Tidak bisa menghubungi API server" }); }
    setLoading(false);
  };
  useEffect(() => { fetch_(); }, []);
  return { status, loading, refresh: fetch_ };
}

function DbStatusBadge({ status, loading }: { status: DbStatus | null; loading: boolean }) {
  if (loading) return <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Memeriksa...</div>;
  return (
    <div className={`flex items-center gap-2 text-sm ${status?.dbConnected ? "text-green-500" : "text-destructive"}`}>
      {status?.dbConnected ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
      <span>{status?.dbConnected ? `Terhubung${status.maskedUrl ? ` · ${status.maskedUrl}` : ""}` : (status?.message ?? "Tidak terhubung")}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [client, setClient] = useState<AppSettings>(() => loadSettings());
  const { status: dbStatus, loading: dbLoading, refresh: refreshDb } = useDbStatus();

  const [dbUrl, setDbUrl] = useState("");
  const [dbTesting, setDbTesting] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbTestResult, setDbTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [scriptOutput, setScriptOutput] = useState<string[]>([]);
  const scriptRef = useRef<HTMLDivElement>(null);

  const { data: serverRaw, isLoading: serverLoading, refetch: refetchSettings } = useGetSettings({ query: { queryKey: ["settings"] } });
  const serverSettings = (serverRaw as Record<string, string>) ?? {};
  const [serverLocal, setServerLocal] = useState<Record<string, string>>({});
  const merged = { ...serverSettings, ...serverLocal };
  const set = (k: string, v: string) => setServerLocal((p) => ({ ...p, [k]: v }));

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Pengaturan server disimpan" }); refetchSettings(); },
      onError: () => toast({ title: "Gagal simpan pengaturan", variant: "destructive" }),
    },
  });

  const handleTestDb = async () => {
    if (!dbUrl.trim()) { toast({ title: "Masukkan URL database terlebih dahulu", variant: "destructive" }); return; }
    setDbTesting(true); setDbTestResult(null);
    try {
      const r = await fetch("/api/setup/test-db", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ databaseUrl: dbUrl }) });
      setDbTestResult(await r.json());
    } catch { setDbTestResult({ ok: false, message: "Tidak bisa menghubungi server" }); }
    setDbTesting(false);
  };

  const handleSaveDb = async () => {
    if (!dbUrl.trim()) { toast({ title: "Masukkan URL database terlebih dahulu", variant: "destructive" }); return; }
    setDbSaving(true); setDbTestResult(null);
    try {
      const r = await fetch("/api/setup/save-db-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ databaseUrl: dbUrl }) });
      const result = await r.json();
      if (result.ok) {
        toast({ title: "Database berhasil terhubung!", description: result.migration?.message ?? "" });
        setDbUrl("");
        await refreshDb();
        await refetchSettings();
      } else {
        toast({ title: "Gagal", description: result.message, variant: "destructive" });
      }
      setDbTestResult(result);
    } catch { toast({ title: "Error koneksi", variant: "destructive" }); }
    setDbSaving(false);
  };

  const handleMigrate = async () => {
    setMigrating(true); setMigrateResult(null);
    try {
      const r = await fetch("/api/setup/migrate", { method: "POST" });
      const result = await r.json();
      setMigrateResult(result);
      if (result.ok) toast({ title: "Migrasi berhasil" });
      else toast({ title: "Migrasi gagal", description: result.message, variant: "destructive" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    setMigrating(false);
  };

  const handleRunUpdate = async () => {
    setScriptOutput(["Menjalankan update script..."]);
    try {
      const r = await fetch("/api/setup/migrate", { method: "POST" });
      const result = await r.json();
      setScriptOutput(prev => [...prev, result.ok ? `✓ ${result.message}` : `✗ ${result.message}`]);
      if (scriptRef.current) scriptRef.current.scrollTop = scriptRef.current.scrollHeight;
    } catch (err: any) {
      setScriptOutput(prev => [...prev, `Error: ${err?.message}`]);
    }
  };

  const handleSaveServer = () => updateSettings.mutate({ data: merged as any });
  const handleSaveClient = () => { saveSettings(client); toast({ title: "Pengaturan klien disimpan" }); };
  const handleResetClient = () => { setClient(resetSettings()); toast({ title: "Pengaturan direset" }); };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Pengaturan</h1>
        <p className="text-muted-foreground">Konfigurasi menyeluruh sistem bot WhatsApp.</p>
      </div>

      <Tabs defaultValue="database">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="database" className="gap-1 text-xs"><Database className="h-3 w-3" />Database</TabsTrigger>
          <TabsTrigger value="server" className="gap-1 text-xs"><Monitor className="h-3 w-3" />Bot</TabsTrigger>
          <TabsTrigger value="antiban" className="gap-1 text-xs"><Shield className="h-3 w-3" />Anti-Ban</TabsTrigger>
          <TabsTrigger value="webhook" className="gap-1 text-xs"><Webhook className="h-3 w-3" />Webhook</TabsTrigger>
          <TabsTrigger value="client" className="gap-1 text-xs"><Globe className="h-3 w-3" />Klien</TabsTrigger>
        </TabsList>

        {/* ── DATABASE ── */}
        <TabsContent value="database" className="space-y-4 mt-4">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Status Database
                <Button variant="ghost" size="sm" onClick={refreshDb} className="h-7 w-7 p-0"><RefreshCw className="h-4 w-4" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DbStatusBadge status={dbStatus} loading={dbLoading} />
              {dbStatus?.dbConnected && (
                <div className="flex gap-2 flex-wrap pt-2">
                  <Button size="sm" variant="outline" onClick={handleMigrate} disabled={migrating} className="gap-2">
                    {migrating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Database className="h-3 w-3" />}
                    Jalankan Migrasi
                  </Button>
                  {migrateResult && (
                    <Badge variant={migrateResult.ok ? "default" : "destructive"}>
                      {migrateResult.ok ? "✓" : "✗"} {migrateResult.message}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Konfigurasi Koneksi Database</CardTitle>
              <CardDescription>
                Masukkan URL koneksi PostgreSQL. Mendukung Supabase, Neon, Railway, atau database lokal.
                URL yang disimpan akan otomatis digunakan setiap kali server restart.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL Database</Label>
                <Input
                  type="password"
                  placeholder="postgresql://user:password@host:5432/database"
                  value={dbUrl}
                  onChange={(e) => { setDbUrl(e.target.value); setDbTestResult(null); }}
                />
                <p className="text-xs text-muted-foreground">
                  Contoh Supabase: <code className="text-xs bg-muted px-1 rounded">postgresql://postgres.xxx:password@aws-0-ap.pooler.supabase.com:5432/postgres</code>
                </p>
              </div>

              {dbTestResult && (
                <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${dbTestResult.ok ? "bg-green-500/10 text-green-500" : "bg-destructive/10 text-destructive"}`}>
                  {dbTestResult.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {dbTestResult.message}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleTestDb} disabled={dbTesting || !dbUrl.trim()} className="gap-2">
                  {dbTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                  Test Koneksi
                </Button>
                <Button onClick={handleSaveDb} disabled={dbSaving || !dbUrl.trim()} className="gap-2">
                  {dbSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Simpan & Hubungkan
                </Button>
              </div>

              <div className="text-xs text-muted-foreground border border-border rounded p-3 space-y-1">
                <p className="font-medium text-foreground mb-2">Cara mendapatkan URL database:</p>
                <p>• <strong>Supabase</strong>: Project Settings → Database → Connection String (Transaction Mode)</p>
                <p>• <strong>Neon</strong>: Dashboard → Connection Details → Connection String</p>
                <p>• <strong>Railway</strong>: Service → Variables → DATABASE_URL</p>
                <p>• <strong>Lokal</strong>: <code>postgresql://postgres:password@localhost:5432/iburuhwa</code></p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" />Update & Migrasi</CardTitle>
              <CardDescription>Jalankan migrasi skema database untuk memperbarui struktur tabel saat ada update aplikasi.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" onClick={handleRunUpdate} className="gap-2">
                <RefreshCw className="h-4 w-4" />Jalankan Migrasi Sekarang
              </Button>
              {scriptOutput.length > 0 && (
                <div ref={scriptRef} className="bg-black/80 text-green-400 font-mono text-xs p-4 rounded-md max-h-48 overflow-y-auto">
                  {scriptOutput.map((line, i) => <div key={i}>{line}</div>)}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── BOT SERVER ── */}
        <TabsContent value="server" className="space-y-4 mt-4">
          {serverLoading ? <div className="text-muted-foreground">Memuat...</div> : (
            <>
              <Card className="bg-card">
                <CardHeader><CardTitle>Identitas Server</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nama Server / Bot</Label>
                    <Input placeholder="iBuruhWa Bot" value={merged.serverName ?? ""} onChange={(e) => set("serverName", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Pemilik Bot (nomor)</Label>
                    <Input placeholder="628xxxxxxxxxx" value={merged.botOwner ?? ""} onChange={(e) => set("botOwner", e.target.value)} />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card">
                <CardHeader><CardTitle>Perilaku Pesan</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label>Pesan Sambutan (Default Reply jika tidak cocok aturan)</Label>
                    <Input placeholder="Halo! Ada yang bisa kami bantu?" value={merged.botGreetingMessage ?? ""} onChange={(e) => set("botGreetingMessage", e.target.value)} />
                    <p className="text-xs text-muted-foreground">Kosongkan untuk tidak membalas jika tidak ada aturan yang cocok.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Maks Sesi Aktif</Label>
                      <Input type="number" min={1} max={50} placeholder="10" value={merged.maxSessions ?? ""} onChange={(e) => set("maxSessions", e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>Retensi Log Pesan (hari)</Label>
                      <Input type="number" min={1} max={365} placeholder="30" value={merged.logRetentionDays ?? ""} onChange={(e) => set("logRetentionDays", e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <div>
                        <p className="text-sm font-medium">Izinkan Pesan Grup</p>
                        <p className="text-xs text-muted-foreground">Proses pesan dari grup WhatsApp.</p>
                      </div>
                      <Switch checked={(merged.allowGroupMessages ?? "0") === "1"} onCheckedChange={(v) => set("allowGroupMessages", v ? "1" : "0")} />
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-border">
                      <div>
                        <p className="text-sm font-medium">Mode Maintenance</p>
                        <p className="text-xs text-muted-foreground">Pause semua balasan otomatis tanpa hapus aturan.</p>
                      </div>
                      <Switch checked={(merged.maintenanceMode ?? "false") === "true"} onCheckedChange={(v) => set("maintenanceMode", String(v))} />
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium">Notifikasi Sesi Diblokir</p>
                        <p className="text-xs text-muted-foreground">Kirim notifikasi ke pemilik bot jika sesi diblokir WhatsApp.</p>
                      </div>
                      <Switch checked={(merged.notifyOnBan ?? "false") === "true"} onCheckedChange={(v) => set("notifyOnBan", String(v))} />
                    </div>
                  </div>

                  {(merged.notifyOnBan === "true") && (
                    <div className="space-y-2">
                      <Label>Webhook Notifikasi Ban</Label>
                      <Input placeholder="https://..." value={merged.notifyWebhookUrl ?? ""} onChange={(e) => set("notifyWebhookUrl", e.target.value)} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
          <Button onClick={handleSaveServer} disabled={updateSettings.isPending} className="gap-2">
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Pengaturan Bot
          </Button>
        </TabsContent>

        {/* ── ANTI-BAN ── */}
        <TabsContent value="antiban" className="space-y-4 mt-4">
          <Card className="bg-card">
            <CardHeader>
              <CardTitle>Modul Anti-Ban</CardTitle>
              <CardDescription>Simulasi perilaku manusia agar akun WhatsApp tidak diblokir.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Aktifkan Anti-Ban</p>
                  <p className="text-xs text-muted-foreground">Tampilkan indikator "mengetik" sebelum membalas.</p>
                </div>
                <Switch checked={(merged.antiBanEnabled ?? "true") !== "false"} onCheckedChange={(v) => set("antiBanEnabled", String(v))} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Delay Minimum (ms)</Label>
                  <Input type="number" min={200} max={10000} placeholder="800" value={merged.typingDelayMin ?? "800"} onChange={(e) => set("typingDelayMin", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Delay Maksimum (ms)</Label>
                  <Input type="number" min={500} max={15000} placeholder="3000" value={merged.typingDelayMax ?? "3000"} onChange={(e) => set("typingDelayMax", e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Delay aktual = min(panjangTeks × 40ms, 2500) + acak(min..max). Bot akan terlihat seperti mengetik sesuai panjang teks.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Delay Broadcast Minimum (ms)</Label>
                  <Input type="number" min={500} max={30000} placeholder="1000" value={merged.broadcastDelayMin ?? "1000"} onChange={(e) => set("broadcastDelayMin", e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Delay Broadcast Maksimum (ms)</Label>
                  <Input type="number" min={1000} max={60000} placeholder="3000" value={merged.broadcastDelayMax ?? "3000"} onChange={(e) => set("broadcastDelayMax", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSaveServer} disabled={updateSettings.isPending} className="gap-2">
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Pengaturan Anti-Ban
          </Button>
        </TabsContent>

        {/* ── WEBHOOK ── */}
        <TabsContent value="webhook" className="space-y-4 mt-4">
          <Card className="bg-card">
            <CardHeader><CardTitle>Konfigurasi Webhook</CardTitle><CardDescription>Webhook dikirim saat ada pesan masuk yang cocok dengan aturan webhook.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Webhook Global Aktif</p>
                  <p className="text-xs text-muted-foreground">Matikan untuk pause semua webhook tanpa hapus aturan.</p>
                </div>
                <Switch checked={(merged.webhookGlobalEnabled ?? "true") === "true"} onCheckedChange={(v) => set("webhookGlobalEnabled", String(v))} />
              </div>

              <div className="space-y-2">
                <Label>URL Webhook Default</Label>
                <Input placeholder="https://n8n.example.com/webhook/xxx" value={merged.defaultWebhookUrl ?? ""} onChange={(e) => set("defaultWebhookUrl", e.target.value)} />
                <p className="text-xs text-muted-foreground">Digunakan jika aturan webhook tidak memiliki URL spesifik.</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Retry Otomatis Jika Gagal</p>
                  <p className="text-xs text-muted-foreground">Coba ulang webhook yang gagal.</p>
                </div>
                <Switch checked={(merged.webhookRetryEnabled ?? "false") === "true"} onCheckedChange={(v) => set("webhookRetryEnabled", String(v))} />
              </div>

              {merged.webhookRetryEnabled === "true" && (
                <div className="space-y-2">
                  <Label>Maks Percobaan Ulang</Label>
                  <Input type="number" min={1} max={10} placeholder="3" value={merged.webhookRetryMax ?? "3"} onChange={(e) => set("webhookRetryMax", e.target.value)} />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="border border-border rounded-lg p-4 space-y-2 bg-card">
            <p className="text-sm font-medium">Payload Webhook</p>
            <pre className="text-xs text-muted-foreground bg-muted p-3 rounded overflow-x-auto">{`{
  "sessionId": "session_xxx",
  "from": "628111222333@s.whatsapp.net",
  "pushName": "Nama Pengirim",
  "text": "Isi pesan",
  "ruleId": 1,
  "serverId": "srv_xxxxxxxx"
}`}</pre>
          </div>

          <Button onClick={handleSaveServer} disabled={updateSettings.isPending} className="gap-2">
            {updateSettings.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Pengaturan Webhook
          </Button>
        </TabsContent>

        {/* ── CLIENT ── */}
        <TabsContent value="client" className="space-y-4 mt-4">
          <Card className="bg-card">
            <CardHeader><CardTitle>Koneksi API Klien</CardTitle><CardDescription>Dikonfigurasi per browser. Berguna untuk mengakses server lain dari dashboard ini.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>URL API Base (kosongkan jika server sama)</Label>
                <Input placeholder="http://server-lain:5000" value={client.apiBaseUrl} onChange={(e) => setClient((p) => ({ ...p, apiBaseUrl: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Interval Refresh Otomatis (ms)</Label>
                <Input type="number" min={1000} max={60000} value={client.refreshInterval} onChange={(e) => setClient((p) => ({ ...p, refreshInterval: Number(e.target.value) }))} />
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-3">
            <Button onClick={handleSaveClient} className="gap-2"><Save className="h-4 w-4" />Simpan</Button>
            <Button variant="outline" onClick={handleResetClient} className="gap-2"><RotateCcw className="h-4 w-4" />Reset</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
