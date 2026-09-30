# Anweisungen auf GitHub hochladen (Version 1.75)

Nur die App-Software (statische PWA). Kein `npm install`, keine Testdateien, keine Stückliste/.beak.

## Variante A – GitHub-Website

1. Auf github.com ein **neues leeres** Repository anlegen.
2. Dieses ZIP entpacken.
3. Im Repo: **Add file → Upload files** und den **Inhalt** dieses Ordners hochladen  
   (`index.html`, `app.js`, `styles.css`, `vendor/`, …).
4. Committen.

Optional: **Settings → Pages** → Branch `main`.

## Variante B – Terminal

```bash
cd Anweisungen-github-v1.75
git remote add origin https://github.com/DEIN-USER/DEIN-REPO.git
git branch -M main
git push -u origin main
```
