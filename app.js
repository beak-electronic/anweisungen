(function () {
  'use strict';

  const STORAGE_KEY = 'seitenlayout-v2';
  const ASPECT_W = 1180;
  /* v1.84: Editor – Split-Divider ziehen gewinnt über Seiten-Wischen; Viewer weiter Wischen auf Trennlinie.
   * v1.83: Aspect leicht landscape-er (1180×792) als 1.82 (1180×800).
     iPad Air 1180×820 minus Status (~24–28pt) → Fenster ohne Seiten-Letterbox (kein Stretch).
     Fill bleibt uniform (--page-ref-h). */
  const ASPECT_H = 792;
  /* v1.17/v1.83: Seiteninhalt in festem logischem Koordinatensystem, per transform: scale()
     auf die Bühne. Referenzbreite 1156 (Bernd Mac-Screenshot); Höhe aus Aspect 1180×792
     → ≈ 775,89. Alte .beak (%-Koordinaten) passen sich automatisch an. */
  const PAGE_REF_W = 1156;
  const PAGE_REF_H = PAGE_REF_W * ASPECT_H / ASPECT_W; // ≈ 775.89
  const SNAP_MS = 320;
  const VELOCITY_THRESHOLD = 0.55;
  const PHOTO_SCALE_MIN = 1;
  const PHOTO_SCALE_MAX = 4;
  const PLAN_MIME = 'application/zip';
  const PDF_MIME = 'application/pdf';
  const INDEX_MAX_ROWS = 25;

  function uid(prefix) {
    return (prefix || 'c') + Math.random().toString(36).slice(2, 10);
  }

  function normalizePhoto(photo) {
    if (!photo) return null;
    if (typeof photo === 'string') {
      return { src: photo, scale: 1, x: 0.5, y: 0.5 };
    }
    if (typeof photo !== 'object') return null;
    const src = typeof photo.src === 'string' ? photo.src : null;
    const file = typeof photo.file === 'string' ? photo.file : undefined;
    if (!src && !file) return null;
    return {
      src: src,
      file: file,
      scale: typeof photo.scale === 'number' && isFinite(photo.scale) ? photo.scale : 1,
      x: typeof photo.x === 'number' && isFinite(photo.x) ? photo.x : 0.5,
      y: typeof photo.y === 'number' && isFinite(photo.y) ? photo.y : 0.5,
      // v1.12: optionaler Versatz (Anteil der Zellbreite/-höhe) für Zoom um den Cursor
      tx: typeof photo.tx === 'number' && isFinite(photo.tx) ? photo.tx : 0,
      ty: typeof photo.ty === 'number' && isFinite(photo.ty) ? photo.ty : 0,
      // v1.13: Drehung im Uhrzeigersinn, 0 | 90 | 180 | 270 (fehlend = 0)
      rot: normalizePhotoRot(photo.rot),
    };
  }

  function normalizePhotoRot(r) {
    if (typeof r !== 'number' || !isFinite(r)) return 0;
    return (((Math.round(r / 90) * 90) % 360) + 360) % 360;
  }

  function clonePhoto(photo) {
    const n = normalizePhoto(photo);
    if (!n) return null;
    return { src: n.src, file: n.file, scale: n.scale, x: n.x, y: n.y, tx: n.tx, ty: n.ty, rot: n.rot };
  }

  function makeLeaf(photo) {
    return { type: 'leaf', id: uid('l'), photo: clonePhoto(photo), caption: '', captionShort: '', captionX: 0.05, captionY: 0.78, variantId: null };
  }

  function makeIndexRow(text, targetPage) {
    const tp = typeof targetPage === 'number' && isFinite(targetPage) ? Math.round(targetPage) : 2;
    return { id: uid('r'), text: typeof text === 'string' ? text : '', targetPage: tp };
  }

  function padIndexRows(page) {
    if (!page) return [];
    if (!Array.isArray(page.rows)) page.rows = [];
    while (page.rows.length < INDEX_MAX_ROWS) {
      page.rows.push(makeIndexRow('', 0));
    }
    if (page.rows.length > INDEX_MAX_ROWS) {
      page.rows.length = INDEX_MAX_ROWS;
    }
    return page.rows;
  }

  function indexNrLabel(rows, i) {
    const row = rows && rows[i];
    if (!row || !String(row.text || '').trim()) return '';
    let n = 0;
    for (let j = 0; j <= i; j++) {
      if (rows[j] && String(rows[j].text || '').trim()) n += 1;
    }
    return String(n);
  }

  function makeIndexPage() {
    const rows = [];
    for (let i = 0; i < INDEX_MAX_ROWS; i++) {
      rows.push(makeIndexRow('', 0));
    }
    return { id: uid('p'), kind: 'index', title: 'Arbeitsschritte', rows: rows };
  }

  function makePage() {
    const id = uid('p');
    return {
      id: id,
      kind: 'layout',
      root: makeLeaf(null),
      annotations: [],
      highlight: false,
      highlightLeafIds: [],
      pageGroupId: id,
      variantScope: 'all', /* v1.85: gilt standardmäßig für alle Varianten */
    };
  }

  function makeFehlerRow(date, description, cause, remedy, sourcePageId) {
    return {
      id: uid('r'),
      date: typeof date === 'string' ? date : '',
      description: typeof description === 'string' ? description : '',
      cause: typeof cause === 'string' ? cause : '',
      remedy: typeof remedy === 'string' ? remedy : '',
      sourcePageId: typeof sourcePageId === 'string' && sourcePageId ? sourcePageId : null,
    };
  }

  function padFehlerRows(page) {
    if (!page) return [];
    if (!Array.isArray(page.rows)) page.rows = [];
    while (page.rows.length < INDEX_MAX_ROWS) {
      page.rows.push(makeFehlerRow());
    }
    if (page.rows.length > INDEX_MAX_ROWS) {
      page.rows.length = INDEX_MAX_ROWS;
    }
    return page.rows;
  }

  function makeFehlerPage() {
    const rows = [];
    for (let i = 0; i < INDEX_MAX_ROWS; i++) {
      rows.push(makeFehlerRow());
    }
    return { id: uid('p'), kind: 'fehler', title: 'Fehleranalyse', rows: rows };
  }

  function makeDocument() {
    return {
      pages: [makeVariantenPage(), makeIndexPage(), makePage(), makeFehlerPage()],
      pageIndex: 0,
      variants: [],
    };
  }

  function isIndexPage(page) {
    return !!(page && page.kind === 'index');
  }

  function isFehlerPage(page) {
    return !!(page && page.kind === 'fehler');
  }

  function isFixedPage(page) {
    /* Index/Fehler: kein Layout. Varianten-Seite erlaubt Unterteilung + Fotos, aber keine Annotationen. */
    return isIndexPage(page) || isFehlerPage(page);
  }

  function isNonLayoutPage(page) {
    return isFixedPage(page) || isVariantenPage(page);
  }

  /** v1.91/v2.05: Viewer: Varianten-Seite nur per Foto weiter (kein Wischen/Pfeile).
      Editor: Wischen/Pfeile zur Index-Tabelle (und zurück) erlaubt. */
  function variantenPageExitLocked() {
    return isVariantenPage(currentPage()) && !state.editMode;
  }


  /* ---- v1.85: Produktvarianten ------------------------------------------------
     Seite kind:"varianten" als Bookend vor dem Index. Zellen = Foto + Bezeichnung.
     Layout-Seiten: variantScope "all"|variantId, pageGroupId für Spezialisierungen.
     Viewer filtert auf gemeinsame + aktive Variante; Editor zeigt alle Seiten. */
  function isVariantenPage(page) {
    return !!(page && page.kind === 'varianten');
  }

  /** v1.91: Erkennung auch wenn .beak die Bookend-Seite ohne kind:"varianten"
      gespeichert hat (z. B. als layout mit Titel „Varianten“) — sonst würde
      ensureBookends eine leere Varianten-Seite davor schieben. */
  function looksLikeVariantenPage(page) {
    if (!page || typeof page !== 'object') return false;
    if (page.kind === 'varianten') return true;
    if (page.kind === 'index' || page.kind === 'fehler') return false;
    const title = (typeof page.title === 'string') ? page.title.trim() : '';
    return title === 'Varianten';
  }

  function makeVariantenPage() {
    return {
      id: uid('p'),
      kind: 'varianten',
      title: 'Varianten',
      root: makeLeaf(null),
      annotations: [],
    };
  }

  function normalizeVariantenPage(p) {
    const root = (p && p.root && validateCell(p.root)) ? normalizeCellTree(p.root) : makeLeaf(null);
    return {
      id: (p && typeof p.id === 'string') ? p.id : uid('p'),
      kind: 'varianten',
      title: (p && typeof p.title === 'string' && p.title) ? p.title : 'Varianten',
      root: root,
      annotations: [],
    };
  }

  function getVariantenPage() {
    const pages = state.doc && state.doc.pages;
    if (!pages || !pages.length) return null;
    return isVariantenPage(pages[0]) ? pages[0] : null;
  }

  function leafCaption(leaf) {
    return leaf && typeof leaf.caption === 'string' ? leaf.caption : '';
  }

  /** v1.91: Kurzname (Kürzel) der Variante – Zelle speichert captionShort. */
  function leafCaptionShort(leaf) {
    return leaf && typeof leaf.captionShort === 'string' ? leaf.captionShort : '';
  }

  /** Anzeige in beengter UI (Varianten-Leiste): Kürzel, sonst voller Name. */
  function variantShortLabel(v) {
    if (!v) return '';
    const k = (typeof v.kuerzel === 'string') ? v.kuerzel.trim() : '';
    if (k) return k;
    return (typeof v.label === 'string' && v.label) ? v.label : '';
  }

  /** Voller Name für Dialoge/Stückliste. */
  function variantFullLabel(v) {
    if (!v) return '';
    return (typeof v.label === 'string' && v.label) ? v.label : '';
  }

  /** v1.87: relative Caption-Position (0–1) in der Fotozelle; Default unten links. */
  function leafCaptionPos(leaf) {
    let x = leaf && typeof leaf.captionX === 'number' && isFinite(leaf.captionX) ? leaf.captionX : 0.05;
    let y = leaf && typeof leaf.captionY === 'number' && isFinite(leaf.captionY) ? leaf.captionY : 0.78;
    return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
  }

  function applyVariantCaptionPosition(capWrap, leafEl, cell) {
    if (!capWrap || !leafEl) return;
    const pos = leafCaptionPos(cell);
    const lw = leafEl.clientWidth || 1;
    const lh = leafEl.clientHeight || 1;
    const ww = capWrap.offsetWidth || 0;
    const wh = capWrap.offsetHeight || 0;
    let left = pos.x * lw;
    let top = pos.y * lh;
    const maxL = Math.max(0, lw - ww);
    const maxT = Math.max(0, lh - wh);
    left = Math.min(Math.max(0, left), maxL);
    top = Math.min(Math.max(0, top), maxT);
    capWrap.style.left = left + 'px';
    capWrap.style.top = top + 'px';
    /* v1.92: Position nur beim Ziehen speichern — nicht hier überschreiben
       (Editor-Wrap ≠ Viewer-Wrap → sonst springt der Text). */
  }

  function bindVariantCaptionDrag(capWrap, leafEl, cell) {
    if (!capWrap || !leafEl || !state.editMode) return;
    /* v2.03: ganzer Wrap ziehbar (Name+Kürzel+Ecken). Inputs: Tippen=Edit;
       Ziehen ab ~8px Schwelle. Während Fokus im Input kein Drag von diesem Feld. */
    const DRAG_THRESH2 = 64; /* 8px² */
    let armed = false;
    let dragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0, pointerId = null;
    let fromInput = null;

    const cleanup = (e) => {
      armed = false;
      dragging = false;
      pointerId = null;
      fromInput = null;
      capWrap.classList.remove('is-dragging');
      try { if (e) capWrap.releasePointerCapture(e.pointerId); } catch (_) {}
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };

    const applyPos = (clientX, clientY) => {
      const lw = leafEl.clientWidth || 1;
      const lh = leafEl.clientHeight || 1;
      const ww = capWrap.offsetWidth || 0;
      const wh = capWrap.offsetHeight || 0;
      let left = origLeft + (clientX - startX);
      let top = origTop + (clientY - startY);
      left = Math.min(Math.max(0, left), Math.max(0, lw - ww));
      top = Math.min(Math.max(0, top), Math.max(0, lh - wh));
      capWrap.style.left = left + 'px';
      capWrap.style.top = top + 'px';
      cell.captionX = left / lw;
      cell.captionY = top / lh;
    };

    const onMove = (e) => {
      if (!armed || (pointerId != null && e.pointerId !== pointerId)) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if ((dx * dx + dy * dy) < DRAG_THRESH2) return;
        dragging = true;
        e.preventDefault();
        if (fromInput) { try { fromInput.blur(); } catch (_) {} }
        capWrap.classList.add('is-dragging');
        try { capWrap.setPointerCapture(e.pointerId); } catch (_) {}
      }
      e.preventDefault();
      applyPos(e.clientX, e.clientY);
    };

    const onUp = (e) => {
      if (!armed || (pointerId != null && e.pointerId !== pointerId)) return;
      const wasDrag = dragging;
      const inp = fromInput;
      cleanup(e);
      if (wasDrag) {
        syncVariantsFromPage();
        updateVariantBar();
        if (typeof historyCommit === 'function') historyCommit();
      } else if (inp && document.activeElement !== inp) {
        try { inp.focus(); } catch (_) {}
      }
    };

    const startDrag = (e) => {
      if (!state.editMode) return;
      if (e.button != null && e.button !== 0) return;
      const onCorner = !!e.target.closest('.variant-caption-corner');
      const immediateDrag = onCorner;
      const inp = e.target.closest('.variant-caption-input, .variant-kuerzel-input');
      /* Tippen/Markieren im fokussierten Feld = Edit, kein Drag */
      if (inp && document.activeElement === inp && !immediateDrag) return;
      armed = true;
      dragging = false;
      pointerId = e.pointerId;
      fromInput = immediateDrag ? null : (inp || null);
      startX = e.clientX;
      startY = e.clientY;
      origLeft = parseFloat(capWrap.style.left) || 0;
      origTop = parseFloat(capWrap.style.top) || 0;
      e.stopPropagation();
      /* L-Ecken: sofort ziehen (kein 8px-Threshold) */
      if (immediateDrag) {
        dragging = true;
        e.preventDefault();
        capWrap.classList.add('is-dragging');
        try { capWrap.setPointerCapture(e.pointerId); } catch (_) {}
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };

    capWrap.addEventListener('pointerdown', startDrag);
  }

  /** Varianten aus der Varianten-Seite (Zellen mit ausgefüllter Bezeichnung). */
  function collectVariantsFromPage() {
    const vp = getVariantenPage();
    if (!vp || !vp.root) return [];
    const leaves = leafIdsInOrder(vp.root, []);
    const out = [];
    const seen = new Set();
    for (const leaf of leaves) {
      const label = String(leafCaption(leaf) || '').trim();
      if (!label) continue;
      let id = (typeof leaf.variantId === 'string' && leaf.variantId) ? leaf.variantId : null;
      if (!id || seen.has(id)) {
        id = uid('v');
        leaf.variantId = id;
      }
      seen.add(id);
      const kuerzel = String(leafCaptionShort(leaf) || '').trim();
      out.push({ id: id, label: label, kuerzel: kuerzel, leafId: leaf.id });
    }
    return out;
  }

  function syncVariantsFromPage() {
    const list = collectVariantsFromPage();
    const prev = Array.isArray(state.doc.variants) ? state.doc.variants : [];
    const prevById = new Map(prev.map((v) => [v.id, v]));
    state.doc.variants = list.map((v) => {
      const old = prevById.get(v.id);
      return {
        id: v.id,
        label: v.label,
        kuerzel: v.kuerzel || '',
        leafId: v.leafId,
        stuecklisteFile: (old && old.stuecklisteFile) || ('source/Stueckliste-' + v.id + '.pdf'),
      };
    });
    // Stücklisten-Map bereinigen (nur noch existierende Varianten behalten)
    if (state.variantStuecklisten && typeof state.variantStuecklisten === 'object') {
      const keep = new Set(list.map((v) => v.id));
      for (const k of Object.keys(state.variantStuecklisten)) {
        if (!keep.has(k)) delete state.variantStuecklisten[k];
      }
    }
    if (state.activeVariantId && !list.some((v) => v.id === state.activeVariantId)) {
      state.activeVariantId = list.length === 1 ? list[0].id : null;
    }
    return list;
  }

  function variantsList() {
    return (state.doc && Array.isArray(state.doc.variants)) ? state.doc.variants : [];
  }

  function hasMultipleVariants() {
    return variantsList().length >= 2;
  }

  function variantById(id) {
    return variantsList().find((v) => v.id === id) || null;
  }

  function pageGroupIdOf(page) {
    if (!page) return null;
    if (typeof page.pageGroupId === 'string' && page.pageGroupId) return page.pageGroupId;
    return page.id || null;
  }

  /** v1.94: null = gilt für alle; sonst Liste der Varianten-IDs (1…n). */
  function pageVariantScopeIds(page) {
    if (!page || isFixedPage(page) || isVariantenPage(page)) return null;
    const s = page.variantScope;
    if (Array.isArray(s)) {
      const ids = s.filter((id) => typeof id === 'string' && id && id !== 'all');
      return ids.length ? ids : null;
    }
    if (typeof s === 'string' && s && s !== 'all') return [s];
    return null;
  }

  /** Kompatibilität: 'all' | einzelne ID | '\0'-joined Multi-Key. */
  function pageVariantScope(page) {
    const ids = pageVariantScopeIds(page);
    if (!ids) return 'all';
    if (ids.length === 1) return ids[0];
    return ids.join('\0');
  }

  function pageScopeIncludesVariant(page, variantId) {
    if (!variantId) return false;
    const ids = pageVariantScopeIds(page);
    if (!ids) return true;
    return ids.indexOf(variantId) >= 0;
  }

  function hasSpecialization(groupId, variantId) {
    if (!groupId || !variantId) return false;
    for (const p of state.doc.pages || []) {
      if (!p || isFixedPage(p)) continue;
      if (pageGroupIdOf(p) !== groupId) continue;
      const ids = pageVariantScopeIds(p);
      if (ids && ids.indexOf(variantId) >= 0) return true;
    }
    return false;
  }

  function pageVisibleInViewer(page, variantId) {
    if (!page) return false;
    if (isVariantenPage(page) || isIndexPage(page) || isFehlerPage(page)) return true;
    if (!hasMultipleVariants()) return true;
    const ids = pageVariantScopeIds(page);
    if (!ids) {
      if (variantId && hasSpecialization(pageGroupIdOf(page), variantId)) return false;
      return true;
    }
    return !!variantId && ids.indexOf(variantId) >= 0;
  }

  /** Seiten in Navigationsreihenfolge. Ab v1.88: Editor und Viewer gleich gefiltert
   *  (pro pageGroup nur die für die aktive Variante sichtbare Seite) – verhindert
   *  Doppel-Slots und Springen auf Seite 1 wenn Spezialseiten „unsichtbar“ sind. */
  function getNavPages() {
    const all = (state.doc && state.doc.pages) || [];
    if (!hasMultipleVariants()) return all.slice();
    const vid = state.activeVariantId;
    return all.filter((p) => pageVisibleInViewer(p, vid));
  }

  /** Reale pageIndex → sichtbare Seite derselben Gruppe / nächster Nachbar (nie still auf 0 fallen).
   *  v1.99: Gruppen-Treffer über getNavPages (aktive Variante), inkl. Multi-Scope
   *  (pageScopeIncludesVariant) — nicht nur pageVariantScope === vid. */
  function remapToVisiblePageIndex(realIdx) {
    const pages = state.doc.pages || [];
    const nav = getNavPages();
    if (!pages.length || !nav.length) return 0;
    let idx = typeof realIdx === 'number' && isFinite(realIdx) ? Math.round(realIdx) : 0;
    if (idx < 0) idx = 0;
    if (idx >= pages.length) idx = pages.length - 1;
    const cur = pages[idx];
    if (cur && nav.indexOf(cur) >= 0) return idx;
    /* Gleiche Gruppe: die für die aktive Variante sichtbare Seite (Nav-Filter) */
    if (cur && !isFixedPage(cur) && !isVariantenPage(cur) && !isIndexPage(cur) && !isFehlerPage(cur)) {
      const group = pageGroupIdOf(cur);
      const siblings = pagesSharingGroup(group);
      const inNav = siblings.find((p) => nav.indexOf(p) >= 0);
      if (inNav) return pages.indexOf(inNav);
      const vid = state.activeVariantId;
      if (vid) {
        const single = siblings.find((p) => {
          const ids = pageVariantScopeIds(p);
          return !!(ids && ids.length === 1 && ids[0] === vid);
        });
        if (single) return pages.indexOf(single);
        const multi = siblings.find((p) => pageScopeIncludesVariant(p, vid));
        if (multi) return pages.indexOf(multi);
      }
      const shared = siblings.find((p) => !pageVariantScopeIds(p));
      if (shared && nav.indexOf(shared) >= 0) return pages.indexOf(shared);
    }
    /* Nächster Nachbar in Originalreihenfolge, der in nav liegt */
    for (let d = 1; d < pages.length; d++) {
      for (const j of [idx - d, idx + d]) {
        if (j >= 0 && j < pages.length && nav.indexOf(pages[j]) >= 0) return j;
      }
    }
    return state.doc.pages.indexOf(nav[0]);
  }

  /** 1-basierte Zielseite (Index/Button) → reale pageIndex.
   *  v2.00: Nummer = Anzeige/Navigation der **aktiven Variante** (wie „36 / N“),
   *  nicht der rohe Absolute-Index in doc.pages (Varianten-Kopien verschieben den). */
  function resolveTargetPageRealIndex(tp) {
    if (typeof tp !== 'number' || !isFinite(tp)) return -1;
    const n = Math.round(tp);
    if (n < 1) return -1;
    const nav = getNavPages();
    if (n <= nav.length) {
      const page = nav[n - 1];
      const real = state.doc.pages.indexOf(page);
      return real >= 0 ? real : -1;
    }
    /* Fallback: Absolute-Index (ältere Projekte / Nummer > Nav-Länge) */
    const pages = state.doc.pages || [];
    if (n <= pages.length) return remapToVisiblePageIndex(n - 1);
    return -1;
  }

  /** Max. Zielseiten-Nummer für Eingabefelder (= Länge der aktuellen Nav). */
  function targetPageInputMax() {
    const n = getNavPages().length;
    return Math.max(1, n || ((state.doc.pages || []).length) || 1);
  }

  function navIndexOfPageIndex(realIdx) {
    const pages = getNavPages();
    const page = state.doc.pages[remapToVisiblePageIndex(realIdx)];
    if (!page) return 0;
    const i = pages.indexOf(page);
    return i >= 0 ? i : 0;
  }

  function realIndexFromNavIndex(navIdx) {
    const pages = getNavPages();
    const page = pages[clamp(navIdx, 0, Math.max(0, pages.length - 1))];
    if (!page) return 0;
    const i = state.doc.pages.indexOf(page);
    return i >= 0 ? i : 0;
  }

  function pagesSharingGroup(groupId) {
    return (state.doc.pages || []).filter((p) => !isFixedPage(p) && pageGroupIdOf(p) === groupId);
  }

  /** v1.89: Anzahl Varianten-Versionen einer Übersichtskachel (≥2 → Balken anzeigen). */
  function overviewVariantBarCount(page) {
    if (!page) return 0;
    if (isVariantenPage(page)) {
      try {
        syncVariantsFromPage();
        const n = variantsList().length;
        return n >= 2 ? n : 0;
      } catch (_) {
        return 0;
      }
    }
    if (isFixedPage(page) || isIndexPage(page) || isFehlerPage(page)) return 0;
    const siblings = pagesSharingGroup(pageGroupIdOf(page));
    return siblings.length >= 2 ? siblings.length : 0;
  }

  function appendOverviewVariantBars(btn, page) {
    if (!btn || !page) return;
    const n = overviewVariantBarCount(page);
    if (n < 2) return;
    const wrap = document.createElement('span');
    wrap.className = 'overview-variant-bars';
    wrap.setAttribute('aria-label', n + ' Varianten');
    wrap.title = n + ' Varianten für diese Seite';
    for (let i = 0; i < n; i++) {
      const bar = document.createElement('span');
      bar.className = 'overview-variant-bar';
      wrap.appendChild(bar);
    }
    btn.appendChild(wrap);
  }

  function getActiveVariantStueckliste() {
    if (hasMultipleVariants() && state.activeVariantId) {
      const m = state.variantStuecklisten || {};
      return m[state.activeVariantId] || null;
    }
    return state.stueckliste;
  }

  /** v1.96: Original-PDF-Name → Zip-Pfad unter source/ (kein generisches Stueckliste.pdf). */
  function sanitizeStuecklisteBaseName(name) {
    let base = String(name == null ? '' : name).trim().split(/[/\\]/).pop() || '';
    base = base.replace(/[\x00-\x1f<>:"|?*]/g, '_').replace(/^\.+/g, '').trim();
    if (!base) base = 'Stueckliste.pdf';
    if (!/\.pdf$/i.test(base)) base += '.pdf';
    return base;
  }

  function stuecklisteZipPathFromName(name) {
    return 'source/' + sanitizeStuecklisteBaseName(name);
  }

  /** Eindeutigen source/-Pfad wählen; Kollisionen → stem__<tag>.pdf */
  function allocateStuecklisteZipPath(name, usedPaths, disambiguator) {
    const used = usedPaths || new Set();
    let path = stuecklisteZipPathFromName(name);
    if (!used.has(path)) {
      used.add(path);
      return path;
    }
    const base = sanitizeStuecklisteBaseName(name);
    const stem = base.replace(/\.pdf$/i, '');
    const tag = String(disambiguator || 'x').replace(/[^a-zA-Z0-9]/g, '').slice(-10) || 'x';
    path = 'source/' + stem + '__' + tag + '.pdf';
    let n = 2;
    while (used.has(path)) {
      path = 'source/' + stem + '__' + tag + '_' + n + '.pdf';
      n += 1;
    }
    used.add(path);
    return path;
  }

  function bindStuecklistePathToVariant(variantId, rec) {
    if (!variantId || !rec || !rec.name) return;
    try { syncVariantsFromPage(); } catch (_) {}
    const list = (state.doc && state.doc.variants) || [];
    const v = list.find((x) => x && x.id === variantId);
    if (v) v.stuecklisteFile = stuecklisteZipPathFromName(rec.name);
  }

  function setActiveVariantStueckliste(rec) {
    if (hasMultipleVariants() && state.activeVariantId) {
      if (!state.variantStuecklisten) state.variantStuecklisten = {};
      state.variantStuecklisten[state.activeVariantId] = rec;
      state.stueckliste = rec; // Abgleich/UI lesen state.stueckliste
      bindStuecklistePathToVariant(state.activeVariantId, rec);
      return;
    }
    state.stueckliste = rec;
  }

  let lastVariantEnterAt = 0;
  function enterVariantFromLeaf(leaf) {
    if (!leaf) return;
    const now = Date.now();
    if (now - lastVariantEnterAt < 450) return;
    lastVariantEnterAt = now;
    syncVariantsFromPage();
    let id = leaf.variantId;
    if (!id) {
      id = uid('v');
      leaf.variantId = id;
      syncVariantsFromPage();
    }
    /* Caption anlegen, falls leer – sonst erscheint Variante nicht in variantsList */
    if (!String(leafCaption(leaf) || '').trim()) {
      leaf.caption = 'Variante';
      syncVariantsFromPage();
    }
    state.activeVariantId = id;
    const rec = (state.variantStuecklisten && state.variantStuecklisten[id]) || null;
    state.stueckliste = rec;
    updateStuecklisteUi();
    rebuildBeakUsage();
    const label = String(leafCaption(leaf) || '').trim() || 'Variante';
    const idx = state.doc.pages.findIndex((p) => isIndexPage(p));
    /* Nach Variantenwahl Nav neu aufbauen (Filter), dann zur Arbeitsschritte-Tabelle */
    renderAll();
    if (idx >= 0) snapToIndex(idx, true);
    else snapToIndex(Math.min(1, state.doc.pages.length - 1), true);
    flash('Variante: ' + label);
  }

  /** v1.89: DOM-Leaf → Zellenmodell (für Tap trotz Pointer-Capture auf dem Viewport). */
  function leafModelFromEventTarget(target) {
    if (!target || !target.closest) return null;
    const leafEl = target.closest('.varianten-leaf, .page-slide[data-kind="varianten"] .cell-leaf');
    if (!leafEl) return null;
    const page = currentPage();
    if (!page || !isVariantenPage(page) || !page.root) return null;
    const id = leafEl.dataset.leafId;
    if (!id) return null;
    return findLeaf(page.root, id);
  }

  function tryEnterVariantFromTapTarget(target) {
    /* v1.92: Nur Viewer — Editor darf Varianten-Fotos tippen ohne Sprung */
    if (state.editMode) return false;
    const cell = leafModelFromEventTarget(target);
    if (!cell || cell.type !== 'leaf') return false;
    const hasPhoto = !!(cell.photo && cell.photo.src);
    if (!hasPhoto) return false;
    enterVariantFromLeaf(cell);
    return true;
  }

  function setActiveVariant(variantId, opts) {
    opts = opts || {};
    state.activeVariantId = variantId || null;
    if (variantId && state.variantStuecklisten) {
      state.stueckliste = state.variantStuecklisten[variantId] || null;
    }
    updateStuecklisteUi();
    rebuildBeakUsage();
    updateVariantBar();
    if (opts.rerender !== false) {
      const cur = remapToVisiblePageIndex(state.doc.pageIndex);
      state.doc.pageIndex = cur;
      renderAll();
      snapToIndex(cur, false);
    }
  }

  /** Dupliziert die aktuelle Layout-Seite für eine Variante (Spezialisierung). */
  function specializeCurrentPageForVariant(variantId) {
    const page = currentPage();
    if (!page || isFixedPage(page)) {
      flash('Nur Layout-Seiten können varianten-spezifisch sein', 4000, 'error');
      return null;
    }
    const v = variantById(variantId);
    if (!v) return null;
    const group = pageGroupIdOf(page);
    /* Existiert schon eine Spezialisierung? → dorthin wechseln */
    const existing = (state.doc.pages || []).find((p) => {
      if (!p || isFixedPage(p) || pageGroupIdOf(p) !== group) return false;
      const ids = pageVariantScopeIds(p);
      return !!(ids && ids.length === 1 && ids[0] === variantId);
    });
    if (existing) {
      setActiveVariant(variantId, { rerender: false });
      const idx = state.doc.pages.indexOf(existing);
      renderAll();
      snapToIndex(idx, true);
      flash('Variante „' + v.label + '“ – bestehende Spezialseite');
      return existing;
    }
    /* Aktuelle Seite ist schon exklusiv für diese Variante */
    if (pageVariantScope(page) === variantId) {
      setActiveVariant(variantId);
      flash('Seite gilt bereits nur für „' + v.label + '“');
      return page;
    }
    const clone = {
      id: uid('p'),
      kind: 'layout',
      root: cloneCellFreshIds(page.root),
      annotations: (page.annotations || []).map((a) => {
        const na = { ...a, id: uid('a') };
        if (a && a.photo) na.photo = clonePhoto(a.photo);
        return na;
      }),
      highlight: !!page.highlight,
      /* Leaf-IDs neu → Highlight-Refs der Vorlage nicht mitnehmen */
      highlightLeafIds: [],
      pageGroupId: group,
      variantScope: variantId,
    };
    if (page.fehlerEmbed) {
      const emb = normalizeFehlerEmbed(page.fehlerEmbed);
      if (emb) clone.fehlerEmbed = { rowIds: emb.rowIds.slice() };
    }
    /* Original bleibt „all“ (Shared) — oder bei Multi-Teilmenge: Variante aus Scope nehmen */
    const curIds = pageVariantScopeIds(page);
    if (!curIds) {
      page.pageGroupId = group;
      page.variantScope = 'all';
    } else if (curIds.length >= 2 && curIds.indexOf(variantId) >= 0) {
      const left = curIds.filter((id) => id !== variantId);
      page.variantScope = left.length === 1 ? left[0] : left.slice();
    }
    const at = state.doc.pages.indexOf(page);
    state.doc.pages.splice(at + 1, 0, clone);
    setActiveVariant(variantId, { rerender: false });
    renderAll();
    snapToIndex(state.doc.pages.indexOf(clone), true);
    if (typeof historyCommit === 'function') historyCommit();
    flash('Spezialseite für „' + v.label + '“ angelegt');
    return clone;
  }

  /** v1.88/v1.94/v1.99: Aktuelle Seite auf bestimmte Variante(n) umstellen (in place).
   *  Kein Shared-Rest für nicht gewählte Geräte — Teilmenge (z. B. A|B) ist geschlossen;
   *  + Variante splittet innerhalb dieser Teilmenge weiter. */
  function convertCurrentPageToVariantSubset(variantIds) {
    const ids = (variantIds || []).filter((id) => !!variantById(id));
    if (!ids.length) {
      flash('Bitte mindestens eine Variante wählen', 3500, 'error');
      return null;
    }
    const page = currentPage();
    if (!page || isFixedPage(page) || isVariantenPage(page)) {
      flash('Nur Layout-Seiten können auf Varianten beschränkt werden', 4000, 'error');
      return null;
    }
    stopLiveCamera();
    if (!page.pageGroupId) page.pageGroupId = page.id;
    page.variantScope = ids.length === 1 ? ids[0] : ids.slice();
    const activate = (state.activeVariantId && ids.indexOf(state.activeVariantId) >= 0)
      ? state.activeVariantId
      : ids[0];
    setActiveVariant(activate, { rerender: false });
    renderAll();
    snapToIndex(state.doc.pages.indexOf(page), true);
    if (typeof historyCommit === 'function') historyCommit();
    const labels = ids.map((id) => {
      const v = variantById(id);
      return v ? (variantShortLabel(v) || v.label) : id;
    });
    flash('Seite gilt nur für „' + labels.join(', ') + '“');
    return page;
  }

  /** v1.88: Aktuelle Seite auf nur eine Variante umstellen (keine neue Seite). */
  function convertCurrentPageToVariantOnly(variantId) {
    return convertCurrentPageToVariantSubset([variantId]);
  }

  /** @deprecated Name – leitet auf convertCurrentPageToVariantOnly um */
  function addVariantOnlyPage(variantId) {
    return convertCurrentPageToVariantOnly(variantId);
  }

  /** v1.93/v1.94: Chip-/Wechsel-Optionen —
   *  Einzel-Spezialseiten als eigene Chips; Shared-Rest als ein Chip „A, B“.
   *  Multi-„Nur für“-Seiten (scope-Array) ebenfalls als ein Chip. */
  function buildPageVariantSwitchOptions(page) {
    const variants = variantsList();
    if (!variants.length) return [];
    if (!page || isFixedPage(page) || isVariantenPage(page)) {
      /* Index o. ä.: eine Chip-Zeile aller Varianten (nur Anzeige / Aktiv setzen) */
      const ids = variants.map((v) => v.id);
      const label = variants.map((v) => variantShortLabel(v) || v.label).join(', ');
      return [{
        id: ids[0],
        label: label,
        title: variants.map((v) => variantFullLabel(v) || v.label).join(', '),
        current: true,
        groupIds: ids,
        inert: true,
      }];
    }
    const group = pageGroupIdOf(page);
    const siblings = pagesSharingGroup(group);
    const covered = new Set();
    const opts = [];
    const viewingIds = pageVariantScopeIds(page);
    const viewingKey = viewingIds ? viewingIds.slice().sort().join('\0') : 'all';

    /* 1) Exclusive pages (single or multi) */
    for (const pg of siblings) {
      const ids = pageVariantScopeIds(pg);
      if (!ids) continue;
      ids.forEach((id) => covered.add(id));
      const label = ids.map((id) => {
        const v = variantById(id);
        return v ? (variantShortLabel(v) || v.label) : id;
      }).join(', ');
      const title = ids.map((id) => {
        const v = variantById(id);
        return v ? (variantFullLabel(v) || v.label) : id;
      }).join(', ');
      const key = ids.slice().sort().join('\0');
      const isCurrentPage = key === viewingKey;
      const activeIn = !!(state.activeVariantId && ids.indexOf(state.activeVariantId) >= 0);
      opts.push({
        id: ids[0],
        label: label,
        title: title,
        current: isCurrentPage || (activeIn && viewingKey === key),
        groupIds: ids.slice(),
        pageRef: pg,
      });
    }

    /* 2) Shared remaining */
    const hasShared = siblings.some((pg) => !pageVariantScopeIds(pg));
    const remaining = variants.filter((v) => !covered.has(v.id));
    if (hasShared && remaining.length) {
      const ids = remaining.map((x) => x.id);
      const label = remaining.map((x) => variantShortLabel(x) || x.label).join(', ');
      const title = remaining.map((x) => variantFullLabel(x) || x.label).join(', ');
      const sharedPage = siblings.find((pg) => !pageVariantScopeIds(pg));
      const isCurrentPage = viewingKey === 'all';
      const activeIn = !!(state.activeVariantId && ids.indexOf(state.activeVariantId) >= 0);
      opts.push({
        id: ids[0],
        label: label,
        title: title,
        current: isCurrentPage && (activeIn || remaining.length === variants.length),
        groupIds: ids,
        pageRef: sharedPage,
      });
    }

    /* Order: follow page-1 variant order — singles when their id appears, shared group at first remaining */
    if (!opts.length && variants.length) {
      const ids = variants.map((v) => v.id);
      return [{
        id: ids[0],
        label: variants.map((v) => variantShortLabel(v) || v.label).join(', '),
        title: variants.map((v) => variantFullLabel(v) || v.label).join(', '),
        current: true,
        groupIds: ids,
        inert: true,
      }];
    }

    /* Deduplicate by groupIds key while preserving encounter order */
    const seen = new Set();
    const ordered = [];
    for (const o of opts) {
      const k = (o.groupIds || []).slice().sort().join('\0');
      if (seen.has(k)) continue;
      seen.add(k);
      ordered.push(o);
    }
    return ordered;
  }

  /**
   * v1.93: variants = Varianten-Objekte ODER Optionen {id,label,current?,title?,groupIds?}.
   * opts.greyCurrent (default true): aktive Option ausgrauen.
   * opts.autoSingle (default true): bei genau 1 Option sofort zurückgeben.
   */
  async function pickVariantFromList(title, variants, opts) {
    const o = opts || {};
    const greyCurrent = o.greyCurrent !== false;
    const autoSingle = o.autoSingle !== false;
    if (!variants || !variants.length) return null;
    const options = variants.map((v) => {
      if (v && Array.isArray(v.groupIds)) {
        return {
          id: v.id,
          label: v.label || variantShortLabel(v) || '',
          title: v.title || v.label || '',
          current: !!v.current,
          groupIds: v.groupIds,
        };
      }
      /* plain variant from variantsList() */
      const isCur = !!(state.activeVariantId && v.id === state.activeVariantId);
      return {
        id: v.id,
        label: variantShortLabel(v) || v.label,
        title: (v.kuerzel && v.label && v.kuerzel !== v.label) ? v.label : (variantFullLabel(v) || v.label || ''),
        current: isCur,
        groupIds: [v.id],
      };
    });
    if (autoSingle && options.length === 1) return options[0].id;
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'variant-pick-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      const panel = document.createElement('div');
      panel.className = 'variant-pick-panel';
      const h = document.createElement('h2');
      h.className = 'variant-pick-title';
      h.textContent = title || 'Variante wählen';
      panel.appendChild(h);
      for (const opt of options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn touch block variant-pick-item';
        b.textContent = opt.label;
        if (opt.title && opt.title !== opt.label) b.title = opt.title;
        const shouldGrey = greyCurrent && opt.current;
        if (shouldGrey) {
          b.disabled = true;
          b.classList.add('is-current');
          b.setAttribute('aria-disabled', 'true');
          b.title = 'Bereits aktiv';
        } else {
          b.addEventListener('click', () => { cleanup(); resolve(opt.id); });
        }
        panel.appendChild(b);
      }
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn touch block';
      cancel.textContent = 'Abbrechen';
      cancel.addEventListener('click', () => { cleanup(); resolve(null); });
      panel.appendChild(cancel);
      backdrop.appendChild(panel);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { cleanup(); resolve(null); }
      });
      document.body.appendChild(backdrop);
      function cleanup() { try { backdrop.remove(); } catch (_) {} }
    });
  }

  function renderVariantBarChips(options) {
    const host = document.getElementById('variantBarChips');
    if (!host) return;
    const opts = options || [];
    const onlyOne = opts.length <= 1;
    /* v2.13: Chips nur neu bauen, wenn sich Inhalt/Zustand geändert hat.
       updateVariantBar() läuft bei JEDEM Tap (pointerup → snapToIndex →
       updateChromeForPage). Der bisherige innerHTML-Neuaufbau mitten im Tap
       (zwischen touchend und dem synthetischen click) ließ iOS/iPadOS den Tap
       verwerfen → Kamera-Button reagierte bei ≥2 Varianten (Leiste sichtbar)
       nicht. Klick-Handler lesen die aktuellen Optionen über host.__variantOpts. */
    const sig = JSON.stringify(opts.map((o) => [
      o.id || '', o.label || '', o.title || '', !!o.current, !!o.inert,
      Array.isArray(o.groupIds) ? o.groupIds.join(',') : '',
    ]));
    host.__variantOpts = opts;
    if (host.__variantSig === sig && host.childElementCount === opts.length) return;
    host.__variantSig = sig;
    host.innerHTML = '';
    opts.forEach((opt, optIdx) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'variant-chip' + (opt.current ? ' is-active' : '');
      b.textContent = opt.label;
      if (opt.title && opt.title !== opt.label) b.title = opt.title;
      b.setAttribute('aria-pressed', opt.current ? 'true' : 'false');
      const inert = !!opt.inert || onlyOne || !!opt.current;
      if (inert && (onlyOne || opt.inert)) {
        /* Einziger Chip / rein informativ: Klick ohne Wirkung, aber outlined */
        b.classList.add('is-active');
        b.setAttribute('aria-pressed', 'true');
        b.addEventListener('click', (e) => { e.preventDefault(); });
      } else if (opt.current) {
        /* Aktiver Chip: outlined, kein Wechsel nötig */
        b.addEventListener('click', (e) => { e.preventDefault(); });
      } else {
        b.addEventListener('click', () => {
          const cur = (host.__variantOpts && host.__variantOpts[optIdx]) || opt;
          void activateVariantChip(cur);
        });
      }
      host.appendChild(b);
    });
  }

  async function activateVariantChip(opt) {
    if (!opt || !opt.groupIds || !opt.groupIds.length) return;
    const prefer = (state.activeVariantId && opt.groupIds.indexOf(state.activeVariantId) >= 0)
      ? state.activeVariantId
      : opt.id;
    setActiveVariant(prefer, { rerender: false });
    const pages = state.doc.pages || [];
    let target = opt.pageRef || null;
    if (!target) {
      const cur = currentPage();
      const group = cur && !isFixedPage(cur) ? pageGroupIdOf(cur) : null;
      if (group) {
        target = pages.find((p) => {
          if (!p || isFixedPage(p) || pageGroupIdOf(p) !== group) return false;
          const ids = pageVariantScopeIds(p);
          if (!ids) {
            /* shared: matches if opt covers remaining / all-shared chip */
            return opt.groupIds.length > 1 || !hasSpecialization(group, prefer);
          }
          if (ids.length !== opt.groupIds.length) return false;
          return opt.groupIds.every((id) => ids.indexOf(id) >= 0);
        }) || null;
      }
    }
    if (target) {
      renderAll();
      snapToIndex(pages.indexOf(target), true);
    } else {
      renderAll();
    }
    updateVariantBar();
  }

  /** v1.94: Checkbox-Dialog für „Nur für bestimmte Variante(n)“. */
  async function pickVariantsMultiCheckbox(title, variants, precheckedIds) {
    const list = variants || [];
    if (!list.length) return null;
    const pre = new Set(precheckedIds || []);
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'variant-pick-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      const panel = document.createElement('div');
      panel.className = 'variant-pick-panel variant-pick-multi';
      const h = document.createElement('h2');
      h.className = 'variant-pick-title';
      h.textContent = title || 'Varianten wählen';
      panel.appendChild(h);
      const rows = document.createElement('div');
      rows.className = 'variant-pick-checks';
      const boxes = [];
      for (const v of list) {
        const row = document.createElement('label');
        row.className = 'variant-pick-check-row';
        const span = document.createElement('span');
        span.className = 'variant-pick-check-label';
        span.textContent = variantShortLabel(v) || v.label;
        if (v.label && variantShortLabel(v) && variantShortLabel(v) !== v.label) {
          span.title = v.label;
        }
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'variant-pick-check';
        cb.checked = pre.has(v.id);
        cb.value = v.id;
        row.appendChild(span);
        row.appendChild(cb);
        rows.appendChild(row);
        boxes.push(cb);
      }
      panel.appendChild(rows);
      const actions = document.createElement('div');
      actions.className = 'variant-pick-actions';
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn touch primary';
      ok.textContent = 'OK';
      ok.addEventListener('click', () => {
        const ids = boxes.filter((b) => b.checked).map((b) => b.value);
        cleanup();
        resolve(ids);
      });
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn touch';
      cancel.textContent = 'Abbrechen';
      cancel.addEventListener('click', () => { cleanup(); resolve(null); });
      actions.appendChild(ok);
      actions.appendChild(cancel);
      panel.appendChild(actions);
      backdrop.appendChild(panel);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { cleanup(); resolve(null); }
      });
      document.body.appendChild(backdrop);
      function cleanup() { try { backdrop.remove(); } catch (_) {} }
    });
  }

  /** v1.95: Geräte, die noch aus einer Shared-Gruppe herausgelöst werden können.
   *  Einzelspezialseiten zählen als vergeben. Letztes Gerät allein auf Shared
   *  zählt nicht mehr als „unused“ (Chip erscheint schon einzeln; +Variante sinnlos). */
  let variantBarCollapsed = false; /* v1.96: Leiste eingeklappt */

  function syncVariantBarCollapsedUi() {
    const bar = document.getElementById('variantBar');
    const btn = document.getElementById('variantBarToggle');
    const label = document.getElementById('variantBarToggleLabel');
    if (!bar) return;
    bar.classList.toggle('is-collapsed', !!variantBarCollapsed);
    /* v2.13: nur schreiben, wenn sich etwas ändert (kein DOM-Umbau während eines Taps) */
    const txt = variantBarCollapsed ? 'Varianten-Leiste ausklappen' : 'Varianten-Leiste einklappen';
    if (btn) {
      const exp = variantBarCollapsed ? 'false' : 'true';
      if (btn.getAttribute('aria-expanded') !== exp) btn.setAttribute('aria-expanded', exp);
      if (btn.title !== txt) btn.title = txt;
    }
    if (label && label.textContent !== txt) {
      label.textContent = txt;
    }
  }

  function toggleVariantBarCollapsed() {
    variantBarCollapsed = !variantBarCollapsed;
    syncVariantBarCollapsedUi();
  }

  function unusedVariantsForSpecialize(page) {
    /* v1.99: + Variante targets devices that can still be split out of the
       current page-group pool — NOT unchecked page-1 devices outside the subset.
       Example: „Nur für A, B“ → pool is {A,B}; +Variante offers A and/or B until
       each has an exclusive single. C never appears. Shared „all“ pool: classic
       remaining without singles (≥2). */
    const variants = variantsList();
    if (!page || isFixedPage(page) || !variants.length) return [];
    const group = pageGroupIdOf(page);
    const siblings = pagesSharingGroup(group);
    const singleOwned = new Set();
    const multiMembers = new Set();
    let hasShared = false;
    for (const pg of siblings) {
      const ids = pageVariantScopeIds(pg);
      if (!ids) { hasShared = true; continue; }
      if (ids.length === 1) singleOwned.add(ids[0]);
      else ids.forEach((id) => multiMembers.add(id));
    }
    /* Pool = devices that belong to this step's variant pages:
       - shared present → all page-1 variants still without a single
       - otherwise → only members of multi-scope pages (the closed subset) */
    let pool;
    if (hasShared) {
      pool = variants.filter((v) => !singleOwned.has(v.id));
      if (pool.length < 2) return []; /* sole shared remnant */
      return pool;
    }
    pool = variants.filter((v) => multiMembers.has(v.id) && !singleOwned.has(v.id));
    /* Need at least one multi page with ≥2 members still unspecialized as singles,
       or ≥2 pool entries so splitting makes sense. */
    if (pool.length < 2) return [];
    return pool;
  }

  function updateVariantBar() {
    const bar = document.getElementById('variantBar');
    if (!bar) return;
    const addBtn = document.getElementById('variantAddBtn');
    const switchBtn = document.getElementById('variantSwitchBtn');
    const onlyBtn = document.getElementById('variantOnlyBtn');
    syncVariantsFromPage();
    const variants = variantsList();
    const page = currentPage();
    /* v1.88: Varianten- und Fehlerseite gelten immer für alle → keine untere Leiste */
    const hideBookendBar = !!(page && (isVariantenPage(page) || isFehlerPage(page)));
    const show = !!(state.editMode && variants.length >= 2 && !hideBookendBar);
    /* v2.13: Attribute/DOM nur bei echter Änderung schreiben (siehe renderVariantBarChips) */
    const setHidden = (node, h) => { if (node && node.hidden !== !!h) node.hidden = !!h; };
    setHidden(bar, !show);
    el.app.classList.toggle('variant-bar-visible', show);
    if (switchBtn) {
      setHidden(switchBtn, true);
      if (switchBtn.getAttribute('aria-hidden') !== 'true') switchBtn.setAttribute('aria-hidden', 'true');
    }
    if (!show) {
      const host = document.getElementById('variantBarChips');
      if (host && host.firstChild) host.innerHTML = '';
      if (host) { host.__variantSig = null; host.__variantOpts = null; }
      bar.classList.remove('is-collapsed');
      return;
    }
    syncVariantBarCollapsedUi();

    const onLayout = page && !isFixedPage(page) && !isVariantenPage(page);
    const group = onLayout ? pageGroupIdOf(page) : null;
    const siblings = group ? pagesSharingGroup(group) : [];
    const specialized = siblings.filter((pg) => !!pageVariantScopeIds(pg));
    const switchOpts = buildPageVariantSwitchOptions(page);
    renderVariantBarChips(switchOpts);

    if (!onLayout) {
      setHidden(addBtn, true);
      setHidden(onlyBtn, true);
      return;
    }

    /* v1.98: + Variante aus nur wenn unusedVariantsForSpecialize leer
       (jedes Gerät hat Exclusive-Single bzw. alleiniger Shared-Rest nach Singles).
       Chip-Anzahl == Geräte allein reicht nicht: A,B-Multi + C-Chip darf +Variante behalten. */
    const availableForAdd = unusedVariantsForSpecialize(page);
    const allChipsAreSingles =
      variants.length >= 2 &&
      switchOpts.length >= variants.length &&
      switchOpts.every((o) => Array.isArray(o.groupIds) && o.groupIds.length === 1);
    const hideAdd = availableForAdd.length === 0 || allChipsAreSingles;
    const pageAlreadyMulti =
      siblings.length >= 2 || specialized.length >= 1 || !!pageVariantScopeIds(page);

    setHidden(addBtn, hideAdd);
    setHidden(onlyBtn, pageAlreadyMulti);
  }

  async function onVariantAddClick() {
    const variants = variantsList();
    if (variants.length < 2) return;
    const page = currentPage();
    if (!page || isFixedPage(page)) return;
    const available = unusedVariantsForSpecialize(page);
    if (!available.length) {
      flash('Alle Varianten haben bereits eine Spezialseite');
      updateVariantBar();
      return;
    }
    const id = await pickVariantFromList('Neue Variante anlegen für', available, {
      greyCurrent: false,
      autoSingle: false,
    });
    if (!id) return;
    specializeCurrentPageForVariant(id);
  }

  async function onVariantSwitchClick() {
    /* v1.94: Wechsel über Chips – Legacy-Einstieg behalten */
    const page = currentPage();
    const options = buildPageVariantSwitchOptions(page).filter((o) => !o.current && !o.inert);
    if (!options.length) return;
    await activateVariantChip(options[0]);
  }

  async function onVariantOnlyClick() {
    const variants = variantsList();
    if (!variants.length) return;
    const page = currentPage();
    if (!page || isFixedPage(page) || isVariantenPage(page)) {
      flash('Nur Layout-Seiten können auf Varianten beschränkt werden', 4000, 'error');
      return;
    }
    const existing = pageVariantScopeIds(page) || variants.map((v) => v.id);
    const picked = await pickVariantsMultiCheckbox(
      'Nur für bestimmte Variante(n)',
      variants,
      existing
    );
    if (picked == null) return; /* Abbrechen */
    if (!picked.length) {
      flash('Bitte mindestens eine Variante wählen', 3500, 'error');
      return;
    }
    convertCurrentPageToVariantSubset(picked);
  }

  function fehlerRowHasContent(r) {
    if (!r) return false;
    return !!(
      String(r.date || '').trim() ||
      String(r.description || '').trim() ||
      String(r.cause || '').trim() ||
      String(r.remedy || '').trim()
    );
  }

  function todayDDMMYY() {
    try {
      const parts = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
      }).formatToParts(new Date());
      const d = (parts.find((p) => p.type === 'day') || {}).value || '01';
      const m = (parts.find((p) => p.type === 'month') || {}).value || '01';
      const y = (parts.find((p) => p.type === 'year') || {}).value || '00';
      return d + '.' + m + '.' + y;
    } catch (_) {
      const now = new Date();
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = String(now.getFullYear()).slice(-2);
      return d + '.' + m + '.' + y;
    }
  }

  function normalizeFehlerEmbed(embed) {
    if (!embed || typeof embed !== 'object') return null;
    const ids = [];
    const seen = new Set();
    let raw = [];
    if (Array.isArray(embed.rowIds)) {
      raw = embed.rowIds;
    } else if (Array.isArray(embed.rows)) {
      raw = embed.rows.map((r) => (r && typeof r.id === 'string' ? r.id : null));
    }
    for (const id of raw) {
      if (typeof id !== 'string' || !id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    return ids.length ? { rowIds: ids } : null;
  }

  function getFehlerPage() {
    const pages = state.doc && state.doc.pages;
    if (!pages || !pages.length) return null;
    const last = pages[pages.length - 1];
    return isFehlerPage(last) ? last : null;
  }

  function resolveFehlerEmbedRows(page) {
    const embed = page && page.fehlerEmbed ? normalizeFehlerEmbed(page.fehlerEmbed) : null;
    if (!embed) return [];
    const fp = getFehlerPage();
    if (!fp) return [];
    padFehlerRows(fp);
    const byId = new Map();
    for (const r of fp.rows) {
      if (r && typeof r.id === 'string') byId.set(r.id, r);
    }
    const out = [];
    for (const id of embed.rowIds) {
      const row = byId.get(id);
      if (row) out.push(row);
    }
    return out;
  }

  function collectEmbedRowIds(pages) {
    const ids = new Set();
    if (!Array.isArray(pages)) return ids;
    for (const p of pages) {
      if (!p || isIndexPage(p) || isFehlerPage(p) || isVariantenPage(p)) continue;
      const embed = normalizeFehlerEmbed(p.fehlerEmbed);
      if (!embed) continue;
      for (const id of embed.rowIds) ids.add(id);
    }
    return ids;
  }

  function normalizeIndexRows(rows) {
    if (!Array.isArray(rows)) rows = [];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      if (out.length >= INDEX_MAX_ROWS) break;
      const tpRaw = r.targetPage;
      let tp = typeof tpRaw === 'number' && isFinite(tpRaw) ? Math.round(tpRaw) : parseInt(tpRaw, 10);
      if (!isFinite(tp) || tp < 1) tp = 0;
      out.push({
        id: typeof r.id === 'string' ? r.id : uid('r'),
        text: typeof r.text === 'string' ? r.text : '',
        targetPage: tp,
      });
    }
    while (out.length < INDEX_MAX_ROWS) {
      out.push(makeIndexRow('', 0));
    }
    return out;
  }

  function normalizeIndexPage(p) {
    return {
      id: (p && typeof p.id === 'string') ? p.id : uid('p'),
      kind: 'index',
      title: (p && typeof p.title === 'string' && p.title) ? p.title : 'Arbeitsschritte',
      rows: normalizeIndexRows(p && p.rows),
    };
  }

  function normalizeFehlerRows(rows) {
    if (!Array.isArray(rows)) rows = [];
    const out = [];
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      if (out.length >= INDEX_MAX_ROWS) break;
      out.push({
        id: typeof r.id === 'string' ? r.id : uid('r'),
        date: typeof r.date === 'string' ? r.date : '',
        description: typeof r.description === 'string' ? r.description : '',
        cause: typeof r.cause === 'string' ? r.cause : '',
        remedy: typeof r.remedy === 'string' ? r.remedy : '',
        sourcePageId: (typeof r.sourcePageId === 'string' && r.sourcePageId) ? r.sourcePageId : null,
      });
    }
    while (out.length < INDEX_MAX_ROWS) {
      out.push(makeFehlerRow());
    }
    return out;
  }

  function normalizeFehlerPage(p) {
    return {
      id: (p && typeof p.id === 'string') ? p.id : uid('p'),
      kind: 'fehler',
      title: (p && typeof p.title === 'string' && p.title) ? p.title : 'Fehleranalyse',
      rows: normalizeFehlerRows(p && p.rows),
    };
  }

  function ensureBookends(pages) {
    const list = Array.isArray(pages) ? pages.slice() : [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) continue;
      if (p.kind === 'index' || p.kind === 'fehler' || p.kind === 'varianten') continue;
      if (!p.kind) p.kind = 'layout';
      /* v1.85: Varianten-Felder an Layout-Seiten normalisieren */
      if (typeof p.pageGroupId !== 'string' || !p.pageGroupId) p.pageGroupId = p.id || uid('g');
      if (typeof p.variantScope !== 'string' || !p.variantScope) p.variantScope = 'all';
      const embed = normalizeFehlerEmbed(p.fehlerEmbed);
      if (embed) p.fehlerEmbed = embed;
      else delete p.fehlerEmbed;
    }

    const embedIds = collectEmbedRowIds(list);

    let fehlerId = null;
    let fehlerTitle = 'Fehleranalyse';
    const mergedFehler = [];
    const seenFehlerIds = new Set();
    for (const p of list) {
      if (!isFehlerPage(p)) continue;
      if (!fehlerId && typeof p.id === 'string') fehlerId = p.id;
      if (typeof p.title === 'string' && p.title) fehlerTitle = p.title;
      const rows = Array.isArray(p.rows) ? p.rows : [];
      for (const r of rows) {
        if (!r || typeof r !== 'object') continue;
        const nr = {
          id: typeof r.id === 'string' ? r.id : uid('r'),
          date: typeof r.date === 'string' ? r.date : '',
          description: typeof r.description === 'string' ? r.description : '',
          cause: typeof r.cause === 'string' ? r.cause : '',
          remedy: typeof r.remedy === 'string' ? r.remedy : '',
          sourcePageId: (typeof r.sourcePageId === 'string' && r.sourcePageId) ? r.sourcePageId : null,
        };
        if (seenFehlerIds.has(nr.id)) continue;
        const keep = fehlerRowHasContent(nr) || embedIds.has(nr.id);
        if (keep && mergedFehler.length < INDEX_MAX_ROWS) {
          seenFehlerIds.add(nr.id);
          mergedFehler.push(nr);
        }
      }
    }

    // Also harvest any full row objects nested under legacy fehlerEmbed.rows
    for (const p of list) {
      if (!p || isIndexPage(p) || isFehlerPage(p) || isVariantenPage(p)) continue;
      const rawRows = p.fehlerEmbed && Array.isArray(p.fehlerEmbed.rows) ? p.fehlerEmbed.rows : [];
      for (const r of rawRows) {
        if (!r || typeof r !== 'object') continue;
        const nr = {
          id: typeof r.id === 'string' ? r.id : uid('r'),
          date: typeof r.date === 'string' ? r.date : '',
          description: typeof r.description === 'string' ? r.description : '',
          cause: typeof r.cause === 'string' ? r.cause : '',
          remedy: typeof r.remedy === 'string' ? r.remedy : '',
          sourcePageId: (typeof r.sourcePageId === 'string' && r.sourcePageId) ? r.sourcePageId : null,
        };
        if (seenFehlerIds.has(nr.id)) continue;
        if (mergedFehler.length < INDEX_MAX_ROWS) {
          seenFehlerIds.add(nr.id);
          mergedFehler.push(nr);
        }
      }
    }

    /* v1.85: Varianten-Seite als erstes Bookend; Index danach
       v1.91: vorhandene Varianten-Seite wiederverwenden (auch Titel-Recover);
       bei Duplikat (leeres kind:varianten + befüllte Layout-„Varianten“) Inhalt bevorzugen;
       keine zweite leere Bookend-Seite; kein automatisches Blank-Layout. */
    const variantenCandidates = [];
    let indexSrc = null;
    for (const p of list) {
      if (!p) continue;
      if (looksLikeVariantenPage(p)) variantenCandidates.push(p);
      if (isIndexPage(p) && !indexSrc) indexSrc = p;
    }
    function variantenCandidateScore(pg) {
      if (!pg || !pg.root) return 0;
      let score = (pg.kind === 'varianten') ? 1 : 0;
      const walk = (c) => {
        if (!c) return;
        if (c.type === 'leaf') {
          if (c.photo) score += 4;
          if (typeof c.caption === 'string' && c.caption.trim()) score += 2;
          return;
        }
        walk(c.a);
        walk(c.b);
      };
      walk(pg.root);
      return score;
    }
    let variantenPage = null;
    if (variantenCandidates.length) {
      variantenPage = variantenCandidates.slice().sort((a, b) =>
        variantenCandidateScore(b) - variantenCandidateScore(a)
      )[0];
    }
    variantenPage = normalizeVariantenPage(variantenPage || makeVariantenPage());
    const variantenId = variantenPage && variantenPage.id;
    const indexPage = normalizeIndexPage(indexSrc || makeIndexPage());

    const middle = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p) continue;
      /* Alle Varianten-Bookends (echt oder Titel-Recover) sowie Index überspringen */
      if (looksLikeVariantenPage(p) || isVariantenPage(p) || isIndexPage(p)) continue;
      if (variantenId && p.id === variantenId) continue;
      if (isFehlerPage(p)) continue; // Canonical fehler at end
      if (!p.pageGroupId) p.pageGroupId = p.id || uid('g');
      if (!p.variantScope) p.variantScope = 'all';
      middle.push(p);
    }
    /* v1.91: Kein makePage() mehr hier — sonst entsteht beim Öffnen/Migraten
       eine Extra-Leerseite. Neue Projekte bekommen die Layout-Seite über makeDocument(). */

    const fehlerPage = normalizeFehlerPage({
      id: fehlerId || uid('p'),
      kind: 'fehler',
      title: fehlerTitle,
      rows: mergedFehler,
    });

    // Drop embed ids that no longer exist on the canonical fehler page
    const liveIds = new Set(fehlerPage.rows.map((r) => r.id));
    for (const p of middle) {
      if (!p || !p.fehlerEmbed) continue;
      const embed = normalizeFehlerEmbed(p.fehlerEmbed);
      if (!embed) {
        delete p.fehlerEmbed;
        continue;
      }
      const kept = embed.rowIds.filter((id) => liveIds.has(id));
      if (kept.length) p.fehlerEmbed = { rowIds: kept };
      else delete p.fehlerEmbed;
    }

    return [variantenPage].concat([indexPage]).concat(middle).concat([fehlerPage]);
  }

  /** @deprecated use ensureBookends */
  function ensureIndexFirst(pages) {
    return ensureBookends(pages);
  }

  function updateChromeForPage() {
    const page = currentPage();
    const onIndex = isIndexPage(page);
    const onFehler = isFehlerPage(page);
    const onVarianten = isVariantenPage(page);
    const onFixed = onIndex || onFehler; /* Annotationen/Fehler-Embed nur Layout */
    el.app.classList.toggle('index-page-active', onIndex);
    el.app.classList.toggle('fehler-page-active', onFehler);
    el.app.classList.toggle('varianten-page-active', onVarianten);
    try { syncVariantsFromPage(); } catch (_) {}
    try { updateVariantBar(); } catch (_) {}
    /* v1.85: auf der Varianten-Seite keine Stückliste (Button + Menü) */
    try {
      const hideSt = onVarianten;
      if (el.pdfViewBtn) {
        el.pdfViewBtn.hidden = hideSt;
        el.pdfViewBtn.setAttribute('aria-hidden', hideSt ? 'true' : 'false');
      }
      const sec = document.getElementById('stuecklisteSection');
      if (sec) sec.hidden = hideSt;
      if (el.stuecklisteAddBtn) el.stuecklisteAddBtn.hidden = hideSt;
      if (el.stuecklisteShowBtn) el.stuecklisteShowBtn.hidden = hideSt;
    } catch (_) {}
    if (el.fehlerBtn) {
      // + Fehler only on layout pages (not Index, not Fehleranalyse)
      el.fehlerBtn.disabled = onFixed || !state.editMode;
      el.fehlerBtn.hidden = onFixed;
      el.fehlerBtn.setAttribute('aria-hidden', onFixed ? 'true' : 'false');
      if (onFixed) el.fehlerBtn.title = 'Nur auf Layout-Seiten';
      else el.fehlerBtn.title = '+ Fehler';
    }
    if (onFixed && state.editMode) {
      if (state.splitTool) setSplitTool(false);
      if (state.photoMoveMode) setPhotoMoveMode(false);
      if (state.photoRotateMode) setPhotoRotateMode(false);
      if (state.teleportMode) setTeleportMode(false);
      if (state.annTool) setAnnTool(null);
    } else if (onVarianten && state.editMode) {
      /* v1.85: Varianten = Foto + Unterteilung, keine Markierungen */
      if (state.teleportMode) setTeleportMode(false);
      if (state.annTool) setAnnTool(null);
    }
    /* v2.05: ± Seite je Bookend — Varianten/Fehler: keines; Index: nur +; Layout: beide.
       Außerhalb Edit: hidden zurücksetzen (.edit-tools blendet die Gruppe ohnehin aus). */
    try {
      const remHide = !!(state.editMode && (onVarianten || onIndex || onFehler));
      const addHide = !!(state.editMode && (onVarianten || onFehler));
      if (el.removePageBtn) {
        el.removePageBtn.hidden = remHide;
        el.removePageBtn.setAttribute('aria-hidden', remHide ? 'true' : 'false');
      }
      if (el.addPageBtn) {
        el.addPageBtn.hidden = addHide;
        el.addPageBtn.setAttribute('aria-hidden', addHide ? 'true' : 'false');
      }
    } catch (_) {}
    try { updateHighlightToolUI(); } catch (_) {}
  }

  const state = {
    editMode: false,
    splitTool: null, // null | 'v' | 'h'
    photoMoveMode: false,
    photoRotateMode: false,
    arrowKind: 'straight', // v1.13: zuletzt gewählte Pfeilart (bleibt in der Sitzung)
    teleportMode: false,
    teleportPhoto: null,
    teleportSourceId: null,
    annTool: null,
    annColor: null, // v1.10: Farbe des aktiven Werkzeugs (Rechteck/Kreis/Text)
    doc: makeDocument(),
    /** Chronological, project-local edit history; persisted in project.json. */
    changeLog: [],
    selectedId: null,
    selectedSplitId: null,
    liveLeafId: null,
    stream: null,
    liveVideoEl: null,
    /** Embedded BEAK Stückliste PDF: { name, dataUrl } | null (aktive Variante bzw. Projekt) */
    stueckliste: null,
    /** v1.85: Stücklisten je Varianten-ID */
    variantStuecklisten: {},
    /** v1.85: aktive Variante im Viewer/Editor (null = noch keine gewählt) */
    activeVariantId: null,
    /** In-memory tally: formatted BEAK-Nr. → used quantity (stub for later PDF marking) */
    beakUsage: {},
  };

  /* v1.10: Auswahländerungen → Farbleiste aktualisieren (Setter statt ~20 Aufrufstellen) */
  (function hookSelectedId() {
    let sel = state.selectedId;
    Object.defineProperty(state, 'selectedId', {
      get() { return sel; },
      set(v) {
        const changed = v !== sel;
        sel = v;
        if (changed && typeof scheduleAnnColorBar === 'function') scheduleAnnColorBar();
      },
      enumerable: true,
      configurable: true,
    });
  })();

  let projectFileHandle = null;
  let loadedSaveFileName = null;
  let lastBuiltDocSig = null; /* v1.58: signature of last built project.json */
  /* v1.55: Dokument geöffnet? (false → Willkommen). sessionDirty = Änderungen seit Öffnen/Sichern. */
  let docOpen = false;
  let sessionDirty = false;
  const TOUR_DONE_KEY = 'anweisungen-tour-done';

  const el = {
    app: document.getElementById('app'),
    menuBtn: document.getElementById('menuBtn'),
    ladenBtn: document.getElementById('ladenBtn'),
    sichernBtn: document.getElementById('sichernBtn'),
    fertigBtn: document.getElementById('fertigBtn'),
    editorBtn: document.getElementById('editorBtn'),
    addPageBtn: document.getElementById('addPageBtn'),
    removePageBtn: document.getElementById('removePageBtn'),
    photoMoveBtn: document.getElementById('photoMoveBtn'),
    photoRotateBtn: document.getElementById('photoRotateBtn'),
    teleportBtn: document.getElementById('teleportBtn'),
    toolPhotoClipboard: document.getElementById('toolPhotoClipboard'),
    pageIndicator: document.getElementById('pageIndicator'),
    drawer: document.getElementById('drawer'),
    menuBackdrop: document.getElementById('menuBackdrop'),
    pdfExportItem: document.getElementById('pdfExportItem'),
    changeLogExportItem: document.getElementById('changeLogExportItem'),
    changeLogBackdrop: document.getElementById('changeLogBackdrop'),
    changeLogText: document.getElementById('changeLogText'),
    changeLogCopyBtn: document.getElementById('changeLogCopyBtn'),
    changeLogDownloadBtn: document.getElementById('changeLogDownloadBtn'),
    changeLogCloseBtn: document.getElementById('changeLogCloseBtn'),
    deviceNicknameBtn: document.getElementById('deviceNicknameBtn'),
    deviceNicknameHint: document.getElementById('deviceNicknameHint'),
    deviceNicknameBackdrop: document.getElementById('deviceNicknameBackdrop'),
    deviceNicknameInput: document.getElementById('deviceNicknameInput'),
    deviceNicknameCancel: document.getElementById('deviceNicknameCancel'),
    deviceNicknameSave: document.getElementById('deviceNicknameSave'),
    toolRect: document.getElementById('toolRect'),
    toolCircle: document.getElementById('toolCircle'),
    toolText: document.getElementById('toolText'),
    toolTextSm: document.getElementById('toolTextSm'),
    toolButton: document.getElementById('toolButton'),
    toolInfo: document.getElementById('toolInfo'),
    toolSplitV: document.getElementById('toolSplitV'),
    toolSplitH: document.getElementById('toolSplitH'),
    statusFlash: document.getElementById('statusFlash'),
    pageViewport: document.getElementById('pageViewport'),
    pageTrack: document.getElementById('pageTrack'),
    cameraFile: document.getElementById('cameraFile'),
    libraryFile: document.getElementById('libraryFile'),
    projectFile: document.getElementById('projectFile'),
    confirmBackdrop: document.getElementById('confirmBackdrop'),
    confirmMessage: document.getElementById('confirmMessage'),
    confirmCancel: document.getElementById('confirmCancel'),
    confirmOk: document.getElementById('confirmOk'),
    progressBackdrop: document.getElementById('progressBackdrop'),
    progressMessage: document.getElementById('progressMessage'),
    fehlerBtn: document.getElementById('fehlerBtn'),
    overviewBtn: document.getElementById('overviewBtn'),
    firstPageBtn: document.getElementById('firstPageBtn'),
    indexPageBtn: document.getElementById('indexPageBtn'),
    lastPageBtn: document.getElementById('lastPageBtn'),
    overviewBackdrop: document.getElementById('overviewBackdrop'),
    overviewPanel: document.getElementById('overviewPanel'),
    overviewGrid: document.getElementById('overviewGrid'),
    overviewCloseBtn: document.getElementById('overviewCloseBtn'),
    toolBeakNr: document.getElementById('toolBeakNr'),
    stuecklisteAddBtn: document.getElementById('stuecklisteAddBtn'),
    pdfViewBtn: document.getElementById('pdfViewBtn'),
    annColorBar: document.getElementById('annColorBar'),
    annArrowBar: document.getElementById('annArrowBar'),
    toolArrow: document.getElementById('toolArrow'),
    toolHighlight: document.getElementById('toolHighlight'),
    copyPasteCallout: document.getElementById('copyPasteCallout'),
    copyPasteActionBtn: document.getElementById('copyPasteActionBtn'),
    stuecklisteShowBtn: document.getElementById('stuecklisteShowBtn'),
    displayModeFillBtn: document.getElementById('displayModeFillBtn'),
    displayModeWindowBtn: document.getElementById('displayModeWindowBtn'),
    displayModeFillCheck: document.getElementById('displayModeFillCheck'),
    displayModeWindowCheck: document.getElementById('displayModeWindowCheck'),
    stuecklisteFile: document.getElementById('stuecklisteFile'),
    beakPdfLightbox: document.getElementById('beakPdfLightbox'),
    laufzettelLightbox: document.getElementById('laufzettelLightbox'),
    laufzettelIframe: document.getElementById('laufzettelIframe'),
    laufzettelCloseBtn: document.getElementById('laufzettelCloseBtn'),
    laufzettelHomeBtn: document.getElementById('laufzettelHomeBtn'),
    laufzettelTitle: document.getElementById('laufzettelTitle'),
    laufzettelInfo: document.getElementById('laufzettelInfo'),
    beakPdfFrame: document.getElementById('beakPdfFrame'),
    beakPdfFrameInner: document.getElementById('beakPdfFrameInner'),
    beakCheckHeader: document.getElementById('beakCheckHeader'),
    beakCheckList: document.getElementById('beakCheckList'),
    hinweisBackdrop: document.getElementById('hinweisBackdrop'),
    hinweisMessage: document.getElementById('hinweisMessage'),
    hinweisOk: document.getElementById('hinweisOk'),
    welcomeScreen: document.getElementById('welcomeScreen'),
    welcomeNewBtn: document.getElementById('welcomeNewBtn'),
    welcomeOpenBtn: document.getElementById('welcomeOpenBtn'),
    welcomeTourBtn: document.getElementById('welcomeTourBtn'),
    welcomeVersion: document.getElementById('welcomeVersion'),
    welcomeActions: document.getElementById('welcomeActions'),
    welcomeInitialsOverlay: document.getElementById('welcomeInitialsOverlay'),
    welcomeInitialsInput: document.getElementById('welcomeInitialsInput'),
    welcomeInitialsSaveBtn: document.getElementById('welcomeInitialsSaveBtn'),
    appVersion: document.getElementById('appVersion'),
    tourOverlay: document.getElementById('tourOverlay'),
    tourSpotlight: document.getElementById('tourSpotlight'),
    tourCard: document.getElementById('tourCard'),
    tourStepLabel: document.getElementById('tourStepLabel'),
    tourTitle: document.getElementById('tourTitle'),
    tourBody: document.getElementById('tourBody'),
    tourSkipBtn: document.getElementById('tourSkipBtn'),
    tourBackBtn: document.getElementById('tourBackBtn'),
    tourNextBtn: document.getElementById('tourNextBtn'),
    drawerOpenBtn: document.getElementById('drawerOpenBtn'),
    drawerSaveBtn: document.getElementById('drawerSaveBtn'),
    drawerCloseBtn: document.getElementById('drawerCloseBtn'),
    drawerTourBtn: document.getElementById('drawerTourBtn'),
  };

  function currentPage() {
    return state.doc.pages[state.doc.pageIndex];
  }

  function viewportWidth() {
    return el.pageViewport.clientWidth || window.innerWidth;
  }

  function currentStage() {
    const slide = el.pageTrack.querySelector(
      '.page-slide[data-page-index="' + state.doc.pageIndex + '"]'
    );
    return slide ? slide.querySelector('.stage') : null;
  }

  function currentStageInner() {
    const stage = currentStage();
    return stage ? stage.querySelector('.stage-inner') : null;
  }

  function currentLayoutArea() {
    const inner = currentStageInner();
    if (!inner) return null;
    return inner.querySelector('.layout-area') || inner;
  }

  function findLeaf(cell, id) {
    if (!cell) return null;
    if (cell.type === 'leaf') return cell.id === id ? cell : null;
    return findLeaf(cell.a, id) || findLeaf(cell.b, id);
  }

  function findSplit(cell, id) {
    if (!cell || cell.type !== 'split') return null;
    if (cell.id === id) return cell;
    return findSplit(cell.a, id) || findSplit(cell.b, id);
  }

  function replaceLeafWithSplit(cell, leafId, splitNode) {
    if (!cell) return cell;
    if (cell.type === 'leaf') {
      return cell.id === leafId ? splitNode : cell;
    }
    return {
      ...cell,
      a: replaceLeafWithSplit(cell.a, leafId, splitNode),
      b: replaceLeafWithSplit(cell.b, leafId, splitNode),
    };
  }

  function replaceSplitWithLeaf(cell, splitId, leafNode) {
    if (!cell) return cell;
    if (cell.type === 'split' && cell.id === splitId) return leafNode;
    if (cell.type === 'leaf') return cell;
    return {
      ...cell,
      a: replaceSplitWithLeaf(cell.a, splitId, leafNode),
      b: replaceSplitWithLeaf(cell.b, splitId, leafNode),
    };
  }

  function findCellById(cell, id) {
    if (!cell) return null;
    if (cell.id === id) return cell;
    if (cell.type !== 'split') return null;
    return findCellById(cell.a, id) || findCellById(cell.b, id);
  }

  /** Blätter eines Teilbaums in Lesereihenfolge (a = links/oben zuerst). */
  function leavesOf(cell, out) {
    const list = out || [];
    if (!cell) return list;
    if (cell.type === 'leaf') list.push(cell);
    else { leavesOf(cell.a, list); leavesOf(cell.b, list); }
    return list;
  }

  /* v1.12: Unterteilung entfernen, ohne Fotos stillschweigend zu verlieren.
   * Bisher: der ganze Split-Knoten (beide Hälften inkl. Unter-Splits) wurde durch
   * EINE neue leere Zelle ersetzt → alle Fotos darin waren weg (ohne Rückfrage).
   * Jetzt: die zusammengelegte Zelle übernimmt das Foto (Zoom bleibt, Versatz
   * wird zurückgesetzt/neu zentriert). Gibt es mehrere Fotos, bleibt das erste
   * (links/oben) – das Löschen der übrigen muss bestätigt werden. */
  async function removeSplit(splitId) {
    if (!splitId) return;
    const page = currentPage();
    if (isFixedPage(page) || !page.root) return;
    const node = findCellById(page.root, splitId);
    if (!node || node.type !== 'split') return;
    const withPhoto = leavesOf(node).filter((l) => l.photo && (l.photo.src || l.photo.file));
    if (withPhoto.length > 1) {
      const lost = withPhoto.length - 1;
      const ok = await showConfirm(
        lost === 1
          ? 'Foto in dieser Zelle wird gelöscht – fortfahren?'
          : lost + ' Fotos in diesen Zellen werden gelöscht – fortfahren?',
        { okLabel: 'Löschen', cancelLabel: 'Abbrechen' }
      );
      if (!ok) return;
    }
    const keep = withPhoto[0] ? clonePhoto(withPhoto[0].photo) : null;
    if (keep) { keep.tx = 0; keep.ty = 0; }
    stopLiveCamera();
    // Vor dem Umbau erneut prüfen (Dialog war offen): Knoten existiert noch?
    if (!findCellById(page.root, splitId)) return;
    page.root = replaceSplitWithLeaf(page.root, splitId, makeLeaf(keep));
    state.selectedSplitId = null;
    renderAll();
    if (keep) flash(withPhoto.length > 1 ? 'Unterteilung entfernt – erstes Foto übernommen' : 'Unterteilung entfernt – Foto übernommen');
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function formatBeakNr(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (d.length === 4) return d.charAt(0) + '.' + d.slice(1);
    if (d.length === 6) return d.slice(0, 3) + '.' + d.slice(3);
    return d;
  }

  function beakNrDisplay(qty, digits) {
    const q = (typeof qty === 'number' && isFinite(qty) && qty > 0) ? Math.round(qty) : 1;
    const formatted = formatBeakNr(digits || '1234') || '1.234';
    /* v1.14: Menge 1 → nur die Nummer (ohne „1x “); ab 2 → „Nx “ */
    return q > 1 ? q + 'x ' + formatted : formatted;
  }

  function normalizeBeakAnnotation(a) {
    if (!a || typeof a !== 'object') return null;
    /* v1.14: ohne beakDigits den Text wie eine Eingabe auswerten („1x 8.617“ → Menge 1, 8617);
       fehlende Menge = 1 */
    const fromText = (a.beakDigits == null && a.text) ? parseBeakInput(a.text, null) : null;
    const digits = String(a.beakDigits != null ? a.beakDigits : (fromText ? fromText.beakDigits : '')).replace(/\D/g, '') || '1234';
    let qty = typeof a.qty === 'number' && isFinite(a.qty) ? Math.round(a.qty) : (fromText ? fromText.qty : 1);
    if (!(qty > 0)) qty = 1;
    return {
      id: a.id || uid('a'),
      type: 'beakNr',
      x: typeof a.x === 'number' ? a.x : 10,
      y: typeof a.y === 'number' ? a.y : 10,
      w: typeof a.w === 'number' ? a.w : 14,
      h: typeof a.h === 'number' ? a.h : 5,
      qty: qty,
      beakDigits: digits,
      text: beakNrDisplay(qty, digits),
    };
  }

  /* v1.14: Eingabe einer BEAK-Nr.-Markierung auswerten. Die Menge ist optional (fehlt = 1).
     Akzeptiert: „101.018“, „101018“, „1x 101.018“, „3x101018“, „3 x 101.018“, „3×101.018“.
     Ohne „x“: Punkt oder ≥ 4 Ziffern = Nummer (Menge 1); 1–3 Ziffern = nur Menge (bisherige
     iPad-Eingabe „Menge → Enter → Nummer“), Nummer bleibt. Leer = keine Änderung (null). */
  function isBeakQtyOnlyInput(raw) {
    const s = String(raw || '').trim();
    return /^\d{1,3}$/.test(s);
  }
  function parseBeakInput(raw, cur) {
    const s = String(raw || '').trim().replace(/×/g, 'x');
    const curDigits = String((cur && cur.beakDigits) || '').replace(/\D/g, '') || '1234';
    if (!s) return null;
    const m = s.match(/^(\d*)\s*[xX]+\s*([\d.\s]*)$/);
    if (m) {
      const q = parseInt(m[1], 10);
      const digits = m[2].replace(/\D/g, '');
      return { qty: (isFinite(q) && q > 0) ? q : 1, beakDigits: digits || curDigits };
    }
    const onlyDigits = s.replace(/\D/g, '');
    if (!onlyDigits) return null;
    if (isBeakQtyOnlyInput(s)) {
      const q = parseInt(onlyDigits, 10);
      return { qty: (isFinite(q) && q > 0) ? q : 1, beakDigits: curDigits };
    }
    return { qty: 1, beakDigits: onlyDigits };
  }

  function rebuildBeakUsage() {
    const tally = {};
    /* v1.85: Abgleich nur für sichtbare Seiten der aktiven Variante
       (gemeinsame + Varianten-eigene; andere Varianten-Exklusivseiten zählen nicht). */
    const vid = state.activeVariantId;
    const useFilter = hasMultipleVariants() && !!vid;
    for (const page of state.doc.pages) {
      if (!page || !Array.isArray(page.annotations)) continue;
      if (useFilter && !pageVisibleInViewer(page, vid)) continue;
      for (const a of page.annotations) {
        if (!a || a.type !== 'beakNr') continue;
        const key = formatBeakNr(a.beakDigits) || String(a.beakDigits || '').replace(/\D/g, '');
        if (!key) continue;
        const q = (typeof a.qty === 'number' && a.qty > 0) ? Math.round(a.qty) : 1;
        tally[key] = (tally[key] || 0) + q;
      }
    }
    state.beakUsage = tally;
    refreshStuecklisteChecklistColors();
  }

  function updateStuecklisteUi() {
    if (typeof scheduleHistoryCheck === 'function') scheduleHistoryCheck(120);
    /* v1.85: state.stueckliste = Stückliste der aktiven Variante (bzw. Projekt) */
    if (hasMultipleVariants() && state.activeVariantId) {
      const m = state.variantStuecklisten || {};
      state.stueckliste = m[state.activeVariantId] || null;
    }
    const has = !!(state.stueckliste && state.stueckliste.dataUrl);
    if (el.stuecklisteShowBtn) {
      el.stuecklisteShowBtn.disabled = !has;
    }
    if (el.pdfViewBtn) {
      el.pdfViewBtn.classList.toggle('no-pdf', !has);
      el.pdfViewBtn.title = has ? 'Stückliste (PDF) anzeigen' : 'Keine Stückliste eingebettet';
    }
  }

  /* ---- pdf.js laden (v1.8) ------------------------------------------------
   * 1. ES-Modul vendor/pdf.min.mjs (pdf.js 4.10.38 Legacy-Build, polyfilled für
   *    ältere iPad-Safari) mit echtem Worker vendor/pdf.worker.min.mjs.
   * 2. Fallback (file://, Electron, Modul-/Worker-Fehler): klassische Skripte
   *    vendor/pdf.legacy.iife.js + vendor/pdf.worker.legacy.iife.js; der Worker
   *    läuft dann im Hauptthread (globalThis.pdfjsWorker).
   * Fehler werden NICHT mehr verschluckt, sondern als Meldung angezeigt. */
  const APP_VERSION = '2.14';
  const PDF_ASSET_QS = '?v=' + APP_VERSION;
  function syncAppVersionLabels() {
    const label = 'Anweisungen · Version ' + APP_VERSION;
    try {
      if (el.appVersion) el.appVersion.textContent = label;
      else {
        const n = document.getElementById('appVersion');
        if (n) n.textContent = label;
      }
    } catch (_) {}
    try {
      if (el.welcomeVersion) el.welcomeVersion.textContent = label;
      else {
        const n = document.getElementById('welcomeVersion');
        if (n) n.textContent = label;
      }
    } catch (_) {}
  }
  syncAppVersionLabels();
  let beakPdfObjectUrl = null;
  let pdfJsLibPromise = null;
  let pdfJsClassicPromise = null;
  let pdfJsPreferClassic = false;

  if (typeof Promise.withResolvers !== 'function') {
    try {
      Promise.withResolvers = function withResolvers() {
        let resolve;
        let reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        return { promise, resolve, reject };
      };
    } catch (_) {}
  }

  function vendorAssetUrl(name) {
    try {
      return new URL('vendor/' + name + PDF_ASSET_QS, document.baseURI || window.location.href).href;
    } catch (_) {
      return 'vendor/' + name + PDF_ASSET_QS;
    }
  }

  function loadClassicScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Skript nicht ladbar: ' + src));
      document.head.appendChild(s);
    });
  }

  function loadPdfJsClassic() {
    if (pdfJsClassicPromise) return pdfJsClassicPromise;
    pdfJsClassicPromise = (async () => {
      if (!(window.pdfjsWorker && window.pdfjsWorker.WorkerMessageHandler)) {
        await loadClassicScript(vendorAssetUrl('pdf.worker.legacy.iife.js'));
      }
      if (!(window.pdfjsLib && window.pdfjsLib.getDocument)) {
        await loadClassicScript(vendorAssetUrl('pdf.legacy.iife.js'));
      }
      const lib = window.pdfjsLib;
      if (!lib || typeof lib.getDocument !== 'function') {
        throw new Error('pdf.js (Fallback) konnte nicht geladen werden');
      }
      if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = vendorAssetUrl('pdf.worker.min.mjs');
      return lib;
    })().catch((err) => {
      pdfJsClassicPromise = null;
      throw err;
    });
    return pdfJsClassicPromise;
  }

  function loadPdfJs() {
    if (pdfJsPreferClassic || window.location.protocol === 'file:') return loadPdfJsClassic();
    if (pdfJsLibPromise) return pdfJsLibPromise;
    pdfJsLibPromise = import(vendorAssetUrl('pdf.min.mjs')).then((mod) => {
      const lib = mod && typeof mod.getDocument === 'function' ? mod : (mod && mod.default);
      if (!lib || typeof lib.getDocument !== 'function') throw new Error('pdf.js Modul unvollständig');
      if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = vendorAssetUrl('pdf.worker.min.mjs');
      return lib;
    }).catch((err) => {
      console.warn('pdf.js ES-Modul nicht ladbar – klassischer Fallback', err);
      pdfJsPreferClassic = true;
      pdfJsLibPromise = null;
      return loadPdfJsClassic();
    });
    return pdfJsLibPromise;
  }

  /** Öffnet eine PDF mit pdf.js; bei Worker-Problemen Retry über den Hauptthread-Fallback. */
  async function openPdfDocument(bytes) {
    const opts = () => ({ data: bytes.slice(), isEvalSupported: false });
    const lib = await loadPdfJs();
    try {
      return await lib.getDocument(opts()).promise;
    } catch (err) {
      const name = err && err.name;
      if (name === 'InvalidPDFException' || name === 'PasswordException' || name === 'MissingPDFException') throw err;
      if (pdfJsPreferClassic) throw err;
      console.warn('pdf.js Worker fehlgeschlagen – Hauptthread-Fallback', err);
      pdfJsPreferClassic = true;
      const lib2 = await loadPdfJsClassic();
      return await lib2.getDocument(opts()).promise;
    }
  }

  let stuecklistePdfDocCache = { dataUrl: null, promise: null };
  function getStuecklistePdfDoc(dataUrl) {
    if (stuecklistePdfDocCache.dataUrl === dataUrl && stuecklistePdfDocCache.promise) {
      return stuecklistePdfDocCache.promise;
    }
    const promise = dataUrlToUint8(dataUrl).then((bytes) => openPdfDocument(bytes));
    stuecklistePdfDocCache = { dataUrl: dataUrl, promise: promise };
    promise.catch(() => {
      if (stuecklistePdfDocCache.promise === promise) stuecklistePdfDocCache = { dataUrl: null, promise: null };
    });
    return promise;
  }

  function isLagerplatzToken(s) {
    const t = String(s || '').trim();
    if (!t) return false;
    if (/^\d{1,3}\.\d{3}$/.test(t)) return false;
    if (/^\d{1,5}$/.test(t.replace(/\s/g, ''))) return false;
    // Location codes: GF, A1, A 147, TK 21, S 39, LP-C 19, FB 5, KL 162, B4, F, LP-A
    if (/^[A-Za-zÄÖÜäöü][A-Za-zÄÖÜäöü0-9\-]*(?:\s+\d+)?$/.test(t)) return true;
    if (/^[A-Za-zÄÖÜäöü]+\s*\d+$/.test(t)) return true;
    return false;
  }

  function isTitleDeviceLine(joined) {
    const j = String(joined || '');
    if (/\(\s*EDV-Nr\s*:/i.test(j)) return true;
    if (/^\d+\s*x\s+/i.test(j.trim()) && /EDV/i.test(j)) return true;
    return false;
  }

  function parseBedarfFromTokenList(tokens, startIdx) {
    for (let i = startIdx; i < tokens.length; i++) {
      const raw = String(tokens[i] || '').trim();
      const compact = raw.replace(/\s/g, '');
      if (/^\d{1,3}\.\d{3}$/.test(compact)) continue;
      if (isLagerplatzToken(raw)) continue;
      if (!/^\d{1,5}$/.test(compact)) continue;
      const n = parseInt(compact, 10);
      if (!isFinite(n) || n < 0 || n > 9999) continue;
      return n;
    }
    return null;
  }

  function parseRowJoinedFallback(joined) {
    const j = String(joined || '').replace(/\s+/g, ' ').trim();
    if (!j || isTitleDeviceLine(j)) return null;
    if (/Artikel-Beschreibung/i.test(j)) return null;
    if (/Lagerplatz/i.test(j) && /EDV-Nr/i.test(j)) return null;
    if (/^\s*BEAK\b/i.test(j) && /Bedarf/i.test(j)) return null;
    const edvReG = /\b(\d{1,3}\.\d{3})\b/g;
    let m;
    const hits = [];
    while ((m = edvReG.exec(j)) !== null) {
      hits.push({ edv: m[1], index: m.index, end: m.index + m[1].length });
    }
    if (!hits.length) return null;
    const hit = hits[0];
    const after = j.slice(hit.end);
    const tokens = after.split(/\s+/).filter(Boolean);
    const bedarf = parseBedarfFromTokenList(tokens, 0);
    if (bedarf == null) return null;
    const desc = j.slice(0, hit.index).trim();
    return { edv: hit.edv, bedarf: bedarf, description: desc };
  }

  function normalizeBeakKey(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return '';
    return formatBeakNr(digits) || digits;
  }

  function beakUsageQty(key) {
    if (!key) return 0;
    const usage = state.beakUsage || {};
    if (typeof usage[key] === 'number') return usage[key];
    const digits = String(key).replace(/\D/g, '');
    const alt = formatBeakNr(digits);
    if (alt && typeof usage[alt] === 'number') return usage[alt];
    if (digits && typeof usage[digits] === 'number') return usage[digits];
    return 0;
  }

  /* ---- Stückliste-Parser (v1.8) ------------------------------------------
   * Reine Funktion über pdf.js-Textitems einer Seite ({str,x,y,w,h} in PDF-
   * Koordinaten, y nach oben). Spalten werden aus den Kopfzellen „EDV-Nr.“ und
   * „Bedarf“/„Stck“ gelernt (X-Bereich [x0,x1]; Zahlen stehen rechtsbündig).
   * Pro Tabellenzeile: EDV-Zelle (d.ddd / ddd.ddd) im EDV-Band, Bedarf-Zelle
   * (Ganzzahl) im Bedarf-Band. Liefert Zeilen-BBox für die PDF-Markierung. */
  const BOM_EDV_CELL_RE = /^\d{1,3}\.\d{3}$/;

  function bomItemsFromTextContent(tc) {
    const out = [];
    for (const it of (tc && tc.items) || []) {
      const str = String((it && it.str) || '');
      if (!str.trim()) continue;
      const t = it.transform || [1, 0, 0, 1, 0, 0];
      const fs = Math.hypot(t[2] || 0, t[3] || 0) || Math.abs(t[3] || 0) || 9;
      out.push({
        str: str,
        x: t[4] || 0,
        y: t[5] || 0,
        w: typeof it.width === 'number' && it.width > 0 ? it.width : str.length * fs * 0.5,
        h: typeof it.height === 'number' && it.height > 0 ? it.height : fs,
      });
    }
    return out;
  }

  function bomFindColumns(items) {
    const edvHead = items.find((it) => {
      const s = it.str.trim();
      return /(^|\s)EDV-?\s?Nr\.?$/i.test(s) && !/[(:]/.test(s) && s.length <= 16;
    });
    if (!edvHead) return null;
    const nearHead = (it) => Math.abs(it.y - edvHead.y) <= Math.max(18, edvHead.h * 2.2);
    const stck = items.find((it) => nearHead(it) && /^(Bedarf\s*)?Stck\.?$/i.test(it.str.trim()));
    const bed = items.find((it) => nearHead(it) && /^Bedarf\b/i.test(it.str.trim()));
    const beak = items.find((it) => nearHead(it) && /^BEAK$/i.test(it.str.trim())
      && Math.abs((it.x + it.w / 2) - (edvHead.x + edvHead.w / 2)) < 40);
    const bedCells = [stck, bed].filter(Boolean);
    const headerCells = [edvHead].concat(bedCells, beak ? [beak] : []);
    return {
      edv: { x0: edvHead.x, x1: edvHead.x + edvHead.w },
      bedarf: bedCells.length ? {
        x0: Math.min.apply(null, bedCells.map((c) => c.x)),
        x1: Math.max.apply(null, bedCells.map((c) => c.x + c.w)),
      } : null,
      headerBottom: Math.min.apply(null, [edvHead].concat(bedCells).map((c) => c.y)) - 1,
      headerTop: Math.max.apply(null, headerCells.map((c) => c.y + c.h)),
      headerCells: headerCells,
    };
  }

  function bomGroupRows(items) {
    const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of sorted) {
      const last = rows[rows.length - 1];
      const tol = Math.max(2.5, 0.35 * Math.min(it.h, last ? last.h : it.h));
      if (!last || Math.abs(last.y - it.y) > tol) {
        rows.push({ y: it.y, h: it.h, cells: [it] });
      } else {
        last.cells.push(it);
        last.h = Math.max(last.h, it.h);
      }
    }
    for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
    return rows;
  }

  function bomOverlaps(it, band, pad) {
    return (it.x + it.w) >= band.x0 - pad && it.x <= band.x1 + pad;
  }

  function bomParseQty(raw) {
    const s = String(raw || '').trim().replace(/\s/g, '');
    if (/^\d{1,5}$/.test(s)) return parseInt(s, 10);
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ''), 10); // 1.000
    return null;
  }

  /**
   * @param items Textitems einer Seite
   * @param pageNo 1-basiert
   * @param prevCols Spalten der Vorseite (Folgeseiten ohne Kopf)
   * @returns {{ rows: Array, cols: Object|null, tableRows: Array }}
   */
  function parseStuecklistePageItems(items, pageNo, prevCols) {
    const found = bomFindColumns(items);
    const cols = found || prevCols || null;
    const result = { rows: [], cols: cols, headerFound: !!found, tableRows: [] };
    const bodyItems = found ? items.filter((it) => it.y < found.headerBottom) : items.slice();
    const rows = bomGroupRows(bodyItems);

    // Tabellenbreite für die ganze Zeilenmarkierung
    let tableX0 = Infinity;
    let tableX1 = -Infinity;

    for (const r of rows) {
      const joined = r.cells.map((c) => c.str).join(' ');
      if (isTitleDeviceLine(joined)) continue;
      if (/^Gedruckt von\b/i.test(joined.trim()) || /\bSeite\s+\d+\s+von\s+\d+\b/i.test(joined)) continue;

      let edvCell = null;
      if (cols) {
        let best = Infinity;
        for (const c of r.cells) {
          if (!BOM_EDV_CELL_RE.test(c.str.trim())) continue;
          if (!bomOverlaps(c, cols.edv, 18)) continue;
          const d = Math.abs((c.x + c.w) - cols.edv.x1);
          if (d < best) { best = d; edvCell = c; }
        }
      }

      let edv = edvCell ? edvCell.str.trim() : null;
      let bedarf = null;
      let bedarfCell = null;
      let desc = '';
      let source = 'spalte';

      if (edvCell) {
        desc = r.cells.filter((c) => c.x + c.w <= edvCell.x + 1).map((c) => c.str).join(' ');
        if (cols.bedarf) {
          let best = Infinity;
          for (const c of r.cells) {
            if (c === edvCell) continue;
            const q = bomParseQty(c.str);
            if (q == null) continue;
            if (!bomOverlaps(c, cols.bedarf, 14)) continue;
            const d = Math.abs((c.x + c.w) - cols.bedarf.x1);
            if (d < best) { best = d; bedarf = q; bedarfCell = c; }
          }
        }
        if (bedarf == null) {
          // Fallback: erste Ganzzahl rechts der EDV-Zelle, die kein Lagerplatz ist
          const limit = cols.bedarf ? cols.bedarf.x1 + 40 : Infinity;
          for (const c of r.cells) {
            if (c.x <= edvCell.x + edvCell.w || c.x > limit) continue;
            if (isLagerplatzToken(c.str)) continue;
            if (BOM_EDV_CELL_RE.test(c.str.trim())) continue;
            const q = bomParseQty(c.str);
            if (q == null) continue;
            bedarf = q; bedarfCell = c; source = 'fallback';
            break;
          }
        }
      } else {
        const fb = parseRowJoinedFallback(joined);
        if (fb) {
          edv = fb.edv;
          bedarf = fb.bedarf;
          desc = fb.description;
          source = 'regex';
          edvCell = r.cells.find((c) => c.str.indexOf(fb.edv) >= 0) || null;
        }
      }
      if (!edv || bedarf == null || !(bedarf >= 0)) continue;

      let x0 = Infinity; let x1 = -Infinity; let yMin = Infinity; let yMax = -Infinity; let hMax = 0;
      for (const c of r.cells) {
        x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x + c.w);
        yMin = Math.min(yMin, c.y); yMax = Math.max(yMax, c.y); hMax = Math.max(hMax, c.h);
      }
      tableX0 = Math.min(tableX0, x0);
      tableX1 = Math.max(tableX1, x1);
      const cellBox = (c) => (c ? { x0: c.x, y0: c.y - c.h * 0.25, x1: c.x + c.w, y1: c.y + c.h * 0.85 } : null);
      result.rows.push({
        beakEdvNr: normalizeBeakKey(edv),
        bedarfStck: bedarf,
        description: String(desc || '').replace(/\s+/g, ' ').trim(),
        page: pageNo,
        source: source,
        bbox: { x0: x0, y0: yMin - hMax * 0.32, x1: x1, y1: yMax + hMax * 0.95 },
        edvBox: cellBox(edvCell),
        bedarfBox: cellBox(bedarfCell),
      });
    }
    // Ganze Tabellenzeile markieren: gemeinsame Tabellenbreite
    if (isFinite(tableX0)) {
      for (const row of result.rows) {
        row.bbox.x0 = Math.min(row.bbox.x0, tableX0) - 3;
        row.bbox.x1 = Math.max(row.bbox.x1, tableX1) + 3;
      }
    }
    result.tableRows = rows;
    return result;
  }

  /** Parst alle Seiten; Ergebnis: je EDV-Nr. ein Teil. Kommt eine EDV-Nr. in mehreren
   *  Zeilen vor (auch seitenübergreifend), wird Bedarf Stck SUMMIERT (v1.9); alle
   *  Fundstellen stehen in part.rows [{page,bbox,bedarfStck,description}]. */
  async function parseStuecklistePdf(dataUrl) {
    const pdf = await getStuecklistePdfDoc(dataUrl);
    const parts = [];
    const byKey = new Map();
    let prevCols = null;
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const tc = await page.getTextContent();
      const items = bomItemsFromTextContent(tc);
      const res = parseStuecklistePageItems(items, p, prevCols);
      if (res.cols) prevCols = res.cols;
      const view = page.view || [0, 0, 0, 0];
      for (const row of res.rows) {
        if (!row.beakEdvNr) continue;
        row.pageView = view.slice(0, 4);
        const ref = { page: row.page, bbox: row.bbox, bedarfStck: row.bedarfStck, description: row.description };
        const hit = byKey.get(row.beakEdvNr);
        if (hit) {
          hit.bedarfStck += row.bedarfStck;
          hit.rows.push(ref);
          continue;
        }
        row.rows = [ref];
        byKey.set(row.beakEdvNr, row);
        parts.push(row);
      }
    }
    return parts;
  }

  function describePdfError(err) {
    const m = (err && (err.message || String(err))) || 'unbekannter Fehler';
    return m.length > 160 ? m.slice(0, 160) + '…' : m;
  }

  async function ensureStuecklisteParsed(force) {
    const pdf = state.stueckliste;
    if (!pdf || !pdf.dataUrl) return [];
    if (!force && Array.isArray(pdf.parts) && pdf.parts.length) return pdf.parts;
    if (pdf._parsePromise) return pdf._parsePromise;
    pdf._parsePromise = (async () => {
      try {
        const parts = await parseStuecklistePdf(pdf.dataUrl);
        pdf.parts = parts;
        pdf.parseError = null;
        return parts;
      } catch (err) {
        console.error('Stückliste parsen', err);
        pdf.parts = [];
        pdf.parseError = describePdfError(err);
        return pdf.parts;
      } finally {
        pdf._parsePromise = null;
      }
    })();
    return pdf._parsePromise;
  }

  /** v1.18: pdf.js + Parser im Hintergrund vorbereiten → erster BEAK-Tipp öffnet schnell. */
  function warmupPdfPipeline() {
    try {
      void loadPdfJs().catch(() => {});
      if (state.stueckliste && state.stueckliste.dataUrl) {
        void ensureStuecklisteParsed(false).catch(() => {});
      }
    } catch (_) {}
  }

  /** Meldung nach dem Parsen: Teileanzahl, echter pdf.js-Fehler oder „keine Teile“. */
  function flashStuecklisteResult(parts) {
    const pdf = state.stueckliste;
    if (parts && parts.length) {
      flash('Stückliste gelesen: ' + parts.length + ' Teile', 2500);
    } else if (pdf && pdf.parseError) {
      flash('Stückliste konnte nicht gelesen werden – ' + pdf.parseError, 8000, 'error');
    } else {
      flash('Keine Teile erkannt – Spalten „BEAK EDV-Nr.“ / „Bedarf Stck“ nicht gefunden', 6000, 'error');
    }
  }

  function showHinweis(message) {
    return new Promise((resolve) => {
      if (!el.hinweisBackdrop || !el.hinweisMessage || !el.hinweisOk) {
        flash(String(message || 'Hinweis'));
        resolve();
        return;
      }
      el.hinweisMessage.textContent = String(message || 'Hinweis');
      el.hinweisBackdrop.hidden = false;
      const finish = () => {
        el.hinweisBackdrop.hidden = true;
        el.hinweisOk.removeEventListener('click', onOk);
        el.hinweisBackdrop.removeEventListener('click', onBackdrop);
        resolve();
      };
      const onOk = () => finish();
      const onBackdrop = (e) => {
        if (e.target === el.hinweisBackdrop) finish();
      };
      el.hinweisOk.addEventListener('click', onOk);
      el.hinweisBackdrop.addEventListener('click', onBackdrop);
    });
  }

  function refreshStuecklisteChecklistColors() {
    if (!el.beakCheckList) return;
    if (!el.beakPdfLightbox || el.beakPdfLightbox.hidden) return;
    const rows = el.beakCheckList.querySelectorAll('.beak-check-row');
    rows.forEach((row) => {
      const key = row.dataset.beakKey || '';
      const bedarf = parseInt(row.dataset.bedarf || '0', 10) || 0;
      const placed = beakUsageQty(key);
      const cell = row.querySelector('.beak-check-bedarf');
      if (!cell) return;
      const ok = placed === bedarf;
      cell.classList.toggle('is-ok', ok);
      cell.classList.toggle('is-bad', !ok);
      cell.textContent = String(bedarf);
      cell.title = ok
        ? ('Platziert ' + placed + ' / Bedarf ' + bedarf)
        : ('Abweichung: ' + placed + '/' + bedarf + ' – tippen für Hinweis');
      cell.dataset.placed = String(placed);
    });
    renderStuecklisteUnmatched(); /* v1.15: Abschnitt „Nicht in der Stückliste“ live */
  }

  /* v1.15: BEAK-Nr.-Markierungen, deren Nummer zu keiner EDV-Nr. der Stückliste passt.
     Gleiche Normalisierung wie der Abgleich (normalizeBeakKey: Ziffern → d.ddd / ddd.ddd). */
  function collectUnmatchedBeakLabels(parts) {
    const known = new Set();
    (Array.isArray(parts) ? parts : []).forEach((part) => {
      const k = normalizeBeakKey(part && part.beakEdvNr);
      if (k) known.add(k);
    });
    const groups = {};
    let total = 0;
    /* v2.02: wie rebuildBeakUsage — nur Seiten der aktiven Variante
       (gemeinsam + eigene; andere Varianten-Exklusivseiten nicht als „Nicht in Stückliste“). */
    const vid = state.activeVariantId;
    const useFilter = hasMultipleVariants() && !!vid;
    const nav = useFilter ? getNavPages() : null;
    state.doc.pages.forEach((page, pageIdx) => {
      if (!page || !Array.isArray(page.annotations)) return;
      if (useFilter && !pageVisibleInViewer(page, vid)) return;
      const displayIdx = nav ? Math.max(0, nav.indexOf(page)) : pageIdx;
      page.annotations.forEach((a) => {
        if (!a || a.type !== 'beakNr') return;
        const key = normalizeBeakKey(a.beakDigits);
        if (!key) return;
        total += 1;
        if (known.has(key)) return;
        const q = (typeof a.qty === 'number' && a.qty > 0) ? Math.round(a.qty) : 1;
        const g = groups[key] || (groups[key] = { key, qty: 0, pages: [], first: null });
        g.qty += q;
        if (g.pages.indexOf(displayIdx) < 0) g.pages.push(displayIdx);
        if (!g.first) g.first = { pageIdx, annId: a.id }; /* real index → goToPage */
      });
    });
    const num = (k) => { const d = String(k).replace(/\D/g, ''); return d ? parseInt(d, 10) : Number.POSITIVE_INFINITY; };
    const list = Object.keys(groups).map((k) => groups[k]);
    list.forEach((g) => g.pages.sort((x, y) => x - y));
    list.sort((x, y) => (num(x.key) - num(y.key)) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    return { list, totalLabels: total };
  }

  function renderStuecklisteUnmatched() {
    if (!el.beakCheckList) return;
    const old = el.beakCheckList.querySelector('.beak-unmatched');
    if (old) old.remove();
    const parts = lastChecklistParts;
    if (!parts.length || !el.beakCheckList.querySelector('.beak-check-row')) return;
    const { list, totalLabels } = collectUnmatchedBeakLabels(parts);
    if (!totalLabels) return; /* keine Markierungen → nichts anzeigen */
    const sec = document.createElement('section');
    sec.className = 'beak-unmatched' + (list.length ? ' has-items' : ' is-clean');
    sec.setAttribute('aria-label', 'Nicht in der Stückliste');
    if (!list.length) {
      const okLine = document.createElement('div');
      okLine.className = 'beak-unmatched-ok';
      okLine.textContent = '✓ Alle Nummern passen zur Stückliste';
      sec.appendChild(okLine);
      el.beakCheckList.appendChild(sec);
      return;
    }
    const head = document.createElement('div');
    head.className = 'beak-unmatched-head';
    const title = document.createElement('span');
    title.className = 'beak-unmatched-title';
    title.textContent = 'Nicht in der Stückliste (' + list.length + ')';
    const sub = document.createElement('span');
    sub.className = 'beak-unmatched-sub';
    sub.textContent = 'BEAK-Nr. in der Anleitung ohne passende EDV-Nr. – tippen zum Anzeigen';
    head.appendChild(title);
    head.appendChild(sub);
    sec.appendChild(head);
    list.forEach((g) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'beak-check-row beak-unmatched-row';
      row.dataset.beakKey = g.key;
      row.dataset.placed = String(g.qty);
      row.dataset.pages = g.pages.map((i) => i + 1).join(',');
      const pagesTxt = (g.pages.length > 1 ? 'Seiten ' : 'Seite ') + g.pages.map((i) => i + 1).join(', ');
      row.title = g.key + ': ' + g.qty + '× platziert auf ' + pagesTxt + ' – tippen, um zur Seite zu springen';
      const desc = document.createElement('div');
      desc.className = 'beak-check-desc beak-unmatched-pages';
      desc.textContent = pagesTxt;
      const edvEl = document.createElement('div');
      edvEl.className = 'beak-check-edv';
      edvEl.textContent = g.key;
      const qty = document.createElement('div');
      qty.className = 'beak-check-bedarf is-bad beak-unmatched-qty';
      qty.textContent = g.qty + '×';
      qty.title = 'Platziert: ' + g.qty;
      row.appendChild(desc);
      row.appendChild(edvEl);
      row.appendChild(qty);
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpToBeakLabel(g.first.pageIdx, g.first.annId);
      });
      sec.appendChild(row);
    });
    el.beakCheckList.appendChild(sec);
  }

  /* v1.15: Viewer schließen, zur Seite springen und die Markierung kurz aufleuchten lassen */
  function jumpToBeakLabel(pageIdx, annId) {
    closeBeakPdfViewer();
    if (typeof pageIdx === 'number') goToPage(pageIdx);
    const flash = () => {
      const slide = el.pageTrack && el.pageTrack.querySelector('.page-slide[data-page-index="' + pageIdx + '"]');
      const node = slide && slide.querySelector('.ann[data-id="' + annId + '"]');
      if (!node) return;
      node.classList.remove('ann-find-flash');
      void node.offsetWidth;
      node.classList.add('ann-find-flash');
      setTimeout(() => node.classList.remove('ann-find-flash'), 2400);
    };
    setTimeout(flash, 380);
  }

  let lastChecklistParts = []; /* v1.15: zuletzt angezeigte Teile (für „Nicht in der Stückliste“) */
  function renderStuecklisteChecklist(parts) {
    if (!el.beakCheckList) return;
    el.beakCheckList.innerHTML = '';
    const list = Array.isArray(parts) ? parts : [];
    lastChecklistParts = list;
    if (el.beakCheckHeader) {
      el.beakCheckHeader.textContent = list.length
        ? ('Stückliste – Abgleich (' + list.length + ')')
        : 'Stückliste – Abgleich';
    }
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'beak-check-empty';
      const pdf = state.stueckliste;
      empty.textContent = (pdf && pdf.parseError)
        ? ('Stückliste konnte nicht gelesen werden: ' + pdf.parseError)
        : 'Keine Teile erkannt. PDF bleibt links sichtbar.';
      el.beakCheckList.appendChild(empty);
      return;
    }
    // v1.10: Anzeige aufsteigend nach BEAK EDV-Nr. (numerisch, normalisierte Ziffern:
    // 1.234 < 1.235; 8.185 = 8185 < 101.098 = 101098). Stabil; Originalreihenfolge bei Gleichstand.
    const edvNum = (k) => {
      const d = String(k == null ? '' : k).replace(/\D/g, '');
      return d ? parseInt(d, 10) : Number.POSITIVE_INFINITY;
    };
    const sorted = list
      .map((part, i) => ({ part, i, n: edvNum(part.beakEdvNr) }))
      .sort((x, y) => (x.n - y.n) || (x.i - y.i))
      .map((x) => x.part);
    for (const part of sorted) {
      const key = part.beakEdvNr;
      const bedarf = part.bedarfStck;
      const placed = beakUsageQty(key);
      const ok = placed === bedarf;
      const row = document.createElement('div');
      row.className = 'beak-check-row';
      row.dataset.beakKey = key;
      row.dataset.bedarf = String(bedarf);
      row.title = 'In der PDF markieren (Seite ' + part.page + ')';
      row.addEventListener('click', () => {
        el.beakCheckList.querySelectorAll('.beak-check-row.is-active').forEach((r) => r.classList.remove('is-active'));
        row.classList.add('is-active');
        showStuecklisteRowHighlight(part, true);
      });

      const desc = document.createElement('div');
      desc.className = 'beak-check-desc';
      desc.title = part.description || key;
      desc.textContent = part.description || key;
      const rowCount = Array.isArray(part.rows) ? part.rows.length : 1;
      if (rowCount > 1) {
        const badge = document.createElement('span');
        badge.className = 'beak-check-multi';
        badge.textContent = rowCount + ' Zeilen';
        badge.title = 'Bedarf summiert aus ' + rowCount + ' Zeilen: ' + part.rows.map((r) => r.bedarfStck + ' (S. ' + r.page + ')').join(' + ');
        desc.appendChild(badge);
        row.classList.add('is-multi');
      }

      const edvEl = document.createElement('div');
      edvEl.className = 'beak-check-edv';
      edvEl.textContent = key;

      const bed = document.createElement('button');
      bed.type = 'button';
      bed.className = 'beak-check-bedarf ' + (ok ? 'is-ok' : 'is-bad');
      bed.textContent = String(bedarf);
      bed.title = ok
        ? ('Platziert ' + placed + ' / Bedarf ' + bedarf)
        : ('Abweichung: ' + placed + '/' + bedarf + ' – tippen für Hinweis');
      bed.dataset.placed = String(placed);
      bed.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = beakUsageQty(key);
        if (p === bedarf) return;
        void showHinweis(p + '/' + bedarf);
      });

      row.appendChild(desc);
      row.appendChild(edvEl);
      row.appendChild(bed);
      el.beakCheckList.appendChild(row);
    }
    renderStuecklisteUnmatched();
  }

  /* ---- PDF-Anzeige mit pdf.js (Canvas) + Zeilenmarkierung -------------- */
  const BEAK_PDF_ZOOMS = [1, 1.5, 2, 3];
  let beakPdfView = { token: 0, zoomIdx: 0, pages: [], highlightPart: null };

  function beakPdfPagesEl() {
    return document.getElementById('beakPdfPages');
  }

  function clearBeakPdfPages() {
    const box = beakPdfPagesEl();
    if (box) box.innerHTML = '';
    beakPdfView.pages = [];
  }

  function setBeakPdfInfo(text) {
    const info = document.getElementById('beakPdfInfo');
    if (info) info.textContent = text || '';
  }


  /* ---- v1.98: Geräte Laufzettel Overlay ------------------------------------ */
  const GERAEETE_LAUFZETTEL_URL = 'https://beak-electronic.github.io/geraete-laufzettel/';
  const GERAEETE_LAUFZETTEL_MSG_SOURCE = 'geraete-laufzettel';
  let laufzettelAtSelection = true;

  function isGeraeteLaufzettelButton(a) {
    return !!(a && a.type === 'button' && a.buttonAction === 'geraeteLaufzettel');
  }

  function openGeraeteLaufzettelOverlay(opts) {
    const o = opts || {};
    const box = el.laufzettelLightbox || document.getElementById('laufzettelLightbox');
    const frame = el.laufzettelIframe || document.getElementById('laufzettelIframe');
    if (!box || !frame) {
      flash('Geräte Laufzettel-Overlay nicht verfügbar', 4000, 'error');
      return;
    }
    const url = o.url || GERAEETE_LAUFZETTEL_URL;
    try {
      frame.src = url;
    } catch (_) {
      frame.setAttribute('src', url);
    }
    laufzettelAtSelection = true;
    if (el.laufzettelInfo) el.laufzettelInfo.textContent = '';
    if (el.laufzettelTitle) el.laufzettelTitle.textContent = 'Geräte Laufzettel';
    box.hidden = false;
  }

  function reloadGeraeteLaufzettelSelection() {
    const frame = el.laufzettelIframe || document.getElementById('laufzettelIframe');
    if (!frame) return;
    try {
      frame.src = 'about:blank';
    } catch (_) {}
    requestAnimationFrame(() => {
      try { frame.src = GERAEETE_LAUFZETTEL_URL; } catch (_) { frame.setAttribute('src', GERAEETE_LAUFZETTEL_URL); }
      laufzettelAtSelection = true;
      if (el.laufzettelInfo) el.laufzettelInfo.textContent = 'Auswahl';
    });
  }

  function closeGeraeteLaufzettelOverlay() {
    const box = el.laufzettelLightbox || document.getElementById('laufzettelLightbox');
    const frame = el.laufzettelIframe || document.getElementById('laufzettelIframe');
    if (box) box.hidden = true;
    if (frame) {
      try { frame.src = 'about:blank'; } catch (_) { frame.setAttribute('src', 'about:blank'); }
    }
    laufzettelAtSelection = true;
    if (el.laufzettelInfo) el.laufzettelInfo.textContent = '';
  }

  function onLaufzettelChromeHome() {
    /* v2.00: Chrome-„Auswahl“ entfernt. Weiter für postMessage/home und falls DOM-ID noch da. */
    reloadGeraeteLaufzettelSelection();
  }

  function onLaufzettelChromeClose() {
    /* Overlay-✕: zurück zu Anweisungen (voll schließen) */
    closeGeraeteLaufzettelOverlay();
  }

  function handleGeraeteLaufzettelMessage(ev) {
    try {
      if (!ev) return;
      const originOk = !ev.origin || /beak-electronic\.github\.io$/i.test(String(ev.origin).replace(/^https?:\/\//, '').split('/')[0]) || ev.origin === 'null';
      /* accept github pages origin */
      const okOrigin = typeof ev.origin === 'string' && (
        ev.origin.indexOf('beak-electronic.github.io') >= 0 || ev.origin === window.location.origin
      );
      if (ev.origin && ev.origin !== 'null' && !okOrigin) return;
      let data = ev.data;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch (_) { return; }
      }
      if (!data || typeof data !== 'object') return;
      const src = data.source || data.src || data.from;
      if (src && src !== GERAEETE_LAUFZETTEL_MSG_SOURCE && src !== 'beak-geraete-laufzettel') return;
      const type = data.type || data.event || data.action;
      if (!type) return;
      const t = String(type).toLowerCase();
      if (t === 'saved' || t === 'save' || t === 'gesichert' || t === 'save-success') {
        closeGeraeteLaufzettelOverlay();
        flash('Geräte Laufzettel gespeichert');
        return;
      }
      if (t === 'closed' || t === 'close' || t === 'home' || t === 'selection' || t === 'cancel') {
        /* Ohne Speichern → Auswahl-UI im Overlay */
        reloadGeraeteLaufzettelSelection();
        laufzettelAtSelection = true;
        return;
      }
    } catch (err) {
      console.warn('Geräte Laufzettel message', err);
    }
  }

  async function pickButtonAction() {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'variant-pick-backdrop';
      backdrop.setAttribute('role', 'dialog');
      backdrop.setAttribute('aria-modal', 'true');
      const panel = document.createElement('div');
      panel.className = 'variant-pick-panel';
      const h = document.createElement('h2');
      h.className = 'variant-pick-title';
      h.textContent = 'Button-Ziel';
      panel.appendChild(h);
      const mk = (label, val) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn touch block variant-pick-item';
        b.textContent = label;
        b.addEventListener('click', () => { cleanup(); resolve(val); });
        panel.appendChild(b);
      };
      mk('Seitennummer', 'page');
      mk('Geräte Laufzettel', 'geraeteLaufzettel');
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn touch block';
      cancel.textContent = 'Abbrechen';
      cancel.addEventListener('click', () => { cleanup(); resolve(null); });
      panel.appendChild(cancel);
      backdrop.appendChild(panel);
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) { cleanup(); resolve(null); }
      });
      document.body.appendChild(backdrop);
      function cleanup() { try { backdrop.remove(); } catch (_) {} }
    });
  }

  function closeBeakPdfViewer() {
    document.documentElement.classList.remove('overlay-scroll');
    beakPdfView.token += 1;
    beakPdfView.highlightPart = null;
    if (el.beakPdfLightbox) {
      el.beakPdfLightbox.hidden = true;
      el.beakPdfLightbox.classList.remove('is-part-mode');
    }
    clearBeakPdfPages();
    setBeakPdfInfo('');
    if (el.beakPdfFrameInner) {
      el.beakPdfFrameInner.removeAttribute('src');
      el.beakPdfFrameInner.hidden = true;
    }
    if (el.beakCheckList) el.beakCheckList.innerHTML = '';
    if (beakPdfObjectUrl) {
      try { URL.revokeObjectURL(beakPdfObjectUrl); } catch (_) {}
      beakPdfObjectUrl = null;
    }
  }

  /** Fallback ohne pdf.js: Browser-PDF-Viewer im iframe (ohne Markierung). */
  async function showBeakPdfIframeFallback() {
    const pdf = state.stueckliste;
    if (!pdf || !pdf.dataUrl || !el.beakPdfFrameInner) return;
    let url = pdf.dataUrl;
    if (/^data:/i.test(url) || /^blob:/i.test(url)) {
      const bytes = await dataUrlToUint8(url);
      if (beakPdfObjectUrl) { try { URL.revokeObjectURL(beakPdfObjectUrl); } catch (_) {} }
      beakPdfObjectUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      url = beakPdfObjectUrl;
    }
    el.beakPdfFrameInner.hidden = false;
    el.beakPdfFrameInner.src = url.includes('#') ? url : (url + '#navpanes=0&view=FitH');
    const box = beakPdfPagesEl();
    if (box) box.hidden = true;
  }

  async function renderBeakPdfPages() {
    const box = beakPdfPagesEl();
    const pdf = state.stueckliste;
    if (!box || !pdf || !pdf.dataUrl) return false;
    const token = ++beakPdfView.token;
    box.hidden = false;
    if (el.beakPdfFrameInner) el.beakPdfFrameInner.hidden = true;
    clearBeakPdfPages();
    const doc = await getStuecklistePdfDoc(pdf.dataUrl);
    if (token !== beakPdfView.token) return false;
    const zoom = BEAK_PDF_ZOOMS[beakPdfView.zoomIdx] || 1;
    box.style.setProperty('--beak-pdf-zoom', String(zoom));
    const availW = Math.max(280, (box.clientWidth || 800) - 24) * zoom;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      if (token !== beakPdfView.token) return false;
      const vp1 = page.getViewport({ scale: 1 });
      const wrap = document.createElement('div');
      wrap.className = 'beak-pdf-page';
      wrap.dataset.page = String(p);
      wrap.style.width = Math.round(availW) + 'px';
      wrap.style.height = Math.round(availW * vp1.height / vp1.width) + 'px';
      const canvas = document.createElement('canvas');
      canvas.className = 'beak-pdf-canvas';
      wrap.appendChild(canvas);
      const label = document.createElement('span');
      label.className = 'beak-pdf-page-label';
      label.textContent = 'Seite ' + p + ' / ' + doc.numPages;
      wrap.appendChild(label);
      box.appendChild(wrap);
      pages.push({ pageNo: p, page: page, vp1: vp1, wrap: wrap, canvas: canvas });
    }
    beakPdfView.pages = pages;
    if (beakPdfView.highlightPart) showStuecklisteRowHighlight(beakPdfView.highlightPart, false);
    // Seite mit Markierung zuerst rendern
    const hlPage = beakPdfView.highlightPart ? beakPdfView.highlightPart.page : 1;
    const order = pages.slice().sort((a, b) => (a.pageNo === hlPage ? -1 : 0) - (b.pageNo === hlPage ? -1 : 0));
    for (const pg of order) {
      if (token !== beakPdfView.token) return false;
      // v1.17: zwischen den Seiten dem Browser Zeit zum Scrollen geben; Canvas ≤ 16 MP (iOS-Limit)
      await new Promise((r) => setTimeout(r, 16));
      if (token !== beakPdfView.token) return false;
      let scale = (availW / pg.vp1.width) * dpr;
      const px = (pg.vp1.width * scale) * (pg.vp1.height * scale);
      if (px > 16e6) scale *= Math.sqrt(16e6 / px);
      const vp = pg.page.getViewport({ scale: scale });
      pg.canvas.width = Math.floor(vp.width);
      pg.canvas.height = Math.floor(vp.height);
      const ctx = pg.canvas.getContext('2d');
      await pg.page.render({ canvasContext: ctx, viewport: vp }).promise;
    }
    return true;
  }

  /** Markiert die ganze Tabellenzeile eines Teils (BBox aus dem Parser) und scrollt hin. */
  function showStuecklisteRowHighlight(part, smooth) {
    beakPdfView.highlightPart = part || null;
    const box = beakPdfPagesEl();
    if (!box) return false;
    box.querySelectorAll('.beak-pdf-hl').forEach((n) => n.remove());
    if (!part) return false;
    /* v1.9: alle Zeilen dieser EDV-Nr. markieren (ggf. mehrere Seiten), zur ersten scrollen */
    const refs = (Array.isArray(part.rows) && part.rows.length) ? part.rows : (part.bbox ? [{ page: part.page, bbox: part.bbox }] : []);
    let first = null;
    for (const ref of refs) {
      const pgRef = beakPdfView.pages.find((x) => x.pageNo === ref.page);
      if (!pgRef || !ref.bbox) continue;
      const b = ref.bbox;
      const r = pgRef.vp1.convertToViewportRectangle([b.x0, b.y0, b.x1, b.y1]);
      const left = Math.min(r[0], r[2]) / pgRef.vp1.width * 100;
      const right = Math.max(r[0], r[2]) / pgRef.vp1.width * 100;
      const top = Math.min(r[1], r[3]) / pgRef.vp1.height * 100;
      const bottom = Math.max(r[1], r[3]) / pgRef.vp1.height * 100;
      const hlEl = document.createElement('div');
      hlEl.className = 'beak-pdf-hl';
      hlEl.style.left = Math.max(0, left) + '%';
      hlEl.style.width = Math.max(0.5, Math.min(100, right) - Math.max(0, left)) + '%';
      hlEl.style.top = Math.max(0, top) + '%';
      hlEl.style.height = Math.max(0.3, bottom - top) + '%';
      hlEl.title = part.beakEdvNr + ' · Bedarf ' + (ref.bedarfStck != null ? ref.bedarfStck : part.bedarfStck) + ' Stck';
      pgRef.wrap.appendChild(hlEl);
      if (!first) first = { pg: pgRef, hl: hlEl };
    }
    if (!first) return false;
    const pg = first.pg;
    const hl = first.hl;
    requestAnimationFrame(() => {
      const target = pg.wrap.offsetTop + hl.offsetTop - box.clientHeight / 2 + hl.offsetHeight / 2;
      const targetX = pg.wrap.offsetLeft + hl.offsetLeft - 12;
      try {
        box.scrollTo({ top: Math.max(0, target), left: Math.max(0, targetX), behavior: smooth ? 'smooth' : 'auto' });
      } catch (_) {
        box.scrollTop = Math.max(0, target);
      }
    });
    return true;
  }

  async function openStuecklisteLightbox(opts) {
    opts = opts || {};
    const pdf = state.stueckliste;
    if (!pdf || !pdf.dataUrl || !el.beakPdfLightbox) return;
    closeBeakPdfViewer();
    const partMode = !!opts.part;
    el.beakPdfLightbox.classList.toggle('is-part-mode', partMode);
    const title = document.getElementById('beakPdfTitle');
    if (title) title.textContent = partMode ? ('BEAK ' + opts.part.beakEdvNr) : 'BEAK Stückliste';
    beakPdfView.highlightPart = opts.part || null;
    if (partMode) {
      const p = opts.part;
      const placed = beakUsageQty(p.beakEdvNr);
      const refs = Array.isArray(p.rows) && p.rows.length ? p.rows : [{ page: p.page }];
      const pagesTxt = Array.from(new Set(refs.map((r) => r.page))).join(', ');
      setBeakPdfInfo((p.description ? p.description + ' · ' : '') + 'Bedarf ' + p.bedarfStck + ' Stck' +
        (refs.length > 1 ? (' (Summe aus ' + refs.length + ' Zeilen)') : '') +
        ' · Platziert ' + placed + ' · Seite ' + pagesTxt);
    } else {
      setBeakPdfInfo(pdf.name || '');
    }
    el.beakPdfLightbox.hidden = false;
    // v1.17: natives Scrollen (Schwung) im Viewer – touch-action:none von html/body aufheben
    document.documentElement.classList.add('overlay-scroll');
    await new Promise((r) => requestAnimationFrame(() => r()));
    try {
      await renderBeakPdfPages();
    } catch (err) {
      console.error('PDF-Anzeige', err);
      if (partMode) {
        closeBeakPdfViewer();
        void showHinweis('Die Stückliste-PDF kann nicht angezeigt werden (' + describePdfError(err) + ').');
        return;
      }
      await showBeakPdfIframeFallback();
      flash('PDF-Vorschau ohne Markierung (pdf.js: ' + describePdfError(err) + ')', 6000, 'error');
    }
  }

  async function openBeakPdfViewer() {
    const pdf = state.stueckliste;
    if (!pdf || !pdf.dataUrl) {
      flash('Keine Stückliste-PDF geladen');
      return;
    }
    try {
      const shown = openStuecklisteLightbox({});
      let parts = await ensureStuecklisteParsed(false);
      if (!parts || !parts.length) parts = await ensureStuecklisteParsed(true);
      renderStuecklisteChecklist(parts);
      if (parts && parts.length) flash('Stückliste: ' + parts.length + ' Teile', 2500);
      else flashStuecklisteResult(parts);
      await shown;
    } catch (e) {
      console.error(e);
      flash('Stückliste konnte nicht angezeigt werden – ' + describePdfError(e), 6000, 'error');
    }
  }

  /** Lesemodus: Tipp auf BEAK-Nr. → PDF mit markierter Zeile. */
  async function openBeakPartInPdf(digits) {
    const key = normalizeBeakKey(digits);
    const pdf = state.stueckliste;
    if (!pdf || !pdf.dataUrl) {
      void showHinweis(stuecklisteAddPromptMessage());
      return;
    }
    let parts = await ensureStuecklisteParsed(false);
    if (!parts || !parts.length) parts = await ensureStuecklisteParsed(true);
    if (!parts || !parts.length) {
      void showHinweis(pdf.parseError
        ? ('Die Stückliste konnte nicht gelesen werden:\n' + pdf.parseError)
        : 'In der Stückliste wurden keine Teile erkannt.');
      return;
    }
    const part = parts.find((p) => p.beakEdvNr === key);
    if (!part) {
      void showHinweis('BEAK-Nr. ' + (key || String(digits || '')) + ' ist in der Stückliste nicht enthalten.');
      return;
    }
    await openStuecklisteLightbox({ part: part });
  }

  function changeBeakPdfZoom(delta) {
    const next = clamp(beakPdfView.zoomIdx + delta, 0, BEAK_PDF_ZOOMS.length - 1);
    if (next === beakPdfView.zoomIdx) return;
    beakPdfView.zoomIdx = next;
    if (el.beakPdfLightbox && !el.beakPdfLightbox.hidden) {
      void renderBeakPdfPages().catch((err) => console.error(err));
    }
  }

  /** v1.90: Hinweistext beim Hinzufügen – mit aktivem Varianten-Namen bei ≥2 Varianten. */
  function stuecklisteAddPromptMessage() {
    syncVariantsFromPage();
    if (hasMultipleVariants() && state.activeVariantId) {
      const v = variantById(state.activeVariantId);
      const name = (v && v.label) ? v.label : 'Variante';
      return 'Stückliste für die Variante „' + name + '“ jetzt hinzufügen';
    }
    return 'Keine Stückliste eingebettet.\nIm Menü über BEAK Stückliste → Hinzufügen/Aktualisieren eine PDF einbetten – oder jetzt eine PDF auswählen.';
  }

  async function setStuecklisteFromFile(file) {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const dataUrl = 'data:application/pdf;base64,' + btoa(binary);
    const name = (file.name && /\.pdf$/i.test(file.name)) ? file.name : 'Stueckliste.pdf';
    const rec = { name: name, dataUrl: dataUrl, parts: null };
    setActiveVariantStueckliste(rec);
    updateStuecklisteUi();
    persistSoon(300);
    if (hasMultipleVariants() && state.activeVariantId) {
      const v = variantById(state.activeVariantId);
      const vn = (v && v.label) ? v.label : 'Variante';
      flash('Stückliste für Variante „' + vn + '“ hinzugefügt: ' + name);
    } else {
      flash('Stückliste hinzugefügt: ' + name);
    }
    warmupPdfPipeline();
    try {
      const parts = await ensureStuecklisteParsed(true);
      flashStuecklisteResult(parts);
      if (el.beakPdfLightbox && !el.beakPdfLightbox.hidden) {
        renderStuecklisteChecklist(parts);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function walkLeaves(cell, fn) {
    if (!cell) return;
    if (cell.type === 'leaf') {
      fn(cell);
      return;
    }
    walkLeaves(cell.a, fn);
    walkLeaves(cell.b, fn);
  }

  /* v1.49: Viewer chrome – hide on open; auto-hide after 5s idle.
     Editor: chrome always visible (no idle timer, never start hidden). */
  let chromeIdleTimer = 0;
  const CHROME_IDLE_MS = 5000;
  let tourActive = false; /* v1.56: declared early for chrome-idle pause */

  function clearChromeIdleTimer() {
    if (chromeIdleTimer) {
      clearTimeout(chromeIdleTimer);
      chromeIdleTimer = 0;
    }
  }

  /** v1.59: Drawer or backdrop open → menu active (block idle hide). */
  function isMenuOpen() {
    try {
      if (el.drawer && el.drawer.classList.contains('open')) return true;
      if (el.menuBackdrop && el.menuBackdrop.classList.contains('open')) return true;
    } catch (_) {}
    return false;
  }

  function isWelcomeOpen() {
    try {
      if (el.app && el.app.classList.contains('welcome-open')) return true;
      if (el.welcomeScreen && !el.welcomeScreen.hidden) return true;
    } catch (_) {}
    return false;
  }

  function scheduleChromeIdleHide() {
    clearChromeIdleTimer();
    if (state.editMode) return;
    if (tourActive) return; /* v1.56: pause during tour */
    if (isMenuOpen()) return; /* v1.59: keep chrome while menu open */
    if (isWelcomeOpen()) return; /* v1.65: no idle chrome while welcome */
    chromeIdleTimer = setTimeout(() => {
      chromeIdleTimer = 0;
      /* v1.59: skip hide (or leave visible) if menu opened during the wait */
      if (state.editMode || tourActive || isMenuOpen() || isWelcomeOpen()) return;
      el.app.classList.add('chrome-hidden');
    }, CHROME_IDLE_MS);
  }

  /** Viewer only: hide floating top chrome. No-op in editor. */
  function hideViewerChrome() {
    if (state.editMode) return;
    if (isMenuOpen()) return; /* v1.59 */
    clearChromeIdleTimer();
    el.app.classList.add('chrome-hidden');
  }

  /** Show chrome; viewer restarts 5s idle hide; editor stays on.
      v1.65: no-op while welcome is open (mouse-move must not reveal topbar). */
  function showChrome() {
    if (isWelcomeOpen()) {
      clearChromeIdleTimer();
      try { el.app.classList.add('chrome-hidden'); } catch (_) {}
      return;
    }
    el.app.classList.remove('chrome-hidden');
    if (state.editMode) clearChromeIdleTimer();
    else scheduleChromeIdleHide();
  }

  /** Viewer empty-area tap toggle. */
  function toggleViewerChrome() {
    if (state.editMode) return;
    if (el.app.classList.contains('chrome-hidden')) showChrome();
    else hideViewerChrome();
  }

  /** Reset 5s timer while chrome is visible in viewer. */
  function noteViewerChromeActivity() {
    if (state.editMode) return;
    if (isWelcomeOpen()) return; /* v1.65 */
    if (el.app.classList.contains('chrome-hidden')) return;
    scheduleChromeIdleHide();
  }

  function setEditMode(on) {
    try { hideCopyPasteCallout(); } catch (_) {}
    /* v1.81: im Hochformat kein Editor */
    if (on && document.documentElement.classList.contains('orient-portrait')) {
      try { flash('Editor nur im Querformat', 2200); } catch (_) {}
      on = false;
    }
    state.editMode = !!on;
    el.app.classList.toggle('edit-mode', state.editMode);
    /* Editor: always visible. Leaving editor → show then start viewer idle timer. */
    el.app.classList.remove('chrome-hidden');
    if (state.editMode) clearChromeIdleTimer();
    else scheduleChromeIdleHide();
    closeInfoPopup();
    if (!state.editMode) {
      state.selectedId = null;
      state.selectedSplitId = null;
      setSplitTool(false);
      setPhotoMoveMode(false);
      setPhotoRotateMode(false);
      setTeleportMode(false);
      setAnnTool(null);
      stopLiveCamera();
      closeOverview();
    }
    /* v1.69: Chrome-Leiste-Position ist temporär — Editor-Einstieg immer oben;
       Fertig / Verlassen setzt zurück. */
    setChromeBarBottom(false);
    updateChromeForPage();
    state.doc.pageIndex = remapToVisiblePageIndex(state.doc.pageIndex);
    renderAll();
    snapToIndex(state.doc.pageIndex, false);
    closeMenu();
    scheduleAnnColorBar();
    scheduleViewerChromeCompact();
    scheduleEditTopbarLayout();
  }

  /* v1.88: Chrome-Position-Toggle entfernt — Topbar bleibt oben. */
  function isChromeBarBottom() {
    return false;
  }
  function setChromeBarBottom(_on) {
    if (!el.app) return;
    el.app.classList.remove('chrome-bar-bottom');
    try { scheduleAnnColorBar(); } catch (_) {}
    try { if (el.statusFlash && el.statusFlash.classList.contains('show')) positionStatusFlash(); } catch (_) {}
    try { scheduleEditTopbarLayout(); } catch (_) {}
  }
  function toggleChromeBarPosition() {
    /* entfernt */
  }

  /* v1.60: Viewer-only — hide topbar button text labels when clusters would overlap
     (narrow window / low resolution / shrunk iPad). Editor always keeps full labels. */
  let viewerChromeCompactRaf = 0;
  function viewerTopbarClustersCramped(margin) {
    const topbar = el.app && el.app.querySelector('.topbar');
    if (!topbar) return false;
    const left = topbar.querySelector('.top-left');
    const center = topbar.querySelector('.top-center');
    const right = topbar.querySelector('.top-actions');
    if (!left || !center || !right) return false;
    const L = left.getBoundingClientRect();
    const C = center.getBoundingClientRect();
    const R = right.getBoundingClientRect();
    if (C.width < 8 || C.height < 8) return false;
    /* flex-wrap spilled onto a second row */
    if (L.height > 46 || R.height > 46) return true;
    const m = margin || 0;
    return (L.right + m > C.left) || (C.right + m > R.left);
  }
  function updateViewerChromeCompact() {
    if (!el.app) return;
    if (state.editMode || el.app.classList.contains('edit-mode') ||
        el.app.classList.contains('welcome-open')) {
      el.app.classList.remove('viewer-chrome-compact');
      return;
    }
    const was = el.app.classList.contains('viewer-chrome-compact');
    /* Measure with full labels (sync toggle — no paint of intermediate state). */
    el.app.classList.remove('viewer-chrome-compact');
    void topbarForceLayout();
    const pad = 6;
    const slack = 28; /* hysteresis: leave compact only when clearly roomy */
    const crampedTight = viewerTopbarClustersCramped(pad);
    const crampedLoose = viewerTopbarClustersCramped(pad + slack);
    if (was) {
      if (crampedLoose) el.app.classList.add('viewer-chrome-compact');
    } else if (crampedTight) {
      el.app.classList.add('viewer-chrome-compact');
    }
  }
  function topbarForceLayout() {
    try {
      const tb = el.app && el.app.querySelector('.topbar');
      if (tb) void tb.offsetWidth;
      else if (el.app) void el.app.offsetWidth;
    } catch (_) {}
  }
  function scheduleViewerChromeCompact() {
    if (viewerChromeCompactRaf) {
      try { cancelAnimationFrame(viewerChromeCompactRaf); } catch (_) {}
    }
    viewerChromeCompactRaf = requestAnimationFrame(() => {
      viewerChromeCompactRaf = 0;
      try { updateViewerChromeCompact(); } catch (_) {}
      try { syncEditTopbarLayout(); } catch (_) {}
    });
  }

  /* v1.61/v1.63: After edit-mode wrap, force layout so ::before / clearance match multi-row height. */
  let editTopbarLayoutRaf = 0;
  function syncEditTopbarLayout() {
    if (!el.app) return;
    const topbar = el.app.querySelector('.topbar');
    if (!topbar) return;
    void topbarForceLayout();
    if (state.editMode || el.app.classList.contains('edit-mode')) {
      const h = Math.round(topbar.getBoundingClientRect().height);
      if (h > 0) el.app.style.setProperty('--edit-topbar-h', h + 'px');
    } else {
      el.app.style.removeProperty('--edit-topbar-h');
    }
  }
  function scheduleEditTopbarLayout() {
    if (editTopbarLayoutRaf) {
      try { cancelAnimationFrame(editTopbarLayoutRaf); } catch (_) {}
    }
    editTopbarLayoutRaf = requestAnimationFrame(() => {
      editTopbarLayoutRaf = 0;
      try { syncEditTopbarLayout(); } catch (_) {}
    });
  }

  function setSplitTool(dir) {
    // dir: false/null to clear, or 'v' / 'h'
    if (!dir || !state.editMode) {
      state.splitTool = null;
    } else {
      state.splitTool = dir === 'h' ? 'h' : 'v';
    }
    const on = !!state.splitTool;
    el.toolSplitV.classList.toggle('active', state.splitTool === 'v');
    el.toolSplitH.classList.toggle('active', state.splitTool === 'h');
    el.app.classList.toggle('split-tool', on);
    if (on) {
      setPhotoMoveMode(false);
      setPhotoRotateMode(false);
      setTeleportMode(false);
      setAnnTool(null);
    }
  }

  function setPhotoMoveMode(on) {
    state.photoMoveMode = !!on;
    el.photoMoveBtn.classList.toggle('active', state.photoMoveMode);
    el.app.classList.toggle('photo-move-mode', state.photoMoveMode);
    if (state.photoMoveMode) {
      setSplitTool(false);
      setTeleportMode(false);
      setPhotoRotateMode(false);
      setAnnTool(null);
      const wasLive = !!state.liveLeafId;
      stopLiveCamera();
      if (wasLive) renderAll();
    }
  }

  /* v1.13: Werkzeug „Drehen“ – jedes Tippen auf ein Foto dreht es um 90° im
   * Uhrzeigersinn. Exklusiv wie „Foto schieben“ / Teleport / Split / Formen. */
  function setPhotoRotateMode(on) {
    const want = !!on && !!state.editMode;
    state.photoRotateMode = want;
    if (el.photoRotateBtn) el.photoRotateBtn.classList.toggle('active', want);
    el.app.classList.toggle('photo-rotate-mode', want);
    if (want) {
      setSplitTool(false);
      setPhotoMoveMode(false);
      setTeleportMode(false);
      setAnnTool(null);
      const wasLive = !!state.liveLeafId;
      stopLiveCamera();
      if (wasLive) renderAll();
    }
  }

  function rotatePhotoOfLeaf(leaf, img) {
    if (!leaf || !leaf.photo || !(leaf.photo.src || leaf.photo.file)) return false;
    const p = leaf.photo;
    p.rot = (normalizePhotoRot(p.rot) + 90) % 360;
    // Zoom und Ausschnitt (object-position) bleiben, Versatz wird neu zentriert
    p.tx = 0;
    p.ty = 0;
    if (img) applyPhotoStyle(img, p);
    return true;
  }

  function setTeleportMode(on) {
    const want = !!on && !!state.editMode;
    if (state.teleportMode === want) {
      if (!want) {
        el.teleportBtn && el.teleportBtn.classList.toggle('active', false);
        el.app.classList.toggle('teleport-mode', false);
        el.app.classList.toggle('teleport-carrying', false);
      }
      return;
    }
    if (!want) {
      const hadCarry = !!(state.teleportPhoto || state.teleportSourceId);
      restoreTeleportCarryIfAny();
      state.teleportMode = false;
      if (el.teleportBtn) el.teleportBtn.classList.toggle('active', false);
      el.app.classList.toggle('teleport-mode', false);
      el.app.classList.toggle('teleport-carrying', false);
      if (hadCarry) renderAll();
      return;
    }
    state.teleportMode = true;
    if (el.teleportBtn) el.teleportBtn.classList.toggle('active', true);
    el.app.classList.toggle('teleport-mode', true);
    el.app.classList.toggle('teleport-carrying', !!state.teleportPhoto);
    setSplitTool(false);
    setPhotoMoveMode(false);
    setPhotoRotateMode(false);
    setAnnTool(null);
    const wasLive = !!state.liveLeafId;
    stopLiveCamera();
    if (wasLive) renderAll();
  }

  function findLeafInDoc(leafId) {
    if (!leafId) return null;
    const pages = state.doc && state.doc.pages;
    if (!pages) return null;
    const cur = currentPage();
    if (cur && cur.root) {
      const leaf = findLeaf(cur.root, leafId);
      if (leaf) return leaf;
    }
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (!page || !page.root || page === cur) continue;
      const leaf = findLeaf(page.root, leafId);
      if (leaf) return leaf;
    }
    return null;
  }

  /** v1.51: leaf or Fotozwischenspeicher annotation that can hold a photo */
  function resolvePhotoHolderOnPage(page, id) {
    if (!page || !id) return null;
    if (page.root) {
      const leaf = findLeaf(page.root, id);
      if (leaf) return leaf;
    }
    if (Array.isArray(page.annotations)) {
      for (let i = 0; i < page.annotations.length; i++) {
        const a = page.annotations[i];
        if (a && a.type === 'photoClipboard' && a.id === id) return a;
      }
    }
    return null;
  }

  function findPhotoHolderInDoc(id) {
    if (!id) return null;
    const pages = state.doc && state.doc.pages;
    if (!pages) return null;
    const cur = currentPage();
    const ordered = [];
    if (cur) ordered.push(cur);
    for (let i = 0; i < pages.length; i++) {
      if (pages[i] && pages[i] !== cur) ordered.push(pages[i]);
    }
    for (let i = 0; i < ordered.length; i++) {
      const page = ordered[i];
      if (!page || isFixedPage(page)) continue;
      if (page.root) {
        const leaf = findLeaf(page.root, id);
        if (leaf) return { kind: 'leaf', holder: leaf, page: page };
      }
      if (Array.isArray(page.annotations)) {
        for (let j = 0; j < page.annotations.length; j++) {
          const a = page.annotations[j];
          if (a && a.type === 'photoClipboard' && a.id === id) {
            return { kind: 'clipboard', holder: a, page: page };
          }
        }
      }
    }
    return null;
  }

  function slimPhotoForSave(photo, idFallback) {
    const p = normalizePhoto(photo);
    if (!p) return null;
    if (p.src) {
      const ext = guessImageExt(p.src);
      return {
        file: 'photos/' + (idFallback || 'x') + '.' + ext,
        scale: p.scale,
        x: p.x,
        y: p.y,
        tx: p.tx,
        ty: p.ty,
        rot: p.rot,
        _src: p.src,
      };
    }
    if (p.file) {
      return {
        file: p.file,
        scale: p.scale,
        x: p.x,
        y: p.y,
        tx: p.tx,
        ty: p.ty,
        rot: p.rot,
      };
    }
    return null;
  }

  function serializeAnnotation(a, opts) {
    if (!a || typeof a !== 'object') return a;
    if (a.type === 'photoClipboard') {
      const slim = !!(opts && opts.slim);
      const photo = normalizePhoto(a.photo);
      let outPhoto = null;
      if (photo) {
        if (slim) {
          outPhoto = {
            file: photo.file || ('photos/' + a.id + '.jpg'),
            scale: photo.scale,
            x: photo.x,
            y: photo.y,
            tx: photo.tx,
            ty: photo.ty,
            rot: photo.rot,
          };
          if (!photo.src && !photo.file) outPhoto = null;
        } else {
          outPhoto = {
            src: photo.src || null,
            file: photo.file,
            scale: photo.scale,
            x: photo.x,
            y: photo.y,
            tx: photo.tx,
            ty: photo.ty,
            rot: photo.rot,
          };
        }
      }
      return {
        id: a.id,
        type: 'photoClipboard',
        x: a.x,
        y: a.y,
        w: a.w,
        h: a.h,
        photo: outPhoto,
      };
    }
    const out = { ...a };
    return out;
  }

  /** Restore carried photo to source if empty; clear clipboard. Returns true if model changed. */
  function restoreTeleportCarryIfAny() {
    if (!state.teleportPhoto) {
      state.teleportSourceId = null;
      return false;
    }
    const photo = state.teleportPhoto;
    const srcId = state.teleportSourceId;
    state.teleportPhoto = null;
    state.teleportSourceId = null;
    el.app.classList.toggle('teleport-carrying', false);
    if (!srcId || !photo) return false;
    const hit = findPhotoHolderInDoc(srcId);
    if (hit && hit.holder && !hit.holder.photo) {
      hit.holder.photo = clonePhoto(photo);
      return true;
    }
    return false;
  }

  function updateTeleportCarryClass() {
    el.app.classList.toggle('teleport-carrying', !!(state.teleportMode && state.teleportPhoto));
  }

  function onTeleportLeafPointer(e, cell) {
    onTeleportPhotoHolderPointer(e, cell);
  }

  /** v1.51: Teleport zwischen Zellen und Fotozwischenspeicher (gleiche Cut/Paste/Swap-Semantik). */
  function onTeleportPhotoHolderPointer(e, holder) {
    if (!state.teleportMode || !state.editMode) return;
    if (!holder || !holder.id) return;
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('.cell-kamera-wrap')) return;
    e.preventDefault();
    e.stopPropagation();

    const page = currentPage();
    if (!page || isFixedPage(page)) return;

    // Cancel: tap same source while carrying
    if (state.teleportPhoto && state.teleportSourceId && holder.id === state.teleportSourceId) {
      if (!holder.photo) {
        holder.photo = clonePhoto(state.teleportPhoto);
      }
      state.teleportPhoto = null;
      state.teleportSourceId = null;
      updateTeleportCarryClass();
      renderAll();
      return;
    }

    // Paste: tap another holder while carrying.
    // v1.13: Hat das Ziel ein Foto, tauschen beide Fotos die Plätze
    // (jedes behält Zoom/Versatz/Drehung), ohne Rückfrage.
    if (state.teleportPhoto) {
      if (state.liveLeafId === holder.id) stopLiveCamera();
      let swapped = false;
      if (holder.photo && (holder.photo.src || holder.photo.file) && state.teleportSourceId) {
        const srcHit = findPhotoHolderInDoc(state.teleportSourceId);
        const src = srcHit && srcHit.holder;
        if (src && !src.photo) {
          src.photo = clonePhoto(holder.photo);
          swapped = true;
        }
      }
      holder.photo = clonePhoto(state.teleportPhoto);
      if (swapped) flash('Fotos getauscht');
      state.teleportPhoto = null;
      state.teleportSourceId = null;
      updateTeleportCarryClass();
      renderAll();
      return;
    }

    // Cut: first tap must be a holder with a photo
    const cutPhoto = clonePhoto(holder.photo);
    if (!cutPhoto) {
      flash('Zuerst Zelle oder Zwischenspeicher mit Foto tippen');
      return;
    }
    if (state.liveLeafId === holder.id) stopLiveCamera();
    state.teleportPhoto = cutPhoto;
    state.teleportSourceId = holder.id;
    holder.photo = null;
    updateTeleportCarryClass();
    flash('Foto aufgenommen – Ziel tippen');
    renderAll();
  }

  const KNOWN_ANN_TYPES = {
    rect: 1, ellipse: 1, arrow: 1, text: 1, button: 1, info: 1, beakNr: 1, photoClipboard: 1
  };

  function normalizeAnnotation(a) {
    if (!a || typeof a !== 'object') return null;
    if (a.type === 'beakNr') {
      return normalizeBeakAnnotation(a) || null;
    }
    if (a.type === 'photoClipboard') {
      return {
        id: a.id || uid('a'),
        type: 'photoClipboard',
        x: typeof a.x === 'number' && isFinite(a.x) ? a.x : 10,
        y: typeof a.y === 'number' && isFinite(a.y) ? a.y : 10,
        w: typeof a.w === 'number' && isFinite(a.w) ? Math.max(4, a.w) : 22,
        h: typeof a.h === 'number' && isFinite(a.h) ? Math.max(4, a.h) : 28,
        photo: normalizePhoto(a.photo),
      };
    }
    if (a.type === 'info') {
      const out = {
        id: a.id || uid('a'),
        type: 'info',
        x: typeof a.x === 'number' && isFinite(a.x) ? a.x : 0,
        y: typeof a.y === 'number' && isFinite(a.y) ? a.y : 0,
        w: typeof a.w === 'number' && isFinite(a.w) ? a.w : 10,
        h: typeof a.h === 'number' && isFinite(a.h) ? a.h : 5,
        text: typeof a.text === 'string' ? a.text : 'Info',
        infoText: typeof a.infoText === 'string' ? a.infoText : '',
      };
      if (a.fixedW) out.fixedW = true;
      return out;
    }
    /* Unbekannte Typen behalten (Forward-Compat), bekannte per Spread */
    if (a.type && !KNOWN_ANN_TYPES[a.type]) {
      return { ...a };
    }
    return { ...a };
  }

  let infoPopupAnnId = null;

  function closeInfoPopup() {
    infoPopupAnnId = null;
    document.querySelectorAll('.info-popup-root').forEach((n) => {
      try { n.remove(); } catch (_) {}
    });
  }

  function openInfoPopup(a) {
    if (!a || a.type !== 'info') return;
    closeInfoPopup();
    const stage = currentStage();
    if (!stage) return;
    infoPopupAnnId = a.id;
    const root = document.createElement('div');
    root.className = 'info-popup-root';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Info');

    const panel = document.createElement('div');
    panel.className = 'info-popup-panel';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'info-popup-close';
    closeBtn.setAttribute('aria-label', 'Schließen');
    closeBtn.title = 'Schließen';
    closeBtn.textContent = '✕';

    const body = document.createElement('div');
    body.className = 'info-popup-body';
    body.textContent = typeof a.infoText === 'string' ? a.infoText : '';

    const editing = !!state.editMode;
    if (editing) {
      body.contentEditable = 'true';
      body.spellcheck = false;
      body.addEventListener('input', () => {
        a.infoText = body.innerText != null ? body.innerText : (body.textContent || '');
        try { scheduleHistoryCheck(120); } catch (_) {}
      });
      body.addEventListener('blur', () => {
        a.infoText = body.innerText != null ? body.innerText : (body.textContent || '');
        try { scheduleHistoryCheck(60); } catch (_) {}
        scheduleViewportRecover();
      });
    } else {
      body.contentEditable = 'false';
    }

    function stopSwipe(e) {
      e.stopPropagation();
    }
    root.addEventListener('pointerdown', stopSwipe);
    root.addEventListener('pointermove', stopSwipe);
    root.addEventListener('pointerup', stopSwipe);
    root.addEventListener('touchstart', stopSwipe, { passive: false });
    root.addEventListener('wheel', stopSwipe, { passive: false });

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeInfoPopup();
    });

    /* Backdrop außerhalb Panel schließt immer */
    root.addEventListener('click', (e) => {
      if (e.target === root) {
        e.stopPropagation();
        closeInfoPopup();
      }
    });

    /* View-Mode: Tap auf Panel (inkl. Body) schließt — Edit: nicht, sonst Tippen unmöglich */
    if (!editing) {
      panel.addEventListener('click', (e) => {
        e.stopPropagation();
        closeInfoPopup();
      });
    } else {
      panel.addEventListener('click', (e) => e.stopPropagation());
    }

    panel.appendChild(closeBtn);
    panel.appendChild(body);
    root.appendChild(panel);
    stage.appendChild(root);

    if (editing) {
      requestAnimationFrame(() => {
        try { body.focus(); } catch (_) {}
      });
    }
  }

  function setAnnTool(tool) {
    const next = (tool === 'rect' || tool === 'ellipse' || tool === 'arrow' || tool === 'text' || tool === 'textSm' || tool === 'button' || tool === 'info' || tool === 'beakNr' || tool === 'photoClipboard') && state.editMode
      ? tool
      : null;
    /* v1.10: jede Aktivierung startet mit der Standardfarbe des Werkzeugs */
    if (next !== state.annTool) state.annColor = annColorTypeOf(next) ? annDefaultColor(next) : null;
    state.annTool = next;
    scheduleAnnColorBar();
    el.toolRect.classList.toggle('active', next === 'rect');
    el.toolCircle.classList.toggle('active', next === 'ellipse');
    if (el.toolArrow) el.toolArrow.classList.toggle('active', next === 'arrow');
    el.toolText.classList.toggle('active', next === 'text');
    if (el.toolTextSm) el.toolTextSm.classList.toggle('active', next === 'textSm');
    if (el.toolButton) el.toolButton.classList.toggle('active', next === 'button');
    if (el.toolInfo) el.toolInfo.classList.toggle('active', next === 'info');
    if (el.toolBeakNr) el.toolBeakNr.classList.toggle('active', next === 'beakNr');
    if (el.toolPhotoClipboard) el.toolPhotoClipboard.classList.toggle('active', next === 'photoClipboard');
    el.app.classList.toggle('ann-tool', !!next);
    if (next) {
      setSplitTool(false);
      setPhotoMoveMode(false);
      setPhotoRotateMode(false);
      setTeleportMode(false);
    }
  }

  function toggleAnnTool(type) {
    if (!state.editMode) return;
    if (state.annTool === type) setAnnTool(null);
    else setAnnTool(type);
  }

  function openMenu() {
    el.drawer.classList.add('open');
    el.menuBackdrop.classList.add('open');
    /* v1.59: chrome must stay usable; cancel idle hide while menu open */
    el.app.classList.remove('chrome-hidden');
    clearChromeIdleTimer();
  }
  function closeMenu() {
    const wasOpen = isMenuOpen();
    el.drawer.classList.remove('open');
    el.menuBackdrop.classList.remove('open');
    /* v1.59: resume viewer idle hide only after an actually-open menu closes */
    if (wasOpen && !state.editMode && !tourActive) scheduleChromeIdleHide();
  }
  function toggleMenu() {
    if (el.drawer.classList.contains('open')) closeMenu();
    else openMenu();
  }

  function updatePageIndicator() {
    const nav = getNavPages();
    const n = nav.length || 1;
    const i = navIndexOfPageIndex(state.doc.pageIndex) + 1;
    const txt = i + ' / ' + n;
    if (el.pageIndicator.textContent !== txt) el.pageIndicator.textContent = txt;
  }

  let trackDrag = null;
  let trackOffsetPx = 0;
  let animating = false;
  let photoGesture = null;

  function baseOffsetForIndex(index) {
    /* v1.85: Track enthält getNavPages() → Offset nach Navigationsindex */
    return -navIndexOfPageIndex(index) * viewportWidth();
  }

  function clearTrackTransition() {
    el.pageTrack.classList.remove('animating');
    el.pageTrack.style.transitionDuration = '';
    animating = false;
  }

  /* v2.08/v2.09: Portrait↔Landscape – Seite behalten; Index aus Display-Mitte (Portrait) */
  let portraitScrollSyncLock = false;
  let portraitScrollSyncTimer = null;
  /** v2.08: nach Orientierungswechsel kurz Portrait-Scroll/Track erzwingen (Settle-Timer) */
  let orientRestoreUntil = 0;

  function scrollPortraitToCurrentPage() {
    if (!el.pageViewport || !el.pageTrack) return;
    if (!document.documentElement.classList.contains('orient-portrait')) return;
    const idx = remapToVisiblePageIndex(state.doc.pageIndex);
    const slide = el.pageTrack.querySelector(':scope > .page-slide[data-page-index="' + idx + '"]');
    if (!slide) return;
    const vp = el.pageViewport;
    const top = Math.max(0, Math.round(slide.offsetTop));
    if (Math.abs(vp.scrollTop - top) < 1) return;
    portraitScrollSyncLock = true;
    try { vp.scrollTop = top; } catch (_) {}
    requestAnimationFrame(() => {
      try {
        if (Math.abs(vp.scrollTop - top) > 1) vp.scrollTop = top;
      } catch (_) {}
      portraitScrollSyncLock = false;
    });
  }

  function syncPageIndexFromPortraitScroll() {
    if (!el.pageViewport || !el.pageTrack) return state.doc.pageIndex;
    if (!document.documentElement.classList.contains('orient-portrait')) return state.doc.pageIndex;
    const slides = el.pageTrack.querySelectorAll(':scope > .page-slide');
    if (!slides.length) return state.doc.pageIndex;
    const vp = el.pageViewport;
    /* v2.09: Seite in der Display-Mitte (nicht oberer Rand) für Drehung Portrait→Landscape */
    const probe = vp.scrollTop + (vp.clientHeight * 0.5);
    let chosen = slides[0];
    for (let i = 0; i < slides.length; i++) {
      const sl = slides[i];
      const top = sl.offsetTop;
      const bottom = top + (sl.offsetHeight || 1);
      if (probe >= top && probe < bottom) {
        chosen = sl;
        break;
      }
      if (probe >= bottom) chosen = sl;
    }
    const real = parseInt(chosen.dataset.pageIndex, 10);
    if (!isFinite(real)) return state.doc.pageIndex;
    if (real !== state.doc.pageIndex) {
      state.doc.pageIndex = real;
      try { updatePageIndicator(); } catch (_) {}
      try { updateChromeForPage(); } catch (_) {}
      try { scheduleRememberLastPage(); } catch (_) {}
    }
    return state.doc.pageIndex;
  }

  function schedulePortraitScrollPageSync() {
    if (portraitScrollSyncLock) return;
    if (!document.documentElement.classList.contains('orient-portrait')) return;
    if (portraitScrollSyncTimer) clearTimeout(portraitScrollSyncTimer);
    portraitScrollSyncTimer = setTimeout(() => {
      portraitScrollSyncTimer = null;
      try { syncPageIndexFromPortraitScroll(); } catch (_) {}
    }, 80);
  }

  function restorePagePositionForOrientation() {
    const portrait = document.documentElement.classList.contains('orient-portrait');
    if (portrait) {
      /* Nur nach Drehung / explizitem Restore – nicht bei jedem Resize mitten im Scroll */
      if (Date.now() > orientRestoreUntil) return;
      try { syncPortraitSlideSizes(); } catch (_) {}
      try { scrollPortraitToCurrentPage(); } catch (_) {}
    } else {
      try { applyTrackTransform(baseOffsetForIndex(state.doc.pageIndex), false); } catch (_) {}
    }
    try { updateNearSlides(); } catch (_) {}
    try { updatePageIndicator(); } catch (_) {}
  }

  function applyTrackTransform(px, withAnim, durationMs) {
    if (document.documentElement.classList.contains('orient-portrait')) {
      trackOffsetPx = 0;
      clearTrackTransition();
      if (el.pageTrack) el.pageTrack.style.transform = '';
      return;
    }
    trackOffsetPx = px;
    if (withAnim) {
      const ms = durationMs != null ? durationMs : 480;
      el.pageTrack.style.transitionDuration = ms + 'ms';
      el.pageTrack.classList.add('animating');
      animating = true;
    } else {
      clearTrackTransition();
    }
    el.pageTrack.style.transform = 'translateX(' + px + 'px)';
  }

  function snapToIndex(index, animate) {
    const nav = getNavPages();
    if (!nav.length) return;
    /* index = reale Seitenposition; unsichtbare Spezialseiten auf sichtbare Gruppe mappen */
    index = remapToVisiblePageIndex(index);
    if (index < 0) index = state.doc.pages.indexOf(nav[0]);
    const prevIndex = state.doc.pageIndex;
    let teleportRestored = false;
    if (index !== prevIndex && state.teleportPhoto) {
      teleportRestored = restoreTeleportCarryIfAny() || true;
      updateTeleportCarryClass();
    }
    state.doc.pageIndex = index;
    /* v1.10: Auswahl nur bei echtem Seitenwechsel verwerfen – sonst war ein frisch
       platziertes Objekt sichtbar markiert, im Zustand aber nicht ausgewählt. */
    if (index !== prevIndex) {
      state.selectedId = null;
      closeInfoPopup();
    }
    state.selectedSplitId = null;
    if (index !== prevIndex && !state.editMode) {
      hideViewerChrome();
    }
    updatePageIndicator();
    updateChromeForPage();
    if (teleportRestored) renderAll();
    updateNearSlides();
    const targetPx = baseOffsetForIndex(index);
    if (!animate) {
      applyTrackTransform(targetPx, false);
      try { scrollPortraitToCurrentPage(); } catch (_) {}
      /* v1.48: letzte Seite gerätelokal merken */
      scheduleRememberLastPage();
      return;
    }
    const vw = viewportWidth() || 1;
    const dist = Math.abs(targetPx - trackOffsetPx);
    // Longer when farther; still gentle for short settles
    const ms = Math.round(220 + Math.min(1, dist / vw) * 360);
    applyTrackTransform(targetPx, true, clamp(ms, 280, 620));
    try { scrollPortraitToCurrentPage(); } catch (_) {}
    /* v1.48: letzte Seite gerätelokal merken */
    scheduleRememberLastPage();
  }

  function onTrackTransitionEnd(e) {
    if (e.target !== el.pageTrack || e.propertyName !== 'transform') return;
    clearTrackTransition();
  }

  function isViewTapInteractiveTarget(target) {
    if (!target || !target.closest) return false;
    if (target.closest(
      '.cell-kamera-wrap, .cell-kamera, .cell-fotos, ' +
      '.cell-cam-link, .cell-cam-cancel, .topbar, .drawer, ' +
      '.varianten-leaf.variant-tap-target, .variant-tap-target'
    )) return true;

    /* v1.44: Leere Index-/Fehler-Zeilen (kein Inhalt / keine Navigation) gelten
       nicht als interaktiv — Tap toggelt Chrome wie auf leerem Foto-Hintergrund.
       Gefüllte Zeilen und echte Controls bleiben blockierend. */
    const indexRowEl = target.closest('.index-page .index-row');
    if (indexRowEl) {
      const indexPage = state.doc.pages.find((pg) => isIndexPage(pg));
      const row = indexPage && Array.isArray(indexPage.rows)
        ? indexPage.rows.find((r) => r && r.id === indexRowEl.dataset.rowId)
        : null;
      if (row && String(row.text || '').trim().length > 0) return true;
    } else {
      const fehlerRowEl = target.closest('.fehler-row-nav');
      if (fehlerRowEl) {
        const row = findFehlerRowById(fehlerRowEl.dataset.rowId);
        if (row) {
          const fromEmbed = fehlerRowEl.dataset.fehlerNavEmbed === '1';
          /* Wie navigateFehlerRow: leere Zeile ohne Quelle und nicht Embed → noop */
          if (fromEmbed || fehlerRowHasContent(row) || row.sourcePageId) return true;
        }
      }
    }

    const annEl = target.closest('.ann');
    if (!annEl || target.closest('.ann-delete') || target.closest('.handle')) return false;
    const page = currentPage();
    const a = page && Array.isArray(page.annotations)
      ? page.annotations.find((x) => x && x.id === annEl.dataset.id)
      : null;
    return !!(a && (a.type === 'beakNr' || a.type === 'button' || a.type === 'info'));
  }

  function isPageDragBlocked(target) {
    if (photoGesture) return true;
    /* v1.44: Kamera/Fotos liegen in .cell-leaf — Geste dort darf Seiten-Wischen
       starten (Tap aktiviert weiter den Button), auch bei Foto-schieben/Teleport/Drehen. */
    const onCamChrome = !!(target.closest && target.closest('.cell-kamera-wrap'));
    if (state.teleportMode && (target.closest('.cell-leaf') || target.closest('.ann-photo-clipboard-node')) && !onCamChrome) return true;
    if (state.photoMoveMode && (target.closest('.cell-leaf.has-photo-data') || target.closest('.ann-photo-clipboard-node.has-photo-data')) && !onCamChrome) return true;
    if (state.photoRotateMode && (target.closest('.cell-leaf.has-photo-data') || target.closest('.ann-photo-clipboard-node.has-photo-data')) && !onCamChrome) return true;
    /* Edit: Tippen/Ziehen in Index-/Fehler-Feldern – kein Seiten-Wischen */
    if (state.editMode && target.closest('.index-page')) return true;
    if (state.editMode && (target.closest('.fehler-page') || target.closest('.fehler-embed'))) return true;
    /* Edit: Annotation verschieben/resize; Delete/Handles immer blocken (v1.54: 44px-Hitbox).
       v1.84: Edit → .split-handle blocken (Divider ziehen); Viewer → Wischen über Trennlinie ok. */
    if (target.closest('.ann-delete') || target.closest('.handle')) return true;
    if (state.editMode && target.closest('.split-handle')) return true;
    if (state.editMode && target.closest('.ann')) return true;
    /* v1.30 view mode: Wischen darf auf Index-Hyperlinks, .ann (BEAK-Nr./Buttons)
       und Fehlerzeilen starten – wie .fehler-row-nav (Tap vs. Swipe in pointerup). */
    /* v1.44: Kamera/Fotos/Abbrechen ebenfalls durchwischbar (Tap vs. Swipe wie
       andere Chrome-/Annotation-Controls; Aktivierung weiter per click). */
    return false;
  }

  function rubberBand(dx, atFirst, atLast) {
    if (atFirst && dx > 0) return dx * 0.22;
    if (atLast && dx < 0) return dx * 0.22;
    return dx;
  }

  function onViewportPointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    /* v2.13: Jede neue Geste setzt das Swipe-Flag zurück (vorher nur bei Tap im
       pointerup – blieb nach Wischen hängen, wenn der nächste Tap gar keinen
       Track-Drag startete, z. B. Hochformat / blockierte Ziele). */
    trackDragDidPageSwipe = false;
    if (document.documentElement.classList.contains('orient-portrait')) return; /* v1.81: vertikal scrollen */
    if (isPageDragBlocked(e.target)) return;
    if (drag) return;
    if (state.liveLeafId) {
      if (!e.target.closest('.cell-kamera-wrap')) {
        stopLiveCamera();
        renderAll();
      }
      return;
    }

    trackDrag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: baseOffsetForIndex(state.doc.pageIndex),
      lastX: e.clientX,
      lastT: performance.now(),
      velocity: 0,
      axis: null,
      moved: false,
      target: e.target,
      captured: false,
    };
    /* v2.13: Kamera/Fotos/Auslösen/Abbrechen – Pointer NICHT sofort capturen.
       Neuere WebKit-Versionen (Safari/iPadOS 26+, auch Chrome bei Maus) schicken den
       click laut Pointer-Events-Spec an das Capture-Element (#pageViewport) statt an
       den Button → Kamera-Tap tat gar nichts. Capture erst, wenn die Geste wirklich
       zum horizontalen Seiten-Wischen wird (onViewportPointerMove). */
    if (!(e.target && e.target.closest && e.target.closest('.cell-kamera-wrap'))) {
      captureTrackDragPointer();
    }

    if (state.editMode && !state.splitTool) {
      const onSplit = !!(e.target.closest && e.target.closest('.split-handle'));
      const splitEl = onSplit ? e.target.closest('.split-handle') : null;
      const splitId = splitEl && splitEl.parentElement && splitEl.parentElement.dataset
        ? splitEl.parentElement.dataset.splitId
        : null;
      /* v1.67: unselected divider → Auswahl löschen + Wischen erlauben; selected behalten */
      if (
        !e.target.closest('.ann') &&
        !e.target.closest('.cell-kamera-wrap') &&
        !(onSplit && splitId && state.selectedSplitId === splitId)
      ) {
        const hadAnn = !!state.selectedId;
        const hadSplit = !!state.selectedSplitId;
        if (hadAnn || hadSplit) {
          state.selectedId = null;
          state.selectedSplitId = null;
          hideCopyPasteCallout();
          if (hadSplit) renderAll();
          else renderAnnotationsOnly();
        }
      }
    }
  }

  let trackDragDidPageSwipe = false;

  /** v2.13: Pointer-Capture für Seiten-Wischen (ggf. verzögert, s. onViewportPointerDown). */
  function captureTrackDragPointer() {
    if (!trackDrag || trackDrag.captured) return;
    trackDrag.captured = true;
    try { el.pageViewport.setPointerCapture(trackDrag.pointerId); } catch (_) {}
  }

  function onViewportPointerMove(e) {
    if (!trackDrag || trackDrag.pointerId !== e.pointerId) return;
    const dx = e.clientX - trackDrag.startX;
    const dy = e.clientY - trackDrag.startY;
    const now = performance.now();
    const dt = Math.max(1, now - trackDrag.lastT);
    const instV = (e.clientX - trackDrag.lastX) / dt;
    trackDrag.velocity = trackDrag.velocity * 0.6 + instV * 0.4;
    trackDrag.lastX = e.clientX;
    trackDrag.lastT = now;

    const onFehler = !!(trackDrag.target && trackDrag.target.closest &&
      (trackDrag.target.closest('.fehler-page') || trackDrag.target.closest('.fehler-embed') ||
       trackDrag.target.closest('.fehler-row')));
    /* v1.19/v1.27: Fehlerseite → stärkere Horizontal-Bevorzugung (hBias ≤ 0.6) */
    const hBias = onFehler ? 0.6 : 1.1;

    if (!trackDrag.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      /* v1.19: Auf Fehlerseite horizontale Achse bevorzugen (dx gewinnt früher),
         damit Fingerzittern die Wisch-Geste nicht killt. trackDrag bei Achse 'v'
         NICHT nullen – sonst stirbt der Gesture und letzte→vorletzte greift nicht. */
      trackDrag.axis = Math.abs(dx) >= Math.abs(dy) * hBias ? 'h' : 'v';
      /* v1.91: Auf Varianten-Seite kein horizontales Seiten-Wischen */
      if (trackDrag.axis === 'h' && variantenPageExitLocked()) {
        trackDrag.axis = 'v';
        return;
      }
      if (trackDrag.axis === 'v') {
        /* Vertikal: Gesture behalten, aber Seite nicht bewegen */
        return;
      }
      if (trackDrag.axis === 'h' && !state.editMode) {
        hideViewerChrome();
      }
    } else if (trackDrag.axis === 'v') {
      /* v1.27: Achsen-Upgrade – einmal 'v' gelockt killte letzte→vorletzte auf dem iPad.
         Wenn |dx| klar horizontal wird, auf 'h' umschalten und Seiten-Drag fortsetzen. */
      if (Math.abs(dx) >= 20 && Math.abs(dx) > Math.abs(dy) * Math.min(0.9, hBias)) {
        if (variantenPageExitLocked()) return;
        trackDrag.axis = 'h';
        trackDrag.moved = true;
        if (!state.editMode) hideViewerChrome();
      } else {
        return;
      }
    }
    if (trackDrag.axis !== 'h') return;

    trackDrag.moved = true;
    captureTrackDragPointer(); /* v2.13: spätes Capture bei Start auf Kamera-Buttons */
    e.preventDefault();
    const navLen = getNavPages().length;
    const navIdx = navIndexOfPageIndex(state.doc.pageIndex);
    const atFirst = navIdx === 0;
    const atLast = navIdx >= navLen - 1;
    const adj = rubberBand(dx, atFirst, atLast);
    // v1.17: höchstens ein Transform pro Bildschirmbild (iPad liefert Zeigerereignisse
    // schneller/unregelmäßiger → vorher Ruckeln durch mehrfaches Schreiben pro Frame)
    trackDragPendingPx = trackDrag.startOffset + adj;
    if (!trackDragRaf) trackDragRaf = requestAnimationFrame(flushTrackDragFrame);
  }
  let trackDragPendingPx = null;
  let trackDragRaf = 0;
  let lastIndicatorIdx = -1;
  function flushTrackDragFrame() {
    trackDragRaf = 0;
    if (trackDragPendingPx == null || !trackDrag) { trackDragPendingPx = null; return; }
    applyTrackTransform(trackDragPendingPx, false);
    trackDragPendingPx = null;
    const vw = viewportWidth();
    if (vw > 0) {
      const navLen = getNavPages().length;
      const approx = Math.round(-trackOffsetPx / vw);
      const clamped = clamp(approx, 0, Math.max(0, navLen - 1));
      if (clamped !== lastIndicatorIdx) {
        lastIndicatorIdx = clamped;
        el.pageIndicator.textContent = (clamped + 1) + ' / ' + navLen;
      }
    }
  }
  /** v1.17: nur aktuelle Seite ± 1 voll gerendert/als Ebene; entfernte Seiten überspringt der
      Browser (content-visibility) → weniger Grafikspeicher und ruhigeres Wischen auf dem iPad. */
  function updateNearSlides() {
    if (!el.pageTrack) return;
    /* v1.83: im Hochformat alle Seiten stapeln – kein content-visibility:hidden (.far),
       sonst nur Seite 1+2 sichtbar und danach schwarz. */
    const portrait = document.documentElement.classList.contains('orient-portrait');
    const idx = navIndexOfPageIndex(state.doc.pageIndex);
    el.pageTrack.querySelectorAll(':scope > .page-slide').forEach((sl, i) => {
      sl.classList.toggle('far', !portrait && Math.abs(i - idx) > 1);
    });
  }

  function onViewportPointerUp(e) {
    if (!trackDrag || trackDrag.pointerId !== e.pointerId) return;
    if (trackDragRaf) { cancelAnimationFrame(trackDragRaf); trackDragRaf = 0; }
    if (trackDragPendingPx != null) { applyTrackTransform(trackDragPendingPx, false); trackDragPendingPx = null; }
    lastIndicatorIdx = -1;
    const dragInfo = trackDrag;
    trackDrag = null;
    if (drag) return;

    const upDx = e.clientX - dragInfo.startX;
    const upDy = e.clientY - dragInfo.startY;
    const tapDist = Math.hypot(upDx, upDy);
    const absUpDx = Math.abs(upDx);
    const absUpDy = Math.abs(upDy);
    /* v1.19/v1.27: Mini-Bewegung (< ~16 px) = Tap. NICHT mehr `!moved` allein —
       bei axis==='v' blieb moved false und killte den Horizontal-Fallback. */
    const isTap = tapDist < 16;

    /* v1.27: Pointer-up-Fallback – auch ohne axis==='h' als horizontalen Seitenwechsel
       werten, wenn die Geste klar horizontal war (bes. letzte/erste Seite). */
    const pageCount = getNavPages().length;
    const navNow = navIndexOfPageIndex(state.doc.pageIndex);
    const atEdgePage = navNow === 0 || navNow === pageCount - 1;
    const horizontalFallback =
      dragInfo.axis !== 'h' &&
      !isTap &&
      absUpDx >= 40 &&
      absUpDx > absUpDy * 1.05 &&
      (atEdgePage || absUpDx >= 56);
    /* Normale h-Geste nur committen wenn moved (sonst Mini-Zucken) */
    const treatAsHorizontal =
      (dragInfo.axis === 'h' && (dragInfo.moved || absUpDx >= 40)) || horizontalFallback;

    if (isTap || !treatAsHorizontal) {
      const t = dragInfo.target || e.target;
      /* v1.44: Tap setzt Swipe-Flag zurück, damit click auf Kamera/Fotos nach
         einem früheren Seitenwechsel nicht fälschlich unterdrückt wird. */
      if (isTap) trackDragDidPageSwipe = false;
      if (isTap && state.editMode) {
        try { if (trySetHighlightLeafFromTarget(t)) { snapToIndex(state.doc.pageIndex, false); return; } } catch (_) {}
      }
      if (isTap) {
        /* v1.89: Varianten-Foto tippen (Pointer-Capture → kein leaf-click) */
        try {
          if (tryEnterVariantFromTapTarget(t)) {
            return;
          }
        } catch (_) {}
      }
      if (!state.editMode) {
        /* v1.33: Leerer View-Mode-Tap toggelt die Floating-Buttons. Interaktive
           Ziele behalten ihr bisheriges Verhalten; ein Nicht-Tap-Settle zeigt
           die Buttons wie bisher wieder an. */
        if (isTap) {
          if (!isViewTapInteractiveTarget(t)) toggleViewerChrome();
          else noteViewerChromeActivity();
        } else {
          showChrome();
        }
      }
      /* v1.19: Tap auf Fehlerzeile → Quellseite / Fehleranalyse */
      if (isTap && !state.editMode) {
        const rowEl = t && t.closest ? t.closest('.fehler-row-nav') : null;
        if (rowEl) {
          const row = findFehlerRowById(rowEl.dataset.rowId);
          if (row) navigateFehlerRow(row, rowEl.dataset.fehlerNavEmbed === '1');
          snapToIndex(state.doc.pageIndex, false);
          return;
        }
        /* v1.30: Index-Zeile (Hyperlink) – Tap navigiert, Swipe wechselt Seite */
        const indexRowEl = t && t.closest ? t.closest('.index-row') : null;
        if (indexRowEl && t.closest('.index-page')) {
          const indexPage = state.doc.pages.find((pg) => isIndexPage(pg));
          const row = indexPage && Array.isArray(indexPage.rows)
            ? indexPage.rows.find((r) => r && r.id === indexRowEl.dataset.rowId)
            : null;
          if (row) {
            const hasText = String(row.text || '').trim().length > 0;
            if (hasText) {
              const tp = row.targetPage;
              if (!goToTargetPage(tp)) {
                indexRowEl.classList.add('flash-invalid');
                setTimeout(() => indexRowEl.classList.remove('flash-invalid'), 400);
              }
            }
          }
          snapToIndex(state.doc.pageIndex, false);
          return;
        }
        /* v1.30: BEAK-Nr. / Seiten-Button (.ann) – Tap aktiviert, Swipe wechselt Seite */
        const annEl = t && t.closest ? t.closest('.ann') : null;
        if (annEl && !t.closest('.ann-delete') && !t.closest('.handle')) {
          const page = currentPage();
          const a = page && Array.isArray(page.annotations)
            ? page.annotations.find((x) => x && x.id === annEl.dataset.id)
            : null;
          if (a && a.type === 'beakNr') {
            void openBeakPartInPdf(a.beakDigits);
            snapToIndex(state.doc.pageIndex, false);
            return;
          }
          if (a && a.type === 'button') {
            if (typeof isGeraeteLaufzettelButton === 'function' && isGeraeteLaufzettelButton(a)) {
              openGeraeteLaufzettelOverlay();
            } else if (!goToTargetPage(a.targetPage)) {
              annEl.classList.add('flash-invalid');
              setTimeout(() => annEl.classList.remove('flash-invalid'), 400);
            }
            snapToIndex(state.doc.pageIndex, false);
            return;
          }
          if (a && a.type === 'info') {
            openInfoPopup(a);
            snapToIndex(state.doc.pageIndex, false);
            return;
          }
        }
      }
      /* v1.67: Tap auf unselected Divider → auswählen (ohne Resize-Drag) */
      if (isTap && state.editMode) {
        const splitHandle = t && t.closest ? t.closest('.split-handle') : null;
        if (splitHandle && !t.closest('.split-delete')) {
          const wrap = splitHandle.parentElement;
          const sid = wrap && wrap.dataset ? wrap.dataset.splitId : null;
          if (sid) {
            state.selectedSplitId = sid;
            state.selectedId = null;
            hideCopyPasteCallout();
            renderAll();
            snapToIndex(state.doc.pageIndex, false);
            return;
          }
        }
      }
      /* v1.67 iPad: leere Fläche tippen → Einfügen-Callout wenn Zwischenablage voll */
      if (
        isTap &&
        state.editMode &&
        objectClipboard &&
        isAppleTouchDevice() &&
        !state.annTool &&
        !state.splitTool &&
        t &&
        !t.closest('.ann') &&
        !t.closest('.split-handle') &&
        !t.closest('.cell-kamera-wrap') &&
        !t.closest('.topbar') &&
        !t.closest('.ann-color-bar')
      ) {
        showCopyPasteCallout('paste', e.clientX, e.clientY);
      }
      if (
        isTap &&
        state.editMode &&
        state.annTool &&
        !state.splitTool &&
        !state.photoMoveMode &&
        !state.teleportMode
      ) {
        const t = dragInfo.target || e.target;
        if (
          t &&
          !t.closest('.ann') &&
          !t.closest('.cell-kamera-wrap') &&
          !t.closest('.handle') &&
          !t.closest('.ann-delete')
        ) {
          const area = currentLayoutArea();
          if (area) {
            const sr = area.getBoundingClientRect();
            const cx = e.clientX;
            const cy = e.clientY;
            if (cx >= sr.left && cx <= sr.right && cy >= sr.top && cy <= sr.bottom) {
              placeAnnotationAt(cx, cy);
            }
          }
        }
      }
      snapToIndex(state.doc.pageIndex, false);
      return;
    }

    if (horizontalFallback && !state.editMode) {
      hideViewerChrome();
    }

    const dx = e.clientX - dragInfo.startX;
    const vw = viewportWidth();
    // If finger rested before lift, ignore stale fling velocity
    /* v1.27: idleMs 120 – auf iPad stirbt Velocity oft vor Commit (Landschaft ~400px) */
    const idleMs = performance.now() - dragInfo.lastT;
    let v = idleMs > 120 ? 0 : dragInfo.velocity;
    const nav = getNavPages();
    const pageCountNav = nav.length;
    let navTarget = navIndexOfPageIndex(state.doc.pageIndex);
    const atLast = navTarget >= pageCountNav - 1;
    const atFirst = navTarget === 0;
    /* v1.27: von letzter Seite zurück leichter committen; Mitte bleibt bei 0.35 */
    const commitFracPrev = atLast ? 0.22 : 0.35;
    const commitFracNext = atFirst ? 0.22 : 0.35;

    if (Math.abs(v) > VELOCITY_THRESHOLD) {
      if (v < 0) navTarget = navTarget + 1;
      else navTarget = navTarget - 1;
    } else {
      const visualIndex = -trackOffsetPx / vw;
      if (dx < -vw * commitFracNext) navTarget = navTarget + 1;
      else if (dx > vw * commitFracPrev) navTarget = navTarget - 1;
      else navTarget = Math.round(visualIndex);
    }

    navTarget = clamp(navTarget, 0, pageCountNav - 1);
    let target = realIndexFromNavIndex(navTarget);
    const prev = state.doc.pageIndex;
    /* v1.91/v2.05: Viewer: Varianten-Seite nicht per Wischen verlassen; Editor ok */
    if (variantenPageExitLocked() && target !== prev) {
      target = prev;
      navTarget = navIndexOfPageIndex(prev);
    }
    trackDragDidPageSwipe = target !== prev;
    snapToIndex(target, true);
    if (target !== prev) {
      // Do NOT rebuild annotation DOM here — wiping/recreating the destination
      // page mid-animation deferred overlay paint when photos were present.
      clearAnnotationSelectionVisual();
    }
  }

  /* v1.13: Drehung. Das <img> wird bei 90°/270° mit vertauschten Seiten (Container-
   * Einheiten cqh/cqw der Zelle) zentriert und per rotate() gedreht; object-fit
   * cover füllt so die Zelle. object-position (x/y) gilt im gedrehten Bildrahmen,
   * tx/ty (Versatz) und alle Zoom-/Pan-Rechnungen im Bildschirmrahmen. */
  function localToScreenPos(rot, px, py) {
    if (rot === 90) return [1 - py, px];
    if (rot === 180) return [1 - px, 1 - py];
    if (rot === 270) return [py, 1 - px];
    return [px, py];
  }
  function screenToLocalPos(rot, sx, sy) {
    if (rot === 90) return [sy, 1 - sx];
    if (rot === 180) return [1 - sx, 1 - sy];
    if (rot === 270) return [1 - sy, sx];
    return [sx, sy];
  }
  /** Bildschirmachsen einer Zelle W×H: je Achse [Zellgröße, Bildgröße (cover), Position 0–1]. */
  function photoScreenAxes(W, H, iw, ih, p) {
    const rot = normalizePhotoRot(p && p.rot);
    const odd = rot === 90 || rot === 270;
    const bw = odd ? H : W;
    const bh = odd ? W : H;
    const c = Math.max(bw / iw, bh / ih);
    const dw = iw * c;
    const dh = ih * c;
    const sp = localToScreenPos(rot, clamp(p && p.x != null ? p.x : 0.5, 0, 1), clamp(p && p.y != null ? p.y : 0.5, 0, 1));
    return odd
      ? { x: [W, dh, sp[0]], y: [H, dw, sp[1]] }
      : { x: [W, dw, sp[0]], y: [H, dh, sp[1]] };
  }

  function applyPhotoStyle(img, photo) {
    const p = normalizePhoto(photo);
    if (!p || !p.src) {
      img.classList.remove('has-photo');
      img.removeAttribute('src');
      img.style.objectPosition = '';
      img.style.transform = '';
      img.classList.remove('photo-rot-odd');
      delete img.dataset.rot;
      return;
    }
    img.classList.add('has-photo');
    if (img.getAttribute('src') !== p.src) img.src = p.src;
    const scale = clamp(p.scale, PHOTO_SCALE_MIN, PHOTO_SCALE_MAX);
    const x = clamp(p.x, 0, 1);
    const y = clamp(p.y, 0, 1);
    const rot = normalizePhotoRot(p.rot);
    img.style.objectFit = 'cover';
    img.style.objectPosition = (x * 100) + '% ' + (y * 100) + '%';
    img.style.transformOrigin = 'center center';
    img.classList.toggle('photo-rot-odd', rot === 90 || rot === 270);
    if (rot) img.dataset.rot = String(rot);
    else delete img.dataset.rot;
    let tx = p.tx || 0;
    let ty = p.ty || 0;
    if (tx || ty) {
      // Versatz so begrenzen, dass das Foto die Zelle immer ganz bedeckt
      const box = img.parentElement ? img.parentElement.getBoundingClientRect() : null;
      if (box && box.width > 0 && box.height > 0 && img.naturalWidth && img.naturalHeight) {
        const ax = photoScreenAxes(box.width, box.height, img.naturalWidth, img.naturalHeight, p);
        const rx = photoTranslateRange(ax.x[0], ax.x[1], ax.x[2], scale);
        const ry = photoTranslateRange(ax.y[0], ax.y[1], ax.y[2], scale);
        tx = clamp(tx * box.width, rx[0], rx[1]) / box.width;
        ty = clamp(ty * box.height, ry[0], ry[1]) / box.height;
        if (photo && typeof photo === 'object') { photo.tx = tx; photo.ty = ty; }
      } else if (!img.naturalWidth && !img._txClampPending) {
        // Bild noch nicht geladen → nach dem Laden erneut begrenzen
        img._txClampPending = true;
        img.addEventListener('load', () => { img._txClampPending = false; applyPhotoStyle(img, photo); }, { once: true });
      }
    }
    // Versatz in Zell-Einheiten (cqw/cqh), damit er auch bei vertauschtem Bildrahmen stimmt
    // (0°/180°: Bildrahmen = Zelle → % wie bisher, auch für ältere Safari ohne Container-Einheiten)
    const odd = rot === 90 || rot === 270;
    const tr = (tx || ty)
      ? (odd ? 'translate(' + (tx * 100) + 'cqw, ' + (ty * 100) + 'cqh) ' : 'translate(' + (tx * 100) + '%, ' + (ty * 100) + '%) ')
      : '';
    img.style.transform = tr + (rot ? 'rotate(' + rot + 'deg) ' : '') + 'scale(' + scale + ')';
  }

  /** Erlaubter Versatz (px) einer Achse: Bild (Anzeigegröße dsize, object-position pos,
   *  Zoom s um die Mitte) muss die Zelle (size) weiter vollständig bedecken. */
  function photoTranslateRange(size, dsize, pos, s) {
    const o = (size - dsize) * pos;
    const lo = size / 2 - s * (o + dsize - size / 2);
    const hi = -size / 2 - s * (o - size / 2);
    return lo <= hi ? [lo, hi] : [0, 0];
  }

  function pointerDist(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onPhotoPointerDown(e, leaf, leafEl, img) {
    if (!state.photoMoveMode) return;
    if (!leaf.photo || !leaf.photo.src) return;
    if (e.target.closest('.cell-kamera-wrap')) return;
    /* v1.53: never steal annotation corner handles / delete */
    if (e.target.closest('.handle') || e.target.closest('.ann-delete')) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    trackDrag = null;

    if (!photoGesture) {
      photoGesture = {
        leafId: leaf.id,
        leafEl: leafEl,
        img: img,
        pointers: new Map(),
        mode: 'pan',
        startScale: leaf.photo.scale || 1,
        startX: leaf.photo.x != null ? leaf.photo.x : 0.5,
        startY: leaf.photo.y != null ? leaf.photo.y : 0.5,
        startDist: 0,
        startMidX: 0,
        startMidY: 0,
      };
      leafEl.classList.add('photo-moving');
    }
    if (photoGesture.leafId !== leaf.id) return;

    photoGesture.pointers.set(e.pointerId, e);
    try { leafEl.setPointerCapture(e.pointerId); } catch (_) {}

    if (photoGesture.pointers.size === 1) {
      photoGesture.mode = 'pan';
      const p = photoGesture.pointers.values().next().value;
      photoGesture.startClientX = p.clientX;
      photoGesture.startClientY = p.clientY;
      photoGesture.startX = leaf.photo.x != null ? leaf.photo.x : 0.5;
      photoGesture.startY = leaf.photo.y != null ? leaf.photo.y : 0.5;
      photoGesture.startScale = leaf.photo.scale || 1;
    } else if (photoGesture.pointers.size >= 2) {
      photoGesture.mode = 'pinch';
      const pts = Array.from(photoGesture.pointers.values());
      photoGesture.startDist = Math.max(1, pointerDist(pts[0], pts[1]));
      photoGesture.startScale = leaf.photo.scale || 1;
      photoGesture.startX = leaf.photo.x != null ? leaf.photo.x : 0.5;
      photoGesture.startY = leaf.photo.y != null ? leaf.photo.y : 0.5;
      photoGesture.startMidX = (pts[0].clientX + pts[1].clientX) / 2;
      photoGesture.startMidY = (pts[0].clientY + pts[1].clientY) / 2;
    }
  }

  /** Pan in Bildschirmrichtung; bei gedrehtem Foto in object-position (Bildrahmen) umrechnen. */
  function setPhotoPanFromScreen(photo, g, dx, dy, w, h, panFactor) {
    const rot = normalizePhotoRot(photo.rot);
    const s0 = localToScreenPos(rot, g.startX, g.startY);
    const sx = clamp(s0[0] - (dx / w) * panFactor, 0, 1);
    const sy = clamp(s0[1] - (dy / h) * panFactor, 0, 1);
    const l = screenToLocalPos(rot, sx, sy);
    photo.x = l[0];
    photo.y = l[1];
  }

  function onPhotoPointerMove(e) {
    if (!photoGesture || !photoGesture.pointers.has(e.pointerId)) return;
    photoGesture.pointers.set(e.pointerId, e);
    e.preventDefault();

    const page = currentPage();
    const leaf = resolvePhotoHolderOnPage(page, photoGesture.leafId);
    if (!leaf || !leaf.photo) return;

    const rect = photoGesture.leafEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);

    if (photoGesture.mode === 'pinch' && photoGesture.pointers.size >= 2) {
      const pts = Array.from(photoGesture.pointers.values());
      const dist = Math.max(1, pointerDist(pts[0], pts[1]));
      const scale = clamp(
        photoGesture.startScale * (dist / photoGesture.startDist),
        PHOTO_SCALE_MIN,
        PHOTO_SCALE_MAX
      );
      leaf.photo.scale = scale;
      const midX = (pts[0].clientX + pts[1].clientX) / 2;
      const midY = (pts[0].clientY + pts[1].clientY) / 2;
      const dx = midX - photoGesture.startMidX;
      const dy = midY - photoGesture.startMidY;
      const panFactor = 1 / Math.max(scale, 1);
      setPhotoPanFromScreen(leaf.photo, photoGesture, dx, dy, w, h, panFactor);
    } else if (photoGesture.pointers.size === 1) {
      const p = photoGesture.pointers.values().next().value;
      const dx = p.clientX - photoGesture.startClientX;
      const dy = p.clientY - photoGesture.startClientY;
      const scale = leaf.photo.scale || 1;
      const panFactor = 1 / Math.max(scale, 1);
      setPhotoPanFromScreen(leaf.photo, photoGesture, dx, dy, w, h, panFactor);
    }
    applyPhotoStyle(photoGesture.img, leaf.photo);
  }

  function onPhotoPointerUp(e) {
    if (!photoGesture || !photoGesture.pointers.has(e.pointerId)) return;
    photoGesture.pointers.delete(e.pointerId);
    if (photoGesture.pointers.size === 0) {
      photoGesture.leafEl.classList.remove('photo-moving');
      photoGesture = null;
      return;
    }
    if (photoGesture.pointers.size === 1) {
      const page = currentPage();
      const leaf = resolvePhotoHolderOnPage(page, photoGesture.leafId);
      photoGesture.mode = 'pan';
      const p = photoGesture.pointers.values().next().value;
      photoGesture.startClientX = p.clientX;
      photoGesture.startClientY = p.clientY;
      if (leaf && leaf.photo) {
        photoGesture.startX = leaf.photo.x != null ? leaf.photo.x : 0.5;
        photoGesture.startY = leaf.photo.y != null ? leaf.photo.y : 0.5;
        photoGesture.startScale = leaf.photo.scale || 1;
      }
    }
  }

  function renderCell(cell, opts) {
    opts = opts || {};
    const onVarianten = !!opts.varianten;
    if (cell.type === 'leaf') {
      const leaf = document.createElement('div');
      const hasPhoto = !!(cell.photo && cell.photo.src);
      leaf.className =
        'cell cell-leaf' +
        (onVarianten ? ' varianten-leaf' : '') +
        (state.liveLeafId === cell.id ? ' live-camera' : '') +
        (hasPhoto ? ' has-photo-data' : '') +
        (state.teleportMode && state.teleportSourceId === cell.id ? ' teleport-source' : '');
      leaf.dataset.leafId = cell.id;
      if (onVarianten && cell.variantId) leaf.dataset.variantId = cell.variantId;

      const img = document.createElement('img');
      img.className = 'cell-photo';
      img.alt = '';
      img.decoding = 'async'; // v1.17: Dekodieren nicht im Wischen blockieren
      img.draggable = false;
      applyPhotoStyle(img, cell.photo);
      leaf.appendChild(img);

      const video = document.createElement('video');
      video.className = 'cell-live-video';
      video.setAttribute('autoplay', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      video.muted = true;
      video.playsInline = true;
      leaf.appendChild(video);

      if (state.liveLeafId === cell.id && state.stream) {
        video.srcObject = state.stream;
        state.liveVideoEl = video;
        video.play().catch(() => {});
      }

      const wrap = document.createElement('div');
      wrap.className = 'cell-kamera-wrap';

      const seg = document.createElement('div');
      seg.className = 'cell-cam-seg' + (state.liveLeafId === cell.id ? ' live' : '');
      seg.setAttribute('role', 'group');
      seg.setAttribute('aria-label', 'Kamera oder Fotos');

      const kam = document.createElement('button');
      kam.type = 'button';
      kam.className = 'cell-cam-seg-btn cell-kamera' + (state.liveLeafId === cell.id ? ' live' : '');
      if (state.liveLeafId === cell.id) {
        kam.textContent = 'Auslösen';
        kam.setAttribute('aria-label', 'Auslösen');
        kam.title = 'Auslösen';
      } else {
        kam.innerHTML = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 8.4h2.3l1.3-2.1h8.4l1.3 2.1h2.3c.9 0 1.6.7 1.6 1.6v8.4c0 .9-.7 1.6-1.6 1.6H4.2c-.9 0-1.6-.7-1.6-1.6V10c0-.9.7-1.6 1.6-1.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
        kam.setAttribute('aria-label', 'Kamera');
        kam.title = 'Kamera';
      }
      kam.addEventListener('click', (e) => {
        /* v1.44: kein pointerdown-stopPropagation — Seiten-Wischen darf auf
           Kamera starten; nur echter Tap (nicht Swipe) aktiviert. */
        if (trackDragDidPageSwipe) return;
        e.stopPropagation();
        if (state.liveLeafId === cell.id) {
          captureStill();
        } else {
          startLiveCamera(cell.id);
        }
      });

      const fotos = document.createElement('button');
      fotos.type = 'button';
      fotos.className = 'cell-cam-seg-btn cell-fotos';
      fotos.innerHTML = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.2 18.6V6.4c0-.66.54-1.2 1.2-1.2h4.3l1.9 2.1h7c.66 0 1.2.54 1.2 1.2v2.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M3.2 18.6l2.6-7.1c.17-.47.62-.8 1.13-.8H20.1c.83 0 1.4.82 1.13 1.6l-2.3 6.3H3.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      fotos.setAttribute('aria-label', 'Fotos');
      fotos.title = 'Fotos';
      fotos.addEventListener('click', (e) => {
        if (trackDragDidPageSwipe) return;
        e.stopPropagation();
        openFilePicker(cell.id);
      });

      seg.appendChild(kam);
      seg.appendChild(fotos);
      wrap.appendChild(seg);

      if (state.liveLeafId === cell.id) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn sm cell-cam-cancel';
        cancel.textContent = 'Abbrechen';
        cancel.addEventListener('click', (e) => {
          if (trackDragDidPageSwipe) return;
          e.stopPropagation();
          stopLiveCamera();
          renderAll();
        });
        wrap.appendChild(cancel);
      }

      leaf.appendChild(wrap);

      /* v1.87: Varianten-Name im Foto positionierbar (Editor: edit+drag; Viewer: Text ohne Rahmen) */
      if (onVarianten) {
        const capText = String(leafCaption(cell) || '').trim();
        const showCap = state.editMode || !!capText;
        if (showCap) {
          const capWrap = document.createElement('div');
          capWrap.className = 'variant-caption-wrap' + (state.editMode ? ' is-edit' : ' is-view');
          if (state.editMode) {
            /* v2.03: nur L-Ecken + unsichtbare Eck-Hit-Areas (kein 3-Punkt-Griff) */
            ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
              const hit = document.createElement('div');
              hit.className = 'variant-caption-corner variant-caption-corner-' + pos;
              hit.setAttribute('aria-hidden', 'true');
              hit.title = 'Verschieben';
              capWrap.appendChild(hit);
            });
            /* v1.93: kein „Verschieben“-Text — Caption-Box selbst ziehbar */
            const row = document.createElement('div');
            row.className = 'variant-caption-row';
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'variant-caption-input';
            inp.placeholder = 'Name der Variante';
            inp.value = leafCaption(cell);
            inp.setAttribute('aria-label', 'Name der Variante');
            /* v2.03: kein stopPropagation — Wrap-Drag mit Schwelle; Fokus bleibt Tippen */
            inp.addEventListener('input', () => {
              cell.caption = inp.value;
              if (!cell.variantId) cell.variantId = uid('v');
              syncVariantsFromPage();
              updateVariantBar();
              scheduleHistoryCheck(700);
            });
            inp.addEventListener('change', () => {
              cell.caption = inp.value.trim();
              inp.value = cell.caption;
              syncVariantsFromPage();
              updateVariantBar();
              if (typeof historyCommit === 'function') historyCommit();
            });
            const kWrap = document.createElement('label');
            kWrap.className = 'variant-kuerzel-wrap';
            const kLab = document.createElement('span');
            kLab.className = 'variant-kuerzel-label';
            kLab.textContent = 'Kürzel';
            const kInp = document.createElement('input');
            kInp.type = 'text';
            kInp.className = 'variant-kuerzel-input';
            kInp.placeholder = 'z. B. A';
            kInp.maxLength = 12;
            kInp.value = leafCaptionShort(cell);
            kInp.setAttribute('aria-label', 'Kürzel der Variante');
            kInp.addEventListener('input', () => {
              cell.captionShort = kInp.value;
              if (!cell.variantId) cell.variantId = uid('v');
              syncVariantsFromPage();
              updateVariantBar();
              scheduleHistoryCheck(700);
            });
            kInp.addEventListener('change', () => {
              cell.captionShort = kInp.value.trim();
              kInp.value = cell.captionShort;
              syncVariantsFromPage();
              updateVariantBar();
              if (typeof historyCommit === 'function') historyCommit();
            });
            kWrap.appendChild(kLab);
            kWrap.appendChild(kInp);
            row.appendChild(inp);
            row.appendChild(kWrap);
            capWrap.appendChild(row);
          } else {
            const lab = document.createElement('div');
            lab.className = 'variant-caption-label';
            /* v1.93: Viewer zeigt nur den Namen, kein Kürzel in Klammern */
            lab.textContent = capText;
            capWrap.appendChild(lab);
          }
          leaf.appendChild(capWrap);
          const place = () => applyVariantCaptionPosition(capWrap, leaf, cell);
          place();
          requestAnimationFrame(place);
          if (state.editMode) bindVariantCaptionDrag(capWrap, leaf, cell);
        }

        if (hasPhoto && !state.editMode) {
          /* v1.92: Tap→Variante nur im Viewer */
          leaf.classList.add('variant-tap-target');
          const onPick = (e) => {
            if (trackDragDidPageSwipe) return;
            if (e.target.closest('.variant-caption-wrap')) return;
            if (e.target.closest('.cell-kamera-wrap')) return;
            e.stopPropagation();
            enterVariantFromLeaf(cell);
          };
          leaf.addEventListener('click', onPick);
        }
      }

      leaf.addEventListener('pointerdown', (e) => {
        if (state.teleportMode) {
          onTeleportLeafPointer(e, cell);
          return;
        }
        if (state.photoMoveMode && hasPhoto) {
          onPhotoPointerDown(e, cell, leaf, img);
          return;
        }
        if (state.photoRotateMode && hasPhoto) {
          if (e.target.closest('.cell-kamera-wrap')) return;
          if (e.target.closest('.variant-caption-wrap')) return;
          if (e.button != null && e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          rotatePhotoOfLeaf(cell, img);
          return;
        }
        if (!state.editMode || !state.splitTool) return;
        if (e.target.closest('.cell-kamera-wrap')) return;
        if (e.target.closest('.variant-caption-wrap')) return;
        if (e.button != null && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        splitLeaf(cell.id, leaf);
      });

      return leaf;
    }

    const wrap = document.createElement('div');
    wrap.className = 'cell cell-split dir-' + cell.dir;
    wrap.dataset.splitId = cell.id;
    wrap.style.width = '100%';
    wrap.style.height = '100%';

    const ratio = clamp(cell.ratio, 0.15, 0.85);
    const aEl = renderCell(cell.a, opts);
    const bEl = renderCell(cell.b, opts);

    aEl.style.flex = ratio + ' 1 0px';
    bEl.style.flex = (1 - ratio) + ' 1 0px';
    if (cell.dir === 'v') {
      aEl.style.height = '100%';
      bEl.style.height = '100%';
      aEl.style.width = 'auto';
      bEl.style.width = 'auto';
    } else {
      aEl.style.width = '100%';
      bEl.style.width = '100%';
      aEl.style.height = 'auto';
      bEl.style.height = 'auto';
    }

    wrap.appendChild(aEl);
    wrap.appendChild(bEl);

    const handle = document.createElement('div');
    handle.className = 'split-handle dir-' + cell.dir + (cell.id === state.selectedSplitId ? ' selected' : '');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', cell.dir === 'v' ? 'vertical' : 'horizontal');
    handle.setAttribute('aria-label', 'Aufteilung');
    if (cell.dir === 'v') {
      handle.style.left = ratio * 100 + '%';
    } else {
      handle.style.top = ratio * 100 + '%';
    }
    handle.addEventListener('pointerdown', (e) => {
      /* v1.84: Editor → Divider immer greifen (ziehen), nicht Seiten-Wischen.
         Viewer: Listener return → Viewport-Swipe über Trennlinie blättert weiter. */
      if (!state.editMode) return;
      if (e.target.closest && e.target.closest('.split-delete')) return;
      onSplitDown(e, cell.id, cell.dir, wrap);
    });

    const splitDel = document.createElement('button');
    splitDel.type = 'button';
    splitDel.className = 'btn sm split-delete';
    splitDel.textContent = '✕';
    splitDel.title = 'Unterteilung entfernen';
    splitDel.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    splitDel.addEventListener('click', (e) => {
      e.stopPropagation();
      void removeSplit(cell.id);
    });
    handle.appendChild(splitDel);

    wrap.appendChild(handle);

    return wrap;
  }

  /* ---- v1.10/v1.68: Farben für Rechteck / Kreis / Text -------------------
   * a.color = 'schwarz' | 'grau' | 'rot' | 'gruen' | 'pink' | 'keine' (nur Text).
   * Ohne a.color gilt der bisherige Standard: Rechteck/Kreis = rot (70 %),
   * Text = schwarzer Kasten (80 %) mit weißer Schrift → alte .beak unverändert.
   * v1.68: 'keine' = kein Texthintergrund, Schrift schwarz. */
  const ANN_COLOR_NONE = 'keine';
  const ANN_COLORS = [
    { key: 'schwarz', label: 'Schwarz', rgb: '0, 0, 0' },
    { key: 'grau', label: 'Grau', rgb: '120, 120, 120' },
    { key: 'rot', label: 'Rot', rgb: '255, 0, 0' },
    { key: 'gruen', label: 'Grün', rgb: '34, 197, 94' }, /* v1.67 etwas heller */
    { key: 'pink', label: 'Pink', rgb: '221, 0, 122' }, /* v1.67 Akzent-Pink */
  ];
  function annColorTypeOf(typeOrTool) {
    if (typeOrTool === 'rect' || typeOrTool === 'ellipse' || typeOrTool === 'arrow') return 'shape';
    if (typeOrTool === 'text' || typeOrTool === 'textSm') return 'text';
    return null;
  }
  function annDefaultColor(typeOrTool) {
    return annColorTypeOf(typeOrTool) === 'text' ? 'schwarz' : 'rot';
  }
  function annIsNoneColor(key) {
    return key === ANN_COLOR_NONE || key === 'none' || key === 'transparent';
  }
  function annColorKey(a) {
    const k = a && a.color;
    if (annIsNoneColor(k) && (a && a.type === 'text')) return ANN_COLOR_NONE;
    return ANN_COLORS.some((c) => c.key === k) ? k : annDefaultColor(a && a.type);
  }
  function annColorValidFor(key, typeOrTool) {
    if (annIsNoneColor(key)) return annColorTypeOf(typeOrTool) === 'text';
    return ANN_COLORS.some((c) => c.key === key);
  }
  function annColorCss(key, typeOrTool) {
    if (annIsNoneColor(key)) return 'transparent';
    const c = ANN_COLORS.find((x) => x.key === key) || ANN_COLORS[2];
    const alpha = annColorTypeOf(typeOrTool) === 'text' ? 0.8 : 0.7;
    return 'rgba(' + c.rgb + ', ' + alpha + ')';
  }
  function annTextFgCss(key) {
    return annIsNoneColor(key) ? '#000000' : '#ffffff';
  }
  /* ---- v1.10: Textgrößen --------------------------------------------------
   * a.textSize: 'sm' = altes „Text klein“ (0.7rem, nur Bestand),
   *             'lg' = altes „Text groß“ = NEUES „Text klein“ (1rem),
   *             'xl' = NEUES „Text groß“ (1.4rem ≈ 1rem × 1/0.7).
   * Bestehende Annotationen behalten so exakt ihre Größe (keine Migration). */
  function textSizeForTool(tool) { return tool === 'textSm' ? 'lg' : 'xl'; }

  let annColorBarRaf = 0;
  function scheduleAnnColorBar() {
    if (annColorBarRaf) return;
    annColorBarRaf = requestAnimationFrame(() => { annColorBarRaf = 0; updateAnnColorBar(); });
  }
  function selectedColorableAnnotation() {
    if (!state.editMode || !state.selectedId) return null;
    const page = currentPage();
    if (!page || isFixedPage(page) || !Array.isArray(page.annotations)) return null;
    const a = page.annotations.find((x) => x.id === state.selectedId);
    return a && annColorTypeOf(a.type) ? a : null;
  }
  function updateAnnColorBar() {
    updateAnnArrowBar();
    const bar = el.annColorBar;
    if (!bar) return;
    const toolType = state.editMode ? annColorTypeOf(state.annTool) : null;
    const selAnn = toolType ? null : selectedColorableAnnotation();
    const show = !!(toolType || selAnn) && !isBlockingOverlayOpen();
    bar.hidden = !show;
    if (!show) return;
    const typeOrTool = toolType ? state.annTool : selAnn.type;
    const isTextTarget = annColorTypeOf(typeOrTool) === 'text';
    let active = toolType ? (state.annColor || annDefaultColor(state.annTool)) : annColorKey(selAnn);
    if (!annColorValidFor(active, typeOrTool)) active = annDefaultColor(typeOrTool);
    bar.dataset.target = toolType ? 'tool' : 'selection';
    bar.classList.toggle('is-text-colors', isTextTarget);
    bar.querySelectorAll('.ann-color-swatch').forEach((b) => {
      const key = b.dataset.color;
      const isNone = annIsNoneColor(key);
      if (isNone) {
        b.hidden = !isTextTarget;
        if (!isTextTarget) {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
          return;
        }
      }
      const on = key === active || (isNone && annIsNoneColor(active));
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      const dot = b.querySelector('.ann-color-dot');
      if (dot && !isNone) {
        dot.classList.toggle('is-text', isTextTarget);
        const solid = annColorCss(key, typeOrTool).replace(/, 0\.[78]\)$/, ', 1)');
        dot.style.setProperty('--sw', solid === 'transparent' ? '#000' : solid);
      }
    });
    // Position: rechts bündig an „Fertig“ — darunter (Leiste oben) bzw. darüber (Leiste unten)
    const anchor = el.fertigBtn && el.fertigBtn.offsetParent ? el.fertigBtn : null;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      bar.style.right = Math.max(4, Math.round(window.innerWidth - r.right)) + 'px';
      if (isChromeBarBottom()) {
        bar.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
        bar.style.top = 'auto';
      } else {
        bar.style.top = Math.round(r.bottom + 8) + 'px';
        bar.style.bottom = 'auto';
      }
    }
  }
  /* v1.13: zweite senkrechte Leiste „Pfeilart“ links neben der Farbleiste */
  function selectedArrowAnnotation() {
    const a = selectedColorableAnnotation();
    return a && a.type === 'arrow' ? a : null;
  }
  function updateAnnArrowBar() {
    const bar = el.annArrowBar;
    if (!bar) return;
    const toolOn = state.editMode && state.annTool === 'arrow';
    const selA = toolOn ? null : (annColorTypeOf(state.annTool) ? null : selectedArrowAnnotation());
    const show = !!(toolOn || selA) && !isBlockingOverlayOpen();
    bar.hidden = !show;
    if (!show) return;
    const active = toolOn ? (ARROW_KINDS.includes(state.arrowKind) ? state.arrowKind : 'straight') : arrowKindOf(selA);
    bar.querySelectorAll('.ann-arrow-kind').forEach((b) => {
      const on = b.dataset.kind === active;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const anchor = el.fertigBtn && el.fertigBtn.offsetParent ? el.fertigBtn : null;
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      // links neben der Farbleiste (34 px + 6 px Abstand)
      bar.style.right = Math.max(4, Math.round(window.innerWidth - r.right)) + 40 + 'px';
      if (isChromeBarBottom()) {
        bar.style.bottom = Math.round(window.innerHeight - r.top + 8) + 'px';
        bar.style.top = 'auto';
      } else {
        bar.style.top = Math.round(r.bottom + 8) + 'px';
        bar.style.bottom = 'auto';
      }
    }
  }
  function onAnnArrowKind(kind) {
    if (!ARROW_KINDS.includes(kind)) return;
    if (state.editMode && state.annTool === 'arrow') {
      state.arrowKind = kind;
      updateAnnArrowBar();
      return;
    }
    const a = selectedArrowAnnotation();
    if (!a) return;
    a.kind = kind;
    state.arrowKind = kind;
    const area = currentLayoutArea();
    const node = area && area.querySelector('.ann[data-id="' + a.id + '"]');
    if (node) { node.dataset.kind = kind; redrawArrowNode(node); }
    else renderAnnotationsOnly();
    if (typeof historyCommit === 'function') historyCommit();
    updateAnnArrowBar();
  }

  function onAnnColorSwatch(key) {
    const toolType = state.editMode ? annColorTypeOf(state.annTool) : null;
    const selAnn = toolType ? null : selectedColorableAnnotation();
    const typeOrTool = toolType ? state.annTool : (selAnn && selAnn.type);
    if (!annColorValidFor(key, typeOrTool)) return;
    if (toolType) {
      state.annColor = annIsNoneColor(key) ? ANN_COLOR_NONE : key;
      updateAnnColorBar();
      return;
    }
    const a = selAnn;
    if (!a) return;
    a.color = annIsNoneColor(key) ? ANN_COLOR_NONE : key;
    const area = currentLayoutArea();
    const node = area && area.querySelector('.ann[data-id="' + a.id + '"]');
    if (node) applyAnnColor(node, a);
    else renderAnnotationsOnly();
    updateAnnColorBar();
    if (typeof historyCommit === 'function') historyCommit();
  }
  function applyAnnColor(node, a) {
    if (!node || !a) return;
    if (a.type === 'rect' || a.type === 'ellipse') {
      const box = node.querySelector('.ann-rect, .ann-ellipse');
      if (box) box.style.borderColor = a.color ? annColorCss(annColorKey(a), a.type) : '';
    } else if (a.type === 'text') {
      const t = node.querySelector('.ann-text');
      if (t) {
        const key = annColorKey(a);
        const none = annIsNoneColor(key);
        t.classList.toggle('no-fill', none);
        t.style.backgroundColor = none ? 'transparent' : (a.color ? annColorCss(key, 'text') : '');
        t.style.color = none ? '#000000' : '';
      }
    } else if (a.type === 'arrow') {
      node.style.color = annColorCss(annColorKey(a), 'arrow');
    }
    node.dataset.color = a.color ? annColorKey(a) : '';
  }

  /* ---- v1.13/v1.68: Pfeile ------------------------------------------------
   * Annotation { type:'arrow', kind:'straight'|'line'|'arc'|'curve', x,y,w,h (%), rot (Grad,
   * im Uhrzeigersinn um die Mitte), color }. Die Geometrie wird in Pixeln der
   * (ungedrehten) Box berechnet – dieselbe Funktion für SVG (Bildschirm/Übersicht)
   * und Canvas (PDF-Export) → Strichstärke und Pfeilspitze verzerren nicht.
   * v1.68: kind 'line' = gerade Linie ohne Pfeilspitze. */
  const ARROW_KINDS = ['straight', 'line', 'arc', 'curve'];
  const ARROW_STROKE = (1.5 / 25.4) * 96; // wie Rahmen/Kreis (1,5 mm)
  function arrowKindOf(a) {
    return ARROW_KINDS.includes(a && a.kind) ? a.kind : 'straight';
  }
  function arrowGeometry(kind, W, H) {
    const s = ARROW_STROKE;
    const head = Math.max(12, s * 3.4);
    const pad = s / 2 + 1;
    const pts = [];
    if (kind === 'line') {
      /* volle Gerade, keine Spitze – Schaft endet an den Rändern */
      return { shaft: [[pad, H / 2], [W - pad, H / 2]], head: null, stroke: s };
    }
    if (kind === 'arc') {
      const cx = W / 2;
      const cy = H / 2;
      const rx = Math.max(2, W / 2 - head * 0.45 - pad);
      const ry = Math.max(2, H / 2 - head * 0.45 - pad);
      const a0 = (-80 * Math.PI) / 180;
      const a1 = a0 + (290 * Math.PI) / 180;
      const n = 72;
      for (let i = 0; i <= n; i++) {
        const t = a0 + ((a1 - a0) * i) / n;
        pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
      }
    } else if (kind === 'curve') {
      const x0 = pad;
      const x3 = W - pad - head * 0.3;
      const P0 = [x0, H - pad];
      const P1 = [W * 0.28, pad - H * 0.1];
      const P2 = [W * 0.72, pad - H * 0.1];
      const P3 = [x3, H * 0.62];
      const n = 60;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        pts.push([
          u * u * u * P0[0] + 3 * u * u * t * P1[0] + 3 * u * t * t * P2[0] + t * t * t * P3[0],
          u * u * u * P0[1] + 3 * u * u * t * P1[1] + 3 * u * t * t * P2[1] + t * t * t * P3[1],
        ]);
      }
    } else {
      pts.push([pad, H / 2], [W - pad, H / 2]);
    }
    // Spitze = letzter Punkt; Richtung über die Sehne der letzten ~Kopflänge
    const tip = pts[pts.length - 1];
    let back = pts[0];
    let acc = 0;
    for (let i = pts.length - 1; i > 0; i--) {
      acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      back = pts[i - 1];
      if (acc >= head) break;
    }
    let dx = tip[0] - back[0];
    let dy = tip[1] - back[1];
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const base = [tip[0] - dx * head, tip[1] - dy * head];
    const half = head * 0.5;
    const headPts = [tip, [base[0] - dy * half, base[1] + dx * half], [base[0] + dy * half, base[1] - dx * half]];
    // Schaft kürzen, damit er nicht vorne aus der Spitze ragt
    const shaft = pts.slice();
    let trim = head * 0.7;
    while (shaft.length > 2 && trim > 0) {
      const a = shaft[shaft.length - 1];
      const b = shaft[shaft.length - 2];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (d <= trim) { shaft.pop(); trim -= d; continue; }
      const k = (d - trim) / d;
      shaft[shaft.length - 1] = [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k];
      trim = 0;
    }
    if (shaft.length === 2 && trim > 0) {
      const a = shaft[1];
      const b = shaft[0];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const k = Math.max(0, (d - trim) / (d || 1));
      shaft[1] = [b[0] + (a[0] - b[0]) * k, b[1] + (a[1] - b[1]) * k];
    }
    return { shaft, head: headPts, stroke: s };
  }
  function drawArrowSvg(svg, kind, W, H) {
    if (!(W > 0 && H > 0)) return;
    const g = arrowGeometry(kind, W, H);
    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(2) + ' ' + H.toFixed(2));
    const d = g.shaft.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
    let html = '<path class="arrow-shaft" d="' + d + '" fill="none" stroke="currentColor" stroke-width="' + g.stroke.toFixed(2) +
      '" stroke-linecap="round" stroke-linejoin="round"/>';
    if (g.head && g.head.length) {
      const hd = 'M' + g.head.map((p) => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' L') + ' Z';
      html += '<path class="arrow-head" d="' + hd + '" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>';
    }
    svg.innerHTML = html;
    svg.dataset.w = W.toFixed(1);
    svg.dataset.h = H.toFixed(1);
  }
  /** Zeichnet einen Pfeil auf ein Canvas; (cx,cy) = Mitte, W×H = ungedrehte Box. */
  function drawArrowCanvas(ctx, kind, cx, cy, W, H, rotDeg, color) {
    if (!(W > 0 && H > 0)) return;
    const g = arrowGeometry(kind, W, H);
    ctx.save();
    ctx.translate(cx, cy);
    if (rotDeg) ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.translate(-W / 2, -H / 2);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = g.stroke;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    g.shaft.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    if (g.head && g.head.length) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      g.head.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
  let arrowResizeObserver = null;
  function observeArrowNode(node) {
    if (typeof ResizeObserver === 'undefined') return;
    if (!arrowResizeObserver) {
      arrowResizeObserver = new ResizeObserver((entries) => {
        for (const en of entries) redrawArrowNode(en.target);
      });
    }
    arrowResizeObserver.observe(node);
  }
  function redrawArrowNode(node) {
    const svg = node && node.querySelector(':scope > svg.ann-arrow');
    if (!svg) return;
    const W = node.offsetWidth;
    const H = node.offsetHeight;
    if (!(W > 0 && H > 0)) return;
    if (svg.dataset.w === W.toFixed(1) && svg.dataset.h === H.toFixed(1) && svg.dataset.kind === node.dataset.kind) return;
    svg.dataset.kind = node.dataset.kind;
    drawArrowSvg(svg, node.dataset.kind || 'straight', W, H);
  }
  function applyArrowTransform(node, a) {
    const r = Number(a.rot) || 0;
    node.style.transform = r ? 'rotate(' + r + 'deg)' : '';
    node.style.setProperty('--ann-rot', r + 'deg');
  }

  function renderAnnotationsInto(layer, page) {
    layer.innerHTML = '';
    for (const a of page.annotations) {
      /* v1.51: Fotozwischenspeicher nur im Editor sichtbar (Foto bleibt im Projekt) */
      if (a.type === 'photoClipboard' && !state.editMode) continue;
      const node = document.createElement('div');
      node.className = 'ann' + (a.id === state.selectedId ? ' selected' : '');
      node.dataset.id = a.id;
      node.style.left = a.x + '%';
      node.style.top = a.y + '%';
      if (a.type === 'text' || a.type === 'button' || a.type === 'info') {
        if (a.fixedW) {
          node.classList.add('has-fixed-w');
          node.style.width = a.w + '%';
          node.style.height = 'auto';
        } else {
          node.style.width = 'auto';
          node.style.height = 'auto';
        }
      } else if (a.type === 'beakNr') {
        node.style.width = 'fit-content';
        node.style.height = 'auto';
        node.style.maxWidth = '90%';
      } else {
        node.style.width = a.w + '%';
        node.style.height = a.h + '%';
      }

      if (a.type === 'rect') {
        const box = document.createElement('div');
        box.className = 'ann-rect';
        node.appendChild(box);
      } else if (a.type === 'ellipse') {
        const box = document.createElement('div');
        box.className = 'ann-ellipse';
        node.appendChild(box);
      } else if (a.type === 'photoClipboard') {
        node.classList.add('ann-photo-clipboard-node');
        const hasPhoto = !!(a.photo && a.photo.src);
        if (hasPhoto) node.classList.add('has-photo-data');
        if (state.teleportMode && state.teleportSourceId === a.id) node.classList.add('teleport-source');
        if (state.liveLeafId === a.id) node.classList.add('live-camera');
        const box = document.createElement('div');
        box.className = 'ann-photo-clipboard' + (state.liveLeafId === a.id ? ' live-camera' : '');
        const img = document.createElement('img');
        img.className = 'cell-photo';
        img.alt = '';
        img.decoding = 'async';
        img.draggable = false;
        applyPhotoStyle(img, a.photo);
        box.appendChild(img);
        const video = document.createElement('video');
        video.className = 'cell-live-video';
        video.setAttribute('autoplay', '');
        video.setAttribute('playsinline', '');
        video.setAttribute('muted', '');
        video.muted = true;
        video.playsInline = true;
        box.appendChild(video);
        if (state.liveLeafId === a.id && state.stream) {
          video.srcObject = state.stream;
          state.liveVideoEl = video;
          video.play().catch(() => {});
        }
        const wrap = document.createElement('div');
        wrap.className = 'cell-kamera-wrap';
        const seg = document.createElement('div');
        seg.className = 'cell-cam-seg' + (state.liveLeafId === a.id ? ' live' : '');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Kamera oder Fotos');
        const kam = document.createElement('button');
        kam.type = 'button';
        kam.className = 'cell-cam-seg-btn cell-kamera' + (state.liveLeafId === a.id ? ' live' : '');
        if (state.liveLeafId === a.id) {
          kam.textContent = 'Auslösen';
          kam.setAttribute('aria-label', 'Auslösen');
          kam.title = 'Auslösen';
        } else {
          kam.innerHTML = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.2 8.4h2.3l1.3-2.1h8.4l1.3 2.1h2.3c.9 0 1.6.7 1.6 1.6v8.4c0 .9-.7 1.6-1.6 1.6H4.2c-.9 0-1.6-.7-1.6-1.6V10c0-.9.7-1.6 1.6-1.6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.1" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
          kam.setAttribute('aria-label', 'Kamera');
          kam.title = 'Kamera';
        }
        kam.addEventListener('click', (e) => {
          if (trackDragDidPageSwipe) return;
          e.stopPropagation();
          if (state.liveLeafId === a.id) captureStill();
          else startLiveCamera(a.id);
        });
        const fotos = document.createElement('button');
        fotos.type = 'button';
        fotos.className = 'cell-cam-seg-btn cell-fotos';
        fotos.innerHTML = '<svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.2 18.6V6.4c0-.66.54-1.2 1.2-1.2h4.3l1.9 2.1h7c.66 0 1.2.54 1.2 1.2v2.1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/><path d="M3.2 18.6l2.6-7.1c.17-.47.62-.8 1.13-.8H20.1c.83 0 1.4.82 1.13 1.6l-2.3 6.3H3.2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';
        fotos.setAttribute('aria-label', 'Fotos');
        fotos.title = 'Fotos';
        fotos.addEventListener('click', (e) => {
          if (trackDragDidPageSwipe) return;
          e.stopPropagation();
          openFilePicker(a.id);
        });
        seg.appendChild(kam);
        seg.appendChild(fotos);
        wrap.appendChild(seg);
        if (state.liveLeafId === a.id) {
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'btn sm cell-cam-cancel';
          cancel.textContent = 'Abbrechen';
          cancel.addEventListener('click', (e) => {
            if (trackDragDidPageSwipe) return;
            e.stopPropagation();
            stopLiveCamera();
            renderAll();
          });
          wrap.appendChild(cancel);
        }
        box.appendChild(wrap);
        node.appendChild(box);
      } else if (a.type === 'arrow') {
        node.classList.add('ann-arrow-node');
        node.dataset.kind = arrowKindOf(a);
        node._ann = a;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'ann-arrow');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('preserveAspectRatio', 'none');
        node.appendChild(svg);
        applyArrowTransform(node, a);
        node.style.color = annColorCss(annColorKey(a), 'arrow');
        observeArrowNode(node);
        requestAnimationFrame(() => redrawArrowNode(node));
      } else if (a.type === 'text') {
        const t = document.createElement('div');
        t.className = 'ann-text' + (a.textSize === 'sm' ? ' ann-text-sm' : (a.textSize === 'xl' ? ' ann-text-xl' : ''));
        /* contentEditable only while editing — allows drag-to-move without caret fight */
        t.contentEditable = 'false';
        t.spellcheck = false;
        const initialText = (a.text != null && a.text !== '') ? a.text : 'Text';
        /* textContent keeps \n; CSS pre-wrap shows them. Avoid innerHTML to stay safe. */
        t.textContent = initialText;
        if (!a.text || a.text === 'Text') t.dataset.placeholder = '1';
        function readAnnTextEl(el) {
          let raw = (el.innerText != null ? el.innerText : (el.textContent || ''));
          raw = String(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
          /* contentEditable often appends one trailing \n after a final <br> */
          if (raw.endsWith('\n')) raw = raw.slice(0, -1);
          return raw;
        }
                function syncTextMultilineClass() {
          const raw = readAnnTextEl(t);
          const multi = /\n/.test(raw) || !!t.querySelector('br') || !!t.querySelector('div');
          t.classList.toggle('is-multiline', multi);
        }
        syncTextMultilineClass();
        function placeCaretEnd(el) {
          try {
            const range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          } catch (_) {}
        }
        function insertTextNewline(el) {
          /* Prefer <br> over block <div> — avoids odd vertical jump with hug layout */
          try {
            if (document.queryCommandSupported && document.queryCommandSupported('insertLineBreak')) {
              document.execCommand('insertLineBreak');
              return true;
            }
          } catch (_) {}
          try {
            document.execCommand('insertText', false, '\n');
            return true;
          } catch (_) {}
          try {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return false;
            const range = sel.getRangeAt(0);
            range.deleteContents();
            const br = document.createElement('br');
            range.insertNode(br);
            const z = document.createTextNode('');
            br.parentNode.insertBefore(z, br.nextSibling);
            range.setStartAfter(br);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return true;
          } catch (_) {}
          return false;
        }
        t.addEventListener('beforeinput', (e) => {
          if (t.dataset.placeholder !== '1') return;
          if (!e.inputType || !e.inputType.startsWith('insert')) return;
          e.preventDefault();
          let data = e.data != null ? e.data : '';
          if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') data = '\n';
          t.textContent = data;
          a.text = data;
          delete t.dataset.placeholder;
          syncTextMultilineClass();
          placeCaretEnd(t);
        });
        t.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          if (t.dataset.placeholder === '1') {
            t.textContent = '\n';
            a.text = '\n';
            delete t.dataset.placeholder;
            syncTextMultilineClass();
            placeCaretEnd(t);
            return;
          }
          insertTextNewline(t);
          a.text = readAnnTextEl(t);
          syncTextMultilineClass();
        });
        t.addEventListener('input', () => {
          a.text = readAnnTextEl(t);
          if (t.dataset.placeholder === '1' && a.text && a.text !== 'Text') {
            delete t.dataset.placeholder;
          }
          syncTextMultilineClass();
        });
        t.addEventListener('pointerdown', (e) => {
          if (state.editMode && document.activeElement === t && t.contentEditable === 'true') {
            e.stopPropagation();
          }
        });
        t.addEventListener('focus', () => {
          if (!state.editMode) return;
          state.selectedId = a.id;
          if (state.selectedSplitId) {
            state.selectedSplitId = null;
            document.querySelectorAll('.split-handle.selected').forEach((h) => {
              h.classList.remove('selected');
            });
          }
          layer.querySelectorAll('.ann').forEach((n) => {
            n.classList.toggle('selected', n.dataset.id === a.id);
          });
        });
        t.addEventListener('blur', () => {
          a.text = readAnnTextEl(t);
          t.contentEditable = 'false';
          scheduleViewportRecover();
        });
        node.appendChild(t);
      } else if (a.type === 'button' || a.type === 'info') {
        const box = document.createElement('div');
        box.className = 'ann-button';
        /* v2.06: Geräte Laufzettel = Sichern-Farbe (var(--accent)) */
        if (a.type === 'button' && a.buttonAction === 'geraeteLaufzettel') {
          box.classList.add('ann-button-geraete');
        }

        const label = document.createElement('div');
        label.className = 'ann-button-label';
        label.contentEditable = state.editMode ? 'true' : 'false';
        label.spellcheck = false;
        label.textContent = a.text || (a.type === 'info' ? 'Info' : 'Button');
        label.addEventListener('input', () => {
          a.text = label.textContent || '';
        });
        label.addEventListener('pointerdown', (e) => {
          if (state.editMode && document.activeElement === label) {
            e.stopPropagation();
          }
        });
        label.addEventListener('focus', () => {
          if (!state.editMode) return;
          state.selectedId = a.id;
          if (state.selectedSplitId) {
            state.selectedSplitId = null;
            document.querySelectorAll('.split-handle.selected').forEach((h) => {
              h.classList.remove('selected');
            });
          }
          layer.querySelectorAll('.ann').forEach((n) => {
            n.classList.toggle('selected', n.dataset.id === a.id);
          });
        });
        label.addEventListener('blur', () => {
          scheduleViewportRecover();
        });
        box.appendChild(label);
        node.appendChild(box);

        if (a.type === 'button' && state.editMode) {
          if (!a.buttonAction) a.buttonAction = 'page';
          const actionSel = document.createElement('select');
          actionSel.className = 'ann-button-action';
          actionSel.title = 'Button-Ziel';
          const optPage = document.createElement('option');
          optPage.value = 'page';
          optPage.textContent = 'Seitennummer';
          const optGz = document.createElement('option');
          optGz.value = 'geraeteLaufzettel';
          optGz.textContent = 'Geräte Laufzettel';
          actionSel.appendChild(optPage);
          actionSel.appendChild(optGz);
          actionSel.value = a.buttonAction === 'geraeteLaufzettel' ? 'geraeteLaufzettel' : 'page';
          actionSel.addEventListener('pointerdown', (e) => e.stopPropagation());
          actionSel.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
          actionSel.addEventListener('click', (e) => e.stopPropagation());

          const targetInput = document.createElement('input');
          targetInput.type = 'number';
          targetInput.className = 'ann-button-target';
          targetInput.min = '1';
          targetInput.max = String(targetPageInputMax());
          targetInput.step = '1';
          targetInput.value = a.targetPage > 0 ? String(a.targetPage) : '';
          targetInput.title = 'Zielseite (Nummer wie in der Anzeige)';
          targetInput.placeholder = 'Seite';
          targetInput.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
          });
          targetInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
          targetInput.addEventListener('click', (e) => e.stopPropagation());
          targetInput.addEventListener('input', () => {
            const n = parseInt(targetInput.value, 10);
            a.targetPage = isFinite(n) && n >= 1 ? n : 0;
          });
          targetInput.addEventListener('focus', () => {
            state.selectedId = a.id;
            if (state.selectedSplitId) {
              state.selectedSplitId = null;
              document.querySelectorAll('.split-handle.selected').forEach((h) => {
                h.classList.remove('selected');
              });
            }
            layer.querySelectorAll('.ann').forEach((n) => {
              n.classList.toggle('selected', n.dataset.id === a.id);
            });
          });
          targetInput.addEventListener('blur', () => {
            scheduleViewportRecover();
          });

          function syncButtonActionUi() {
            const isGz = actionSel.value === 'geraeteLaufzettel';
            a.buttonAction = isGz ? 'geraeteLaufzettel' : 'page';
            box.classList.toggle('ann-button-geraete', isGz);
            targetInput.classList.toggle('is-hidden', isGz);
            if (isGz) {
              a.targetPage = 0;
              targetInput.value = '';
              if (!a.text || a.text === 'Button') {
                a.text = 'Geräte Laufzettel';
                label.textContent = a.text;
              } else if (a.text !== 'Geräte Laufzettel') {
                a.text = 'Geräte Laufzettel';
                label.textContent = a.text;
              }
            }
          }
          actionSel.addEventListener('change', () => {
            syncButtonActionUi();
            if (typeof historyCommit === 'function') historyCommit();
          });
          syncButtonActionUi();
          node.appendChild(actionSel);
          node.appendChild(targetInput);
        } else if (a.type === 'info' && state.editMode) {
          /* v1.38: Kompaktes „Öffnen“ unter dem Info-Button → Popup (editierbar) */
          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.className = 'ann-button-target ann-info-open';
          openBtn.textContent = 'Öffnen';
          openBtn.title = 'Info öffnen';
          openBtn.setAttribute('aria-label', 'Info öffnen');
          openBtn.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
          });
          openBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
          openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            state.selectedId = a.id;
            if (state.selectedSplitId) {
              state.selectedSplitId = null;
              document.querySelectorAll('.split-handle.selected').forEach((h) => {
                h.classList.remove('selected');
              });
            }
            layer.querySelectorAll('.ann').forEach((n) => {
              n.classList.toggle('selected', n.dataset.id === a.id);
            });
            openInfoPopup(a);
          });
          node.appendChild(openBtn);
        } else if (a.type === 'button' && !state.editMode) {
          box.addEventListener('click', (e) => {
            if (trackDragDidPageSwipe) return;
            e.stopPropagation();
            if (isGeraeteLaufzettelButton(a)) {
              openGeraeteLaufzettelOverlay();
              return;
            }
            if (!goToTargetPage(a.targetPage)) {
              node.classList.add('flash-invalid');
              setTimeout(() => node.classList.remove('flash-invalid'), 400);
            }
          });
        } else if (a.type === 'info' && !state.editMode) {
          box.addEventListener('click', (e) => {
            if (trackDragDidPageSwipe) return;
            e.stopPropagation();
            openInfoPopup(a);
          });
        }
      } else if (a.type === 'beakNr') {
        const wrap = document.createElement('div');
        wrap.className = 'ann-beak-wrap';

        /* Display as span so the white box hugs text; input only while editing */
        const display = document.createElement('span');
        display.className = 'ann-beak-text ann-beak-display';
        display.textContent = beakNrDisplay(a.qty, a.beakDigits);

        const t = document.createElement('input');
        t.type = 'text';
        t.className = 'ann-beak-text ann-beak-input';
        t.inputMode = 'numeric';
        t.setAttribute('inputmode', 'numeric');
        t.setAttribute('pattern', '[0-9]*');
        t.setAttribute('enterkeyhint', 'done');
        t.autocomplete = 'off';
        t.spellcheck = false;
        t.hidden = true;

        function beakEditRaw() {
          const q = (typeof a.qty === 'number' && a.qty > 0) ? Math.round(a.qty) : 1;
          const d = String(a.beakDigits || '').replace(/\D/g, '') || '';
          return q > 1 ? String(q) + 'x' + d : d; /* v1.14: Menge 1 → nur Nummer */
        }

        function syncBeakInputWidth() {
          /* Measure content width; box-sizing:border-box already includes padding */
          const cs = window.getComputedStyle(t);
          const probe = document.createElement('span');
          probe.textContent = t.value || t.placeholder || ' ';
          probe.style.cssText =
            'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;' +
            'font:' + cs.font + ';' +
            'letter-spacing:' + cs.letterSpacing + ';' +
            'font-variant-numeric:' + cs.fontVariantNumeric + ';';
          document.body.appendChild(probe);
          const tw = Math.ceil(probe.getBoundingClientRect().width);
          probe.remove();
          const padL = parseFloat(cs.paddingLeft) || 0;
          const padR = parseFloat(cs.paddingRight) || 0;
          const bordL = parseFloat(cs.borderLeftWidth) || 0;
          const bordR = parseFloat(cs.borderRightWidth) || 0;
          t.style.width = Math.max(24, tw + padL + padR + bordL + bordR + 1) + 'px';
        }

        function insertBeakXSeparator() {
          const cur = t.value || '';
          if (/[xX×]/.test(cur)) return;
          if (cur.trim() && !isBeakQtyOnlyInput(cur)) return; /* schon eine Nummer */
          const qtyDigits = cur.replace(/\D/g, '') || '1';
          t.value = qtyDigits + 'x';
          syncBeakInputWidth();
          try {
            const n = t.value.length;
            t.setSelectionRange(n, n);
          } catch (_) {}
        }

        function placeBeakHint() {
          const hint = wrap.querySelector('.ann-beak-hint');
          if (!hint) return;
          hint.classList.remove('hint-up', 'hint-left');
          const box = (layer && layer.getBoundingClientRect) ? layer.getBoundingClientRect() : null;
          if (!box) return;
          const r = hint.getBoundingClientRect();
          if (r.bottom > box.bottom - 2) hint.classList.add('hint-up');
          if (r.right > box.right - 2) hint.classList.add('hint-left');
        }

        function showBeakDisplay() {
          display.textContent = beakNrDisplay(a.qty, a.beakDigits);
          display.hidden = false;
          t.hidden = true;
          t.value = '';
          t.style.width = '';
          wrap.classList.remove('is-editing');
        }

        function beginBeakEdit(opts) {
          if (!state.editMode) return;
          wrap.classList.add('is-editing');
          display.hidden = true;
          t.hidden = false;
          /* v1.14: neue Markierung → leeres Feld mit Platzhalter; sonst aktueller Wert */
          t.value = (opts && opts.fresh) ? '' : beakEditRaw();
          syncBeakInputWidth();
          placeBeakHint();
          try {
            t.focus();
            t.select();
          } catch (_) {}
        }

        function finalizeBeakFromInput() {
          const parsed = parseBeakInput(t.value || '', a);
          if (parsed) {
            a.qty = parsed.qty;
            a.beakDigits = parsed.beakDigits;
          }
          a.text = beakNrDisplay(a.qty, a.beakDigits);
          showBeakDisplay();
          rebuildBeakUsage();
        }

        t.addEventListener('pointerdown', (e) => {
          if (state.editMode && document.activeElement === t && !t.hidden) {
            e.stopPropagation();
          }
        });
        t.addEventListener('focus', () => {
          if (!state.editMode) return;
          state.selectedId = a.id;
          if (state.selectedSplitId) {
            state.selectedSplitId = null;
            document.querySelectorAll('.split-handle.selected').forEach((h) => {
              h.classList.remove('selected');
            });
          }
          layer.querySelectorAll('.ann').forEach((n) => {
            n.classList.toggle('selected', n.dataset.id === a.id);
          });
        });
        t.addEventListener('keydown', (e) => {
          if (!state.editMode || t.hidden) return;
          if (e.key === ' ' || e.code === 'Space') {
            // Desktop: Space → insert x (iPad numeric keypad: Enter advances qty → digits)
            e.preventDefault();
            insertBeakXSeparator();
            return;
          }
          if ((e.key === 'x' || e.key === 'X' || e.key === '×' || e.key === '*') && !e.ctrlKey && !e.metaKey) {
            // v1.14: „x“ nur einmal; „*“ als Mengen-Trenner wie Leertaste
            e.preventDefault();
            insertBeakXSeparator();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const cur = t.value || '';
            if (!/[xX×]/.test(cur) && isBeakQtyOnlyInput(cur)) {
              // Enter after a short qty (1–3 digits) → switch to BEAK digits (iPad flow)
              insertBeakXSeparator();
              return;
            }
            finalizeBeakFromInput();
            try { t.blur(); } catch (_) {}
            return;
          }
        });
        t.addEventListener('input', () => {
          // Live draft — finalize on Enter / blur (v1.14: a.text bleibt bis dahin unverändert)
          syncBeakInputWidth();
        });
        t.addEventListener('blur', () => {
          if (!t.hidden) {
            finalizeBeakFromInput();
          } else {
            wrap.classList.remove('is-editing');
          }
          scheduleViewportRecover();
        });

        wrap.addEventListener('click', (e) => {
          if (state.editMode) return; /* Editor: bisheriges Bearbeiten */
          if (trackDragDidPageSwipe) return;
          e.stopPropagation();
          e.preventDefault();
          void openBeakPartInPdf(a.beakDigits);
        });
        wrap.title = 'In der Stückliste zeigen';

        /* v1.14: Hinweis beim Bearbeiten – Menge ist optional */
        t.placeholder = '101.018';
        t.setAttribute('aria-label', 'BEAK-Nr. (Menge optional, z. B. 3x 101.018)');
        const hint = document.createElement('span');
        hint.className = 'ann-beak-hint';
        hint.setAttribute('aria-hidden', 'true');
        hint.innerHTML = 'Nummer eingeben, z.&nbsp;B. <b>101.018</b><br>Menge optional: <b>3x 101.018</b> (ohne = 1)';

        wrap.appendChild(display);
        wrap.appendChild(t);
        wrap.appendChild(hint);
        node.appendChild(wrap);
        node._beginBeakEdit = beginBeakEdit;
      }

      if (a.type === 'text' || a.type === 'button' || a.type === 'info') {
        /* Width-only resize handles (height stays chrome-button / content-driven) */
        for (const corner of ['e', 'w']) {
          const h = document.createElement('div');
          h.className = 'handle ' + corner;
          h.dataset.corner = corner;
          node.appendChild(h);
        }
      } else if (a.type !== 'beakNr') {
        for (const corner of ['nw', 'ne', 'sw', 'se']) {
          const h = document.createElement('div');
          h.className = 'handle ' + corner;
          h.dataset.corner = corner;
          node.appendChild(h);
        }
        if (a.type === 'arrow') {
          // v1.13: Dreh-Griff (unten mittig, damit er nicht mit dem ✕ oben rechts kollidiert)
          const rh = document.createElement('div');
          rh.className = 'handle rot-handle';
          rh.dataset.corner = 'rot';
          rh.title = 'Drehen';
          node.appendChild(rh);
        }
      }

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn sm ann-delete';
      del.textContent = '✕';
      del.title = 'Löschen';
      del.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasBeak = a.type === 'beakNr';
        if (a.type === 'photoClipboard' && state.liveLeafId === a.id) stopLiveCamera();
        page.annotations = page.annotations.filter((x) => x.id !== a.id);
        if (state.selectedId === a.id) state.selectedId = null;
        if (wasBeak) rebuildBeakUsage();
        if (a.type === 'photoClipboard') renderAll();
        else renderAnnotationsOnly();
      });
      node.appendChild(del);

      node.addEventListener('pointerdown', onAnnPointerDown);
      if (a.color && annColorTypeOf(a.type)) applyAnnColor(node, a);
      layer.appendChild(node);
    }
  }

  function refreshIndexNrLabels(listEl, rows) {
    if (!listEl) return;
    const nrEls = listEl.querySelectorAll('.index-nr');
    for (let i = 0; i < nrEls.length; i++) {
      nrEls[i].textContent = indexNrLabel(rows, i);
    }
  }

  function renderIndexRow(page, row, rowIndex) {
    const rowEl = document.createElement('div');
    rowEl.className = 'index-row';
    rowEl.dataset.rowId = row.id;

    const nr = document.createElement('span');
    nr.className = 'index-nr';
    nr.textContent = indexNrLabel(page.rows, rowIndex);
    rowEl.appendChild(nr);

    if (state.editMode) {
      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.className = 'index-text';
      textInput.value = row.text || '';
      textInput.placeholder = 'Arbeitsschritt…';
      textInput.addEventListener('pointerdown', (e) => e.stopPropagation());
      textInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      textInput.addEventListener('input', () => {
        row.text = textInput.value;
        refreshIndexNrLabels(rowEl.parentElement, page.rows);
      });
      rowEl.appendChild(textInput);

      const targetInput = document.createElement('input');
      targetInput.type = 'number';
      targetInput.className = 'index-target';
      targetInput.min = '1';
      targetInput.max = String(targetPageInputMax());
      targetInput.step = '1';
      targetInput.value = row.targetPage > 0 ? String(row.targetPage) : '';
      targetInput.title = 'Zielseite (Nummer wie in der Anzeige, z. B. 36 / N)';
      targetInput.addEventListener('pointerdown', (e) => e.stopPropagation());
      targetInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      targetInput.addEventListener('input', () => {
        const n = parseInt(targetInput.value, 10);
        row.targetPage = isFinite(n) && n >= 1 ? n : 0;
      });
      rowEl.appendChild(targetInput);
    } else {
      const text = document.createElement('span');
      text.className = 'index-text';
      text.textContent = row.text || '';
      rowEl.appendChild(text);

      rowEl.addEventListener('click', (e) => {
        if (trackDragDidPageSwipe) return;
        e.stopPropagation();
        const hasText = String(row.text || '').trim().length > 0;
        if (!hasText) return;
        if (!goToTargetPage(row.targetPage)) {
          rowEl.classList.add('flash-invalid');
          setTimeout(() => rowEl.classList.remove('flash-invalid'), 400);
        }
      });
    }
    return rowEl;
  }

  function renderIndexPanel(page) {
    const panel = document.createElement('div');
    panel.className = 'index-page';

    /* v1.49: kein Chrome-Spacer mehr – Titelband sitzt oben, Tabelle wächst nach oben */
    const header = document.createElement('div');
    header.className = 'index-header';
    /* v1.93: Titel = Name der auf Seite 1 gewählten (aktiven) Variante, sonst Dateiname/Titel */
    let titleVal = (page && page.title) ? page.title : 'Arbeitsschritte';
    let titleFromVariant = false;
    if (state.activeVariantId) {
      const av = variantById(state.activeVariantId);
      const nm = av ? (variantFullLabel(av) || variantShortLabel(av) || '') : '';
      if (nm) { titleVal = nm; titleFromVariant = true; }
    }
    if (state.editMode && !titleFromVariant) {
      /* v1.20: Index-Titel tippbar (nur wenn keine aktive Variante den Titel stellt) */
      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'index-header-title';
      titleInput.value = titleVal;
      titleInput.setAttribute('aria-label', 'Seitentitel');
      titleInput.addEventListener('pointerdown', (e) => e.stopPropagation());
      titleInput.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      titleInput.addEventListener('input', () => {
        page.title = titleInput.value;
      });
      header.appendChild(titleInput);
    } else {
      const title = document.createElement('span');
      title.className = 'index-header-title';
      title.textContent = titleVal;
      if (titleFromVariant) title.setAttribute('aria-label', 'Aktive Variante');
      header.appendChild(title);
    }
    panel.appendChild(header);

    const colHead = document.createElement('div');
    colHead.className = 'index-col-headers';
    const colNr = document.createElement('span');
    colNr.className = 'index-col-nr';
    colNr.textContent = 'Nr.';
    const colTitle = document.createElement('span');
    colTitle.className = 'index-col-title';
    colTitle.textContent = 'Arbeitsschritt';
    colHead.appendChild(colNr);
    colHead.appendChild(colTitle);
    if (state.editMode) {
      const colTarget = document.createElement('span');
      colTarget.className = 'index-col-target';
      colTarget.textContent = 'Seite';
      colHead.appendChild(colTarget);
    }
    panel.appendChild(colHead);

    const list = document.createElement('div');
    list.className = 'index-rows';
    list.addEventListener('pointerdown', (e) => {
      if (state.editMode) e.stopPropagation();
    });
    const rows = padIndexRows(page);
    for (let i = 0; i < rows.length; i++) {
      list.appendChild(renderIndexRow(page, rows[i], i));
    }
    panel.appendChild(list);
    return panel;
  }

  function syncFehlerCellViews(rowId, fieldKey, fieldCls, value) {
    if (!rowId) return;
    const nodes = document.querySelectorAll(
      '.fehler-row[data-row-id="' + rowId + '"] .fehler-cell.' + fieldCls
    );
    for (const el of nodes) {
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        if (el.value !== value) el.value = value;
      } else if ((el.textContent || '') !== value) {
        el.textContent = value;
      }
    }
  }

  function findPageIndexById(pageId) {
    if (!pageId) return -1;
    const pages = state.doc.pages;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i] && pages[i].id === pageId) return i;
    }
    return -1;
  }

  function highlightFehlerRow(rowId) {
    if (!rowId || !el.pageTrack) return;
    const nodes = el.pageTrack.querySelectorAll('.fehler-row[data-row-id="' + rowId + '"]');
    nodes.forEach((node) => {
      node.classList.add('flash-highlight');
      setTimeout(() => node.classList.remove('flash-highlight'), 900);
    });
  }

  function findLayoutPageIdForFehlerRow(rowId) {
    if (!rowId) return null;
    for (const p of state.doc.pages) {
      if (!p || isFixedPage(p)) continue;
      const embed = normalizeFehlerEmbed(p.fehlerEmbed);
      if (!embed) continue;
      if (embed.rowIds.indexOf(rowId) >= 0) return p.id;
    }
    return null;
  }

  function scheduleFehlerHighlight(rowId) {
    if (!rowId) return;
    requestAnimationFrame(() => {
      highlightFehlerRow(rowId);
      setTimeout(() => highlightFehlerRow(rowId), 380);
    });
  }

  function findFehlerRowById(rowId) {
    if (!rowId) return null;
    for (const p of state.doc.pages) {
      if (!isFehlerPage(p)) continue;
      const hit = (p.rows || []).find((r) => r && r.id === rowId);
      if (hit) return hit;
    }
    return null;
  }

  function navigateFehlerRow(row, fromEmbed) {
    if (state.editMode) return;
    if (!row) return;
    /* Empty padded rows: no navigation */
    if (!fehlerRowHasContent(row) && !row.sourcePageId && !fromEmbed) return;
    if (fromEmbed) {
      const last = state.doc.pages.length - 1;
      if (last < 0 || !isFehlerPage(state.doc.pages[last])) {
        flash('Fehleranalyse nicht gefunden');
        return;
      }
      if (state.doc.pageIndex !== last) goToPage(last);
      scheduleFehlerHighlight(row.id);
      return;
    }
    let src = row.sourcePageId;
    if (!src) {
      src = findLayoutPageIdForFehlerRow(row.id);
      if (src) row.sourcePageId = src;
    }
    if (!src) {
      flash('Keine Quellseite verknüpft');
      return;
    }
    const idx = findPageIndexById(src);
    if (idx < 0 || isFixedPage(state.doc.pages[idx])) {
      flash('Quellseite nicht gefunden');
      return;
    }
    if (state.doc.pageIndex !== idx) goToPage(idx);
    scheduleFehlerHighlight(row.id);
  }

  function renderFehlerRow(page, row, rowIndex, opts) {
    opts = opts || {};
    const isEmbed = !!opts.embed;
    const rowEl = document.createElement('div');
    rowEl.className = 'fehler-row' + (isEmbed ? ' fehler-embed-row' : '');
    rowEl.dataset.rowId = row.id;
    rowEl.dataset.rowIndex = String(rowIndex);

    /* v1.8: Auf der letzten Seite sind nur bestehende Einträge editierbar.
       Neue Einträge entstehen ausschließlich über „+ Fehler“ auf Layout-Seiten. */
    const editable = state.editMode && (
      isEmbed ||
      fehlerRowHasContent(row) ||
      !!row.sourcePageId ||
      !!findLayoutPageIdForFehlerRow(row.id)
    );
    if (state.editMode && !editable) {
      rowEl.classList.add('fehler-row-empty', 'is-readonly');
      rowEl.setAttribute('aria-disabled', 'true');
      rowEl.addEventListener('click', (e) => {
        e.stopPropagation();
        flash('Neue Fehler nur über „+ Fehler“ auf einer Layout-Seite');
      });
    }

    const fields = [
      { key: 'date', cls: 'fehler-date', placeholder: 'TT.MM.JJ' },
      { key: 'description', cls: 'fehler-description', placeholder: 'Fehlerbeschreibung…' },
      { key: 'cause', cls: 'fehler-cause', placeholder: 'Ursache…' },
      { key: 'remedy', cls: 'fehler-remedy', placeholder: 'Behebung…' },
    ];

    for (const f of fields) {
      if (editable) {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fehler-cell ' + f.cls;
        input.dataset.field = f.key;
        input.value = row[f.key] || '';
        input.placeholder = f.placeholder;
        input.addEventListener('pointerdown', (e) => e.stopPropagation());
        input.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        input.addEventListener('input', () => {
          row[f.key] = input.value;
          syncFehlerCellViews(row.id, f.key, f.cls, input.value);
        });
        input.addEventListener('blur', () => {
          scheduleViewportRecover();
        });
        rowEl.appendChild(input);
      } else {
        const span = document.createElement('span');
        span.className = 'fehler-cell ' + f.cls;
        span.dataset.field = f.key;
        span.textContent = row[f.key] || '';
        rowEl.appendChild(span);
      }
    }

    /* v1.78/1.79: Minus auch auf Fehleranalyse (letzte Seite) – nur Löschen, kein Plus.
       Orphan-Zeilen (Seite gelöscht, Zeile blieb) können so entfernt werden. */
    if (state.editMode && (isEmbed || editable)) {
      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'btn sm fehler-embed-minus';
      minus.title = 'Eintrag entfernen';
      minus.setAttribute('aria-label', 'Eintrag entfernen');
      minus.textContent = '−';
      minus.addEventListener('pointerdown', (e) => e.stopPropagation());
      minus.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (isEmbed) removeFehlerEmbedRow(page, row.id);
        else removeFehlerPanelRow(row.id);
      });
      rowEl.appendChild(minus);
    }

    if (!state.editMode) {
      /* v1.19: Track-Drag erkennt Wischen vs. Tap; click als Backup (iPad Mini-Bewegung). */
      rowEl.classList.add('fehler-row-nav');
      rowEl.dataset.fehlerNavEmbed = isEmbed ? '1' : '0';
      rowEl.addEventListener('click', (e) => {
        if (trackDragDidPageSwipe) return;
        e.preventDefault();
        const row = findFehlerRowById(rowEl.dataset.rowId);
        if (row) navigateFehlerRow(row, rowEl.dataset.fehlerNavEmbed === '1');
      });
    }

    return rowEl;
  }

  function renderFehlerPanel(page) {
    const panel = document.createElement('div');
    panel.className = 'fehler-page';

    /* v1.49: kein Chrome-Spacer mehr – orange Leiste sitzt oben, Tabelle wächst nach oben */
    const header = document.createElement('div');
    header.className = 'fehler-header';
    const title = document.createElement('span');
    title.className = 'fehler-header-title';
    title.textContent = (page && page.title) ? page.title : 'Fehleranalyse';
    header.appendChild(title);
    panel.appendChild(header);

    const colHead = document.createElement('div');
    colHead.className = 'fehler-col-headers';
    const labels = [
      { cls: 'fehler-col-date', text: 'Datum' },
      { cls: 'fehler-col-description', text: 'Fehlerbeschreibung' },
      { cls: 'fehler-col-cause', text: 'Ursache' },
      { cls: 'fehler-col-remedy', text: 'Behebung' },
    ];
    for (const lab of labels) {
      const span = document.createElement('span');
      span.className = lab.cls;
      span.textContent = lab.text;
      colHead.appendChild(span);
    }
    /* v1.79: kein col-actions-Spacer auf Fehleranalyse – Minus absolut,
       Spalten wie vor v1.78 (kein grauer Streifen / Versatz). */
    panel.appendChild(colHead);

    const list = document.createElement('div');
    list.className = 'fehler-rows';
    const rows = padFehlerRows(page);
    for (let i = 0; i < rows.length; i++) {
      list.appendChild(renderFehlerRow(page, rows[i], i));
    }
    panel.appendChild(list);
    return panel;
  }

  function renderFehlerEmbed(page, rows) {
    const panel = document.createElement('div');
    panel.className = 'fehler-embed';

    const header = document.createElement('div');
    header.className = 'fehler-header fehler-embed-header';
    const title = document.createElement('span');
    title.className = 'fehler-header-title';
    title.textContent = 'Fehleranalyse';
    header.appendChild(title);
    if (state.editMode) {
      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'btn sm fehler-embed-plus';
      plus.title = 'Eintrag hinzufügen';
      plus.setAttribute('aria-label', 'Eintrag hinzufügen');
      plus.textContent = '+';
      plus.addEventListener('pointerdown', (e) => e.stopPropagation());
      plus.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        addFehlerEntry();
      });
      header.appendChild(plus);
    }
    panel.appendChild(header);

    const colHead = document.createElement('div');
    colHead.className = 'fehler-col-headers';
    const labels = [
      { cls: 'fehler-col-date', text: 'Datum' },
      { cls: 'fehler-col-description', text: 'Fehlerbeschreibung' },
      { cls: 'fehler-col-cause', text: 'Ursache' },
      { cls: 'fehler-col-remedy', text: 'Behebung' },
    ];
    for (const lab of labels) {
      const span = document.createElement('span');
      span.className = lab.cls;
      span.textContent = lab.text;
      colHead.appendChild(span);
    }
    if (state.editMode) {
      const spacer = document.createElement('span');
      spacer.className = 'fehler-col-actions';
      spacer.setAttribute('aria-hidden', 'true');
      colHead.appendChild(spacer);
    }
    panel.appendChild(colHead);

    const list = document.createElement('div');
    list.className = 'fehler-rows fehler-embed-rows';
    for (let i = 0; i < rows.length; i++) {
      list.appendChild(renderFehlerRow(page, rows[i], i, { embed: true }));
    }
    panel.appendChild(list);
    return panel;
  }

  /* ---- v1.67/v1.81/v1.83 Highlight-Schleier (ein oder mehrere Fotofelder) -------- */
  function normalizeHighlightLeafIds(src) {
    const out = [];
    if (!src || typeof src !== 'object') return out;
    const raw = Array.isArray(src.highlightLeafIds) ? src.highlightLeafIds : null;
    if (raw) {
      for (const id of raw) {
        if (typeof id === 'string' && id && out.indexOf(id) < 0) out.push(id);
      }
    }
    /* v1.81 → v1.83: einzelnes highlightLeafId migrieren */
    if (!out.length && typeof src.highlightLeafId === 'string' && src.highlightLeafId) {
      out.push(src.highlightLeafId);
    }
    return out;
  }

  function pageHighlightLeafIds(page) {
    if (!page || !page.highlight) return [];
    if (!Array.isArray(page.highlightLeafIds)) page.highlightLeafIds = normalizeHighlightLeafIds(page);
    return page.highlightLeafIds;
  }

  function pageHasHighlight(page) {
    return !!(page && page.kind === 'layout' && page.highlight);
  }

  /** Blatt-Rechteck in % der Layout-Fläche (0–100), inkl. Split-Lücken (schwarz). */
  function leafRectPercentInRoot(root, leafId, gapPctW, gapPctH) {
    if (!root || !leafId) return null;
    const gapW = Math.max(0, Number(gapPctW) || 0);
    const gapH = Math.max(0, Number(gapPctH) || 0);
    function walk(cell, x, y, w, h) {
      if (!cell) return null;
      if (cell.type === 'leaf') {
        return cell.id === leafId ? { x: x, y: y, w: w, h: h } : null;
      }
      if (cell.type !== 'split') return null;
      const ratio = clamp(cell.ratio, 0.15, 0.85);
      if (cell.dir === 'v') {
        const inner = Math.max(0.01, w - gapW);
        const aw = Math.max(0.01, inner * ratio);
        const bw = Math.max(0.01, inner - aw);
        return walk(cell.a, x, y, aw, h) || walk(cell.b, x + aw + gapW, y, bw, h);
      }
      const inner = Math.max(0.01, h - gapH);
      const ah = Math.max(0.01, inner * ratio);
      const bh = Math.max(0.01, inner - ah);
      return walk(cell.a, x, y, w, ah) || walk(cell.b, x, y + ah + gapH, w, bh);
    }
    return walk(root, 0, 0, 100, 100);
  }

  function highlightGapPct() {
    /* 2 mm Rahmen/Lücke ≈ 0,65 % der logischen Breite (siehe Kopfkommentar) */
    const px = (2 / 25.4) * 96;
    return {
      w: (px / PAGE_REF_W) * 100,
      h: (px / PAGE_REF_H) * 100,
    };
  }

  function buildHighlightVeil(page) {
    const leafIds = pageHighlightLeafIds(page);
    if (!leafIds.length) return null;
    const gaps = highlightGapPct();
    const rects = [];
    for (const leafId of leafIds) {
      const leafPct = leafRectPercentInRoot(page.root, leafId, gaps.w, gaps.h);
      if (leafPct && leafPct.w >= 0.2 && leafPct.h >= 0.2) rects.push(leafPct);
    }
    if (!rects.length) return null;

    const veil = document.createElement('div');
    veil.className = 'highlight-veil';
    veil.setAttribute('aria-hidden', 'true');
    veil.dataset.highlightLeafIds = leafIds.join(',');
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const defs = document.createElementNS(svgNS, 'defs');
    const mask = document.createElementNS(svgNS, 'mask');
    const mid = 'hlmask-' + String(page && page.id ? page.id : 'x').replace(/[^a-zA-Z0-9_-]/g, '');
    mask.setAttribute('id', mid);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    /* Weiß nur in gewählten Fotofeldern – schwarze Split-Lücken bleiben unberührt */
    for (const leafPct of rects) {
      const full = document.createElementNS(svgNS, 'rect');
      full.setAttribute('x', String(leafPct.x));
      full.setAttribute('y', String(leafPct.y));
      full.setAttribute('width', String(leafPct.w));
      full.setAttribute('height', String(leafPct.h));
      full.setAttribute('fill', '#fff');
      mask.appendChild(full);
    }
    const anns = (page && Array.isArray(page.annotations)) ? page.annotations : [];
    for (const a of anns) {
      if (!a || (a.type !== 'rect' && a.type !== 'ellipse')) continue;
      const x = Number(a.x) || 0, y = Number(a.y) || 0;
      const w = Math.max(0.5, Number(a.w) || 1), h = Math.max(0.5, Number(a.h) || 1);
      if (a.type === 'rect') {
        const r = document.createElementNS(svgNS, 'rect');
        r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
        r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
        r.setAttribute('fill', '#000');
        mask.appendChild(r);
      } else {
        const ell = document.createElementNS(svgNS, 'ellipse');
        ell.setAttribute('cx', String(x + w / 2));
        ell.setAttribute('cy', String(y + h / 2));
        ell.setAttribute('rx', String(w / 2));
        ell.setAttribute('ry', String(h / 2));
        ell.setAttribute('fill', '#000');
        mask.appendChild(ell);
      }
    }
    defs.appendChild(mask);
    svg.appendChild(defs);
    /* Volle Fläche + Maske: Schleier nur auf Fotofeldern, Trennlinien bleiben schwarz */
    const cover = document.createElementNS(svgNS, 'rect');
    cover.setAttribute('x', '0');
    cover.setAttribute('y', '0');
    cover.setAttribute('width', '100');
    cover.setAttribute('height', '100');
    cover.setAttribute('fill', 'rgba(255,255,255,0.5)');
    cover.setAttribute('mask', 'url(#' + mid + ')');
    svg.appendChild(cover);
    veil.appendChild(svg);
    return veil;
  }

  function updateHighlightToolUI() {
    const btn = el.toolHighlight;
    if (!btn) return;
    const page = currentPage();
    const on = !!(state.editMode && pageHasHighlight(page) && !isFixedPage(page));
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function togglePageHighlight() {
    if (!state.editMode) return;
    const page = currentPage();
    if (!page || isFixedPage(page)) return;
    page.highlight = !page.highlight;
    if (!page.highlight) {
      page.highlightLeafIds = [];
    } else {
      if (!Array.isArray(page.highlightLeafIds)) page.highlightLeafIds = normalizeHighlightLeafIds(page);
      if (!page.highlightLeafIds.length) {
        try { flash('Highlight: Fotofelder antippen, dann Fertig', 3200); } catch (_) {}
      }
    }
    updateHighlightToolUI();
    renderAll();
    if (typeof historyCommit === 'function') historyCommit();
  }

  /** v1.81/v1.83: bei aktivem Highlight Fotofelder antippen – mehrere möglich (Toggle) */
  function trySetHighlightLeafFromTarget(target) {
    if (!state.editMode || !target || !target.closest) return false;
    const page = currentPage();
    if (!pageHasHighlight(page) || isFixedPage(page)) return false;
    if (target.closest('.cell-kamera-wrap, .ann, .split-handle, .ann-delete, .handle, .topbar, .drawer')) return false;
    const leafEl = target.closest('.cell-leaf');
    if (!leafEl) return false;
    const leafId = leafEl.dataset.leafId;
    if (!leafId || !findLeaf(page.root, leafId)) return false;
    if (!Array.isArray(page.highlightLeafIds)) page.highlightLeafIds = normalizeHighlightLeafIds(page);
    const idx = page.highlightLeafIds.indexOf(leafId);
    if (idx >= 0) {
      page.highlightLeafIds.splice(idx, 1);
      try { flash('Highlight-Fotofeld entfernt', 1400); } catch (_) {}
    } else {
      page.highlightLeafIds.push(leafId);
      try {
        flash(
          page.highlightLeafIds.length === 1
            ? 'Highlight-Fotofeld gesetzt – weitere antippen oder Fertig'
            : (page.highlightLeafIds.length + ' Highlight-Fotofelder'),
          1800
        );
      } catch (_) {}
    }
    updateHighlightToolUI();
    renderAll();
    if (typeof historyCommit === 'function') historyCommit();
    return true;
  }

  function drawHighlightVeilCanvas(ctx, page, annotations, W, H, layoutBox) {
    /* Weiße 50%-Abdeckung über allen gewählten Fotofeldern; Split-Lücken bleiben schwarz */
    const leafIds = pageHighlightLeafIds(page);
    if (!leafIds.length || !page || !page.root) return;
    const gaps = highlightGapPct();
    const bx = layoutBox && typeof layoutBox.x === 'number' ? layoutBox.x : 0;
    const by = layoutBox && typeof layoutBox.y === 'number' ? layoutBox.y : 0;
    const bw = layoutBox && typeof layoutBox.w === 'number' ? layoutBox.w : W;
    const bh = layoutBox && typeof layoutBox.h === 'number' ? layoutBox.h : H;
    for (const leafId of leafIds) {
      const leafPct = leafRectPercentInRoot(page.root, leafId, gaps.w, gaps.h);
      if (!leafPct) continue;
      const lx = bx + (leafPct.x / 100) * bw;
      const ly = by + (leafPct.y / 100) * bh;
      const lw = (leafPct.w / 100) * bw;
      const lh = (leafPct.h / 100) * bh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(lx, ly, lw, lh);
      ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(lx, ly, lw, lh);
      ctx.globalCompositeOperation = 'destination-out';
      for (const a of annotations || []) {
        if (!a || (a.type !== 'rect' && a.type !== 'ellipse')) continue;
        const x = (a.x / 100) * W;
        const y = (a.y / 100) * H;
        const w = (a.w / 100) * W;
        const h = (a.h / 100) * H;
        if (a.type === 'rect') {
          ctx.fillRect(x, y, w, h);
        } else {
          ctx.beginPath();
          ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function renderPageSlide(page, index) {
    const slide = document.createElement('div');
    slide.className = 'page-slide';
    slide.dataset.pageIndex = String(index);
    slide.dataset.pageId = page.id;
    if (isIndexPage(page)) slide.dataset.kind = 'index';
    if (isFehlerPage(page)) slide.dataset.kind = 'fehler';
    if (isVariantenPage(page)) slide.dataset.kind = 'varianten';

    const stage = document.createElement('div');
    stage.className = 'stage';
    let aria = 'Seitenlayout-Bühne';
    if (isVariantenPage(page)) aria = 'Varianten';
    else if (isIndexPage(page)) aria = 'Index';
    else if (isFehlerPage(page)) aria = 'Fehleranalyse';
    stage.setAttribute('aria-label', aria);

    const stageInner = document.createElement('div');
    stageInner.className = 'stage-inner';
    if (isVariantenPage(page)) stageInner.classList.add('varianten-stage');

    if (isIndexPage(page)) {
      stageInner.appendChild(renderIndexPanel(page));
    } else if (isFehlerPage(page)) {
      stageInner.appendChild(renderFehlerPanel(page));
    } else if (isVariantenPage(page)) {
      const rootEl = renderCell(page.root, { varianten: true });
      rootEl.classList.add('cell-root');
      rootEl.style.width = '100%';
      rootEl.style.height = '100%';
      stageInner.appendChild(rootEl);
    } else {
      const embedRows = resolveFehlerEmbedRows(page);
      const hasEmbed = embedRows.length > 0;

      if (hasEmbed) {
        stageInner.classList.add('with-fehler-embed');

        const layoutArea = document.createElement('div');
        layoutArea.className = 'layout-area';

        const rootEl = renderCell(page.root);
        rootEl.classList.add('cell-root');
        rootEl.style.width = '100%';
        rootEl.style.height = '100%';
        layoutArea.appendChild(rootEl);

        if (pageHasHighlight(page)) {
          const hv = buildHighlightVeil(page);
          if (hv) layoutArea.appendChild(hv);
        }

        const layer = document.createElement('div');
        layer.className = 'ann-layer';
        renderAnnotationsInto(layer, page);
        layoutArea.appendChild(layer);

        stageInner.appendChild(layoutArea);
        stageInner.appendChild(renderFehlerEmbed(page, embedRows));
      } else {
        const rootEl = renderCell(page.root);
        rootEl.classList.add('cell-root');
        rootEl.style.width = '100%';
        rootEl.style.height = '100%';
        stageInner.appendChild(rootEl);

        if (pageHasHighlight(page)) {
          const hv = buildHighlightVeil(page);
          if (hv) stageInner.appendChild(hv);
        }

        const layer = document.createElement('div');
        layer.className = 'ann-layer';
        renderAnnotationsInto(layer, page);
        stageInner.appendChild(layer);
      }
    }

    stage.appendChild(stageInner);
    slide.appendChild(stage);
    return slide;
  }

  /** v1.17/v1.26/v1.31/v1.50/v1.83: Maßstab logische Seite (PAGE_REF_W×PAGE_REF_H) → Bühne.
   *  Aspect 1180×792 = iPad Air Landscape nutzbar (−Status) → Fenster praktisch ohne Seitenbalken.
   *  stage-ipad-fill: UNIFORM scale (kein sx≠sy-Stretch). Logische Höhe kann per
   *    --page-ref-h an die Bühnen-Aspect angepasst werden → füllt ohne Verzerrung/Letterbox.
   *  Runtime-Scale: bestehende .beak auto-adaptieren (Öffnen/Resize).
   *  stage-ipad-window / Desktop / Portrait-Stapel: width-only, uniform. */
  let pageScaleValue = 0;
  let pageScaleXValue = 0;
  let pageScaleYValue = 0;
  let pageRefHValue = 0;
  /* v2.07: Hochformat – Slide/Stage-Höhe explizit = Breite×Aspect, kein Viewport-Schwarzgap.
     Querformat: Inline-Maße wieder entfernen (Landscape-Swipe unverändert). */
  function syncPortraitSlideSizes() {
    if (!el.pageTrack) return;
    const portrait = document.documentElement.classList.contains('orient-portrait');
    const slides = el.pageTrack.querySelectorAll(':scope > .page-slide');
    slides.forEach((sl) => {
      const stage = sl.querySelector(':scope > .stage');
      if (!portrait) {
        sl.style.removeProperty('height');
        sl.style.removeProperty('flex');
        sl.style.removeProperty('max-height');
        sl.style.removeProperty('min-height');
        if (stage) {
          stage.style.removeProperty('height');
          stage.style.removeProperty('width');
          stage.style.removeProperty('max-height');
          stage.style.removeProperty('aspect-ratio');
        }
        return;
      }
      const w = sl.clientWidth || (el.pageViewport && el.pageViewport.clientWidth) || 0;
      if (!(w > 0)) return;
      const h = Math.round((w * ASPECT_H / ASPECT_W) * 1000) / 1000;
      sl.style.setProperty('height', h + 'px', 'important');
      sl.style.setProperty('max-height', 'none', 'important');
      sl.style.setProperty('min-height', '0', 'important');
      sl.style.setProperty('flex', '0 0 auto', 'important');
      if (stage) {
        stage.style.setProperty('width', '100%', 'important');
        stage.style.setProperty('height', h + 'px', 'important');
        stage.style.setProperty('max-height', 'none', 'important');
        stage.style.setProperty('aspect-ratio', ASPECT_W + ' / ' + ASPECT_H, 'important');
      }
    });
  }

  function updatePageScale() {
    if (!el.pageTrack) return;
    try { syncPortraitSlideSizes(); } catch (_) {}
    const stage = el.pageTrack.querySelector('.stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w) return;
    const fill = document.documentElement.classList.contains('stage-ipad-fill')
      && !document.documentElement.classList.contains('orient-portrait');
    let pageH = PAGE_REF_H;
    if (fill && h > 0) {
      /* v1.83: logische Höhe an Bühnen-Aspect → uniform scale füllt exakt, kein Stretch */
      pageH = PAGE_REF_W * (h / w);
    }
    const sx = w / PAGE_REF_W;
    const sy = sx; /* immer uniform */
    const kx = Math.round(sx * 100000) / 100000;
    const ky = kx;
    const k = kx;
    const ph = Math.round(pageH * 1000) / 1000;
    if (kx === pageScaleXValue && ky === pageScaleYValue && k === pageScaleValue && ph === pageRefHValue) return;
    pageScaleValue = k;
    pageScaleXValue = kx;
    pageScaleYValue = ky;
    pageRefHValue = ph;
    el.pageTrack.style.setProperty('--page-scale', String(k));
    el.pageTrack.style.setProperty('--page-scale-x', String(kx));
    el.pageTrack.style.setProperty('--page-scale-y', String(ky));
    el.pageTrack.style.setProperty('--page-ref-h', ph + 'px');
    document.documentElement.style.setProperty('--page-scale-ui', String(k));
    document.documentElement.style.setProperty('--page-ref-h', ph + 'px');
  }

  function pruneHighlightLeafIds() {
    try {
      for (const page of state.doc.pages || []) {
        if (!page || page.kind !== 'layout') continue;
        const ids = normalizeHighlightLeafIds(page);
        page.highlightLeafIds = ids.filter((id) => !!findLeaf(page.root, id));
        if (page.highlightLeafId != null) delete page.highlightLeafId;
      }
    } catch (_) {}
  }

  function renderAll() {
    const keepStream = state.stream;
    const keepLeaf = state.liveLeafId;
    pruneHighlightLeafIds();
    try { syncVariantsFromPage(); } catch (_) {}
    el.pageTrack.innerHTML = '';
    /* v1.85: Track = Navigationsreihenfolge (Viewer gefiltert nach aktiver Variante) */
    getNavPages().forEach((page) => {
      const i = state.doc.pages.indexOf(page);
      el.pageTrack.appendChild(renderPageSlide(page, i));
    });
    applyTrackTransform(baseOffsetForIndex(state.doc.pageIndex), false);
    updateNearSlides();
    updatePageScale();
    try { scrollPortraitToCurrentPage(); } catch (_) {}
    updatePageIndicator();
    updateChromeForPage();
    rebuildBeakUsage(); /* v1.15: Abgleich/„Nicht in der Stückliste“ nach jeder Änderung aktuell */
    if (keepLeaf && keepStream) {
      state.liveLeafId = keepLeaf;
      state.stream = keepStream;
    }
    if (typeof scheduleHistoryCheck === 'function') scheduleHistoryCheck();
  }

  /** Update .selected classes without wiping annotation DOM (avoids mid-swipe flicker). */
  function clearAnnotationSelectionVisual() {
    if (!el.pageTrack) return;
    el.pageTrack.querySelectorAll('.ann.selected').forEach((n) => {
      n.classList.remove('selected');
    });
  }

  function cssAttrEscape(value) {
    const s = String(value == null ? '' : value);
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const t = target.nodeType === 3 ? target.parentElement : target;
    if (!t || !t.closest) return false;
    const tag = (t.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (t.isContentEditable) return true;
    return !!t.closest('input, textarea, select, [contenteditable="true"]');
  }

  function isBlockingOverlayOpen() {
    if (el.confirmBackdrop && !el.confirmBackdrop.hidden) return true;
    if (el.hinweisBackdrop && !el.hinweisBackdrop.hidden) return true;
    if (el.deviceNicknameBackdrop && !el.deviceNicknameBackdrop.hidden) return true;
    if (el.progressBackdrop && !el.progressBackdrop.hidden) return true;
    if (typeof isOverviewOpen === 'function' && isOverviewOpen()) return true;
    if (el.beakPdfLightbox && !el.beakPdfLightbox.hidden) return true;
    if (el.drawer && el.drawer.classList.contains('open')) return true;
    if (el.menuBackdrop && el.menuBackdrop.classList.contains('open')) return true;
    return false;
  }

  function renderAnnotationsOnly() {
    const page = currentPage();
    if (isFixedPage(page)) return;
    const area = currentLayoutArea();
    if (!area) return;
    let layer = area.querySelector('.ann-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'ann-layer';
      area.appendChild(layer);
    }
    renderAnnotationsInto(layer, page);
    /* v1.67: Highlight-Löcher an aktuelle Rect/Kreis-Positionen anpassen */
    try {
      const host = area.classList.contains('layout-area') ? area : (currentStageInner() || area);
      host.querySelectorAll(':scope > .highlight-veil').forEach((n) => n.remove());
      if (pageHasHighlight(page)) {
        const veil = buildHighlightVeil(page);
        if (veil) host.insertBefore(veil, layer);
      }
    } catch (_) {}
  }

  function splitLeaf(leafId, leafEl) {
    const page = currentPage();
    if (isFixedPage(page) || !page.root) return;
    stopLiveCamera();
    const leaf = findLeaf(page.root, leafId);
    if (!leaf || leaf.type !== 'leaf') return;

    const dir = state.splitTool === 'h' ? 'h' : 'v';
    const photo = clonePhoto(leaf.photo);
    const aLeaf = makeLeaf(photo);
    /* v1.87: Varianten-Metadaten (Name/Position/Id) auf der Foto-Seite behalten */
    if (typeof leaf.caption === 'string') aLeaf.caption = leaf.caption;
    if (typeof leaf.captionShort === 'string') aLeaf.captionShort = leaf.captionShort;
    if (typeof leaf.captionX === 'number' && isFinite(leaf.captionX)) aLeaf.captionX = leaf.captionX;
    if (typeof leaf.captionY === 'number' && isFinite(leaf.captionY)) aLeaf.captionY = leaf.captionY;
    if (typeof leaf.variantId === 'string' && leaf.variantId) aLeaf.variantId = leaf.variantId;
    const splitNode = {
      type: 'split',
      id: uid('s'),
      dir,
      ratio: 0.5,
      a: aLeaf,
      b: makeLeaf(null),
    };
    page.root = replaceLeafWithSplit(page.root, leafId, splitNode);
    /* v1.72: one-shot like Kreis/Rechteck – after one split, deactivate tool */
    setSplitTool(null);
    try { queueChangeLogLabel(dir === 'h' ? 'Horizontal geteilt' : 'Vertikal geteilt'); } catch (_) {}
    renderAll();
    try { if (typeof historyCommit === 'function') historyCommit(); } catch (_) {}
  }

  function addPage() {
    stopLiveCamera();
    state.doc.pages = ensureBookends(state.doc.pages);
    const page = makePage();
    let idx = state.doc.pageIndex + 1;
    const last = state.doc.pages.length - 1;
    // Never insert after the trailing Fehleranalyse page
    if (last >= 0 && isFehlerPage(state.doc.pages[last])) {
      if (idx > last) idx = last;
      if (isFehlerPage(currentPage())) idx = last;
    }
    state.doc.pages.splice(idx, 0, page);
    state.selectedId = null;
    state.selectedSplitId = null;
    renderAll();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        snapToIndex(idx, true);
      });
    });
  }

  /** opts (v1.10, optional): { okLabel, cancelLabel, okPrimary, onOk }.
   *  onOk runs synchronously inside the click (needed for file pickers on iOS). */
  function showConfirm(message, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      el.confirmMessage.textContent = message;
      const okText = el.confirmOk.textContent;
      const cancelText = el.confirmCancel.textContent;
      if (o.okLabel) el.confirmOk.textContent = o.okLabel;
      if (o.cancelLabel) el.confirmCancel.textContent = o.cancelLabel;
      if (o.okPrimary) { el.confirmOk.classList.remove('danger'); el.confirmOk.classList.add('primary'); }
      el.confirmBackdrop.hidden = false;
      const finish = (ok) => {
        el.confirmBackdrop.hidden = true;
        el.confirmOk.textContent = okText;
        el.confirmCancel.textContent = cancelText;
        if (o.okPrimary) { el.confirmOk.classList.remove('primary'); el.confirmOk.classList.add('danger'); }
        if (ok && typeof o.onOk === 'function') {
          try { o.onOk(); } catch (err) { console.error(err); }
        }
        el.confirmOk.removeEventListener('click', onOk);
        el.confirmCancel.removeEventListener('click', onCancel);
        el.confirmBackdrop.removeEventListener('click', onBackdrop);
        resolve(ok);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (e) => {
        if (e.target === el.confirmBackdrop) finish(false);
      };
      el.confirmOk.addEventListener('click', onOk);
      el.confirmCancel.addEventListener('click', onCancel);
      el.confirmBackdrop.addEventListener('click', onBackdrop);
    });
  }

  function showProgress(msg) {
    el.progressMessage.textContent = msg || 'Bitte warten…';
    el.progressBackdrop.hidden = false;
  }
  function hideProgress() {
    el.progressBackdrop.hidden = true;
  }

  /** v1.77: Beim Löschen einer Layout-Seite Fehleranalyse-Zeilen der Seite entfernen
   *  und 1-basierte Seitenverweise (Index/Buttons) nachziehen. */
  function clearFehlerRowsForDeletedPage(deletedPage, remainingPages) {
    if (!deletedPage) return;
    const deletedId = (typeof deletedPage.id === 'string' && deletedPage.id) ? deletedPage.id : null;
    const deletedEmbedIds = new Set();
    const embed = normalizeFehlerEmbed(deletedPage.fehlerEmbed);
    if (embed) {
      for (const id of embed.rowIds) deletedEmbedIds.add(id);
    }
    if (!deletedId && !deletedEmbedIds.size) return;

    const stillEmbedded = collectEmbedRowIds(remainingPages);
    const fp = getFehlerPage();
    if (!fp) return;
    padFehlerRows(fp);
    for (const row of fp.rows) {
      if (!row) continue;
      const tied =
        (deletedId && row.sourcePageId === deletedId) ||
        deletedEmbedIds.has(row.id);
      if (!tied) continue;
      if (stillEmbedded.has(row.id)) {
        if (deletedId && row.sourcePageId === deletedId) {
          row.sourcePageId = findLayoutPageIdForFehlerRow(row.id);
        }
        continue;
      }
      row.date = '';
      row.description = '';
      row.cause = '';
      row.remedy = '';
      row.sourcePageId = null;
    }
    compactFehlerPageRows();
  }

  function renumberPageRefsAfterDelete(deletedPageNum) {
    /* deletedPageNum = 1-basierte Nav-Position (Anzeige), nicht Absolute-Index */
    if (!(deletedPageNum >= 1)) return;
    for (const p of state.doc.pages) {
      if (!p) continue;
      if (isIndexPage(p) && Array.isArray(p.rows)) {
        for (const r of p.rows) {
          if (!r || typeof r.targetPage !== 'number') continue;
          if (r.targetPage === deletedPageNum) r.targetPage = 0;
          else if (r.targetPage > deletedPageNum) r.targetPage -= 1;
        }
      }
      if (Array.isArray(p.annotations)) {
        for (const a of p.annotations) {
          if (!a || typeof a.targetPage !== 'number') continue;
          if (a.targetPage === deletedPageNum) a.targetPage = 0;
          else if (a.targetPage > deletedPageNum) a.targetPage -= 1;
        }
      }
    }
  }

  async function removePage() {
    const cur = currentPage();
    if (isIndexPage(cur) || state.doc.pageIndex === 0) {
      flash('Index kann nicht gelöscht werden');
      return;
    }
    if (isFehlerPage(cur)) {
      flash('Fehleranalyse kann nicht gelöscht werden');
      return;
    }
    if (state.doc.pages.length <= 1) {
      flash('Letzte Seite kann nicht gelöscht werden');
      return;
    }
    const num = state.doc.pageIndex + 1;
    const ok = await showConfirm('Seite ' + num + ' wirklich löschen?');
    if (!ok) return;
    stopLiveCamera();
    const idx = state.doc.pageIndex;
    const deleted = state.doc.pages[idx];
    /* v2.00: Zielseiten sind Nav-Nummern — vor dem Splice Nav-Position merken */
    const navBefore = getNavPages();
    const deletedNavNum = navBefore.indexOf(deleted) + 1; /* 0 = nicht in aktueller Nav */
    state.doc.pages.splice(idx, 1);
    clearFehlerRowsForDeletedPage(deleted, state.doc.pages);
    renumberPageRefsAfterDelete(deletedNavNum);
    state.doc.pages = ensureBookends(state.doc.pages);
    const next = clamp(idx - 1, 0, state.doc.pages.length - 1);
    state.selectedId = null;
    state.selectedSplitId = null;
    state.doc.pageIndex = next;
    renderAll();
    requestAnimationFrame(() => {
      snapToIndex(next, true);
      flash('Seite gelöscht');
    });
  }

  function goToPage(index) {
    if (typeof index !== 'number' || !isFinite(index)) return;
    if (index < 0 || index >= state.doc.pages.length) return;
    /* v1.99: immer über remap — Early-Return erst nach Varianten-Auflösung */
    const dest = remapToVisiblePageIndex(index);
    stopLiveCamera();
    state.selectedId = null;
    state.selectedSplitId = null;
    snapToIndex(dest, true);
    clearAnnotationSelectionVisual();
  }

  /** Index-/Button-Ziel (1-basiert) → Varianten-korrekte Seite. */
  function goToTargetPage(tp) {
    const dest = resolveTargetPageRealIndex(tp);
    if (dest < 0) return false;
    goToPage(dest);
    return true;
  }


  /** v1.39: Label/Text nach Platzieren fokussieren – sync im User-Gesture (iPad-Tastatur). */
  function focusAnnEditable(el, opts) {
    if (!el) return;
    const selectAll = !opts || opts.selectAll !== false;
    try {
      if (el.isContentEditable === false || el.contentEditable === 'false') {
        el.contentEditable = 'true';
      }
    } catch (_) {}
    const apply = () => {
      try { el.focus(); } catch (_) {}
      if (!selectAll) return;
      try {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch (_) {}
    };
    apply();
    /* Nach Paint nachziehen, falls Safari den ersten Focus verworfen hat */
    requestAnimationFrame(() => {
      if (document.activeElement !== el) apply();
      else if (selectAll) {
        try {
          const sel = window.getSelection();
          if (sel && sel.rangeCount === 0) {
            const range = document.createRange();
            range.selectNodeContents(el);
            sel.addRange(range);
          }
        } catch (_) {}
      }
    });
  }

  /* ---- v1.67 Kopieren / Einfügen (Session-Zwischenablage) -------------------- */
  let objectClipboard = null; /* annotation clone without id */
  let copyPasteMode = null; /* 'copy' | 'paste' | null */
  let copyPastePasteAt = null; /* { x, y } client coords for paste callout */

  function hideCopyPasteCallout() {
    copyPasteMode = null;
    copyPastePasteAt = null;
    if (el.copyPasteCallout) el.copyPasteCallout.hidden = true;
  }

  function showCopyPasteCallout(mode, clientX, clientY) {
    if (!el.copyPasteCallout || !el.copyPasteActionBtn) return;
    if (mode !== 'copy' && mode !== 'paste') return;
    if (mode === 'paste' && !objectClipboard) return;
    copyPasteMode = mode;
    copyPastePasteAt = (clientX != null && clientY != null) ? { x: clientX, y: clientY } : null;
    el.copyPasteActionBtn.textContent = mode === 'copy' ? 'Kopieren' : 'Einfügen';
    el.copyPasteCallout.hidden = false;
    const pad = 8;
    let left = (clientX != null ? clientX : window.innerWidth / 2) - 40;
    let top = (clientY != null ? clientY : 80) - 48;
    left = Math.max(pad, Math.min(left, window.innerWidth - 120));
    top = Math.max(pad, Math.min(top, window.innerHeight - 52));
    el.copyPasteCallout.style.left = Math.round(left) + 'px';
    el.copyPasteCallout.style.top = Math.round(top) + 'px';
  }

  function cloneAnnotationForClipboard(a) {
    if (!a || typeof a !== 'object') return null;
    if (a.type === 'photoClipboard') return null; /* Fotozwischenspeicher hat eigenes Teleport */
    let raw;
    try {
      raw = JSON.parse(JSON.stringify(a));
    } catch (_) {
      raw = { ...a };
    }
    delete raw.id;
    const n = normalizeAnnotation(raw);
    return n || raw;
  }

  function copySelectedAnnotation() {
    if (!state.editMode) return false;
    const page = currentPage();
    if (!page || isFixedPage(page) || !state.selectedId || !Array.isArray(page.annotations)) return false;
    const a = page.annotations.find((x) => x && x.id === state.selectedId);
    const cloned = cloneAnnotationForClipboard(a);
    if (!cloned) return false;
    objectClipboard = cloned;
    hideCopyPasteCallout();
    flash('Kopiert');
    return true;
  }

  function pasteAnnotationFromClipboard(clientX, clientY) {
    if (!state.editMode || !objectClipboard) return false;
    const page = currentPage();
    if (!page || isFixedPage(page)) return false;
    if (hist && hist.timer) historyCommit();
    let a;
    try {
      a = JSON.parse(JSON.stringify(objectClipboard));
    } catch (_) {
      a = { ...objectClipboard };
    }
    a.id = uid('a');
    const sr = stageRect();
    const w = typeof a.w === 'number' ? a.w : 10;
    const h = typeof a.h === 'number' ? a.h : 10;
    if (clientX != null && clientY != null && sr && sr.width > 0 && sr.height > 0) {
      let x = ((clientX - sr.left) / sr.width) * 100 - w / 2;
      let y = ((clientY - sr.top) / sr.height) * 100 - h / 2;
      a.x = clamp(x, -5, 95);
      a.y = clamp(y, -5, 95);
    } else {
      a.x = clamp((typeof a.x === 'number' ? a.x : 10) + 3, -5, 95);
      a.y = clamp((typeof a.y === 'number' ? a.y : 10) + 3, -5, 95);
    }
    /* Folge-Einfügen weiter versetzen */
    objectClipboard.x = a.x;
    objectClipboard.y = a.y;
    if (!Array.isArray(page.annotations)) page.annotations = [];
    page.annotations.push(a);
    if (a.type === 'beakNr') rebuildBeakUsage();
    state.selectedId = a.id;
    state.selectedSplitId = null;
    hideCopyPasteCallout();
    renderAll();
    if (typeof historyCommit === 'function') historyCommit();
    flash('Eingefügt');
    return true;
  }

  function onCopyPasteActionClick(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    if (copyPasteMode === 'copy') copySelectedAnnotation();
    else if (copyPasteMode === 'paste') {
      const at = copyPastePasteAt;
      pasteAnnotationFromClipboard(at ? at.x : null, at ? at.y : null);
    }
  }

  async function placeAnnotationAt(clientX, clientY) {
    if (!state.editMode || !state.annTool) return;
    /* v1.15: ausstehende Änderung (z. B. gerade bestätigte BEAK-Nr.) vorher als eigenen Schritt sichern */
    if (hist && hist.timer) historyCommit();
    const page = currentPage();
    if (isFixedPage(page)) return;
    const type = state.annTool;
    let buttonAction = 'page';
    if (type === 'button') {
      const chosen = await pickButtonAction();
      if (!chosen) {
        setAnnTool(null);
        return;
      }
      buttonAction = chosen;
    }
    stopLiveCamera();
    const id = uid('a');
    const sr = stageRect();
    let w, h;
    const isTextTool = type === 'text' || type === 'textSm';
    const textSize = textSizeForTool(type); /* v1.10: klein → 'lg', groß → 'xl' */
    if (isTextTool) { w = textSize === 'xl' ? 24 : 18; h = textSize === 'xl' ? 11 : 8; }
    else if (type === 'button' || type === 'info') { w = 10; h = 5; } /* placement seed only; visual size is content-driven */
    else if (type === 'photoClipboard') { w = 22; h = 28; }
    else if (type === 'arrow') {
      /* v1.13: Startgrößen je Pfeilart (Kreis ≈ quadratisch in Pixeln) */
      const kind = ARROW_KINDS.includes(state.arrowKind) ? state.arrowKind : 'straight';
      const ar = sr.width / Math.max(1, sr.height);
      if (kind === 'arc') { w = 16; h = 16 * ar; }
      else if (kind === 'curve') { w = 22; h = 12 * ar; }
      else { w = 22; h = 6 * ar; }
    }
    else { w = 24; h = 30; }
    let x = ((clientX - sr.left) / Math.max(1, sr.width)) * 100 - w / 2;
    let y = ((clientY - sr.top) / Math.max(1, sr.height)) * 100 - h / 2;
    x = clamp(x, 0, 100 - w);
    y = clamp(y, 0, 100 - h);
    let a;
    if (isTextTool) {
      a = { id, type: 'text', textSize, x, y, w, h, text: 'Text' }; /* placeholder until first input */
      a.color = state.annColor || annDefaultColor(type);
    } else if (type === 'button') {
      if (buttonAction === 'geraeteLaufzettel') {
        a = { id, type: 'button', x, y, w, h, text: 'Geräte Laufzettel', targetPage: 0, buttonAction: 'geraeteLaufzettel' };
      } else {
        a = { id, type: 'button', x, y, w, h, text: 'Button', targetPage: 0, buttonAction: 'page' };
      }
    } else if (type === 'info') {
      a = { id, type: 'info', x, y, w, h, text: 'Info', infoText: '' };
    } else if (type === 'beakNr') {
      w = 14;
      h = 5;
      x = ((clientX - sr.left) / Math.max(1, sr.width)) * 100 - w / 2;
      y = ((clientY - sr.top) / Math.max(1, sr.height)) * 100 - h / 2;
      x = clamp(x, 0, 100 - w);
      y = clamp(y, 0, 100 - h);
      a = normalizeBeakAnnotation({ id, type: 'beakNr', x, y, w, h, qty: 1, beakDigits: '1234' });
    } else if (type === 'photoClipboard') {
      a = { id, type: 'photoClipboard', x, y, w, h, photo: null };
    } else if (type === 'arrow') {
      a = { id, type: 'arrow', kind: ARROW_KINDS.includes(state.arrowKind) ? state.arrowKind : 'straight', x, y, w, h, rot: 0 };
      a.color = state.annColor || annDefaultColor(type);
    } else {
      a = { id, type, x, y, w, h };
      if (annColorTypeOf(type)) a.color = state.annColor || annDefaultColor(type);
    }
    page.annotations.push(a);
    if (a && a.type === 'beakNr') rebuildBeakUsage();
    /* One-shot place tools: deactivate after placing one object */
    if (type === 'rect' || type === 'ellipse' || type === 'arrow' || type === 'text' || type === 'textSm' || type === 'button' || type === 'info' || type === 'beakNr' || type === 'photoClipboard') {
      setAnnTool(null);
    }
    state.selectedId = id;
    const hadSplit = !!state.selectedSplitId;
    state.selectedSplitId = null;
    if (hadSplit) renderAll();
    else renderAnnotationsOnly();
    /* v1.39: Focus sync im Platzier-Gesture (nicht nur rAF) → iPad-Tastatur sofort */
    if (a && (a.type === 'beakNr' || a.type === 'text' || a.type === 'button' || a.type === 'info')) {
      const area = currentLayoutArea();
      const annNode = area && area.querySelector('.ann[data-id="' + id + '"]');
      if (annNode) {
        if (a.type === 'beakNr' && typeof annNode._beginBeakEdit === 'function') {
          annNode._beginBeakEdit({ fresh: true });
        } else if (a.type === 'text') {
          focusAnnEditable(annNode.querySelector('.ann-text'), { selectAll: true });
        } else if (a.type === 'button' || a.type === 'info') {
          /* Info: Label umbenennen (nicht Popup); Öffnen bleibt separat */
          focusAnnEditable(annNode.querySelector('.ann-button-label'), { selectAll: true });
        }
      }
    }
  }

  let drag = null;

  function stageRect() {
    const area = currentLayoutArea();
    return area ? area.getBoundingClientRect() : { width: 1, height: 1, left: 0, top: 0 };
  }

  function onAnnPointerDown(e) {
    if (!state.editMode) return;
    if (e.button != null && e.button !== 0) return;
    if (e.target.closest('.ann-delete')) return;
    if (e.target.closest('.ann-button-target')) return;
    const node = e.currentTarget;
    const id = node.dataset.id;
    const page = currentPage();
    const a = page.annotations.find((x) => x.id === id);
    if (!a) return;

    /* v1.51/v1.53/v1.54: Teleport / Foto schieben / Drehen auf Fotozwischenspeicher.
       Corner/edge handles always win (resize) — do not let photo-move/teleport/page-swipe steal them. */
    const handleEl = (e.target.closest && e.target.closest('.handle')) || (e.target.classList && e.target.classList.contains('handle') ? e.target : null);
    const isHandle = !!handleEl;
    if (isHandle) {
      /* Kill any nascent page-swipe; handles must win over viewport drag */
      trackDrag = null;
    }
    if (a.type === 'photoClipboard' && !isHandle) {
      /* v2.13: Kamera/Fotos im Fotozwischenspeicher – kein Ann-Drag/Capture,
         sonst landet der click (WebKit/Safari 26+) am .ann statt am Button. */
      if (e.target.closest && e.target.closest('.cell-kamera-wrap')) return;
      if (state.teleportMode) {
        onTeleportPhotoHolderPointer(e, a);
        return;
      }
      const hasPhoto = !!(a.photo && a.photo.src);
      const box = node.querySelector('.ann-photo-clipboard');
      const img = box && box.querySelector('img.cell-photo');
      if (state.photoMoveMode && hasPhoto && img) {
        onPhotoPointerDown(e, a, box || node, img);
        return;
      }
      if (state.photoRotateMode && hasPhoto) {
        if (e.target.closest('.cell-kamera-wrap')) return;
        e.preventDefault();
        e.stopPropagation();
        rotatePhotoOfLeaf(a, img);
        return;
      }
    }

    const isTextEl = e.target.classList.contains('ann-text');
    const isBtnLabel = e.target.classList.contains('ann-button-label');
    const isBeakEl = e.target.classList.contains('ann-beak-text') || !!e.target.closest('.ann-beak-wrap');
    const editingText = isTextEl && document.activeElement === e.target && e.target.contentEditable === 'true';
    const editingBeak = e.target.classList.contains('ann-beak-input') && document.activeElement === e.target && !e.target.hidden;
    const editingBtn = isBtnLabel && document.activeElement === e.target;
    if (
      ((a.type === 'text' && editingText) || ((a.type === 'button' || a.type === 'info') && editingBtn) || (a.type === 'beakNr' && editingBeak))
    ) {
      state.selectedId = id;
      if (state.selectedSplitId) {
        state.selectedSplitId = null;
        document.querySelectorAll('.split-handle.selected').forEach((h) => {
          h.classList.remove('selected');
        });
      }
      return;
    }
    const wasAlreadySelected = state.selectedId === id;
    state.selectedId = id;
    if (state.selectedSplitId) {
      state.selectedSplitId = null;
      document.querySelectorAll('.split-handle.selected').forEach((h) => {
        h.classList.remove('selected');
      });
    }
    const layer = node.closest('.ann-layer');
    if (layer) {
      layer.querySelectorAll('.ann').forEach((n) => {
        n.classList.toggle('selected', n.dataset.id === id);
      });
    }

    const sr = stageRect();
    let origW = a.w;
    let origH = a.h;
    /* First text/button width-resize: seed from current visual box, not unused default % */
    if (isHandle && (a.type === 'text' || a.type === 'button' || a.type === 'info') && !a.fixedW && sr.width > 0) {
      const nr = node.getBoundingClientRect();
      if (nr.width > 0) origW = (nr.width / sr.width) * 100;
    }
    const isRotHandle = isHandle && handleEl && handleEl.dataset.corner === 'rot';
    let arrowInfo = null;
    if (a.type === 'arrow') {
      const nr0 = node.getBoundingClientRect();
      arrowInfo = {
        cx: nr0.left + nr0.width / 2,
        cy: nr0.top + nr0.height / 2,
        rot: Number(a.rot) || 0,
        wPx: (a.w / 100) * sr.width,
        hPx: (a.h / 100) * sr.height,
        startAngle: Math.atan2(e.clientY - (nr0.top + nr0.height / 2), e.clientX - (nr0.left + nr0.width / 2)),
      };
    }
    drag = {
      kind: isRotHandle ? 'rotate' : (isHandle ? 'resize' : 'move'),
      arrow: arrowInfo,
      id,
      corner: isHandle && handleEl ? handleEl.dataset.corner : null,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: a.x, y: a.y, w: origW, h: origH },
      stageW: sr.width,
      stageH: sr.height,
      pointerId: e.pointerId,
      isTextTap: (a.type === 'text' || a.type === 'button' || a.type === 'info' || a.type === 'beakNr') && !isHandle,
      tapOnLabel: isBtnLabel,
      annType: a.type,
      moved: false,
      wasAlreadySelected,
    };
    try { node.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  }

  function onSplitDown(e, splitId, dir, wrapEl) {
    if (!state.editMode) return;
    if (e.button != null && e.button !== 0) return;
    /* v1.84: nascent page-swipe killen — Divider muss über Viewport-Drag gewinnen */
    trackDrag = null;
    state.selectedSplitId = splitId;
    state.selectedId = null;
    hideCopyPasteCallout();
    try {
      document.querySelectorAll('.split-handle.selected').forEach((h) => {
        if (h !== e.currentTarget) h.classList.remove('selected');
      });
      if (e.currentTarget && e.currentTarget.classList) e.currentTarget.classList.add('selected');
    } catch (_) {}
    const sr = wrapEl.getBoundingClientRect();
    drag = {
      kind: 'split',
      splitId,
      dir,
      wrapEl,
      startX: e.clientX,
      startY: e.clientY,
      wrapW: sr.width,
      wrapH: sr.height,
      pointerId: e.pointerId,
      moved: false,
    };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e) {
    if (photoGesture) {
      onPhotoPointerMove(e);
      return;
    }
    if (!drag) return;
    if (drag.kind === 'split') {
      if (Math.abs(e.clientX - drag.startX) > 6 || Math.abs(e.clientY - drag.startY) > 6) {
        drag.moved = true;
      }
      const page = currentPage();
      const split = findSplit(page.root, drag.splitId);
      if (!split) return;
      let ratio;
      if (drag.dir === 'v') {
        ratio = (e.clientX - drag.wrapEl.getBoundingClientRect().left) / drag.wrapW;
      } else {
        ratio = (e.clientY - drag.wrapEl.getBoundingClientRect().top) / drag.wrapH;
      }
      split.ratio = clamp(ratio, 0.15, 0.85);
      const kids = Array.from(drag.wrapEl.children).filter((c) => c.classList.contains('cell'));
      if (kids.length >= 2) {
        kids[0].style.flex = split.ratio + ' 1 0px';
        kids[1].style.flex = (1 - split.ratio) + ' 1 0px';
      }
      const handle = drag.wrapEl.querySelector(':scope > .split-handle');
      if (handle) {
        if (kids.length >= 2) {
          const wr = drag.wrapEl.getBoundingClientRect();
          const ar = kids[0].getBoundingClientRect();
          if (drag.dir === 'v') {
            handle.style.left = ((ar.right - wr.left) / wr.width) * 100 + '%';
            handle.style.top = '';
          } else {
            handle.style.top = ((ar.bottom - wr.top) / wr.height) * 100 + '%';
            handle.style.left = '';
          }
        } else if (drag.dir === 'v') {
          handle.style.left = split.ratio * 100 + '%';
        } else {
          handle.style.top = split.ratio * 100 + '%';
        }
      }
      return;
    }
    if (drag.kind === 'rotate2') {
      // v1.13: Zwei-Finger-Drehen – nur die beiden beteiligten Finger zählen
      if (e.pointerId === drag.p1.id) { drag.p1.x = e.clientX; drag.p1.y = e.clientY; }
      else if (e.pointerId === drag.p2.id) { drag.p2.x = e.clientX; drag.p2.y = e.clientY; }
      else return;
      const ang = Math.atan2(drag.p2.y - drag.p1.y, drag.p2.x - drag.p1.x);
      drag.twoAngleDelta = ((ang - drag.twoBase) * 180) / Math.PI;
      if (e.cancelable) e.preventDefault();
    } else if (drag.arrow && e.pointerId === drag.pointerId) {
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
    }
    const page = currentPage();
    const a = page.annotations.find((x) => x.id === drag.id);
    if (!a) return;
    const dx = ((e.clientX - drag.startX) / drag.stageW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.stageH) * 100;

    if (Math.abs(e.clientX - drag.startX) > 6 || Math.abs(e.clientY - drag.startY) > 6) {
      drag.moved = true;
    }

    if (drag.kind === 'rotate' && drag.arrow) {
      // v1.13: Dreh-Griff – Winkel um die Mitte; rastet bei 15°-Schritten (±4°) ein
      const ang = Math.atan2(e.clientY - drag.arrow.cy, e.clientX - drag.arrow.cx);
      a.rot = snapArrowRot(drag.arrow.rot + ((ang - drag.arrow.startAngle) * 180) / Math.PI);
    } else if (drag.kind === 'rotate2' && drag.arrow) {
      a.rot = snapArrowRot(drag.arrow.rot + drag.twoAngleDelta);
    } else if (drag.kind === 'move') {
      a.x = clamp(drag.orig.x + dx, -5, 95);
      a.y = clamp(drag.orig.y + dy, -5, 95);
    } else if (drag.kind === 'resize' && a.type === 'arrow' && drag.arrow) {
      resizeRotatedArrow(a, drag, e);
    } else if (drag.kind === 'resize') {
      const c = drag.corner || '';
      let x = drag.orig.x;
      let y = drag.orig.y;
      let w = drag.orig.w;
      let h = drag.orig.h;
      if (a.type === 'text' || a.type === 'button' || a.type === 'info') {
        /* Width-only: persist w, height stays chrome-button / auto. Min ~2ch ≈ 2.5% of stage. */
        const minW = 2.5;
        if (c.includes('e')) w = Math.max(minW, drag.orig.w + dx);
        if (c.includes('w')) {
          w = Math.max(minW, drag.orig.w - dx);
          x = drag.orig.x + (drag.orig.w - w);
        }
        a.x = x;
        a.w = w;
        a.fixedW = true;
      } else {
        /* v1.53: photoClipboard uses same rect resize; only x/y/w/h — never touch a.photo transforms */
        if (c.includes('e')) w = Math.max(4, drag.orig.w + dx);
        if (c.includes('s')) h = Math.max(4, drag.orig.h + dy);
        if (c.includes('w')) {
          w = Math.max(4, drag.orig.w - dx);
          x = drag.orig.x + (drag.orig.w - w);
        }
        if (c.includes('n')) {
          h = Math.max(4, drag.orig.h - dy);
          y = drag.orig.y + (drag.orig.h - h);
        }
        a.x = x; a.y = y; a.w = w; a.h = h;
      }
    }
    const inner = currentLayoutArea();
    const layer = inner && inner.querySelector('.ann-layer');
    const node = layer && layer.querySelector('[data-id="' + a.id + '"]');
    if (node) {
      node.style.left = a.x + '%';
      node.style.top = a.y + '%';
      if (a.type === 'text' || a.type === 'button' || a.type === 'info') {
        if (a.fixedW) {
          node.classList.add('has-fixed-w');
          node.style.width = a.w + '%';
          node.style.height = 'auto';
        } else {
          node.style.width = 'auto';
          node.style.height = 'auto';
        }
      } else if (a.type === 'beakNr') {
        node.style.width = 'fit-content';
        node.style.height = 'auto';
        node.style.maxWidth = '90%';
      } else {
        node.style.width = a.w + '%';
        node.style.height = a.h + '%';
      }
      if (a.type === 'arrow') {
        applyArrowTransform(node, a);
        redrawArrowNode(node);
      }
    }
  }

  function snapArrowRot(deg) {
    let r = ((deg % 360) + 540) % 360 - 180; // −180 … 180
    const near = Math.round(r / 15) * 15;
    if (Math.abs(r - near) <= 4) r = near;
    if (r === -180) r = 180;
    return Math.round(r * 10) / 10;
  }

  /** Größe ändern im gedrehten Rahmen: gegenüberliegende Ecke bleibt stehen. */
  function resizeRotatedArrow(a, d, e) {
    const th = (d.arrow.rot * Math.PI) / 180;
    const cos = Math.cos(th);
    const sin = Math.sin(th);
    const sdx = e.clientX - d.startX;
    const sdy = e.clientY - d.startY;
    // Bildschirm-Delta → lokaler (ungedrehter) Rahmen
    const lx = sdx * cos + sdy * sin;
    const ly = -sdx * sin + sdy * cos;
    const c = d.corner || '';
    const sx = c.includes('e') ? 1 : (c.includes('w') ? -1 : 0);
    const sy = c.includes('s') ? 1 : (c.includes('n') ? -1 : 0);
    const minPx = Math.max(24, ARROW_STROKE * 5);
    const w0 = d.arrow.wPx;
    const h0 = d.arrow.hPx;
    const w1 = Math.max(minPx, w0 + sx * lx);
    const h1 = Math.max(minPx, h0 + sy * ly);
    // Mitte wandert um die halbe Größenänderung in Richtung der gezogenen Ecke
    const mx = (sx * (w1 - w0)) / 2;
    const my = (sy * (h1 - h0)) / 2;
    const sr = { w: d.stageW, h: d.stageH };
    const c0x = ((d.orig.x / 100) * sr.w) + w0 / 2;
    const c0y = ((d.orig.y / 100) * sr.h) + h0 / 2;
    const cx = c0x + mx * cos - my * sin;
    const cy = c0y + mx * sin + my * cos;
    a.w = (w1 / sr.w) * 100;
    a.h = (h1 / sr.h) * 100;
    a.x = ((cx - w1 / 2) / sr.w) * 100;
    a.y = ((cy - h1 / 2) / sr.h) * 100;
  }

  /** v1.13: zweiter Finger während ein Pfeil gehalten wird → Zwei-Finger-Drehen. */
  function onArrowSecondPointerDown(e) {
    if (!drag || !drag.arrow || e.pointerType !== 'touch') return;
    if (e.pointerId === drag.pointerId || (drag.kind !== 'move' && drag.kind !== 'rotate2')) return;
    if (drag.kind === 'rotate2') return;
    const page = currentPage();
    const a = page && page.annotations && page.annotations.find((x) => x.id === drag.id);
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const x1 = drag.lastX != null ? drag.lastX : drag.startX;
    const y1 = drag.lastY != null ? drag.lastY : drag.startY;
    drag.kind = 'rotate2';
    drag.moved = true;
    drag.p1 = { id: drag.pointerId, x: x1, y: y1 };
    drag.p2 = { id: e.pointerId, x: e.clientX, y: e.clientY };
    drag.twoBase = Math.atan2(e.clientY - y1, e.clientX - x1);
    drag.twoAngleDelta = 0;
    drag.arrow.rot = Number(a.rot) || 0;
  }

  function onPointerUp(e) {
    if (photoGesture) {
      onPhotoPointerUp(e || { pointerId: -1 });
    }
    const d = drag;
    drag = null;
    if (d && d.kind === 'split' && !d.moved && state.editMode) {
      state.selectedSplitId = d.splitId;
      state.selectedId = null;
      renderAll();
      return;
    }
    if (d && d.moved && state.editMode && (d.annType === 'rect' || d.annType === 'ellipse')) {
      const page = currentPage();
      if (pageHasHighlight(page)) {
        try { renderAnnotationsOnly(); } catch (_) {}
      }
    }
    /* v1.67 iPad: erneutes Tippen auf Auswahl → Kopieren-Callout */
    if (
      d &&
      !d.moved &&
      d.wasAlreadySelected &&
      state.editMode &&
      isAppleTouchDevice() &&
      !d.corner &&
      d.kind === 'move'
    ) {
      const node = document.querySelector('.ann[data-id="' + d.id + '"]');
      const r = node ? node.getBoundingClientRect() : null;
      const cx = r ? r.left + r.width / 2 : d.startX;
      const cy = r ? r.top : d.startY;
      showCopyPasteCallout('copy', cx, cy);
      return;
    }
    if (d && d.isTextTap && !d.moved) {
      const inner = currentLayoutArea();
      if (inner && state.editMode) {
        const annNode = inner.querySelector('.ann[data-id="' + d.id + '"]');
        const page = currentPage();
        const annObj = page && Array.isArray(page.annotations)
          ? page.annotations.find((x) => x && x.id === d.id)
          : null;
        const textEl = annNode && annNode.querySelector('.ann-text');
        const btnLabel = annNode && annNode.querySelector('.ann-button-label');
        const beakEl = annNode && (annNode.querySelector('.ann-beak-input') || annNode.querySelector('.ann-beak-text'));
        if (annObj && annObj.type === 'info') {
          /* Tip auf Label → Beschriftung; sonst Info-Popup (infoText) */
          if (d.tapOnLabel && btnLabel) {
            try { btnLabel.focus(); } catch (_) {}
          } else {
            openInfoPopup(annObj);
          }
        } else if (textEl) {
          textEl.contentEditable = 'true';
          try { textEl.focus(); } catch (_) {}
          if (textEl.dataset.placeholder === '1') {
            try {
              const range = document.createRange();
              range.selectNodeContents(textEl);
              const sel = window.getSelection();
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (_) {}
          }
        } else if (beakEl) {
          if (typeof annNode._beginBeakEdit === 'function') annNode._beginBeakEdit();
          else {
            try { beakEl.focus(); } catch (_) {}
          }
        } else if (btnLabel) {
          try { btnLabel.focus(); } catch (_) {}
        }
      }
    }
  }

  let filePickerTarget = null;

  function setPhoto(leafId, dataUrl) {
    let found = false;
    let isClipboard = false;
    /* v1.92: zuerst aktuelle Seite — sonst trifft gleiche leafId auf Shared/Geschwister */
    const pages = state.doc.pages || [];
    const cur = currentPage();
    const ordered = [];
    if (cur) ordered.push(cur);
    for (const page of pages) {
      if (page && page !== cur) ordered.push(page);
    }
    for (const page of ordered) {
      if (isFixedPage(page)) continue;
      if (page.root) {
        const leaf = findLeaf(page.root, leafId);
        if (leaf) {
          leaf.photo = dataUrl
            ? { src: dataUrl, scale: 1, x: 0.5, y: 0.5 }
            : null;
          found = true;
          break;
        }
      }
      if (Array.isArray(page.annotations)) {
        const a = page.annotations.find((x) => x && x.type === 'photoClipboard' && x.id === leafId);
        if (a) {
          a.photo = dataUrl
            ? { src: dataUrl, scale: 1, x: 0.5, y: 0.5 }
            : null;
          found = true;
          isClipboard = true;
          break;
        }
      }
    }
    if (!found) return;
    renderAll();
    // v1.12: Nach dem Einfügen (Kamera, Fotos, Drag & Drop) direkt „Foto schieben“ aktivieren.
    // Bleibt aktiv bis zum erneuten Tippen auf „Foto schieben“ oder einem anderen Werkzeug.
    // v1.51: auch für Fotozwischenspeicher
    if (dataUrl && state.editMode && !isFixedPage(currentPage()) && !state.photoMoveMode) {
      setPhotoMoveMode(true);
    }
  }

  function stopStreamTracks() {
    if (state.stream) {
      for (const t of state.stream.getTracks()) {
        try { t.stop(); } catch (_) {}
      }
      state.stream = null;
    }
    if (state.liveVideoEl) {
      try { state.liveVideoEl.srcObject = null; } catch (_) {}
      state.liveVideoEl = null;
    }
  }

  function stopLiveCamera() {
    stopStreamTracks();
    state.liveLeafId = null;
  }

  async function startLiveCamera(leafId) {
    if (state.liveLeafId && state.liveLeafId !== leafId) {
      stopLiveCamera();
    }
    state.liveLeafId = leafId;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      flash('Keine Kamera — Fotos wählen');
      openFilePicker(leafId);
      state.liveLeafId = null;
      return;
    }

    renderAll();

    try {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // v2.14: hohe Auflösung anfordern (ohne Vorgabe liefert iOS nur ~640×480)
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 4032 },
            height: { ideal: 3024 },
          },
          audio: false,
        });
      } catch (_) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 4032 }, height: { ideal: 3024 } },
          audio: false,
        });
      }
      if (state.liveLeafId !== leafId) {
        for (const t of stream.getTracks()) {
          try { t.stop(); } catch (_) {}
        }
        return;
      }
      state.stream = stream;
      const slide = el.pageTrack.querySelector(
        '.page-slide[data-page-index="' + state.doc.pageIndex + '"]'
      );
      const leafEl = slide && (
        slide.querySelector('[data-leaf-id="' + leafId + '"]') ||
        slide.querySelector('.ann-photo-clipboard-node[data-id="' + leafId + '"] .ann-photo-clipboard') ||
        slide.querySelector('.ann-photo-clipboard-node[data-id="' + leafId + '"]')
      );
      const video = leafEl && leafEl.querySelector('.cell-live-video');
      if (video) {
        video.srcObject = stream;
        state.liveVideoEl = video;
        await video.play().catch(() => {});
      }
      if (leafEl && !leafEl.classList.contains('live-camera')) {
        renderAll();
      }
    } catch (err) {
      const name = err && err.name ? err.name : '';
      stopLiveCamera();
      renderAll();
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        flash('Kamera verweigert — Fotos');
      } else {
        flash('Kamera nicht verfügbar');
      }
      openFilePicker(leafId);
    }
  }

  function captureStill() {
    const video = state.liveVideoEl;
    const leafId = state.liveLeafId;
    if (!state.stream || !video || !video.videoWidth || !leafId) return;
    // v1.17: Kamerabild auf max. 2500 px (lange Kante) begrenzen
    const k0 = Math.min(1, PHOTO_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.max(1, Math.round(video.videoWidth * k0));
    const h = Math.max(1, Math.round(video.videoHeight * k0));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, w, h);
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    } catch (_) {
      dataUrl = canvas.toDataURL('image/png');
    }
    stopLiveCamera();
    setPhoto(leafId, dataUrl);
  }

  /* v1.65: Mac/Safari Web App – Fotos aus Disk/Fotos-Mediathek.
     Ursachen für stummes Scheitern: display:none/pointer-events:none am input,
     zu enges accept, capture auf dem Library-Pfad, User-Gesture nach async.
     Fix: Library-Input ohne capture, breites accept, aktivierbares CSS,
     frischer Input im Tap-Gesture als Safari-Fallback; Mehrfachauswahl wie Drop. */
  const LIBRARY_ACCEPT =
    'image/*,image/jpeg,image/png,image/heic,image/heif,image/webp,image/gif,image/bmp,' +
    '.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,.bmp,.tif,.tiff';

  function ensureLibraryInputAttrs(input) {
    if (!input) return;
    try { input.removeAttribute('capture'); } catch (_) {}
    try { input.setAttribute('accept', LIBRARY_ACCEPT); } catch (_) {}
    try { input.multiple = true; } catch (_) {}
  }

  function applyPickedImageFiles(files, leafId) {
    const list = Array.from(files || []).filter(isImageFile);
    if (!list.length || !leafId) {
      if (files && files.length) flash('Keine Bilddatei erkannt', 3000, 'error');
      return;
    }
    const page = currentPage();
    const leaves = page && page.root ? leafIdsInOrder(page.root, []) : [];
    const startIdx = leaves.findIndex((l) => l.id === leafId);
    const targets = [leafId];
    for (let i = startIdx + 1; i < leaves.length && targets.length < list.length; i++) {
      if (!(leaves[i].photo && leaves[i].photo.src)) targets.push(leaves[i].id);
    }
    stopLiveCamera();
    let placed = 0;
    (async () => {
      for (let i = 0; i < targets.length; i++) {
        try {
          const dataUrl = await prepareImportedPhoto(list[i]);
          setPhoto(targets[i], dataUrl);
          placed++;
        } catch (err) {
          console.error('Foto lesen', err);
        }
      }
      filePickerTarget = null;
      if (!placed) {
        flash('Foto konnte nicht gelesen werden', 4000, 'error');
        return;
      }
      const notPlaced = list.length - placed;
      let msg = placed === 1 ? 'Foto eingefügt' : (placed + ' Fotos eingefügt');
      if (notPlaced > 0) msg += ' – ' + notPlaced + ' ohne freie Zelle';
      if (placed > 1 || notPlaced) flash(msg, 2500);
    })();
  }

  function triggerLibraryFileClick(input) {
    if (!input) return false;
    ensureLibraryInputAttrs(input);
    try { input.value = ''; } catch (_) {}
    try {
      input.click();
      return true;
    } catch (err) {
      console.warn('libraryFile.click', err);
      return false;
    }
  }

  /** Safari/Mac: fresh <input type=file> created inside the user gesture. */
  function openLibraryPickerViaEphemeralInput(leafId) {
    filePickerTarget = leafId;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = LIBRARY_ACCEPT;
    input.multiple = true;
    input.setAttribute('aria-hidden', 'true');
    input.className = 'hidden-file';
    /* Keep in gesture path: append, click sync, remove after change/cancel timeout */
    document.body.appendChild(input);
    const cleanup = () => {
      try { input.remove(); } catch (_) {}
    };
    input.addEventListener('change', (e) => {
      const id = filePickerTarget || leafId;
      applyPickedImageFiles(e.target.files, id);
      cleanup();
    }, { once: true });
    setTimeout(cleanup, 120000);
    try {
      input.click();
      return true;
    } catch (err) {
      console.warn('ephemeral file input', err);
      cleanup();
      return false;
    }
  }

  function openFilePicker(leafId) {
    filePickerTarget = leafId;
    /* v1.65: Ephemeral input first — Safari/Mac Web App often ignores .click() on
       pre-hidden static inputs (even opacity tricks). Static libraryFile second;
       cameraFile last and without capture so Mac gets a file dialog, not empty camera. */
    if (openLibraryPickerViaEphemeralInput(leafId)) return;
    if (el.libraryFile && triggerLibraryFileClick(el.libraryFile)) return;
    if (el.cameraFile) {
      try { el.cameraFile.removeAttribute('capture'); } catch (_) {}
      try { el.cameraFile.setAttribute('accept', LIBRARY_ACCEPT); } catch (_) {}
      try { el.cameraFile.multiple = true; } catch (_) {}
      try { el.cameraFile.value = ''; } catch (_) {}
      try { el.cameraFile.click(); } catch (err) {
        console.warn('cameraFile.click', err);
        flash('Fotos-Auswahl nicht verfügbar', 4000, 'error');
      }
    }
  }

  function onFileChosen(e) {
    const leafId = filePickerTarget || state.liveLeafId;
    const files = e.target && e.target.files;
    if (!files || !files.length || !leafId) return;
    applyPickedImageFiles(files, leafId);
    try { e.target.value = ''; } catch (_) {}
  }

  /* ---- v1.12: Bilder per Drag & Drop in Zellen (Editor) ----------------------
   * Gleiche Verarbeitung wie Kamera/Fotos-Auswahl: FileReader → Data-URL →
   * setPhoto(leafId, …). Mehrere Bilder: erstes in die Zielzelle, weitere in die
   * folgenden leeren Zellen derselben Seite. Nicht-Bilder → Hinweis.
   * Drops außerhalb einer Zelle öffnen nie die Datei im Browser. */
  const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|tiff?)$/i;
  let dropHighlightEl = null;

  function isImageFile(f) {
    if (!f) return false;
    if (f.type && /^image\//i.test(f.type)) return true;
    return !f.type && IMAGE_EXT_RE.test(f.name || '');
  }

  function dragHasPayload(dt) {
    if (!dt) return false;
    const types = Array.from(dt.types || []);
    return types.includes('Files') || types.includes('text/uri-list') || types.includes('text/html');
  }

  function leafElAtPoint(x, y) {
    if (!state.editMode || state.splitTool || isBlockingOverlayOpen()) return null;
    const page = currentPage();
    if (!page || isFixedPage(page)) return null;
    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)];
    for (const n of stack) {
      if (!n || !n.closest) continue;
      if (n.closest('.topbar, .drawer, .ann-color-bar, .modal-backdrop, .overview-backdrop')) return null;
      const leafEl = n.closest('.cell-leaf');
      if (leafEl) {
        const slide = leafEl.closest('.page-slide');
        if (slide && slide.dataset.pageIndex === String(state.doc.pageIndex)) return leafEl;
        return null;
      }
    }
    return null;
  }

  function setDropHighlight(leafEl) {
    if (dropHighlightEl === leafEl) return;
    if (dropHighlightEl) dropHighlightEl.classList.remove('drop-target', 'drop-replace');
    dropHighlightEl = leafEl || null;
    if (dropHighlightEl) {
      dropHighlightEl.classList.add('drop-target');
      dropHighlightEl.classList.toggle('drop-replace', dropHighlightEl.classList.contains('has-photo-data'));
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error || new Error('Datei nicht lesbar'));
      r.readAsDataURL(file);
    });
  }

  function leafIdsInOrder(cell, out) {
    if (!cell) return out;
    if (cell.type === 'leaf') out.push(cell);
    else { leafIdsInOrder(cell.a, out); leafIdsInOrder(cell.b, out); }
    return out;
  }

  async function imageUrlFromDrop(dt) {
    let url = '';
    try { url = (dt.getData('text/uri-list') || '').split(/\r?\n/).find((l) => l && !l.startsWith('#')) || ''; } catch (_) {}
    if (!url) {
      try {
        const html = dt.getData('text/html') || '';
        const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
        if (m) url = m[1].replace(/&amp;/g, '&');
      } catch (_) {}
    }
    if (!url) return null;
    if (/^data:image\//i.test(url)) return prepareImportedPhoto(url);
    if (!/^(https?:|blob:)/i.test(url)) return null;
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    if (!/^image\//i.test(blob.type || '')) throw new Error('kein Bild');
    return prepareImportedPhoto(blob);
  }

  async function handleCellDrop(leafEl, dt) {
    const leafId = leafEl.dataset.leafId;
    const page = currentPage();
    const files = Array.from((dt && dt.files) || []);
    const images = files.filter(isImageFile);
    const skipped = files.length - images.length;
    if (!images.length) {
      if (files.length) {
        flash('Nur Bilddateien können in Zellen gezogen werden', 3500, 'error');
        return;
      }
      // Bild aus anderem Browser-Tab (URL/HTML)
      try {
        const url = await imageUrlFromDrop(dt);
        if (!url) { flash('Kein Bild erkannt', 3000, 'error'); return; }
        const had = leafEl.classList.contains('has-photo-data');
        stopLiveCamera();
        setPhoto(leafId, url);
        flash(had ? 'Foto ersetzt' : 'Foto eingefügt', 2000);
      } catch (err) {
        console.warn('Bild-URL-Drop', err);
        flash('Bild aus dem Browser konnte nicht übernommen werden – bitte zuerst speichern und als Datei ziehen', 5000, 'error');
      }
      return;
    }
    // Zielzellen: Zielzelle, danach leere Zellen in Reihenfolge
    const leaves = page && page.root ? leafIdsInOrder(page.root, []) : [];
    const startIdx = leaves.findIndex((l) => l.id === leafId);
    const targets = [leafId];
    for (let i = startIdx + 1; i < leaves.length && targets.length < images.length; i++) {
      if (!(leaves[i].photo && leaves[i].photo.src)) targets.push(leaves[i].id);
    }
    const had = leafEl.classList.contains('has-photo-data');
    stopLiveCamera();
    let placed = 0;
    for (let i = 0; i < targets.length; i++) {
      try {
        const dataUrl = await prepareImportedPhoto(images[i]);
        setPhoto(targets[i], dataUrl);
        placed++;
      } catch (err) {
        console.error('Drop lesen', err);
      }
    }
    const notPlaced = images.length - placed;
    let msg = placed === 1 ? (had ? 'Foto ersetzt' : 'Foto eingefügt') : (placed + ' Fotos eingefügt');
    if (notPlaced > 0) msg += ' – ' + notPlaced + ' ohne freie Zelle';
    if (skipped > 0) msg += ' – ' + skipped + ' Nicht-Bild(er) ignoriert';
    flash(msg, notPlaced || skipped ? 4000 : 2000);
  }

  function onDocDragOver(e) {
    const dt = e.dataTransfer;
    if (!dragHasPayload(dt)) return;
    e.preventDefault(); // nie die Datei im Browser öffnen
    const leafEl = leafElAtPoint(e.clientX, e.clientY);
    setDropHighlight(leafEl);
    try { dt.dropEffect = leafEl ? 'copy' : 'none'; } catch (_) {}
  }

  function onDocDragLeave(e) {
    // Fenster verlassen → Markierung weg
    if (!e.relatedTarget || e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      setDropHighlight(null);
    }
  }

  function onDocDrop(e) {
    const dt = e.dataTransfer;
    if (!dragHasPayload(dt)) return;
    e.preventDefault();
    const leafEl = leafElAtPoint(e.clientX, e.clientY);
    setDropHighlight(null);
    if (!leafEl) {
      const hasFiles = Array.from(dt.types || []).includes('Files');
      if (hasFiles) {
        flash(state.editMode ? 'Bild auf eine Fotozelle einer Layout-Seite ziehen' : 'Zum Einfügen von Fotos in den Editor wechseln', 3500);
      }
      return;
    }
    void handleCellDrop(leafEl, dt);
  }


  /* ---- v1.13: Rückgängig / Wiederholen ------------------------------------
   * Schnappschüsse des Projektzustands (Seiten inkl. Zellen, Fotos, Annotationen,
   * Index/Fehleranalyse und Stückliste). Fotos/PDF (lange data:-Strings) werden
   * nur per Referenz geteilt – JS-Strings werden beim Klonen nicht kopiert.
   * Änderungen werden nach jeder Interaktion (pointerup, click, input, change,
   * drop, Rendern) per Signaturvergleich erkannt – so ist jede Bearbeitung
   * abgedeckt, ohne jede Stelle einzeln zu instrumentieren. Max. 50 Schritte. */
  const HISTORY_MAX = 50;
  var hist = { stack: [], index: -1, sig: null, timer: 0, restoring: false, loading: 0 }; // var: vor Init sicher referenzierbar
  let pendingChangeLogLabel = '';
  function queueChangeLogLabel(label) {
    if (label) pendingChangeLogLabel = label;
  }
  function histClone(v) {
    if (Array.isArray(v)) return v.map(histClone);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = histClone(v[k]);
      return o;
    }
    return v;
  }
  function histSignature() {
    const st = state.stueckliste && state.stueckliste.dataUrl ? [state.stueckliste.name, state.stueckliste.dataUrl] : null;
    return JSON.stringify({ p: state.doc.pages, st }, (k, v) => {
      if (typeof v === 'string' && v.length > 240) {
        const m = v.length >> 1;
        return '§' + v.length + ':' + v.slice(0, 40) + v.slice(m, m + 48) + v.slice(-64);
      }
      return v;
    });
  }
  function histSnapshot() {
    return {
      pages: histClone(state.doc.pages),
      stueckliste: state.stueckliste && state.stueckliste.dataUrl
        ? { name: state.stueckliste.name, dataUrl: state.stueckliste.dataUrl }
        : null,
      pageIndex: state.doc.pageIndex,
    };
  }
  function histBusy() {
    // Teleport: „Foto aufgenommen“ ist nur ein Zwischenzustand → erst nach dem Ablegen ein Schritt
    return !!(drag || photoGesture || hist.restoring || hist.loading > 0 || state.teleportPhoto);
  }
  function historyReset() {
    clearTimeout(hist.timer);
    hist.stack = [histSnapshot()];
    hist.index = 0;
    hist.sig = histSignature();
    updateUndoUi();
    persistSoon();
  }
  function historyCommit() {
    clearTimeout(hist.timer);
    hist.timer = 0;
    if (!state.doc || !Array.isArray(state.doc.pages)) return false;
    if (hist.index < 0) { historyReset(); return false; }
    if (histBusy()) { scheduleHistoryCheck(250); return false; }
    const sig = histSignature();
    if (sig === hist.sig) return false;
    const prevSnap = hist.stack[hist.index] || null;
    const fallback = pendingChangeLogLabel || '';
    hist.stack.length = hist.index + 1;
    hist.stack.push(histSnapshot());
    if (hist.stack.length > HISTORY_MAX + 1) hist.stack.splice(0, hist.stack.length - (HISTORY_MAX + 1));
    hist.index = hist.stack.length - 1;
    hist.sig = sig;
    pendingChangeLogLabel = '';
    try { logDocDelta(prevSnap, hist.stack[hist.index], fallback); } catch (_) {}
    updateUndoUi();
    try { bumpThumbCache(); } catch (_) {}
    persistSoon();
    return true;
  }
  function scheduleHistoryCheck(delay) {
    if (!hist) return;
    if (hist.restoring || hist.loading > 0) return;
    clearTimeout(hist.timer);
    hist.timer = setTimeout(historyCommit, delay == null ? 60 : delay);
  }
  function historyRestore(entry, pageIndex) {
    hist.restoring = true;
    changeLogQuiet = true;
    try {
      try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (_) {}
      stopLiveCamera();
      state.teleportPhoto = null;
      state.teleportSourceId = null;
      if (typeof updateTeleportCarryClass === 'function') updateTeleportCarryClass();
      state.selectedId = null;
      state.selectedSplitId = null;
      const pages = histClone(entry.pages);
      state.doc = { pages, pageIndex: clamp(pageIndex, 0, Math.max(0, pages.length - 1)) };
      const cur = state.stueckliste;
      if (!entry.stueckliste) state.stueckliste = null;
      else if (!cur || cur.dataUrl !== entry.stueckliste.dataUrl) {
        state.stueckliste = { name: entry.stueckliste.name, dataUrl: entry.stueckliste.dataUrl, parts: null };
      } else cur.name = entry.stueckliste.name;
      if (isFixedPage(currentPage())) {
        if (state.photoMoveMode) setPhotoMoveMode(false);
        if (state.photoRotateMode) setPhotoRotateMode(false);
        if (state.teleportMode) setTeleportMode(false);
      }
      rebuildBeakUsage();
      updateStuecklisteUi();
      renderAll();
      hist.sig = histSignature();
    } finally {
      hist.restoring = false;
      changeLogQuiet = false;
    }
    updateUndoUi();
    persistSoon();
  }
  function undo() {
    if (!histBusy()) historyCommit(); // offene Eingabe zuerst als Schritt sichern
    if (hist.index <= 0) return false;
    const undone = hist.stack[hist.index];
    hist.index -= 1;
    historyRestore(hist.stack[hist.index], undone.pageIndex);
    flash('Rückgängig');
    return true;
  }
  function redo() {
    if (hist.timer) historyCommit();
    if (hist.index >= hist.stack.length - 1) return false;
    hist.index += 1;
    const e = hist.stack[hist.index];
    historyRestore(e, e.pageIndex);
    flash('Wiederholt');
    return true;
  }
  function updateUndoUi() {
    if (!hist) return;
    const u = document.getElementById('undoBtn');
    const r = document.getElementById('redoBtn');
    if (u) u.disabled = !(hist.index > 0);
    if (r) r.disabled = !(hist.index >= 0 && hist.index < hist.stack.length - 1);
  }
  function onUndoKey(e) {
    if (!state.editMode || e.defaultPrevented || e.altKey) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = (e.key || '').toLowerCase();
    const isUndo = k === 'z' && !e.shiftKey;
    const isRedo = (k === 'z' && e.shiftKey) || (k === 'y' && e.ctrlKey && !e.metaKey);
    if (!isUndo && !isRedo) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement) || isBlockingOverlayOpen()) return;
    e.preventDefault();
    if (isUndo) undo(); else redo();
  }

  /* ---- v1.12: Entf-Taste (Mac/iPad-Tastatur: ⌫) löscht das ausgewählte Objekt ----
   * Nur wenn dessen rotes ✕ sichtbar ist; löst genau diesen Button aus (gleiches
   * Verhalten wie Tippen). Nie beim Tippen in Eingabefeldern/Texten. */
  function visibleDeleteButton() {
    if (!state.editMode || isOverviewOpen()) return null;
    const slide = document.querySelector('.page-slide[data-page-index="' + state.doc.pageIndex + '"]');
    if (!slide) return null;
    const btns = slide.querySelectorAll('.ann.selected .ann-delete, .split-handle.selected .split-delete');
    for (const b of btns) {
      if (b.disabled) continue;
      const cs = getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return b;
    }
    return null;
  }

  function onDeleteKey(e) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (e.defaultPrevented || e.repeat) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement) || isBlockingOverlayOpen()) return;
    const btn = visibleDeleteButton();
    if (!btn) return;
    e.preventDefault();
    btn.click();
  }

  /* ---- v1.12: Foto-Zoom mit Mausrad / Trackpad (Werkzeug „Foto schieben“) ----
   * Mausrad: Zoom um die Cursorposition (über photo.tx/ty-Versatz,
   * begrenzt, sodass das Foto die Zelle immer bedeckt).
   * Trackpad-Pinch (Chrome/Edge/Firefox: wheel + ctrlKey; Safari macOS:
   * gesture*-Events) zoomt das Foto statt der Seite. Grenzen wie Pinch.
   * Tastatur: + / − zoomt das zuletzt unter dem Zeiger liegende Foto. */
  let lastPhotoLeafId = null;

  function photoLeafAtPoint(x, y) {
    if (!state.editMode || !state.photoMoveMode) return null;
    const leafEl = leafElAtPoint(x, y);
    if (!leafEl || !leafEl.classList.contains('has-photo-data')) return null;
    const leaf = findLeaf(currentPage().root, leafEl.dataset.leafId);
    if (!leaf || !leaf.photo || !leaf.photo.src) return null;
    return { leaf, leafEl, img: leafEl.querySelector('img.cell-photo') };
  }

  /** Zoomt ein Foto auf newScale, der Bildpunkt unter (px,py) bleibt – wo möglich – stehen. */
  function zoomPhotoAt(hit, newScale, clientX, clientY) {
    const { leaf, leafEl, img } = hit;
    const p = leaf.photo;
    const s0 = clamp(p.scale || 1, PHOTO_SCALE_MIN, PHOTO_SCALE_MAX);
    const s1 = clamp(newScale, PHOTO_SCALE_MIN, PHOTO_SCALE_MAX);
    if (Math.abs(s1 - s0) < 1e-4) return false;
    const r = leafEl.getBoundingClientRect();
    const w = Math.max(1, r.width);
    const h = Math.max(1, r.height);
    const iw = (img && img.naturalWidth) || w;
    const ih = (img && img.naturalHeight) || h;
    const ax = photoScreenAxes(w, h, iw, ih, p); // v1.13: berücksichtigt Drehung
    const cx = clientX == null ? r.left + w / 2 : clientX;
    const cy = clientY == null ? r.top + h / 2 : clientY;
    const P = [cx - r.left, cy - r.top];
    // Bildpunkt unter dem Cursor: P = size/2 + s·(o + u − size/2) + T  →  T1 so wählen, dass u bleibt
    const axis = (Pk, size, dsize, pos, t) => {
      const o = (size - dsize) * pos;
      const T0 = (t || 0) * size;
      const u = (Pk - T0 - size / 2) / s0 + size / 2 - o;
      const T1 = Pk - size / 2 - s1 * (o + u - size / 2);
      const range = photoTranslateRange(size, dsize, pos, s1);
      return clamp(T1, range[0], range[1]) / size;
    };
    p.tx = axis(P[0], ax.x[0], ax.x[1], ax.x[2], p.tx);
    p.ty = axis(P[1], ax.y[0], ax.y[1], ax.y[2], p.ty);
    p.scale = s1;
    if (img) applyPhotoStyle(img, p);
    lastPhotoLeafId = leaf.id;
    return true;
  }

  function onViewportWheel(e) {
    if (!state.editMode || !state.photoMoveMode) return;
    const hit = photoLeafAtPoint(e.clientX, e.clientY);
    if (!hit) {
      if (e.ctrlKey) e.preventDefault(); // kein Browser-Zoom über der Seite im Foto-Werkzeug
      return;
    }
    e.preventDefault();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16; // Zeilen
    else if (e.deltaMode === 2) dy *= 400; // Seiten
    // ctrlKey = Trackpad-Pinch (feine Deltas) → empfindlicher; Mausrad ~100 je Raste → ~14 %
    const k = e.ctrlKey ? 0.01 : 0.0015;
    const factor = Math.exp(-clamp(dy, -300, 300) * k);
    zoomPhotoAt(hit, (hit.leaf.photo.scale || 1) * factor, e.clientX, e.clientY);
  }

  let gestureHit = null;
  let gestureStartScale = 1;
  function onGestureStart(e) {
    if (!state.editMode || !state.photoMoveMode || isAppleTouchDevice()) return;
    const hit = photoLeafAtPoint(e.clientX, e.clientY);
    e.preventDefault();
    gestureHit = hit;
    gestureStartScale = hit ? (hit.leaf.photo.scale || 1) : 1;
  }
  function onGestureChange(e) {
    if (!state.editMode || !state.photoMoveMode || isAppleTouchDevice()) return;
    e.preventDefault();
    if (gestureHit && typeof e.scale === 'number') zoomPhotoAt(gestureHit, gestureStartScale * e.scale, e.clientX, e.clientY);
  }
  function onGestureEnd(e) {
    if (!state.editMode || !state.photoMoveMode || isAppleTouchDevice()) return;
    e.preventDefault();
    gestureHit = null;
  }

  function onPhotoHoverMove(e) {
    if (!state.editMode || !state.photoMoveMode || e.pointerType === 'touch') return;
    const hit = photoLeafAtPoint(e.clientX, e.clientY);
    if (hit) lastPhotoLeafId = hit.leaf.id;
  }

  function onPhotoZoomKey(e) {
    if (!state.editMode || !state.photoMoveMode) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target) || isBlockingOverlayOpen()) return;
    const inKey = e.key === '+' || e.key === '=' || e.code === 'NumpadAdd';
    const outKey = e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract';
    if (!inKey && !outKey) return;
    const page = currentPage();
    if (!page || isFixedPage(page)) return;
    let leaf = lastPhotoLeafId ? findLeaf(page.root, lastPhotoLeafId) : null;
    if (!leaf || !leaf.photo || !leaf.photo.src) {
      const withPhoto = leafIdsInOrder(page.root, []).filter((l) => l.photo && l.photo.src);
      leaf = withPhoto.length === 1 ? withPhoto[0] : null;
    }
    if (!leaf) { flash('Zeiger über ein Foto bewegen, dann + / −', 2500); return; }
    const area = currentLayoutArea();
    const leafEl = area && area.querySelector('.cell-leaf[data-leaf-id="' + leaf.id + '"]');
    if (!leafEl) return;
    e.preventDefault();
    zoomPhotoAt({ leaf, leafEl, img: leafEl.querySelector('img.cell-photo') }, (leaf.photo.scale || 1) * (inKey ? 1.2 : 1 / 1.2));
  }

  function guessImageExt(src, mimeHint) {
    const m = (mimeHint || '').toLowerCase();
    if (m.includes('png')) return 'png';
    if (m.includes('webp')) return 'webp';
    if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
    if (typeof src === 'string') {
      if (src.startsWith('data:image/png')) return 'png';
      if (src.startsWith('data:image/webp')) return 'webp';
      if (/\.png(\?|$)/i.test(src)) return 'png';
      if (/\.webp(\?|$)/i.test(src)) return 'webp';
    }
    return 'jpg';
  }

  function dataUrlToUint8(dataUrl) {
    return new Promise((resolve, reject) => {
      if (!dataUrl) return reject(new Error('keine Bilddaten'));
      if (typeof dataUrl === 'string' && dataUrl.startsWith('blob:')) {
        fetch(dataUrl)
          .then((r) => r.arrayBuffer())
          .then((buf) => resolve(new Uint8Array(buf)))
          .catch(reject);
        return;
      }
      if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
        const comma = dataUrl.indexOf(',');
        const header = dataUrl.slice(0, comma);
        const body = dataUrl.slice(comma + 1);
        const isBase64 = /;base64/i.test(header);
        if (isBase64) {
          const bin = atob(body);
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          resolve(out);
        } else {
          const decoded = decodeURIComponent(body);
          const out = new Uint8Array(decoded.length);
          for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i);
          resolve(out);
        }
        return;
      }
      reject(new Error('unbekanntes Bildformat'));
    });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('lesen fehlgeschlagen'));
      reader.readAsDataURL(blob);
    });
  }

  function cloneCell(cell, opts) {
    const slim = !!(opts && opts.slim);
    if (cell.type === 'leaf') {
      const photo = normalizePhoto(cell.photo);
      let outPhoto = null;
      if (photo) {
        if (slim) {
          outPhoto = {
            file: photo.file || ('photos/' + cell.id + '.jpg'),
            scale: photo.scale,
            x: photo.x,
            y: photo.y,
            tx: photo.tx,
            ty: photo.ty,
            rot: photo.rot,
          };
          if (!photo.src && !photo.file) outPhoto = null;
        } else {
          outPhoto = {
            src: photo.src || null,
            file: photo.file,
            scale: photo.scale,
            x: photo.x,
            y: photo.y,
            tx: photo.tx,
            ty: photo.ty,
            rot: photo.rot,
          };
        }
      }
      const leafOut = { type: 'leaf', id: cell.id, photo: outPhoto };
      if (typeof cell.caption === 'string' && cell.caption) leafOut.caption = cell.caption;
      if (typeof cell.captionShort === 'string' && cell.captionShort) leafOut.captionShort = cell.captionShort;
      if (typeof cell.captionX === 'number' && isFinite(cell.captionX)) leafOut.captionX = cell.captionX;
      if (typeof cell.captionY === 'number' && isFinite(cell.captionY)) leafOut.captionY = cell.captionY;
      if (typeof cell.variantId === 'string' && cell.variantId) leafOut.variantId = cell.variantId;
      return leafOut;
    }
    return {
      type: 'split',
      id: cell.id,
      dir: cell.dir,
      ratio: cell.ratio,
      a: cloneCell(cell.a, opts),
      b: cloneCell(cell.b, opts),
    };
  }

  /* v1.71/v1.75: Änderungsprotokoll – in project.json; Anzeige/Export newest first.
     Format: "28.09.26 - Seite 09 - Bild gelöscht von BK" bzw. "… von iPad".
     Gerät: localStorage Initialen (anweisungen-device-nickname, nur Gerät), sonst Plattform.
     Getrennt vom Undo-Stack (der bleibt ephemer). */
  const CHANGE_LOG_MAX = 2000;
  const DEVICE_NICK_KEY = 'anweisungen-device-nickname';
  let changeLogQuiet = false;

  /** v1.92: Tiefenkopie mit neuen Leaf/Split-IDs — Spezialseiten teilen keine leafId mit Shared. */
  function cloneCellFreshIds(cell) {
    if (!cell) return makeLeaf(null);
    if (cell.type === 'leaf') {
      const leafOut = {
        type: 'leaf',
        id: uid('l'),
        photo: clonePhoto(cell.photo),
        caption: typeof cell.caption === 'string' ? cell.caption : '',
        captionShort: typeof cell.captionShort === 'string' ? cell.captionShort : '',
        captionX: (typeof cell.captionX === 'number' && isFinite(cell.captionX)) ? cell.captionX : 0.05,
        captionY: (typeof cell.captionY === 'number' && isFinite(cell.captionY)) ? cell.captionY : 0.78,
        variantId: (typeof cell.variantId === 'string' && cell.variantId) ? cell.variantId : null,
      };
      return leafOut;
    }
    return {
      type: 'split',
      id: uid('s'),
      dir: cell.dir === 'h' ? 'h' : 'v',
      ratio: typeof cell.ratio === 'number' ? cell.ratio : 0.5,
      a: cloneCellFreshIds(cell.a),
      b: cloneCellFreshIds(cell.b),
    };
  }


  function getDeviceName() {
    try {
      const nick = localStorage.getItem(DEVICE_NICK_KEY);
      if (nick && String(nick).trim()) return String(nick).trim().slice(0, 48);
    } catch (_) {}
    try {
      const uaData = navigator.userAgentData;
      if (uaData && typeof uaData.platform === 'string' && uaData.platform.trim()) {
        const p = uaData.platform.trim();
        if (/iPad|iPhone|iPod/i.test(p)) return p;
        if (/macOS|Mac/i.test(p)) return 'Mac';
        if (/Windows/i.test(p)) return 'Windows';
        if (/Android/i.test(p)) return 'Android';
        if (/Linux/i.test(p)) return 'Linux';
        return p.slice(0, 32);
      }
    } catch (_) {}
    const ua = navigator.userAgent || '';
    if (/iPad/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)) return 'iPad';
    if (/iPhone|iPod/i.test(ua)) return 'iPhone';
    if (/Android/i.test(ua)) return 'Android';
    if (/Mac OS X|Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Linux/i.test(ua)) return 'Linux';
    try {
      if (navigator.platform && String(navigator.platform).trim()) {
        return String(navigator.platform).trim().slice(0, 32);
      }
    } catch (_) {}
    return 'Gerät';
  }


  /* v1.75: Initialen nur in localStorage (Gerät), nie in .beak/project.json. */
  function getStoredDeviceNickname() {
    try {
      const nick = localStorage.getItem(DEVICE_NICK_KEY);
      if (nick && String(nick).trim()) return String(nick).trim().slice(0, 48);
    } catch (_) {}
    return '';
  }

  function setStoredDeviceNickname(value) {
    const v = String(value == null ? '' : value).trim().slice(0, 48);
    try {
      if (v) localStorage.setItem(DEVICE_NICK_KEY, v);
      else localStorage.removeItem(DEVICE_NICK_KEY);
    } catch (_) {}
    return v;
  }

  function refreshDeviceNicknameHint() {
    const hint = el.deviceNicknameHint || document.getElementById('deviceNicknameHint');
    if (!hint) return;
    const nick = getStoredDeviceNickname();
    if (nick) {
      hint.textContent = nick;
      hint.hidden = false;
    } else {
      hint.textContent = '';
      hint.hidden = true;
    }
  }

  function closeDeviceNicknameModal() {
    if (el.deviceNicknameBackdrop) el.deviceNicknameBackdrop.hidden = true;
  }

  function openDeviceNicknameModal() {
    closeMenu();
    if (!el.deviceNicknameBackdrop || !el.deviceNicknameInput) {
      const current = getStoredDeviceNickname();
      const entered = window.prompt('Initialen für dieses Gerät (leer = Plattformname):', current || '');
      if (entered == null) return;
      const saved = setStoredDeviceNickname(entered);
      refreshDeviceNicknameHint();
      flash(saved ? ('Initialen: ' + saved) : 'Initialen gelöscht – Plattformname wird verwendet');
      return;
    }
    el.deviceNicknameInput.value = getStoredDeviceNickname();
    el.deviceNicknameBackdrop.hidden = false;
    try {
      el.deviceNicknameInput.focus();
      el.deviceNicknameInput.select();
    } catch (_) {}
  }

  function saveDeviceNicknameFromModal() {
    const raw = el.deviceNicknameInput ? el.deviceNicknameInput.value : '';
    const saved = setStoredDeviceNickname(raw);
    closeDeviceNicknameModal();
    refreshDeviceNicknameHint();
    try { syncWelcomeInitialsOverlay(); } catch (_) {}
    flash(saved ? ('Initialen: ' + saved) : 'Initialen gelöscht – Plattformname wird verwendet');
  }

  function changeLogDateStamp(d) {
    const now = d instanceof Date ? d : new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    return dd + '.' + mm + '.' + yy;
  }

  function changeLogPageLabel(pageIndex) {
    if (typeof pageIndex !== 'number' || pageIndex < 0 || !Number.isFinite(pageIndex)) return null;
    return 'Seite ' + String(Math.floor(pageIndex) + 1).padStart(2, '0');
  }

  function normalizeChangeLog(value) {
    if (!Array.isArray(value)) return [];
    return value.map((entry) => {
      if (typeof entry === 'string') {
        const t = entry.trim().slice(0, 320);
        return t ? { at: '', text: t } : null;
      }
      if (!entry || typeof entry !== 'object') return null;
      const at = typeof entry.at === 'string' ? entry.at : '';
      let text = typeof entry.text === 'string' ? entry.text.trim().slice(0, 320) : '';
      if (!text && typeof entry.line === 'string') text = entry.line.trim().slice(0, 320);
      return text ? { at, text } : null;
    }).filter(Boolean).slice(-CHANGE_LOG_MAX);
  }

  /** action = kurze Aktion („Bild gelöscht“); pageIndex optional (0-basiert). */
  function appendChangeLog(action, pageIndex) {
    const act = String(action || 'Projekt geändert').trim().slice(0, 160) || 'Projekt geändert';
    if (!Array.isArray(state.changeLog)) state.changeLog = [];
    const now = new Date();
    const date = changeLogDateStamp(now);
    const page = changeLogPageLabel(pageIndex);
    const device = getDeviceName();
    const line = page
      ? (date + ' - ' + page + ' - ' + act + ' von ' + device)
      : (date + ' - ' + act + ' von ' + device);
    state.changeLog.push({ at: now.toISOString(), text: line });
    if (state.changeLog.length > CHANGE_LOG_MAX) {
      state.changeLog.splice(0, state.changeLog.length - CHANGE_LOG_MAX);
    }
  }

  function changeLogLabelForTarget(target) {
    const n = target && target.closest ? target.closest('button, input, select, textarea, .ann, .split-handle, .page-slide, .ann-delete, .cell-leaf') : null;
    if (!n) return '';
    const id = n.id || '';
    if (id === 'addPageBtn') return 'Seite hinzugefügt';
    if (id === 'removePageBtn') return 'Seite gelöscht';
    if (id === 'fehlerBtn') return 'Fehleranalyse geändert';
    if (id === 'stuecklisteAddBtn' || id === 'stuecklisteFile') return 'Stückliste geändert';
    if (id === 'toolHighlight') return 'Highlight geändert';
    if (id === 'toolSplitV') return 'Vertikal geteilt';
    if (id === 'toolSplitH') return 'Horizontal geteilt';
    if (n.matches('.ann-delete')) return 'Objekt gelöscht';
    if (n.matches('.split-delete')) return 'Teilung entfernt';
    if (n.matches('.ann-color-swatch')) return 'Farbe geändert';
    if (n.matches('.ann-arrow-kind')) return 'Pfeilart geändert';
    if (n.matches('.split-handle')) return 'Teilung verschoben';
    if (n.classList && n.classList.contains('ann')) {
      const t = n.dataset && n.dataset.type;
      if (t === 'rect') return 'Rechteck geändert';
      if (t === 'ellipse') return 'Kreis geändert';
      if (t === 'arrow') return 'Pfeil geändert';
      if (t === 'text') return 'Text geändert';
      if (t === 'beakNr') return 'BEAK-Nr. geändert';
      if (t === 'button') return 'Button geändert';
      if (t === 'info') return 'Info geändert';
      if (t === 'photoClipboard') return 'Fotozwischenspeicher geändert';
      return 'Annotation geändert';
    }
    return '';
  }

  function changeLogText() {
    const entries = normalizeChangeLog(state.changeLog);
    if (!entries.length) return '(Noch keine Einträge)\n';
    // Newest entries first (reverse chronological order). ISO timestamps sort lexically.
    entries.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return entries.map((e) => e.text).join('\n') + '\n';
  }

  const ANN_TYPE_LABELS = {
    rect: 'Rechteck',
    ellipse: 'Kreis',
    arrow: 'Pfeil',
    text: 'Text',
    beakNr: 'BEAK-Nr.',
    button: 'Button',
    info: 'Info',
    photoClipboard: 'Fotozwischenspeicher',
  };

  function leafPhotoKey(photo) {
    if (!photo || typeof photo !== 'object') return '';
    if (typeof photo.ref === 'string' && photo.ref) return 'r:' + photo.ref;
    if (typeof photo.file === 'string' && photo.file) return 'f:' + photo.file;
    if (typeof photo.src === 'string' && photo.src) {
      const s = photo.src;
      if (s.length > 80) {
        const m = s.length >> 1;
        return 's:' + s.length + ':' + s.slice(0, 24) + s.slice(m, m + 24) + s.slice(-24);
      }
      return 's:' + s;
    }
    return '';
  }

  function collectLeafPhotos(root) {
    const map = new Map();
    if (!root) return map;
    walkLeaves(root, (leaf) => {
      if (!leaf || !leaf.id) return;
      map.set(leaf.id, leafPhotoKey(leaf.photo));
    });
    return map;
  }

  function collectAnnIdsByType(annotations) {
    const map = new Map();
    for (const a of annotations || []) {
      if (!a || !a.id || !a.type) continue;
      if (!map.has(a.type)) map.set(a.type, new Set());
      map.get(a.type).add(a.id);
    }
    return map;
  }

  function countSplits(cell) {
    if (!cell || cell.type !== 'split') return 0;
    return 1 + countSplits(cell.a) + countSplits(cell.b);
  }

  function summarizeIndexRows(page) {
    return (page.rows || []).map((r) => (r && r.text) || '').join('\n');
  }

  function summarizeFehlerRows(page) {
    return (page.rows || []).map((r) => {
      if (!r) return '';
      return [r.date, r.description, r.cause, r.remedy].map((x) => x || '').join('|');
    }).join('\n');
  }

  function describeDocDelta(prevSnap, nextSnap) {
    const actions = [];
    if (!prevSnap || !nextSnap) return actions;
    const prevPages = prevSnap.pages || [];
    const nextPages = nextSnap.pages || [];
    const prevById = new Map(prevPages.map((p, i) => [p.id, { p, i }]));
    const nextById = new Map(nextPages.map((p, i) => [p.id, { p, i }]));

    for (const [id, { i }] of nextById) {
      if (!prevById.has(id)) actions.push({ pageIndex: i, action: 'Seite hinzugefügt' });
    }
    for (const [id, { i }] of prevById) {
      if (!nextById.has(id)) actions.push({ pageIndex: i, action: 'Seite gelöscht' });
    }

    const prevSt = prevSnap.stueckliste && prevSnap.stueckliste.dataUrl;
    const nextSt = nextSnap.stueckliste && nextSnap.stueckliste.dataUrl;
    if (!prevSt && nextSt) actions.push({ pageIndex: null, action: 'Stückliste hinzugefügt' });
    else if (prevSt && !nextSt) actions.push({ pageIndex: null, action: 'Stückliste entfernt' });
    else if (prevSt && nextSt && prevSnap.stueckliste.dataUrl !== nextSnap.stueckliste.dataUrl) {
      actions.push({ pageIndex: null, action: 'Stückliste ersetzt' });
    }

    for (const [id, { p: np, i: ni }] of nextById) {
      const prevHit = prevById.get(id);
      if (!prevHit) continue;
      const pp = prevHit.p;
      if (pp.kind === 'index' || np.kind === 'index') {
        if (summarizeIndexRows(pp) !== summarizeIndexRows(np)) {
          actions.push({ pageIndex: ni, action: 'Arbeitsschritte bearbeitet' });
        }
        continue;
      }
      if (pp.kind === 'fehler' || np.kind === 'fehler') {
        if (summarizeFehlerRows(pp) !== summarizeFehlerRows(np)) {
          actions.push({ pageIndex: ni, action: 'Fehleranalyse bearbeitet' });
        }
        continue;
      }
      if (!!pp.highlight !== !!np.highlight) {
        actions.push({ pageIndex: ni, action: np.highlight ? 'Highlight eingeschaltet' : 'Highlight ausgeschaltet' });
      } else if (pp.highlight) {
        const a = normalizeHighlightLeafIds(pp).slice().sort().join('\0');
        const b = normalizeHighlightLeafIds(np).slice().sort().join('\0');
        if (a !== b) actions.push({ pageIndex: ni, action: 'Highlight-Fotofelder geändert' });
      }
      const prevPhotos = collectLeafPhotos(pp.root);
      const nextPhotos = collectLeafPhotos(np.root);
      let addedPhoto = 0, removedPhoto = 0, replacedPhoto = 0;
      for (const [lid, nk] of nextPhotos) {
        const pk = prevPhotos.has(lid) ? prevPhotos.get(lid) : null;
        if (!prevPhotos.has(lid)) { if (nk) addedPhoto++; }
        else if (!pk && nk) addedPhoto++;
        else if (pk && !nk) removedPhoto++;
        else if (pk && nk && pk !== nk) replacedPhoto++;
      }
      for (const [lid, pk] of prevPhotos) {
        if (!nextPhotos.has(lid) && pk) removedPhoto++;
      }
      if (addedPhoto) actions.push({ pageIndex: ni, action: addedPhoto === 1 ? 'Bild hinzugefügt' : (addedPhoto + ' Bilder hinzugefügt') });
      if (removedPhoto) actions.push({ pageIndex: ni, action: removedPhoto === 1 ? 'Bild gelöscht' : (removedPhoto + ' Bilder gelöscht') });
      if (replacedPhoto) actions.push({ pageIndex: ni, action: replacedPhoto === 1 ? 'Bild ersetzt' : (replacedPhoto + ' Bilder ersetzt') });

      const ps = countSplits(pp.root);
      const ns = countSplits(np.root);
      if (ns > ps) actions.push({ pageIndex: ni, action: 'Teilung hinzugefügt' });
      else if (ns < ps) actions.push({ pageIndex: ni, action: 'Teilung entfernt' });

      const prevAnn = collectAnnIdsByType(pp.annotations);
      const nextAnn = collectAnnIdsByType(np.annotations);
      const types = new Set([...prevAnn.keys(), ...nextAnn.keys()]);
      for (const t of types) {
        const pa = prevAnn.get(t) || new Set();
        const na = nextAnn.get(t) || new Set();
        let add = 0, rem = 0;
        for (const x of na) if (!pa.has(x)) add++;
        for (const x of pa) if (!na.has(x)) rem++;
        const label = ANN_TYPE_LABELS[t] || t;
        if (add) actions.push({ pageIndex: ni, action: add === 1 ? (label + ' hinzugefügt') : (add + '× ' + label + ' hinzugefügt') });
        if (rem) actions.push({ pageIndex: ni, action: rem === 1 ? (label + ' gelöscht') : (rem + '× ' + label + ' gelöscht') });
      }

      const pe = (pp.fehlerEmbed && Array.isArray(pp.fehlerEmbed.rowIds)) ? pp.fehlerEmbed.rowIds.join(',') : '';
      const ne = (np.fehlerEmbed && Array.isArray(np.fehlerEmbed.rowIds)) ? np.fehlerEmbed.rowIds.join(',') : '';
      if (pe !== ne) actions.push({ pageIndex: ni, action: 'Fehler-Eintrag geändert' });
    }

    const seen = new Set();
    const uniq = [];
    for (const a of actions) {
      const k = String(a.pageIndex) + '|' + a.action;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(a);
    }
    return uniq.slice(0, 12);
  }

  function logDocDelta(prevSnap, nextSnap, fallbackLabel) {
    if (changeLogQuiet) return;
    try {
      const acts = describeDocDelta(prevSnap, nextSnap);
      if (acts.length) {
        for (const a of acts) appendChangeLog(a.action, a.pageIndex);
        return;
      }
      if (fallbackLabel) {
        const pi = state.doc && typeof state.doc.pageIndex === 'number' ? state.doc.pageIndex : null;
        appendChangeLog(fallbackLabel, pi);
      }
    } catch (err) {
      console.warn('Änderungsprotokoll', err);
    }
  }

  function openChangeLogModal() {
    if (!el.changeLogBackdrop) return;
    if (el.changeLogText) el.changeLogText.textContent = changeLogText();
    el.changeLogBackdrop.hidden = false;
    // The newest entry is first, so open the log at the top.
    try {
      if (el.changeLogText) el.changeLogText.scrollTop = 0;
    } catch (_) {}
  }
  function closeChangeLogModal() {
    if (el.changeLogBackdrop) el.changeLogBackdrop.hidden = true;
  }
  async function copyChangeLog() {
    const text = changeLogText();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        flash('Änderungsprotokoll kopiert');
        return;
      }
    } catch (_) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      flash('Änderungsprotokoll kopiert');
    } catch (_) {
      flash('Kopieren fehlgeschlagen', 4000);
    }
  }
  async function downloadChangeLogFile() {
    const text = changeLogText();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const base = (loadedSaveFileName || 'Anweisungen').replace(/\.beak$/i, '').replace(/[^\w\-äöüÄÖÜß.]+/g, '_');
    const fname = base + '-Aenderungsprotokoll.txt';
    try {
      await downloadBlob(fname, blob, {
        preferFilePicker: false,
        types: [{ description: 'Textdatei', accept: { 'text/plain': ['.txt'] } }],
      });
      flash('Änderungsprotokoll exportiert');
    } catch (e) {
      const msg = e && e.message ? e.message : 'Export fehlgeschlagen';
      flash(msg, msg === 'Speichern abgebrochen' ? 2500 : 8000);
    }
  }

  function serializePage(p, opts) {
    if (isVariantenPage(p)) {
      return {
        id: p.id,
        kind: 'varianten',
        title: p.title || 'Varianten',
        root: cloneCell(p.root, opts),
      };
    }
    if (isIndexPage(p)) {
      return {
        id: p.id,
        kind: 'index',
        title: p.title || 'Arbeitsschritte',
        rows: (p.rows || []).map((r) => ({
          id: r.id,
          text: r.text || '',
          targetPage: typeof r.targetPage === 'number' ? r.targetPage : 0,
        })),
      };
    }
    if (isFehlerPage(p)) {
      return {
        id: p.id,
        kind: 'fehler',
        title: p.title || 'Fehleranalyse',
        rows: (p.rows || []).map((r) => ({
          id: r.id,
          date: r.date || '',
          description: r.description || '',
          cause: r.cause || '',
          remedy: r.remedy || '',
          sourcePageId: (typeof r.sourcePageId === 'string' && r.sourcePageId) ? r.sourcePageId : null,
        })),
      };
    }
    const out = {
      id: p.id,
      kind: 'layout',
      root: cloneCell(p.root, opts),
      annotations: (p.annotations || []).map((a) => serializeAnnotation(a, opts)),
      pageGroupId: pageGroupIdOf(p),
      variantScope: pageVariantScope(p),
    };
    if (p.highlight) out.highlight = true; /* v1.67 */
    if (p.highlight) {
      const ids = normalizeHighlightLeafIds(p);
      if (ids.length) out.highlightLeafIds = ids.slice(); /* v1.83 multi-leaf */
    }
    const embed = normalizeFehlerEmbed(p.fehlerEmbed);
    if (embed) out.fehlerEmbed = { rowIds: embed.rowIds.slice() };
    return out;
  }

  function serialize(opts) {
    try { syncVariantsFromPage(); } catch (_) {}
    const out = {
      version: 5,
      pageIndex: state.doc.pageIndex,
      pages: state.doc.pages.map((p) => serializePage(p, opts)),
      changeLog: normalizeChangeLog(state.changeLog),
      variants: variantsList().map((v) => ({
        id: v.id,
        label: v.label,
        kuerzel: (typeof v.kuerzel === 'string' && v.kuerzel) ? v.kuerzel : '',
        leafId: v.leafId,
        stuecklisteFile: v.stuecklisteFile || ('source/Stueckliste-' + v.id + '.pdf'),
      })),
      activeVariantId: state.activeVariantId || null,
    };
    /* Legacy-Einzelstückliste + Varianten: Zip-Pfad = Originalname unter source/ (v1.96) */
    const usedPdfPaths = new Set();
    const primary = getActiveVariantStueckliste() || state.stueckliste;
    if (primary && primary.name) {
      const file = allocateStuecklisteZipPath(primary.name, usedPdfPaths, 'primary');
      out.stueckliste = { name: primary.name, file: file };
    }
    if (hasMultipleVariants() && state.variantStuecklisten) {
      out.variantStuecklisten = {};
      for (const v of variantsList()) {
        const rec = state.variantStuecklisten[v.id];
        if (rec && rec.name) {
          const file = allocateStuecklisteZipPath(rec.name, usedPdfPaths, v.id);
          v.stuecklisteFile = file;
          out.variantStuecklisten[v.id] = { name: rec.name, file: file };
        }
      }
    }
    /* variants[].stuecklisteFile an aktuelle Pfade anpassen */
    if (Array.isArray(out.variants)) {
      for (const v of out.variants) {
        const live = variantsList().find((x) => x.id === v.id);
        if (live && live.stuecklisteFile) v.stuecklisteFile = live.stuecklisteFile;
      }
    }
    return out;
  }

  function validateCell(cell) {
    if (!cell || typeof cell !== 'object') return false;
    if (cell.type === 'leaf') {
      return typeof cell.id === 'string';
    }
    if (cell.type === 'split') {
      return (
        typeof cell.id === 'string' &&
        (cell.dir === 'v' || cell.dir === 'h') &&
        typeof cell.ratio === 'number' &&
        validateCell(cell.a) &&
        validateCell(cell.b)
      );
    }
    return false;
  }

  function normalizeCellTree(cell) {
    if (!cell) return makeLeaf(null);
    if (cell.type === 'leaf') {
      const pos = leafCaptionPos(cell);
      return {
        type: 'leaf',
        id: cell.id || uid('l'),
        photo: normalizePhoto(cell.photo),
        caption: typeof cell.caption === 'string' ? cell.caption : '',
        captionShort: typeof cell.captionShort === 'string' ? cell.captionShort : '',
        captionX: pos.x,
        captionY: pos.y,
        variantId: (typeof cell.variantId === 'string' && cell.variantId) ? cell.variantId : null,
      };
    }
    return {
      type: 'split',
      id: cell.id || uid('s'),
      dir: cell.dir === 'h' ? 'h' : 'v',
      ratio: typeof cell.ratio === 'number' ? cell.ratio : 0.5,
      a: normalizeCellTree(cell.a),
      b: normalizeCellTree(cell.b),
    };
  }

  function applyLoaded(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.version !== 2 && data.version !== 3 && data.version !== 4 && data.version !== 5) return false;
    if (!Array.isArray(data.pages) || data.pages.length === 0) return false;
    const pages = [];
    for (const p of data.pages) {
      if (!p || typeof p !== 'object') return false;
      if (p.kind === 'varianten' || looksLikeVariantenPage(p)) {
        pages.push(normalizeVariantenPage(p));
        continue;
      }
      if (p.kind === 'index') {
        pages.push(normalizeIndexPage(p));
        continue;
      }
      if (p.kind === 'fehler') {
        pages.push(normalizeFehlerPage(p));
        continue;
      }
      // Legacy pages without kind, or layout pages
      if (!p.root || !validateCell(p.root)) return false;
      const pid = p.id || uid('p');
      const layoutPage = {
        id: pid,
        kind: 'layout',
        root: normalizeCellTree(p.root),
        annotations: Array.isArray(p.annotations)
          ? p.annotations.map((a) => normalizeAnnotation(a)).filter(Boolean)
          : [],
        highlight: !!p.highlight,
        highlightLeafIds: p.highlight ? normalizeHighlightLeafIds(p) : [],
        pageGroupId: (typeof p.pageGroupId === 'string' && p.pageGroupId) ? p.pageGroupId : pid,
        variantScope: (typeof p.variantScope === 'string' && p.variantScope) ? p.variantScope : 'all',
      };
      const embed = normalizeFehlerEmbed(p.fehlerEmbed);
      if (embed) layoutPage.fehlerEmbed = embed;
      pages.push(layoutPage);
    }
    const migrated = ensureBookends(pages);
    /* v1.18: Nach Öffnen/Laden erst Seite 1 (Index); gespeicherten pageIndex in .beak ignorieren.
       v1.48: gerätelokale letzte Seite danach via applyRememberedPage() (localStorage). */
    const idx = 0;
    stopLiveCamera();
    state.doc = { pages: migrated, pageIndex: idx, variants: Array.isArray(data.variants) ? data.variants.slice() : [] };
    state.changeLog = normalizeChangeLog(data.changeLog);
    state.selectedId = null;
    state.selectedSplitId = null;
    state.activeVariantId = (typeof data.activeVariantId === 'string' && data.activeVariantId) ? data.activeVariantId : null;
    state.variantStuecklisten = {};
    try { syncVariantsFromPage(); } catch (_) {}
    rebuildBeakUsage();
    try { bumpThumbCache(); } catch (_) {}
    try { clearPersistedThumbs(); } catch (_) {}
    renderAll();
    return true;
  }

  function isAppleTouchDevice() {
    const ua = navigator.userAgent || '';
    if (/iPad|iPhone|iPod/i.test(ua)) return true;
    if (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1) return true;
    return false;
  }

  function isAbortError(e) {
    return !!(e && typeof e === 'object' && e.name === 'AbortError');
  }

  async function ensureReadWritePermission(handle) {
    const desc = { mode: 'readwrite' };
    try {
      if (typeof handle.queryPermission === 'function') {
        let perm = await handle.queryPermission(desc);
        if (perm === 'granted') return true;
        if (typeof handle.requestPermission === 'function') {
          perm = await handle.requestPermission(desc);
          return perm === 'granted';
        }
        return false;
      }
    } catch (e) {
      console.warn('Dateiberechtigung prüfen fehlgeschlagen', e);
      return false;
    }
    return true;
  }

  async function writeBlobToHandle(handle, blob) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  function planPickerTypes() {
    return [
      {
        description: 'Anweisungen',
        accept: {
          'application/zip': ['.beak', '.plan', '.beakplan', '.zip'],
          'application/x-zip-compressed': ['.beak', '.plan', '.beakplan', '.zip'],
          'application/json': ['.json'],
        },
      },
    ];
  }

  function toBeakFilename(name) {
    /* v1.16: auch von iOS umbenannte Dateien („Anweisungen.beak.zip“, „Anweisungen.zip“,
       ohne Endung) → beim nächsten Sichern wieder „….beak“ */
    let base = String(name || 'Anweisungen').trim();
    for (let i = 0; i < 3; i++) {
      const next = base.replace(/\.(zip|beakplan|plan|json|beak)$/i, '');
      if (next === base) break;
      base = next;
    }
    return (base || 'Anweisungen') + '.beak';
  }

  /** v1.20: Anzeigename aus Dateiname ohne .beak/.zip/… (für Index-Titel). */
  function projectDisplayTitle(name) {
    let base = String(name || '').trim().split(/[/\\]/).pop() || '';
    for (let i = 0; i < 3; i++) {
      const next = base.replace(/\.(zip|beakplan|plan|json|beak)$/i, '');
      if (next === base) break;
      base = next;
    }
    return base.trim();
  }

  /** v1.20: Beim Öffnen Index-Titel = Basename ohne .beak (danach manuell editierbar). */
  function applyIndexTitleFromOpenedFile(fileName) {
    const title = projectDisplayTitle(fileName);
    if (!title) return;
    const pages = state.doc && state.doc.pages;
    if (!pages || !pages.length) return;
    for (const p of pages) {
      if (p && isIndexPage(p)) {
        p.title = title;
        break;
      }
    }
  }

  /* v1.19: Auf Apple-Touch accept NICHT entfernen (sonst Foto-/Kamera-Menü).
     Stattdessen dokumentartige MIME/Endungen ohne Abhängigkeit von unbekannter .beak-UTI.
     Inhalt weiter per sniffProjectFile prüfen. Wenn .beak ausgegraut: ZIP/octet-stream wählen. */
  function configureProjectFileInput() {
    if (!el.projectFile) return;
    if (isAppleTouchDevice()) {
      el.projectFile.setAttribute(
        'accept',
        'application/zip,application/x-zip-compressed,application/json,application/octet-stream,.zip,.json,.plan,.beakplan'
      );
    }
  }

  /* v1.16: Dateityp am Inhalt erkennen statt an der Endung */
  async function sniffProjectFile(file) {
    try {
      const buf = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b &&
          ((buf[2] === 0x03 && buf[3] === 0x04) || (buf[2] === 0x05 && buf[3] === 0x06))) {
        return 'zip';
      }
      if (buf.length === 0) return 'empty';
    } catch (_) {}
    return 'other';
  }

  function pdfPickerTypes() {
    return [
      {
        description: 'PDF',
        accept: { 'application/pdf': ['.pdf'] },
      },
    ];
  }

  async function tryShowSaveFilePicker(filename, blob, types, startInHandle) {
    if (typeof window.showSaveFilePicker !== 'function') return null;
    try {
      const opts = {
        suggestedName: filename,
        types: types || planPickerTypes(),
      };
      /* v1.18: startIn mit vorhandenem Handle, falls die API es erlaubt */
      if (startInHandle) {
        try { opts.startIn = startInHandle; } catch (_) {}
      }
      const handle = await window.showSaveFilePicker(opts);
      await writeBlobToHandle(handle, blob);
      return handle;
    } catch (e) {
      if (isAbortError(e)) throw new Error('Speichern abgebrochen');
      console.warn('showSaveFilePicker fehlgeschlagen', e);
      return null;
    }
  }

  async function tryWebShareFile(filename, blob) {
    if (typeof navigator.share !== 'function') return false;
    try {
      /* v1.16: auf iPad/iPhone neutraler Typ, damit „In Dateien sichern“ den Namen „….beak“
         behält (mit application/zip hängt iOS teils „.zip“ an). Öffnen erkennt beides. */
      const type = isAppleTouchDevice() ? 'application/octet-stream' : (blob.type || 'application/octet-stream');
      const file = new File([blob], filename, { type });
      const payload = { files: [file] };
      const can = typeof navigator.canShare === 'function' ? navigator.canShare(payload) : true;
      if (!can) return false;
      await navigator.share(payload);
      return true;
    } catch (e) {
      if (isAbortError(e)) throw new Error('Speichern abgebrochen');
      console.warn('Web Share fehlgeschlagen, Fallback Download', e);
      return false;
    }
  }

  async function downloadBlob(filename, blob, opts) {
    if (!blob || blob.size === 0) {
      throw new Error('Leere Datei — nichts zu speichern');
    }

    const preferFilePicker = !!(opts && opts.preferFilePicker);
    const existing = (opts && opts.existingHandle) || null;
    const types = (opts && opts.types) || planPickerTypes();

    /* v1.18: Mit schreibbarem projectFileHandle IMMER direkt überschreiben –
       kein Save-Picker und kein <a download>. */
    if (existing) {
      try {
        const ok = await ensureReadWritePermission(existing);
        if (ok) {
          await writeBlobToHandle(existing, blob);
          return { handle: existing, overwritten: true };
        }
      } catch (e) {
        if (isAbortError(e)) throw new Error('Speichern abgebrochen');
        console.warn('Overwrite via handle fehlgeschlagen, Fallback', e);
      }
    }

    const pickerAvailable = typeof window.showSaveFilePicker === 'function';

    if (pickerAvailable && (preferFilePicker || !isAppleTouchDevice())) {
      const handle = await tryShowSaveFilePicker(filename, blob, types, existing);
      if (handle) return { handle };
    }

    if (isAppleTouchDevice() && !preferFilePicker) {
      if (await tryWebShareFile(filename, blob)) return { shared: true };
    }

    if (pickerAvailable) {
      const handle = await tryShowSaveFilePicker(filename, blob, types, existing);
      if (handle) return { handle };
    }

    if (isAppleTouchDevice() && preferFilePicker) {
      if (await tryWebShareFile(filename, blob)) return { shared: true };
    }

    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      await new Promise((r) => setTimeout(r, 2000));
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
    return { downloaded: true };
  }

  function canOpenProjectPicker() {
    return typeof window.showOpenFilePicker === 'function';
  }

  async function openProjectWithPicker() {
    if (typeof window.showOpenFilePicker !== 'function') return null;
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: planPickerTypes(),
      });
      if (!handle) return null;
      const file = await handle.getFile();
      return { file, handle };
    } catch (e) {
      if (isAbortError(e)) return null;
      console.warn('showOpenFilePicker fehlgeschlagen', e);
      return null;
    }
  }

  function buildSaveFilename() {
    if (loadedSaveFileName) return toBeakFilename(loadedSaveFileName);
    return 'Anweisungen.beak';
  }

  async function buildPlanZipBlob() {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip nicht geladen');
    }
    const zip = new JSZip();
    const photoEntries = [];
    try { syncVariantsFromPage(); } catch (_) {}

    function slimCell(cell) {
      if (cell.type === 'leaf') {
        const photo = normalizePhoto(cell.photo);
        let outPhoto = null;
        if (photo && photo.src) {
          const ext = guessImageExt(photo.src);
          const file = 'photos/' + cell.id + '.' + ext;
          outPhoto = {
            file: file,
            scale: photo.scale,
            x: photo.x,
            y: photo.y,
            tx: photo.tx,
            ty: photo.ty,
            rot: photo.rot,
          };
          photoEntries.push({ file: file, src: photo.src });
        } else if (photo && photo.file) {
          outPhoto = {
            file: photo.file,
            scale: photo.scale,
            x: photo.x,
            y: photo.y,
            tx: photo.tx,
            ty: photo.ty,
            rot: photo.rot,
          };
        }
        const leafOut = { type: 'leaf', id: cell.id, photo: outPhoto };
        if (typeof cell.caption === 'string' && cell.caption) leafOut.caption = cell.caption;
        if (typeof cell.captionShort === 'string' && cell.captionShort) leafOut.captionShort = cell.captionShort;
        if (typeof cell.captionX === 'number' && isFinite(cell.captionX)) leafOut.captionX = cell.captionX;
        if (typeof cell.captionY === 'number' && isFinite(cell.captionY)) leafOut.captionY = cell.captionY;
        if (typeof cell.variantId === 'string' && cell.variantId) leafOut.variantId = cell.variantId;
        return leafOut;
      }
      return {
        type: 'split',
        id: cell.id,
        dir: cell.dir,
        ratio: cell.ratio,
        a: slimCell(cell.a),
        b: slimCell(cell.b),
      };
    }

    const project = {
      version: 5,
      name: 'Anweisungen',
      savedAt: new Date().toISOString(),
      pageIndex: state.doc.pageIndex,
      pages: state.doc.pages.map((p) => {
        /* v1.91: Varianten-Bookend korrekt speichern (vorher fälschlich als layout →
           beim Öffnen leere neue Varianten-Seite + alte Seite als Extra-Layout). */
        if (isVariantenPage(p)) {
          return {
            id: p.id,
            kind: 'varianten',
            title: p.title || 'Varianten',
            root: slimCell(p.root),
          };
        }
        if (isIndexPage(p)) {
          return {
            id: p.id,
            kind: 'index',
            title: p.title || 'Arbeitsschritte',
            rows: (p.rows || []).map((r) => ({
              id: r.id,
              text: r.text || '',
              targetPage: typeof r.targetPage === 'number' ? r.targetPage : 0,
            })),
          };
        }
        if (isFehlerPage(p)) {
          return {
            id: p.id,
            kind: 'fehler',
            title: p.title || 'Fehleranalyse',
            rows: (p.rows || []).map((r) => ({
              id: r.id,
              date: r.date || '',
              description: r.description || '',
              cause: r.cause || '',
              remedy: r.remedy || '',
              sourcePageId: (typeof r.sourcePageId === 'string' && r.sourcePageId) ? r.sourcePageId : null,
            })),
          };
        }
        const layoutOut = {
          id: p.id,
          kind: 'layout',
          root: slimCell(p.root),
          pageGroupId: pageGroupIdOf(p),
          variantScope: pageVariantScope(p),
          annotations: (p.annotations || []).map((a) => {
            if (!a || a.type !== 'photoClipboard') return { ...a };
            const photo = normalizePhoto(a.photo);
            let outPhoto = null;
            if (photo && photo.src) {
              const ext = guessImageExt(photo.src);
              const file = 'photos/' + a.id + '.' + ext;
              outPhoto = {
                file: file,
                scale: photo.scale,
                x: photo.x,
                y: photo.y,
                tx: photo.tx,
                ty: photo.ty,
                rot: photo.rot,
              };
              photoEntries.push({ file: file, src: photo.src });
            } else if (photo && photo.file) {
              outPhoto = {
                file: photo.file,
                scale: photo.scale,
                x: photo.x,
                y: photo.y,
                tx: photo.tx,
                ty: photo.ty,
                rot: photo.rot,
              };
            }
            return {
              id: a.id,
              type: 'photoClipboard',
              x: a.x,
              y: a.y,
              w: a.w,
              h: a.h,
              photo: outPhoto,
            };
          }),
        };
        if (p.highlight) {
          layoutOut.highlight = true;
          const ids = normalizeHighlightLeafIds(p);
          if (ids.length) layoutOut.highlightLeafIds = ids.slice();
        }
        const embed = normalizeFehlerEmbed(p.fehlerEmbed);
        if (embed) layoutOut.fehlerEmbed = { rowIds: embed.rowIds.slice() };
        return layoutOut;
      }),
      changeLog: normalizeChangeLog(state.changeLog),
      variants: variantsList().map((v) => ({
        id: v.id,
        label: v.label,
        kuerzel: (typeof v.kuerzel === 'string' && v.kuerzel) ? v.kuerzel : '',
        leafId: v.leafId,
        stuecklisteFile: v.stuecklisteFile || ('source/Stueckliste-' + v.id + '.pdf'),
      })),
      activeVariantId: state.activeVariantId || null,
    };
    const usedZipPdfPaths = new Set();
    if (state.stueckliste && state.stueckliste.dataUrl) {
      const file = allocateStuecklisteZipPath(
        state.stueckliste.name || 'Stueckliste.pdf',
        usedZipPdfPaths,
        'primary'
      );
      project.stueckliste = {
        name: state.stueckliste.name || 'Stueckliste.pdf',
        file: file,
      };
    }
    if (hasMultipleVariants() && state.variantStuecklisten) {
      project.variantStuecklisten = {};
      for (const v of variantsList()) {
        const rec = state.variantStuecklisten[v.id];
        if (!rec || !rec.dataUrl) continue;
        const file = allocateStuecklisteZipPath(rec.name || 'Stueckliste.pdf', usedZipPdfPaths, v.id);
        v.stuecklisteFile = file;
        project.variantStuecklisten[v.id] = { name: rec.name || 'Stueckliste.pdf', file: file };
      }
      /* sync into project.variants[].stuecklisteFile */
      if (Array.isArray(project.variants)) {
        for (const v of project.variants) {
          const live = variantsList().find((x) => x.id === v.id);
          if (live && live.stuecklisteFile) v.stuecklisteFile = live.stuecklisteFile;
        }
      }
    }

    /* v1.47: Übersicht-Thumbs (klein, JPEG) additiv in thumbs/<pageId>.jpg */
    const thumbEntries = [];
    const thumbsMeta = {};
    try {
      const valid = collectValidPersistedThumbs();
      for (const [pageId, info] of valid) {
        const file = 'thumbs/' + pageId + '.jpg';
        thumbsMeta[pageId] = { file: file, sig: info.sig };
        thumbEntries.push({ file: file, src: info.dataUrl });
      }
    } catch (err) {
      console.warn('Thumbs für ZIP', err);
    }
    if (Object.keys(thumbsMeta).length) project.thumbs = thumbsMeta;

    const projJson = JSON.stringify(project);
    lastBuiltDocSig = projectContentSignature(project, projJson);
    zip.file('project.json', projJson);

    for (const entry of photoEntries) {
      try {
        const bytes = await dataUrlToUint8(entry.src);
        zip.file(entry.file, bytes);
      } catch (err) {
        console.warn('Foto übersprungen', entry.file, err);
      }
    }

    for (const entry of thumbEntries) {
      try {
        const bytes = await dataUrlToUint8(entry.src);
        zip.file(entry.file, bytes);
      } catch (err) {
        console.warn('Thumb übersprungen', entry.file, err);
      }
    }

    if (state.stueckliste && state.stueckliste.dataUrl) {
      try {
        const pdfBytes = await dataUrlToUint8(state.stueckliste.dataUrl);
        const file = (project.stueckliste && project.stueckliste.file)
          || stuecklisteZipPathFromName(state.stueckliste.name || 'Stueckliste.pdf');
        zip.file(file, pdfBytes);
      } catch (err) {
        console.warn('Stuckliste-PDF uebersprungen', err);
      }
    }
    /* v1.85/v1.96: Stuckliste je Variante unter Originalnamen */
    if (state.variantStuecklisten) {
      for (const v of variantsList()) {
        const rec = state.variantStuecklisten[v.id];
        if (!rec || !rec.dataUrl) continue;
        const meta = project.variantStuecklisten && project.variantStuecklisten[v.id];
        const file = (meta && meta.file)
          || v.stuecklisteFile
          || stuecklisteZipPathFromName(rec.name || 'Stueckliste.pdf');
        try {
          const pdfBytes = await dataUrlToUint8(rec.dataUrl);
          zip.file(file, pdfBytes);
        } catch (err) {
          console.warn('Varianten-Stuckliste uebersprungen', file, err);
        }
      }
    }

    return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  }

  /* ---- v1.17: Browser-Speicher in IndexedDB (Fotos/PDF als Blobs) ------------------------
     Vorher: nur localStorage (~5 MB) mit Base64-Fotos, nur bei Öffnen/Sichern. War es voll,
     wurde still ein Backup OHNE Fotos (und nie mit Stückliste) geschrieben → nach einem
     iOS-Neustart der Web-App waren Fotos + Stückliste weg („Speicher voll“).
     Jetzt: Auto-Sicherung (entprellt) in IndexedDB; Blobs + Projektstand in EINER Transaktion
     (atomar – schlägt sie fehl, bleibt der alte Stand vollständig erhalten). Nie wird etwas
     gelöscht oder der Arbeitsspeicher geleert, wenn Speichern scheitert; stattdessen Warnung. */
  const IDB_NAME = 'anweisungen';
  const IDB_VERSION = 1;
  const store = {
    db: null,
    opening: null,
    keyBySrc: new Map(),
    timer: 0,
    saving: false,
    pending: false,
    dirty: false,
    booting: true,
    blocked: false,
    failed: false,
    lastWarnAt: 0,
    rev: 0,
    persistAsked: false,
    binMode: 'blob', // 'blob' | 'buffer' (Rückfall, falls Blobs nicht speicherbar, z. B. privates Surfen)
  };

  function idbAvailable() {
    try { return typeof indexedDB !== 'undefined' && !!indexedDB; } catch (_) { return false; }
  }
  function idbOpen() {
    if (store.db) return Promise.resolve(store.db);
    if (store.opening) return store.opening;
    store.opening = new Promise((resolve, reject) => {
      if (!idbAvailable()) { reject(new Error('IndexedDB nicht verfügbar')); return; }
      let req;
      try { req = indexedDB.open(IDB_NAME, IDB_VERSION); } catch (err) { reject(err); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { try { db.close(); } catch (_) {} store.db = null; };
        db.onclose = () => { store.db = null; };
        store.db = db;
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('IndexedDB open'));
      req.onblocked = () => reject(new Error('IndexedDB blockiert'));
    }).finally(() => { store.opening = null; });
    return store.opening;
  }
  function idbReq(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbTxDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('Transaktion fehlgeschlagen'));
      tx.onabort = () => reject(tx.error || new Error('Transaktion abgebrochen'));
    });
  }

  async function dataUrlToBlobAsync(u) {
    try {
      const res = await fetch(u);
      if (res.ok) return await res.blob();
    } catch (_) {}
    const i = u.indexOf(',');
    const meta = u.slice(5, i);
    const mime = meta.split(';')[0] || 'application/octet-stream';
    if (/;base64/i.test(meta)) {
      const bin = atob(u.slice(i + 1));
      const arr = new Uint8Array(bin.length);
      for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
      return new Blob([arr], { type: mime });
    }
    return new Blob([decodeURIComponent(u.slice(i + 1))], { type: mime });
  }

  function blobToArrayBuffer(blob) {
    if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(blob);
    });
  }

  function storeKeyFor(src) {
    let k = store.keyBySrc.get(src);
    if (!k) {
      k = uid('b') + '-' + src.length.toString(36);
      store.keyBySrc.set(src, k);
    }
    return k;
  }

  /** Projektstand mit Foto-/PDF-/Thumb-Verweisen statt Base64 (für IndexedDB). */
  function buildStoreRecord(needed) {
    const doc = serialize();
    const walk = (c) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'leaf') {
        const ph = c.photo;
        if (ph && typeof ph.src === 'string' && /^data:/i.test(ph.src)) {
          const key = storeKeyFor(ph.src);
          needed.set(key, ph.src);
          ph.ref = key;
          ph.src = null;
        }
        return;
      }
      walk(c.a); walk(c.b);
    };
    const walkAnnPhoto = (ph) => {
      if (ph && typeof ph.src === 'string' && /^data:/i.test(ph.src)) {
        const key = storeKeyFor(ph.src);
        needed.set(key, ph.src);
        ph.ref = key;
        ph.src = null;
      }
    };
    for (const pg of doc.pages) {
      walk(pg.root);
      if (Array.isArray(pg.annotations)) {
        for (const a of pg.annotations) {
          if (a && a.type === 'photoClipboard') walkAnnPhoto(a.photo);
        }
      }
    }
    let st = null;
    if (state.stueckliste && state.stueckliste.dataUrl) {
      const key = storeKeyFor(state.stueckliste.dataUrl);
      needed.set(key, state.stueckliste.dataUrl);
      st = { name: state.stueckliste.name || 'Stueckliste.pdf', ref: key };
    }
    /* v1.47: Übersicht-Thumbs als Blob-Refs (wie Fotos) */
    const thumbs = {};
    try {
      const valid = collectValidPersistedThumbs();
      for (const [pageId, info] of valid) {
        const key = storeKeyFor(info.dataUrl);
        needed.set(key, info.dataUrl);
        thumbs[pageId] = { ref: key, sig: info.sig };
      }
    } catch (err) {
      console.warn('Thumbs für Browser-Speicher', err);
    }
    return { doc, stueckliste: st, thumbs: thumbs };
  }

  function slimMarkerDoc(rev) {
    const slim = serialize({ slim: true });
    slim._idb = rev;
    return slim;
  }

  function persistSoon(delay) {
    if (store.booting || !docOpen) return;
    if (store.blocked) {
      storageWarn('Browser-Speicher nicht lesbar – Änderungen nur in der geöffneten App. Bitte „Sichern“ (.beak)!');
      return;
    }
    store.dirty = true;
    sessionDirty = true;
    clearTimeout(store.timer);
    store.timer = setTimeout(() => { store.timer = 0; void persistNow(); }, delay == null ? 1200 : delay);
  }

  function storageWarn(msg, force) {
    const now = Date.now();
    if (el.sichernBtn) el.sichernBtn.classList.add('storage-warn');
    if (!force && now - store.lastWarnAt < 60000) return;
    store.lastWarnAt = now;
    flash(msg, 10000, 'error');
  }
  function storageOk() {
    store.failed = false;
    if (el.sichernBtn) el.sichernBtn.classList.remove('storage-warn');
  }

  function isQuotaError(err) {
    if (!err) return false;
    const n = String(err.name || '');
    return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 ||
      /quota|space|full|disk/i.test(String(err.message || ''));
  }

  /** Speichert sofort (falls geändert). Scheitert es, bleibt alles im Arbeitsspeicher + im alten Stand. */
  async function persistNow() {
    clearTimeout(store.timer);
    store.timer = 0;
    if (store.booting || store.blocked || !docOpen || !state.doc || !Array.isArray(state.doc.pages)) return false;
    if (!store.dirty) return true;
    if (store.saving) { store.pending = true; return false; }
    store.saving = true;
    store.dirty = false;
    let ok = false;
    try {
      const needed = new Map();
      const rec = buildStoreRecord(needed);
      const rev = Math.max(Date.now(), store.rev + 1);
      const db = await idbOpen();
      const existing = new Set(await idbReq(db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys()));
      const fresh = [];
      for (const [key, src] of needed) {
        if (!existing.has(key)) fresh.push([key, await dataUrlToBlobAsync(src)]);
      }
      const metaRec = {
        rev,
        savedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        doc: rec.doc,
        stueckliste: rec.stueckliste,
        thumbs: rec.thumbs || {},
        fileName: loadedSaveFileName || null,
      };
      const writeAll = async (mode) => {
        const vals = [];
        for (const [key, blob] of fresh) {
          vals.push([key, mode === 'blob' ? blob : { type: blob.type, data: await blobToArrayBuffer(blob) }]);
        }
        const tx = db.transaction(['blobs', 'meta'], 'readwrite');
        const done = idbTxDone(tx);
        const bs = tx.objectStore('blobs');
        for (const [key, v] of vals) bs.put(v, key);
        tx.objectStore('meta').put(metaRec, 'current');
        await done;
      };
      try {
        await writeAll(store.binMode);
      } catch (err) {
        // WebKit ohne dauerhaften Speicher kann keine Blobs ablegen → Binärdaten (ArrayBuffer) statt Base64
        if (store.binMode === 'blob' && fresh.length && !isQuotaError(err)) {
          store.binMode = 'buffer';
          await writeAll('buffer');
        } else throw err;
      }
      store.rev = rev;
      ok = true;
      // Erst NACH erfolgreichem Schreiben: nicht mehr benutzte Blobs entfernen
      const orphans = [...existing].filter((k) => !needed.has(k));
      if (orphans.length) {
        try {
          const tx2 = db.transaction('blobs', 'readwrite');
          const d2 = idbTxDone(tx2);
          for (const k of orphans) tx2.objectStore('blobs').delete(k);
          await d2;
        } catch (err) { console.warn('Aufräumen im Browser-Speicher', err); }
      }
      // Zuordnung src → Schlüssel auf die aktuell benutzten beschränken
      const keep = new Map();
      for (const [key, src] of needed) keep.set(src, key);
      store.keyBySrc = keep;
      // localStorage: nur kleiner Marker/Layout ohne Fotos (Fotos liegen in IndexedDB)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slimMarkerDoc(rev)));
      } catch (e) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 5, _idb: rev, pages: [] })); } catch (_) {}
      }
      if (store.failed) {
        flash('Browser-Speicher wieder in Ordnung – Stand gesichert', 3000);
      }
      storageOk();
    } catch (err) {
      console.warn('Browser-Speicher: Sichern fehlgeschlagen', err);
      store.failed = true;
      store.dirty = true; // beim nächsten Anlass erneut versuchen
      const full = isQuotaError(err);
      storageWarn((full ? 'Browser-Speicher voll' : 'Browser-Speicher nicht verfügbar') +
        ' – Fotos und Stückliste bleiben erhalten, aber nur in der geöffneten App. Bitte jetzt „Sichern“ (.beak)!');
    } finally {
      store.saving = false;
    }
    if (store.pending) {
      store.pending = false;
      store.dirty = true;
      persistSoon(400);
    }
    return ok;
  }

  async function idbLoadCurrent() {
    const db = await idbOpen();
    const meta = await idbReq(db.transaction('meta', 'readonly').objectStore('meta').get('current'));
    if (!meta || !meta.doc) return null;
    const refs = new Set();
    const walk = (c) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'leaf') { if (c.photo && c.photo.ref) refs.add(c.photo.ref); return; }
      walk(c.a); walk(c.b);
    };
    for (const pg of meta.doc.pages || []) {
      walk(pg && pg.root);
      if (pg && Array.isArray(pg.annotations)) {
        for (const a of pg.annotations) {
          if (a && a.type === 'photoClipboard' && a.photo && a.photo.ref) refs.add(a.photo.ref);
        }
      }
    }
    if (meta.stueckliste && meta.stueckliste.ref) refs.add(meta.stueckliste.ref);
    const thumbsMeta = (meta.thumbs && typeof meta.thumbs === 'object') ? meta.thumbs : {};
    for (const info of Object.values(thumbsMeta)) {
      if (info && info.ref) refs.add(info.ref);
    }
    const tx = db.transaction('blobs', 'readonly');
    const os = tx.objectStore('blobs');
    const blobs = new Map();
    await Promise.all([...refs].map((k) => idbReq(os.get(k)).then((b) => { if (b) blobs.set(k, b); })));
    const urls = new Map();
    let missing = 0;
    for (const k of refs) {
      let b = blobs.get(k);
      if (b && !(b instanceof Blob) && b.data) b = new Blob([b.data], { type: b.type || '' });
      if (!b) { missing++; continue; }
      const u = await blobToDataUrl(b);
      urls.set(k, u);
      store.keyBySrc.set(u, k);
    }
    const fill = (c) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'leaf') {
        if (c.photo && c.photo.ref) {
          c.photo.src = urls.get(c.photo.ref) || null;
          delete c.photo.ref;
        }
        return;
      }
      fill(c.a); fill(c.b);
    };
    for (const pg of meta.doc.pages || []) {
      fill(pg && pg.root);
      if (pg && Array.isArray(pg.annotations)) {
        for (const a of pg.annotations) {
          if (a && a.type === 'photoClipboard' && a.photo && a.photo.ref) {
            a.photo.src = urls.get(a.photo.ref) || null;
            delete a.photo.ref;
          }
        }
      }
    }
    let st = null;
    if (meta.stueckliste && meta.stueckliste.ref && urls.get(meta.stueckliste.ref)) {
      st = { name: meta.stueckliste.name || 'Stueckliste.pdf', dataUrl: urls.get(meta.stueckliste.ref), parts: null };
    }
    const thumbs = {};
    for (const [pageId, info] of Object.entries(thumbsMeta)) {
      if (!info || !info.ref) continue;
      const dataUrl = urls.get(info.ref);
      if (!dataUrl) continue;
      thumbs[pageId] = { sig: typeof info.sig === 'string' ? info.sig : '', dataUrl: dataUrl };
    }
    store.rev = meta.rev || 0;
    return { doc: meta.doc, stueckliste: st, thumbs: thumbs, missing, fileName: meta.fileName || null, savedAt: meta.savedAt };
  }

  function requestPersistentStorage() {
    if (store.persistAsked) return;
    store.persistAsked = true;
    try {
      if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persisted().then((p) => (p ? true : navigator.storage.persist())).catch(() => {});
      }
    } catch (_) {}
  }

  function flushStorageOnHide() {
    try { if (hist && hist.timer && !histBusy()) historyCommit(); } catch (_) {}
    if (store.dirty || store.timer) { store.dirty = true; void persistNow(); }
  }

  /* ---- v1.17: Große Fotos beim Einfügen verkleinern (Qualität bleibt gut) ---- */
  const PHOTO_MAX_EDGE = 2500;
  const PHOTO_JPEG_Q = 0.85;
  const PHOTO_MAX_BYTES = 4 * 1024 * 1024;

  function loadImageEl(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild nicht lesbar'));
      img.src = url;
    });
  }
  /** Data-URL/Blob → Data-URL; nur verkleinern/neu kodieren, wenn wirklich zu groß. */
  async function prepareImportedPhoto(input) {
    let dataUrl = typeof input === 'string' ? input : await readFileAsDataUrl(input);
    if (typeof dataUrl !== 'string' || !/^data:image\//i.test(dataUrl)) return dataUrl;
    if (/^data:image\/(svg|gif)/i.test(dataUrl)) return dataUrl;
    const approxBytes = Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
    let img;
    try { img = await loadImageEl(dataUrl); } catch (_) { return dataUrl; }
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return dataUrl;
    const long = Math.max(w, h);
    if (long <= PHOTO_MAX_EDGE && approxBytes <= PHOTO_MAX_BYTES) return dataUrl; // klein genug → Original
    const k = Math.min(1, PHOTO_MAX_EDGE / long);
    const cw = Math.max(1, Math.round(w * k));
    const ch = Math.max(1, Math.round(h * k));
    try {
      const c = document.createElement('canvas');
      c.width = cw; c.height = ch;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, cw, ch);
      const out = c.toDataURL('image/jpeg', PHOTO_JPEG_Q);
      c.width = 0; c.height = 0;
      if (!out || out.length < 32 || (k === 1 && out.length >= dataUrl.length)) return dataUrl;
      return out;
    } catch (_) {
      return dataUrl;
    }
  }

  /* v1.17: ehemals localStorage-Vollbackup – jetzt sofortige Sicherung in IndexedDB */
  function quietLocalStorageBackup() {
    if (!docOpen) return;
    if (store.blocked) store.blocked = false; // neues/geöffnetes Projekt darf gespeichert werden
    store.dirty = true;
    void persistNow();
  }

  async function save() {
    if (!docOpen) { flash('Kein Projekt geöffnet'); return; }
    quietLocalStorageBackup();
    let blob;
    try {
      blob = await buildPlanZipBlob();
      blob = new Blob([blob], { type: PLAN_MIME });
    } catch (e) {
      console.error('ZIP', e);
      flash('Sichern fehlgeschlagen (ZIP)', 8000);
      return;
    }

    const fname = buildSaveFilename();
    const preferFilePicker = !!loadedSaveFileName || !!projectFileHandle;

    try {
      const result = await downloadBlob(fname, blob, {
        existingHandle: projectFileHandle,
        preferFilePicker: preferFilePicker,
        types: planPickerTypes(),
      });
      if (result.handle) {
        projectFileHandle = result.handle;
        if (result.handle.name) loadedSaveFileName = result.handle.name;
      }
      const savedName = (projectFileHandle && projectFileHandle.name) || fname;
      sessionDirty = false;
      try { appendChangeLog('Projekt gesichert', null); } catch (_) {}
      try {
        const k = docKeyFromFileName(savedName) || docFilenameKey();
        if (k && lastBuiltDocSig) rememberDocSignature(k, lastBuiltDocSig);
      } catch (_) {}
      if (result.overwritten) {
        flash('Gesichert: ' + savedName);
      } else if (result.handle) {
        flash('Gesichert: ' + savedName);
      } else if (result.shared) {
        flash('Gesichert: ' + savedName);
      } else if (result.downloaded) {
        flash('Als neue Datei gesichert (Browser kann die Originaldatei nicht überschreiben)', 4500);
      } else {
        flash('Gesichert: ' + savedName);
      }
    } catch (e) {
      console.error('save', e);
      const msg = e && e.message ? e.message : 'Speichern fehlgeschlagen';
      flash(msg, msg === 'Speichern abgebrochen' ? 2500 : 8000);
    }
  }

  async function loadPhotosFromZip(zip, pages) {
    const tasks = [];
    const enqueue = (photo, filePath) => {
      if (!photo || !filePath) return;
      const zf = zip.file(filePath);
      if (!zf) return;
      tasks.push(
        zf.async('blob').then(async (blob) => {
          const dataUrl = await blobToDataUrl(blob);
          photo.src = dataUrl;
        }).catch((err) => {
          console.warn('Foto laden fehlgeschlagen', filePath, err);
        })
      );
    };
    for (const page of pages) {
      if (isFixedPage(page)) continue;
      if (page.root) {
        walkLeaves(page.root, (leaf) => {
          if (!leaf.photo) return;
          enqueue(leaf.photo, leaf.photo.file);
        });
      }
      if (Array.isArray(page.annotations)) {
        for (const a of page.annotations) {
          if (!a || a.type !== 'photoClipboard' || !a.photo) continue;
          enqueue(a.photo, a.photo.file);
        }
      }
    }
    await Promise.all(tasks);
  }

  async function loadThumbsFromZip(zip, data) {
    clearPersistedThumbs();
    if (!zip) return;
    const meta = (data && data.thumbs && typeof data.thumbs === 'object') ? data.thumbs : {};
    const tasks = [];
    const seen = new Set();
    const add = (pageId, filePath, sig) => {
      if (!pageId || !filePath || seen.has(pageId)) return;
      const zf = zip.file(filePath);
      if (!zf) return;
      seen.add(pageId);
      tasks.push(
        zf.async('blob').then(async (blob) => {
          const dataUrl = await blobToDataUrl(blob);
          if (!dataUrl) return;
          thumbPersist.byId.set(pageId, {
            sig: typeof sig === 'string' ? sig : '',
            dataUrl: dataUrl,
          });
        }).catch((err) => {
          console.warn('Thumb laden fehlgeschlagen', filePath, err);
        })
      );
    };
    for (const [pageId, info] of Object.entries(meta)) {
      const filePath = (info && info.file) || ('thumbs/' + pageId + '.jpg');
      add(pageId, filePath, info && info.sig);
    }
    /* Fallback: thumbs/*.jpg ohne project.json-Eintrag */
    try {
      const names = Object.keys(zip.files || {});
      for (const n of names) {
        if (zip.files[n].dir) continue;
        const m = /(?:^|\/)thumbs\/([^/]+)\.jpe?g$/i.exec(n);
        if (!m) continue;
        add(m[1], n, '');
      }
    } catch (_) {}
    await Promise.all(tasks);
    try { restampPersistedThumbSigs(); } catch (_) {}
  }

  async function loadStuecklisteFromZip(zip, data) {
    state.stueckliste = null;
    state.variantStuecklisten = {};
    const preferred =
      (data && data.stueckliste && data.stueckliste.file) ||
      (data && data.stueckliste && data.stueckliste.name
        ? stuecklisteZipPathFromName(data.stueckliste.name)
        : null) ||
      'source/Stueckliste.pdf';
    let zf = zip.file(preferred);
    if (!zf) {
      const names = Object.keys(zip.files || {});
      const hit = names.find((n) => !zip.files[n].dir && /stueckliste\.pdf$/i.test(n))
        || names.find((n) => !zip.files[n].dir && /^source\/[^/]+\.pdf$/i.test(n));
      if (hit) zf = zip.file(hit);
    }
    if (zf) {
      const blob = await zf.async('blob');
      const dataUrl = await blobToDataUrl(blob);
      const baseName = (data && data.stueckliste && data.stueckliste.name)
        || (zf.name && zf.name.split('/').pop())
        || 'Stueckliste.pdf';
      state.stueckliste = { name: baseName, dataUrl: dataUrl, parts: null };
    }
    /* v1.85: pro Variante */
    const meta = (data && data.variantStuecklisten && typeof data.variantStuecklisten === 'object')
      ? data.variantStuecklisten : {};
    const variants = Array.isArray(data && data.variants) ? data.variants : variantsList();
    for (const v of variants) {
      const info = meta[v.id];
      const file = (info && info.file) || v.stuecklisteFile || ('source/Stueckliste-' + v.id + '.pdf');
      let f = zip.file(file);
      if (!f && info && info.file) f = zip.file(info.file);
      if (!f) continue;
      try {
        const blob = await f.async('blob');
        const dataUrl = await blobToDataUrl(blob);
        const name = (info && info.name) || (f.name && f.name.split('/').pop()) || 'Stueckliste.pdf';
        state.variantStuecklisten[v.id] = { name: name, dataUrl: dataUrl, parts: null };
      } catch (err) {
        console.warn('Varianten-Stuckliste laden', file, err);
      }
    }
    /* Migration: eine Legacy-Stuckliste auf erste Variante legen, falls Varianten noch keine haben */
    if (state.stueckliste && state.stueckliste.dataUrl && variants.length) {
      const first = variants[0];
      if (!state.variantStuecklisten[first.id]) {
        state.variantStuecklisten[first.id] = {
          name: state.stueckliste.name,
          dataUrl: state.stueckliste.dataUrl,
          parts: null,
        };
      }
    }
    if (state.activeVariantId && state.variantStuecklisten[state.activeVariantId]) {
      state.stueckliste = state.variantStuecklisten[state.activeVariantId];
    }
  }


  /* v1.58: Open-time content signature (no live multi-device sync).
     localStorage map docKey → signature (savedAt or hash of project.json).
     Warn when re-opening a known .beak whose content differs from last stand on this device. */
  const DOC_SIG_KEY = 'anweisungen-doc-sigs';

  function readDocSigMap() {
    try {
      const raw = localStorage.getItem(DOC_SIG_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (_) {
      return {};
    }
  }

  function writeDocSigMap(map) {
    try {
      localStorage.setItem(DOC_SIG_KEY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function projectContentSignature(data, rawText) {
    if (data && typeof data.savedAt === 'string' && data.savedAt.trim()) {
      return 'at:' + data.savedAt.trim();
    }
    const s = (typeof rawText === 'string' && rawText.length) ? rawText : JSON.stringify(data || {});
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'h:' + (h >>> 0).toString(36) + ':' + s.length;
  }

  function docKeyFromFileName(name) {
    try {
      return 'fn:' + toBeakFilename(name || 'Anweisungen.beak').toLowerCase();
    } catch (_) {
      return null;
    }
  }

  function rememberDocSignature(docKey, sig) {
    if (!docKey || !sig) return;
    const map = readDocSigMap();
    map[docKey] = sig;
    writeDocSigMap(map);
  }

  /** Returns true if caller should proceed with load/replace. */
  async function confirmDocSignatureIfChanged(docKey, incomingSig) {
    if (!docKey || !incomingSig) return true;
    const prev = readDocSigMap()[docKey];
    if (!prev || prev === incomingSig) return true;
    try {
      const ok = await showConfirm(
        'Diese Datei unterscheidet sich vom Stand auf diesem Gerät.\nMöchten Sie die Datei laden und den lokalen Stand ersetzen?',
        { okLabel: 'Laden', cancelLabel: 'Abbrechen', okPrimary: true }
      );
      return !!ok;
    } catch (_) {
      return true;
    }
  }

    async function applyPlanZip(file, handle) {
    if (typeof JSZip === 'undefined') {
      flash('JSZip nicht geladen', 8000);
      return;
    }
    let zip;
    try {
      zip = await JSZip.loadAsync(file);
    } catch (_) {
      flash('Keine Anweisungen-Projektdatei (ZIP beschädigt)', 8000, 'error');
      return;
    }
    let projFile = zip.file('project.json');
    if (!projFile) {
      /* v1.16: z. B. von „Komprimieren“ in einen Ordner gepackt → project.json eine Ebene tiefer */
      const hit = Object.keys(zip.files || {})
        .filter((n) => !zip.files[n].dir && /(^|\/)project\.json$/i.test(n) && !/^__MACOSX\//.test(n))
        .sort((a, b) => a.length - b.length)[0];
      if (hit && hit.split('/').length === 2) {
        zip = zip.folder(hit.slice(0, hit.lastIndexOf('/')));
        projFile = zip.file('project.json');
      }
    }
    if (!projFile) {
      flash('Keine Anweisungen-Projektdatei (project.json fehlt)', 8000, 'error');
      return;
    }
    let data;
    let projText = '';
    try {
      projText = await projFile.async('string');
      data = JSON.parse(projText);
    } catch (_) {
      flash('Keine Anweisungen-Projektdatei (project.json ungültig)', 8000, 'error');
      return;
    }
    const openDocKey = docKeyFromFileName(file && file.name);
    const openSig = projectContentSignature(data, projText);
    if (!(await confirmDocSignatureIfChanged(openDocKey, openSig))) {
      flash('Öffnen abgebrochen', 2500);
      return;
    }
    if (!applyLoaded(data)) {
      flash('Keine Anweisungen-Projektdatei (ungültiges Format)', 8000, 'error');
      return;
    }
    try {
      await loadPhotosFromZip(zip, state.doc.pages);
    } catch (err) {
      console.warn('Fotos aus ZIP', err);
    }
    try {
      await loadThumbsFromZip(zip, data);
    } catch (err) {
      console.warn('Thumbs aus ZIP', err);
      try { clearPersistedThumbs(); } catch (_) {}
    }
    try {
      await loadStuecklisteFromZip(zip, data);
    } catch (err) {
      console.warn('Stückliste aus ZIP', err);
      state.stueckliste = null;
    }
    updateStuecklisteUi();
    rebuildBeakUsage();
    renderAll();
    loadedSaveFileName = toBeakFilename(file.name || 'Anweisungen.beak');
    projectFileHandle = handle || null;
    applyIndexTitleFromOpenedFile(loadedSaveFileName);
    renderAll();
    try { applyRememberedPage(); } catch (_) {}
    enterOpenDocument({ clearDirty: true, hideChrome: true });
    quietLocalStorageBackup();
    try { rememberDocSignature(openDocKey || docKeyFromFileName(loadedSaveFileName), openSig); } catch (_) {}
    try { appendChangeLog('Projekt geöffnet', null); } catch (_) {}
    flash('Geöffnet: ' + loadedSaveFileName);
    warmupPdfPipeline();
  }

  async function applyProjectFile(file, handle) {
    // v1.13: Öffnen ist kein Rückgängig-Schritt → danach neue Ausgangsbasis
    hist.loading++;
    changeLogQuiet = true;
    try {
      await applyProjectFileInner(file, handle);
    } finally {
      hist.loading--;
      historyReset();
      changeLogQuiet = false;
    }
  }

  async function applyProjectFileInner(file, handle) {
    /* v1.16: Inhalt entscheidet (ZIP-Signatur PK\x03\x04), nicht Endung/MIME-Typ – so gehen auch
       „.beak.zip“, „.zip“ oder Dateien ohne Endung (iOS) und alte .plan/.beakplan-ZIPs. */
    const kind = await sniffProjectFile(file);
    if (kind === 'zip') {
      await applyPlanZip(file, handle);
      return;
    }
    if (kind === 'empty') {
      flash('Keine Anweisungen-Projektdatei (Datei ist leer)', 8000, 'error');
      return;
    }
    /* Kein ZIP: nur noch ältere JSON-Projektstände zulassen */
    let data;
    let projText = '';
    try {
      if (file.size > 200 * 1024 * 1024) throw new Error('zu groß');
      projText = await file.text();
      data = JSON.parse(projText);
    } catch (_) {
      flash('Keine Anweisungen-Projektdatei', 8000, 'error');
      return;
    }
    const openDocKey = docKeyFromFileName(file && file.name);
    const openSig = projectContentSignature(data, projText);
    if (!(await confirmDocSignatureIfChanged(openDocKey, openSig))) {
      flash('Öffnen abgebrochen', 2500);
      return;
    }
    if (!applyLoaded(data)) {
      flash('Keine Anweisungen-Projektdatei', 8000, 'error');
      return;
    }
    state.stueckliste = null;
    updateStuecklisteUi();
    loadedSaveFileName = toBeakFilename(file.name || 'Anweisungen.beak');
    projectFileHandle = handle || null;
    applyIndexTitleFromOpenedFile(loadedSaveFileName);
    renderAll();
    try { applyRememberedPage(); } catch (_) {}
    enterOpenDocument({ clearDirty: true, hideChrome: true });
    quietLocalStorageBackup();
    try { rememberDocSignature(openDocKey || docKeyFromFileName(loadedSaveFileName), openSig); } catch (_) {}
    try { appendChangeLog('Projekt geöffnet', null); } catch (_) {}
    flash('Geöffnet: ' + loadedSaveFileName);
    warmupPdfPipeline();
  }

  async function load() {
    if (canOpenProjectPicker()) {
      const picked = await openProjectWithPicker();
      if (picked) await applyProjectFile(picked.file, picked.handle);
      return;
    }
    if (el.projectFile) {
      el.projectFile.value = '';
      el.projectFile.click();
    } else {
      flash('Öffnen nicht verfügbar', 4000);
    }
  }

  function onProjectFileChosen(ev) {
    const file = ev.target && ev.target.files && ev.target.files[0];
    if (!file) return;
    void applyProjectFile(file, null);
    ev.target.value = '';
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error('kein Bild'));
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild laden fehlgeschlagen'));
      img.src = src;
    });
  }

  function drawPhotoCover(ctx, img, x, y, w, h, photo) {
    const scale = clamp(photo && photo.scale != null ? photo.scale : 1, PHOTO_SCALE_MIN, PHOTO_SCALE_MAX);
    const ox = clamp(photo && photo.x != null ? photo.x : 0.5, 0, 1);
    const oy = clamp(photo && photo.y != null ? photo.y : 0.5, 0, 1);
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih || w <= 0 || h <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + w / 2 + (photo && photo.tx ? photo.tx * w : 0), y + h / 2 + (photo && photo.ty ? photo.ty * h : 0));
    const rot = normalizePhotoRot(photo && photo.rot);
    if (rot) ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(scale, scale);
    const bw = rot === 90 || rot === 270 ? h : w;
    const bh = rot === 90 || rot === 270 ? w : h;
    const r = Math.max(bw / iw, bh / ih);
    const dw = iw * r;
    const dh = ih * r;
    const dx = -bw / 2 + (bw - dw) * ox;
    const dy = -bh / 2 + (bh - dh) * oy;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  async function drawCellTree(ctx, cell, x, y, w, h, borderW) {
    if (cell.type === 'leaf') {
      ctx.fillStyle = '#2a2a2a';
      ctx.fillRect(x, y, w, h);
      const photo = normalizePhoto(cell.photo);
      if (photo && photo.src) {
        try {
          const img = await loadImage(photo.src);
          drawPhotoCover(ctx, img, x, y, w, h, photo);
        } catch (_) {}
      }
      return;
    }
    const gap = borderW;
    const ratio = clamp(cell.ratio, 0.15, 0.85);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    if (cell.dir === 'v') {
      const inner = w - gap;
      const aw = Math.max(1, inner * ratio);
      const bw = Math.max(1, inner - aw);
      await drawCellTree(ctx, cell.a, x, y, aw, h, borderW);
      await drawCellTree(ctx, cell.b, x + aw + gap, y, bw, h, borderW);
    } else {
      const inner = h - gap;
      const ah = Math.max(1, inner * ratio);
      const bh = Math.max(1, inner - ah);
      await drawCellTree(ctx, cell.a, x, y, w, ah, borderW);
      await drawCellTree(ctx, cell.b, x, y + ah + gap, w, bh, borderW);
    }
  }

  function drawAnnotations(ctx, annotations, W, H) {
    const borderPx = Math.max(2, (1.5 / 25.4) * 96);
    for (const a of annotations || []) {
      /* v1.51: Fotozwischenspeicher nie in PDF/Thumbs */
      if (!a || a.type === 'photoClipboard') continue;
      const x = (a.x / 100) * W;
      const y = (a.y / 100) * H;
      const w = (a.w / 100) * W;
      const h = (a.h / 100) * H;
      if (a.type === 'rect') {
        ctx.strokeStyle = annColorCss(annColorKey(a), 'rect');
        ctx.lineWidth = borderPx;
        ctx.strokeRect(x, y, w, h);
      } else if (a.type === 'arrow') {
        drawArrowCanvas(ctx, arrowKindOf(a), x + w / 2, y + h / 2, w, h, Number(a.rot) || 0, annColorCss(annColorKey(a), 'arrow'));
      } else if (a.type === 'ellipse') {
        ctx.strokeStyle = annColorCss(annColorKey(a), 'ellipse');
        ctx.lineWidth = borderPx;
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2), Math.max(1, h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (a.type === 'text') {
        const text = a.text || 'Text';
        const sm = a.textSize === 'sm';
        const xl = a.textSize === 'xl'; /* v1.10 neues „Text groß“ = 1.4 × */
        const fontPx = sm ? 20 : (xl ? 40 : 28); /* ~30% smaller */
        const padX = sm ? 7 : (xl ? 14 : 10);
        const padY = sm ? 4 : (xl ? 8 : 6);
        const lineH = fontPx * (sm ? 1.25 : 1.3);
        const lines = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        ctx.font = fontPx + 'px "Segoe UI", system-ui, sans-serif';
        let maxLineW = 0;
        for (const line of lines) {
          maxLineW = Math.max(maxLineW, ctx.measureText(line).width);
        }
        const contentW = Math.max(8, maxLineW + padX * 2);
        const tw = a.fixedW ? Math.max(contentW, w) : contentW;
        const th = Math.max(sm ? 28 : (xl ? 56 : 40), padY * 2 + lineH * Math.max(1, lines.length));
        const colorKey = annColorKey(a);
        const none = annIsNoneColor(colorKey);
        if (!none) {
          ctx.fillStyle = annColorCss(colorKey, 'text');
          ctx.fillRect(x, y, tw, th);
        }
        ctx.fillStyle = annTextFgCss(colorKey);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        const startY = y + padY + lineH / 2;
        for (let li = 0; li < lines.length; li++) {
          ctx.fillText(lines[li], x + tw / 2, startY + li * lineH);
        }
        ctx.textAlign = 'left';
      } else if (a.type === 'beakNr') {
        const text = beakNrDisplay(a.qty, a.beakDigits);
        const fontPx = 28; /* match Text groß */
        const padX = 6; /* match CSS: equal H/V padding */
        const th = 40;
        ctx.font = '600 ' + fontPx + 'px "Segoe UI", system-ui, sans-serif';
        const metrics = ctx.measureText(text);
        const tw = Math.max(8, metrics.width + padX * 2); /* hug text */
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(x, y, tw, th);
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(text, x + tw / 2, y + th / 2);
        ctx.textAlign = 'left';
      } else if (a.type === 'button' || a.type === 'info') {
        const text = a.text || (a.type === 'info' ? 'Info' : 'Button');
        const padX = 12; /* match .btn / .ann-button */
        const th = 36; /* match app .btn min-height */
        const fontSize = 15;
        ctx.font = '700 ' + fontSize + 'px "Segoe UI", system-ui, sans-serif';
        const metrics = ctx.measureText(text);
        const contentW = Math.max(36, metrics.width + padX * 2);
        const bw = a.fixedW ? Math.max(contentW, w) : contentW;
        const r = 8;
        ctx.fillStyle = '#4a9eff';
        ctx.strokeStyle = '#2f7fd4';
        ctx.lineWidth = Math.max(1.5, borderPx * 0.75);
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, bw, th, r);
        } else {
          const rr = r;
          ctx.moveTo(x + rr, y);
          ctx.arcTo(x + bw, y, x + bw, y + th, rr);
          ctx.arcTo(x + bw, y + th, x, y + th, rr);
          ctx.arcTo(x, y + th, x, y, rr);
          ctx.arcTo(x, y, x + bw, y, rr);
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + bw / 2, y + th / 2, Math.max(8, bw - 8));
        ctx.textAlign = 'left';
      }
    }
  }

  function drawIndexPageToCanvas(ctx, page, W, H) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    const titleH = Math.max(22, Math.round(H * 0.06));
    const colH = Math.max(16, Math.round(H * 0.042));
    const titleLabel = (page && page.title) ? String(page.title) : 'Arbeitsschritte';

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, titleH);
    ctx.fillStyle = '#ffffff';
    const titleFont = Math.max(12, Math.round(titleH * 0.52)); /* v1.20 leicht größer */
    ctx.font = '700 ' + titleFont + 'px Segoe UI, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleLabel, Math.round(W * 0.02), titleH / 2);

    ctx.fillStyle = '#333333';
    ctx.fillRect(0, titleH, W, colH);
    ctx.fillStyle = '#9a9a9a';
    const headerFont = Math.max(10, Math.round(colH * 0.45));
    ctx.font = '600 ' + headerFont + 'px Segoe UI, system-ui, sans-serif';
    const nrX = Math.round(W * 0.02);
    const titleX = Math.round(W * 0.076);
    ctx.fillText('Nr.', nrX, titleH + colH / 2);
    ctx.fillText('Arbeitsschritt', titleX, titleH + colH / 2);

    const rows = padIndexRows(page);
    const headTotal = titleH + colH;
    const bodyH = Math.max(1, H - headTotal);
    const rowH = bodyH / INDEX_MAX_ROWS;
    /* v1.20: Tabellentext größer + fett (~+15 %), wie CSS .index-text */
    const rowFont = Math.max(9, Math.round(rowH * 0.48));
    ctx.font = '700 ' + rowFont + 'px Segoe UI, system-ui, sans-serif';
    for (let i = 0; i < INDEX_MAX_ROWS; i++) {
      const y = headTotal + i * rowH;
      ctx.fillStyle = (i % 2 === 0) ? '#262626' : '#404040';
      ctx.fillRect(0, y, W, rowH + 0.75);
      const row = rows[i];
      const nr = indexNrLabel(rows, i);
      const title = (row && row.text) ? String(row.text) : '';
      if (nr) {
        ctx.fillStyle = '#4a9eff';
        ctx.fillText(nr, nrX, y + rowH / 2);
      }
      if (title) {
        ctx.fillStyle = '#4a9eff';
        let drawTitle = title;
        while (drawTitle.length > 3 && ctx.measureText(drawTitle).width > W - titleX - 12) {
          drawTitle = drawTitle.slice(0, -4) + '…';
        }
        ctx.fillText(drawTitle, titleX, y + rowH / 2);
      }
    }
  }

  function drawFehlerPageToCanvas(ctx, page, W, H) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    const titleH = Math.max(22, Math.round(H * 0.06));
    const colH = Math.max(16, Math.round(H * 0.042));
    const titleLabel = (page && page.title) ? String(page.title) : 'Fehleranalyse';

    ctx.fillStyle = '#e8b03f';
    ctx.fillRect(0, 0, W, titleH);
    ctx.fillStyle = '#1a1a1a';
    const titleFont = Math.max(11, Math.round(titleH * 0.5));
    ctx.font = '700 ' + titleFont + 'px Segoe UI, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(titleLabel, Math.round(W * 0.02), titleH / 2);

    ctx.fillStyle = '#333333';
    ctx.fillRect(0, titleH, W, colH);
    ctx.fillStyle = '#9a9a9a';
    const headerFont = Math.max(9, Math.round(colH * 0.42));
    ctx.font = '600 ' + headerFont + 'px Segoe UI, system-ui, sans-serif';
    const pad = Math.round(W * 0.02);
    const dateW = Math.max(56, Math.round(W * 0.1));
    const rest = W - pad * 2 - dateW;
    const colW = rest / 3;
    const cols = [
      { label: 'Datum', x: pad },
      { label: 'Fehlerbeschreibung', x: pad + dateW },
      { label: 'Ursache', x: pad + dateW + colW },
      { label: 'Behebung', x: pad + dateW + colW * 2 },
    ];
    for (const c of cols) {
      ctx.fillText(c.label, c.x, titleH + colH / 2);
    }

    const rows = padFehlerRows(page);
    const headTotal = titleH + colH;
    const bodyH = Math.max(1, H - headTotal);
    const rowH = bodyH / INDEX_MAX_ROWS;
    const rowFont = Math.max(7, Math.round(rowH * 0.4));
    ctx.font = '400 ' + rowFont + 'px Segoe UI, system-ui, sans-serif';
    for (let i = 0; i < INDEX_MAX_ROWS; i++) {
      const y = headTotal + i * rowH;
      ctx.fillStyle = (i % 2 === 0) ? '#262626' : '#404040';
      ctx.fillRect(0, y, W, rowH + 0.75);
      const row = rows[i] || {};
      const vals = [
        { text: row.date || '', x: pad, maxW: dateW - 6 },
        { text: row.description || '', x: pad + dateW, maxW: colW - 8 },
        { text: row.cause || '', x: pad + dateW + colW, maxW: colW - 8 },
        { text: row.remedy || '', x: pad + dateW + colW * 2, maxW: colW - 8 },
      ];
      ctx.fillStyle = '#4a9eff';
      for (const v of vals) {
        if (!v.text) continue;
        let draw = String(v.text);
        while (draw.length > 3 && ctx.measureText(draw).width > v.maxW) {
          draw = draw.slice(0, -4) + '…';
        }
        ctx.fillText(draw, v.x, y + rowH / 2);
      }
    }
  }


  function embedHeightFraction(rowCount) {
    const n = Math.max(1, rowCount | 0);
    // Header + col headers + rows; cap at 40% of stage
    return Math.min(0.40, Math.max(0.16, 0.10 + n * 0.055));
  }

  function drawFehlerEmbedToCanvas(ctx, rows, x, y, W, H) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(x, y, W, H);

    const titleH = Math.max(16, Math.round(H * 0.22));
    const colH = Math.max(12, Math.round(H * 0.16));
    const n = Math.max(1, (rows && rows.length) || 1);
    const bodyH = Math.max(1, H - titleH - colH);
    const rowH = bodyH / n;

    ctx.fillStyle = '#e8b03f';
    ctx.fillRect(x, y, W, titleH);
    ctx.fillStyle = '#1a1a1a';
    const titleFont = Math.max(9, Math.round(titleH * 0.5));
    ctx.font = '700 ' + titleFont + 'px Segoe UI, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText('Fehleranalyse', x + Math.round(W * 0.02), y + titleH / 2);

    ctx.fillStyle = '#333333';
    ctx.fillRect(x, y + titleH, W, colH);
    ctx.fillStyle = '#9a9a9a';
    const headerFont = Math.max(7, Math.round(colH * 0.45));
    ctx.font = '600 ' + headerFont + 'px Segoe UI, system-ui, sans-serif';
    const pad = Math.round(W * 0.02);
    const dateW = Math.max(48, Math.round(W * 0.1));
    const rest = W - pad * 2 - dateW;
    const colW = rest / 3;
    const cols = [
      { label: 'Datum', cx: x + pad },
      { label: 'Fehlerbeschreibung', cx: x + pad + dateW },
      { label: 'Ursache', cx: x + pad + dateW + colW },
      { label: 'Behebung', cx: x + pad + dateW + colW * 2 },
    ];
    for (const c of cols) {
      ctx.fillText(c.label, c.cx, y + titleH + colH / 2);
    }

    const rowFont = Math.max(6, Math.round(rowH * 0.42));
    ctx.font = '400 ' + rowFont + 'px Segoe UI, system-ui, sans-serif';
    const list = rows || [];
    for (let i = 0; i < n; i++) {
      const ry = y + titleH + colH + i * rowH;
      ctx.fillStyle = (i % 2 === 0) ? '#262626' : '#404040';
      ctx.fillRect(x, ry, W, rowH + 0.5);
      const row = list[i] || {};
      const vals = [
        { text: row.date || '', cx: x + pad, maxW: dateW - 6 },
        { text: row.description || '', cx: x + pad + dateW, maxW: colW - 8 },
        { text: row.cause || '', cx: x + pad + dateW + colW, maxW: colW - 8 },
        { text: row.remedy || '', cx: x + pad + dateW + colW * 2, maxW: colW - 8 },
      ];
      ctx.fillStyle = '#4a9eff';
      for (const v of vals) {
        if (!v.text) continue;
        let draw = String(v.text);
        while (draw.length > 3 && ctx.measureText(draw).width > v.maxW) {
          draw = draw.slice(0, -4) + '…';
        }
        ctx.fillText(draw, v.cx, ry + rowH / 2);
      }
    }
  }

  async function drawLayoutPageToCanvas(ctx, page, W, H) {
    const embedRows = resolveFehlerEmbedRows(page);
    const hasEmbed = embedRows.length > 0;
    const embedFrac = hasEmbed ? embedHeightFraction(embedRows.length) : 0;
    const embedH = hasEmbed ? Math.round(H * embedFrac) : 0;
    const layoutH = H - embedH;

    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);

    const frame = Math.max(2, (2 / 25.4) * 96 * (W / ASPECT_W));
    const ix = frame;
    const iy = frame;
    const iw = W - frame * 2;
    const ih = Math.max(1, layoutH - frame * 2);
    ctx.fillStyle = '#666666';
    ctx.fillRect(ix, iy, iw, ih);
    if (page && page.root) {
      await drawCellTree(ctx, page.root, ix, iy, iw, ih, frame);
    }
    if (page && page.highlight) {
      drawHighlightVeilCanvas(ctx, page, page.annotations || [], W, layoutH, { x: ix, y: iy, w: iw, h: ih });
    }
    drawAnnotations(ctx, page.annotations || [], W, layoutH);

    if (hasEmbed) {
      drawFehlerEmbedToCanvas(ctx, embedRows, 0, layoutH, W, embedH);
    }
  }

  async function renderPageThumbnailDataUrl(page, maxW) {
    /* v1.19: Übersicht-Thumbs aus echtem Seiten-DOM (wie PDF-Export), dann Low-Res-JPEG.
       Vermeidet falsche Schriftgrößen der Canvas-Näherung drawIndex/FehlerPageToCanvas. */
    const tw = Math.max(80, Math.round(maxW || 440));
    const th = Math.round(tw * (ASPECT_H / ASPECT_W));
    const index = state.doc.pages.indexOf(page);
    let canvas = null;
    try {
      canvas = await renderPageViaDom(page, index >= 0 ? index : 0, tw, th);
    } catch (err) {
      console.warn('DOM-Thumb fehlgeschlagen, Canvas-Rückfall', err);
      canvas = null;
    }
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (isIndexPage(page)) drawIndexPageToCanvas(ctx, page, tw, th);
      else if (isFehlerPage(page)) drawFehlerPageToCanvas(ctx, page, tw, th);
      else await drawLayoutPageToCanvas(ctx, page, tw, th);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
    try { canvas.width = 0; canvas.height = 0; } catch (_) {}
    return dataUrl;
  }

  let overviewToken = 0;

  function isOverviewOpen() {
    return !!(el.overviewBackdrop && !el.overviewBackdrop.hidden);
  }

  /* v1.19: Übersicht = gecachte Low-Res-JPEGs (~440 px) aus echtem DOM-Render
   * (renderPageViaDom), kein dauerhafter Full-DOM-Klon im Grid.
   * v1.47: Zusätzlich dauerhafte Thumbs (pageId → {sig, dataUrl}) in .beak thumbs/
   * und IndexedDB, damit Übersicht nach Öffnen nicht neu gerendert werden muss. */
  const THUMB_MAX_W = 440;
  const thumbCache = { rev: 0, map: new Map() }; // key = page.id + '@' + rev + ':' + sig → dataUrl
  const thumbPersist = { byId: new Map() }; // pageId → { sig, dataUrl }

  function bumpThumbCache() {
    thumbCache.rev += 1;
    thumbCache.map.clear();
  }

  function clearPersistedThumbs() {
    thumbPersist.byId.clear();
  }

  function lookupPersistedThumb(page) {
    if (!page || !page.id) return null;
    const entry = thumbPersist.byId.get(page.id);
    if (!entry || !entry.dataUrl) return null;
    let sig;
    try { sig = pageThumbSignature(page); } catch (_) { return null; }
    if (entry.sig !== sig) {
      thumbPersist.byId.delete(page.id);
      return null;
    }
    return entry.dataUrl;
  }

  function rememberPersistedThumb(page, dataUrl) {
    if (!page || !page.id || !dataUrl) return;
    let sig;
    try { sig = pageThumbSignature(page); } catch (_) { return; }
    thumbPersist.byId.set(page.id, { sig: sig, dataUrl: dataUrl });
    try { persistSoon(1500); } catch (_) {}
  }

  function hydratePersistedThumbs(map) {
    if (!map || typeof map !== 'object') return;
    for (const [pageId, info] of Object.entries(map)) {
      if (!pageId || !info || !info.dataUrl) continue;
      thumbPersist.byId.set(pageId, {
        sig: typeof info.sig === 'string' ? info.sig : '',
        dataUrl: info.dataUrl,
      });
    }
  }

  /** Nach Laden (.beak/IDB): Sig an aktuellen Seiteninhalt anpassen (Foto-Data-URL kann
   *  leicht andere Länge haben als beim Speichern; Thumb selbst ist für den geladenen Stand gültig). */
  function restampPersistedThumbSigs() {
    const pages = (state.doc && state.doc.pages) || [];
    const live = new Set();
    for (const page of pages) {
      if (!page || !page.id) continue;
      live.add(page.id);
      const entry = thumbPersist.byId.get(page.id);
      if (!entry || !entry.dataUrl) continue;
      try { entry.sig = pageThumbSignature(page); } catch (_) {}
    }
    for (const id of [...thumbPersist.byId.keys()]) {
      if (!live.has(id)) thumbPersist.byId.delete(id);
    }
  }

  /** Aktuelle gültige Thumbs für Speichern (.beak / IDB). */
  function collectValidPersistedThumbs() {
    const out = new Map();
    const pages = (state.doc && state.doc.pages) || [];
    const live = new Set();
    for (const page of pages) {
      if (!page || !page.id) continue;
      live.add(page.id);
      const dataUrl = lookupPersistedThumb(page);
      if (!dataUrl) continue;
      const entry = thumbPersist.byId.get(page.id);
      out.set(page.id, { sig: entry.sig, dataUrl: dataUrl });
    }
    for (const id of [...thumbPersist.byId.keys()]) {
      if (!live.has(id)) thumbPersist.byId.delete(id);
    }
    return out;
  }

  function pageThumbSignature(page) {
    try {
      if (isIndexPage(page)) {
        return 'i:' + (page.title || '') + ':' + (page.rows || []).map((r) => (r.text || '') + '>' + (r.targetPage || 0)).join('|');
      }
      if (isFehlerPage(page)) {
        return 'f:' + (page.title || '') + ':' + (page.rows || []).map((r) => [r.date, r.description, r.cause, r.remedy].join('~')).join('|');
      }
      const leaves = [];
      walkLeaves(page.root, (leaf) => {
        const ph = leaf.photo;
        leaves.push(leaf.id + ':' + (ph ? ((ph.src || ph.file || '').length + ':' + (ph.rot || 0) + ':' + (ph.scale || 1) + ':' + (ph.x != null ? ph.x : 0.5) + ':' + (ph.y != null ? ph.y : 0.5) + ':' + (ph.tx || 0) + ':' + (ph.ty || 0)) : '0'));
      });
      const anns = (page.annotations || []).map((a) => (a.type || '') + ':' + (a.text || '') + ':' + (a.beakDigits || '') + ':' + (a.qty || '') + ':' + (a.infoText || '') + ':' + (a.targetPage || '') + ':' + (a.buttonAction || '')).join(';');
      const emb = page.fehlerEmbed ? String((page.fehlerEmbed.rowIds || []).length) : '0';
      return 'l:' + leaves.join(',') + '#' + anns + '#' + emb;
    } catch (_) {
      return 'x:' + thumbCache.rev + ':' + (page && page.id);
    }
  }

  function thumbCacheKey(page) {
    return (page && page.id ? page.id : '?') + '@' + thumbCache.rev + ':' + pageThumbSignature(page);
  }

  /** v1.17: Spalten/Zeilen so wählen, dass ALLE Miniaturen vollständig sichtbar sind. */
  function fitOverviewGrid() {
    const grid = el.overviewGrid;
    if (!grid) return;
    const n = grid.querySelectorAll('.overview-thumb').length;
    if (!n) return;
    const panel = grid.closest('.overview-panel');
    const header = panel && panel.querySelector('.overview-header');
    const cs = getComputedStyle(grid);
    const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const availW = Math.max(100, grid.clientWidth - padX);
    const panelMaxH = panel ? (parseFloat(getComputedStyle(panel).maxHeight) || window.innerHeight - 64) : window.innerHeight - 64;
    const availH = Math.max(80, panelMaxH - (header ? header.offsetHeight : 0) - padY - 4);
    const gap = n > 24 ? 8 : 14;
    const ar = ASPECT_W / ASPECT_H;
    let best = null;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const w = Math.min((availW - (c - 1) * gap) / c, ((availH - (r - 1) * gap) / r) * ar);
      if (!best || w > best.w + 0.01) best = { c, r, w };
    }
    let { c, w } = best;
    const MIN_W = 64;
    if (w < MIN_W) {
      c = Math.max(1, Math.floor((availW + gap) / (MIN_W + gap)));
      w = Math.min((availW - (c - 1) * gap) / c, 220);
    }
    w = Math.floor(w);
    const h = Math.floor(w / ar);
    grid.style.gap = gap + 'px';
    grid.style.gridTemplateColumns = 'repeat(' + c + ', ' + w + 'px)';
    grid.style.gridAutoRows = h + 'px';
    grid.style.justifyContent = 'center';
    grid.dataset.cols = String(c);
  }

  function layoutOverviewMiniatures() {
    if (!el.overviewGrid) return;
    fitOverviewGrid();
  }

  function closeOverview() {
    if (!el.overviewBackdrop) return;
    overviewToken += 1;
    if (overviewResizeObs) { try { overviewResizeObs.disconnect(); } catch (_) {} overviewResizeObs = null; }
    window.removeEventListener('resize', layoutOverviewMiniatures);
    el.overviewBackdrop.hidden = true;
    if (el.overviewGrid) el.overviewGrid.innerHTML = '';
    try {
      const fb = state.editMode ? document.getElementById('overviewBtnEdit') : el.overviewBtn;
      if (fb) fb.focus({ preventScroll: true });
    } catch (_) {}
  }

  let overviewResizeObs = null;

  function applyThumbToButton(btn, dataUrl) {
    if (!btn || !dataUrl) return;
    const ph = btn.querySelector('.overview-placeholder');
    if (ph) ph.remove();
    let img = btn.querySelector('img.overview-thumb-img');
    if (!img) {
      img = document.createElement('img');
      img.className = 'overview-thumb-img';
      img.alt = '';
      btn.appendChild(img);
    }
    img.src = dataUrl;
    btn.classList.add('has-thumb');
    btn.classList.remove('has-miniature');
  }

  async function openOverview() {
    if (!el.overviewBackdrop || !el.overviewGrid) return;
    if (isOverviewOpen()) return;
    if (state.editMode) {
      if (state.splitTool) setSplitTool(false);
      if (state.photoMoveMode) setPhotoMoveMode(false);
      if (state.photoRotateMode) setPhotoRotateMode(false);
      if (state.teleportMode) setTeleportMode(false);
      if (state.annTool) setAnnTool(null);
    }
    stopLiveCamera();

    const token = ++overviewToken;
    el.overviewGrid.innerHTML = '';
    el.overviewBackdrop.hidden = false;

    /* v1.34: Dialogtitel = Übersicht - {Projektdatei-Basename} */
    const overviewTitleEl = document.getElementById('overviewTitle');
    if (overviewTitleEl) {
      const projName = projectDisplayTitle(loadedSaveFileName);
      overviewTitleEl.textContent = projName ? ('Alle Seiten - ' + projName) : 'Alle Seiten';
    }

    /* v1.88: Übersicht = Navigationsreihenfolge (eine Kachel pro pageGroup / Varianten-Sicht) */
    const pages = getNavPages();
    const currentReal = remapToVisiblePageIndex(state.doc.pageIndex);
    const buttons = [];

    for (let ni = 0; ni < pages.length; ni++) {
      const page = pages[ni];
      const realIdx = state.doc.pages.indexOf(page);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'overview-thumb' + (realIdx === currentReal ? ' current' : '');
      btn.dataset.pageIndex = String(realIdx);

      const badge = document.createElement('span');
      badge.className = 'overview-badge';
      badge.textContent = String(ni + 1);
      btn.appendChild(badge);
      appendOverviewVariantBars(btn, page);

      let pageLabel = 'Seite ' + (ni + 1);
      if (realIdx === currentReal) btn.setAttribute('aria-current', 'page');
      if (isVariantenPage(page)) {
        pageLabel = page.title || 'Varianten';
      } else if (isIndexPage(page)) {
        pageLabel = 'Arbeitsschritte';
      } else if (isFehlerPage(page)) pageLabel = (page.title || 'Fehleranalyse');
      btn.setAttribute('aria-label', pageLabel);
      btn.title = pageLabel;
      if (isVariantenPage(page) || isIndexPage(page) || isFehlerPage(page)) {
        const cap = document.createElement('span');
        cap.className = 'overview-caption';
        cap.textContent = pageLabel;
        btn.appendChild(cap);
      }

      const key = thumbCacheKey(page);
      let cached = thumbCache.map.get(key);
      if (!cached) {
        cached = lookupPersistedThumb(page);
        if (cached) thumbCache.map.set(key, cached);
      }
      if (cached) {
        applyThumbToButton(btn, cached);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'overview-placeholder';
        btn.appendChild(placeholder);
      }

      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.pageIndex, 10);
        closeOverview();
        if (isFinite(idx) && idx !== state.doc.pageIndex) {
          goToPage(idx);
          updateChromeForPage();
        }
      });

      el.overviewGrid.appendChild(btn);
      buttons.push(btn);
    }

    layoutOverviewMiniatures();
    if (typeof ResizeObserver === 'function') {
      overviewResizeObs = new ResizeObserver(() => layoutOverviewMiniatures());
      overviewResizeObs.observe(el.overviewGrid);
    }
    window.addEventListener('resize', layoutOverviewMiniatures);

    let failed = 0;
    for (let i = 0; i < pages.length; i++) {
      if (token !== overviewToken) return;
      const page = pages[i];
      const key = thumbCacheKey(page);
      let dataUrl = thumbCache.map.get(key);
      if (!dataUrl) dataUrl = lookupPersistedThumb(page);
      if (!dataUrl) {
        try {
          dataUrl = await renderPageThumbnailDataUrl(page, THUMB_MAX_W);
          if (token !== overviewToken) return;
          if (dataUrl) {
            thumbCache.map.set(key, dataUrl);
            rememberPersistedThumb(page, dataUrl);
          }
        } catch (err) {
          console.error('overview thumb', i, err);
          failed += 1;
          dataUrl = null;
        }
      } else {
        thumbCache.map.set(key, dataUrl);
      }
      if (dataUrl && buttons[i]) applyThumbToButton(buttons[i], dataUrl);
      await new Promise((r) => setTimeout(r, 0));
    }
    if (failed > 0 && token === overviewToken) {
      flash('Alle Seiten: ' + failed + ' Vorschau(en) fehlgeschlagen', 4000, 'error');
    }
  }

  /* ---- v1.11: PDF-Export aus dem echten Seiten-Layout ------------------------
   * Ursache bis v1.10: Der Export hat jede Seite von Hand auf ein 1180×820-Canvas
   * gezeichnet – mit eigenen, festen Pixelwerten (Text 28 px statt 16 px, BEAK
   * 28 px, Fehler-Einbettung/Index/Fehleranalyse mit eigener Geometrie). Dadurch
   * wichen Größen und Positionen vom Bildschirm ab.
   * Jetzt: Jede Seite wird mit derselben Funktion wie am Bildschirm
   * (renderPageSlide) in einen unsichtbaren Host in Referenzgröße 1180×820
   * gerendert (Lesemodus-Ansicht, da außerhalb von .app) und dieses DOM wird
   * anhand gemessener Positionen und berechneter Styles auf ein Canvas gemalt
   * (Hintergründe, Rahmen inkl. Radius, Schatten, Fotos mit object-fit/-position
   * und Zoom, Texte wortgenau an ihrer Layout-Position, Clipping). */
  // v1.17: Export rendert die logische Seite im Maßstab 1 (Painter liest ungescalte CSS-Pixel)
  const EXPORT_REF_W = PAGE_REF_W;
  const EXPORT_REF_H = PAGE_REF_H;
  const EXPORT_SCALE = 2; // Canvas 2360×1640 → scharf im PDF
  const EXPORT_SHADOW_K = (ASPECT_W * EXPORT_SCALE) / EXPORT_REF_W; // Schatten liegen im Gerätemaßstab

  function cssPx(v, ref) {
    if (v == null) return 0;
    const s = String(v).trim();
    if (s.endsWith('%')) return (parseFloat(s) / 100) * (ref || 0);
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  function isTransparentColor(c) {
    if (!c) return true;
    if (c === 'transparent') return true;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return false;
    const parts = m[1].split(/[\s,\/]+/).filter(Boolean);
    return parts.length >= 4 && parseFloat(parts[3]) === 0;
  }

  function cornerRadii(cs, w, h) {
    const one = (v) => {
      const parts = String(v || '0').trim().split(/\s+/);
      const rx = cssPx(parts[0], w);
      const ry = parts.length > 1 ? cssPx(parts[1], h) : cssPx(parts[0], h);
      return [Math.max(0, rx), Math.max(0, ry)];
    };
    let r = [one(cs.borderTopLeftRadius), one(cs.borderTopRightRadius), one(cs.borderBottomRightRadius), one(cs.borderBottomLeftRadius)];
    // CSS: Radien proportional verkleinern, wenn sie nicht passen
    const f = Math.min(
      1,
      w / Math.max(1e-6, r[0][0] + r[1][0]),
      w / Math.max(1e-6, r[3][0] + r[2][0]),
      h / Math.max(1e-6, r[0][1] + r[3][1]),
      h / Math.max(1e-6, r[1][1] + r[2][1])
    );
    if (f < 1) r = r.map(([a, b]) => [a * f, b * f]);
    return r;
  }

  function pathRoundRect(ctx, x, y, w, h, radii) {
    const [[tlx, tly], [trx, try_], [brx, bry], [blx, bly]] = radii;
    ctx.moveTo(x + tlx, y);
    ctx.lineTo(x + w - trx, y);
    if (trx || try_) ctx.ellipse(x + w - trx, y + try_, trx, try_, 0, -Math.PI / 2, 0);
    ctx.lineTo(x + w, y + h - bry);
    if (brx || bry) ctx.ellipse(x + w - brx, y + h - bry, brx, bry, 0, 0, Math.PI / 2);
    ctx.lineTo(x + blx, y + h);
    if (blx || bly) ctx.ellipse(x + blx, y + h - bly, blx, bly, 0, Math.PI / 2, Math.PI);
    ctx.lineTo(x, y + tly);
    if (tlx || tly) ctx.ellipse(x + tlx, y + tly, tlx, tly, 0, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  function insetRadii(radii, t, r, b, l) {
    return [
      [Math.max(0, radii[0][0] - l), Math.max(0, radii[0][1] - t)],
      [Math.max(0, radii[1][0] - r), Math.max(0, radii[1][1] - t)],
      [Math.max(0, radii[2][0] - r), Math.max(0, radii[2][1] - b)],
      [Math.max(0, radii[3][0] - l), Math.max(0, radii[3][1] - b)],
    ];
  }

  function parseFirstBoxShadow(s) {
    if (!s || s === 'none') return null;
    // z. B. "rgba(0, 0, 0, 0.35) 0px 4px 16px 0px" (erster Schatten, kein inset)
    const first = s.split(/,(?![^(]*\))/)[0].trim();
    if (/\binset\b/.test(first)) return null;
    const colorM = /(rgba?\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/i.exec(first);
    const nums = first.replace(colorM ? colorM[0] : '', '').trim().split(/\s+/).map(parseFloat).filter((n) => isFinite(n));
    if (nums.length < 2) return null;
    return { color: colorM ? colorM[0] : 'rgba(0,0,0,0.3)', x: nums[0], y: nums[1], blur: nums[2] || 0 };
  }

  function canvasFont(cs) {
    return (cs.fontStyle || 'normal') + ' ' + (cs.fontWeight || '400') + ' ' + (cs.fontSize || '16px') + ' ' + (cs.fontFamily || 'sans-serif');
  }

  function drawTextNodeToCanvas(ctx, node, cs, ox, oy) {
    const text = node.nodeValue || '';
    if (!text.trim()) return;
    ctx.font = canvasFont(cs);
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    const perChar = cs.letterSpacing && cs.letterSpacing !== 'normal' && parseFloat(cs.letterSpacing) !== 0;
    const range = document.createRange();
    const re = perChar ? /\S/gu : /\S+/g;
    let m;
    while ((m = re.exec(text))) {
      range.setStart(node, m.index);
      range.setEnd(node, m.index + m[0].length);
      const rects = range.getClientRects();
      if (!rects.length) continue;
      if (rects.length > 1 && !perChar) {
        // Wort über Zeilenumbruch → zeichenweise
        for (let i = 0; i < m[0].length; i++) {
          range.setStart(node, m.index + i);
          range.setEnd(node, m.index + i + 1);
          const rr = range.getBoundingClientRect();
          if (rr.width || rr.height) drawWordAt(ctx, m[0][i], rr, ox, oy);
        }
        continue;
      }
      drawWordAt(ctx, m[0], rects[0], ox, oy);
    }
    range.detach && range.detach();
  }

  function drawWordAt(ctx, word, r, ox, oy) {
    const mt = ctx.measureText(word);
    const fa = mt.fontBoundingBoxAscent;
    const fd = mt.fontBoundingBoxDescent;
    let baseline;
    if (isFinite(fa) && isFinite(fd) && fa + fd > 0) {
      baseline = r.top - oy + (r.height - (fa + fd)) / 2 + fa;
    } else {
      baseline = r.top - oy + r.height * 0.78;
    }
    ctx.fillText(word, r.left - ox, baseline);
  }

  function drawFieldValueToCanvas(ctx, field, cs, x, y, w, h) {
    const pl = cssPx(cs.paddingLeft) + cssPx(cs.borderLeftWidth);
    const pr = cssPx(cs.paddingRight) + cssPx(cs.borderRightWidth);
    const pt = cssPx(cs.paddingTop) + cssPx(cs.borderTopWidth);
    const cw = Math.max(1, w - pl - pr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.font = canvasFont(cs);
    ctx.fillStyle = cs.color;
    const align = cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : 'left');
    ctx.textAlign = align;
    const tx = align === 'center' ? x + pl + cw / 2 : (align === 'right' ? x + w - pr : x + pl);
    if (field.tagName === 'INPUT') {
      ctx.textBaseline = 'middle';
      ctx.fillText(field.value, tx, y + h / 2);
    } else {
      const lh = cs.lineHeight === 'normal' ? cssPx(cs.fontSize) * 1.25 : cssPx(cs.lineHeight);
      ctx.textBaseline = 'top';
      let ly = y + pt;
      for (const para of String(field.value).split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
          const t = line ? line + ' ' + word : word;
          if (ctx.measureText(t).width > cw && line) { ctx.fillText(line, tx, ly); ly += lh; line = word; } else line = t;
        }
        ctx.fillText(line, tx, ly); ly += lh;
      }
    }
    ctx.restore();
  }

  function drawImageElementToCanvas(ctx, img, cs, r, ox, oy) {
    if (!img.complete || !img.naturalWidth) return;
    // v1.13: gedrehte (und allgemein transformierte) Bilder: ungedrehten Rahmen
    // (offsetWidth/Height) um die Mitte mit der Transformationsmatrix zeichnen.
    const m = /^matrix\(([^)]+)\)$/.exec(cs.transform || '');
    if (m && img.offsetWidth > 0 && img.offsetHeight > 0) {
      const v = m[1].split(',').map(parseFloat);
      if (Math.abs(v[1]) > 1e-6 || Math.abs(v[2]) > 1e-6 || v[0] < 0 || v[3] < 0) {
        const ow = img.offsetWidth;
        const oh = img.offsetHeight;
        const iw0 = img.naturalWidth;
        const ih0 = img.naturalHeight;
        const k = Math.max(ow / iw0, oh / ih0);
        const dw0 = iw0 * k;
        const dh0 = ih0 * k;
        const pos0 = String(cs.objectPosition || '50% 50%').split(/\s+/);
        const px0 = pos0[0] && pos0[0].endsWith('%') ? parseFloat(pos0[0]) / 100 : 0.5;
        const py0 = pos0[1] && pos0[1].endsWith('%') ? parseFloat(pos0[1]) / 100 : 0.5;
        ctx.save();
        ctx.translate(r.left + r.width / 2 - ox, r.top + r.height / 2 - oy);
        ctx.transform(v[0], v[1], v[2], v[3], 0, 0);
        ctx.beginPath();
        ctx.rect(-ow / 2, -oh / 2, ow, oh);
        ctx.clip();
        ctx.drawImage(img, -ow / 2 + (ow - dw0) * px0, -oh / 2 + (oh - dh0) * py0, dw0, dh0);
        ctx.restore();
        return;
      }
    }
    const bx = r.left - ox;
    const by = r.top - oy;
    const bw = r.width;
    const bh = r.height;
    if (bw <= 0 || bh <= 0) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const fit = cs.objectFit || 'fill';
    let dw = bw;
    let dh = bh;
    if (fit === 'cover' || fit === 'contain') {
      const k = fit === 'cover' ? Math.max(bw / iw, bh / ih) : Math.min(bw / iw, bh / ih);
      dw = iw * k;
      dh = ih * k;
    }
    const pos = String(cs.objectPosition || '50% 50%').split(/\s+/);
    const px = pos[0] && pos[0].endsWith('%') ? parseFloat(pos[0]) / 100 : 0.5;
    const py = pos[1] && pos[1].endsWith('%') ? parseFloat(pos[1]) / 100 : 0.5;
    const dx = bx + (bw - dw) * px;
    const dy = by + (bh - dh) * py;
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by, bw, bh);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  function paintElementToCanvas(ctx, elem, ox, oy) {
    const cs = getComputedStyle(elem);
    if (cs.display === 'none') return;
    if (elem.classList && elem.classList.contains('ann-arrow-node') && elem._ann) {
      // v1.13: Pfeil aus den Daten zeichnen (gedreht um die Mitte, ungedrehte Box = offsetWidth/Height)
      const ra = elem.getBoundingClientRect();
      const a = elem._ann;
      drawArrowCanvas(ctx, arrowKindOf(a), ra.left + ra.width / 2 - ox, ra.top + ra.height / 2 - oy,
        elem.offsetWidth, elem.offsetHeight, Number(a.rot) || 0, annColorCss(annColorKey(a), 'arrow'));
      return;
    }
    const op = parseFloat(cs.opacity);
    if (op === 0) return;
    const r = elem.getBoundingClientRect();
    const x = r.left - ox;
    const y = r.top - oy;
    const w = r.width;
    const h = r.height;
    ctx.save();
    if (op < 1) ctx.globalAlpha *= op;
    const visible = cs.visibility !== 'hidden';
    const radii = cornerRadii(cs, w, h);

    if (visible && w > 0 && h > 0) {
      const bg = cs.backgroundColor;
      const shadow = parseFirstBoxShadow(cs.boxShadow);
      if (!isTransparentColor(bg)) {
        ctx.save();
        if (shadow && !isTransparentColor(shadow.color)) {
          ctx.shadowColor = shadow.color;
          ctx.shadowOffsetX = shadow.x * EXPORT_SHADOW_K;
          ctx.shadowOffsetY = shadow.y * EXPORT_SHADOW_K;
          ctx.shadowBlur = shadow.blur * EXPORT_SHADOW_K;
        }
        ctx.fillStyle = bg;
        ctx.beginPath();
        pathRoundRect(ctx, x, y, w, h, radii);
        ctx.fill();
        ctx.restore();
      }
      if (elem.tagName === 'IMG') drawImageElementToCanvas(ctx, elem, cs, r, ox, oy);
      if ((elem.tagName === 'INPUT' || elem.tagName === 'TEXTAREA') && elem.value) {
        drawFieldValueToCanvas(ctx, elem, cs, x, y, w, h);
      }

      // Rahmen
      const bt = cs.borderTopStyle !== 'none' && cs.borderTopStyle !== 'hidden' ? cssPx(cs.borderTopWidth) : 0;
      const br = cs.borderRightStyle !== 'none' && cs.borderRightStyle !== 'hidden' ? cssPx(cs.borderRightWidth) : 0;
      const bb = cs.borderBottomStyle !== 'none' && cs.borderBottomStyle !== 'hidden' ? cssPx(cs.borderBottomWidth) : 0;
      const bl = cs.borderLeftStyle !== 'none' && cs.borderLeftStyle !== 'hidden' ? cssPx(cs.borderLeftWidth) : 0;
      if (bt || br || bb || bl) {
        const same = bt === br && br === bb && bb === bl &&
          cs.borderTopColor === cs.borderRightColor && cs.borderRightColor === cs.borderBottomColor && cs.borderBottomColor === cs.borderLeftColor;
        if (same) {
          if (!isTransparentColor(cs.borderTopColor)) {
            ctx.fillStyle = cs.borderTopColor;
            ctx.beginPath();
            pathRoundRect(ctx, x, y, w, h, radii);
            pathRoundRect(ctx, x + bl, y + bt, Math.max(0, w - bl - br), Math.max(0, h - bt - bb), insetRadii(radii, bt, br, bb, bl));
            ctx.fill('evenodd');
          }
        } else {
          const side = (c, sx, sy, sw, sh) => {
            if (sw <= 0 || sh <= 0 || isTransparentColor(c)) return;
            ctx.fillStyle = c;
            ctx.fillRect(sx, sy, sw, sh);
          };
          side(cs.borderTopColor, x, y, w, bt);
          side(cs.borderBottomColor, x, y + h - bb, w, bb);
          side(cs.borderLeftColor, x, y, bl, h);
          side(cs.borderRightColor, x + w - br, y, br, h);
        }
      }
    }

    // Clipping für Kinder
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      ctx.beginPath();
      pathRoundRect(ctx, x, y, w, h, radii);
      ctx.clip();
    }

    // Kinder in Stapelreihenfolge (positionierte mit z-index nach hinten sortiert, stabil)
    const kids = [];
    let order = 0;
    for (const child of elem.childNodes) {
      if (child.nodeType === 3) {
        kids.push({ z: 0, o: order++, text: child });
      } else if (child.nodeType === 1) {
        const ccs = getComputedStyle(child);
        const zi = ccs.position !== 'static' && ccs.zIndex !== 'auto' ? parseInt(ccs.zIndex, 10) || 0 : 0;
        kids.push({ z: zi, o: order++, el: child });
      }
    }
    kids.sort((a, b) => (a.z - b.z) || (a.o - b.o));
    for (const k of kids) {
      if (k.text) {
        if (visible) drawTextNodeToCanvas(ctx, k.text, cs, ox, oy);
      } else if (!(k.el instanceof SVGElement) && k.el.tagName !== 'VIDEO' && k.el.tagName !== 'CANVAS') {
        paintElementToCanvas(ctx, k.el, ox, oy);
      }
    }
    ctx.restore();
  }

  let exportHostEl = null;
  function getExportHost() {
    if (exportHostEl && exportHostEl.isConnected) return exportHostEl;
    const host = document.createElement('div');
    host.className = 'export-render-host';
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('inert', '');
    host.style.cssText = 'position:fixed;left:-30000px;top:0;width:' + EXPORT_REF_W + 'px;height:' + EXPORT_REF_H +
      'px;overflow:hidden;pointer-events:none;z-index:-1;display:flex;';
    document.body.appendChild(host);
    exportHostEl = host;
    return host;
  }

  async function waitForImages(root) {
    const imgs = [...root.querySelectorAll('img')].filter((i) => i.getAttribute('src'));
    await Promise.all(imgs.map((img) => {
      if (img.complete && img.naturalWidth) return Promise.resolve();
      if (typeof img.decode === 'function') return img.decode().catch(() => {});
      return new Promise((res) => { img.onload = img.onerror = () => res(); });
    }));
  }

  /** Rendert eine Seite aus ihrem echten DOM-Layout auf ein Canvas (W×H px). */
  async function renderPageViaDom(page, index, outW, outH) {
    const host = getExportHost();
    host.innerHTML = '';
    // Immer die Lesemodus-Ansicht exportieren (Index/Fehleranalyse bauen im Editor Eingabefelder)
    const prevEdit = state.editMode;
    const prevLive = state.liveLeafId;
    let slide;
    try {
      state.editMode = false;
      state.liveLeafId = null;
      slide = renderPageSlide(page, index);
    } finally {
      state.editMode = prevEdit;
      state.liveLeafId = prevLive;
    }
    slide.style.width = EXPORT_REF_W + 'px';
    slide.style.height = EXPORT_REF_H + 'px';
    slide.style.flex = '0 0 ' + EXPORT_REF_W + 'px';
    slide.querySelectorAll('video').forEach((v) => v.remove());
    host.appendChild(slide);
    try {
      await waitForImages(slide);
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (_) {} }
      await new Promise((r) => requestAnimationFrame(() => r()));
      const stage = slide.querySelector('.stage');
      if (!stage) throw new Error('Seite ohne Bühne');
      const sr = stage.getBoundingClientRect();
      if (!sr.width || !sr.height) throw new Error('Seite nicht gerendert');
      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, outW, outH);
      // Bühne proportional (contain) in die Ausgabe einpassen
      const k = Math.min(outW / sr.width, outH / sr.height);
      ctx.translate((outW - sr.width * k) / 2, (outH - sr.height * k) / 2);
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.rect(0, 0, sr.width, sr.height);
      ctx.clip();
      const bodyBg = getComputedStyle(stage).backgroundColor;
      if (!isTransparentColor(bodyBg)) { ctx.fillStyle = bodyBg; ctx.fillRect(0, 0, sr.width, sr.height); }
      paintElementToCanvas(ctx, stage, sr.left, sr.top);
      return canvas;
    } finally {
      host.innerHTML = '';
    }
  }

  async function renderPageToJpegBytes(page, index) {
    const W = ASPECT_W * EXPORT_SCALE;
    const H = ASPECT_H * EXPORT_SCALE;
    let canvas = null;
    try {
      canvas = await renderPageViaDom(page, typeof index === 'number' ? index : state.doc.pages.indexOf(page), W, H);
    } catch (err) {
      console.warn('DOM-Export fehlgeschlagen, Canvas-Rückfall', err);
      canvas = null;
    }
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = ASPECT_W;
      canvas.height = ASPECT_H;
      const ctx = canvas.getContext('2d');
      if (isIndexPage(page)) drawIndexPageToCanvas(ctx, page, ASPECT_W, ASPECT_H);
      else if (isFehlerPage(page)) drawFehlerPageToCanvas(ctx, page, ASPECT_W, ASPECT_H);
      else await drawLayoutPageToCanvas(ctx, page, ASPECT_W, ASPECT_H);
    }
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    canvas.width = 0; canvas.height = 0; // Speicher auf iPad sofort freigeben
    return dataUrlToUint8(dataUrl);
  }

  function exportChangeLog() {
    closeMenu();
    if (!docOpen) { flash('Kein Projekt geöffnet'); return; }
    openChangeLogModal();
  }

  async function exportPdf() {
    closeMenu();
    if (typeof PDFLib === 'undefined') {
      flash('pdf-lib nicht geladen', 8000);
      return;
    }
    showProgress('PDF wird erstellt…');
    try {
      const { PDFDocument } = PDFLib;
      const pdfDoc = await PDFDocument.create();
      const pageCount = state.doc.pages.length;
      for (let i = 0; i < pageCount; i++) {
        el.progressMessage.textContent = 'PDF Seite ' + (i + 1) + ' / ' + pageCount + '…';
        const jpegBytes = await renderPageToJpegBytes(state.doc.pages[i], i);
        const image = await pdfDoc.embedJpg(jpegBytes);
        const pdfPage = pdfDoc.addPage([ASPECT_W, ASPECT_H]);
        pdfPage.drawImage(image, {
          x: 0,
          y: 0,
          width: ASPECT_W,
          height: ASPECT_H,
        });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: PDF_MIME });
      hideProgress();
      const fname = 'Anweisungen.pdf';
      try {
        await downloadBlob(fname, blob, {
          preferFilePicker: false,
          types: pdfPickerTypes(),
        });
        flash('PDF exportiert: ' + fname);
      } catch (e) {
        const msg = e && e.message ? e.message : 'PDF-Export fehlgeschlagen';
        flash(msg, msg === 'Speichern abgebrochen' ? 2500 : 8000);
      }
    } catch (e) {
      hideProgress();
      console.error('PDF Export', e);
      flash('PDF-Export fehlgeschlagen', 8000);
    }
  }

  let flashTimer = null;
  function positionStatusFlash() {
    if (!el.statusFlash) return;
    const bar = document.querySelector('.topbar');
    let top = 56;
    const atBottom = isChromeBarBottom();
    if (bar) {
      if (atBottom) {
        /* Über der unteren Chrome-Leiste */
        let topEdge = window.innerHeight;
        bar.querySelectorAll('.btn, .title').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) topEdge = Math.min(topEdge, r.top);
        });
        if (topEdge >= window.innerHeight) topEdge = bar.getBoundingClientRect().top;
        top = Math.max(8, Math.round(topEdge - 40));
      } else {
        /* Unterkante der sichtbaren Toolbar-Buttons (Topbar = solide Chrome-Leiste) */
        let bottom = 0;
        bar.querySelectorAll('.btn, .title, .page-indicator').forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
        });
        if (!bottom) bottom = bar.getBoundingClientRect().bottom;
        top = Math.round(bottom + 8);
      }
    }
    /* Bei offenem Overlay (Stückliste, Übersicht, Dialog) unten statt über dessen Kopfzeile */
    const overlayOpen = (el.beakPdfLightbox && !el.beakPdfLightbox.hidden) ||
      (typeof isOverviewOpen === 'function' && isOverviewOpen()) ||
      (el.hinweisBackdrop && !el.hinweisBackdrop.hidden) ||
      (el.deviceNicknameBackdrop && !el.deviceNicknameBackdrop.hidden) ||
      (el.confirmBackdrop && !el.confirmBackdrop.hidden);
    if (overlayOpen) top = Math.max(top, window.innerHeight - 64);
    el.statusFlash.style.top = top + 'px';
  }
  function flash(msg, durationMs, kind) {
    if (!el.statusFlash) return;
    positionStatusFlash();
    el.statusFlash.textContent = msg;
    el.statusFlash.classList.toggle('is-error', kind === 'error');
    el.statusFlash.classList.add('show');
    clearTimeout(flashTimer);
    const ms = typeof durationMs === 'number' ? durationMs : 1600;
    flashTimer = setTimeout(() => el.statusFlash.classList.remove('show'), ms);
  }

  el.menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  el.menuBackdrop.addEventListener('click', closeMenu);
  el.pdfExportItem.addEventListener('click', () => {
    if (!docOpen) { flash('Kein Projekt geöffnet'); closeMenu(); return; }
    void exportPdf();
  });
  if (el.changeLogExportItem) el.changeLogExportItem.addEventListener('click', () => { exportChangeLog(); });
  if (el.changeLogCloseBtn) el.changeLogCloseBtn.addEventListener('click', () => closeChangeLogModal());
  if (el.changeLogCopyBtn) el.changeLogCopyBtn.addEventListener('click', () => { void copyChangeLog(); });
  if (el.changeLogDownloadBtn) el.changeLogDownloadBtn.addEventListener('click', () => { void downloadChangeLogFile(); });
  if (el.changeLogBackdrop) {
    el.changeLogBackdrop.addEventListener('click', (e) => {
      if (e.target === el.changeLogBackdrop) closeChangeLogModal();
    });
  }
  if (el.deviceNicknameBtn) {
    el.deviceNicknameBtn.addEventListener('click', () => { openDeviceNicknameModal(); });
  }
  if (el.deviceNicknameCancel) {
    el.deviceNicknameCancel.addEventListener('click', () => closeDeviceNicknameModal());
  }
  if (el.deviceNicknameSave) {
    el.deviceNicknameSave.addEventListener('click', () => saveDeviceNicknameFromModal());
  }
  if (el.deviceNicknameBackdrop) {
    el.deviceNicknameBackdrop.addEventListener('click', (e) => {
      if (e.target === el.deviceNicknameBackdrop) closeDeviceNicknameModal();
    });
  }
  if (el.deviceNicknameInput) {
    el.deviceNicknameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveDeviceNicknameFromModal();
      }
    });
  }
  try { refreshDeviceNicknameHint(); } catch (_) {}
  if (el.editorBtn) {
    el.editorBtn.addEventListener('click', () => setEditMode(true));
  }
  el.fertigBtn.addEventListener('click', () => setEditMode(false));
  /* v1.85: Varianten-Leiste */
  (function bindVariantBar() {
    const add = document.getElementById('variantAddBtn');
    const sw = document.getElementById('variantSwitchBtn');
    const only = document.getElementById('variantOnlyBtn');
    const tog = document.getElementById('variantBarToggle');
    if (add) add.addEventListener('click', () => { void onVariantAddClick(); });
    if (sw) sw.addEventListener('click', () => { void onVariantSwitchClick(); });
    if (only) only.addEventListener('click', () => { void onVariantOnlyClick(); });
    if (tog) tog.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleVariantBarCollapsed();
    });
  })();

  el.ladenBtn.addEventListener('click', () => { void load(); });
  el.sichernBtn.addEventListener('click', () => { void save(); });
  if (el.drawerOpenBtn) el.drawerOpenBtn.addEventListener('click', () => { closeMenu(); void load(); });
  if (el.drawerSaveBtn) el.drawerSaveBtn.addEventListener('click', () => { closeMenu(); void save(); });
  if (el.drawerCloseBtn) el.drawerCloseBtn.addEventListener('click', () => { void closeDocument(); });
  if (el.drawerTourBtn) el.drawerTourBtn.addEventListener('click', () => { openTour(); });
  if (el.welcomeNewBtn) el.welcomeNewBtn.addEventListener('click', () => { void startNewProject(); });
  if (el.welcomeOpenBtn) el.welcomeOpenBtn.addEventListener('click', () => { void load(); });
  if (el.welcomeTourBtn) el.welcomeTourBtn.addEventListener('click', () => { openTour(); });
  /* v1.93: Willkommen-Initialen-Overlay */
  (function bindWelcomeInitials() {
    const inp = el.welcomeInitialsInput || document.getElementById('welcomeInitialsInput');
    const saveBtn = el.welcomeInitialsSaveBtn || document.getElementById('welcomeInitialsSaveBtn');
    if (inp) {
      inp.addEventListener('input', () => {
        const cur = inp.value;
        const next = normalizeInitialsInput(cur);
        if (cur !== next) {
          const pos = inp.selectionStart;
          inp.value = next;
          try { inp.setSelectionRange(Math.min(pos, next.length), Math.min(pos, next.length)); } catch (_) {}
        }
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveWelcomeInitials();
        }
      });
    }
    if (saveBtn) saveBtn.addEventListener('click', () => { saveWelcomeInitials(); });
  })();
  if (el.tourSkipBtn) el.tourSkipBtn.addEventListener('click', () => { closeTour(true); });
  if (el.tourBackBtn) el.tourBackBtn.addEventListener('click', () => { tourBack(); });
  if (el.tourNextBtn) el.tourNextBtn.addEventListener('click', () => { tourNext(); });
  updateDateiMenuState();
  el.addPageBtn.addEventListener('click', addPage);
  el.removePageBtn.addEventListener('click', () => { void removePage(); });
  /** v1.79: Fehlerzeile entfernen (kompakt nachrücken), Embeds auf Quellseiten cascade-löschen. */
  function clearFehlerRowEverywhere(rowId) {
    if (!rowId) return;
    /* Zuerst Quellseite merken (sourcePageId / Embed-Scan), dann Cascade. */
    const fp = getFehlerPage();
    let sourceId = null;
    if (fp && Array.isArray(fp.rows)) {
      const row = fp.rows.find((r) => r && r.id === rowId);
      if (row && typeof row.sourcePageId === 'string' && row.sourcePageId) {
        sourceId = row.sourcePageId;
      }
    }
    if (!sourceId) sourceId = findLayoutPageIdForFehlerRow(rowId);

    /* Cascade: rowId aus allen Layout-fehlerEmbeds entfernen (Quellseite inkl.). */
    for (const p of state.doc.pages) {
      if (!p || isFixedPage(p) || !p.fehlerEmbed) continue;
      const e = normalizeFehlerEmbed(p.fehlerEmbed);
      if (!e) continue;
      const kept = e.rowIds.filter((id) => id !== rowId);
      if (kept.length) p.fehlerEmbed = { rowIds: kept };
      else delete p.fehlerEmbed;
    }
    /* Explizit Quellseite ohne Embed lassen, falls nur sourcePageId gesetzt war. */
    if (sourceId) {
      const sp = state.doc.pages.find((p) => p && p.id === sourceId);
      if (sp && !isFixedPage(sp) && sp.fehlerEmbed) {
        const e = normalizeFehlerEmbed(sp.fehlerEmbed);
        if (!e) delete sp.fehlerEmbed;
        else {
          const kept = e.rowIds.filter((id) => id !== rowId);
          if (kept.length) sp.fehlerEmbed = { rowIds: kept };
          else delete sp.fehlerEmbed;
        }
      }
    }

    /* Kompakt: Zeile entfernen, Rest rückt nach oben; pad füllt leere Slots am Ende. */
    if (fp) {
      if (!Array.isArray(fp.rows)) fp.rows = [];
      fp.rows = fp.rows.filter((r) => !(r && r.id === rowId));
      padFehlerRows(fp);
    }
  }

  /** v1.79: Leere Löcher in der Fehlertabelle schließen (nach Seiten-Löschen o.ä.). */
  function compactFehlerPageRows() {
    const fp = getFehlerPage();
    if (!fp) return;
    if (!Array.isArray(fp.rows)) fp.rows = [];
    const kept = [];
    for (const r of fp.rows) {
      if (!r) continue;
      if (fehlerRowHasContent(r) || r.sourcePageId || findLayoutPageIdForFehlerRow(r.id)) {
        kept.push(r);
      }
    }
    fp.rows = kept;
    padFehlerRows(fp);
  }

  function removeFehlerEmbedRow(layoutPage, rowId) {
    if (!state.editMode) return;
    if (!layoutPage || isFixedPage(layoutPage) || !rowId) return;
    const embed = normalizeFehlerEmbed(layoutPage.fehlerEmbed);
    if (!embed) return;
    clearFehlerRowEverywhere(rowId);
    state.selectedId = null;
    state.selectedSplitId = null;
    renderAll();
    requestAnimationFrame(() => snapToIndex(state.doc.pageIndex, false));
  }

  /** v1.78: Minus auf Fehleranalyse (letzte Seite) – nur Löschen, kein Plus. */
  function removeFehlerPanelRow(rowId) {
    if (!state.editMode) return;
    if (!rowId) return;
    clearFehlerRowEverywhere(rowId);
    state.selectedId = null;
    state.selectedSplitId = null;
    renderAll();
    requestAnimationFrame(() => snapToIndex(state.doc.pageIndex, false));
  }

  function addFehlerEntry() {
    if (!state.editMode) {
      flash('Bitte zuerst Editor öffnen');
      return;
    }
    const cur = currentPage();
    if (!cur || isFixedPage(cur)) {
      flash('Fehler nur auf Layout-Seiten hinzufügen');
      return;
    }
    stopLiveCamera();
    const keepId = cur.id;
    const keepIndex = state.doc.pageIndex;
    state.doc.pages = ensureBookends(state.doc.pages);
    let layoutPage = state.doc.pages.find((p) => p && p.id === keepId);
    if (!layoutPage || isFixedPage(layoutPage)) {
      flash('Fehler nur auf Layout-Seiten hinzufügen');
      return;
    }
    const fp = getFehlerPage();
    if (!fp) {
      flash('Fehleranalyse nicht gefunden');
      return;
    }
    padFehlerRows(fp);
    let target = -1;
    for (let i = 0; i < fp.rows.length; i++) {
      if (!fehlerRowHasContent(fp.rows[i])) {
        target = i;
        break;
      }
    }
    if (target < 0) {
      flash('Fehleranalyse ist voll (25 Einträge)');
      return;
    }
    const row = fp.rows[target];
    row.date = todayDDMMYY();
    row.sourcePageId = layoutPage.id;
    if (!layoutPage.fehlerEmbed || !Array.isArray(layoutPage.fehlerEmbed.rowIds)) {
      layoutPage.fehlerEmbed = { rowIds: [] };
    }
    if (layoutPage.fehlerEmbed.rowIds.indexOf(row.id) < 0) {
      layoutPage.fehlerEmbed.rowIds.push(row.id);
    }
    state.selectedId = null;
    state.selectedSplitId = null;
    state.doc.pageIndex = clamp(keepIndex, 0, state.doc.pages.length - 1);
    renderAll();
    requestAnimationFrame(() => {
      snapToIndex(state.doc.pageIndex, false);
      requestAnimationFrame(() => {
        const sel =
          '.page-slide[data-page-index="' + state.doc.pageIndex + '"] ' +
          '.fehler-embed .fehler-row[data-row-id="' + row.id + '"] .fehler-description';
        const input = el.pageTrack.querySelector(sel);
        if (input) {
          try {
            input.focus();
            if (typeof input.select === 'function') input.select();
          } catch (_) {}
        }
      });
    });
  }

  if (el.fehlerBtn) {
    el.fehlerBtn.addEventListener('click', () => {
      addFehlerEntry();
    });
  }
  const overviewBtnEdit = document.getElementById('overviewBtnEdit');
  if (overviewBtnEdit) {
    overviewBtnEdit.addEventListener('click', () => { void openOverview(); });
  }
    if (el.overviewBtn) {
    el.overviewBtn.addEventListener('click', () => { void openOverview(); });
  }
  if (el.firstPageBtn) {
    el.firstPageBtn.addEventListener('click', () => {
      /* v1.89: erste Nav-Seite = Varianten (page 1) */
      const nav = getNavPages();
      if (!nav.length) return;
      const first = state.doc.pages.indexOf(nav[0]);
      if (first >= 0 && state.doc.pageIndex !== first) goToPage(first);
      updateChromeForPage();
    });
  }
  if (el.indexPageBtn) {
    el.indexPageBtn.addEventListener('click', () => {
      /* v1.89: Index = Arbeitsschritte-Tabelle */
      const idx = (state.doc.pages || []).findIndex((pg) => isIndexPage(pg));
      if (idx < 0) return;
      if (state.doc.pageIndex !== idx) goToPage(idx);
      updateChromeForPage();
    });
  }
  if (el.lastPageBtn) {
    el.lastPageBtn.addEventListener('click', () => {
      const nav = getNavPages();
      if (!nav.length) return;
      const last = state.doc.pages.indexOf(nav[nav.length - 1]);
      if (last >= 0 && state.doc.pageIndex !== last) goToPage(last);
      updateChromeForPage();
    });
  }
  if (el.overviewCloseBtn) {
    el.overviewCloseBtn.addEventListener('click', closeOverview);
  }
  if (el.overviewBackdrop) {
    el.overviewBackdrop.addEventListener('click', (e) => {
      if (e.target === el.overviewBackdrop) closeOverview();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOverviewOpen()) {
      e.preventDefault();
      closeOverview();
    }
  });

  /* v1.67: Cmd/Ctrl+C / Cmd/Ctrl+V – Objekt-Zwischenablage (nicht in Textfeldern) */
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    if (isTypingTarget(e.target) || isBlockingOverlayOpen()) return;
    if (!state.editMode) return;
    const k = (e.key || '').toLowerCase();
    if (k === 'c') {
      if (copySelectedAnnotation()) e.preventDefault();
    } else if (k === 'v') {
      if (pasteAnnotationFromClipboard(null, null)) e.preventDefault();
    }
  });

  /* Page navigation: → next, ← previous — v1.89: über getNavPages() wie Wischen
     v1.91/v2.05: Viewer auf Varianten-Seite keine Pfeile; Editor erlaubt. */
  window.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target) || isBlockingOverlayOpen()) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (isWelcomeOpen && isWelcomeOpen()) return;
    if (variantenPageExitLocked()) return;
    const nav = getNavPages();
    if (!nav.length) return;
    const navIdx = navIndexOfPageIndex(state.doc.pageIndex);
    if (e.key === 'ArrowRight') {
      if (navIdx >= nav.length - 1) return;
      e.preventDefault();
      goToPage(realIndexFromNavIndex(navIdx + 1));
    } else {
      if (navIdx <= 0) return;
      e.preventDefault();
      goToPage(realIndexFromNavIndex(navIdx - 1));
    }
  });
  el.photoMoveBtn.addEventListener('click', () => {
    if (isFixedPage(currentPage())) return;
    setPhotoMoveMode(!state.photoMoveMode);
  });
  if (el.photoRotateBtn) {
    el.photoRotateBtn.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      setPhotoRotateMode(!state.photoRotateMode);
    });
  }
  if (el.teleportBtn) {
    el.teleportBtn.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      setTeleportMode(!state.teleportMode);
    });
  }

  if (el.toolHighlight) {
    el.toolHighlight.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      togglePageHighlight();
    });
  }
  if (el.copyPasteActionBtn) {
    el.copyPasteActionBtn.addEventListener('click', onCopyPasteActionClick);
    el.copyPasteActionBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  }
  el.toolRect.addEventListener('click', () => {
    if (isFixedPage(currentPage())) return;
    toggleAnnTool('rect');
  });
  el.toolCircle.addEventListener('click', () => {
    if (isFixedPage(currentPage())) return;
    toggleAnnTool('ellipse');
  });
  if (el.toolArrow) {
    el.toolArrow.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      toggleAnnTool('arrow');
    });
  }
  el.toolText.addEventListener('click', () => {
    if (isFixedPage(currentPage())) return;
    toggleAnnTool('text');
  });
  if (el.toolTextSm) {
    el.toolTextSm.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      toggleAnnTool('textSm');
    });
  }
  if (el.toolButton) {
    el.toolButton.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      toggleAnnTool('button');
    });
  }
  if (el.toolInfo) {
    el.toolInfo.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      toggleAnnTool('info');
    });
  }
  if (el.toolBeakNr) {
    el.toolBeakNr.addEventListener('click', () => {
      if (isFixedPage(currentPage())) return;
      toggleAnnTool('beakNr');
    });
  }

  if (el.toolPhotoClipboard) {
    el.toolPhotoClipboard.addEventListener('click', () => {
      toggleAnnTool('photoClipboard');
    });
  }

  el.toolSplitV.addEventListener('click', () => {
    if (!state.editMode || isFixedPage(currentPage())) return;
    setSplitTool(state.splitTool === 'v' ? null : 'v');
  });
  el.toolSplitH.addEventListener('click', () => {
    if (!state.editMode || isFixedPage(currentPage())) return;
    setSplitTool(state.splitTool === 'h' ? null : 'h');
  });

  window.addEventListener('pointermove', onPointerMove);
  /* v1.17: Toolbar nach dem Wischen wieder einblenden, sobald die Maus bewegt wird (nicht bei Touch/Stift) */
  let lastMouseXY = null;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    if (isWelcomeOpen()) return; /* v1.65: Willkommen → kein Chrome bei Mausbewegung */
    const prev = lastMouseXY;
    lastMouseXY = [e.clientX, e.clientY];
    if (!prev || trackDrag || e.buttons) return;
    const moved = Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]) >= 3;
    if (!moved) return;
    if (el.app.classList.contains('chrome-hidden')) {
      showChrome(); /* v1.17 + v1.49: einblenden → Idle-Timer neu */
    } else {
      noteViewerChromeActivity(); /* v1.49: Idle zurücksetzen */
    }
  }, { passive: true });
  /* v1.49: Tip/Touch auf sichtbare Chrome-Controls setzt Idle-Timer zurück */
  window.addEventListener('pointerdown', () => { noteViewerChromeActivity(); }, { passive: true });
  document.addEventListener('pointerdown', onArrowSecondPointerDown, true);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  el.pageViewport.addEventListener('pointerdown', onViewportPointerDown);
  el.pageViewport.addEventListener('pointermove', onViewportPointerMove);
  el.pageViewport.addEventListener('pointerup', onViewportPointerUp);
  el.pageViewport.addEventListener('pointercancel', (e) => {
    if (trackDrag && trackDrag.pointerId === e.pointerId) {
      trackDrag = null;
      snapToIndex(state.doc.pageIndex, true);
    }
  });
  el.pageTrack.addEventListener('transitionend', onTrackTransitionEnd);

  /* v2.13: iOS-Absicherung für Kamera/Fotos/Auslösen/Abbrechen.
     Auf echten iOS-Geräten (iPad + iPhone, WebKit/Safari 26+) kam der click nicht
     mehr am Button an (Pointer-Capture-Retargeting). Primär-Fix: kein frühes Capture
     auf diesen Buttons (onViewportPointerDown). Zusätzlich: kurzer Tap (< 12 px) auf
     einen Kamera-Button ohne nachfolgenden click → Button nach 450 ms selbst auslösen;
     ein verspäteter echter click wird dann verworfen (kein Doppel-Auslösen). */
  const CAM_BTN_SEL = '.cell-kamera-wrap .cell-cam-seg-btn, .cell-kamera-wrap .cell-cam-cancel';
  let camTap = null;
  let camClickSeenAt = 0;
  let camSuppressUntil = 0;
  document.addEventListener('pointerdown', (e) => {
    const t = e.target;
    const b = t && t.closest ? t.closest(CAM_BTN_SEL) : null;
    camTap = b ? { btn: b, id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() } : null;
  }, true);
  document.addEventListener('pointercancel', (e) => {
    if (camTap && camTap.id === e.pointerId) camTap = null;
  }, true);
  document.addEventListener('pointerup', (e) => {
    const tap = camTap;
    camTap = null;
    if (!tap || tap.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) >= 12) return;
    const upAt = performance.now();
    if (upAt - tap.t > 1000) return;
    setTimeout(() => {
      if (camClickSeenAt >= upAt) return; /* normaler click ist angekommen */
      if (trackDragDidPageSwipe) return;
      let btn = tap.btn;
      if (!btn || !btn.isConnected) {
        const hit = document.elementFromPoint(tap.x, tap.y);
        btn = hit && hit.closest ? hit.closest(CAM_BTN_SEL) : null;
      }
      if (!btn || !btn.isConnected) return;
      camSuppressUntil = performance.now() + 700;
      try { btn.click(); } catch (_) {}
    }, 450);
  }, true);
  document.addEventListener('click', (e) => {
    const t = e.target;
    const b = t && t.closest ? t.closest(CAM_BTN_SEL) : null;
    if (!b) return;
    if (e.isTrusted && performance.now() < camSuppressUntil) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    camClickSeenAt = performance.now();
  }, true);
  /* v1.81: Highlight-Fotofeld per Tap (auch wenn kein Seiten-Drag startete) */
  el.pageTrack.addEventListener('click', (e) => {
    if (!state.editMode) return;
    if (trackDragDidPageSwipe) return;
    try { trySetHighlightLeafFromTarget(e.target); } catch (_) {}
  });

  if (el.libraryFile) el.libraryFile.addEventListener('change', onFileChosen);
  el.cameraFile.addEventListener('change', onFileChosen);
  if (el.projectFile) el.projectFile.addEventListener('change', onProjectFileChosen);
  configureProjectFileInput();

  /* v1.10: Farbleiste (Rechteck/Kreis/Text) */
  if (el.annArrowBar) {
    el.annArrowBar.querySelectorAll('.ann-arrow-kind').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); onAnnArrowKind(b.dataset.kind); });
    });
  }
  if (el.annColorBar) {
    el.annColorBar.querySelectorAll('.ann-color-swatch').forEach((b) => {
      // Fokus/Textbearbeitung nicht verlieren
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', (e) => { e.stopPropagation(); onAnnColorSwatch(b.dataset.color); });
    });
    window.addEventListener('resize', scheduleAnnColorBar);
  }

  /* v1.10: PDF-Button rechts neben „Öffnen“ (früher „Laden“) → Stückliste-Ansicht (beide Modi) */
  if (el.pdfViewBtn) {
    el.pdfViewBtn.addEventListener('click', () => {
      const has = !!(state.stueckliste && state.stueckliste.dataUrl);
      if (has) { void openBeakPdfViewer(); return; }
      void showConfirm(
        stuecklisteAddPromptMessage(),
        {
          okLabel: 'PDF hinzufügen',
          cancelLabel: 'Schließen',
          okPrimary: true,
          onOk: () => {
            if (!el.stuecklisteFile) return;
            el.stuecklisteFile.value = '';
            el.stuecklisteFile.click();
          },
        }
      );
    });
  }

  if (el.stuecklisteAddBtn && el.stuecklisteFile) {
    el.stuecklisteAddBtn.addEventListener('click', () => {
      closeMenu();
      const openPicker = () => {
        el.stuecklisteFile.value = '';
        el.stuecklisteFile.click();
      };
      /* v1.90: bei mehreren Varianten zuerst Hinweis mit Varianten-Namen */
      if (hasMultipleVariants() && state.activeVariantId) {
        void showConfirm(stuecklisteAddPromptMessage(), {
          okLabel: 'PDF hinzufügen',
          cancelLabel: 'Abbrechen',
          okPrimary: true,
          onOk: openPicker,
        });
      } else {
        openPicker();
      }
    });
    el.stuecklisteFile.addEventListener('change', () => {
      const f = el.stuecklisteFile.files && el.stuecklisteFile.files[0];
      el.stuecklisteFile.value = '';
      if (!f) return;
      void setStuecklisteFromFile(f).catch((err) => {
        console.error(err);
        flash('Stückliste konnte nicht geladen werden', 5000);
      });
    });
  }
  if (el.stuecklisteShowBtn) {
    el.stuecklisteShowBtn.addEventListener('click', () => {
      closeMenu();
      void openBeakPdfViewer();
    });
  }
  if (el.beakPdfLightbox) {
    el.beakPdfLightbox.addEventListener('click', (e) => {
      if (e.target === el.beakPdfLightbox) {
        e.preventDefault();
        closeBeakPdfViewer();
      }
    });
    if (el.beakPdfFrame) {
      el.beakPdfFrame.addEventListener('click', (e) => e.stopPropagation());
    }
    const bindBtn = (id, fn) => {
      const b = document.getElementById(id);
      if (b) b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    };
    bindBtn('beakPdfCloseBtn', closeBeakPdfViewer);
    bindBtn('laufzettelCloseBtn', onLaufzettelChromeClose);
    bindBtn('laufzettelHomeBtn', onLaufzettelChromeHome);
    window.addEventListener('message', handleGeraeteLaufzettelMessage);
    if (el.laufzettelLightbox) {
      el.laufzettelLightbox.addEventListener('click', (e) => {
        if (e.target === el.laufzettelLightbox) onLaufzettelChromeClose();
      });
    }

    bindBtn('beakPdfZoomIn', () => changeBeakPdfZoom(1));
    bindBtn('beakPdfZoomOut', () => changeBeakPdfZoom(-1));
  }
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (el.deviceNicknameBackdrop && !el.deviceNicknameBackdrop.hidden) {
      e.preventDefault();
      closeDeviceNicknameModal();
      return;
    }
    if (el.hinweisBackdrop && !el.hinweisBackdrop.hidden) {
      e.preventDefault();
      el.hinweisBackdrop.hidden = true;
      return;
    }
    if (el.beakPdfLightbox && !el.beakPdfLightbox.hidden) {
      e.preventDefault();
      closeBeakPdfViewer();
    }
  });
  updateStuecklisteUi();

  /* v1.12: Drag & Drop, Mausrad-/Trackpad-Zoom */
  document.addEventListener('dragover', onDocDragOver, { passive: false });
  document.addEventListener('dragenter', onDocDragOver, { passive: false });
  document.addEventListener('dragleave', onDocDragLeave);
  document.addEventListener('drop', onDocDrop, { passive: false });
  document.addEventListener('dragend', () => setDropHighlight(null));
  if (el.pageViewport) {
    el.pageViewport.addEventListener('wheel', onViewportWheel, { passive: false });
    el.pageViewport.addEventListener('pointermove', onPhotoHoverMove, { passive: true });
  }
  document.addEventListener('gesturestart', onGestureStart, { passive: false });
  document.addEventListener('gesturechange', onGestureChange, { passive: false });
  document.addEventListener('gestureend', onGestureEnd, { passive: false });
  window.addEventListener('keydown', onPhotoZoomKey);
  window.addEventListener('keydown', onDeleteKey);
  /* v1.13: Rückgängig / Wiederholen */
  window.addEventListener('keydown', onUndoKey);
  document.getElementById('undoBtn').addEventListener('click', (e) => { e.stopPropagation(); undo(); });
  document.getElementById('redoBtn').addEventListener('click', (e) => { e.stopPropagation(); redo(); });
  window.addEventListener('pointerup', () => scheduleHistoryCheck(60));
  window.addEventListener('pointercancel', () => scheduleHistoryCheck(60));
  window.addEventListener('click', (e) => {
    if (state.editMode) queueChangeLogLabel(changeLogLabelForTarget(e.target));
    scheduleHistoryCheck(60);
  });
  document.addEventListener('input', (e) => {
    if (state.editMode) queueChangeLogLabel('Text geändert');
    scheduleHistoryCheck(700);
  }, true);
  document.addEventListener('change', (e) => {
    if (state.editMode) queueChangeLogLabel(changeLogLabelForTarget(e.target) || 'Projekt geändert');
    scheduleHistoryCheck(60);
  }, true);
  document.addEventListener('focusout', () => scheduleHistoryCheck(60), true);
  document.addEventListener('drop', () => {
    if (state.editMode) queueChangeLogLabel('Bild hinzugefügt');
    scheduleHistoryCheck(400);
  });
  window.addEventListener('keyup', (e) => { if (!e.ctrlKey && !e.metaKey) scheduleHistoryCheck(700); });
  if (el.pageViewport) el.pageViewport.addEventListener('wheel', () => scheduleHistoryCheck(450), { passive: true });
  historyReset();

  let viewportRecoverTimer = null;
  let kbAvoidY = 0;
  let kbAvoidClearTimer = null;

  /* v1.9: Die Seitenbahn wird per transform bewegt; ein natives Scrollen des
     overflow:hidden-Containers (z. B. durch Fokus/scrollIntoView) verschob die Seite
     seitlich (schwarzer Rand). Scroll-Offsets immer auf 0 halten. */
  function resetPageScrollOffsets() {
    const portrait = document.documentElement.classList.contains('orient-portrait');
    for (const n of [el.pageViewport, el.pageArea, el.app]) {
      if (!n) continue;
      if (n.scrollLeft) n.scrollLeft = 0;
      /* v1.83: Hochformat = vertikaler Seitenstapel – scrollTop nicht killen */
      if (!portrait && n.scrollTop) n.scrollTop = 0;
    }
  }
  [el.pageViewport, el.pageArea, el.app].forEach((n) => {
    if (n) n.addEventListener('scroll', resetPageScrollOffsets, { passive: true });
  });
  /* v2.08: Hochformat-Scroll → pageIndex nachführen (für Drehung zurück ins Querformat) */
  if (el.pageViewport) {
    el.pageViewport.addEventListener('scroll', () => {
      try { schedulePortraitScrollPageSync(); } catch (_) {}
    }, { passive: true });
  }

  /* v1.23: Tastatur-Ausweich – translateY auf #pageViewport via visualViewport.
     Kein scrollIntoView (bricht horizontale Seitenbahn). Kein sticky Transform auf .app/html/body. */
  function applyKbAvoid() {
    if (!el.pageViewport) return;
    if (kbAvoidY > 0) {
      el.pageViewport.style.transform = 'translateY(' + (-kbAvoidY) + 'px)';
      el.pageViewport.style.willChange = 'transform';
    } else {
      el.pageViewport.style.transform = '';
      el.pageViewport.style.willChange = '';
    }
  }

  function clearKbAvoid() {
    kbAvoidY = 0;
    applyKbAvoid();
  }

  function updateKbAvoid() {
    if (!isTypingTarget(document.activeElement)) {
      clearKbAvoid();
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const keyboardLikelyOpen = isAppleTouchDevice() || (vv.height < window.innerHeight - 80);
    if (!keyboardLikelyOpen && vv.offsetTop < 1) {
      clearKbAvoid();
      return;
    }
    const visibleBottom = vv.offsetTop + vv.height;
    const r = document.activeElement.getBoundingClientRect();
    const overlap = r.bottom + 16 - visibleBottom;
    if (overlap > 0) {
      kbAvoidY += overlap;
      const cap = Math.max(0, Math.min(window.innerHeight - 80, vv.height || (window.innerHeight - 80)));
      if (kbAvoidY > cap) kbAvoidY = cap;
    } else if (overlap < -48 && keyboardLikelyOpen && kbAvoidY > 0) {
      kbAvoidY = Math.max(0, kbAvoidY + overlap + 48);
    }
    applyKbAvoid();
  }

  function recoverViewportFromKeyboard() {
    resetPageScrollOffsets();
    try { window.scrollTo(0, 0); } catch (_) {}
    try {
      document.documentElement.scrollTop = 0;
      document.documentElement.scrollLeft = 0;
      document.body.scrollTop = 0;
      document.body.scrollLeft = 0;
    } catch (_) {}
    try {
      if (document.documentElement.style.transform) document.documentElement.style.transform = '';
      if (document.body.style.transform) document.body.style.transform = '';
      const appRoot = el.app;
      if (appRoot && appRoot.style.transform && appRoot.style.transform !== 'none') {
        appRoot.style.transform = '';
      }
    } catch (_) {}
    /* v2.08: nach Viewport-Recover Seite je Orientierung wiederherstellen */
    try { restorePagePositionForOrientation(); } catch (_) {
      applyTrackTransform(baseOffsetForIndex(state.doc.pageIndex), false);
    }
    /* v1.23: pageViewport-kb-avoid nicht löschen solange noch getippt wird */
    if (isTypingTarget(document.activeElement)) {
      updateKbAvoid();
    }
  }

  function scheduleViewportRecover() {
    recoverViewportFromKeyboard();
    if (viewportRecoverTimer) clearTimeout(viewportRecoverTimer);
    viewportRecoverTimer = setTimeout(() => {
      recoverViewportFromKeyboard();
      viewportRecoverTimer = setTimeout(recoverViewportFromKeyboard, 280);
    }, 50);
  }

  function onVisualViewportChange() {
    const vv = window.visualViewport;
    if (!vv) {
      scheduleViewportRecover();
      return;
    }
    if (isTypingTarget(document.activeElement)) {
      updateKbAvoid();
      return;
    }
    if (vv.offsetTop < 1 && vv.height >= window.innerHeight - 40) {
      clearKbAvoid();
      scheduleViewportRecover();
    } else if (vv.offsetTop < 1 && vv.offsetLeft < 1) {
      clearKbAvoid();
      scheduleViewportRecover();
    } else {
      applyTrackTransform(baseOffsetForIndex(state.doc.pageIndex), false);
    }
  }

  window.addEventListener('resize', () => {
    recoverViewportFromKeyboard();
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onVisualViewportChange);
    window.visualViewport.addEventListener('scroll', onVisualViewportChange);
  }

  document.addEventListener('focusin', (e) => {
    if (!isTypingTarget(e.target)) return;
    if (kbAvoidClearTimer) {
      clearTimeout(kbAvoidClearTimer);
      kbAvoidClearTimer = null;
    }
    setTimeout(updateKbAvoid, 50);
    setTimeout(updateKbAvoid, 300);
  }, true);

  document.addEventListener('focusout', (e) => {
    const t = e.target;
    if (!t) return;
    const isField = t.classList && (t.classList.contains('ann-text') || t.classList.contains('ann-beak-text') || t.classList.contains('ann-button-label') || t.classList.contains('ann-button-target') || t.classList.contains('info-popup-body') || t.classList.contains('info-popup-panel') || t.classList.contains('index-text') || t.classList.contains('index-target') || t.classList.contains('index-header-title') || t.classList.contains('fehler-cell'));
    if (!isField && !isTypingTarget(t)) return;
    if (kbAvoidClearTimer) clearTimeout(kbAvoidClearTimer);
    kbAvoidClearTimer = setTimeout(() => {
      kbAvoidClearTimer = null;
      if (isTypingTarget(document.activeElement)) return;
      clearKbAvoid();
      if (isField) scheduleViewportRecover();
    }, 300);
  });

  /* ---- Vollbild (v1.9): Fullscreen API mit webkit-Präfix (iPadOS Safari) ---- */
  const fullscreenBtn = document.getElementById('fullscreenBtn');
  const fullscreenMenuItem = document.getElementById('fullscreenMenuItem');

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
  }

  function fullscreenApiAvailable() {
    const de = document.documentElement;
    if (!(de.requestFullscreen || de.webkitRequestFullscreen)) return false;
    if (document.fullscreenEnabled === false) return false;
    if (document.fullscreenEnabled === undefined && document.webkitFullscreenEnabled === false) return false;
    return true;
  }

  /** Home-Bildschirm-App: dort wirkt die Fullscreen API nicht → Button ausblenden. */
  function isStandaloneApp() {
    try { if (window.navigator.standalone === true) return true; } catch (_) {}
    try {
      if (window.matchMedia('(display-mode: standalone)').matches) return true;
      if (!fullscreenElement() && window.matchMedia('(display-mode: fullscreen)').matches) return true;
    } catch (_) {}
    return false;
  }

  function updateFullscreenUi() {
    const avail = fullscreenApiAvailable() && !isStandaloneApp();
    const on = !!fullscreenElement();
    el.app.classList.toggle('is-fullscreen', on);
    document.documentElement.classList.toggle('is-fullscreen', on);
    for (const b of [fullscreenBtn, fullscreenMenuItem]) {
      if (!b) continue;
      b.hidden = !avail;
      b.classList.toggle('is-active', on);
      b.title = on ? 'Vollbild beenden' : 'Vollbild';
      b.setAttribute('aria-label', on ? 'Vollbild beenden' : 'Vollbild');
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const lbl = fullscreenMenuItem && fullscreenMenuItem.querySelector('.fullscreen-menu-label');
    if (lbl) lbl.textContent = on ? 'Vollbild beenden' : 'Vollbild';
  }

  async function toggleFullscreen() {
    try {
      if (fullscreenElement()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.webkitCancelFullScreen) document.webkitCancelFullScreen();
      } else {
        const de = document.documentElement;
        if (de.requestFullscreen) await de.requestFullscreen({ navigationUI: 'hide' });
        else if (de.webkitRequestFullscreen) de.webkitRequestFullscreen();
      }
    } catch (err) {
      console.warn('Vollbild', err);
      flash('Vollbild ist hier nicht möglich', 3500, 'error');
    }
    setTimeout(updateFullscreenUi, 300);
  }

  let relayoutTimers = [];
  /** Nach Vollbild-Wechsel / Drehung: Seitenbahn neu ausrichten (iOS meldet Größen verzögert). */
  function relayoutAfterViewportChange() {
    relayoutTimers.forEach((t) => clearTimeout(t));
    relayoutTimers = [0, 120, 400, 900].map((ms) => setTimeout(() => {
      recoverViewportFromKeyboard();
      if (el.statusFlash && el.statusFlash.classList.contains('show')) positionStatusFlash();
    }, ms));
  }

  if (fullscreenBtn) fullscreenBtn.addEventListener('click', () => { void toggleFullscreen(); });
  if (fullscreenMenuItem) {
    fullscreenMenuItem.addEventListener('click', () => {
      closeMenu();
      void toggleFullscreen();
    });
  }
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => {
    document.addEventListener(ev, () => {
      updateFullscreenUi();
      relayoutAfterViewportChange();
    });
  });
  window.addEventListener('orientationchange', relayoutAfterViewportChange);
  window.addEventListener('resize', relayoutAfterViewportChange);
  // v1.17: Seitenmaßstab bei jeder Größenänderung der Seitenfläche nachführen (vor dem Zeichnen)
  window.addEventListener('resize', updatePageScale);
  if (typeof ResizeObserver !== 'undefined' && el.pageViewport) {
    try { new ResizeObserver(() => updatePageScale()).observe(el.pageViewport); } catch (_) {}
  }
  try {
    window.matchMedia('(display-mode: standalone)').addEventListener('change', updateFullscreenUi);
  } catch (_) {}
  updateFullscreenUi();

  /** Browser-Backup ohne Fotos (localStorage-Kontingent ~5 MB überschritten → „slim“)? */
  function countPhotosWithoutData(data) {
    let n = 0;
    const walk = (c) => {
      if (!c || typeof c !== 'object') return;
      if (c.type === 'leaf') {
        if (c.photo && !c.photo.src) n += 1;
        return;
      }
      walk(c.a); walk(c.b);
    };
    for (const pg of (data && data.pages) || []) walk(pg && pg.root);
    return n;
  }

  /* ---- v1.55/v1.56: Willkommen, Tour, Datei → Schließen --------------------------- */
  function isTourDone() {
    try { return localStorage.getItem(TOUR_DONE_KEY) === '1'; } catch (_) { return false; }
  }
  function markTourDone() {
    try { localStorage.setItem(TOUR_DONE_KEY, '1'); } catch (_) {}
  }

  function updateDateiMenuState() {
    const on = !!docOpen;
    if (el.drawerSaveBtn) {
      el.drawerSaveBtn.disabled = !on;
      el.drawerSaveBtn.setAttribute('aria-disabled', on ? 'false' : 'true');
    }
    if (el.drawerCloseBtn) {
      el.drawerCloseBtn.disabled = !on;
      el.drawerCloseBtn.setAttribute('aria-disabled', on ? 'false' : 'true');
    }
    if (el.sichernBtn) {
      el.sichernBtn.disabled = !on;
      el.sichernBtn.setAttribute('aria-disabled', on ? 'false' : 'true');
    }
  }

  /** v1.93: Willkommen-Initialen-Overlay (localStorage DEVICE_NICK_KEY). */
  function syncWelcomeInitialsOverlay() {
    const overlay = el.welcomeInitialsOverlay || document.getElementById('welcomeInitialsOverlay');
    const actions = el.welcomeActions || document.getElementById('welcomeActions');
    const newBtn = el.welcomeNewBtn;
    const openBtn = el.welcomeOpenBtn;
    const tourBtn = el.welcomeTourBtn;
    const has = !!getStoredDeviceNickname();
    if (overlay) overlay.hidden = has;
    if (actions) actions.classList.toggle('initials-required', !has);
    const disable = !has;
    for (const b of [newBtn, openBtn, tourBtn]) {
      if (!b) continue;
      b.disabled = disable;
      b.setAttribute('aria-disabled', disable ? 'true' : 'false');
    }
    if (!has) {
      const inp = el.welcomeInitialsInput || document.getElementById('welcomeInitialsInput');
      if (inp) {
        try { inp.focus(); } catch (_) {}
      }
    }
  }

  function normalizeInitialsInput(raw) {
    return String(raw == null ? '' : raw)
      .toUpperCase()
      .replace(/[^A-ZÄÖÜß]/g, '')
      .slice(0, 12);
  }

  function saveWelcomeInitials() {
    const inp = el.welcomeInitialsInput || document.getElementById('welcomeInitialsInput');
    const raw = inp ? inp.value : '';
    const cleaned = normalizeInitialsInput(raw);
    if (!cleaned) {
      flash('Bitte Initialen eintragen.', 2500, 'error');
      if (inp) try { inp.focus(); } catch (_) {}
      return false;
    }
    if (inp) inp.value = cleaned;
    setStoredDeviceNickname(cleaned);
    refreshDeviceNicknameHint();
    syncWelcomeInitialsOverlay();
    flash('Initialen: ' + cleaned);
    return true;
  }

  function showWelcomeScreen() {
    docOpen = false;
    if (el.app) el.app.classList.add('welcome-open');
    if (el.welcomeScreen) el.welcomeScreen.hidden = false;
    /* v1.65: Top-Chrome komplett aus – auch Idle-/Maus-Einblendung sperren */
    clearChromeIdleTimer();
    try { el.app && el.app.classList.add('chrome-hidden'); } catch (_) {}
    updateDateiMenuState();
    try { scheduleViewerChromeCompact(); } catch (_) {}
    try { syncWelcomeInitialsOverlay(); } catch (_) {}
  }

  function hideWelcomeScreen() {
    if (el.welcomeScreen) el.welcomeScreen.hidden = true;
    if (el.app) el.app.classList.remove('welcome-open');
    try { scheduleViewerChromeCompact(); } catch (_) {}
  }

  function enterOpenDocument(opts) {
    const o = opts || {};
    docOpen = true;
    hideWelcomeScreen();
    updateDateiMenuState();
    if (o.clearDirty) sessionDirty = false;
    if (o.hideChrome) {
      try { hideViewerChrome(); } catch (_) {}
    }
  }

  async function idbClearCurrent() {
    try {
      const db = await idbOpen();
      let keys = [];
      try {
        keys = await idbReq(db.transaction('blobs', 'readonly').objectStore('blobs').getAllKeys()) || [];
      } catch (_) { keys = []; }
      const tx = db.transaction(['meta', 'blobs'], 'readwrite');
      const done = idbTxDone(tx);
      try { tx.objectStore('meta').delete('current'); } catch (_) {}
      const bs = tx.objectStore('blobs');
      for (const k of keys) {
        try { bs.delete(k); } catch (_) {}
      }
      await done;
    } catch (err) {
      console.warn('IDB current löschen', err);
    }
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    store.rev = 0;
    store.keyBySrc = new Map();
  }

  function resetToEmptySession() {
    try { stopLiveCamera(); } catch (_) {}
    try { clearPersistedThumbs(); } catch (_) {}
    clearTimeout(store.timer);
    store.timer = 0;
    store.dirty = false;
    store.blocked = false;
    store.failed = false;
    store.pending = false;
    sessionDirty = false;
    projectFileHandle = null;
    loadedSaveFileName = null;
    state.stueckliste = null;
    state.changeLog = [];
    state.beakUsage = {};
    state.selectedId = null;
    state.selectedSplitId = null;
    state.teleportMode = false;
    state.teleportPhoto = null;
    state.teleportSourceId = null;
    state.photoMoveMode = false;
    state.photoRotateMode = false;
    state.annTool = null;
    state.doc = makeDocument();
    try { setEditMode(false); } catch (_) {}
    try { updateStuecklisteUi(); } catch (_) {}
    try { rebuildBeakUsage(); } catch (_) {}
    try { historyReset(); } catch (_) {}
    try {
      if (el.pageTrack) el.pageTrack.innerHTML = '';
    } catch (_) {}
    try { renderAll(); } catch (_) {}
  }

  async function startNewProject() {
    resetToEmptySession();
    enterOpenDocument({ clearDirty: true });
    appendChangeLog('Neues Projekt angelegt', null);
    try { setEditMode(true); } catch (_) {}
    try { renderAll(); } catch (_) {}
    try { historyReset(); } catch (_) {}
    sessionDirty = false;
    quietLocalStorageBackup();
    flash('Neues Projekt');
  }

  async function closeDocument() {
    if (!docOpen) return;
    if (sessionDirty || store.dirty) {
      const ok = await showConfirm(
        'Ungespeicherte Änderungen gehen verloren.\nProjekt wirklich schließen?',
        { okLabel: 'Schließen', cancelLabel: 'Abbrechen', okPrimary: false }
      );
      if (!ok) return;
    }
    closeMenu();
    clearTimeout(store.timer);
    store.timer = 0;
    store.dirty = false;
    sessionDirty = false;
    docOpen = false; /* vor Reset: kein Auto-Persist mehr */
    await idbClearCurrent();
    resetToEmptySession();
    showWelcomeScreen();
    flash('Projekt geschlossen');
  }

  /* ---- v1.56–v1.58: Tour-Sichtbarkeit + Editor auf Layout-Seite + Stückliste ------ */
  const TOUR_STEPS = [
    {
      title: 'Was ist Anweisungen?',
      body: 'Mit Anweisungen erstellen Sie mehrseitige Foto-Arbeitsanweisungen im BEAK-Stil.\nProjekte speichern Sie als .beak-Datei – zum Öffnen, Weitergeben und Sichern.',
    },
    {
      title: 'Datei: Öffnen & Sichern',
      body: 'Öffnen lädt eine .beak-Datei. Sichern schreibt den aktuellen Stand zurück.\nIm Menü ☰ finden Sie oben den Bereich „Datei“ mit Öffnen, Sichern und Schließen.',
      spotlight: '#ladenBtn, #sichernBtn, #menuBtn',
      mode: 'viewer',
    },
    {
      title: 'Viewer: Blättern & Chrome',
      body: 'Im Lesemodus wischen Sie horizontal zwischen den Seiten.\nEin Tip auf freie Fläche blendet die oberen Buttons ein oder aus. „Alle Seiten“ zeigt alle Seiten als Miniaturen.',
      spotlight: '#overviewBtn, #firstPageBtn, #indexPageBtn, #lastPageBtn',
      mode: 'viewer',
    },
    {
      title: 'Editor: Einstieg',
      body: 'Über „Editor“ wechseln Sie in den Bearbeitungsmodus. Rückgängig und Wiederholen korrigieren Schritte.\n„+ Fehler“ legt eine Fehleranalyse-Seite an. Mit „Fertig“ verlassen Sie den Editor wieder in den Lesemodus.',
      spotlight: '#undoBtn, #redoBtn, #fehlerBtn, #fertigBtn',
      mode: 'edit',
    },
    {
      title: 'Formen',
      body: 'Rechteck, Kreis und Pfeil markieren Bereiche auf dem Foto.\nBei aktiver Form erscheint eine Farbleiste; beim Pfeil zusätzlich die Pfeilart (gerade, Kreis, gebogen).',
      spotlight: '#toolRect, #toolCircle, #toolArrow',
      mode: 'edit',
    },
    {
      title: 'Text',
      body: '„Text groß“ und „Text klein“ setzen Beschriftungen auf die Seite.\nNach dem Platzieren tippen Sie in den Text, um ihn zu bearbeiten.',
      spotlight: '#toolText, #toolTextSm',
      mode: 'edit',
    },
    {
      title: 'Seite teilen',
      body: 'Mit Split V (vertikal) und Split H (horizontal) unterteilen Sie eine Seite in mehrere Fotobereiche (Unterteilung).',
      spotlight: '#toolSplitV, #toolSplitH',
      mode: 'edit',
    },
    {
      title: 'Foto-Werkzeuge',
      body: 'Schieben verschiebt das Foto im Rahmen. Drehen dreht um 90°.\nDer Fotozwischenspeicher (magenta gestrichelt) parkt Fotos nur im Editor. Teleport kopiert ein Foto in einen anderen Bereich.',
      spotlight: '#photoMoveBtn, #photoRotateBtn, #toolPhotoClipboard, #teleportBtn',
      mode: 'edit',
    },
    {
      title: 'BEAK-Nr. & Seiten',
      body: '„BEAK-Nr.“ setzt eine Teilenummer zum Abgleich mit der Stückliste.\nSeite löschen, Alle Seiten und Neue Seite verwalten die Seitenfolge. „Fertig“ beendet den Editor.',
      spotlight: '#toolBeakNr, #removePageBtn, #overviewBtnEdit, #addPageBtn, #fertigBtn',
      mode: 'edit',
    },
    {
      title: 'BEAK Stückliste',
      body: 'Die Stückliste ist die Teileliste-PDF, eingebettet in Ihrer .beak-Datei – zum Prüfen gegen Fotos und BEAK-Nummern.\nIm Menü unter „BEAK Stückliste“: Hinzufügen/Aktualisieren bettet die PDF ein oder ersetzt sie; Anzeigen öffnet die eingebettete Liste (auch über den Stückliste-Button in der Leiste).',
      spotlight: '#stuecklisteAddBtn, #stuecklisteShowBtn',
      mode: 'menu',
    },
    {
      title: 'Anzeige: Bildschirmfüllend / Fenster',
      body: 'Im Menü unter „Anzeige“ wählen Sie Bildschirmfüllend (füllt den iPad-Bildschirm) oder Fenster (mit Letterbox).\nDie Einstellung gilt gerätelokal und bleibt erhalten.',
      spotlight: '#menuBtn',
      mode: 'viewer',
    },
    {
      title: 'Tipp: Home-Bildschirm (iPad)',
      body: 'Auf dem iPad: In Safari „Teilen“ → „Zum Home-Bildschirm“ – dann startet Anweisungen wie eine App, auch offline (App-Shell).\nNach Updates das Icon ggf. neu anlegen und den Cache leeren.',
    },
    {
      title: 'Fertig!',
      body: 'Sie können die Tour jederzeit erneut starten: Willkommen → „Tour anzeigen“ oder Menü → Hilfe → Tour anzeigen.\nViel Erfolg mit Ihren Anweisungen!',
    },
  ];

  let tourIndex = 0;
  /* tourActive declared near chrome idle */
  let tourCreatedProject = false;
  let tourPrevEditMode = false;
  let tourSpotlightRaf = 0;

  function isTourTargetVisible(node) {
    if (!node) return false;
    try {
      const st = window.getComputedStyle(node);
      if (!st || st.display === 'none' || st.visibility === 'hidden') return false;
      if (parseFloat(st.opacity || '1') < 0.05) return false;
    } catch (_) { return false; }
    const r = node.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }

  /** Ensure document + chrome so spotlight targets exist (esp. from welcome). */
  function ensureTourDocument() {
    const welcomeVisible = !!(el.welcomeScreen && !el.welcomeScreen.hidden);
    if (!docOpen || welcomeVisible) {
      resetToEmptySession();
      enterOpenDocument({ clearDirty: true });
      try { setEditMode(false); } catch (_) {}
      try { renderAll(); } catch (_) {}
      try { historyReset(); } catch (_) {}
      sessionDirty = false;
      quietLocalStorageBackup();
      tourCreatedProject = true;
    } else {
      tourCreatedProject = false;
      hideWelcomeScreen();
    }
    try { closeOverview(); } catch (_) {}
    try { closeMenu(); } catch (_) {}
    try { setTeleportMode(false); } catch (_) {}
    try { setPhotoMoveMode(false); } catch (_) {}
    try { setPhotoRotateMode(false); } catch (_) {}
    try { setAnnTool(null); } catch (_) {}
    try { setSplitTool(false); } catch (_) {}
    showChrome();
    clearChromeIdleTimer(); /* pause 5s auto-hide for tour duration */
  }

  /**
   * v1.58: Empty/new projects start on Index (page 0). Layout-only tools
   * (.layout-only-tool) stay display:none while .index-page-active /
   * .fehler-page-active. Navigate to first layout page (or insert one)
   * so edit-mode tour spotlights have real targets.
   */
  function ensureTourLayoutPage() {
    if (!state.doc || !Array.isArray(state.doc.pages)) return;
    try { state.doc.pages = ensureBookends(state.doc.pages); } catch (_) {}
    let layoutIdx = -1;
    for (let i = 0; i < state.doc.pages.length; i++) {
      const p = state.doc.pages[i];
      if (p && !isFixedPage(p)) {
        layoutIdx = i;
        break;
      }
    }
    if (layoutIdx < 0) {
      const page = makePage();
      const last = state.doc.pages.length - 1;
      const insertAt = (last >= 0 && isFehlerPage(state.doc.pages[last])) ? last : state.doc.pages.length;
      state.doc.pages.splice(insertAt, 0, page);
      layoutIdx = insertAt;
      state.selectedId = null;
      state.selectedSplitId = null;
      try { renderAll(); } catch (_) {}
    }
    if (state.doc.pageIndex !== layoutIdx) {
      try { snapToIndex(layoutIdx, false); } catch (_) {}
    } else {
      try { updateChromeForPage(); } catch (_) {}
    }
  }

  /** v1.58: If #editTools still hidden/zero-height, force edit-mode + layout page once.
   *  Only when the current tour step expects the editor toolbar (edit mode). */
  function hardenTourEditToolsVisible() {
    if (!tourActive || !state.editMode) return false;
    const tools = document.getElementById('editTools');
    let need = false;
    if (!tools) need = true;
    else {
      try {
        const st = window.getComputedStyle(tools);
        if (!st || st.display === 'none') need = true;
      } catch (_) { need = true; }
      if (!need) {
        const r = tools.getBoundingClientRect();
        if (!(r.height >= 2 && r.width >= 2)) need = true;
      }
      if (!need && !isTourTargetVisible(tools)) need = true;
    }
    if (!need) return false;
    try { ensureTourLayoutPage(); } catch (_) {}
    state.editMode = true;
    try { el.app && el.app.classList.add('edit-mode'); } catch (_) {}
    try { el.app && el.app.classList.remove('chrome-hidden'); } catch (_) {}
    /* Re-evaluate page classes from real page (do not strip blindly if still on index) */
    try { updateChromeForPage(); } catch (_) {}
    /* If still on fixed page after ensure, strip index/fehler active as last resort */
    try {
      const page = currentPage();
      if (page && !isFixedPage(page)) {
        el.app.classList.remove('index-page-active');
        el.app.classList.remove('fehler-page-active');
      }
    } catch (_) {}
    showChrome();
    clearChromeIdleTimer();
    return true;
  }

  function tourStepNeedsLayoutPage(step) {
    if (!step) return false;
    if (step.mode === 'edit') return true;
    const sel = String(step.spotlight || '');
    if (!sel) return false;
    /* Spotlights that only work on layout pages / edit toolbar */
    return /#editTools|#toolRect|#toolCircle|#toolArrow|#toolText|#toolTextSm|#toolSplit|#photoMoveBtn|#photoRotateBtn|#toolPhotoClipboard|#teleportBtn|#toolBeakNr|#removePageBtn|#overviewBtnEdit|#addPageBtn|#fehlerBtn|#undoBtn|#redoBtn|#fertigBtn/i.test(sel);
  }

  function prepareTourStepUi(step) {
    const mode = step && step.mode;
    if (mode === 'edit' || tourStepNeedsLayoutPage(step)) {
      try { closeMenu(); } catch (_) {}
      try { el.app && el.app.classList.remove('tour-menu-open'); } catch (_) {}
      try { ensureTourLayoutPage(); } catch (_) {}
      try { setEditMode(true); } catch (_) {}
      showChrome();
      clearChromeIdleTimer();
      try { hardenTourEditToolsVisible(); } catch (_) {}
    } else if (mode === 'menu') {
      if (state.editMode) {
        try { setEditMode(false); } catch (_) {}
      }
      try { openMenu(); } catch (_) {}
      try { el.app && el.app.classList.add('tour-menu-open'); } catch (_) {}
      try {
        const add = el.stuecklisteAddBtn || document.getElementById('stuecklisteAddBtn');
        if (add && typeof add.scrollIntoView === 'function') add.scrollIntoView({ block: 'nearest' });
      } catch (_) {}
      showChrome();
      clearChromeIdleTimer();
    } else if (mode === 'viewer') {
      try { closeMenu(); } catch (_) {}
      try { el.app && el.app.classList.remove('tour-menu-open'); } catch (_) {}
      if (state.editMode) {
        try { setEditMode(false); } catch (_) {}
      }
      showChrome();
      clearChromeIdleTimer();
    } else {
      try { closeMenu(); } catch (_) {}
      try { el.app && el.app.classList.remove('tour-menu-open'); } catch (_) {}
      showChrome();
      clearChromeIdleTimer();
    }
  }

    function setTourSpotlight(sel) {
    const spot = el.tourSpotlight;
    if (!spot) return;
    spot.classList.remove('on');
    if (!sel) return;
    const nodes = [];
    try {
      for (const part of String(sel).split(',')) {
        const n = document.querySelector(part.trim());
        if (n && isTourTargetVisible(n)) nodes.push(n);
      }
    } catch (_) {}
    if (!nodes.length) return; /* no empty ring – card only */
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const n of nodes) {
      const r = n.getBoundingClientRect();
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    if (!(right > left && bottom > top)) return;
    const pad = 6;
    spot.style.top = Math.max(0, top - pad) + 'px';
    spot.style.left = Math.max(0, left - pad) + 'px';
    spot.style.width = (right - left + pad * 2) + 'px';
    spot.style.height = (bottom - top + pad * 2) + 'px';
    spot.classList.add('on');
  }

  function scheduleTourSpotlight(sel) {
    if (tourSpotlightRaf) {
      try { cancelAnimationFrame(tourSpotlightRaf); } catch (_) {}
      tourSpotlightRaf = 0;
    }
    if (el.tourSpotlight) el.tourSpotlight.classList.remove('on');
    /* double rAF: wait for edit-mode / chrome / page class layout to settle */
    tourSpotlightRaf = requestAnimationFrame(() => {
      tourSpotlightRaf = requestAnimationFrame(() => {
        tourSpotlightRaf = 0;
        if (!tourActive) return;
        try {
          if (hardenTourEditToolsVisible()) {
            /* one more frame after forced layout-page / edit-mode */
            tourSpotlightRaf = requestAnimationFrame(() => {
              tourSpotlightRaf = 0;
              if (!tourActive) return;
              setTourSpotlight(sel || null);
            });
            return;
          }
        } catch (_) {}
        setTourSpotlight(sel || null);
      });
    });
  }

  function renderTourStep() {
    const steps = TOUR_STEPS;
    const i = clamp(tourIndex, 0, steps.length - 1);
    tourIndex = i;
    const step = steps[i];
    prepareTourStepUi(step);
    if (el.tourStepLabel) el.tourStepLabel.textContent = (i + 1) + ' / ' + steps.length;
    if (el.tourTitle) el.tourTitle.textContent = step.title;
    if (el.tourBody) el.tourBody.textContent = step.body;
    if (el.tourBackBtn) el.tourBackBtn.disabled = i <= 0;
    if (el.tourNextBtn) el.tourNextBtn.textContent = (i >= steps.length - 1) ? 'Fertig' : 'Weiter';
    scheduleTourSpotlight(step.spotlight || null);
  }

  function openTour() {
    tourPrevEditMode = !!state.editMode;
    tourActive = true;
    tourIndex = 0;
    ensureTourDocument();
    if (el.tourOverlay) el.tourOverlay.hidden = false;
    renderTourStep();
  }

  function closeTour(done) {
    tourActive = false;
    if (tourSpotlightRaf) {
      try { cancelAnimationFrame(tourSpotlightRaf); } catch (_) {}
      tourSpotlightRaf = 0;
    }
    if (el.tourOverlay) el.tourOverlay.hidden = true;
    if (el.tourSpotlight) el.tourSpotlight.classList.remove('on');
    try { closeMenu(); } catch (_) {}
    try { el.app && el.app.classList.remove('tour-menu-open'); } catch (_) {}
    /* Leave empty project ready to work if tour opened it; else restore prior edit mode. */
    if (tourCreatedProject) {
      try { setEditMode(false); } catch (_) {}
      showChrome();
    } else {
      try { setEditMode(!!tourPrevEditMode); } catch (_) {}
      showChrome();
    }
    /* resume viewer idle hide after tour */
    if (!state.editMode) scheduleChromeIdleHide();
    else clearChromeIdleTimer();
    if (done) markTourDone();
  }

  function tourNext() {
    if (tourIndex >= TOUR_STEPS.length - 1) {
      closeTour(true);
      return;
    }
    tourIndex += 1;
    renderTourStep();
  }

  function tourBack() {
    if (tourIndex <= 0) return;
    tourIndex -= 1;
    renderTourStep();
  }

    /* v1.17: Start – Projektstand aus IndexedDB (mit Fotos + Stückliste), sonst altes localStorage-Backup. */
  function bootFinish(persistAfter) {
    store.booting = false;
    historyReset(); // v1.13: Ausgangsbasis für Rückgängig (löst ggf. Auto-Sicherung aus)
    if (!persistAfter) { clearTimeout(store.timer); store.timer = 0; store.dirty = false; }
  }
  async function bootRestore() {
    /* v1.88: Cold Start immer Willkommen — kein Auto-Öffnen des letzten Projekts.
       IndexedDB-/localStorage-Autosave bleibt für spätere Sitzungen erhalten
       (wird bei Neues Projekt / Öffnen wie bisher überschrieben bzw. genutzt). */
    try {
      state.doc = makeDocument();
      state.stueckliste = null;
      state.variantStuecklisten = {};
      state.activeVariantId = null;
      renderAll();
    } catch (_) {
      try { state.doc = makeDocument(); } catch (_) {}
    }
    showWelcomeScreen();
    bootFinish(false);
  }


  /* v1.48: Letzte Seite pro Dokument – nur gerätelokal (localStorage), nie in .beak/project.json.
     Key: anweisungen-last-page = { [docKey]: pageId }
     docKey: "fn:<normalized .beak name>" (bevorzugt, überlebt erneutes Öffnen derselben Datei)
             oder "fp:<pageIds...>" (Fallback ohne Dateiname / zusätzlich). */
  const LAST_PAGE_KEY = 'anweisungen-last-page';
  let lastPageSuspend = 0;
  let lastPageRememberTimer = 0;

  function readLastPageMap() {
    try {
      const raw = localStorage.getItem(LAST_PAGE_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (_) {
      return {};
    }
  }

  function writeLastPageMap(map) {
    try {
      localStorage.setItem(LAST_PAGE_KEY, JSON.stringify(map || {}));
    } catch (_) {}
  }

  function docFilenameKey() {
    if (!loadedSaveFileName) return null;
    try {
      return 'fn:' + toBeakFilename(loadedSaveFileName).toLowerCase();
    } catch (_) {
      return null;
    }
  }

  function docFingerprintKey() {
    const pages = state.doc && state.doc.pages;
    if (!pages || !pages.length) return null;
    const ids = [];
    for (const p of pages) {
      if (p && p.id) ids.push(String(p.id));
    }
    if (!ids.length) return null;
    const joined = ids.join(',');
    if (joined.length <= 220) return 'fp:' + joined;
    let h = 2166136261;
    for (let i = 0; i < joined.length; i++) {
      h ^= joined.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return 'fp:h' + (h >>> 0).toString(36) + ':' + ids.length + ':' + ids[0] + ':' + ids[ids.length - 1];
  }

  function rememberCurrentPageNow() {
    if (lastPageSuspend || (store && store.booting)) return;
    if (!state.doc || !Array.isArray(state.doc.pages) || !state.doc.pages.length) return;
    const page = state.doc.pages[state.doc.pageIndex];
    if (!page || !page.id) return;
    const fnKey = docFilenameKey();
    const fpKey = docFingerprintKey();
    if (!fnKey && !fpKey) return;
    const map = readLastPageMap();
    if (fnKey) map[fnKey] = page.id;
    if (fpKey) map[fpKey] = page.id;
    writeLastPageMap(map);
  }

  function scheduleRememberLastPage() {
    if (lastPageSuspend || (store && store.booting)) return;
    clearTimeout(lastPageRememberTimer);
    lastPageRememberTimer = setTimeout(() => {
      lastPageRememberTimer = 0;
      rememberCurrentPageNow();
    }, 180);
  }

  function lookupRememberedPageId() {
    const map = readLastPageMap();
    const fnKey = docFilenameKey();
    if (fnKey && map[fnKey]) return map[fnKey];
    const fpKey = docFingerprintKey();
    if (fpKey && map[fpKey]) return map[fpKey];
    return null;
  }

  /** Nach Dokumentladen einmalig: gemerkte Seite anspringen, falls vorhanden. */
  function applyRememberedPage() {
    const pageId = lookupRememberedPageId();
    if (!pageId) return false;
    const idx = findPageIndexById(pageId);
    if (idx < 0) return false; /* Seite weg → Default (Seite 1 / Index) belassen */
    if (idx === state.doc.pageIndex) return false;
    lastPageSuspend++;
    try {
      snapToIndex(idx, false);
      requestAnimationFrame(() => {
        lastPageSuspend++;
        try {
          snapToIndex(idx, false);
        } finally {
          lastPageSuspend--;
        }
      });
    } finally {
      lastPageSuspend--;
    }
    return true;
  }

  /* v1.31/v1.59: Anzeige-Modus – NUR gerätelokal (localStorage), nie in .beak / project.json / IDB.
     Key anweisungen-display-mode = fill | window. Pro Gerät unabhängig. */
  const DISPLAY_MODE_KEY = 'anweisungen-display-mode';
  function getDisplayMode() {
    try {
      const v = localStorage.getItem(DISPLAY_MODE_KEY);
      if (v === 'window' || v === 'fill') return v;
    } catch (_) {}
    /* v1.67: frische Installationen → Fenster (nicht Bildschirmfüllend) */
    return 'window';
  }
  function updateDisplayModeUI() {
    const mode = getDisplayMode();
    if (el.displayModeFillCheck) el.displayModeFillCheck.hidden = mode !== 'fill';
    if (el.displayModeWindowCheck) el.displayModeWindowCheck.hidden = mode !== 'window';
  }
  function setDisplayMode(mode) {
    const m = mode === 'window' ? 'window' : 'fill';
    try { localStorage.setItem(DISPLAY_MODE_KEY, m); } catch (_) {}
    updateDisplayModeUI();
    pageScaleValue = 0; pageScaleXValue = 0; pageScaleYValue = 0; pageRefHValue = 0; /* force updatePageScale */
    try { fixStandaloneViewport(); } catch (_) {}
  }

  /* v1.22/v1.26/v1.31/v1.50/v1.83: iPad-Standalone → stage-ipad-fill (uniform Fill) oder stage-ipad-window.
     Desktop/PC → keine iPad-Klassen: Seite einpassen. Preference trotzdem speicherbar.
     v1.26: visualViewport bevorzugen; --app-h nie größer als sichtbar.
     v1.36: Während Tastatur-Eingabe Layout-Größe einfrieren (kein Shrink aus vv.height) –
             gilt für Fill und Fenster; Sichtbarkeit über updateKbAvoid (translateY).
     v1.83: Fill uniform (kein Stretch); Aspect 1180×792 → Fenster iPad Air praktisch ohne Seitenbalken; schlanker Inset. */
  let lastGoodAppH = '';
  let lastGoodAppW = '';
  function fixStandaloneViewport() {
    const root = document.documentElement;
    let h = '';
    let w = '';
    let ipadStandalone = false;
    /* Klassen immer aktualisieren; Maße beim Tippen nicht aus geschrumpftem vv übernehmen */
    const typing = typeof isTypingTarget === 'function' && isTypingTarget(document.activeElement);
    try {
      const standalone = navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches;
      if (standalone && isAppleTouchDevice()) {
        ipadStandalone = true;
        if (typing) {
          /* Eingefrorene Maße behalten; kein updatePageScale aus Keyboard-Shrink */
          h = lastGoodAppH || root.style.getPropertyValue('--app-h') || '';
          w = lastGoodAppW || root.style.getPropertyValue('--app-w') || '';
        } else {
          const land = (window.innerWidth || 0) >= (window.innerHeight || 0);
          let screenW = 0, screenH = 0;
          if (screen && screen.width && screen.height) {
            screenW = land ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
            screenH = land ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
          }
          let vvW = 0, vvH = 0;
          try {
            const vv = window.visualViewport;
            if (vv) { vvW = Math.round(vv.width) || 0; vvH = Math.round(vv.height) || 0; }
          } catch (_) {}
          const fallbackH = [screenH, window.innerHeight || 0]
            .filter((n) => n > 0);
          const fallbackW = [screenW, window.innerWidth || 0]
            .filter((n) => n > 0);
          /* Prefer visualViewport (= sichtbare Fläche); sonst Fallback. Nie größer als vv. */
          let bestH = vvH > 0 ? vvH : (fallbackH.length ? Math.max.apply(null, fallbackH) : 0);
          let bestW = vvW > 0 ? vvW : (fallbackW.length ? Math.max.apply(null, fallbackW) : 0);
          if (vvH > 0 && bestH > vvH) bestH = vvH;
          if (vvW > 0 && bestW > vvW) bestW = vvW;
          /* ganze CSS-Pixel */
          if (bestH > 0) h = Math.round(bestH) + 'px';
          if (bestW > 0) w = Math.round(bestW) + 'px';
          if (h) lastGoodAppH = h;
          if (w) lastGoodAppW = w;
        }
      }
    } catch (_) {}
    const mode = getDisplayMode();
    const useFill = ipadStandalone && mode !== 'window';
    const useWindow = ipadStandalone && mode === 'window';
    root.classList.toggle('stage-ipad-fill', useFill);
    root.classList.toggle('stage-ipad-window', useWindow);
    if (typing && ipadStandalone) {
      /* Maße und Scale unverändert lassen; ggf. letzte gute Werte wiederherstellen */
      if (lastGoodAppH) {
        root.style.setProperty('--app-h', lastGoodAppH);
        root.classList.add('app-h-fix');
      }
      if (lastGoodAppW) {
        root.style.setProperty('--app-w', lastGoodAppW);
        root.classList.add('app-w-fix');
      }
      return;
    }
    if (h) { root.style.setProperty('--app-h', h); root.classList.add('app-h-fix'); }
    else { root.style.removeProperty('--app-h'); root.classList.remove('app-h-fix'); }
    if (w) { root.style.setProperty('--app-w', w); root.classList.add('app-w-fix'); }
    else { root.style.removeProperty('--app-w'); root.classList.remove('app-w-fix'); }
    try { updatePageScale(); } catch (_) {}
    try { scheduleViewerChromeCompact(); } catch (_) {}
    try { scheduleEditTopbarLayout(); } catch (_) {}
  }
  updateDisplayModeUI();
  fixStandaloneViewport();
  window.addEventListener('resize', fixStandaloneViewport);
  /* v1.81: Hochformat – Seiten stapeln + Editor aus; Querformat wie bisher */
  function isPortraitOrientation() {
    try {
      if (window.matchMedia && window.matchMedia('(orientation: portrait)').matches) return true;
      if (window.matchMedia && window.matchMedia('(orientation: landscape)').matches) return false;
    } catch (_) {}
    return (window.innerHeight || 0) > (window.innerWidth || 0);
  }
  function updateOrientationLayout() {
    const root = document.documentElement;
    const port = isPortraitOrientation();
    const was = root.classList.contains('orient-portrait');
    const changed = was !== port;
    /* v2.08: vor Portrait→Landscape Index aus Scrollposition lesen */
    if (was && !port) {
      try { syncPageIndexFromPortraitScroll(); } catch (_) {}
    }
    root.classList.toggle('orient-portrait', port);
    if (el.app) el.app.classList.toggle('orient-portrait', port);
    if (port && state.editMode) {
      try { setEditMode(false); } catch (_) {}
    }
    if (port) {
      try {
        clearTrackTransition();
        if (el.pageTrack) el.pageTrack.style.transform = '';
        trackOffsetPx = 0;
      } catch (_) {}
    } else {
      try { applyTrackTransform(baseOffsetForIndex(state.doc.pageIndex), false); } catch (_) {}
    }
    pageScaleValue = 0; pageScaleXValue = 0; pageScaleYValue = 0; pageRefHValue = 0;
    try { updatePageScale(); } catch (_) {}
    try { scheduleViewerChromeCompact(); } catch (_) {}
    try { updateNearSlides(); } catch (_) {}
    /* v2.08: nur bei echtem Drehen Portrait-Scroll setzen (nicht bei jedem Resize) */
    if (changed) {
      orientRestoreUntil = Date.now() + 1200;
      if (port) {
        requestAnimationFrame(() => {
          try { restorePagePositionForOrientation(); } catch (_) {}
        });
      }
    }
  }
  updateOrientationLayout();
  window.addEventListener('orientationchange', () => {
    setTimeout(() => { try { fixStandaloneViewport(); } catch (_) {} try { updateOrientationLayout(); } catch (_) {} }, 300);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fixStandaloneViewport);
  }
  window.addEventListener('resize', () => { try { updateOrientationLayout(); } catch (_) {} });
  /* v1.60: also react to display-mode / standalone changes for compact chrome */
  try {
    const dmMq = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)');
    const onDm = () => scheduleViewerChromeCompact();
    if (dmMq.addEventListener) dmMq.addEventListener('change', onDm);
    else if (dmMq.addListener) dmMq.addListener(onDm);
  } catch (_) {}
  scheduleViewerChromeCompact();
  if (el.displayModeFillBtn) {
    el.displayModeFillBtn.addEventListener('click', () => {
      setDisplayMode('fill');
      closeMenu();
    });
  }
  if (el.displayModeWindowBtn) {
    el.displayModeWindowBtn.addEventListener('click', () => {
      setDisplayMode('window');
      closeMenu();
    });
  }

  /* v1.65: File Handling API (Chrome/Edge PWA) + Mac-Opener ?pending=1 */
  async function consumeLaunchQueueFiles() {
    try {
      if (!('launchQueue' in window) || typeof window.launchQueue.setConsumer !== 'function') return;
      window.launchQueue.setConsumer(async (launchParams) => {
        const files = (launchParams && launchParams.files) || [];
        for (const handle of files) {
          try {
            const file = await handle.getFile();
            if (file) await applyProjectFile(file, handle);
          } catch (err) {
            console.warn('launchQueue Datei', err);
            flash('Datei aus Finder konnte nicht geöffnet werden', 6000, 'error');
          }
        }
      });
    } catch (err) {
      console.warn('launchQueue', err);
    }
  }

  async function consumePendingOpenFromServer() {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('pending') !== '1') return;
      u.searchParams.delete('pending');
      const clean = u.pathname + (u.search ? u.search : '') + u.hash;
      try { history.replaceState(null, '', clean || './'); } catch (_) {}
      const resp = await fetch('/api/pending-beak', { cache: 'no-store' });
      if (resp.status === 204 || resp.status === 404) return;
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const name = decodeURIComponent(resp.headers.get('X-Beak-Filename') || 'Projekt.beak');
      const buf = await resp.arrayBuffer();
      if (!buf || !buf.byteLength) return;
      const file = new File([buf], name, { type: 'application/octet-stream' });
      await applyProjectFile(file, null);
    } catch (err) {
      console.warn('pending-beak', err);
      flash('Finder-Datei konnte nicht geladen werden (Serve läuft?)', 7000, 'error');
    }
  }

  consumeLaunchQueueFiles();
  void consumePendingOpenFromServer();

  /* v1.18: Service Worker für Offline-App-Shell (nicht für .beak-Projekte) */
  function registerAppServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol === 'file:') return;
    const swUrl = new URL('sw.js?v=' + APP_VERSION, document.baseURI || window.location.href).href;
    navigator.serviceWorker.register(swUrl).catch((err) => {
      console.warn('Service Worker nicht registriert', err);
    });
  }
  registerAppServiceWorker();

  /* v1.18: pdf.js Legacy schon beim Start lazy vorladen */
  setTimeout(() => { try { warmupPdfPipeline(); } catch (_) {} }, 1200);

  requestPersistentStorage();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushStorageOnHide(); });
  window.addEventListener('pagehide', flushStorageOnHide);
  void bootRestore().then(() => { try { warmupPdfPipeline(); } catch (_) {} });

  /* v1.99 test/debug bridge (read-only helpers for automation) */
  try {
    window.__anw = {
      version: APP_VERSION,
      getActiveVariantId: () => state.activeVariantId,
      getBeakUsage: () => Object.assign({}, state.beakUsage || {}),
      getUnmatchedBeakKeys: (parts) => collectUnmatchedBeakLabels(Array.isArray(parts) ? parts : []).list.map((g) => g.key),
      rebuildBeakUsage: () => { rebuildBeakUsage(); return Object.assign({}, state.beakUsage || {}); },
      /* v2.02 smoke: needs ≥2 Varianten (from page); B-only page with unique BEAK */
      seedAbgleichScopeFixture: () => {
        syncVariantsFromPage();
        let list = variantsList();
        if (list.length < 2) {
          const vp = getVariantenPage();
          if (!vp || !vp.root) return { error: 'no-varianten-page' };
          /* Ensure two named leaves via shallow split if needed */
          const leaves = leafIdsInOrder(vp.root, []);
          if (leaves.length < 2) return { error: 'need-split-varianten', leafCount: leaves.length };
          leaves[0].caption = leaves[0].caption || 'Gerät A';
          leaves[0].captionShort = leaves[0].captionShort || 'A';
          if (!leaves[0].variantId) leaves[0].variantId = uid('v');
          leaves[1].caption = leaves[1].caption || 'Gerät B';
          leaves[1].captionShort = leaves[1].captionShort || 'B';
          if (!leaves[1].variantId) leaves[1].variantId = uid('v');
          syncVariantsFromPage();
          list = variantsList();
        }
        if (list.length < 2) return { error: 'still-lt-2-variants', n: list.length };
        const idA = list[0].id;
        const idB = list[1].id;
        state.activeVariantId = idA;
        let shared = (state.doc.pages || []).find((p) => p && !isFixedPage(p) && !isVariantenPage(p) && !isIndexPage(p) && !isFehlerPage(p) && !pageVariantScopeIds(p));
        if (!shared) {
          shared = {
            id: uid('p'), kind: 'layout', title: 'Shared',
            root: { type: 'leaf', id: uid('l'), photo: null, caption: '', captionShort: '', captionX: 0.05, captionY: 0.78, variantId: null },
            annotations: [], variantScope: 'all', pageGroupId: uid('g'),
          };
          const ix = (state.doc.pages || []).findIndex((p) => isIndexPage(p));
          state.doc.pages.splice(ix >= 0 ? ix + 1 : Math.max(0, state.doc.pages.length - 1), 0, shared);
        }
        const gid = pageGroupIdOf(shared);
        shared.pageGroupId = gid;
        shared.variantScope = 'all';
        if (!Array.isArray(shared.annotations)) shared.annotations = [];
        shared.annotations = shared.annotations.filter((x) => !(x && String(x.id || '').indexOf('fix_') === 0));
        shared.annotations.push({ id: 'fix_a_shared', type: 'beakNr', beakDigits: '1001', qty: 1, x: 10, y: 10, w: 14, h: 7 });
        let pageB = (state.doc.pages || []).find((p) => {
          if (!p || pageGroupIdOf(p) !== gid) return false;
          const ids = pageVariantScopeIds(p);
          return !!(ids && ids.length === 1 && ids[0] === idB);
        });
        if (!pageB) {
          pageB = {
            id: uid('p'), kind: 'layout', title: 'Nur B',
            root: { type: 'leaf', id: uid('l'), photo: null, caption: '', captionShort: '', captionX: 0.05, captionY: 0.78, variantId: null },
            annotations: [], variantScope: idB, pageGroupId: gid,
          };
          const at = state.doc.pages.indexOf(shared);
          state.doc.pages.splice(at + 1, 0, pageB);
        }
        pageB.variantScope = idB;
        pageB.pageGroupId = gid;
        pageB.annotations = [{ id: 'fix_b_only', type: 'beakNr', beakDigits: '9999', qty: 1, x: 10, y: 20, w: 14, h: 7 }];
        rebuildBeakUsage();
        const partsA = [{ beakEdvNr: '1.001', bedarfStck: 1, description: 'Teil A', page: 1 }];
        const unmatchedA = collectUnmatchedBeakLabels(partsA).list.map((g) => g.key);
        const usageA = Object.assign({}, state.beakUsage);
        const visibleA = (state.doc.pages || []).filter((p) => pageVisibleInViewer(p, idA)).map((p) => p.id);
        state.activeVariantId = idB;
        rebuildBeakUsage();
        const partsB = [{ beakEdvNr: '9.999', bedarfStck: 1, description: 'Teil B', page: 1 }];
        const unmatchedB = collectUnmatchedBeakLabels(partsB).list.map((g) => g.key);
        const usageB = Object.assign({}, state.beakUsage);
        state.activeVariantId = idA;
        rebuildBeakUsage();
        return {
          idA, idB, usageA, usageB, unmatchedA, unmatchedB, visibleA,
          okA: unmatchedA.indexOf('9.999') < 0 && unmatchedA.indexOf('9999') < 0,
          okB: unmatchedB.indexOf('1.001') < 0 && unmatchedB.indexOf('1001') < 0,
        };
      },
      getPageIndex: () => state.doc.pageIndex,
      getPagesMeta: () => (state.doc.pages || []).map((p, i) => ({
        i, kind: p.kind, scope: p.variantScope, group: p.pageGroupId, id: p.id,
      })),
      getNavMeta: () => getNavPages().map((p) => ({
        real: state.doc.pages.indexOf(p), kind: p.kind, scope: p.variantScope,
      })),
      remap: (i) => remapToVisiblePageIndex(i),
      resolveTarget: (tp) => resolveTargetPageRealIndex(tp),
      goToTarget: (tp) => goToTargetPage(tp),
      getNavLen: () => getNavPages().length,
      navIndexOf: (real) => navIndexOfPageIndex(real),
      realFromNav: (navIdx) => realIndexFromNavIndex(navIdx),
      goToReal: (i) => goToPage(i),
      setActiveVariantId: (id) => setActiveVariant(id),
      setIndexRow: (text, tp) => {
        const ip = (state.doc.pages || []).find((p) => isIndexPage(p));
        if (!ip) return false;
        if (!Array.isArray(ip.rows) || !ip.rows.length) ip.rows = [makeIndexRow('', 0)];
        ip.rows[0].text = text;
        ip.rows[0].targetPage = tp;
        renderAll();
        return true;
      },
    };
  } catch (_) {}

})();
