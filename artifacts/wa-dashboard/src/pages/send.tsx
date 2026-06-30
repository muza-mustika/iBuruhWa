import { useSendMessage, useListSessions, getListSessionsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SendIcon } from "lucide-react";

const sendSchema = z.object({
  to: z.string().min(1, "Nomor tujuan diperlukan"),
  text: z.string().min(1, "Isi pesan diperlukan"),
  sessionId: z.string().optional(),
});

export default function Send() {
  const { toast } = useToast();
  const { data: sessions } = useListSessions({ query: { queryKey: getListSessionsQueryKey() } });
  const connectedSessions = sessions?.filter((s) => s.status === "connected") ?? [];

  const form = useForm({ resolver: zodResolver(sendSchema), defaultValues: { to: "", text: "", sessionId: "any" } });

  const sendMessage = useSendMessage({
    mutation: {
      onSuccess: (data) => {
        if (data.success) {
          const sesName = connectedSessions.find((s) => s.id === data.sessionId)?.name ?? data.sessionId;
          toast({ title: "Pesan terkirim", description: `Melalui sesi: ${sesName}` });
          form.reset({ to: form.getValues("to"), text: "", sessionId: form.getValues("sessionId") });
        } else {
          toast({ title: "Gagal kirim pesan", description: data.error ?? "Error tidak diketahui", variant: "destructive" });
        }
      },
      onError: (err: any) => toast({ title: "Gagal kirim", description: err?.message, variant: "destructive" }),
    },
  });

  const onSubmit = (data: z.infer<typeof sendSchema>) => {
    sendMessage.mutate({ data: { to: data.to, text: data.text, sessionId: data.sessionId === "any" ? null : (data.sessionId ?? null) } });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-1">Kirim Pesan</h1>
        <p className="text-muted-foreground">Kirim pesan manual melalui salah satu sesi yang terhubung.</p>
      </div>
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Tulis Pesan</CardTitle>
          <CardDescription>Pilih sesi atau biarkan sistem memilih otomatis berdasarkan beban.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField control={form.control} name="sessionId" render={({ field }) => (
                <FormItem>
                  <FormLabel>Kirim melalui Sesi</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="any">Otomatis (Beban Merata)</SelectItem>
                      {connectedSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.phoneNumber ?? "?"})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {connectedSessions.length === 0 && <p className="text-sm text-destructive mt-1">Tidak ada sesi terhubung.</p>}
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="to" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nomor Tujuan</FormLabel>
                  <FormControl><Input placeholder="628xxxxxxxxxx" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="text" render={({ field }) => (
                <FormItem>
                  <FormLabel>Isi Pesan</FormLabel>
                  <FormControl><Textarea placeholder="Tulis pesan di sini..." className="min-h-[140px] resize-y" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" size="lg" disabled={sendMessage.isPending || !connectedSessions.length}>
                <SendIcon className="w-4 h-4 mr-2" />
                {sendMessage.isPending ? "Mengirim..." : "Kirim Pesan"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
