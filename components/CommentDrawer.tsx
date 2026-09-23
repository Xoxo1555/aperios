"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "./SessionProvider";
import { formatDate } from "lib/utils";
import { useLanguage } from "lib/i18n";
import { useMounted } from "lib/hooks";
import Image from "next/image";
import { BiIcon } from "components/BiIcon";
import type { PhotoDto } from "lib/types";

interface Comment {
  id: number;
  content: string;
  createdAt: string;
  user: {
    id: number;
    name: string;
    avatarUrl: string | null;
  };
}

interface Props {
  photo: PhotoDto;
  isOpen: boolean;
  onClose: () => void;
}

export default function CommentDrawer({ photo, isOpen, onClose }: Props) {
  const { user } = useSession();
  const { t } = useLanguage();
  const mounted = useMounted();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [photo.id]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetching on drawer open is intentional
      fetchComments();
    }
  }, [isOpen, fetchComments]);

  async function submitComment() {
    if (!text.trim() || submitting) return;
    if (!user) {
      onClose();
      window.location.href = `/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`;
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/photos/${photo.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "comment", message: text.trim() }),
      });
      if (res.ok) {
        setText("");
        fetchComments();
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitComment();
    }
  }

  if (!isOpen) return null;

  const commentsTitle = mounted ? t("comments_title") : "Comments";
  const closeLabel = mounted ? t("close") : "Close";
  const noCommentsYet = mounted ? t("no_comments_yet") : "No comments yet";
  const noCommentsYetSub = mounted ? t("no_comments_yet_sub") : "Be the first to share your thoughts!";
  const writeComment = mounted ? t("write_a_comment") : "Write a comment…";
  const loginToComment = mounted ? t("login_to_comment") : "Log in to comment";
  const loginLabel = mounted ? t("login") : "Log in";
  const sending = mounted ? t("sending") : "Sending…";
  const send = mounted ? t("send") : "Send";

  return (
    <>
      <div className="ap-drawer-backdrop" onClick={onClose} />
      <aside
        className={`ap-drawer ${isOpen ? "open" : ""}`}
        aria-hidden={!isOpen}
        role="dialog"
        aria-modal="true"
        aria-label={commentsTitle}
        tabIndex={-1}
      >
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: "var(--ap-border)" }}>
          <h5 className="mb-0 font-serif font-bold text-xl text-foreground text-card-foreground">
            <span className="inline-flex items-center justify-center shrink-0 me-2" style={{ width: 24, height: 24 }}>
              <BiIcon name="bi-chat-left-dots-fill" style={{ fontSize: 20, color: "var(--ap-gold)" }} />
            </span>
            {commentsTitle}
            <span className="text-zinc-700 dark:text-zinc-300 ms-2" style={{ fontSize: "0.875rem" }}>
              ({comments.length})
            </span>
          </h5>
          <button className="icon-btn icon-btn-onlight" aria-label={closeLabel} onClick={onClose}>
            <span className="inline-flex items-center justify-center shrink-0">
              <BiIcon name="bi-x-lg" style={{ fontSize: 20 }} />
            </span>
          </button>
        </div>

        <div className="grow overflow-auto px-4 py-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="spinner-border text-amber-600" role="status" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8">
              <span className="inline-flex items-center justify-center shrink-0" style={{ fontSize: "3rem", color: "var(--ap-muted)" }}>
                <BiIcon name="bi-chat-left" />
              </span>
              <p className="text-zinc-700 dark:text-zinc-300 mt-4 mb-1 text-base">{noCommentsYet}</p>
              <p className="text-zinc-500 text-muted-foreground text-sm">{noCommentsYetSub}</p>
            </div>
          ) : (
            <div className="comments-list space-y-5">
              {comments.map((c) => (
                <div key={c.id} className="comment-item">
                  <div className="flex gap-3">
                    {c.user.avatarUrl ? (
                      <Image
                        src={c.user.avatarUrl}
                        alt={c.user.name}
                        width={40}
                        height={40}
                        className="rounded-full object-cover shrink-0 self-start"
                        style={{ width: 40, height: 40, objectFit: "cover" }}
                        unoptimized={process.env.NODE_ENV === "development"}
                        loading="lazy"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center shrink-0 self-start rounded-full bg-secondary dark:bg-zinc-200 text-foreground text-card-foreground font-semibold" style={{ width: 40, height: 40, fontSize: "0.875rem" }}>
                        {c.user.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap mb-1">
                        <span className="font-medium text-foreground text-card-foreground text-sm">{c.user.name}</span>
                        <span className="text-zinc-600 text-muted-foreground text-xs">
                          {formatDate(c.createdAt)}
                        </span>
                      </div>
                      <p className="mb-0 text-foreground text-card-foreground text-base leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-t" style={{ borderColor: "var(--ap-border)" }}>
          {user ? (
            <div className="flex gap-2">
              <textarea
                className="form-control grow min-h-[56px] resize-y bg-card border-border placeholder:text-muted-foreground text-foreground text-card-foreground"
                placeholder={writeComment}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                style={{ fontSize: "0.9375rem", lineHeight: 1.6 }}
              />
              <button
                className="btn btn-premium flex items-center gap-2 shrink-0"
                onClick={submitComment}
                disabled={!text.trim() || submitting}
                style={{ height: 56, minWidth: 120 }}
              >
                {submitting ? (
                  <>
                    <div className="spinner-border spinner-border-sm" role="status" style={{ width: 16, height: 16 }} />
                    {sending}
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center justify-center shrink-0">
                      <BiIcon name="bi-send-fill" style={{ fontSize: 16 }} />
                    </span>
                    {send}
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="form-control grow bg-card dark:bg-zinc-100 text-zinc-500 text-muted-foreground pointer-events-none" style={{ minHeight: 56, display: "flex", alignItems: "center", padding: "0 1rem" }}>
                {loginToComment}
              </div>
              <button className="btn btn-premium shrink-0" onClick={() => { onClose(); window.location.href = `/login?next=${encodeURIComponent(`/photo/${photo.slug}`)}`; }} style={{ height: 56, minWidth: 100 }}>
                {loginLabel}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}