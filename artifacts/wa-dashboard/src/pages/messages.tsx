import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListMessages, getListMessagesQueryKey, useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useSse } from "@/hooks/use-sse";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Search, X, Download, CheckCircle2, Clock, Zap } from "lucide-react";

export default function Messages() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sessionId, setSessionId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [realtimeCount, setRealtimeCount] = useState(0);

  const { data: sessionsRaw } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];

  const params = {
    ...(activeFilters.sessionId && activeFilters.sessionId !== "all" ? { sessionId: activeFilters.sessionId } : {}),
    ...(activeFilters.search ? { search: activeFilters.search } : {}),
    ...(activeFilters.dateFrom ? { dateFrom: activeFilters.dateFrom } : {}),
    ...(activeFilters.dateTo ? { dateTo: activeFilters.dateTo } : {}),
    ...(activeFilters.status && activeFilters.status !== "all" ? { status: activeFilters.status } : {}),
    limit: 200,
  };

  const { data: messagesRaw, isLoading } = useListMessages(params, {
    query: { queryKey: getListMessagesQueryKey(params), refetchInterval: 10000 },
  });
  const messages = Array.isArray(messagesRaw) ? messagesRaw : [];

  // Real-time SSE: invalidate query saat ada pesan baru
  useSse({
    onMessage: useCallback(() => {
      queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(params) });
      setRealtimeCount(c => c + 1);
    }, [queryClient]),
  });

  const applyFilters = () => {
    setActiveFilters({ search: search || "", sessionId, dateFrom: dateFrom || "", dateTo: dateTo || "", status: statusFilter });
  };

  const clearFilters = () => {
    setSearch(""); setSessionId("all"); setDateFrom(""); setDateTo(""); setStatusFilter("all");
    setActiveFilters({});
  };

  const hasFilters = Object.values(activeFilters).some(Boolean);

  const exportCsv = () => {
    if (!messages.length) return;
    const header = ["ID", "Waktu", "Dari", "Nama", "Pesan", "Sesi Terima", "Dibalas Oleh", "Waktu Balas", "Status", "Aksi"];
    const rows = messages.map((m) => [
      m.id, m.timestamp, m.from.replace("@s.whatsapp.net", ""),
      m.pushName ?? "",
      `"${(m.text ?? "").replace(/"/g, '""')}"`,
      sessions.find((s) => s.id === m.sessionId)?.name ?? m.sessionId,
      m.repliedBySession ? (sessions.find((s) => s.id === m.repliedBySession)?.name ?? m.repliedBySession) : "",
      m.repliedAt ?? "",
      m.isProcessed ? "Diproses" : "Pending",
      m.actionTaken ?? "",
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `pesan_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const actionLabel: Record<string, string> = {
    reply: "Dibalas", reply_failed: "Gagal Balas", webhook: "Webhook",
    webhook_failed: "Webhook Gagal", forward: "Diteruskan",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Pesan Masuk</h1>
          <p className="text-muted-foreground">
            Log semua pesan dari <strong>semua sesi & server</strong> yang tersimpan di database.
            {realtimeCount > 0 && (
              <span className="ml-2 text-xs text-primary inline-flex items-center gap-1">
                <Zap className="h-3 w-3" />{realtimeCount} update real-time
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!messages.length} className="gap-2">
          <Download className="h-4 w-4" />Ekspor CSV
        </Button>
      </div>

      <div className="flex flex-wrap gap-3 p-4 bg-card border border-border rounded-lg">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Cari pesan atau nomor pengirim..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyFilters()} className="pl-9" />
        </div>
        <Select value={sessionId} onValueChange={setSessionId}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Semua sesi" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua sesi</SelectItem>
            {sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Semua status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua status</SelectItem>
            <SelectItem value="processed">Sudah dibalas</SelectItem>
            <SelectItem value="pending">Belum dibalas</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
        <Button onClick={applyFilters} className="gap-2"><Search className="h-4 w-4" />Filter</Button>
        {hasFilters && <Button variant="ghost" onClick={clearFilters} className="gap-2 text-muted-foreground"><X className="h-4 w-4" />Hapus</Button>}
      </div>

      {hasFilters && <p className="text-sm text-muted-foreground">{messages.length} pesan ditemukan</p>}

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Waktu</TableHead>
              <TableHead>Pengirim</TableHead>
              <TableHead>Pesan</TableHead>
              <TableHead className="w-32">Sesi Terima</TableHead>
              <TableHead className="w-40">Dibalas Oleh</TableHead>
              <TableHead className="w-32">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground h-24">Memuat pesan...</TableCell></TableRow>
            ) : messages.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground h-24">{hasFilters ? "Tidak ada pesan sesuai filter." : "Belum ada pesan yang masuk."}</TableCell></TableRow>
            ) : (
              messages.map((msg) => (
                <TableRow key={msg.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                    {format(new Date(msg.timestamp), "dd MMM HH:mm:ss", { locale: idLocale })}
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-sm">{msg.from.replace("@s.whatsapp.net", "").replace("@g.us", " (grup)")}</div>
                    {msg.pushName && <div className="text-xs text-muted-foreground">{msg.pushName}</div>}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate text-sm" title={msg.text}>{msg.text}</p>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground">
                      {sessions.find((s) => s.id === msg.sessionId)?.name ?? msg.sessionId.slice(0, 10) + "…"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {msg.repliedBySession ? (
                      <div>
                        <span className="font-mono text-xs text-primary">
                          {sessions.find((s) => s.id === msg.repliedBySession)?.name ?? msg.repliedBySession.slice(0, 10) + "…"}
                        </span>
                        {msg.repliedAt && (
                          <div className="text-[10px] text-muted-foreground">
                            {format(new Date(msg.repliedAt), "HH:mm:ss")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {msg.isProcessed ? (
                      msg.actionTaken ? (
                        <Badge variant={msg.actionTaken.includes("failed") ? "destructive" : "secondary"} className="text-xs">
                          {actionLabel[msg.actionTaken] ?? msg.actionTaken}
                        </Badge>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-green-500">
                          <CheckCircle2 className="h-3 w-3" />Selesai
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1 text-xs text-yellow-500">
                        <Clock className="h-3 w-3" />Pending
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
