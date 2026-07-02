"use client";

import { useEffect, useRef, useState } from "react";
import { 
  Bot, 
  Send, 
  Sparkles, 
  X, 
  MessageSquare, 
  Loader2, 
  Maximize2, 
  RotateCw, 
  ChevronRight, 
  BarChart3, 
  PieChart,
  Lock 
} from "lucide-react";
import { askCopilot } from "@/lib/api/copilot";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: Date;
};

const suggestions = [
  {
    text: "Explain the ROAS drop in Google Ads",
    icon: BarChart3,
    colorClass: "bg-indigo-50 text-indigo-600 border-indigo-100",
  },
  {
    text: "Which segments showed the most growth?",
    icon: PieChart,
    colorClass: "bg-blue-50 text-blue-600 border-blue-100",
  },
];

export function CopilotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "assistant",
      text: "Hello! I am your Copilot assistant. Ask me anything about WooCommerce, Google Ads, GA4 or your active segments.",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 150);
    }
  }, [isOpen]);

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const userMsg: Message = {
      id: `msg-${Date.now()}-user`,
      sender: "user",
      text: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");
    setIsLoading(true);

    try {
      const response = await askCopilot(trimmed);
      
      const assistantMsg: Message = {
        id: `msg-${Date.now()}-assistant`,
        text: response.answer || "Sorry, I couldn't process that request.",
        sender: "assistant",
        timestamp: new Date(),
      };
      
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: `msg-${Date.now()}-error`,
        sender: "assistant",
        text: "I encountered an error connecting to the AI service. Please make sure your OpenRouter credentials are configured.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage(inputValue);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end">
      {/* Chat Bubble Popup */}
      {isOpen && (
        <div className="mb-4 flex h-[500px] w-[800px] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 bg-white px-5 py-4">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 leading-none tracking-tight">Copilot</h3>
                <span className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Synced context
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 transition duration-150 active:scale-95"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-700 transition duration-150 active:scale-95 outline-none"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div 
            ref={scrollRef}
            className="flex-1 overflow-y-auto bg-neutral-50/40 p-5 space-y-4 scroll-smooth"
          >
            {messages.map((msg) => {
              const isUser = msg.sender === "user";
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full items-start gap-2.5",
                    isUser ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-3 text-[13px] shadow-[0_1px_2px_rgba(0,0,0,0.02)] leading-relaxed",
                      isUser
                        ? "rounded-tr-none bg-brand-500 text-white font-medium shadow-brand-500/10"
                        : "rounded-tl-none border border-neutral-200/60 bg-white text-neutral-800"
                    )}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    <span
                      className={cn(
                        "mt-1.5 block text-[9px] text-right font-medium tracking-tight",
                        isUser ? "text-brand-100" : "text-neutral-400"
                      )}
                    >
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* AI Typing Indicator */}
            {isLoading && (
              <div className="flex w-full items-start gap-2.5 justify-start">
                <div className="rounded-2xl rounded-tl-none border border-neutral-200/60 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Suggestions - Beautiful Vertical Cards with Icons */}
          {messages.length <= 1 && (
            <div className="border-t border-neutral-100/80 bg-white px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
                  <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                  <span>Suggested questions</span>
                </div>
                <button className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600 transition">
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-none">
                {suggestions.map((sug) => {
                  const Icon = sug.icon;
                  return (
                    <button
                      key={sug.text}
                      onClick={() => void handleSendMessage(sug.text)}
                      className="w-full flex items-center justify-between rounded-xl border border-neutral-200/70 bg-white p-3 text-left text-xs font-semibold text-neutral-800 shadow-sm transition hover:border-brand-500 hover:bg-brand-50/10 active:scale-[0.99]"
                    >
                      <span className="flex items-center gap-3">
                        <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg border", sug.colorClass)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span>{sug.text}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-neutral-400" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer Input Area */}
          <div className="border-t border-neutral-100 bg-white p-4">
            <div className="flex items-center gap-2 rounded-xl border border-brand-500 bg-white px-3.5 py-2.5 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all duration-200 shadow-sm">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Copilot..."
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none border-0 bg-transparent py-0 text-sm text-neutral-800 placeholder-neutral-400 outline-none focus:ring-0 max-h-16 disabled:opacity-60 font-medium leading-normal scrollbar-none"
              />
              <button
                onClick={() => void handleSendMessage(inputValue)}
                disabled={isLoading || !inputValue.trim()}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-40 shadow-sm",
                  inputValue.trim()
                    ? "bg-brand-500 hover:bg-brand-600 shadow-brand-500/20"
                    : "bg-neutral-300"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <div className="mt-2.5 flex items-center justify-between px-1 text-[10px] text-neutral-400 font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                Synced workspace context
              </span>
              <span className="flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Private & secure
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex h-13 w-13 items-center justify-center rounded-full text-white shadow-xl transition-all duration-300 ease-out hover:scale-105 active:scale-95 hover:-translate-y-0.5",
          isOpen
            ? "bg-neutral-800 hover:bg-neutral-900 shadow-neutral-900/10"
            : "bg-gradient-to-tr from-brand-500 to-brand-600 shadow-brand-500/20 hover:shadow-brand-500/40"
        )}
      >
        {isOpen ? (
          <X className="h-5.5 w-5.5 animate-in spin-in-90 duration-200" />
        ) : (
          <MessageSquare className="h-5.5 w-5.5 animate-in fade-in zoom-in-75 duration-200" />
        )}
      </button>
    </div>
  );
}
