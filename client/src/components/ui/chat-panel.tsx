import { useState, useRef, useEffect, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Bot, User, Loader2, Wrench, Minimize2, Maximize2 } from "lucide-react";
import { cn } from "../../lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[];
  timestamp: Date;
}

const TOOL_LABELS: Record<string, string> = {
  get_portfolio_summary: "Analyse du portefeuille",
  get_actifs_details: "Consultation des actifs",
  get_emprunts_details: "Consultation des emprunts",
  get_baux_gl: "Consultation des baux",
  get_indices: "Consultation des indices",
  get_sci_detail: "Détail d'une SCI",
  get_paiements_gl: "Consultation des paiements",
  search_entities: "Recherche en cours",
  update_actif: "Modification d'un actif",
  update_lot: "Modification d'un lot",
  update_emprunt: "Modification d'un emprunt",
  update_sci: "Modification d'une SCI",
  update_bail_am: "Modification d'un bail AM",
  update_bail_gl: "Modification d'un bail GL",
  create_actif: "Création d'un actif",
  create_lot: "Création d'un lot",
  create_emprunt: "Création d'un emprunt",
  create_bail_am: "Création d'un bail AM",
  delete_entity: "Suppression d'une entité",
  get_alertes: "Consultation des alertes",
  get_travaux: "Consultation des travaux",
};

const SUGGESTIONS = [
  "Quel est l'état de mon portefeuille ?",
  "Montre-moi les alertes urgentes",
  "Calcule le DSCR global de mon portefeuille",
  "Crée un nouvel actif à Paris 75008",
  "Quels baux expirent dans les 6 prochains mois ?",
];

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setActiveTools([]);

    const allMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: allMessages }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Erreur de connexion" }));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming non supporté");

      const decoder = new TextDecoder();
      let assistantText = "";
      const toolsUsed: string[] = [];
      const assistantId = crypto.randomUUID();

      // Add empty assistant message
      setMessages((prev) => [...prev, {
        id: assistantId,
        role: "assistant",
        content: "",
        toolsUsed: [],
        timestamp: new Date(),
      }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "text") {
              assistantText += event.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantText } : m
                )
              );
            } else if (event.type === "tool_use") {
              toolsUsed.push(event.tool);
              setActiveTools((prev) => [...prev, event.tool]);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, toolsUsed: [...toolsUsed] } : m
                )
              );
            } else if (event.type === "error") {
              assistantText = `Erreur : ${event.error}`;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: assistantText } : m
                )
              );
            }
          } catch {
            // ignore malformed JSON
          }
        }
      }
    } catch (error: any) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `Erreur : ${error.message}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setActiveTools([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating button */}
      <AnimatePresence>
        {!open && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="fixed bottom-6 right-6 z-50 group"
          >
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setOpen(true)}
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-lg shadow-orange-500/30 hover:shadow-xl hover:shadow-orange-500/40 transition-shadow"
              aria-label="Ouvrir l'assistant IA"
            >
              <MessageSquare className="h-6 w-6" />
            </motion.button>
            <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Assistant IA
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "fixed z-50 flex flex-col rounded-2xl border border-border/60 bg-background shadow-2xl shadow-black/20",
              expanded
                ? "bottom-4 right-4 left-4 top-4 md:left-auto md:top-4 md:w-[700px]"
                : "bottom-6 right-6 w-[420px] h-[600px]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600">
                  <Bot className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Assistant Canaillou</p>
                  <p className="text-[10px] text-muted-foreground">Conseiller immobilier IA</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label={expanded ? "Réduire" : "Agrandir"}
                >
                  {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Fermer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/10 to-rose-600/10 mb-4">
                    <Bot className="h-8 w-8 text-orange-500" />
                  </div>
                  <p className="text-sm font-semibold mb-1">Assistant Canaillou</p>
                  <p className="text-xs text-muted-foreground mb-6 max-w-[280px]">
                    Posez-moi n'importe quelle question sur votre portefeuille immobilier.
                  </p>
                  <div className="grid gap-2 w-full max-w-[320px]">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="rounded-xl border border-border/60 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    msg.role === "user"
                      ? "bg-primary/10"
                      : "bg-gradient-to-br from-orange-500 to-rose-600"
                  )}>
                    {msg.role === "user"
                      ? <User className="h-3.5 w-3.5 text-primary" />
                      : <Bot className="h-3.5 w-3.5 text-white" />
                    }
                  </div>

                  <div className={cn(
                    "max-w-[85%] space-y-1.5",
                    msg.role === "user" ? "text-right" : ""
                  )}>
                    {/* Tool usage indicators */}
                    {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {msg.toolsUsed.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-800/30 px-2.5 py-1 text-[10px] font-medium text-orange-700 dark:text-orange-300">
                            <Wrench className="h-2.5 w-2.5" />
                            {TOOL_LABELS[t] || t}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className={cn(
                      "rounded-2xl text-sm leading-relaxed",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground ml-auto px-4 py-2.5"
                        : "px-1 py-1"
                    )}>
                      {msg.role === "assistant" ? (
                        <div className="chat-markdown">
                          <ChatMarkdown content={msg.content} />
                        </div>
                      ) : (
                        msg.content
                      )}
                      {msg.role === "assistant" && !msg.content && loading && (
                        <div className="flex items-center gap-2 px-3 py-2">
                          <div className="flex gap-1">
                            <span className="h-2 w-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <span className="h-2 w-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <span className="h-2 w-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          </div>
                          <span className="text-xs text-muted-foreground">Analyse en cours...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Active tool indicators */}
              {loading && activeTools.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200/40 dark:border-orange-800/20 px-3 py-2"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                  <span className="text-xs font-medium text-orange-700 dark:text-orange-300">{TOOL_LABELS[activeTools[activeTools.length - 1]] || activeTools[activeTools.length - 1]}...</span>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Posez votre question..."
                  rows={1}
                  className="flex-1 resize-none rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-colors"
                  style={{ minHeight: "40px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const t = e.target as HTMLTextAreaElement;
                    t.style.height = "auto";
                    t.style.height = Math.min(t.scrollHeight, 120) + "px";
                  }}
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  aria-label="Envoyer"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/50">
                Assistant IA — les réponses sont basées sur vos données réelles
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/** Full markdown rendering for chat responses */
const ChatMarkdown = memo(function ChatMarkdown({ content }: { content: string }) {
  if (!content) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => <h3 className="text-base font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h3>,
        h2: ({ children }) => <h4 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h4>,
        h3: ({ children }) => <h5 className="text-sm font-semibold text-foreground mt-2.5 mb-1 first:mt-0">{children}</h5>,
        // Paragraphs
        p: ({ children }) => <p className="mb-2 last:mb-0 text-[13px] leading-relaxed text-foreground/90">{children}</p>,
        // Bold & italic
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
        // Lists
        ul: ({ children }) => <ul className="mb-2 last:mb-0 space-y-0.5 pl-4 text-[13px]">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 last:mb-0 space-y-0.5 pl-4 text-[13px] list-decimal">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed text-foreground/90 list-disc marker:text-orange-400">{children}</li>,
        // Tables
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto rounded-lg border border-border/60 shadow-sm">
            <table className="w-full text-[12px]">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
        th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground/80 text-[11px] uppercase tracking-wider">{children}</th>,
        td: ({ children }) => <td className="px-3 py-1.5 border-t border-border/40 text-foreground/80">{children}</td>,
        tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
        // Code
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <div className="my-2 rounded-lg bg-muted/80 border border-border/40 overflow-x-auto">
                <code className="block px-3 py-2.5 text-[12px] leading-relaxed font-mono text-foreground/90">{children}</code>
              </div>
            );
          }
          return <code className="rounded-md bg-muted/80 px-1.5 py-0.5 text-[12px] font-mono text-orange-600 dark:text-orange-400">{children}</code>;
        },
        pre: ({ children }) => <>{children}</>,
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-orange-400 pl-3 text-[13px] text-foreground/70 italic">{children}</blockquote>
        ),
        // Horizontal rule
        hr: () => <hr className="my-3 border-border/40" />,
        // Links
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 dark:text-orange-400 underline decoration-orange-400/40 hover:decoration-orange-400 transition-colors">{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
