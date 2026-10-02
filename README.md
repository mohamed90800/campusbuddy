# CampusBuddy · Agni College of Technology

CampusBuddy is a campus issue-reporting app for Agni College of Technology. Reports and votes are stored in a local SQLite database, so they remain available after the browser or server restarts.

## Requirements

- Node.js 24 or newer (uses Node's built-in SQLite module)

## Run locally

```powershell
npm install
npm run dev
```

Open the Vite URL printed in the terminal. The API server prints a temporary admin password each time it starts. To choose a stable password, set it before starting the app:

```powershell
$env:ADMIN_PASSWORD = 'choose-a-private-password'
npm run dev
```

Students can submit reports with a campus location, category, impact, reporter name, and optional photo. Click the Student role control and enter the admin password to update issue statuses.

## Run a production build

```powershell
npm run build
$env:ADMIN_PASSWORD = 'choose-a-private-password'
npm start
```

The Node server serves the built app and API on port `3001`. The SQLite database is created at `data/campusbuddy.sqlite`; it is ignored by Git. Set `CAMPUS_NAME` or `CAMPUSBUDDY_DB_PATH` before starting to customize the campus label or database location.

## Campus demo

`npm run dev` exposes the app on the local network. Other devices on the same Wi-Fi can open the network URL printed by Vite. For a college-wide rollout, deploy the production server to a stable host with HTTPS, backups, a strong admin password, and real student sign-in. This MVP does not yet verify student identities or include lost-and-found and queue prediction modules.