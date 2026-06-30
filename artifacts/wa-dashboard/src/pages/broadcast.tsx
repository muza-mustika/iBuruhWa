import { useState } from "react";
import { useBroadcastMessage, useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, CheckCircle2, XCircle, Loader2, X } from "lucide-react";

export default function Broadcast() {
  const { toast } = useToast();
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [sessionId, setSessionId] = useState("any");
  const [delayMs, setDelayMs] = useState(1000);
  const [results, setResults] = useState<{ to: string; success: boolean; error?: string }[] | null>(null);

  const { data: sessionsRaw } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw.filter((s) => s.status === "connected") : [];

  const broadcast = useBroadcastMessage({
    mutation: {
      onSuccess: (data) => {
        setResults(data.results ?? []);
        toast({ title: `Broadcast selesai`, description: `${data.sent} berhasil, ${data.failed} gagal dari ${data.total}`, variant: data.failed > 0 ? "destructive" : "default" });
      },
      onError: (err: any) => toast({ title: "Broadcast gagal", description: err?.message, variant: "destructive" }),
    },
  });

  const addRecipients = () => {
    const nums = recipientInput.split(/[\n,;\s]+/).map((n) => n.trim().replace(/[^0-9]/g, "")).filter((n) => n.length >= 7);
    setRecipients((prev) => [...new Set([...prev, ...nums])]);
    setRecipientInput("");
  };

  const removeRecipient = (n: string) => setRecipients((prev) => prev.filter((r) => r !== n));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Broadcast</h1>
        <p className="text-muted-foreground">Kirim satu pesan ke banyak nomor sekaligus.</p>
      </div>

      <div className="grid gap-6">
        <Card className="bg-card">
          <CardHeader><CardTitle>Daftar Penerima</CardTitle><CardDescription>Pisahkan nomor dengan enter, koma, atau spasi. {recipients.length}/100</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Textarea placeholder="628111000, 628222000, ..." value={recipientInput} onChange={(e) => setRecipientInput(e.target.value)} className="min-h-[80px] resize-none flex-1" />
              <Button onClick={addRecipients} disabled={!recipientInput.trim()} className="self-end">Tambah</Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-secondary/40 rounded-md">
                {recipients.map((r) => (
                  <Badge key={r} variant="secondary" className="gap-1 cursor-pointer" onClick={() => removeRecipient(r)}>
                    {r}<X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader><CardTitle>Pesan</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Textarea placeholder="Tulis pesan broadcast di sini..." value={text} onChange={(e) => setText(e.target.value)} className="min-h-[120px] resize-y" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sesi Pengirim</Label>
                <Select value={sessionId} onValueChange={setSessionId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Otomatis (Beban Merata)</SelectItem>
                    {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Jeda antar pesan (ms)</Label>
                <Input type="number" min={500} max={10000} value={delayMs} onChange={(e) => setDelayMs(Number(e.target.value))} />
                <p className="text-xs text-muted-foreground">Min 500ms untuk menghindari blokir</p>
              </div>
            </div>
            <Button
              className="w-full gap-2"
              disabled={!recipients.length || !text.trim() || broadcast.isPending || !sessions.length}
              onClick={() => broadcast.mutate({ data: { recipients, text, sessionId: sessionId === "any" ? undefined : sessionId, delayMs } as any })}
            >
              {broadcast.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {broadcast.isPending ? `Mengirim ke ${recipients.length} nomor...` : `Kirim ke ${recipients.length} Penerima`}
            </Button>
          </CardContent>
        </Card>

        {results && (
          <Card className="bg-card">
            <CardHeader><CardTitle>Hasil Broadcast</CardTitle><CardDescription>{results.filter((r) => r.success).length} berhasil · {results.filter((r) => !r.success).length} gagal</CardDescription></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.map((r) => (
                  <div key={r.to} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                    <span className="font-mono">{r.to}</span>
                    {r.success ? (
                      <div className="flex items-center gap-1 text-green-500"><CheckCircle2 className="h-4 w-4" />Terkirim</div>
                    ) : (
                      <div className="flex items-center gap-1 text-destructive"><XCircle className="h-4 w-4" />{r.error ?? "Gagal"}</div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
