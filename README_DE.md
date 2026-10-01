# Anweisungen

Mehrseitige Foto-Anweisungen (Landscape) im BEAK-Stil.

**Version:** 2.07

## Neu in 2.07

- **Hochformat: große schwarze Lücke weg:** Gestapelte Seiten nicht mehr viewport-hoch (`app-h-fixed`/`100cqh` → `height:auto` + Aspect, JS-Sync). Zwischen den Seiten bleibt ein schmaler schwarzer Streifen = **2×** die horizontale Teilungslinie (`gap: calc(var(--frame-border-w) * 2)` ≈ 4 mm). Querformat-Wischen unverändert.
- **Service Worker:** Cache `anweisungen-shell-v2.07` und `?v=2.07`.

## Neu in 2.06

- **Geräte-Laufzettel-Button:** gleiche Farbe wie „Sichern“ (Magenta `--accent` / `#dd007a`); normale Seiten-Buttons bleiben blau.
- **Service Worker:** Cache `anweisungen-shell-v2.06` und `?v=2.06`.

## Neu in 2.05

- **Editor Seite 1 (Varianten):** Finger-Wischen zur Index-Tabelle (vorwärts); Rückwärts Index→Varianten wie gehabt. Viewer bleibt ohne Wischen von Seite 1.
- **Toolbar ± Seite:** Varianten & Fehleranalyse ohne ± (nur „Alle Seiten“, rund); Index ohne − (Alle Seiten links rund | + Seite); Layout-Seiten unverändert.
- **Service Worker:** Cache `anweisungen-shell-v2.05` und `?v=2.05`.

## Neu in 2.04

- **iOS/iPadOS 26/27 Blur:** Chrome ohne `backdrop-filter` (Topbar/Varianten-Leiste solide); `ios-pwa-status-strip` wie andere BEAK-Apps gegen Scroll-Pocket-Blur.
- **Windows-Icon:** wieder abgerundet (transparente Ecken, Radius ~22 % wie andere BEAK-Apps).
- **Varianten-Kürzel (Editor):** Schrift im Kürzel-Feld schwarz auf hellem Hintergrund — besser lesbar.

## Neu in 2.03

- **Varianten-Caption Drag:** Ganzer Block (Name + Kürzel + L-Ecken) ziehbar; Textfelder tippen zum Editieren, Ziehen ab kurzer Schwelle. Während Fokus im Feld kein Drag von dort.
- **Editor Caption:** L-Ecken zum Ziehen (Eck-Hit-Areas); kein Punkt-Griff.
- **Service Worker:** Cache `anweisungen-shell-v2.03` und `?v=2.03`.

## Neu in 2.02

- **Varianten-Texte:** Farbe etwas dunkler (`#a8a8a8`), weiterhin `font-weight: 400` (Editor = Viewer).
- **Editor Caption-Griff:** Vier L-Ecken in Accent `#dd007a` um den Varianten-Text (nur Editor; Viewer ohne Rahmen).
- **Stückliste-Abgleich / Varianten:** „Nicht in der Stückliste“ und Mengen zählen nur noch BEAK-Nr. auf Seiten der **aktiven Variante** (nicht Exklusivseiten anderer Varianten).
- **Seite 1 Editor:** „Foto schieben“ voll gerundet (kein harter Gruppenkant); **Alle Seiten**-Thumbs: Varianten-Trenner weiß wie Viewer.
- **Service Worker:** Cache `anweisungen-shell-v2.02` und `?v=2.02`.

## Neu in 2.01

- **Varianten-Texte (Seite 1):** Editor und Viewer gleiche Caption-Position (Wrap ohne Extra-Padding/Rahmen); Text hellgrau, `font-weight: 400`.
- **Topbar-Mitte:** „Übersicht“ → **Alle Seiten**; „Erste Seite“ → **Varianten** (Icon 2×1-Raster); „Letzte Seite“ → **Fehler** (Warn-Dreieck-Platzhalter).
- **Varianten-Editor:** Button **„Foto schieben“** auch auf Seite 1 (wie auf Layout-Seiten); Drehen/Teleport/Zwischenspeicher bleiben ausgeblendet.
- **Seite 1 Viewer:** Mitten-Topbar (Alle Seiten / Varianten / Index / Fehler) ausgeblendet — kein Seitensprung von der Varianten-Seite.
- **Service Worker:** Cache `anweisungen-shell-v2.01` und `?v=2.01`.

## Neu in 2.00

- **Index-Zielseite = Anzeigenummer:** Arbeitsschritte-/Button-Ziele nutzen die Nummer aus der Seitenanzeige (Nav der aktiven Variante), nicht den internen Absolute-Index — „Seite 36“ öffnet die 36. Seite im aktuellen Varianten-Pfad.
- **Varianten-Leiste = Topbar-Höhe:** Feste Außenhöhe 50px (8+34+8), Chips/Toggle/Actions in einer Zeile zentriert — kein Extra-Padding/Safe-Area das die Leiste dicker macht als die Topbar.
- **Geräte Laufzettel Overlay:** Portrait nahezu fullscreen; Landscape weiterhin schmal (~768px/60vw). Chrome-Button „Auswahl“ entfernt (✕ schließt; `postMessage` closed/home lädt die Laufzettel-Startseite weiterhin neu).
- **Service Worker:** Cache `anweisungen-shell-v2.00` und `?v=2.00`.

## Neu in 1.99

- **Index-Sprung mit Varianten:** Arbeitsschritte-Links zielen auf die Seite der **aktiven Variante** (Gruppe/`variantScope` über `getNavPages`/`remapToVisiblePageIndex`), nicht auf eine blinde Absolute-Index-Position.
- **Initialen-Overlay:** Abdeckpanel etwas größer (deckt Neues Projekt / Öffnen / Tour vollständig), eckige Ecken (kein Abrunden), Initialen-Eingabe in normaler Schriftstärke (nicht fett).
- **Service Worker:** Cache `anweisungen-shell-v1.99` und `?v=1.99`.

## Neu in 1.98

- **Geräte Laufzettel-Button:** Beim Anlegen eines Seiten-Buttons Option „Geräte Laufzettel“ — Name wird automatisch gesetzt. Im Viewer öffnet der Button ein schmales Overlay (~768px / ~60vw, Stückliste-Stil) mit `https://beak-electronic.github.io/geraete-laufzettel/`.
- **+ Variante in Teilmenge:** „Nur für bestimmte Variante(n)“ für z. B. A+B schließt die Seite auf A|B (kein Chip/Shared für ungewähltes C). **+ Variante** splittet innerhalb der Teilmenge weiter (A vs B).
- **Overlay:** postMessage `geraete-laufzettel` (`saved` → Overlay schließen; `closed`/`home` → iframe zurück zur Auswahl). Chrome „Auswahl“ lädt Startseite neu; „✕“ schließt zu Anweisungen. Ohne postMessage vom Laufzettel: best-effort über Overlay-Chrome.
- Enthält v1.97: Toggle-Mitte stabil, kein Milchglas wenn eingeklappt.
- **Service Worker:** Cache `anweisungen-shell-v1.98` und `?v=1.98`.

## Neu in 1.97

- **Varianten-Leiste Toggle:** Collapse/Expand-Kreis bleibt exakt in der gleichen absoluten Mitte (`left:50%; transform:translate(-50%,-50%)`).
- **Eingeklappt:** Milchglas-/Blur-Hintergrund der Leiste komplett aus — nur der Kreis-Button bleibt sichtbar.
- **Service Worker:** Cache `anweisungen-shell-v1.97` und `?v=1.97`.

## Neu in 1.96

- **Stückliste-PDF im .beak:** Beim Speichern bleibt der **Original-Dateiname** unter `source/<Originalname>.pdf` (nicht mehr fest `source/Stueckliste.pdf` / `Stueckliste-<id>.pdf`). `project.json` speichert `stueckliste.file` / `variantStuecklisten.*.file` entsprechend; Laden nutzt diesen Pfad (Fallback auf alte generische Namen).
- **Varianten-Leiste einklappbar (Design D):** Runder Icon-Button in Chip-Höhe (34px, ohne höhere Leiste). Expanded: Pfeil ↓ + Linie; collapsed: Pfeil ↑ + Linie.
- **Service Worker:** Cache `anweisungen-shell-v1.96` und `?v=1.96`.

## Neu in 1.95

- **+ Variante:** Ausgeblendet, sobald die Anzahl der Varianten-Chips der Anzahl der benannten Geräte auf Seite 1 entspricht (z. B. A | B | C) — auch wenn das letzte Gerät noch allein auf der Shared-Seite liegt. Ebenso ausgeblendet, wenn für „Neue Variante anlegen für“ keine Geräte mehr übrig sind (Shared-Rest &lt; 2).
- **Service Worker:** Cache `anweisungen-shell-v1.95` und `?v=1.95`.

## Neu in 1.94

- **Varianten-Leiste (Editor):** Chips statt „Zwischen Varianten wechseln“. Shared: ein Chip „A, B, C“ (outlined, Klick ohne Wirkung). Nach Spezialisierung: z. B. „A“ | „B, C“ – Tippen wechselt die Seiten-Variante; aktiver Chip outlined.
- **+ Variante:** Dialog „Neue Variante anlegen für“ mit je einem Button pro noch nicht spezialisierter Seite-1-Variante; ausgeblendet wenn alle eine eigene Seite haben.
- **Nur für bestimmte Variante(n):** Umbenannt; Checkbox-Liste aller Varianten, OK wendet die Auswahl an (Seite nur für gewählte Varianten), Abbrechen ohne Änderung.
- **Service Worker:** Cache `anweisungen-shell-v1.94` und `?v=1.94`.

## Neu in 1.93

- **Willkommen-Initialen:** Fehlen lokal gespeicherte Initialen (`localStorage` `anweisungen-device-nickname`), erscheint ein Overlay über Neues Projekt / Öffnen / Tour („Bitte Initialen eintragen.“, nur Großbuchstaben, „Initialen speichern“). Buttons erst nach Speichern nutzbar; vorhandene Initialen → Overlay nie.
- **Varianten-Wechsel (Merge):** „Zwischen Varianten wechseln“ gruppiert Geräte ohne eigene Spezialseite zu einer Wahl („A & B“); Spezialisierungen einzeln; aktive Option ausgegraut. Wenn jede Variante eine Spezialseite hat: nur Einzeln + „+ Variante“ aus.
- **+ Variante:** Nur noch unbenutzte Varianten wählbar; ausgeblendet wenn alle Seite-1-Varianten schon eine Spezialseite in der Gruppe haben.
- **Nur für eine Variante:** Alle Optionen wählbar (aktive nicht ausgegraut).
- **Stückliste:** Toolbar-Button auf der Varianten-Seite (Seite 1) ausgeblendet.
- **Index:** Titel zeigt den Namen der aktiven Variante (Seite 1) statt des Dateinamens.
- **Seite 1:** Wort „Verschieben“ über dem Namen entfernt (Box weiterhin ziehbar).
- **Viewer:** Varianten-Name ohne Kürzel in Klammern.
- **Service Worker:** Cache `anweisungen-shell-v1.93` und `?v=1.93`.

## Neu in 1.92

- **Editor Seite 1:** Tippen auf Varianten-Foto wählt/springt nicht mehr (nur noch im Viewer → Arbeitsschritte).
- **Caption-Position:** Editor- und Viewer-Platzierung stimmen überein (Position wird nicht mehr durch unterschiedlich große Overlays überschrieben; Griff „Verschieben“ liegt oberhalb der Box).
- **Aktiv-Zeile:** „Aktiv: …“ in der Varianten-Leiste hellblau (`#7dd3fc`) statt pink.
- **+ Variante / Fotos:** Spezialseiten bekommen eigene Leaf-IDs; Foto-Ersetzen trifft die aktive Spezialseite, nicht Shared/andere Varianten.
- **Service Worker:** Cache `anweisungen-shell-v1.92` und `?v=1.92`.

## Neu in 1.91

- **Öffnen/.beak:** Ursache behoben: Speichern als `.beak` schrieb die Varianten-Seite fälschlich als `kind:"layout"` (ohne Captions) → beim Öffnen entstand eine leere neue Varianten-Seite. Jetzt korrekt `kind:"varianten"` inkl. Name/Kürzel. Zusätzlich Recover für schon betroffene Dateien (Titel „Varianten“ / Inhalts-Duplikat). Migration idempotent; kein automatisches Blank-Layout in `ensureBookends`.
- **Varianten-Seite:** Verlassen nicht per Wischen oder Pfeiltasten — Variante tippen (→ Arbeitsschritte). Toolbar (Übersicht, Index, …) weiter nutzbar.
- **Kürzel:** Feld neben dem Varianten-Namen (`captionShort` in der Zelle / `kuerzel` in `project.json` → `variants[]`). Untere Leiste und kompakte UI zeigen das Kürzel (Fallback: voller Name). Dialoge/Stückliste weiter mit vollem Namen.
- **Verschieben:** Griff ohne ⋮⋮ / Sechs-Punkt-Icon — nur noch Text „Verschieben“.
- **Service Worker:** Cache `anweisungen-shell-v1.91` und `?v=1.91`.

## Neu in 1.90

- **„+ Variante“:** Ausgeblendet, wenn jede auf Seite 1 benannte Variante bereits eine Spezialseite für die aktuelle Seitengruppe hat.
- **„Nur für eine Variante“:** Ausgeblendet, sobald die Seite schon mehrfach variantenbezogen ist (≥2 Versionen / Spezialisierung).
- **Stückliste:** Hinweis nennt die aktive Variante, z. B. „Stückliste für die Variante „Alpha“ jetzt hinzufügen“.
- **Service Worker:** Cache `anweisungen-shell-v1.90` und `?v=1.90`.

## Neu in 1.89

- **Variante wählen:** Tippen/Klicken auf das Foto auf Seite 1 wählt die Variante und springt zu Arbeitsschritte (Viewer; Editor ohne Split-/Foto-Werkzeug).
- **Pfeiltasten:** Links/Rechts navigieren über die gefilterte Seitenliste (wie Wischen) – kein Hängen an unsichtbaren Spezialseiten.
- **Zwischen Varianten wechseln:** Die bereits aktive Variante ist ausgegraut/nicht wählbar.
- **Varianten-Leiste:** „Mehrere Varianten…“ und „Aktiv: …“ untereinander, beide orange.
- **Übersicht:** Bei Seiten mit mehreren Varianten N senkrechte Balken oben rechts auf der Kachel (Badge-Stil).
- **Viewer-Mitte:** Reihenfolge Übersicht → Erste Seite (Varianten) → **Index** (Arbeitsschritte) → Letzte Seite.
- **Trennlinien Seite 1 (Viewer):** Weiß ohne schwarzen Saum/Schatten — Linie tritt kaum hervor.
- **Service Worker:** Cache `anweisungen-shell-v1.89` und `?v=1.89`.

## Neu in 1.88

- **Varianten-Leiste:** Auf Seite 1 (Varianten) und letzter Seite (Fehleranalyse) ausgeblendet – gelten immer für alle Varianten.
- **Variante starten:** Tippen auf Varianten-Foto → aktive Variante setzen und automatisch zu Arbeitsschritte.
- **Trennlinien Seite 1:** Viewer weiß, Editor schwarz.
- **Varianten-Name:** Dunkelgrau ohne Schatten; Namensfeld doppelt so breit; Griff „Verschieben“.
- **Navigation:** Spezialseiten brechen Wischen nicht mehr (Nav filtert pro pageGroup; Remap statt Sprung auf Seite 1).
- **Übersicht:** Eine Kachel / Nummer pro Seitengruppe (keine Doppel-Thumbs für Varianten-Spezialisierungen).
- **„Nur für eine Variante“:** Wandelt die **aktuelle** Seite um (keine neue Seite); gleiche Nummer/Gruppe; andere Varianten überspringen sie im Viewer.
- **Varianten-Leiste Overlay:** Wie die Topbar – transparent mit `rgba(80,80,80,0.48)` + `blur(8px)`, liegt über dem Blatt (kein Seiten-Padding).
- **Start:** Beim Öffnen/Neuladen immer Willkommensbildschirm — kein Auto-Wiederherstellen des letzten Projekts (Autosave in IndexedDB bleibt für die Sitzung).
- **Chrome:** Umschalter „Werkzeugleiste nach unten/oben“ entfernt — Leiste bleibt oben.
- **Service Worker:** Cache `anweisungen-shell-v1.88` und `?v=1.88`.

## Neu in 1.87

- **Varianten-Seite:** Werkzeuge „Vertikal teilen“ / „Horizontal teilen“ im Editor wieder sichtbar.
- **Varianten-Name:** Nach Foto frei benennbar; Bezeichnung im Foto **verschiebbar**, bleibt in der Zelle (Editor: editieren + ziehen; Viewer: Text ohne schwarzen Rahmen).
- **Service Worker:** Cache `anweisungen-shell-v1.87` und `?v=1.87`.

## Neu in 1.86

- **Varianten-Leiste:** Der Button „Zwischen Varianten wechseln“ erscheint nur noch, wenn für die aktuelle Seite wirklich mehrere Optionen existieren (mehrere Spezialseiten, oder gemeinsame Seite plus mindestens eine Spezialisierung). Bei nur einer Spezial-/Exklusivseite bleibt er ausgeblendet. „+ Variante“ und der rote Hinweis „Mehrere Varianten…“ unverändert; bei nur einer Variante weiterhin keine untere Leiste.

## Neu in 1.85

- **Varianten-Seite:** Neue erste Folie vor „Arbeitsschritte“. Zellen wie auf Layout-Seiten (Unterteilung), je Zelle Foto **und** Pflicht-Bezeichnung darunter. Im Viewer steht der Text ohne schwarzen Rahmen; Rahmen nur im Editor. Tippen auf ein Foto öffnet diese Variante.
- **Stückliste je Variante:** Jede Variante hat ihre eigene Stückliste. Auf der Varianten-Seite sind Stückliste-Button und Menüeintrag ausgeblendet. Abgleich zählt BEAK-Nr. nur aus gemeinsamen Seiten + Seiten der aktiven Variante.
- **Untere Varianten-Leiste (Editor, Querformat, ≥ 2 Varianten):** „Diese Seite gilt für alle Varianten“ + „+ Variante“; nach Spezialisierung rot „Mehrere Varianten für diese Seite verfügbar“ + Wechseln; zusätzlich „Nur für eine Variante“ für exklusive Seiten (im Viewer bei anderen Varianten übersprungen).
- **Ein Bild:** Bei nur einer Varianten-Zelle erscheint die untere Leiste nicht.
- **Kompatibilität:** Alte `.beak` ohne Varianten-Seite bekommen automatisch eine leere Varianten-Folie; bisherige Stückliste bleibt erhalten (`source/Stueckliste.pdf`).

## Neu in 1.84

- **Editor: Trennlinien wieder ziehbar:** Im Edit-Modus (Querformat) greifen Vertikal-/Horizontal-Divider wieder – Ziehen verschiebt die Teilung. Seiten-Wischen stiehlt die Geste nicht mehr (ursächlich: Viewport-Swipe fing Pointer vor `onSplitDown`).
- **Viewer unverändert:** Wischen über einer Trennlinie blättert weiter die Seite (wie seit 1.67).
- **Preserve:** Split one-shot (v1.72), Highlight multi-leaf, Aspect 1180×792 / Fill uniform, Portrait-Stapel, pdf.js Legacy, `.beak` v5.
- **Service Worker:** Cache `anweisungen-shell-v1.84` und `?v=1.84`.

## Neu in 1.83

- **Aspect Feinabstimmung:** Logische Seite **1156×≈775** (Aspect **1180×792**, leicht landscape-er als 1.82/800). **Fenster** auf iPad Air praktisch ohne schwarze Seitenbalken (Statusleiste oben schwarz ok). **Kein Stretch** – Fill weiter uniform mit `--page-ref-h`.
- **Hochformat-Stapel dicht:** Ursache der riesigen schwarzen Lücken: `html.app-h-fixed` erzwang `height:100% !important` pro `.page-slide` (iPad; Windows ohne app-h-fixed war ok). Override → `height:auto` + Aspect; Stage nicht mehr viewport-hoch. Unnötiger Schwarz-Scroll weg.
- **Abstand gestapelte Seiten:** `gap: calc(var(--frame-border-w) * 2)` ≈ **2× Foto-Trennlinie** (4 mm).
- **Preserve:** Highlight multi-leaf, pdf.js Legacy, `.beak` v5, opake Statusleiste `black`, Editor im Hochformat aus.
- **Service Worker:** Cache `anweisungen-shell-v1.83` und `?v=1.83`.

## Neu in 1.82

- **Aspect / Anzeige ohne Stretch:** Logische Seite jetzt **1156×≈783** (Aspect **1180×800** = iPad Air Landscape nutzbar, minus ~20 pt opake Statusleiste). **Fenster** auf iPad Air ohne schwarze Seitenbalken (nur Statusleiste oben schwarz ok). **Fill** skaliert wieder **uniform** (kein sx/sy-Stretch aus 1.81); `--page-ref-h` passt die logische Höhe an die Bühne an → volle Fläche ohne Verzerrung. Alte `.beak` auto-adapt (%-Koordinaten).
- **Highlight Mehrfach-Fotos:** Highlight → Fotofelder antippen (mehrere pro Seite, Toggle) → Fertig. Schwarze Trennlinien bleiben unmaskiert. Persistenz: `highlightLeafIds[]` in `.beak` (Migration von `highlightLeafId`).
- **Hochformat-Scroll:** Alle Seiten stapeln und scrollen (nicht nur 1+2 dann schwarz). Ursache: `.page-slide.far` + `content-visibility` und `scrollTop`-Reset – beides im Portrait abgeschaltet.
- **Preserve:** pdf.js Legacy, `.beak` v5, kein Stretch, opake Statusleiste `black`, Editor im Hochformat ausgeblendet.
- **Service Worker:** Cache `anweisungen-shell-v1.82` und `?v=1.82`.

## Neu in 1.81

- **Bildschirmfüllend ohne Seitenbalken:** Fill skaliert die logische Seite (1156×803) per **Width+Height-Fill** (`--page-scale-x/y`) auf die volle Bühne – keine schwarzen Letterbox-Pfeiler links/rechts. Pinker Titelstreifen und Seiteninhalt bleiben sichtbar (kein Cover-Crop oben). **Fenster** darf weiter Letterbox haben. Alte `.beak` passen sich automatisch an (`updatePageScale` / Viewport).
- **Highlight nur auf Fotofeld:** Highlight einschalten, dann ein Foto-Feld antippen – der 50 %-weiße Schleier liegt nur auf diesem Bereich; schwarze Trennlinien zwischen Fotos bleiben schwarz. Rect/Kreis stanzen weiterhin Löcher. Persistenz: `highlight` + `highlightLeafId` in der Seite/`.beak`.
- **Hochformat:** Bei Wechsel Quer→Hoch stapeln die Dokumentseiten vertikal; Finger-Scroll wie eine Liste. Der **Editor**-Button ist im Hochformat ausgeblendet (Editor nur Querformat). Querformat: bisheriges Seiten-/Wisch-Verhalten.
- **Service Worker:** Cache `anweisungen-shell-v1.81` und `?v=1.81`.

## Neu in 1.80

- **Bildschirmfüllend: volle Seite sichtbar:** Fill skaliert wieder per **Contain** (`Math.min`) – magenta Titelstreifen (z. B. „200.434 PA 500…“) und gesamte Seite (Tabelle) werden nicht mehr oben weggeschnitten. Unten bündig, horizontal zentriert; Letterbox außen schwarz.
- **Schlanker oberer Canvas-Inset:** `--stage-top-inset` nur noch `env(safe-area-inset-top)` – kein 24px-Floor mehr. Der dicke schwarze Band unter der iPad-Uhr entfällt (opake Statusleiste `black` liefert oft Safe-Area 0). **Fenster** ebenfalls schlanker oben. Statusleiste bleibt **opaque black** (nicht translucent). Schlanke Editor-Topbar aus 1.76 unverändert.
- **Alte .beak automatisch:** Layout bleibt im logischen 1156×803-Raum; `updatePageScale` / Viewport greifen beim Öffnen und bei Resize – kein manuelles Neu-Anlegen nötig.
- **Service Worker:** Cache `anweisungen-shell-v1.80` und `?v=1.80`.

## Neu in 1.79

- **Fehleranalyse: grauer Streifen weg:** Der v1.78-`fehler-col-actions`-Spacer auf der letzten Seite entfiel; Minus sitzt absolut rechts – Tabellenspalten wieder wie zuvor.
- **Löschen kompakt:** Nach Minus auf der Fehlertabelle rückt der Rest nach oben (keine Löcher); leere Slots nur am Ende.
- **Cascade Quellseite:** Löschen entfernt die Zeile **und** das Layout-`fehlerEmbed` (Zelle) auf der `sourcePageId`-Seite, nicht nur die Tabellenfelder.
- **Service Worker:** Cache `anweisungen-shell-v1.79` und `?v=1.79`.

## Neu in 1.78

- **Fehleranalyse: Zeilen löschen:** Auf der letzten Seite (Fehlertabelle) gibt es im Editor bei bestehenden Einträgen einen Minus-Button wie im Layout-„Fehler“-Embed – **ohne Plus**. Orphan-Zeilen (Seite mit Fehler gelöscht, Zeile blieb) und normale Einträge können entfernt werden; Layout-Embeds und Projektzustand bleiben konsistent.
- **Service Worker:** Cache `anweisungen-shell-v1.78` und `?v=1.78`.

## Neu in 1.77

- **Seite löschen → Fehleranalyse:** Beim Löschen einer Layout-Seite werden zugehörige Fehlerzeilen aus der Fehlertabelle (letzte Seite) entfernt bzw. neu aufgebaut; 1-basierte Seitenverweise in Index und Buttons werden nachgezogen.
- **Service Worker:** Cache `anweisungen-shell-v1.77` und `?v=1.77`.

## Neu in 1.76

- **Werkzeugleiste schlank:** Obere Chrome-Leiste hat wieder dieselbe Höhe wie die untere (Padding 8px + reale Safe-Area; kein 24px-`--stage-top-inset`-Floor mehr in der Topbar).
- **Chrome-Position-Toggle nur Editor:** „Werkzeugleiste nach unten/oben“ neben Stückliste ist durch höhere CSS-Spezifität (`.btn.icon-btn.chrome-pos-btn`) außerhalb des Edit-Modus unsichtbar (Welcome/Viewer).
- **Service Worker:** Cache `anweisungen-shell-v1.76` und `?v=1.76`.

## Neu in 1.75
- **BEAK-Nr.-Werkzeug:** Farbe und Deckkraft entsprechen jetzt den Kreis-/Text-Werkzeugen.
- **Service Worker:** Cache `anweisungen-shell-v1.75` und `?v=1.75`.

## Neu in 1.74
- **Änderungsprotokoll:** Einträge werden jetzt mit den neuesten zuerst (umgekehrt chronologisch) angezeigt und exportiert.
- **Initialen eintragen:** Menü → Export → „Initialen eintragen“, direkt über „Änderungsprotokoll“ (nicht mehr unter Anzeige).
- **Service Worker:** Cache `anweisungen-shell-v1.74` und `?v=1.74`.

## Neu in 1.73
- **Initialen eintragen:** Menü → Anzeige → „Initialen eintragen“. Kürzel (z. B. BK) nur in `localStorage` `anweisungen-device-nickname` – **pro Gerät**, nie in der `.beak` / `project.json`. Leer = Plattformname (iPad/Mac/…).
- **Änderungsprotokoll ohne Klammern:** Format z. B. `28.09.26 - Seite 09 - Bild gelöscht von BK` bzw. `… von iPad` (kein `(Gerät)` mehr).
- **Service Worker:** Cache `anweisungen-shell-v1.73` und `?v=1.73`.

## Neu in 1.72
- **Teilen one-shot:** „Vertikal teilen“ / „Horizontal teilen“ deaktivieren sich nach **einer** Teilung wieder (wie Kreis/Rechteck) — nicht mehr sticky.
- **Service Worker:** Cache `anweisungen-shell-v1.72` und `?v=1.72`.

## Neu in 1.71
- **Änderungsprotokoll:** Menü → Export → „Änderungsprotokoll“. Chronologisches Textprotokoll sinnvoller Änderungen (Öffnen/Sichern, Foto, Formen, Text, Seiten, Stückliste, Highlight, Teilung …), Format z. B. `28.09.26 - Seite 09 - Bild gelöscht von (Gerätename)`. Gerätname best-effort (localStorage-Nickname, sonst Plattform/UA). Persistenz in `.beak`/`project.json`. Anzeigen, Kopieren oder als `.txt` herunterladen.
- **Mac-Resize / Letterbox:** Stage-/Letterbox-Hintergrund bleibt beim Ändern der Fenstergröße schwarz statt grau (aus 1.70 übernommen).
- **Editor: Werkzeugleiste oben/unten:** Button mit Auf/Ab-Pfeil rechts neben Stückliste. Tippen verschiebt die gesamte schwebende Button-Leiste (inkl. Chrome-Backdrop/Blur) an den unteren Bildschirmrand; erneutes Tippen zurück nach oben. Safe-Area unten wird berücksichtigt. Die Einstellung ist **temporär** — Fertig / Verlassen des Editors setzt immer wieder auf oben; erneuter Editor-Einstieg startet oben.
- **Text-Swatch „keine“:** Nur noch Schachbrett-Icon, ohne Label „keine“ (Tooltip/ARIA bleiben).
- **Service Worker:** Cache `anweisungen-shell-v1.71` und `?v=1.71`.

## Neu in 1.68
- **Text groß / Text klein – ohne Hintergrund:** In der Farbleiste erscheint bei Text der Swatch **„keine“** (transparent). Ohne Füllung ist die Schrift **schwarz**. Mit Farbfüllung bleibt weiße Schrift auf farbigem Kasten (80 %). Persistenz als `color: "keine"` in der `.beak`.
- **Enter = Zeilenumbruch:** In Text groß/klein fügt Enter einen echten Zeilenumbruch ein (kein Verrutschen mehr). Mehrzeiliger Text wird gespeichert (`\n`), Layout nutzt durchgängig `pre-wrap`.
- **Pfeil → Linie ohne Spitze:** In der Pfeilart-Leiste neue Option **Linie** (gerade Linie ohne Pfeilspitze), klar getrennt vom geraden Pfeil. Persistenz als `kind: "line"`.
- **Service Worker:** Cache `anweisungen-shell-v1.68` und `?v=1.68`.

## Neu in 1.67
- **Kopieren/Einfügen:** iPad: erneutes Tippen auf ausgewähltes Objekt zeigt **Kopieren**; Tippen auf leere Fläche zeigt **Einfügen** (wenn Zwischenablage gefüllt). Mac/Windows: Cmd/Ctrl+C / Cmd/Ctrl+V. Session-Zwischenablage im Speicher, Einfügen leicht versetzt; für Formen/Buttons/Info/Text/BEAK/Pfeil.
- **iPad Statusleiste:** Bei opaker Statusleiste (`black`) Canvas-Höhe/Inset angepasst (`--stage-top-inset`, Fill/Fenster), Inhalt sitzt unter der schwarzen Leiste und wird nicht überdeckt.
- **Standard Anzeige = Fenster:** Frische Installationen ohne `anweisungen-display-mode` starten mit **Fenster**; gespeicherte Wahl bleibt.
- **Wischen über Trennlinien:** Seiten-Wischen funktioniert, wenn der Finger auf vertikalen/horizontalen Divider-Linien startet (Divider fangen die Geste nicht mehr ab; Verschieben erst nach Auswahl).
- **Highlight (Editor):** Pro Seite umschaltbar – Foto nur in Rechtecken/Kreisen normal sichtbar, außerhalb weiße Abdeckung 50 % Deckkraft. Persistenz in der Seite/`.beak`.
- **Grün heller:** Form-Strichfarbe Grün etwas heller.
- **Farbe Pink:** Neue Strichfarbe Pink für Kreis/Pfeil/Rechteck (Farbleiste).
- **Service Worker:** Cache `anweisungen-shell-v1.67` und `?v=1.67`.

## Neu in 1.65
- **Mac „Fotos“:** Bildauswahl aus Disk/Fotos-Mediathek funktioniert wieder in Safari-/Dock-Web-App. Ursachen: zu stark versteckter File-Input (`pointer-events:none` / 1×1), enges `accept="image/*"`, ggf. `capture` auf dem Library-Pfad. Fix: aktivierbarer Input, breites `accept` inkl. HEIC/Erweiterungen, Library ohne `capture`, Fallback mit frischem Input im Tap-Gesture; Mehrfachauswahl wie Drag&Drop. Kamera bleibt / fällt auf Mac gracefully zurück.
- **Willkommen ohne Top-Chrome:** Auf dem Startbildschirm ist die gesamte Topbar inkl. Menü-Button ausgeblendet (kein schwebender Chrome).
- **Willkommen: kein Chrome bei Mausbewegung:** Viewer-Idle-/Mousemove-Einblendung greift nicht, solange Willkommen offen ist – erst nach Projekt öffnen/neu.
- **Editor-Werkzeug-Reihenfolge (rechts):** Vertikal teilen → Horizontal teilen → BEAK-Nr. → Text groß → Text klein → Rechteck → Kreis → Pfeil → danach Foto-Gruppe (Schieben/Drehen/Fotozwischenspeicher/Teleport) und Seite wie bisher.
- **Doppelklick → Dock-Web-App:** Der Mac-Opener öffnet `http://127.0.0.1:8765/?pending=1` in der Safari-Web-App **Anweisungen** im Dock (`open -a ~/Applications/Anweisungen.app`), nicht mehr im Standard-Browser. Dock-App muss von `http://127.0.0.1:8765/` starten (gleiche Origin für pending-API).
- **Service Worker:** Cache `anweisungen-shell-v1.65` und `?v=1.65`.

## Neu in 1.64
- **Finder / Doppelklick `.beak`:** Mac-Opener (Launch Services) stellt die Datei dem lokalen Server bereit und öffnet Anweisungen mit dem Projekt — kein leeres weißes Fenster mehr (Safari-Web-App ohne Dokument-Handler).
- **File Handling API:** Manifest `file_handlers` + `launchQueue` (Chrome-/Edge-PWA) und `?pending=1` für den Mac-Opener.
- **Service Worker:** Cache `anweisungen-shell-v1.64` und `?v=1.64`.

## Neu in 1.63

- **Editor-Topbar: eine Zeile wenn es passt:** Fertig bleibt neben den Edit-Tools, solange links+Tools+Fertig zusammen in die Breite passen. Die v1.61-`flex: 1 1 260px|380px`-Aufteilung (gleichmäßiges Wachstum) entfiel – sie ließ in der Mitte Lücke und zwängte Fertig trotzdem in die zweite Zeile. `.top-actions` ist jetzt `nowrap` (Tools+Fertig als Einheit); die gesamte Topbar wrappt erst bei echtem Platzmangel. Stückliste bleibt icon-only (1.62); Viewer-Compact (1.60) unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.63` und `?v=1.63`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.62

- **Editor-Stückliste icon-only:** Der Stückliste/PDF-Button zeigt im Editor immer nur das PDF-Symbol. Titel und ARIA-Beschriftung bleiben für Tooltip und Barrierefreiheit erhalten; im Viewer bleibt die Beschriftung sichtbar.
- **Wrap-Verhalten unverändert:** Die Editor-Topbar bricht weiterhin erst dann mehrzeilig um, wenn die verbleibenden Werkzeuge trotz des kompakteren Stückliste-Buttons nicht in eine Zeile passen.
- **Service Worker:** Cache `anweisungen-shell-v1.62` und `?v=1.62`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.61

- **Editor-Topbar bei Platzmangel mehrzeilig:** Wenn die Fensterbreite zu eng ist, um alle Editor-Buttons nebeneinander zu zeigen, umbrechen `.topbar` / `.top-left` / `.top-actions` / `.edit-tools` sauber auf **mehrere Zeilen** – keine Überlappung mehr. Bei ausreichend Breite bleibt die bisherige einzeilige Anordnung. Die Chrome-Hintergrundleiste (`.topbar::before`) wächst mit der gewrappten Höhe.
- **Viewer unverändert (1.60):** Bei Platzmangel weiter nur Icons (`viewer-chrome-compact`); Editor bevorzugt Umbruch mit vollen Labels.
- **Service Worker:** Cache `anweisungen-shell-v1.61` und `?v=1.61`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.60

- **Viewer Chrome bei Platzmangel nur Icons:** Wenn die schwebende Topbar in der Breite zu eng wird (niedrige Auflösung, geschrumpftes iPad-Fenster), werden die **Textlabels** der Viewer-Buttons ausgeblendet (Öffnen, Stückliste, Erste/Letzte Seite, Übersicht, Editor, Sichern) – **Icons bleiben**. Erkennung misst echte Cluster-Überlappung (links / Mitte / rechts) inkl. Hysterese; kein reiner Fix-Breakpoint. Klasse `#app.viewer-chrome-compact` nur im Lesemodus.
- **Editor unverändert:** Im Edit-Modus bleiben alle Beschriftungen wie bisher; Compact-Klasse greift nicht (`.edit-mode` schließt aus).
- **Service Worker:** Cache `anweisungen-shell-v1.60` und `?v=1.60`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.59

- **Anzeige gerätelokal (bestätigt):** Bildschirmfüllend vs. Fenster bleibt nur in `localStorage` (`anweisungen-display-mode`) – **pro Gerät**, nicht in der `.beak` / `project.json` / IDB-Projektpayload. Drawer-Häkchen und `fixStandaloneViewport` lesen denselben Key beim Start.
- **Menü offen → kein Chrome-Auto-Hide:** Solange Drawer/Menü-Backdrop `open` ist, läuft der Viewer-5s-Idle-Hide (`scheduleChromeIdleHide`) nicht; Timer wird bei `openMenu` gelöscht, Chrome eingeblendet. Nach `closeMenu` (Viewer, ohne Tour) startet der Idle-Timer wieder. Tour-Pause unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.59` und `?v=1.59`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.58

- **Tour Editor-Werkzeuge sichtbar:** Bei Tour-Schritten mit `mode: edit` (Formen, Text, Split, Foto-Werkzeuge, BEAK-Nr. usw.) wechselt die App vor dem Spotlight auf die **erste Layout-Seite** (nicht Index/Fehleranalyse). Leere Projekte starten sonst auf dem Index – dort sind `.layout-only-tool`-Buttons per CSS ausgeblendet, der Spotlight-Kreis blieb leer. Zusätzlich: Edit-Modus + Chrome ein, Idle-Timer pausiert; wenn `#editTools` noch `display:none`/Höhe 0 hat, einmal nachhärten. Stückliste/Menü-Schritte unverändert mit offenem Drawer.
- **Öffnen-Hinweis (kein Live-Sync):** Beim erfolgreichen `.beak`-Laden wird gerätelokal eine Inhalts-Signatur gemerkt (`savedAt` oder Hash von `project.json`). Öffnen derselben Datei mit abweichender Signatur → Nachfrage „Diese Datei unterscheidet sich vom Stand auf diesem Gerät…“ (Laden/Abbrechen). **Kein** Hintergrund-Polling, **kein** Push zwischen iPads.
- **Service Worker:** Cache `anweisungen-shell-v1.58` und `?v=1.58`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.57

- **Tour erweitert:** Zusätzliche Schritte zu Editor-Werkzeugen (Einstieg mit Rückgängig/Wiederholen/+ Fehler/Fertig, Formen, Text, Seite teilen, Foto-Werkzeuge, BEAK-Nr. & Seiten) und **BEAK Stückliste** im Menü (Hinzufügen/Aktualisieren, Anzeigen; Teileliste-PDF in der `.beak`-Datei). Sichtbarkeits-Prep von 1.56 bleibt; Menü-Schritt öffnet die Drawer-Sektion.
- **Willkommen:** Versionszeile unten auf dem Startbildschirm (`Anweisungen · Version …`), synchron zu Drawer/`APP_VERSION`.
- **Service Worker:** Cache `anweisungen-shell-v1.57` und `?v=1.57`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.56

- **Tour-Sichtbarkeit:** Beim Start der Tour (Willkommen oder Hilfe) werden Ziel-Buttons zuverlässig sichtbar: Willkommen wird ausgeblendet, bei Bedarf still ein leeres Projekt geöffnet, Floating-Chrome eingeblendet (kein `.chrome-hidden`), Viewer-5s-Auto-Hide pausiert. Editor-Schritt wechselt kurz in den Edit-Modus (Werkzeuge/Fotozwischenspeicher), Viewer-Schritte bleiben im Lesemodus. Spotlight erst nach Layout-Settle (Doppel-rAF); fehlende/`display:none`-Ziele → keine leere Markierung, nur Karte. Nach Fertig/Überspringen bleibt das (für die Tour geöffnete) leere Projekt bereit zum Arbeiten.
- **Service Worker:** Cache `anweisungen-shell-v1.56` und `?v=1.56`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.55

- **Willkommen:** Beim Start ohne wiederhergestelltes Dokument (und nach **Schließen**) erscheint ein Willkommensbildschirm: **Neues Projekt**, **Öffnen** (.beak), **Neu hier? Tour anzeigen**.
- **Geführte Tour:** Kurze Schritte zu Anweisungen/.beak, Datei Öffnen/Sichern, Viewer, Editor/Fotos/Fotozwischenspeicher, Anzeige Bildschirmfüllend vs Fenster, Home-Bildschirm-Tipp. Erneut über Willkommen oder Menü → Hilfe → **Tour anzeigen**. Flag `localStorage` `anweisungen-tour-done`.
- **Menü Datei (oben):** Öffnen, Sichern, Schließen. Schließen räumt den aktuellen Projektstand (inkl. IDB `current`) und zeigt wieder Willkommen; bei ungesicherten Änderungen Nachfrage. Sichern/Schließen ohne Dokument deaktiviert.
- **Service Worker:** Cache `anweisungen-shell-v1.55` und `?v=1.55`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.54

- **Greifpunkte (Resize):** Unsichtbare Hitbox der Eck-/Kanten-Handles auf **44×44 CSS-px** vergrößert (sichtbarer Knopf bleibt ~16px). Finger trifft die Ecken zuverlässiger; Seiten-Wischen startet nicht mehr so leicht von den Ecken aus (Handles gewinnen über Page-Drag, inkl. rect / Fotozwischenspeicher / Pfeil-Drehen).
- **Toolbar Foto-Gruppe:** **Fotozwischenspeicher** und **Teleport** tauschen die Plätze (Reihenfolge: Schieben → Drehen → Fotozwischenspeicher → Teleport). Icons/Verhalten unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.54` und `?v=1.54`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.53

- **Fotozwischenspeicher resize:** Nach dem Platzieren wie ein Rechteck per Eck-Handles vergrößer-/verkleinerbar. Nur Rahmen `x/y/w/h` ändert sich – Foto-Crop/Scale/Pan/Rot-Daten bleiben unverändert (CSS object-fit cover im neuen Kasten). Handles greifen auch bei aktivem „Foto schieben“/Teleport/Drehen (vorher haben diese Modi die Griffe abgefangen).
- **Tool-Icon:** Kamera im magenta-gestrichelten Ring leicht nach oben verschoben – optisch zentriert.
- **Service Worker:** Cache `anweisungen-shell-v1.53` und `?v=1.53`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.52

- **Fotozwischenspeicher-Icon:** Magenta-gestrichelter Ring etwas größer, Kamera leicht kleiner – mehr Luft zwischen Kamera und Rahmen („nicht so rangeklatscht“).
- **Bildschirmfüllend ≠ Fenster (iPad):** Fill (`stage-ipad-fill`) skaliert wieder per **Cover** (`Math.max(Breite, Höhe)`) innerhalb des inset-Viewports (`padding-top: --stage-top-inset` = Safe-Area oben). Unten bündig (`transform-origin: 0 100%`), edge-to-edge unter der Statusleiste – auf iPad mini klar füllender als Fenster. **Fenster** bleibt Contain/width-only mit Letterbox L/R (1.31). Keine Innen-Spacer in Index/Fehler. Keyboard-Avoid (1.36) unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.52` und `?v=1.52`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.51

- **Fotozwischenspeicher:** Platzierbarer Bereich (gestrichelt magenta `#dd007a` / `var(--accent)`, abgerundetes Quadrat) nur im **Editor**. Foto per **Kamera** oder **Teleport** hinein; im **Viewer** und in PDF/Thumbs **nicht sichtbar**. Inhalt wird im Projekt persistiert (`.beak` `photos/<id>.*` + `project.json`, IndexedDB).
- **Werkzeug:** Button in der Foto-Gruppe (neben Schieben/Drehen/Teleport) – Kamera in gestricheltem Magenta-Rahmen.
- **Service Worker:** Cache `anweisungen-shell-v1.51` und `?v=1.51`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.50

- **Canvas unter iPad-Statusleiste:** Im Modus **Bildschirmfüllend** (`stage-ipad-fill`) skaliert die logische Seite per **Contain** (`min(Breite, Höhe)`), unten bündig und horizontal zentriert – kein Cover-Schnitt mehr oben. Titel wie **Fehleranalyse** und das Projektnamen-Band auf Seite 1 liegen vollständig unter der opaken System-Statusleiste.
- **Letterbox außen, nicht innen:** Freiraum über/seitlich der skalierten Seite ist schwarz (Viewport/Stage); die dunklen Innen-Spacer (`.index-chrome-spacer` / `.fehler-chrome-spacer`) bleiben entfernt (wie 1.49). Optionaler Inset `--stage-top-inset` = `env(safe-area-inset-top)` am `#pageViewport`.
- **Fenster-Modus / Tastatur:** `stage-ipad-window` und Keyboard-Avoid (1.36) unverändert; Editor-/Viewer-Chrome, Last-Page, Thumbs, Labels unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.50` und `?v=1.50`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.49

- **Chrome nach Öffnen versteckt (Viewer):** Nach erfolgreichem Laden (`.beak`, IDB-Restore usw.) sind die Floating-Top-Buttons bereits ausgeblendet (`.chrome-hidden`). Tip auf leere Flächen blendet sie wieder ein (wie bisher).
- **Chrome Auto-Hide 5 s (nur Viewer):** Im Lesemodus verschwinden die Top-Buttons nach **5 Sekunden** ohne relevante Zeiger-Aktivität. Tip/Wischen/Mausbewegung, die Chrome zeigt oder aktiv hält, setzt den Timer zurück. **Editor:** Buttons bleiben **immer** sichtbar – kein Auto-Hide, kein Verstecken beim Öffnen im Edit-Modus.
- **Erste/Letzte Seite:** Beschriftungen **„Erste Seite“** / **„Letzte Seite“** wieder sichtbar (label-btn wie in 1.18).
- **Keine dunklen Spacer mehr:** `.index-chrome-spacer` (Seite 1) und `.fehler-chrome-spacer` (Fehleranalyse) entfernt. Magenta-Projektnamen-Band und orange Fehleranalyse-Leiste sitzen oben; die Tabellen (`.index-rows` / `.fehler-rows`) nutzen den freigewordenen Platz nach oben.
- **Service Worker:** Cache `anweisungen-shell-v1.49` und `?v=1.49`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.48

- **Letzte Seite merken (gerätelokal):** Beim Blättern speichert die App die aktuelle Seiten-ID pro Dokument in `localStorage` (`anweisungen-last-page`). Beim erneuten Öffnen derselben Datei (oder IDB-Wiederherstellung) springt sie dorthin – auch Tage später. **Nicht** in der `.beak`-Datei / `project.json` (nicht synchronisiert, nur dieses Gerät). Fehlt die Seite, bleibt es bei Seite 1.
- **Arbeitsschritte-Titelband:** Hintergrund der Projektnamen-Leiste (`.index-header`) = gleiche Farbe wie der Button **Sichern** (`var(--accent)` / `#dd007a`). Spacer darüber und kompakte Geometrie unverändert; Fehleranalyse-Orange unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.48` und `?v=1.48`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.47

- **Übersicht-Thumbs gespeichert:** Die kleinen Vorschau-Bilder der Übersicht werden im Projekt mitgeführt (`thumbs/<pageId>.jpg` im `.beak`, Einträge in `project.json` unter `thumbs`, Schema weiterhin Version **5**). Beim Öffnen erscheinen gültige Thumbs sofort; nur fehlende oder veraltete (Foto/Inhalt/Transform geändert) werden neu erzeugt. Auch der Browser-Speicher (IndexedDB) hält die Thumbs – zweites Öffnen der Übersicht ist damit schnell, auch ohne erneutes „Sichern“.
- **Service Worker:** Cache `anweisungen-shell-v1.47` und `?v=1.47`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.46

- **Arbeitsschritte-Titelband (Seite 1):** Projektname in kompakter Leiste (Padding `8px 12px 8px 16px`, Text vertikal zentriert, volle Breite). Farbe **`#2a2a2a`** (eine Stufe heller als bisher `#111111`). Darüber Chrome-Clearance als Spacer `.index-chrome-spacer` in **`#111111`** — gleiches Muster wie Fehleranalyse in 1.45.
- **Service Worker:** Cache `anweisungen-shell-v1.46` und `?v=1.46`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.45

- **Fehleranalyse-Titelband:** Die orange „Fehleranalyse“-Leiste bleibt vollbreit, ist aber kompakt hoch (Padding `8px 12px 8px 16px`, Text vertikal zentriert). Der Bereich darüber (Chrome-Clearance) nutzt das Dunkelgrau der Index-Kopfzeile `#111111` (`.index-header`), nicht mehr Orange.
- **Service Worker:** Cache `anweisungen-shell-v1.45` und `?v=1.45`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.44

- **Wischen von Kamera/Fotos:** Seitenwechsel per Horizontal-Wisch funktioniert auch, wenn die Geste auf den schwebenden **Kamera**- oder **Fotos**-Buttons beginnt (wie bei Index-/Fehler-Zeilen und Annotationen). Kurzer Tip öffnet weiter Kamera bzw. Fotos-Auswahl; `pointerdown`-`stopPropagation` auf diesen Controls ist entfernt.
- **Chrome-Toggle auf leeren Tabellenflächen:** Tip auf **leere** Index-Zeilen (Arbeitsschritte) oder **leere** Fehlerzeilen toggelt die Floating-Buttons (`.chrome-hidden`), wie Tip auf leeren Foto-Hintergrund. Gefüllte/navigierbare Zeilen, Eingabefelder und echte Controls bleiben unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.44` und `?v=1.44`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.43

- **Chrome-Bar:** Der durchgehende `.topbar::before`-Balken verwendet weiterhin `rgba(80, 80, 80, 0.48)`, der Weichzeichner ist moderat von `blur(12px)` auf `blur(8px)` reduziert. Stacking, Fade und alle übrigen Eigenschaften bleiben unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.43` und `?v=1.43`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.42

- **Chrome-Bar heller:** Der durchgehende `.topbar::before`-Balken verwendet jetzt `rgba(80, 80, 80, 0.48)` statt reinem Schwarz. Transparenz (`alpha 0.48`), Weichzeichner (`blur(12px)`), Stacking und Fade mit `.chrome-hidden` bleiben unverändert.
- **Service Worker:** Cache `anweisungen-shell-v1.42` und `?v=1.42`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.41

- **Chrome-Backdrop Stacking:** Der volle Topbar-Balken (`.topbar::before`) liegt jetzt **immer hinter allen** Chrome-Buttons (links, Mitte, rechts). Explizites Stacking: Bar `z-index: 0`, Cluster `.top-left` / `.top-actions` / `.top-center` (u. a.) `position` + `z-index ≥ 1`.
- **Service Worker:** Cache `anweisungen-shell-v1.41` und `?v=1.41`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.40

- **Chrome-Backdrop (volle Breite):** Statt kleiner gerundeter Panels hinter den Button-Clustern liegt jetzt ein **durchgehender Balken** über die volle Breite hinter der schwebenden Topbar. Gleiche Transparenz `rgba(0,0,0,0.48)` plus **Weichzeichner** (`backdrop-filter: blur(12px)`). Fadet weiter mit `.chrome-hidden`.
- **Service Worker:** Cache `anweisungen-shell-v1.40` und `?v=1.40`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.39

- **Tastatur nach Platzieren (iPad):** Nach dem Setzen eines **Buttons** oder **Info**-Feldes öffnet sich die Tastatur sofort (Focus auf dem editierbaren Label im gleichen Tip-Gesture; kein zweiter Tip nötig). Info: Label umbenennen – Popup/„Öffnen“ bleibt separat.
- **Chrome-Backdrop:** Hinter den schwebenden Toolbar-Clustern liegt ein halbtransparentes dunkles Panel, das mit den Buttons ein-/ausfadet (`.chrome-hidden`).
- **Service Worker:** Cache `anweisungen-shell-v1.39` und `?v=1.39`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.38

- **Info „Öffnen“:** Im Edit-Modus erscheint unter dem blauen Info-Button ein kompaktes **Öffnen** (statt „Infos eingeben“). Tip öffnet das Info-Popup; der Inhalt wird dort per `contentEditable` bearbeitet. View-Modus unverändert: Tip auf den Info-Button öffnet das Popup read-only.
- **Service Worker:** Cache `anweisungen-shell-v1.38` und `?v=1.38`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.37

- **Index-Kopf:** Der Hintergrund des `.index-header` ist jetzt nahezu schwarz (`#111111`).
- **Info-Popup:** Das Popup nutzt 85 % Breite/Höhe und `rgba(74, 158, 255, 0.9)`.
- **Menü:** Die Abschnittsüberschrift „Ansicht“ wurde entfernt; der Vollbild-Button bleibt erhalten.
- **Hilfe:** „Lokal / Offline“ ist im Menü als standardmäßig zugeklappte `details`/`summary`-Hilfe umgesetzt.
- **Service Worker:** Cache `anweisungen-shell-v1.37` und `?v=1.37`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.36

- **Info-Unterfeld:** Im Edit-Modus erscheint unter dem blauen Info-Button ein Textfeld (`Infos eingeben`) – gleiches Muster wie die Zielseite bei Buttons. Schnellbearbeitung von `infoText`; Popup bleibt möglich.
- **Tastatur iPad (Fill + Fenster):** Während der Eingabe wird `--app-h`/`--app-w` nicht mehr aus dem geschrumpften `visualViewport` neu berechnet (Layout eingefroren). Die Seite verschiebt sich nur per `updateKbAvoid` (translateY), damit das fokussierte Feld über der Tastatur sichtbar bleibt – nicht mehr unten bündig an die Tastatur gedrängt / gestaucht.
- **Service Worker:** Cache `anweisungen-shell-v1.36` und `?v=1.36`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.35

- **Index-Kopf:** Der Dateiname im `.index-header` nutzt jetzt das dunklere Tabellengrau `#333333` statt Schwarz; Text bleibt weiß.
- **Service Worker:** Cache `anweisungen-shell-v1.35` und `?v=1.35`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.34

- **+ Info:** Neuer Annotationstyp `info` (Toolbar „+ Info“ neben „+ Button“). Sieht aus wie ein Button; Tip öffnet ein blaues Info-Popup (~70 % der Stage). View: Text lesen/schließen; Edit: `infoText` bearbeiten. Keine Zielseite. Projektformat bleibt Version 5 (additiv `infoText`).
- **Seitenanzeige:** `#pageIndicator` sitzt unten mittig über der Stage (nicht mehr in der Topbar) und fadet mit `chrome-hidden`.
- **Übersicht:** Dialogtitel `Übersicht - {Projektdatei}` wenn geladen; erste Miniatur-Beschriftung immer „Arbeitsschritte“.
- **Service Worker:** Cache `anweisungen-shell-v1.34` und `?v=1.34`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.33

- **View-Mode-Tap:** Ein Tap auf eine leere Anzeige-Fläche toggelt die Floating-Buttons (aus/ein); interaktive Ziele und Edit-Mode bleiben unverändert.
- **Fehleranalyse-Wischen:** Die `.fehler-rows`-Pointerdown-Sperren in Panel und Embed sind entfernt. View-Mode-Tap-vs.-Swipe über `.fehler-row-nav` bleibt aktiv; Edit-Mode-Eingabefelder behalten ihr `pointerdown`-StopPropagation.
- **Service Worker:** Cache `anweisungen-shell-v1.33` und `?v=1.33`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.31

- **Anzeige-Menü:** Neuer Drawer-Abschnitt **Anzeige** (neben Ansicht) mit zwei Modi:
  - **Bildschirmfüllend** (Standard) – bisheriges iPad-Standalone-Verhalten (`stage-ipad-fill`, Cover, unten bündig, ggf. Schnitt oben).
  - **Fenster** – Seite oben und unten bündig im Inhaltsbereich, keine Beschneidung; auf schmaleren/höheren Displays (z. B. iPad mini) schwarze Balken links/rechts (`stage-ipad-window`, Höhe 100 %, Breite aus Aspect 1180/820, horizontal zentriert; Scale width-only).
- **Persistenz:** `localStorage` Key `anweisungen-display-mode` = `fill` | `window` (nicht Teil der `.beak`-Projektdatei). Auf Desktop speicherbar für den nächsten iPad-Start; Layout-Klassen nur im iPad-Standalone.
- **Unverändert aus 1.30:** Floating-Toolbar, Statusleiste `black`, Wischen von Controls, letzte-Seite-Wisch, Stückliste „Hinzufügen/Aktualisieren“, ZIP nur auf Anfrage.
- **Service Worker:** Cache `anweisungen-shell-v1.31` und `?v=1.31`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.30

- **Menü:** Drawer-Button unter BEAK Stückliste heißt jetzt **Hinzufügen/Aktualisieren** (Hinweistexte entsprechend).
- **Wischen von Controls (Ansicht):** Fingerstart auf Index-Hyperlink, BEAK-Nr./Button (`.ann`) oder Fehlerzeile blockiert den Seitenwechsel nicht mehr. Gleicher Tap-vs-Swipe-Pfad wie `.fehler-row-nav` (`trackDrag` + `tapDist < 16` / `trackDragDidPageSwipe`). Edit-Mode blockiert weiter Tippen/Ziehen in Tabellen und Annotationen.
- **Unverändert aus 1.29:** Index/Fehler/Embed-Flush, Floating-Toolbar, Statusleiste `black`, Cover, Wisch-Fixes. Keine CSS-Änderung an `.with-fehler-embed` / `.stage-inner`.
- **Service Worker:** Cache `anweisungen-shell-v1.30` und `?v=1.30`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.29

- **Index/Fehler bis zur Unterkante:** Im `stage-ipad-fill`-Modus entfällt das interne Safe-Area-Bottom-Padding; Index- und Fehlerzeilen füllen die Stage wie Layout-Seiten bis zum unteren Displayrand. Auch Layout-Seiten mit eingebettetem Fehleranalyse-Panel (`.stage-inner.with-fehler-embed`) bleiben bottom-aligned und füllen bis zur Stage-Kante. Die bestehende Flex-Füllung (`.index-rows`/`.index-row` und `.fehler-rows`/`.fehler-row`) bleibt aktiv.
- **Unverändert aus 1.26–1.28:** schwebende Toolbar, opake schwarze Statusleiste, Cover-Füllung, Schärfe und Wisch-Fixes. Kein externes `.page-slide`-Padding.
- **Service Worker:** Cache `anweisungen-shell-v1.29` und `?v=1.29`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.28

- **Schwebende Toolbar wieder da:** `.topbar` ist wieder `position: absolute`-Overlay (transparent, `pointer-events: none` auf der Leiste, `auto` auf Buttons) – kein solider schwarzer Chrome-Streifen mehr. Seite (`#pageViewport` / `.page`) füllt wieder die volle App-Höhe; Topbar nimmt keinen Flex-Platz. `--chrome-clearance` wieder für Index-/Fehler-Titel unter den Buttons (`~8px + 36px`, inkl. Safe-Area falls nötig). `.top-center` absolut zentriert per `left/right: 0` + `margin: auto` + `width: max-content` (kein `translate(-50%)`). `.chrome-hidden` fadet nur Button-Opacity; Bar bleibt transparent/floating.
- **Unverändert aus 1.26/1.27:** opake Statusleiste `black` (Schärfe), Cover unten bündig (`stage-ipad-fill`), Wisch-Fixes letzte→vorletzte Seite. **Nicht** zurück auf `black-translucent`.
- **Service Worker:** Cache `anweisungen-shell-v1.28` und `?v=1.28`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.27

- **Wischen letzte→vorletzte Seite (Fehleranalyse):** Achsen-Upgrade wenn die Geste erst vertikal gelockt war und dann klar horizontal wird; Pointer-up-Fallback ohne `axis==='h'`; leichterer Commit-Schwellenwert von der letzten Seite zurück (`~22%` Viewport) und etwas längeres Velocity-Fenster (`idleMs` 120). Horizontale Bias auf der Fehlerseite verstärkt (`hBias` 0.6).
- **Unverändert aus 1.26:** opake Statusleiste `black`, Cover unten bündig (`stage-ipad-fill`).
- **Service Worker:** Cache `anweisungen-shell-v1.27` und `?v=1.27`. **Home-Bildschirm-Icon löschen und neu anlegen**, Cache leeren.

## Neu in 1.26

- **Opake Statusleiste:** `apple-mobile-web-app-status-bar-style` von `black-translucent` auf **`black`** – iOS legt keine frosted/translucente Statusleiste mehr über die Toolbar (schärfere Icons). Web-Inhalt startet unter der Statusleiste; Topbar bleibt solide `#000` mit sensiblem `padding-top: 8px` (kein doppeltes Safe-Area-Band). Kein `backdrop-filter`/`filter`/`text-shadow`/`translate` an Topbar/Buttons; `-webkit-font-smoothing: subpixel-antialiased` statt `antialiased`.
- **Unten bündig (Cover):** Im `stage-ipad-fill`-Modus füllt `.stage` den Page-Viewport (`width/height: 100%`, kein Aspect-Zwang). `.stage-inner` ist unten links verankert (`bottom: 0`, `transform-origin: 0 100%`); `updatePageScale()` skaliert per **Cover** `max(stageW/refW, stageH/refH)` – Overflow oben. Kein externes `padding-bottom` auf `.page-slide`. `fixStandaloneViewport` bevorzugt `visualViewport` und setzt `--app-h` nicht größer als die sichtbare Fläche.
- **Service Worker:** Cache `anweisungen-shell-v1.26` und `?v=1.26`. **Home-Bildschirm-Icon löschen und neu anlegen** (Meta status-bar-style gilt nur für neu hinzugefügte Icons).

## Neu in 1.25

- **Solide Top-Chrome:** Die Toolbar ist keine schwebende Overlay-Leiste mehr, sondern eine eigene Flex-Zeile unter der Statusleiste mit immer deckendem schwarzem Hintergrund (`#000`). Beim Wisch-Fade bleiben nur die Buttons transparent – der schwarze Streifen bleibt. Zentrierung der Mitte per Flex-Seitenspalten (kein `absolute`/`translate`), Safe-Area steckt in der Chrome selbst (kein doppelter `::before`-Streifen).
- **Seitenfläche darunter:** `#pageViewport` füllt den Rest unter der Topbar (`flex: 1`). Index-/Fehler-Titel brauchen kein großes Floating-Clearance mehr. iPad-Fill bleibt unten bündig (`align-items: flex-end`), ohne externes `padding-bottom` auf `.page-slide`.
- **Service Worker:** Cache `anweisungen-shell-v1.25` und `?v=1.25`.

## Neu in 1.24

- **iPad unten bündig:** Externes `padding-bottom` auf `.page-slide` entfernt – Layout-Fotoseiten wieder kantenbündig, kein schwarzer Balken über dem Home-Indikator. Index-/Fehlerseiten (und Fehler-Embed) haben nur noch **internes** Safe-Area-Padding mit eigenem dunklem Seitenhintergrund.
- **Toolbar scharf (iPad):** Chrome-Fade nur noch per Opacity (kein `transform`/`translateY`); kein `translate3d`/`translateZ` an Topbar/Buttons; kein `filter: none` auf `.topbar *`; kein `blur(0px)`. Topbar auf `stage-ipad-fill` mit solidem `#000`-Hintergrund. Frühe `.top-center`-Zentrierung per `translate(-50%)` entfernt.
- **Service Worker:** Cache `anweisungen-shell-v1.24` und versionierte Shell-URLs (`?v=1.24`), damit iPad nicht alte CSS aus dem Cache lädt.

## Neu in 1.23

- **iPad Home-Indikator:** Im Standalone-Modus (`stage-ipad-fill`) hebt ein unteres Safe-Area-Padding (`max(safe-area, 28px)`) die Bühne an, damit die letzte Index-/Fehlerzeile (von 25) vollständig über dem schwarzen Home-Indikator sichtbar ist.
- **Tastatur-Ausweich:** Beim Tippen in unteren Index-Feldern wird `#pageViewport` per `visualViewport` nach oben verschoben (`translateY`) – ohne `scrollIntoView`, damit die horizontale Seitenbahn intakt bleibt. Nach Blur wird der Versatz zurückgesetzt.
- **iPad Toolbar scharf:** Solider Statusleisten-Streifen (`#000`), voll deckende Topbar-Buttons, eigene Compositing-Ebene (`translate3d`/`isolation`), kein `text-shadow`/Blur; `--app-w`/`--app-h` auf ganze Pixel gerundet.

## Neu in 1.22

- **PC vs. iPad Layout:** Am Desktop (z. B. 16:9) wird die Seite wieder vollständig eingepasst (Höhe füllen, zentriert) – kein starkes Abschneiden oben. Der randfüllende Modus (Breite voll, unten bündig, Überstand nur oben unter der Statusleiste) gilt nur noch für die **iPad-Home-Bildschirm-App**.

## Neu in 1.21

- **Kamera / Fotos halbtransparent:** Die Segment-Buttons über Fotozellen sind leicht durchsichtig, damit das Bild darunter erkennbar bleibt. „Auslösen“ bleibt klarer lesbar.

## Neu in 1.20

- **iPad Vollbild-Korrektur:** Stage füllt die **Viewport-Breite** (Höhe aus Aspect-Ratio); Unterkante bündig (`flex-end`), Überstand nur oben unter der Statusleiste – keine schwarzen Ränder links/rechts/unten, letzte Tabellenzeile vollständig. Meta weiter `black-translucent`. Aufbau auf v1.19.
- **Index-Titel = Dateiname:** Beim Öffnen einer `.beak` erscheint der Dateiname ohne Endung als Titel über der Index-Tabelle (editierbar im Editor).
- **Index-Tabellentext:** Arbeitsschritt-Zeilen und Nr. etwas größer und **fett**, damit die Liste besser lesbar ist (Export/Übersicht angepasst).

## Neu in 1.19

- **iPad Vollbild / keine Letterbox:** Die Home-Bildschirm-App setzt Höhe und Breite aggressiv aus `screen` bzw. `visualViewport` (Gap-Limit 60 px entfernt). Die Seite zeichnet bewusst unter die Statusleiste (`black-translucent`), damit die **gesamte** Fehler-/Index-Tabelle sichtbar ist – auch die letzte Zeile. Schwarze Ränder links/rechts/unten entfallen; die System-Statusleiste bleibt schwarz oben drauf. `padding-bottom` am Viewport (Safe-Area) entfernt, weil es Letterboxing erzeugte. **Home-Bildschirm-App einmal löschen und neu anlegen**, damit iPadOS Meta/CSS übernimmt.
- **Erste/Letzte Seite nur als Symbol** in der Lesemodus-Toolbar (wie andere Icon-Buttons).
- **Übersicht: korrekte Schriftgrößen** – Miniaturen kommen wieder aus dem echten Seiten-DOM (`renderPageViaDom` wie PDF-Export), gerastert als ~440 px JPEG; Cache/`bumpThumbCache` bleiben.
- **Wischen letzte → vorletzte Seite:** Vertikale Achse nullt `trackDrag` nicht mehr; auf der Fehlerseite gewinnt die horizontale Achse früher. `touch-action: none` auf Fehler-Tabelle.
- **Fehler-Hyperlinks:** Tap-Toleranz ~16 px; zusätzlich `click`-Backup auf `.fehler-row-nav`, falls iPad Mini-Bewegung als Drag wertet.
- **iPad „Öffnen“:** `accept` bleibt gesetzt (ZIP/JSON/octet-stream/…), damit sofort der Dateien-Picker erscheint statt Foto/Kamera-Menü. `.beak` ggf. über „Alle Dateien“/ZIP wählbar; Inhalt per `sniffProjectFile`.
- **Editor: Kamera/Fotos als Icons** (Kamera-Symbol bzw. Ordner wie „Öffnen“).
- **Toolbar soft-fade:** Beim horizontalen Wischen im Lesemodus fadert die Toolbar sanft aus (~220 ms); bei Klick oder Mausbewegung wieder ein (~180 ms ease-out), kein hartes Ein-/Ausblenden.

## Neu in 1.18

- **Mac: geöffnete Datei überschreiben:** Mit File System Access (Chrome/Edge) wird die geöffnete `.beak` beim Sichern direkt überschrieben – kein neuer Save-Dialog und kein Download in den Downloads-Ordner. Nach „Speichern unter“ merkt die App den neuen Handle. Ohne Handle (z. B. Safari): klarer Hinweis „Als neue Datei gesichert (Browser kann die Originaldatei nicht überschreiben)“.
- **iPad: scharfe Toolbar oben:** Solider schwarzer Streifen unter der Statusleiste statt Milchglas/Blur; weiterhin kein `backdrop-filter` in der Toolbar.
- **Fehleranalyse: Wischen über der Tabelle:** Horizontales Wischen wechselt die Seite; kurzer Tap springt weiter zur Quellseite.
- **iPad: letzte Zeile vollständig sichtbar:** Safe-Area unten am Viewport berücksichtigt, damit Index-/Fehlerzeilen nicht unter dem Home-Indikator abgeschnitten werden.
- **Übersicht ohne Crash:** Miniaturen sind gecachte Low-Res-JPEGs (~400 px), asynchron mit Pausen erzeugt – kein Full-DOM-Klon mehr. Cache wird bei Dokumentänderungen verworfen; Fehler zeigen einen Toast statt Absturz.
- **Wirklich lokal / Offline:** Kurzer Hinweis im Menü und in der README. Service Worker cached die App-Shell (HTML/CSS/JS/Vendor/Icons); `.beak`-Projekte werden nicht gecacht. Kein Backend nötig.
- **Übersicht: Index-/Fehlertexte linksbündig** wie auf der echten Seite (Canvas-Thumbs).
- **Toolbar Lesemodus:** „Öffnen“ und „Stückliste“ getauscht; neu **Erste Seite** links und **Letzte Seite** rechts von „Übersicht“.
- **Öffnen startet auf Seite 1:** Gespeicherter `pageIndex` wird beim Laden ignoriert.
- **Erster BEAK-Tipp schneller:** pdf.js und Stücklisten-Parser werden nach Laden/Start im Hintergrund vorbereitet.
- **Menü-Button auch im Lesemodus:** Editor-only-Einträge (Stückliste hinzufügen, PDF-Export) bleiben dort ausgeblendet.

## Neu in 1.17

- **Keine verlorenen Fotos mehr („Speicher voll“):** Bisher lag die Browser-Sicherung im kleinen localStorage (~5 MB). War der voll, wurde sie still ohne Fotos geschrieben, und die Stückliste wurde dort nie gespeichert. Nach einem Neustart der Home-Bildschirm-App fehlten deshalb Fotos und Stückliste. Jetzt speichert die App automatisch (etwa 1 s nach jeder Änderung und beim Wechsel in den Hintergrund) in IndexedDB, und zwar Fotos und PDF als Binärdaten (Blobs) statt Base64. Das Schreiben ist atomar: Scheitert es, bleibt der letzte gute Stand vollständig erhalten. Die geöffnete App verliert nie etwas. Stattdessen erscheint eine rote Warnung, und „Sichern“ bekommt einen roten Rand mit „!“, bis wieder gespeichert werden kann. Beim Start bittet die App um dauerhaften Speicher (`navigator.storage.persist()`).
- **Große Fotos werden beim Einfügen verkleinert:** Aus der Kamera, der Fotos-Auswahl oder per Drag & Drop wird ein Foto mit langer Kante über 2500 px oder über 4 MB auf 2500 px verkleinert (JPEG-Qualität 0,85). Kleinere Fotos bleiben unverändert im Original. Fotos in bereits gesicherten Projekten bleiben unangetastet.
- **Gleiche Proportionen auf jedem Gerät:** Der Seiteninhalt wird in einer festen logischen Seite (1156 × 803 px) gelayoutet und als Ganzes auf die Bildschirmgröße skaliert. Das betrifft Schriften, Text- und BEAK-Kästen, Linien, Pfeile, Rahmen, Zellränder und Griffe. So sieht eine Seite auf iPad, Windows und Mac bei jeder Auflösung und Pixeldichte gleich aus. Die Referenz ist Bernds Mac-Darstellung (BEAK-Label ≈ 3 % der Seitenbreite hoch). Alte Projekte bleiben kompatibel, weil ihre Positionen und Größen schon relativ gespeichert sind. Die Toolbar bleibt in Bildschirmgröße.
- **iPad-Home-Bildschirm-App füllt den Bildschirm:** Meldet iPadOS eine um die Statusleiste zu kleine Höhe, setzt die App die volle Bildschirmhöhe. Damit verschwinden der schwarze Streifen unten und die Balken links und rechts.
- **iPad: Buttons oben wieder scharf:** Die halbtransparente Abdunklung im Statusleisten-Streifen ist entfernt. Die mittlere Toolbar-Gruppe wird ohne `translate(-50%)` zentriert, und es gibt garantiert keinen Weichzeichner (`backdrop-filter`) in der Toolbar.
- **Flüssigeres Wischen:** Pro Bildschirmbild wird höchstens eine Verschiebung geschrieben. Nur die aktuelle Seite und ihre Nachbarn werden voll gerendert. Fotos werden asynchron dekodiert.
- **Mac/Windows ohne pinke Titelleiste:** `theme-color` ist jetzt Schwarz. Die installierte Chrome/Edge-App nutzt „Window Controls Overlay“: Die Seite reicht bis an den oberen Rand, und die Toolbar sitzt unter den Fenstertasten. Ein schmaler Streifen oben verschiebt das Fenster.
- **BEAK-Nr.: Hand-Cursor** beim Überfahren, wie bei den Fehleranalyse-Einträgen.
- **Stückliste-Ansicht auf dem iPad:** PDF und Abgleich-Liste scrollen nativ mit Schwung (vorher blockierte `touch-action: none` an html/body). Die PDF-Seiten werden nacheinander mit Pausen gerendert, und jede Canvas bleibt unter 16 MP.
- **Toolbar kommt bei Mausbewegung zurück:** Nach dem Wischen ausgeblendet, erscheint sie bei jeder Mausbewegung wieder (Touch ausgenommen).
- **Übersicht ohne Überlappung:** Spalten und Zeilen werden so berechnet, dass alle Miniaturen vollständig und so groß wie möglich sichtbar sind. Gescrollt wird nur, wenn sie sonst unter 64 px schrumpfen würden.

## Neu in 1.16

- **iPad: .beak-Dateien lassen sich wieder öffnen:** iOS/iPadOS kennt die Endung `.beak` nicht und hat solche Dateien im Dateien-Dialog ausgegraut. Auf iPad/iPhone (auch iPad mit Desktop-Safari-Kennung „Macintosh“ + Touch) hat „Öffnen“ jetzt keinen Dateifilter mehr, jede Datei ist wählbar. Auf Windows/Mac bleibt der Filter (neu auch `.zip` und `.json`).
- **Prüfung am Inhalt statt an der Endung:** Eine Projektdatei wird an der ZIP-Signatur (`PK`) und an `project.json` erkannt. Deshalb öffnen auch `Anweisungen.beak.zip`, `Anweisungen.zip`, Dateien ohne Endung, ein ZIP mit dem Projekt in einem Unterordner sowie die alten Formate `.plan`/`.beakplan` (ZIP) und JSON-Projektstände. Falsche Dateien werden mit der roten Meldung „Keine Anweisungen-Projektdatei“ abgelehnt (mit Zusatz, z. B. „project.json fehlt“ oder „Datei ist leer“). Das offene Projekt bleibt dabei unverändert.
- **Speichern bleibt `.beak`:** Nach dem Öffnen einer umbenannten Datei (z. B. `Anweisungen.beak.zip`) speichert „Sichern“ wieder als `Anweisungen.beak`. Auf dem iPad geht „Sichern“ wie bisher über das Teilen-Menü („In Dateien sichern“). Die Datei heißt `….beak` und wird jetzt mit neutralem Dateityp übergeben, damit iOS keine „.zip“-Endung anhängt. Falls iOS doch umbenennt (`….beak.zip`), lässt sich die Datei trotzdem direkt öffnen. Nicht auf einem echten iPad geprüft, nur in WebKit mit iPad-Emulation.

## Neu in 1.15

- **Abgleich: „Nicht in der Stückliste“:** In der Stückliste-Ansicht steht unter der normalen Abgleich-Liste ein eigener, rot markierter Abschnitt. Er zeigt BEAK-Nr.-Markierungen, deren Nummer zu keiner EDV-Nr. der Stückliste passt, mit Nummer, platzierter Gesamtmenge (z. B. `4×`) und Seite(n) (z. B. „Seiten 2, 3“). Sortiert ist er aufsteigend nach Nummer wie die Hauptliste. Verglichen wird genauso wie beim Abgleich (nur Ziffern zählen), `101018` und `101.018` gelten also als gleich.
- **Antippen springt zur Markierung:** Ein Eintrag schließt die Ansicht, springt zur (ersten) Seite mit dieser Nummer und lässt die Markierung kurz rot aufleuchten. Das funktioniert im Lese- und im Editormodus.
- **Alles passt:** Passen alle Nummern, steht dort nur die kleine grüne Zeile „✓ Alle Nummern passen zur Stückliste“. Ohne Markierungen entfällt der Abschnitt.
- **Live:** Abschnitt und Abgleich aktualisieren sich bei jeder Änderung der Markierungen (auch nach Rückgängig/Wiederholen oder dem Löschen einer Seite).
- **Toolbar mit Symbol + Text:** „Stückliste“ (PDF-Symbol, beide Modi), „Öffnen“ (Ordner), „Editor“ (Stift) und „Sichern“ (Download-Symbol) zeigen jetzt Symbol und Beschriftung in einheitlicher Höhe. Auf schmalen Bildschirmen unter 1100 px Breite (z. B. 1024×768) zeigt der Stückliste-Knopf im Editor nur das Symbol (Tooltip bleibt), damit die Editor-Toolbar einzeilig bleibt. Im Lesemodus bleibt die Beschriftung immer sichtbar.
- **Kleiner Fix:** Wird eine Markierung sehr schnell nach der Eingabe der vorherigen gesetzt, sind das jetzt zwei getrennte Rückgängig-Schritte.

## Neu in 1.14

- **BEAK-Nr. ohne Menge:** Bei Menge 1 genügt die Nummer, z. B. `101.018` oder `101018`. Fehlt die Menge, gilt sie als 1.
- **Anzeige:** Eine Markierung mit Menge 1 zeigt nur die Nummer (`101.018`), ohne „1x “. Ab Menge 2 bleibt die Anzeige „Nx “ (z. B. `3x 101.018`). Das gilt auch für bestehende Projekte: ein gespeichertes `1x 101.018` erscheint beim Öffnen als `101.018`. So erscheint es auch in Lesemodus, Übersicht und PDF-Export.
- **Eingabe:** Eine neue Markierung startet mit leerem Feld und grauem Platzhalter `101.018`. Darunter steht der Hinweis „Nummer eingeben, z. B. 101.018 · Menge optional: 3x 101.018 (ohne = 1)“. Akzeptiert werden `101.018`, `101018`, `1x 101.018`, `3x 101.018`, `3 x 101.018`, `3x101018` und `3×101.018`. Weiterhin funktioniert der iPad-Ablauf mit Zahlentastatur: Menge (1–3 Ziffern) → Enter → Nummer → Enter. Leertaste, „x“ oder „*“ setzen den Mengen-Trenner einmal. Regel ohne „x“: Eine Eingabe mit Punkt oder mindestens 4 Ziffern ist eine Nummer, 1–3 Ziffern sind nur eine neue Menge. Wer eine Markierung ohne Eingabe verlässt, ändert nichts. Beim erneuten Bearbeiten steht bei Menge 1 nur die Nummer im Feld, sonst `3x101018`.
- **Stückliste-Abgleich:** Markierungen ohne Menge zählen als 1 bei „Platziert“ (geprüft mit der Beispiel-Stückliste: Nummer allein → 1 = Bedarf 1; zweimal Nummer allein → 2 = Bedarf 2; `4x …` → 4 = Bedarf 4, alle grün).
- In der .beak wird die Menge weiterhin als `qty` gespeichert (1 bei fehlender Menge). Ältere App-Versionen können die Dateien also weiter öffnen.

## Neu in 1.13

- **Pfeil-Werkzeug:** Die Formgruppe ist jetzt eine Dreiergruppe **Rechteck | Kreis | Pfeil**. Solange der Pfeil aktiv oder ein Pfeil ausgewählt ist, erscheint neben der Farbleiste eine Leiste für die **Pfeilart**: gerade, offener Bogen oder Kurve. Die zuletzt gewählte Art bleibt für die Sitzung erhalten.
- **Pfeile bearbeiten:** Pfeile lassen sich verschieben, an den Ecken skalieren und **drehen**. Gedreht wird am runden Griff unten in der Mitte oder mit zwei Fingern; die Drehung rastet in 15°-Schritten ein (±4°). Löschen geht mit ✕ oder der Entf-Taste. Farbe und Art des ausgewählten Pfeils lassen sich nachträglich ändern. Pfeile werden in der .beak gespeichert und in Ansicht, Übersicht und PDF-Export dargestellt.
- **Foto drehen:** Die Fotogruppe ist jetzt **Foto schieben | Drehen | Teleport**. Jeder Tipp auf ein Foto dreht es um 90° im Uhrzeigersinn. Das Foto füllt die Zelle weiterhin; Zoom bleibt erhalten, die Verschiebung wird zentriert. Die Drehung wird gespeichert und überall dargestellt, auch im Export. Es ist immer nur ein Foto-Werkzeug aktiv.
- **Teleport tauscht Fotos:** Wird ein Foto auf eine Zelle teleportiert, die schon ein Foto enthält, tauschen die beiden Fotos ohne Rückfrage die Plätze. Zoom, Verschiebung und Drehung wandern jeweils mit. Auf eine leere Zelle wird das Foto wie bisher verschoben.
- **Rückgängig | Wiederholen:** Zwischen PDF-Knopf und „+ Fehler“ gibt es zwei neue Knöpfe. Sie machen alle Bearbeitungen rückgängig oder stellen sie wieder her: Fotos (einfügen, ersetzen, verschieben, zoomen, drehen, teleportieren, tauschen), Teilungen, Markierungen, Texte, Seiten, Fehleranalyse und Stückliste. Gespeichert werden bis zu 50 Schritte. Die Knöpfe sind ausgegraut, wenn es nichts rückgängig zu machen bzw. wiederherzustellen gibt. Tastenkürzel: **Strg/Cmd+Z** (rückgängig), **Strg+Y** oder **Strg/Cmd+Umschalt+Z** (wiederholen). Beim Tippen in einem Textfeld gelten die Kürzel nur für dieses Feld. Nach dem Öffnen eines Projekts beginnt der Verlauf neu.
- **Stückliste in der .beak:** Eine geladene Stückliste (PDF) wird in der .beak mitgespeichert und beim Öffnen automatisch wiederhergestellt (jetzt durch einen Test abgesichert).
- **Kein Titel mehr in der Kopfleiste:** Der Schriftzug „Anweisungen“ oben links entfällt in allen Modi; es bleibt nur die Seitenanzeige (z. B. „2 / 3“). Dadurch bleibt die Editor-Toolbar auch bei 1024 px Breite einzeilig.
- **„Laden“ heißt jetzt „Öffnen“:** Der Knopf im Lesemodus ist jetzt ein Symbolknopf mit geöffnetem Ordner (Tooltip „Öffnen“), im Stil des PDF-Knopfs. Die Funktion ist unverändert (.beak-Projekt öffnen). Auch die Meldungen heißen jetzt „Geöffnet: …“ bzw. „Öffnen fehlgeschlagen …“. „Sichern“ bleibt als Textknopf rechts neben „Editor“.

## Neu in 1.12

- **Bilder per Drag & Drop in Zellen (Editor):** Bilddatei aus dem Windows-Explorer/Desktop, dem macOS-Finder oder auf dem iPad (Dateien/Fotos → Safari) auf eine Fotozelle ziehen. Das Bild wird genauso verarbeitet und gespeichert wie über „Kamera/Fotos“. Beim Ziehen wird die Zelle unter dem Zeiger magenta gestrichelt hervorgehoben („Bild hier ablegen“; bei vorhandenem Foto „Foto ersetzen“). Ein vorhandenes Foto wird **ohne Rückfrage ersetzt** (Hinweis „Foto ersetzt“). Mehrere Dateien: die erste kommt in die Zielzelle, weitere füllen die folgenden leeren Zellen der Seite. Nicht-Bilder werden mit einem Hinweis ignoriert. Loslassen außerhalb einer Zelle öffnet die Datei nicht mehr im Browser. Bilder aus einem anderen Browser-Tab funktionieren, wenn die Quelle das Laden erlaubt (data:-URL oder CORS).
- **Foto-Zoom mit Mausrad / Trackpad (Werkzeug „Foto schieben“):** Mit dem Mausrad über einem Foto zoomen, um die Zeigerposition. Der Bildpunkt unter dem Zeiger bleibt stehen, soweit das Foto die Zelle weiterhin ganz bedeckt. Trackpad-Pinch unter Windows/macOS zoomt das Foto statt der ganzen Seite. Grenzen wie beim Pinch (1× bis 4×). Zusätzlich die Tasten **+ / −**. Der Zoom wird wie beim Pinch gespeichert (neu: optionaler Versatz `tx`/`ty` je Foto in der `.beak`; alte Dateien sehen unverändert aus). iPad-Pinch bleibt wie bisher.
- **„Foto schieben“ nach dem Einfügen automatisch aktiv:** Nach Kamera, Fotos oder Drag & Drop ist das Werkzeug gleich eingeschaltet (Button aktiv). Es bleibt aktiv, bis „Foto schieben“ erneut oder ein anderes Werkzeug angetippt wird.
- **Entf-Taste löscht das ausgewählte Objekt**, wenn dessen rotes ✕ sichtbar ist (Rahmen, Kreis, Text, Button, BEAK-Nr., ausgewählte Unterteilung), genau wie Tippen auf ✕. Auf Mac/iPad-Tastaturen auch ⌫. Beim Schreiben in Textfeldern, Index-/Fehlerzeilen oder Seitenzielfeldern wirkt die Taste nie auf Objekte.
- **Unterteilung entfernen behält das Foto:** Das ✕ an einer Trennlinie legt beide Hälften zu einer Zelle zusammen. Bisher war diese Zelle immer leer und alle Fotos darin waren ohne Rückfrage weg. Jetzt übernimmt die Zelle das Foto (Zoom bleibt, Ausschnitt neu zentriert). Liegen mehrere Fotos darin, bleibt das erste (links/oben), und vor dem Löschen der übrigen kommt die Rückfrage „Foto in dieser Zelle wird gelöscht – fortfahren?“. Rahmen, Texte usw. über der Zelle bleiben unverändert an ihrer Stelle.
- **Farbleiste:** Die ausgewählte Farbe sieht jetzt genauso aus wie ein aktives Werkzeug (z. B. Rechteck/Kreis/Teleport). Magenta-Rand und Magenta-Punkt sind entfallen.

## Neu in 1.11

- **PDF-Export maßstabsgetreu:** Jede exportierte Seite wird jetzt aus demselben Layout erzeugt wie am Bildschirm: Die Seite wird unsichtbar in Referenzgröße 1180×820 gerendert (Lesemodus-Ansicht) und daraus auf ein Canvas übertragen (Texte, BEAK-Nummern, Sprung-Buttons, Rahmen/Kreise, Fotos mit Ausschnitt und Zoom, Index- und Fehleranalyse-Seiten, Fehler-Einbettung). Vorher wurde jede Seite mit eigenen, festen Pixelmaßen nachgezeichnet (z. B. Text 28 px statt 16 px) – daher die falschen Größen. Doppelte Auflösung (2360×1640 px je Seite) für scharfen Druck.
- **Farbleiste als ein senkrechter Gruppenbutton** (wie „− Seite | Übersicht | + Seite“, gestapelt) direkt rechts unter „Fertig“; Segmente in normaler Toolbar-Größe, schlichte Farbsymbole ohne Zusatzkontur (Ring für Rechteck/Kreis, gefüllter Kreis für Text), Auswahl weiterhin magenta markiert.
- **PDF-Button** sitzt jetzt links neben „+ Fehler“ (direkt nach ☰). Im Lesemodus (☰ und „+ Fehler“ ausgeblendet) an derselben Stelle ganz links, vor „Laden“ (ab 1.13: Ordner-Symbol „Öffnen“).
- **Foto schieben | Teleport** als ein Gruppenbutton; beide bleiben aktiv, bis sie wieder ausgeschaltet werden.

## Neu in 1.10

- **Übersicht = echte Miniatur:** Jede Kachel ist ein verkleinerter Klon der tatsächlich gerenderten Seite (gleiches Seitenverhältnis, gleichmäßig per `transform: scale()`). Texte, BEAK-Labels, Fotos, Rahmen und Tabellenlinien behalten exakt ihre Proportionen (vorher zu große Schrift). Seitennummer und Titel bleiben als lesbare Einblendung. Canvas-Vorschau nur noch als Rückfall.
- **Neuer PDF-Button** (Blatt mit „PDF“) direkt **rechts neben „Laden“** (ab 1.13: „Öffnen“) öffnet die Stückliste-Ansicht (PDF + Abgleich) – im Lese- **und** im Editormodus. Im Editor ist „Laden“/„Öffnen“ ausgeblendet; der Button sitzt dort an derselben Stelle (nach „+ Button“, vor dem Titel). Ohne eingebettete Stückliste ist er gedimmt; Tippen zeigt einen Hinweis mit „PDF hinzufügen“.
- **Editor-Toolbar:** Übersicht sitzt jetzt in der Mitte der Seitengruppe: **− Seite | Übersicht | + Seite** (ein Gruppenbutton mit drei Tippflächen). Passt ohne Überlappung bei 1180×820, 1133×744 und 1024×768.
- **Stückliste – Abgleich sortiert** aufsteigend nach BEAK EDV-Nr. (numerisch: 1.234 vor 1.235; 8.185 vor 101.098).
- **Textgrößen:** „Text klein“ erzeugt jetzt die Größe des bisherigen „Text groß“ (1rem); „Text groß“ ist im gleichen Verhältnis größer (1,4rem). Bestehende Texte in alten `.beak`-Dateien sehen unverändert aus (`textSize`: `sm` = altes klein, `lg` = altes groß/neues klein, `xl` = neues groß).
- **Farben für Rechteck, Kreis, Text groß/klein:** Bei aktivem Werkzeug erscheint rechts unter „Fertig“ eine senkrechte Farbleiste (Schwarz, Grau, Rot, Grün). Jede Aktivierung startet mit der bisherigen Standardfarbe (Rechteck/Kreis rot, Text schwarz). Die Farbe wird pro Objekt gespeichert (`color` in der `.beak`); alte Objekte ohne Farbe behalten den Standard. Ein ausgewähltes Rechteck/Kreis/Textfeld kann über dieselbe Leiste umgefärbt werden. Auch im PDF-Export.
- Fix: Ein frisch platziertes Objekt war sichtbar markiert, intern aber nicht ausgewählt.

## Neu in 1.9

- **Bildschirm füllen (Home-Bildschirm-App):** Statusleiste `black-translucent` (v1.19 bewusst beibehalten, damit der Seiteninhalt unter die Leiste zeichnet und unten nichts abgeschnitten wird), `viewport-fit=cover`, Höhe per `fixStandaloneViewport` aus `screen`/`visualViewport`. Toolbar berücksichtigt Safe-Area; die Stage füllt die volle Fläche. Manifest: `display: fullscreen` mit `display_override`. **Nach Meta-/Viewport-Änderungen Home-Bildschirm-App neu anlegen.**
- **Vollbild-Button** (Safari-Tab): Fullscreen API inkl. `webkit`-Präfix, Symbol in der Lesemodus-Toolbar und im Menü („Ansicht → Vollbild“); in der Home-Bildschirm-App und ohne API ausgeblendet. Layout passt sich bei Vollbild-Wechsel und Drehung an.
- **Übersicht auch im Editor:** neues Symbol (Seitenkacheln 2×2) in Editor- und Lesemodus-Toolbar; passt ohne Überlappung bei 1180×820, 1133×744 und 1024×768.
- **Teleport-Symbol neu:** kräftiger Pfeil mit gefüllter Spitze, Quelle gestrichelt, Ziel gefüllt.
- **Stückliste: gleiche EDV-Nr. in mehreren Zeilen** (auch seitenübergreifend) → Bedarf wird **summiert**; Checkliste zeigt eine Zeile mit Summe und Hinweis „n Zeilen“; grün nur bei Platziert = Summe. Markierung zeigt **alle** Zeilen (scrollt zur ersten).
- **Zeilenmarkierung grün** (wie die Checkliste) statt Magenta.
- Fix: Seitenbahn konnte durch Fokus-Scrollen seitlich versetzt werden (schwarzer Streifen links) – Scroll-Offsets werden jetzt immer auf 0 gehalten.
- Hinweis, falls das Browser-Backup wegen vollem Speicher ohne Fotos gesichert wurde.

## Neu in 1.8

- **Stückliste-PDF liest wieder zuverlässig:** pdf.js 4.10.38 jetzt als Legacy-Build (läuft auch auf älterem iPad-Safari ohne `Promise.withResolvers`), plus klassischer Skript-Fallback (`vendor/pdf.legacy.iife.js`, `vendor/pdf.worker.legacy.iife.js`) für `file://`, Electron und blockierte Worker. Echte Lesefehler werden jetzt angezeigt statt „Keine Teile erkannt“.
- **Parser neu:** Spalten „BEAK EDV-Nr.“ und „Bedarf Stck“ werden aus den Kopfzellen gelernt (X-Bereich, rechtsbündige Zahlen); pro Teil werden Seite und Zeilen-BBox gespeichert. Beispiel-Stückliste: 52 Teile auf 2 Seiten.
- **Stückliste anzeigen:** PDF wird mit pdf.js gerendert (alle Seiten, auch auf dem iPad), Zoom −/+, Schließen über ✕, Escape oder Tippen außerhalb. Tipp auf eine Checklistenzeile markiert die Zeile in der PDF.
- **Neu: BEAK-Nr. antippen (Lesemodus):** öffnet die Stückliste auf der richtigen Seite, die ganze Zeile des Teils ist magenta markiert (Bedarf/Platziert im Kopf). Ohne PDF bzw. unbekannte Nummer erscheint ein Hinweis. Im Editor bleibt das Bearbeiten wie bisher.
- **Übersicht funktioniert:** Seiten als Miniaturen (Index, Layout-Seiten, Fehleranalyse) mit Seitennummer, aktuelle Seite markiert; Tippen springt zur Seite; Schließen über ✕, Escape oder Tippen außerhalb.
- **Hinweise unter der Toolbar:** Statusmeldungen erscheinen als Hinweis unter der Toolbar und verschieben keine Buttons mehr (bei offenem Overlay unten).
- **Fehleranalyse:** Leere Zeilen der letzten Seite sind nicht mehr direkt befüllbar – neue Einträge nur über „+ Fehler“ auf Layout-Seiten; bestehende Einträge bleiben editierbar.
- **Seite löschen:** schmaleres „−“ im Button (Breite wie das „+“ bei „Seite hinzufügen“).
- Versionsanzeige im Menü; Cache-Busting (`?v=1.8`) für App-Dateien und pdf.js.

## Neu in 1.7

- Stückliste-PDF: robustes Parsing (Lagerplatz nicht als Bedarf, Titel-EDV überspringen, Fallback-Regex, pdf.js Worker-Fallback)
- Stückliste-Abgleich: Anzeigen re-parst bei leerer Liste, Flash mit Teileanzahl bzw. klarer Fehler
- Fehleranalyse: Navigation Layout ↔ letzte Seite (Klick auf Fehlerzeile); Seiten-Swipe stiehlt Klicks nicht mehr
- + Fehler nur auf Layout-Seiten (nicht Index, nicht Fehleranalyse); bestehende Einträge auf der letzten Seite weiter editierbar

## Icons

| Plattform | Datei |
|-----------|--------|
| Windows (Installer / Verknüpfung) | `anweisungen.ico`, `icons/anweisungen.ico` |
| macOS (App-Bundle) | `anweisungen.icns`, `icons/anweisungen.icns` |
| iPad / iPhone (Home-Bildschirm) | `apple-touch-icon*.png` |
| PWA / Browser | `manifest.webmanifest`, `icons/icon-192.png`, `icons/icon-512.png` (+ maskable) |

## Start / Lokal & Offline

Die App ist rein statisch – **kein Backend, kein Upload-Link**. ZIP entpacken und einen lokalen Webserver starten (HTTPS oder localhost), z. B.:

```bash
python3 -m http.server 8765
```

Dann im Browser `http://127.0.0.1:8765/` öffnen. Alternativ die Seite einmal laden und **zum Home-Bildschirm hinzufügen**: der Service Worker hält danach die App-Shell (Oberfläche, Skripte, Icons) offline bereit. Projektdateien (`.beak`) bleiben lokal bei dir und werden nicht in den Offline-Cache gelegt.
