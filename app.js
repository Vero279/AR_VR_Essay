/**
 * BIBLIOTHECA — app.js
 * 3D Library · AR/VR · Google Books API · Gamification
 */

'use strict';

/* ── Constants ─────────────────────────────────────────── */
const CONFIG = {
  BOOKS_PER_SHELF: 14,
  SHELVES: 3,
  ROTATION_STEP: 32,       // degrees per nav press
  MAX_ROTATION: 120,        // max scene rotation either side
  GOOGLE_BOOKS_QUERIES: [
    'classic+literature',
    'science+philosophy',
    'architecture+design',
  ],
  GOOGLE_BOOKS_MAX: 16,
  AR_FALLBACK_OPACITY: 0.92,
  TOAST_DURATION: 2400,
};

/* ── Book spine colour palettes ──────────────────────────── */
const SPINE_PALETTES = [
  ['#3b2f2f','#5c3d2e','#7a4f3a','#6b3a2a','#8b5e3c'],  // warm browns
  ['#1e2d40','#264d73','#2e6b9e','#1a3a5c','#0f2840'],  // ocean blues
  ['#2d3b2d','#3d5c3a','#4a7045','#2a4a27','#1e3a1e'],  // forest greens
  ['#3d2d1e','#5c4030','#7a5544','#4a3228','#2e1e14'],  // leather
  ['#1e1e3d','#2d2d5c','#3a3a7a','#28284a','#141430'],  // deep purples
  ['#3d3020','#5c4a30','#7a6244','#4a3c28','#2e2418'],  // parchment
];
const TITLE_COLORS = ['rgba(255,255,255,0.82)', 'rgba(240,220,180,0.88)', 'rgba(200,200,200,0.78)'];

/* ── Fallback book dataset ───────────────────────────────── */
const FALLBACK_BOOKS = [
  { id:'f1', title:'The Name of the Rose', author:'Umberto Eco', synopsis:'A medieval monk investigates a series of murders in an Italian abbey, weaving semiotics, biblical analysis, and labyrinthine mystery.', cover:'', link:'#' },
  { id:'f2', title:'Invisible Cities', author:'Italo Calvino', synopsis:'Marco Polo describes imaginary cities to Kublai Khan — a meditation on memory, desire, and the nature of place.', cover:'', link:'#' },
  { id:'f3', title:'The Library of Babel', author:'Jorge Luis Borges', synopsis:'A vast library containing all possible books becomes the universe — Borges explores infinity, meaning, and the limits of knowledge.', cover:'', link:'#' },
  { id:'f4', title:'Meditations', author:'Marcus Aurelius', synopsis:'Private notes of a Roman emperor on Stoic philosophy — endurance, reason, and the art of living well.', cover:'', link:'#' },
  { id:'f5', title:'Critique of Pure Reason', author:'Immanuel Kant', synopsis:'A foundational inquiry into the nature of knowledge and experience, reshaping Western philosophy permanently.', cover:'', link:'#' },
  { id:'f6', title:'Thus Spoke Zarathustra', author:'Friedrich Nietzsche', synopsis:'Through prophet Zarathustra, Nietzsche presents the Übermensch, eternal return, and the death of God.', cover:'', link:'#' },
  { id:'f7', title:'One Hundred Years of Solitude', author:'Gabriel García Márquez', synopsis:'The Buendía family\'s epic history in Macondo — magical realism at its most expansive and melancholy.', cover:'', link:'#' },
  { id:'f8', title:'Cosmos', author:'Carl Sagan', synopsis:'A journey through the universe and the history of science, connecting human existence to the cosmos.', cover:'', link:'#' },
  { id:'f9', title:'The Architecture of Happiness', author:'Alain de Botton', synopsis:'How buildings shape our emotions and identity — a philosophical tour through what we really want from the spaces we inhabit.', cover:'', link:'#' },
  { id:'f10', title:'Thinking, Fast and Slow', author:'Daniel Kahneman', synopsis:'A tour of the two systems driving the way we think — and the biases and heuristics that shape human judgment.', cover:'', link:'#' },
  { id:'f11', title:'The Elements of Style', author:'Strunk & White', synopsis:'The essential guide to clear, precise English writing — concise, authoritative, indispensable.', cover:'', link:'#' },
  { id:'f12', title:'Sapiens', author:'Yuval Noah Harari', synopsis:'A brief history of humankind — from the cognitive revolution to the present — sweeping and provocative.', cover:'', link:'#' },
];

/* ── App State ───────────────────────────────────────────── */
const state = {
  books: [],
  discovered: new Set(),
  collection: new Set(),
  rotation: 0,
  mode: 'explore',       // 'explore' | 'ar' | 'vr'
  arStream: null,
  panelOpen: false,
  currentBook: null,
  toastTimer: null,
};

/* ── DOM refs ────────────────────────────────────────────── */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const dom = {
  loading:      $('#loading-screen'),
  scene:        $('#scene'),
  shelves:      $('#shelves-container'),
  btnLeft:      $('#btn-left'),
  btnRight:     $('#btn-right'),
  modeBtns:     document.querySelectorAll('.mode-btn'),
  progressLabel:$('#progress-label'),
  progressFill: $('#progress-fill'),
  collCount:    $('#collection-count'),
  panel:        $('#book-panel'),
  backdrop:     $('#panel-backdrop'),
  panelClose:   $('#panel-close'),
  panelCover:   $('#panel-cover'),
  panelTitle:   $('#panel-title'),
  panelAuthor:  $('#panel-author'),
  panelSynopsis:$('#panel-synopsis'),
  panelSave:    $('#panel-save'),
  panelLink:    $('#panel-link'),
  arVideo:      $('#ar-video'),
  toast:        $('#toast'),
};

/* ══════════════════════════════════════════════════════════
   BOOT
══════════════════════════════════════════════════════════ */
async function init() {
  const books = await fetchBooks();
  state.books = books;
  renderShelves(books);
  bindEvents();
  hideLoading();
}

/* ── Google Books API ─────────────────────────────────────── */
async function fetchBooks() {
  try {
    const results = await Promise.all(
      CONFIG.GOOGLE_BOOKS_QUERIES.map(q =>
        fetch(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=${CONFIG.GOOGLE_BOOKS_MAX}&printType=books&langRestrict=en`)
          .then(r => r.ok ? r.json() : null)
      )
    );
    const items = results
      .filter(Boolean)
      .flatMap(d => (d.items || []))
      .filter(item => item.volumeInfo);

    if (!items.length) throw new Error('No items');

    // Deduplicate by title
    const seen = new Set();
    const books = items
      .filter(item => {
        const key = item.volumeInfo.title?.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(item => {
        const v = item.volumeInfo;
        return {
          id: item.id,
          title: v.title || 'Unknown Title',
          author: (v.authors || ['Unknown Author']).join(', '),
          synopsis: v.description || 'No synopsis available.',
          cover: v.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
          link: v.infoLink || '#',
        };
      });

    return books.length >= 8 ? books : [...books, ...FALLBACK_BOOKS];
  } catch {
    return FALLBACK_BOOKS;
  }
}

/* ── Render Shelves ──────────────────────────────────────── */
function renderShelves(books) {
  dom.shelves.innerHTML = '';

  // Spread books across shelves
  const booksPerShelf = Math.ceil(books.length / CONFIG.SHELVES);
  for (let s = 0; s < CONFIG.SHELVES; s++) {
    const shelfBooks = books.slice(s * booksPerShelf, (s + 1) * booksPerShelf);
    dom.shelves.appendChild(createShelf(shelfBooks, s));
  }

  updateProgress();
}

function createShelf(books, shelfIndex) {
  const unit = document.createElement('div');
  unit.className = 'shelf-unit';
  unit.setAttribute('role', 'listitem');

  const board = document.createElement('div');
  board.className = 'shelf-board';

  const row = document.createElement('div');
  row.className = 'books-row';

  const palette = SPINE_PALETTES[shelfIndex % SPINE_PALETTES.length];

  books.forEach((book, i) => {
    row.appendChild(createBook(book, palette[i % palette.length], i));
  });

  board.appendChild(row);
  unit.appendChild(board);
  return unit;
}

function createBook(book, color, index) {
  const el = document.createElement('div');
  el.className = 'book';
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', `${book.title} by ${book.author}`);
  el.dataset.bookId = book.id;

  // Slight height variation for realism
  const heightVar = 0.8 + Math.random() * 0.22;
  const widthVar  = 0.85 + Math.random() * 0.25;

  el.style.setProperty('--book-color', color);
  el.style.height = `calc(var(--book-height) * ${heightVar.toFixed(2)})`;
  el.style.width  = `calc(var(--book-width) * ${widthVar.toFixed(2)})`;
  // slight tilt
  const tilt = (Math.random() - 0.5) * 3;
  el.style.transform = `rotate(${tilt.toFixed(1)}deg)`;

  el.innerHTML = `
    <div class="book-spine">
      <span class="book-spine-text" style="color:${TITLE_COLORS[index % TITLE_COLORS.length]}">${book.title}</span>
    </div>
    <div class="book-front"></div>
    <div class="book-top"></div>
  `;

  el.addEventListener('click', () => openBook(book.id));
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBook(book.id); }
  });

  return el;
}

/* ── Open Book Panel ─────────────────────────────────────── */
function openBook(bookId) {
  const book = state.books.find(b => b.id === bookId);
  if (!book) return;

  state.currentBook = book;
  markDiscovered(bookId);
  populatePanel(book);

  dom.panel.setAttribute('aria-hidden', 'false');
  dom.panel.classList.add('open');
  dom.backdrop.classList.add('visible');
  state.panelOpen = true;

  // Focus management
  requestAnimationFrame(() => dom.panelClose.focus());
}

function closePanel() {
  dom.panel.classList.remove('open');
  dom.backdrop.classList.remove('visible');
  dom.panel.setAttribute('aria-hidden', 'true');
  state.panelOpen = false;
  state.currentBook = null;
}

function populatePanel(book) {
  dom.panelTitle.textContent   = book.title;
  dom.panelAuthor.textContent  = book.author;
  dom.panelSynopsis.textContent = book.synopsis;
  dom.panelLink.href           = book.link !== '#' ? book.link : '#';

  if (book.cover) {
    dom.panelCover.src = book.cover;
    dom.panelCover.alt = `Cover of ${book.title}`;
  } else {
    dom.panelCover.src = '';
    dom.panelCover.alt = '';
    dom.panelCover.style.display = 'none';
  }
  dom.panelCover.style.display = book.cover ? 'block' : 'none';

  // Save button state
  const saved = state.collection.has(book.id);
  dom.panelSave.classList.toggle('saved', saved);
  dom.panelSave.querySelector('svg + *') && null;
  dom.panelSave.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" ${saved ? 'fill="currentColor"' : ''}/></svg>
    ${saved ? 'In Collection' : 'Add to Collection'}
  `;
}

/* ── Gamification ────────────────────────────────────────── */
function markDiscovered(bookId) {
  if (state.discovered.has(bookId)) return;
  state.discovered.add(bookId);

  // Mark the book element
  const el = document.querySelector(`[data-book-id="${bookId}"]`);
  if (el) el.classList.add('discovered');

  updateProgress();
}

function updateProgress() {
  const total     = state.books.length;
  const found     = state.discovered.size;
  const pct       = total ? Math.round((found / total) * 100) : 0;

  dom.progressLabel.textContent = `${found} / ${total} discovered`;
  dom.progressFill.style.width  = `${pct}%`;
  document.getElementById('progress-track').setAttribute('aria-valuenow', pct);

  if (found > 0 && found === total) {
    showToast('🎉 Library fully explored!');
  }
}

function saveToCollection(bookId) {
  if (state.collection.has(bookId)) {
    state.collection.delete(bookId);
    const el = document.querySelector(`[data-book-id="${bookId}"]`);
    if (el) el.classList.remove('collected');
    showToast('Removed from collection');
  } else {
    state.collection.add(bookId);
    const el = document.querySelector(`[data-book-id="${bookId}"]`);
    if (el) el.classList.add('collected');
    showToast('Saved to collection ✦');
  }
  dom.collCount.textContent = state.collection.size;

  // Refresh panel button
  if (state.currentBook?.id === bookId) {
    populatePanel(state.currentBook);
  }
}

/* ── Scene Rotation ──────────────────────────────────────── */
function rotateScene(dir) {
  state.rotation = Math.max(
    -CONFIG.MAX_ROTATION,
    Math.min(CONFIG.MAX_ROTATION, state.rotation + dir * CONFIG.ROTATION_STEP)
  );
  dom.scene.style.transform = `rotateY(${state.rotation}deg)`;
}

/* ── Mode Switching ──────────────────────────────────────── */
function setMode(mode) {
  if (state.mode === mode) return;

  // Clean up previous mode
  if (state.mode === 'ar') stopAR();

  state.mode = mode;
  document.body.className = `mode-${mode}`;

  dom.modeBtns.forEach(btn => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active);
  });

  if (mode === 'ar') startAR();
  else if (mode === 'vr') startVR();
}

async function startAR() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('Camera not available — AR fallback active');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    state.arStream = stream;
    dom.arVideo.srcObject = stream;
    await dom.arVideo.play().catch(() => {});
    showToast('AR mode — point at your space');
  } catch (err) {
    showToast('Camera permission denied — AR fallback active');
  }
}

function stopAR() {
  if (state.arStream) {
    state.arStream.getTracks().forEach(t => t.stop());
    state.arStream = null;
    dom.arVideo.srcObject = null;
  }
}

function startVR() {
  showToast('VR mode — use arrows to explore');
}

/* ── Toast ───────────────────────────────────────────────── */
function showToast(msg) {
  clearTimeout(state.toastTimer);
  dom.toast.textContent = msg;
  dom.toast.setAttribute('aria-hidden', 'false');
  dom.toast.classList.add('show');
  state.toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
    dom.toast.setAttribute('aria-hidden', 'true');
  }, CONFIG.TOAST_DURATION);
}

/* ── Loading ─────────────────────────────────────────────── */
function hideLoading() {
  setTimeout(() => dom.loading.classList.add('hidden'), 400);
}

/* ── Events ──────────────────────────────────────────────── */
function bindEvents() {
  // Navigation buttons
  dom.btnLeft.addEventListener('click',  () => rotateScene(-1));
  dom.btnRight.addEventListener('click', () => rotateScene(1));

  // Long-press / hold for continuous rotation
  let holdInterval = null;
  function startHold(dir) {
    rotateScene(dir);
    holdInterval = setInterval(() => rotateScene(dir), 180);
  }
  function stopHold() {
    clearInterval(holdInterval);
    holdInterval = null;
  }
  dom.btnLeft.addEventListener('pointerdown',  () => startHold(-1));
  dom.btnRight.addEventListener('pointerdown', () => startHold(1));
  dom.btnLeft.addEventListener('pointerup',    stopHold);
  dom.btnRight.addEventListener('pointerup',   stopHold);
  dom.btnLeft.addEventListener('pointerleave', stopHold);
  dom.btnRight.addEventListener('pointerleave',stopHold);

  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (state.panelOpen) {
      if (e.key === 'Escape') closePanel();
      return;
    }
    if (e.key === 'ArrowLeft')  rotateScene(-1);
    if (e.key === 'ArrowRight') rotateScene(1);
  });

  // Mode buttons
  dom.modeBtns.forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Panel close
  dom.panelClose.addEventListener('click',   closePanel);
  dom.backdrop.addEventListener('click',     closePanel);

  // Save to collection
  dom.panelSave.addEventListener('click', () => {
    if (state.currentBook) saveToCollection(state.currentBook.id);
  });

  // Touch swipe to close panel (mobile)
  let touchStartY = 0;
  dom.panel.addEventListener('touchstart', e => {
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  dom.panel.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientY - touchStartY;
    if (delta > 80) closePanel();
  }, { passive: true });

  // Touch drag to rotate scene
  let dragStartX = 0;
  let dragStartRot = 0;
  let isDragging = false;

  document.addEventListener('pointerdown', e => {
    if (e.target.closest('#book-panel, #mode-bar, #controls, #progress-bar, #collection-counter')) return;
    dragStartX = e.clientX;
    dragStartRot = state.rotation;
    isDragging = true;
  });

  document.addEventListener('pointermove', e => {
    if (!isDragging) return;
    const delta = (e.clientX - dragStartX) * 0.35;
    const newRot = Math.max(-CONFIG.MAX_ROTATION, Math.min(CONFIG.MAX_ROTATION, dragStartRot + delta));
    state.rotation = newRot;
    dom.scene.style.transform = `rotateY(${newRot}deg)`;
  });

  document.addEventListener('pointerup', () => { isDragging = false; });
}

/* ── Start ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);
