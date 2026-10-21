# Daily Song

A small web app that recommends **one song a day**. Pick a genre and a mood, and the app suggests a track picked by AI, with a link to listen on Spotify. After you get your song, you can ask for a new one after 24 hours.

## How it works

1. The user chooses a **genre** and a **mood** from fixed lists.
2. The API route asks Gemini (through the Vercel AI SDK) for one real song that fits.
3. The suggestion is checked against the Spotify Search API, so only songs that really exist are returned.
4. The result is cached in Postgres per genre, mood and day, so many users share the same result and AI usage stays low.
5. A simple per-IP rate limit protects the API, and the browser stores the last song to enforce the 24-hour wait.
