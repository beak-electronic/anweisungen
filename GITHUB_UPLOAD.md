# Anweisungen auf GitHub hochladen (Version 1.75)

Dieses Verzeichnis ist die fertige App-Quelle (statische PWA). Kein `npm install` nötig.

## Variante A – GitHub-Website (einfach)

1. Auf github.com ein **neues leeres** Repository anlegen (ohne README/.gitignore, falls schon hier enthalten).
2. Dieses ZIP entpacken.
3. Im neuen Repo: **Add file → Upload files** und den **Inhalt** dieses Ordners hochladen  
   (also `index.html`, `app.js`, `styles.css`, `vendor/`, … – nicht den äußeren ZIP-Namen als einzige Datei).
4. Committen.

Optional: unter **Settings → Pages** die Branch `main` als Website freigeben.

## Variante B – GitHub Desktop / Terminal

Ordner enthält bereits ein Git-Repository mit einem Initial-Commit.

```bash
cd Anweisungen-github-v1.75
git remote add origin https://github.com/DEIN-USER/DEIN-REPO.git
git branch -M main
git push -u origin main
```

(URL durch dein neues Repo ersetzen.)

## Hinweis

- Primärformat der App ist `.beak` (ZIP mit `project.json`); diese Dateien gehören **nicht** ins Repo.
- Mac-Helfer liegen unter `mac-opener/` (optional; der frühere lokale Serve wurde entfernt).
