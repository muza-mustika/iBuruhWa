import { useState } from "react";
import {
  useListRules, useCreateRule, useUpdateRule, useDeleteRule,
  useListGroupReplySessions, useDeleteGroupReplySession,
  useListRuleGroups, useCreateRuleGroup, useUpdateRuleGroup, useDeleteRuleGroup,
  getListRulesQueryKey, getListGroupReplySessionsQueryKey, getListRuleGroupsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Pencil, RefreshCw, Layers, FolderOpen } from "lucide-react";
import type { Rule, RuleGroup } from "@workspace/api-client-react";

type RuleFormData = {
  name: string; matchType: string; matchValue: string; actionType: string;
  replyText: string; webhookUrl: string; webhookMethod: string; forwardTo: string;
  isActive: boolean; priority: number; sessionFilter: string;
  groupId: number | null;
};

const DEFAULT_FORM: RuleFormData = {
  name: "", matchType: "contains", matchValue: "", actionType: "reply",
  replyText: "", webhookUrl: "", webhookMethod: "POST", forwardTo: "",
  isActive: true, priority: 0, sessionFilter: "", groupId: null,
};

function RuleForm({
  initial, groups, onSubmit, onCancel, loading,
}: {
  initial?: Partial<RuleFormData>;
  groups: RuleGroup[];
  onSubmit: (d: RuleFormData) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState<RuleFormData>({ ...DEFAULT_FORM, ...initial });
  const set = <K extends keyof RuleFormData>(k: K, v: RuleFormData[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1">
          <Label>Nama Aturan</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nama aturan" />
        </div>

        <div className="space-y-1">
          <Label>Tipe Pencocokan</Label>
          <Select value={form.matchType} onValueChange={(v) => set("matchType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="exact">Persis (Exact)</SelectItem>
              <SelectItem value="contains">Mengandung (Contains)</SelectItem>
              <SelectItem value="keyword">Kata Kunci (Keyword)</SelectItem>
              <SelectItem value="regex">Ekspresi Reguler (Regex)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Nilai Pencocokan</Label>
          <Input value={form.matchValue} onChange={(e) => set("matchValue", e.target.value)} placeholder="Kata kunci / pola" />
        </div>

        <div className="space-y-1">
          <Label>Aksi</Label>
          <Select value={form.actionType} onValueChange={(v) => set("actionType", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reply">Balas Otomatis</SelectItem>
              <SelectItem value="webhook">Webhook</SelectItem>
              <SelectItem value="forward">Teruskan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Prioritas</Label>
          <Input type="number" value={form.priority} onChange={(e) => set("priority", Number(e.target.value))} />
        </div>

        {form.actionType === "reply" && (
          <div className="col-span-2 space-y-1">
            <Label>Teks Balasan</Label>
            <Textarea value={form.replyText} onChange={(e) => set("replyText", e.target.value)} placeholder="Teks balasan bot..." rows={3} />
          </div>
        )}

        {form.actionType === "webhook" && (
          <>
            <div className="col-span-2 space-y-1">
              <Label>URL Webhook</Label>
              <Input value={form.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label>Metode HTTP</Label>
              <Select value={form.webhookMethod} onValueChange={(v) => set("webhookMethod", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {form.actionType === "forward" && (
          <div className="col-span-2 space-y-1">
            <Label>Teruskan ke (nomor/JID)</Label>
            <Input value={form.forwardTo} onChange={(e) => set("forwardTo", e.target.value)} placeholder="628123456789@s.whatsapp.net" />
          </div>
        )}

        <div className="col-span-2 space-y-1">
          <Label>Filter Sesi (opsional)</Label>
          <Input value={form.sessionFilter} onChange={(e) => set("sessionFilter", e.target.value)} placeholder="ID sesi, kosongkan untuk semua" />
        </div>
      </div>

      {/* Kelompok Pesan */}
      <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Layers className="h-4 w-4 text-primary" />
          <Label className="font-medium">Kelompok Pesan</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          Aturan dalam kelompok yang sama akan <strong>mengedit pesan bot sebelumnya</strong> daripada mengirim pesan baru.
          Setiap kelompok terisolasi — aturan di kelompok berbeda tidak bisa saling mengedit pesan.
          Kosongkan untuk balasan biasa.
        </p>
        <Select
          value={form.groupId != null ? String(form.groupId) : "none"}
          onValueChange={(v) => set("groupId", v === "none" ? null : Number(v))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih kelompok (opsional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Tidak ada kelompok (balasan biasa) —</SelectItem>
            {groups.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                <div className="flex items-center gap-2">
                  <Layers className="h-3 w-3" />
                  {g.name}
                  {g.description && <span className="text-muted-foreground text-xs">· {g.description}</span>}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {groups.length === 0 && (
          <p className="text-xs text-amber-400">⚠ Belum ada kelompok. Buat kelompok terlebih dahulu di tab <strong>Kelompok</strong>.</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Switch checked={form.isActive} onCheckedChange={(v) => set("isActive", v)} />
        <Label>Aturan Aktif</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button onClick={() => onSubmit(form)} disabled={loading}>{loading ? "Menyimpan..." : "Simpan"}</Button>
      </div>
    </div>
  );
}

function GroupForm({
  initial, onSubmit, onCancel, loading,
}: {
  initial?: { name: string; description?: string | null };
  onSubmit: (d: { name: string; description: string }) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1">
        <Label>Nama Kelompok</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Harga, Info Produk, Layanan" />
      </div>
      <div className="space-y-1">
        <Label>Deskripsi (opsional)</Label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Keterangan singkat kelompok ini" />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Batal</Button>
        <Button onClick={() => onSubmit({ name, description })} disabled={loading || !name.trim()}>
          {loading ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}

function GroupsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<RuleGroup | null>(null);

  const { data: groupsRaw, isLoading } = useListRuleGroups({ query: { queryKey: getListRuleGroupsQueryKey() } });
  const groups = Array.isArray(groupsRaw) ? groupsRaw : [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListRuleGroupsQueryKey() });

  const create = useCreateRuleGroup({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Kelompok dibuat" }); setCreateOpen(false); } } });
  const update = useUpdateRuleGroup({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Kelompok diperbarui" }); setEditGroup(null); } } });
  const del = useDeleteRuleGroup({ mutation: { onSuccess: () => { invalidate(); toast({ title: "Kelompok dihapus" }); } } });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Kelompok mengatur aturan mana yang berbagi sesi edit. Aturan dalam kelompok yang sama akan mengedit pesan bot sebelumnya.
        </p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Kelompok Baru</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Buat Kelompok Baru</DialogTitle></DialogHeader>
            <GroupForm
              onSubmit={(d) => create.mutate({ data: d })}
              onCancel={() => setCreateOpen(false)}
              loading={create.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Kelompok</TableHead>
              <TableHead>Deskripsi</TableHead>
              <TableHead>Dibuat</TableHead>
              <TableHead className="text-right">Kelola</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-24">Memuat...</TableCell></TableRow>
            ) : groups.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground h-24">Belum ada kelompok. Buat kelompok pertama Anda.</TableCell></TableRow>
            ) : (
              groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Layers className="h-4 w-4 text-primary" />
                      {g.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{g.description ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(g.createdAt).toLocaleDateString("id-ID")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Dialog open={editGroup?.id === g.id} onOpenChange={(o) => !o && setEditGroup(null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => setEditGroup(g)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>Edit Kelompok</DialogTitle></DialogHeader>
                          {editGroup?.id === g.id && (
                            <GroupForm
                              initial={{ name: g.name, description: g.description }}
                              onSubmit={(d) => update.mutate({ id: g.id, data: d })}
                              onCancel={() => setEditGroup(null)}
                              loading={update.isPending}
                            />
                          )}
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => del.mutate({ id: g.id })} disabled={del.isPending}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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

function CumulativeSessionsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: rawSessions, isLoading, refetch } = useListGroupReplySessions(undefined, { query: { queryKey: getListGroupReplySessionsQueryKey() } });
  const sessions = Array.isArray(rawSessions) ? rawSessions : [];

  const { data: groupsRaw } = useListRuleGroups({ query: { queryKey: getListRuleGroupsQueryKey() } });
  const groups = Array.isArray(groupsRaw) ? groupsRaw : [];
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g.name]));

  const deleteSession = useDeleteGroupReplySession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListGroupReplySessionsQueryKey() });
        toast({ title: "Sesi dihapus (siklus edit direset)" });
      },
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Sesi aktif menentukan pesan mana yang akan diedit saat ada pesan berikutnya dari kontak yang sama. Hapus untuk reset siklus.
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh
        </Button>
      </div>

      <div className="border border-border rounded-md bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chat JID</TableHead>
              <TableHead>Kelompok</TableHead>
              <TableHead>Jumlah Edit</TableHead>
              <TableHead>Kadaluarsa</TableHead>
              <TableHead className="text-right">Reset</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-24">Memuat...</TableCell></TableRow>
            ) : sessions.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-24">Belum ada sesi kumulatif aktif.</TableCell></TableRow>
            ) : (
              sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.chatJid}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Layers className="h-3 w-3" />
                      {groupMap[s.ruleGroupId] ?? `#${s.ruleGroupId}`}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{s.replyCount}x</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.expiresAt).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteSession.mutate({ id: s.id })}
                          disabled={deleteSession.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reset siklus edit untuk chat ini</TooltipContent>
                    </Tooltip>
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

export default function Rules() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const { data: rulesRaw, isLoading } = useListRules({ query: { queryKey: getListRulesQueryKey() } });
  const rules = Array.isArray(rulesRaw) ? rulesRaw : [];

  const { data: groupsRaw } = useListRuleGroups({ query: { queryKey: getListRuleGroupsQueryKey() } });
  const groups = Array.isArray(groupsRaw) ? groupsRaw : [];
  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]));

  const invalidateRules = () => queryClient.invalidateQueries({ queryKey: getListRulesQueryKey() });

  const createRule = useCreateRule({ mutation: { onSuccess: () => { invalidateRules(); toast({ title: "Aturan dibuat" }); setCreateOpen(false); } } });
  const updateRule = useUpdateRule({ mutation: { onSuccess: () => { invalidateRules(); toast({ title: "Aturan diperbarui" }); setEditId(null); } } });
  const deleteRule = useDeleteRule({ mutation: { onSuccess: () => { invalidateRules(); toast({ title: "Aturan dihapus" }); } } });

  const matchLabels: Record<string, string> = { exact: "Persis", contains: "Mengandung", keyword: "Kata Kunci", regex: "Regex" };
  const actionLabels: Record<string, string> = { reply: "Balas", webhook: "Webhook", forward: "Teruskan" };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Aturan Balas Otomatis</h1>
          <p className="text-muted-foreground">Tentukan kapan dan bagaimana bot membalas pesan masuk.</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Aturan Baru</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Buat Aturan Baru</DialogTitle></DialogHeader>
            <RuleForm
              groups={groups}
              onSubmit={(d) => createRule.mutate({ data: { ...d, groupId: d.groupId ?? undefined } as any })}
              onCancel={() => setCreateOpen(false)}
              loading={createRule.isPending}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Daftar Aturan</TabsTrigger>
          <TabsTrigger value="groups">
            <FolderOpen className="h-3 w-3 mr-1" />
            Kelompok
          </TabsTrigger>
          <TabsTrigger value="sessions">
            <Layers className="h-3 w-3 mr-1" />
            Sesi Kumulatif
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <div className="border border-border rounded-md bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Aktif</TableHead>
                  <TableHead>Nama / Pencocokan</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Prioritas</TableHead>
                  <TableHead className="text-right">Kelola</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-24">Memuat...</TableCell></TableRow>
                ) : rules.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground h-24">Belum ada aturan. Buat aturan pertama Anda.</TableCell></TableRow>
                ) : (
                  rules.map((rule: Rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={(v) => updateRule.mutate({ ruleId: rule.id, data: { isActive: v } as any })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium flex items-center gap-2 flex-wrap">
                          {rule.name}
                          {rule.groupId != null && groupMap[rule.groupId] && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="text-[10px] gap-1 text-primary border-primary/40">
                                  <Layers className="h-2.5 w-2.5" />
                                  {groupMap[rule.groupId].name}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                Kelompok: {groupMap[rule.groupId].name} — balasan akan mengedit pesan sebelumnya
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">{matchLabels[rule.matchType] ?? rule.matchType}</Badge>
                          <span className="font-mono">{rule.matchValue}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{actionLabels[rule.actionType] ?? rule.actionType}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rule.priority}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Dialog open={editId === rule.id} onOpenChange={(o) => !o && setEditId(null)}>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm" onClick={() => setEditId(rule.id)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                              <DialogHeader><DialogTitle>Edit Aturan</DialogTitle></DialogHeader>
                              {editId === rule.id && (
                                <RuleForm
                                  initial={{
                                    name: rule.name,
                                    matchType: rule.matchType,
                                    matchValue: rule.matchValue,
                                    actionType: rule.actionType,
                                    replyText: rule.replyText ?? "",
                                    webhookUrl: rule.webhookUrl ?? "",
                                    webhookMethod: rule.webhookMethod ?? "POST",
                                    forwardTo: rule.forwardTo ?? "",
                                    isActive: rule.isActive,
                                    priority: rule.priority,
                                    sessionFilter: rule.sessionFilter ?? "",
                                    groupId: rule.groupId ?? null,
                                  }}
                                  groups={groups}
                                  onSubmit={(d) => updateRule.mutate({ ruleId: rule.id, data: { ...d, groupId: d.groupId ?? undefined } as any })}
                                  onCancel={() => setEditId(null)}
                                  loading={updateRule.isPending}
                                />
                              )}
                            </DialogContent>
                          </Dialog>
                          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                            onClick={() => deleteRule.mutate({ ruleId: rule.id })} disabled={deleteRule.isPending}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          <GroupsTab />
        </TabsContent>

        <TabsContent value="sessions" className="mt-4">
          <CumulativeSessionsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
