"use client";

import { ArrowLeft, Headset, Mail, MessageSquare, Phone, Send } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/field";
import { FormMessage, SubmitButton, fieldError } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/misc";
import {
  customerReplyAction,
  markCustomerConversationReadAction,
  startWidgetConversationAction,
  supportPulseAction,
  supportWidgetSessionAction,
  type WidgetSession,
  type WidgetThread,
} from "@/features/support/actions";
import { idleState, type ActionState } from "@/lib/action-state";
import { cn } from "@/utils/cn";

/** Everything the panel needs that does not depend on who is looking: set once, on the server. */
export type SupportWidgetConfig = {
  /** Who answers here — the store's name, or Zendropship on the platform site. */
  answeredBy: string;
  phone: string | null;
  hours: string | null;
  email: string | null;
  /** The customer service page for this site, when there is one to link to. */
  inboxHref: string | null;
  /** A storefront keeps bars fixed at the bottom of the page, which the launcher has to clear. */
  inStore?: boolean;
};

const time = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const STATUS_LABELS: Record<WidgetThread["status"], string> = { NEW: "Waiting for a reply", IN_PROGRESS: "Answered", RESOLVED: "Resolved" };

/** A turn in the conversation: the visitor on the right in ink, whoever answered on the left. */
function Bubble({ mine, body, at, author }: { mine: boolean; body: string; at: string; author: string }) {
  return (
    <li className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[85%] rounded-lg px-3 py-2", mine ? "bg-ink-950 text-white" : "border border-line bg-canvas")}>
        <p className={cn("text-[0.6875rem] font-medium", mine ? "text-white/70" : "text-ink-500")}>
          {author} · {time.format(new Date(at))}
        </p>
        <p className={cn("mt-1 whitespace-pre-line text-[0.875rem] leading-relaxed", mine ? "text-white" : "text-ink-800")}>{body}</p>
      </div>
    </li>
  );
}

/** Writing the first message. Signed-in visitors write as themselves; guests leave a name and an email. */
function ComposeForm({ session, onSent }: { session: WidgetSession; onSent: (conversationId: string) => void }) {
  const [state, action] = useActionState<ActionState<{ conversationId: string }>, FormData>(startWidgetConversationAction, idleState);
  const sent = state.status === "success" ? state.data?.conversationId : undefined;

  // Opening the new thread happens after the send, never during render.
  useEffect(() => {
    if (session.signedIn && sent) onSent(sent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sent]);

  if (state.status === "success" && !session.signedIn) {
    return (
      <div className="space-y-3">
        <FormMessage state={state} />
        <p className="text-[0.8125rem] text-ink-500">Create an account to follow the conversation here instead of by email.</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-3" noValidate>
      <div className="hidden" aria-hidden>
        <label htmlFor="widget-website">Website</label>
        <input id="widget-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      {!session.signedIn && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="widget-name">Your name</Label>
            <Input id="widget-name" name="name" autoComplete="name" required className="h-10" aria-invalid={Boolean(fieldError(state, "name"))} />
          </div>
          <div>
            <Label htmlFor="widget-email">Email</Label>
            <Input id="widget-email" name="email" type="email" autoComplete="email" required className="h-10" aria-invalid={Boolean(fieldError(state, "email"))} />
          </div>
        </div>
      )}
      <div>
        <Label htmlFor="widget-message">How can we help?</Label>
        <Textarea id="widget-message" name="message" rows={4} required maxLength={4000} placeholder="Tell us what you need — an order number helps." />
      </div>
      <FormMessage state={state} />
      <SubmitButton size="sm" fullWidth pendingLabel="Sending…">
        <Send className="size-4" aria-hidden /> Send message
      </SubmitButton>
      {!session.signedIn && <p className="text-[0.75rem] text-ink-500">We reply to the email address you give us.</p>}
    </form>
  );
}

/** Carrying on a conversation the visitor already has. */
function ReplyForm({ threadId, onSent }: { threadId: string; onSent: () => void }) {
  const [state, action] = useActionState<ActionState, FormData>(customerReplyAction, idleState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status !== "success") return;
    formRef.current?.reset();
    onSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2" noValidate>
      <input type="hidden" name="messageId" value={threadId} />
      <Label htmlFor="widget-reply" className="sr-only">
        Your reply
      </Label>
      <Textarea id="widget-reply" name="body" rows={2} required maxLength={4000} placeholder="Write a reply…" className="min-h-0" />
      {state.status === "error" && <FormMessage state={state} />}
      <SubmitButton size="sm" fullWidth pendingLabel="Sending…">
        <Send className="size-4" aria-hidden /> Send reply
      </SubmitButton>
    </form>
  );
}

/** The ways to reach us that do not involve typing: the phone number, and the support mailbox. */
function ContactRows({ config }: { config: SupportWidgetConfig }) {
  if (!config.phone && !config.email) return null;
  return (
    <div className="mt-4 space-y-2 border-t border-line pt-4">
      {config.phone && (
        <a
          href={`tel:${config.phone.replace(/[^\d+]/g, "")}`}
          className="flex items-center gap-3 rounded-sm border border-line-strong px-3 py-2.5 transition-colors hover:border-ink-950"
        >
          <Phone className="size-4 shrink-0 text-ink-950" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[0.875rem] font-medium text-ink-950">Call {config.phone}</span>
            {config.hours && <span className="block truncate text-[0.75rem] text-ink-500">{config.hours}</span>}
          </span>
        </a>
      )}
      {config.email && (
        <a href={`mailto:${config.email}`} className="flex items-center gap-3 rounded-sm border border-line-strong px-3 py-2.5 transition-colors hover:border-ink-950">
          <Mail className="size-4 shrink-0 text-ink-950" aria-hidden />
          <span className="min-w-0 truncate text-[0.875rem] font-medium text-ink-950">{config.email}</span>
        </a>
      )}
    </div>
  );
}

/**
 * Where the launcher sits. A storefront keeps the tab bar at the bottom on phones and slides a buy bar in
 * on a product page, so the launcher rides above whichever is there — and stays out of checkout entirely.
 */
function launcherPosition(pathname: string, inStore: boolean) {
  if (!inStore || pathname === "/cart") return "bottom-4 sm:bottom-5";
  if (pathname.startsWith("/p/")) return "bottom-[calc(5rem+env(safe-area-inset-bottom))]";
  return "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-5";
}

export function SupportWidgetPanel({ config, initialUnread = 0 }: { config: SupportWidgetConfig; initialUnread?: number }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<WidgetSession | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, startLoading] = useTransition();

  const load = useCallback((then?: (session: WidgetSession) => void) => {
    startLoading(async () => {
      const next = await supportWidgetSessionAction();
      setSession(next);
      then?.(next);
    });
  }, []);

  // The panel asks who is looking only when it is opened, so pages stay cacheable.
  useEffect(() => {
    if (open && !session) load();
  }, [open, session, load]);

  // While it is open, a reply from the other side appears on its own rather than on the next open. The
  // starting point is the stamp read with the threads, so nothing written in between is taken as seen.
  const baseline = session?.stamp ?? null;
  useEffect(() => {
    if (!open || baseline === null || !session?.signedIn) return;
    let cancelled = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = (await supportPulseAction()).stamp;
        if (!cancelled && next !== baseline) load();
      } catch {
        // The next heartbeat will do.
      }
    };
    const timer = setInterval(check, 5000);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [open, baseline, session?.signedIn, load]);

  // On a phone the on-screen keyboard covers the bottom of the screen, where this panel sits. iPhone Safari
  // does not shrink the page for it, so the panel follows the visible area instead: lifted above the
  // keyboard and no taller than what is left, keeping the message box and Send in view while typing.
  const [keyboard, setKeyboard] = useState({ covered: 0, visible: 0 });
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;
    const follow = () => setKeyboard({ covered: Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)), visible: Math.round(viewport.height) });
    viewport.addEventListener("resize", follow);
    viewport.addEventListener("scroll", follow);
    return () => {
      viewport.removeEventListener("resize", follow);
      viewport.removeEventListener("scroll", follow);
    };
  }, [open]);
  const aboveKeyboard = keyboard.covered > 40 ? { marginBottom: keyboard.covered, maxHeight: keyboard.visible - 8 } : undefined;
  // Once the panel has moved, bring the field being typed in back into view inside it.
  useEffect(() => {
    if (keyboard.covered <= 40) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest("dialog")) active.scrollIntoView({ block: "center" });
  }, [keyboard.covered]);

  const thread = threadId ? session?.threads.find((row) => row.id === threadId) : undefined;
  const unread = session ? session.threads.filter((row) => row.unread).length : initialUnread;

  // The newest turn stays in view — the panel is short on a phone, and a reply lands at the bottom.
  const latestRef = useRef<HTMLLIElement>(null);
  const turnCount = thread?.turns.length ?? 0;
  useEffect(() => {
    if (turnCount > 0) latestRef.current?.scrollIntoView({ block: "nearest" });
  }, [turnCount, threadId]);

  const openThread = (id: string) => {
    setThreadId(id);
    setComposing(false);
    void markCustomerConversationReadAction(id);
  };

  const close = () => {
    setOpen(false);
    // Next time it opens, show the list again — and pick up anything that arrived meanwhile.
    setThreadId(null);
    setComposing(false);
    setSession(null);
    setKeyboard({ covered: 0, visible: 0 });
  };

  // Checkout is a single-minded flow: nothing floats over the pay button.
  if (config.inStore && pathname.startsWith("/checkout")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "fixed right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink-950 py-2.5 pl-3.5 pr-4 text-white shadow-pop",
          "transition-[transform,background-color] duration-200 ease-out hover:bg-ink-800 active:translate-y-px",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-950 sm:right-5",
          launcherPosition(pathname, Boolean(config.inStore)),
          open && "hidden",
        )}
      >
        <Headset className="size-[1.125rem] shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="text-[0.8125rem] font-medium tracking-[-0.005em]">Customer Service</span>
        {unread > 0 && (
          <span className="tabular absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-iris-600 text-[0.625rem] font-semibold text-white" aria-label={`${unread} new replies`}>
            {unread}
          </span>
        )}
      </button>

      <Dialog
        open={open}
        onClose={close}
        variant="corner"
        title={thread ? thread.subject : "Customer service"}
        description={thread ? STATUS_LABELS[thread.status] : `${config.answeredBy} · we usually reply within one business day`}
        className="sm:shadow-pop"
        style={aboveKeyboard}
      >
        {loading && !session ? (
          <div className="space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
          </div>
        ) : !session ? null : thread ? (
          <div className="flex min-h-0 flex-col">
            <button
              type="button"
              onClick={() => setThreadId(null)}
              className="mb-3 inline-flex items-center gap-1.5 self-start text-[0.8125rem] text-ink-600 hover:text-ink-950"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> All messages
            </button>
            <ol className="space-y-2.5">
              {thread.turns.map((turn) => (
                <Bubble key={turn.id} mine={turn.mine} body={turn.body} at={turn.at} author={turn.mine ? "You" : config.answeredBy} />
              ))}
              <li ref={latestRef} aria-hidden className="h-0" />
            </ol>
            <div className="mt-4 border-t border-line pt-3">
              <ReplyForm threadId={thread.id} onSent={() => load()} />
            </div>
          </div>
        ) : composing || (session.signedIn && session.threads.length === 0) ? (
          <>
            {session.threads.length > 0 && (
              <button
                type="button"
                onClick={() => setComposing(false)}
                className="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] text-ink-600 hover:text-ink-950"
              >
                <ArrowLeft className="size-3.5" aria-hidden /> All messages
              </button>
            )}
            <ComposeForm session={session} onSent={(id) => load(() => openThread(id))} />
            <ContactRows config={config} />
          </>
        ) : (
          <>
            {session.signedIn ? (
              <>
                <ul className="divide-y divide-line border-y border-line">
                  {session.threads.map((row) => (
                    <li key={row.id}>
                      <button type="button" onClick={() => openThread(row.id)} className="block w-full px-1 py-3 text-left hover:bg-canvas/60">
                        <span className="flex items-center gap-2">
                          {row.unread && <span className="size-1.5 shrink-0 rounded-full bg-iris-600" aria-label="New reply" />}
                          <span className={cn("min-w-0 flex-1 truncate text-[0.875rem]", row.unread ? "font-semibold text-ink-950" : "font-medium text-ink-800")}>{row.subject}</span>
                        </span>
                        <span className="mt-0.5 block text-[0.75rem] text-ink-500">
                          {STATUS_LABELS[row.status]} · {time.format(new Date(row.at))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-sm bg-ink-950 px-4 py-2.5 text-[0.875rem] font-medium text-white transition-colors hover:bg-ink-800"
                >
                  <MessageSquare className="size-4" aria-hidden /> New message
                </button>
              </>
            ) : (
              <ComposeForm session={session} onSent={() => load()} />
            )}
            <ContactRows config={config} />
            {config.inboxHref && session.signedIn && (
              <p className="mt-4 text-center">
                <Link href={config.inboxHref} onClick={close} className="text-[0.8125rem] text-ink-600 underline decoration-ink-300 underline-offset-4 hover:text-ink-950">
                  Open customer service
                </Link>
              </p>
            )}
          </>
        )}
      </Dialog>
    </>
  );
}
