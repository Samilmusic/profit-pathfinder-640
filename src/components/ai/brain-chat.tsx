import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { askBusinessBrain } from "@/lib/ai/brain.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Msg = { role: "user" | "assistant"; content: string; sources?: { tool: string; row_count: number }[] };

const SUGGESTIONS = [
  "How much AED do we have?",
  "Where is Ali's money right now?",
  "Which deals are waiting for payment?",
  "Which customers owe us money?",
  "How much profit is realized today?",
  "Which account has the highest balance?",
  "What changed in the last 24 hours?",
  "How much AED inventory do we have below rate 470,000?",
];

export function BrainChat({ compact = false }: { compact?: boolean }) {
  const ask = useServerFn(askBusinessBrain);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }); }, [messages, sending]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: q }]);
    setInput("");
    setSending(true);
    try {
      const r = await ask({ data: { question: q, history } }) as any;
      setMessages((m) => [...m, { role: "assistant", content: r.answer, sources: r.sources }]);
    } catch (e: any) {
      const msg = e?.message ?? "AI Brain failed";
      toast.error(msg);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }

  return (
    <div className={compact ? "flex flex-col h-[calc(100dvh-8rem)]" : "flex flex-col h-[calc(100dvh-12rem)]"}>
      <div ref={scroller} className="flex-1 overflow-y-auto space-y-3 pb-3">
        {messages.length === 0 && (
          <div className="space-y-3">
            <Card className="glass"><CardContent className="p-4 text-sm">
              <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-primary" /> <span className="font-medium">AI Business Brain</span></div>
              <p className="text-muted-foreground">Ask anything about your portal data. Every answer is grounded in real database rows — never invented.</p>
            </CardContent></Card>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="text-xs px-3 py-1.5 rounded-full border bg-background hover:bg-muted transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={
              m.role === "user"
                ? "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                : "max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
            }>
              {m.content}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
                  Sources: {m.sources.map((s) => `${s.tool}(${s.row_count})`).join(" · ")}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Thinking…</div>}
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask a question about balances, deals, customers, market, profit…"
          className="min-h-[44px] max-h-32 resize-none"
          disabled={sending}
        />
        <Button onClick={() => send()} disabled={sending || !input.trim()} size="icon" className="h-11 w-11 shrink-0">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}