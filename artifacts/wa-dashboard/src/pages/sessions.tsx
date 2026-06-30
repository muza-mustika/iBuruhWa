import { useState } from "react";
import { useListSessions, getListSessionsQueryKey, useCreateSession, useDeleteSession, useGetSessionQr, useReconnectSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, RefreshCw, QrCode, Wifi, WifiOff, Loader2 } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    connected: { label: "Terhubung", variant: "default" },
    connecting: { label: "Menghubungkan...", variant: "secondary" },
    disconnected: { label: "Terputus", variant: "outline" },
    banned: { label: "Diblokir", variant: "destructive" },
  };
  const info = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

function QrDialog({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useGetSessionQr(sessionId, { query: { queryKey: [`/api/sessions/${sessionId}/qr`], enabled: open, refetchInterval: open ? 3000 : false } });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <QrCode className="h-3 w-3" />
          QR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Scan QR Code</DialogTitle></DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          {isLoading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : data?.qr ? (
            <img src={`data:image/png;base64,${data.qr}`} alt="QR Code" className="w-64 h-64 rounded-lg border border-border" />
          ) : (
            <div className="w-64 h-64 rounded-lg border border-border flex items-center justify-center text-muted-foreground text-sm">
              {data?.status === "connected" ? "Sudah terhubung" : "Menunggu QR..."}
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center">Buka WhatsApp → Perangkat Tertaut → Tautkan Perangkat</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Sessions() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: sessionsRaw, isLoading } = useListSessions({ query: { queryKey: getListSessionsQueryKey(), refetchInterval: 4000 } });
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];

  const createSession = useCreateSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        toast({ title: "Sesi berhasil dibuat" });
        setNewName(""); setCreateOpen(false);
      },
    },
  });

  const deleteSession = useDeleteSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        toast({ title: "Sesi dihapus" });
      },
    },
  });

  const reconnect = useReconnectSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
        toast({ title: "Menghubungkan ulang..." });
      },
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Sesi WhatsApp</h1>
          <p className="text-muted-foreground">Kelola sesi bot yang aktif. Setiap sesi menggunakan nomor berbeda.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Tambah Sesi</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Tambah Sesi Baru</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Nama sesi (mis. CS Utama, Sesi 2...)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newName.trim() && createSession.mutate({ data: { name: newName.trim() } })}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
                <Button onClick={() => newName.trim() && createSession.mutate({ data: { name: newName.trim() } })} disabled={!newName.trim() || createSession.isPending}>
                  {createSession.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Buat Sesi
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : sessions.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <WifiOff className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Belum ada sesi. Tambah sesi untuk mulai.</p>
            <Button onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-2" />Tambah Sesi Pertama</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sessions.map((s) => (
            <Card key={s.id} className="bg-card border-border">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-foreground">{s.name}</p>
                    <p className="text-sm text-muted-foreground">{s.phoneNumber ?? "Belum login"}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex gap-2 text-xs text-muted-foreground mb-4">
                  <span>{s.messagesReceived} diterima</span>
                  <span>·</span>
                  <span>{s.messagesSent} terkirim</span>
                </div>
                <div className="flex gap-2">
                  <QrDialog sessionId={s.id} />
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => reconnect.mutate({ sessionId: s.id })}>
                    <RefreshCw className="h-3 w-3" />
                    Reconnect
                  </Button>
                  <Button variant="destructive" size="sm" className="gap-1 ml-auto" onClick={() => deleteSession.mutate({ sessionId: s.id })} disabled={deleteSession.isPending}>
                    <Trash2 className="h-3 w-3" />
                    Hapus
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
