# Dream Network · Rüya Ağı

A 3D dream journal that reads dreams through Freud and Jung and links them over time.

- `/` landing page with the waitlist
- `/app/` the app (dreams stay in the visitor's browser, installable to the home screen)
- `netlify/functions/interpret.mjs` the only server part: sends one dream to Claude and returns the reading at `/api/interpret`

## Netlify settings

- Deploys from this repository; no build command, publish directory is the repo root (see `netlify.toml`).
- Environment variable `ANTHROPIC_API_KEY` (required). Optional `DREAM_MODEL` to change the model (default `claude-opus-5-5`).
- Set a monthly spend limit for the key in the Anthropic Console.
