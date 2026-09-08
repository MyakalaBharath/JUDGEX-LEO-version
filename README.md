# JUDGEX V2 — Real-Time AI Judge

JUDGEX is a hackathon/project judging workspace with:

- Live camera preview
- Microphone capture and browser speech transcript
- Screen sharing
- Session timer and optional WebM recording
- Periodic multimodal live analysis using camera/screen frames
- Five independent AI judging agents
- Lead-agent synthesis and weighted score
- Live transcript analysis
- Context-aware AI chatbot
- Exportable final JSON report
- Backend API key protection (the OpenAI key stays on the server)

## 1. Run locally

Requirements: Node.js 20+.

```bash
npm install
cp .env.example .env
```

Put your API key in `.env`, then:

```bash
npm start
```

Open `http://localhost:3000`.

## 2. Deploy

JUDGEX requires a Node server because the API key must not be placed in browser JavaScript. Deploy this folder to a Node-compatible host and set the environment variables from `.env.example` in the host dashboard.

If you deploy the frontend separately, set the browser's API base with:

```js
localStorage.setItem('judgex_api', 'https://YOUR-BACKEND-DOMAIN');
```

Then reload the page.

## 3. Browser permissions

Camera, microphone, and screen sharing require a secure context (normally HTTPS) in production. The browser will ask the presenter to grant permission.

## 4. Important architecture

Browser -> Express backend -> OpenAI Responses API

The browser captures presentation media locally. Small periodic JPEG frames and transcript snippets are sent to the backend for analysis. The raw OpenAI API key is never shipped to the browser.

## 5. Production hardening

For a real public deployment, add authentication, per-session authorization, rate limiting, persistent storage, audit logging, retention controls, HTTPS, and stronger origin restrictions before exposing the service to untrusted users.
