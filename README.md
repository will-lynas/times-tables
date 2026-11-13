# Times tables

A minimal desktop multiplication grid built with React, Vite, TypeScript and Radix Themes.

- Ordered or independently shuffled 1–12 row and column headings.
- Timed rounds with accuracy and separate local high scores for each mode.
- Keyboard navigation with Enter, Tab, Shift+Tab and arrow keys.
- No accounts or backend. Scores stay in this browser; clearing site data removes them.

Choose a mode, press **Start**, fill the grid, then press **Finish**. Reload the page for a new round. Desktop window of at least 1024 pixels required.

## Development

Use Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:browser
```

Vercel builds with `npm run build` and serves `dist`. Pushes to `main` deploy to [times-tables.lynas.dev](https://times-tables.lynas.dev).
