import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { getSpotifyToken } from "@/lib/spotify";
import { GENRES, MOODS } from "@/lib/options";

const sql = neon(process.env.DATABASE_URL!);

const schema = z.object({
  title: z.string(),
  artist: z.string(),
  reason: z.string(),
});

type Song = {
  title: string;
  artist: string;
  reason: string;
  spotify: {
    external_urls: { spotify: string };
    album: { images: { url: string }[] };
  };
};

type Row = {
  title: string;
  artist: string;
  reason: string;
  spotify_url: string;
  cover_url: string | null;
};

const LIMIT = 10;

function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function toSong(r: Row): Song {
  return {
    title: r.title,
    artist: r.artist,
    reason: r.reason,
    spotify: {
      external_urls: { spotify: r.spotify_url },
      album: { images: r.cover_url ? [{ url: r.cover_url }] : [] },
    },
  };
}

const TWISTS = [
  "a lesser-known song",
  "a classic from the 70s or 80s",
  "a hit from the 90s or 2000s",
  "something released in the last 10 years",
  "a track by an independent artist",
  "a B-side or lesser-known song by a famous artist",
];

export async function POST(req: Request) {
  const { genre, mood, exclude = [] } = await req.json();


  if (!GENRES.includes(genre) || !MOODS.includes(mood)) {
    return Response.json({ error: "Invalid genre or mood" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  const rows = await sql`
    SELECT title, artist, reason, spotify_url, cover_url
    FROM daily_songs
    WHERE genre = ${genre} AND mood = ${mood} AND day = ${today}
  `;
  const cached = rows[0] ? toSong(rows[0] as Row) : null;
  const alreadyHeard = cached
    ? exclude.includes(`${cached.title} - ${cached.artist}`)
    : false;

  if (cached && !alreadyHeard) {
    return Response.json(cached);
  }


const ip = getIp(req);

await sql`DELETE FROM rate_limits WHERE created_at < now() - interval '1 day'`;
await sql`INSERT INTO rate_limits (ip) VALUES (${ip})`;

const [{ count }] = await sql`
  SELECT COUNT(*)::int AS count FROM rate_limits
  WHERE ip = ${ip} AND created_at > now() - interval '1 hour'
`;

if (count > LIMIT) {
  return Response.json(
    { error: "Too many requests. Please try again later." },
    { status: 429 }
  );
}

  const token = await getSpotifyToken();
  const twist = TWISTS[Math.floor(Math.random() * TWISTS.length)];
  const excluded: string[] = [...exclude];

  for (let attempt = 0; attempt < 3; attempt++) {
    let output;
    try {
      const result = await generateText({
        model: google("gemini-3.8-flash"),
        output: Output.object({ schema }),
        temperature: 1,
        prompt: `Recommend ONE real, existing song.
Genre: ${genre}. Mood: ${mood}.
Approach: ${twist}.
Do not repeat any of these songs: ${excluded.join("; ") || "none"}.
If you are not sure it exists, pick another.
Write the reason in English.`,
      });
      output = result.output;
    } catch (error) {
      console.error(error);
      return Response.json(
        { error: "AI usage limit reached. Please try again later." },
        { status: 429 }
      );
    }

    const q = encodeURIComponent(`track:${output.title} artist:${output.artist}`);
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await res.json();
    const item = data.tracks?.items?.[0];

    if (item) {
      const song: Song = {
        ...output,
        spotify: {
          external_urls: item.external_urls,
          album: { images: item.album.images },
        },
      };

      if (!cached) {
        await sql`
          INSERT INTO daily_songs (genre, mood, day, title, artist, reason, spotify_url, cover_url)
          VALUES (${genre}, ${mood}, ${today}, ${song.title}, ${song.artist}, ${song.reason},
                  ${song.spotify.external_urls.spotify}, ${song.spotify.album.images[0]?.url ?? null})
          ON CONFLICT (genre, mood, day) DO NOTHING
        `;
      }

      return Response.json(song);
    }

    excluded.push(`${output.title} - ${output.artist}`);
  }

  return Response.json(
    { error: "No song found, please try again" },
    { status: 404 }
  );
}