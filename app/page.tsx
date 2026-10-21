"use client";

import { useEffect, useState } from "react";

type Track = {
  title: string;
  artist: string;
  reason: string;
  spotify: {
    external_urls: { spotify: string };
    album: { images: { url: string }[] };
  };
};

type Stored = { track: Track; createdAt: number };

import { GENRES, MOODS } from "@/lib/options";

const IS_DEV = process.env.NODE_ENV === "development";
const DAY = 24 * 60 * 60 * 1000;
const STORE_KEY = "daily-song";
const HISTORY_KEY = "song-history";

function formatRemaining(ms: number) {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h} h ${m} min`;
}

export default function Home() {
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [stored, setStored] = useState<Stored | null>(null);
  const [now, setNow] = useState(0);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  useEffect(() => {
    
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) setStored(JSON.parse(raw));
  } catch {}
  setNow(Date.now());
  setReady(true);
  const id = setInterval(() => setNow(Date.now()), 60_000);
  return () => clearInterval(id);
}, []);

useEffect(() => {
  document.title = stored
    ? `${stored.track.title} · ${stored.track.artist}`
    : "Canción del día";
}, [stored]);

  const remaining = stored ? stored.createdAt + DAY - now : 0;
  const locked = stored !== null && remaining > 0;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const history: string[] = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");

      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre, mood, exclude: history }),
      });
      if (!res.ok) throw new Error("No se pudo obtener la canción");
      const track: Track = await res.json();

      const entry = { track, createdAt: Date.now() };
      localStorage.setItem(STORE_KEY, JSON.stringify(entry));
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify([...history, `${track.title} - ${track.artist}`].slice(-50))
      );
      setStored(entry);
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(HISTORY_KEY);
  setStored(null);
}

  if (!ready) return null;

  const select = "w-full rounded border border-white/30 bg-transparent p-2 text-white [color-scheme:dark]";

  return (<div className="relative min-h-screen overflow-hidden bg-zinc-950 text-white">
  <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/4 h-64 w-64 -translate-x-[90%] rounded-full bg-green-500/50 blur-3xl" />
<div aria-hidden className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-[10%] rounded-full bg-purple-500/50 blur-3xl" />

  <main className="relative mx-auto max-w-md space-y-6 p-6">
    <h1 className="text-center font-mono text-3xl font-bold tracking-[0.3em] sm:text-5xl">
      DAILY SONG
    </h1>

    {!locked && (
      <>
        <select className={select} value={genre} onChange={(e) => setGenre(e.target.value)}>
          {GENRES.map((g) => (
            <option key={g} value={g} className="bg-zinc-900 text-white">{g}</option>
          ))}
        </select>

        <select className={select} value={mood} onChange={(e) => setMood(e.target.value)}>
          {MOODS.map((m) => (
            <option key={m} value={m} className="bg-zinc-900 text-white">{m}</option>
          ))}
        </select>

        <button
          onClick={handleSubmit}
          disabled={loading}
          aria-label="Get my song"
          className="w-full rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "..." : ":)"}
        </button>
      </>
    )}

    {error && <p className="text-red-500">{error}</p>}

    {stored && (
      <div className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-xl backdrop-blur-md">
        <img
          src={stored.track.spotify.album.images[0]?.url}
          alt={stored.track.title}
          className="w-full rounded"
        />
        <a
          href={stored.track.spotify.external_urls.spotify}
          target="_blank"
          rel="noreferrer"
          className="block text-lg font-semibold hover:underline"
        >
          {stored.track.title} · {stored.track.artist}
        </a>
        <a
          href={stored.track.spotify.external_urls.spotify}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm hover:underline"
        >
          <span>Listen on</span>
          <img src="/spotify-logo-white.svg" alt="Spotify" className="h-6 w-auto" />
        </a>
        <p className="text-sm text-gray-300">{stored.track.reason}</p>
        {locked && (
          <p className="text-sm">
            You can request another song in {formatRemaining(remaining)}.
          </p>
        )}
      </div>
    )}

    <footer className="space-y-2 border-t border-white/10 pt-6 text-center text-[11px] leading-relaxed text-gray-400 text-balance">
  <p>
    Music data by Spotify · Not affiliated with or endorsed by Spotify · AI picks may be inaccurate
  </p>

  <p>
    Made by{" "}
    <a
      href="https://github.com/taku-afk18"
      target="_blank"
      rel="noreferrer"
      className="text-gray-200 underline-offset-2 hover:underline"
    >
      taku
    </a>
    {" "}
  </p>

  <details>
    <summary className="cursor-pointer list-none underline-offset-2 hover:underline [&::-webkit-details-marker]:hidden">
      Privacy
    </summary>
    <p className="mt-2">
      No accounts are created. Your IP address is stored temporarily to prevent abuse,
      and your last song is saved in your browser.
    </p>
  </details>
</footer>

    {IS_DEV && (
      <button onClick={handleReset} className="text-xs text-gray-500 underline">
        Reiniciar
      </button>
    )}
  </main>
</div>
);
}