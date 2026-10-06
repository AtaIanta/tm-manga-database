
var bypassUnsavedLeavePrompt = false;
var unsavedLeaveConfirmAction = null;

function isMangaEditOpen() {
  const el = document.getElementById('mangaEditActions');
  return Boolean(el && !el.classList.contains('hidden'));
}

function isArtistEditOpen() {
  const el = document.getElementById('artistEditActions');
  return Boolean(el && !el.classList.contains('hidden'));
}

function isDirectEditOpen() {
  return isMangaEditOpen() || isArtistEditOpen();
}

function collectUnsavedEditItems() {
  const items = [];
  if (isMangaEditOpen() && currentDetailDoc) {
    items.push({
      key: `manga:${currentDetailDoc.id}`,
      label: currentDetailDoc.title_romaji || currentDetailDoc.title_en || currentDetailDoc.id,
      note: 'Unsaved edits on this page'
    });
  }
  if (isArtistEditOpen() && currentArtistDoc) {
    items.push({
      key: `artist:${currentArtistDoc.slug}`,
      label: currentArtistDoc.romaji || currentArtistDoc.name || currentArtistDoc.slug,
      note: 'Unsaved edits on this page'
    });
  }
  return items;
}

function collectLocalSessionItems() {
  const items = [];
  const seen = new Set();
  (allManga || []).forEach(manga => {
    const sessionDoc = sessionMangaDocs && sessionMangaDocs[manga.id];
    if (!(manga._isLocallyModified || sessionDoc?._isLocallyModified)) return;
    if (seen.has(manga.id)) return;
    seen.add(manga.id);
    items.push({
      key: `manga:${manga.id}`,
      label: manga.title_romaji || manga.title_en || manga.id,
      note: 'Local manga changes, not downloaded'
    });
  });
  if (sessionMangaDocs) {
    Object.keys(sessionMangaDocs).forEach(id => {
      if (!sessionMangaDocs[id]?._isLocallyModified || seen.has(id)) return;
      seen.add(id);
      const doc = sessionMangaDocs[id];
      items.push({
        key: `manga:${id}`,
        label: doc.title_romaji || doc.title_en || id,
        note: 'Local manga changes, not downloaded'
      });
    });
  }
  (allArtists || []).forEach(artist => {
    if (!artist._isLocallyModified) return;
    const key = artist.slug || artist.romaji || artist.name;
    if (!key || seen.has(`artist:${key}`)) return;
    seen.add(`artist:${key}`);
    items.push({
      key: `artist:${key}`,
      label: artist.romaji || artist.name || artist.slug,
      note: 'Local artist changes, not downloaded'
    });
  });
  return items;
}

function collectExitLossItems() {
  const map = new Map();
  collectUnsavedEditItems().forEach(item => map.set(item.key, item));
  collectLocalSessionItems().forEach(item => {
    if (!map.has(item.key)) map.set(item.key, item);
  });
  return [...map.values()];
}

function showUnsavedLeaveModal(items, onConfirm, options = {}) {
  const modal = document.getElementById('unsavedLeaveModal');
  const list = document.getElementById('unsavedLeaveList');
  const titleEl = document.getElementById('unsavedLeaveTitle');
  const introEl = document.getElementById('unsavedLeaveIntro');
  const confirmBtn = document.getElementById('unsavedLeaveConfirmBtn');
  if (!modal || !list) {
    if (onConfirm) onConfirm();
    return;
  }
  if (titleEl) titleEl.textContent = options.title || 'Changes will not be saved';
  if (introEl) introEl.textContent = options.intro || 'If you leave now, these changes will not be saved:';
  if (confirmBtn) confirmBtn.textContent = options.confirmLabel || 'Leave without saving';
  list.innerHTML = items.map(item => `
    <li class="px-2.5 py-1.5 rounded-lg bg-cafe-900/80 border border-amber-500/30">
      <span class="font-semibold text-cafe-cream">${escapeHtml(item.label)}</span>
      <span class="block text-[10px] text-amber-200/80 mt-0.5">${escapeHtml(item.note || '')}</span>
    </li>
  `).join('');
  unsavedLeaveConfirmAction = onConfirm;
  modal.classList.remove('hidden');
}

function stayOnUnsavedPage() {
  unsavedLeaveConfirmAction = null;
  const modal = document.getElementById('unsavedLeaveModal');
  if (modal) modal.classList.add('hidden');
}

function confirmUnsavedLeave() {
  const action = unsavedLeaveConfirmAction;
  stayOnUnsavedPage();
  if (!action) return;
  bypassUnsavedLeavePrompt = true;
  try {
    action();
  } finally {
    bypassUnsavedLeavePrompt = false;
  }
}

function guardUnsavedEdit(action) {
  if (bypassUnsavedLeavePrompt || !isDirectEditOpen()) {
    action();
    return;
  }
  const items = collectUnsavedEditItems();
  if (!items.length) {
    action();
    return;
  }
  showUnsavedLeaveModal(items, action, {
    title: 'Unsaved edits',
    intro: 'Leaving this page will discard the edits below. They have not been saved.',
    confirmLabel: 'Leave without saving'
  });
}

function setupEventListeners() {

  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    let debounceTimeout = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        applyFilters();
      }, 180);
    });
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      applyFilters();
    });
  }

  const btnGridView = document.getElementById('btnGridView');
  const btnTableView = document.getElementById('btnTableView');
  if (btnGridView && btnTableView) {
    btnGridView.addEventListener('click', () => {
      currentView = 'grid';
      btnGridView.classList.add('active');
      btnTableView.classList.remove('active');
      applyFilters();
    });
    btnTableView.addEventListener('click', () => {
      currentView = 'table';
      btnTableView.classList.add('active');
      btnGridView.classList.remove('active');
      applyFilters();
    });
  }

  window.addEventListener('hashchange', checkUrlHash);
  window.addEventListener('popstate', checkUrlHash);
  window.addEventListener('beforeunload', (event) => {
    const items = collectExitLossItems();
    if (!items.length) return;
    const message = `These changes will not be saved:\n${items.map(item => `${item.label} — ${item.note}`).join('\n')}`;
    event.preventDefault();
    event.returnValue = message;
  });
  if (typeof bindArtistSuggestions === 'function') bindArtistSuggestions();
}

function checkUrlHash() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash || hash === 'mangas') {
    if (mangaFullPageView && !mangaFullPageView.classList.contains('hidden')) {
      closeFullPageView(false);
    }
    if (artistFullPageView && !artistFullPageView.classList.contains('hidden')) {
      closeArtistPageView(false);
    }
    if (publisherFullPageView && !publisherFullPageView.classList.contains('hidden')) {
      closePublisherPageView(false);
    }
    switchCategory('manga');
    return;
  }

  if (hash === 'doujins') {
    if (mangaFullPageView && !mangaFullPageView.classList.contains('hidden')) {
      closeFullPageView(false);
    }
    if (artistFullPageView && !artistFullPageView.classList.contains('hidden')) {
      closeArtistPageView(false);
    }
    if (publisherFullPageView && !publisherFullPageView.classList.contains('hidden')) {
      closePublisherPageView(false);
    }
    switchCategory('doujins');
    return;
  }

  if (hash === 'artists') {
    if (mangaFullPageView && !mangaFullPageView.classList.contains('hidden')) {
      closeFullPageView(false);
    }
    if (artistFullPageView && !artistFullPageView.classList.contains('hidden')) {
      closeArtistPageView(false);
    }
    if (publisherFullPageView && !publisherFullPageView.classList.contains('hidden')) {
      closePublisherPageView(false);
    }
    switchCategory('artists');
    return;
  }

  if (hash.startsWith('manga=')) {
    const id = decodeURIComponent(hash.slice(6));
    openMangaDetail(id, false);
  } else if (hash.startsWith('artist=')) {
    const slug = decodeURIComponent(hash.slice(7));
    openArtistPage(slug, false);
  } else if (hash.startsWith('publisher=')) {
    const pub = decodeURIComponent(hash.slice(10));
    openPublisherPage(pub, false);
  } else if (hash.startsWith('publisher/')) {
    const pub = decodeURIComponent(hash.slice(10));
    openPublisherPage(pub, false);
  }
}

function navigateManga(direction) {
  if (activeMangaIndex < 0 || filteredManga.length === 0) return;
  let newIndex = activeMangaIndex + direction;
  if (newIndex >= filteredManga.length) newIndex = 0;
  if (newIndex < 0) newIndex = filteredManga.length - 1;
  openMangaDetail(filteredManga[newIndex].id);
}

async function downloadCurrentPageJson() {
  if (mangaFullPageView && !mangaFullPageView.classList.contains('hidden') && currentDetailDoc) {
    await downloadSingleMangaJson(currentDetailDoc);
    return;
  }
  if (artistFullPageView && !artistFullPageView.classList.contains('hidden') && currentArtistDoc) {
    await downloadArtistJson();
    return;
  }
  if (publisherFullPageView && !publisherFullPageView.classList.contains('hidden') && currentPublisherData) {
    const cleanDoc = typeof sanitizePublisherDocForStorage === 'function'
      ? sanitizePublisherDocForStorage(currentPublisherData)
      : currentPublisherData;
    const slug = cleanDoc.slug || slugify(currentPublisherData.name || 'publisher');
    await saveJsonToFile(cleanDoc, `${slug}.json`);
    return;
  }
  await saveJsonToFile(allManga, 'type-moon-manga-catalog.json');
}

async function downloadCurrentPageZip() {
  if (mangaFullPageView && !mangaFullPageView.classList.contains('hidden') && currentDetailDoc) {
    await downloadSingleMangaZip(currentDetailDoc);
    return;
  }
  await downloadCurrentPageJson();
}

document.addEventListener('DOMContentLoaded', async () => {
  initAmbientCanvas();
  await loadDatabase();
  setupEventListeners();
  checkUrlHash();
});
