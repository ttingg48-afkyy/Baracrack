# BARA TERMINAL v3 — Vercel Edition

Neo-Brutalism web panel using Supabase Auth and Vercel Sandbox.

## Important reality check
- This starter provides authenticated, per-user persistent Vercel Sandbox workspaces and a command runner.
- Vercel Sandbox sessions are time-limited; filesystem persistence resumes from snapshots.
- The current browser console sends one shell command per request. It is **not yet a full xterm/PTY WebSocket terminal**, so full-screen interactive `nano` is not implemented in this starter.
- Do not expose this publicly until you add quotas, rate limiting, billing controls, audit logging, and stronger admin controls.
- User code executes inside isolated Vercel Sandbox microVMs, not in the Next.js function.

## 1. Supabase setup
1. Create a project at https://supabase.com
2. In Authentication > Providers > Email, enable Email.
3. For quick testing, you may disable email confirmation; for public use, keep confirmation enabled.
4. Copy Project URL, anon/public key, and service_role key.
5. Add these to Vercel Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `BARA_ADMIN_EMAIL` (the email that should receive admin API access)
   - `NEXT_PUBLIC_ADMIN_EMAIL` (same email; used only to show the Admin tab)
6. Never put service_role key in a `NEXT_PUBLIC_` variable.

## 2. Deploy from GitHub (phone-friendly)
1. Extract this ZIP.
2. Upload the folder contents to a new GitHub repository named `bara-terminal-vercel`.
   - On GitHub mobile, create a repository, then use Add file > Upload files.
   - Upload the project files and folders from the extracted ZIP.
3. Open https://vercel.com/new
4. Import the GitHub repository.
5. Framework: Next.js. Keep Root Directory `./`, Build Command `next build`, Install Command `npm install`.
6. Before deploying, add the environment variables above in the project configuration.
7. Click Deploy.

## 3. Enable Vercel Sandbox
- Use a Vercel project/plan with Vercel Sandbox access enabled.
- `@vercel/sandbox` uses Vercel OIDC automatically when running in a Vercel deployment. No Vercel token is hard-coded in this project.
- Make sure the deployment's Vercel project has Sandbox enabled and the required usage/billing allowance.
- Redeploy after changing environment variables.

## 4. Admin
Admin access is based on exact email match against `BARA_ADMIN_EMAIL`.
The admin page lists the first 100 Supabase users and supports 24-hour ban, permanent ban (10-year duration), and unban.
This is a starter admin surface, not a complete moderation/audit suite.

## 5. What is not in this starter
- Full interactive PTY/xterm WebSocket bridge and real nano key handling.
- File upload/download UI and ZIP export.
- Durable shared file storage outside Sandbox snapshots / external Vercel Drives.
- User project quotas, detailed audit history, mute/kick, and production-grade RBAC.

## 6. Local development
Node.js 22.19+ recommended:
```bash
npm install
cp .env.example .env.local
npm run dev
```
For local Sandbox auth, link the project and pull Vercel env:
```bash
npx vercel login
npx vercel link
npx vercel env pull .env.local
```

## Official docs
- https://vercel.com/docs/sandbox
- https://vercel.com/docs/git
- https://supabase.com/docs/guides/auth
