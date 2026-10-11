"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import styles from "./page.module.css";

type Tab = "create" | "retrieve";
type Mode = "text" | "image";

interface Retrieved {
  code: string;
  type: Mode;
  content: string;
  expiresAt: number;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function Countdown({
  expiresAt,
  className,
  onExpire,
}: {
  expiresAt: number;
  className?: string;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (!firedRef.current && t >= expiresAt) {
        firedRef.current = true;
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const remaining = Math.max(0, expiresAt - now);
  return <span className={className}>{formatRemaining(remaining)}</span>;
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("create");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>PicShare</h1>
        <p className={styles.subtitle}>
          Share text or an image with a short code. Everything self-destructs
          after 1 hour.
        </p>
      </header>

      <nav className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "create" ? styles.tabActive : ""}`}
          onClick={() => setTab("create")}
          type="button"
        >
          Create
        </button>
        <button
          className={`${styles.tab} ${
            tab === "retrieve" ? styles.tabActive : ""
          }`}
          onClick={() => setTab("retrieve")}
          type="button"
        >
          Retrieve
        </button>
      </nav>

      <main className={styles.card}>
        {tab === "create" ? <CreatePanel /> : <RetrievePanel />}
      </main>

      <footer className={styles.footer}>
        Opens in any browser on the same server. No account needed.
      </footer>
    </div>
  );
}

function CreatePanel() {
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{
    code: string;
    expiresAt: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const picked = e.target.files?.[0];
    if (!picked) return;
    if (!picked.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (picked.size > MAX_IMAGE_BYTES) {
      setError("Image is too large (max 5MB).");
      return;
    }
    setFile(picked);
    setFileName(picked.name);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "text" && !text.trim()) {
      setError("Enter some text first.");
      return;
    }
    if (mode === "image" && !file) {
      setError("Choose an image first.");
      return;
    }

    setBusy(true);
    try {
      if (mode === "text") {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "text", content: text.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Something went wrong.");
          return;
        }
        setCreated({ code: data.code, expiresAt: data.expiresAt });
        return;
      }

      const upRes = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentType: file!.type }),
      });
      const upData = await upRes.json();
      if (!upRes.ok) {
        setError(upData.error ?? "Could not start upload.");
        return;
      }

      const supabase = getSupabaseBrowserClient();
      const { error: uploadError } = await supabase.storage
        .from(upData.bucket)
        .uploadToSignedUrl(upData.path, upData.token, file!, {
          contentType: file!.type,
        });
      if (uploadError) {
        setError(uploadError.message || "Image upload failed.");
        return;
      }

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "image", path: upData.path }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setCreated({ code: data.code, expiresAt: data.expiresAt });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy. Select the code manually.");
    }
  };

  const reset = () => {
    setCreated(null);
    setText("");
    setFile(null);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setFileName("");
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (created) {
    return <CreatedView code={created.code} expiresAt={created.expiresAt} copied={copied} onCopy={copy} onReset={reset} />;
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.segmented}>
        <button
          type="button"
          className={`${styles.segment} ${
            mode === "text" ? styles.segmentActive : ""
          }`}
          onClick={() => setMode("text")}
        >
          Text
        </button>
        <button
          type="button"
          className={`${styles.segment} ${
            mode === "image" ? styles.segmentActive : ""
          }`}
          onClick={() => setMode("image")}
        >
          Image
        </button>
      </div>

      {mode === "text" ? (
        <textarea
          className={styles.textarea}
          placeholder="Type or paste anything you want to share..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={20000}
        />
      ) : (
        <div className={styles.uploader}>
          <input
            ref={fileInputRef}
            id="image-input"
            className={styles.fileInput}
            type="file"
            accept="image/*"
            onChange={onPickFile}
          />
          <label htmlFor="image-input" className={styles.dropzone}>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className={styles.preview} src={previewUrl} alt="Selected preview" />
            ) : (
              <span className={styles.dropText}>
                Click to choose an image
                <small>PNG, JPG, GIF or WebP up to 5MB</small>
              </span>
            )}
          </label>
          {fileName && <span className={styles.fileName}>{fileName}</span>}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <button className={styles.primary} type="submit" disabled={busy}>
        {busy ? "Creating..." : "Create share code"}
      </button>
    </form>
  );
}

function CreatedView({
  code,
  expiresAt,
  copied,
  onCopy,
  onReset,
}: {
  code: string;
  expiresAt: number;
  copied: boolean;
  onCopy: () => void;
  onReset: () => void;
}) {
  return (
    <div className={styles.result}>
      <p className={styles.resultLabel}>Your code is ready</p>
      <div className={styles.codeBox}>
        <span className={styles.code}>{code}</span>
        <button className={styles.copy} type="button" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className={styles.note}>
        Share this code with anyone. It expires in{" "}
        <strong>
          <Countdown key={expiresAt} expiresAt={expiresAt} />
        </strong>
        .
      </p>
      <button className={styles.secondary} type="button" onClick={onReset}>
        Create another
      </button>
    </div>
  );
}

function RetrievePanel() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Retrieved | null>(null);
  const [expired, setExpired] = useState(false);

  const handleExpire = useCallback(() => {
    setResult(null);
    setExpired(true);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Enter a code.");
      return;
    }
    setBusy(true);
    setError("");
    setExpired(false);
    setResult(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(clean)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.status === 410) {
        setExpired(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Not found.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const clearTimer = useCallback(() => {
    setResult(null);
    setCode("");
    setError("");
    setExpired(false);
  }, []);

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor="code-input">
        Enter a code
      </label>
      <input
        id="code-input"
        className={styles.codeInput}
        placeholder="ABC123"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        maxLength={12}
        autoComplete="off"
        spellCheck={false}
      />
      <button className={styles.primary} type="submit" disabled={busy}>
        {busy ? "Searching..." : "Retrieve"}
      </button>

      {error && <p className={styles.error}>{error}</p>}
      {expired && (
        <p className={styles.error}>That code has expired or no longer exists.</p>
      )}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultHeader}>
            <p className={styles.resultLabel}>Shared {result.type}</p>
            <span className={styles.timer}>
              expires in{" "}
              <Countdown
                key={result.expiresAt}
                expiresAt={result.expiresAt}
                onExpire={handleExpire}
              />
            </span>
          </div>

          {result.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.resultImage} src={result.content} alt="Shared" />
          ) : (
            <pre className={styles.resultText}>{result.content}</pre>
          )}

          <button className={styles.secondary} type="button" onClick={clearTimer}>
            Clear
          </button>
        </div>
      )}
    </form>
  );
}
