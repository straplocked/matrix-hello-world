# Contributing to Matrix Hello

Thanks for your interest in contributing! This project is intentionally minimal — three source files, no build tools, no frameworks.

## Getting Started

1. Fork and clone the repository
2. Run `docker compose up -d --build` to start locally
3. Open `http://localhost:3001` in your browser
4. Make changes to files in `src/`
5. Rebuild: `docker compose up -d --build`
6. Hard refresh your browser (Ctrl+Shift+R)

## Guidelines

### Code Style
- **ES5 JavaScript** — Use `var`, `function`, no arrow functions, no `let`/`const`
- **No build tools** — No npm, no webpack, no transpilation
- **No new dependencies** — CDN libraries only if absolutely necessary
- **Single IIFE** — All JS lives in one `(function() { ... })()` in `main.js`

### What to Contribute
- Visual effect improvements and new interactions
- Performance optimizations
- Browser compatibility fixes
- Documentation improvements
- Security enhancements

### What Not to Contribute
- Build tooling (webpack, vite, etc.)
- Framework conversions (React, Vue, etc.)
- Package managers (npm, yarn)
- TypeScript conversion
- Breaking changes to the ES5 style

### Cache Busting
When modifying CSS or JS, bump the version query string in `index.html`:
```html
<link rel="stylesheet" href="style.css?v=YYYYMMDD[letter]">
<script src="main.js?v=YYYYMMDD[letter]"></script>
```

### Commits
- Write clear, concise commit messages
- One logical change per commit
- Test in a real browser (not just dev server) before submitting

## Reporting Issues

Open an issue with:
- Browser and version
- Screenshot or screen recording if visual
- Steps to reproduce
- Expected vs. actual behavior

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
