# Windows Installation

## 1. Install Node.js

Install the current LTS release from <https://nodejs.org/>.

After installation, open PowerShell and confirm:

```powershell
node --version
npm --version
```

## 2. Open the project

```powershell
cd d:\Projects\myrient-get
```

## 3. Install dependencies

```powershell
npm install
```

## 4. Start the server

```powershell
npm start
```

Expected URL:

```text
http://localhost:3001
```

## 5. Optional: use a different port

```powershell
$env:PORT=3002
npm start
```

## Troubleshooting

### `npm` is not recognized

Restart the terminal or reinstall Node.js, making sure PATH integration is enabled.

### Port already in use

Start with another `PORT` value as shown above.

### App starts but the browser page is empty

Run:

```powershell
npm run build
```

Then restart the server.

### Downloads fail

Check:

- internet connection
- write access to `downloads\`
- free disk space

### Reset local state

If you need to rebuild local storage:

- delete `data\games.db`, or
- use the in-app rebuild and reindex tools first

## Useful commands

```powershell
npm start
npm run build
npm run test:compliance
npm run test:fallback
npm run test:features
```
