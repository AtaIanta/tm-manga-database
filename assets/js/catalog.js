
let currentCategory = 'manga'; 
let currentView = 'grid';      
let currentSort = 'title-asc';

function switchCategory(category) {
  if (currentCategory === category) return;
  currentCategory = category;

  const tabManga = document.getElementById('tabCategoryManga');
  const tabArtists = document.getElementById('tabCategoryArtists');

  if (tabManga) tabManga.classList.toggle('active', category === 'manga');
  if (tabArtists) tabArtists.classList.toggle('active', category === 'artists');

  const sortSelect = document.getElementById('sortSelect');
  const searchInput = document.getElementById('searchInput');

  if (sortSelect) {
    if (category === 'manga') {
      sortSelect.innerHTML = `
        <option value="title-asc">Title (A → Z)</option>
        <option value="title-desc">Title (Z → A)</option>
        <option value="vol-desc">Most Volumes</option>
      `;
      currentSort = 'title-asc';
      if (searchInput) searchInput.placeholder = "Search by title, connection, type, artist... (use -word to exclude)";
    } else {
      sortSelect.innerHTML = `
        <option value="works-desc">Most Documented Works</option>
        <option value="name-asc">Name (A → Z)</option>
        <option value="name-desc">Name (Z → A)</option>
        <option value="chaps-desc">Most Chapters</option>
      `;
      currentSort = 'works-desc';
      if (searchInput) searchInput.placeholder = "Search artists by name, kanji, circle... (use -word to exclude)";
    }
  }

  if (searchInput) searchInput.value = '';
  applyFilters();
}

function applyFilters() {
  const searchInput = document.getElementById('searchInput');
  const rawQuery = (searchInput?.value || '').trim();
  const { includeTerms, excludeTerms } = parseSearchQuery(rawQuery);
  const hasFilter = includeTerms.length > 0 || excludeTerms.length > 0;

  if (currentCategory === 'manga') {
    filteredManga = allManga.filter(item => {
      if (!hasFilter) return true;
      const searchableParts = [
        item.title_romaji || '',
        item.title_jp || '',
        item.title_en || '',
        (item.alt_titles || []).join(' '),
        (item.artists || []).join(' '),
        item.publisher || '',
        item.status || '',
        item.magazine || '',
        item.series || '',
        item.series_code || '',
        item.type || '',
        item.id || '',
        (item.custom_roles || []).map(r => `${r.role || ''} ${r.names || ''}`).join(' ')
      ];
      if (item.volumes && Array.isArray(item.volumes)) {
        for (const v of item.volumes) {
          if (v.isbn) searchableParts.push(v.isbn);
          if (v.asin) searchableParts.push(v.asin);
          if (v.title) searchableParts.push(v.title);
          if (v.chapters && Array.isArray(v.chapters)) {
            for (const c of v.chapters) {
              if (c.title) searchableParts.push(c.title);
              if (c.artist) searchableParts.push(c.artist);
            }
          }
        }
      }
      const searchableText = searchableParts.join(' ');
      return matchesSearchQuery(searchableText, includeTerms, excludeTerms);
    });
    sortManga();
  } else {
    filteredArtists = allArtists.filter(artist => {
      if (!hasFilter) return true;
      const searchableParts = [
        artist.romaji || artist.name || '',
        artist.kanji || '',
        artist.circle || '',
        (artist.works || []).map(w => `${w.title_en || ''} ${w.title_romaji || ''} ${w.title_jp || ''} ${w.role || ''}`).join(' ')
      ];
      const searchableText = searchableParts.join(' ');
      return matchesSearchQuery(searchableText, includeTerms, excludeTerms);
    });
    sortArtists();
  }

  updateResultsCount();
  renderCatalog();
}

function updateResultsCount() {
  const resultsCount = document.getElementById('resultsCount');
  if (!resultsCount) return;
  if (currentCategory === 'manga') {
    resultsCount.innerHTML = `Showing <strong class="text-cafe-gold font-bold font-mono-isbn">${filteredManga.length}</strong> of <strong class="text-white font-bold font-mono-isbn">${allManga.length}</strong> works`;
  } else {
    resultsCount.innerHTML = `Showing <strong class="text-cafe-gold font-bold font-mono-isbn">${filteredArtists.length}</strong> of <strong class="text-white font-bold font-mono-isbn">${allArtists.length}</strong> artists`;
  }
}

function renderCatalog() {
  const currentCount = currentCategory === 'manga' ? filteredManga.length : filteredArtists.length;
  const mangaGrid = document.getElementById('mangaGrid');
  const mangaTable = document.getElementById('mangaTable');
  const emptyState = document.getElementById('emptyState');

  if (currentCount === 0) {
    if (mangaGrid) mangaGrid.classList.add('hidden');
    if (mangaTable) mangaTable.classList.add('hidden');
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const emptyTitle = emptyState.querySelector('h3');
      if (emptyTitle) emptyTitle.textContent = currentCategory === 'manga' ? 'No manga found' : 'No artists found';
      const addTitleBtn = document.getElementById('emptyStateAddTitleBtn');
      if (addTitleBtn) addTitleBtn.classList.toggle('hidden', currentCategory !== 'manga');
    }
  } else {
    if (emptyState) emptyState.classList.add('hidden');
    if (currentView === 'grid') {
      if (mangaGrid) mangaGrid.classList.remove('hidden');
      if (mangaTable) mangaTable.classList.add('hidden');
      renderGrid();
    } else {
      if (mangaGrid) mangaGrid.classList.add('hidden');
      if (mangaTable) mangaTable.classList.remove('hidden');
      renderTable();
    }
  }
}

function sortArtists() {
  filteredArtists.sort((a, b) => {
    const editedDelta = Number(isArtistLocallyEdited(b)) - Number(isArtistLocallyEdited(a));
    if (editedDelta) return editedDelta;
    if (currentSort === 'works-desc') {
      const wa = a.works_count || (a.works ? a.works.length : 0);
      const wb = b.works_count || (b.works ? b.works.length : 0);
      return wb - wa;
    }
    if (currentSort === 'chaps-desc') {
      return (b.chapters_count || 0) - (a.chapters_count || 0);
    }
    if (currentSort === 'name-asc') {
      return (a.romaji || a.name || '').localeCompare(b.romaji || b.name || '');
    }
    if (currentSort === 'name-desc') {
      return (b.romaji || b.name || '').localeCompare(a.romaji || a.name || '');
    }
    return 0;
  });
}

function isMangaLocallyEdited(manga) {
  if (!manga) return false;
  if (manga._isLocallyModified) return true;
  const sessionDoc = typeof sessionMangaDocs !== 'undefined' && sessionMangaDocs[manga.id];
  return Boolean(sessionDoc && sessionDoc._isLocallyModified);
}

function isArtistLocallyEdited(artist) {
  return Boolean(artist && artist._isLocallyModified);
}

function isMangaMissingMetadata(manga) {
  if (typeof isEditModeEnabled === 'function' && !isEditModeEnabled()) return false;
  return getMangaMissingFields(manga).length > 0;
}

function sortManga() {
  filteredManga.sort((a, b) => {
    const editedDelta = Number(isMangaLocallyEdited(b)) - Number(isMangaLocallyEdited(a));
    if (editedDelta) return editedDelta;
    const missingDelta = Number(isMangaMissingMetadata(b)) - Number(isMangaMissingMetadata(a));
    if (missingDelta) return missingDelta;
    if (currentSort === 'year-desc') {
      return (b.release_year || 0) - (a.release_year || 0);
    }
    if (currentSort === 'year-asc') {
      return (a.release_year || 9999) - (b.release_year || 9999);
    }
    if (currentSort === 'title-asc') {
      const ta = (a.title_en || a.title_romaji || '').toLowerCase();
      const tb = (b.title_en || b.title_romaji || '').toLowerCase();
      return ta.localeCompare(tb);
    }
    if (currentSort === 'title-desc') {
      const ta = (a.title_en || a.title_romaji || '').toLowerCase();
      const tb = (b.title_en || b.title_romaji || '').toLowerCase();
      return tb.localeCompare(ta);
    }
    if (currentSort === 'vol-desc') {
      const va = (a.volumes || []).length;
      const vb = (b.volumes || []).length;
      return vb - va;
    }
    return 0;
  });
}

function renderGrid() {
  const mangaGrid = document.getElementById('mangaGrid');
  if (!mangaGrid) return;
  if (currentCategory === 'artists') {
    renderArtistsGrid();
    return;
  }
  mangaGrid.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5';
  renderMangaGrid();
}

function renderMangaGrid() {
  const mangaGrid = document.getElementById('mangaGrid');
  if (!mangaGrid) return;
  mangaGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filteredManga.forEach((manga) => {
    const edited = isMangaLocallyEdited(manga);
    const missing = !edited && isMangaMissingMetadata(manga);
    const card = document.createElement('div');
    card.className = `glass-card rounded-xl p-3.5 sm:p-4 flex flex-col justify-between group cursor-pointer relative${edited ? ' local-edit-card' : missing ? ' local-missing-card' : ''}`;
    card.onclick = () => openMangaDetail(manga.id);

    const hasCover = hasValidCover(manga.cover);

    let coverHtml = '';
    if (hasCover) {
      coverHtml = `
        <img src="${manga.cover}" 
             alt="${escapeHtml(manga.title_romaji)}" 
             loading="lazy" 
             onerror="this.parentElement.innerHTML='<div class=\\'no-data-cover-full\\'><span class=\\'no-data-badge\\'>[no data]</span><span class=\\'text-[10px] text-cafe-muted mt-1.5\\'>No cover available</span></div>';">
      `;
    } else {
      coverHtml = `
        <div class="no-data-cover-full">
          <span class="no-data-badge">[no data]</span>
          <span class="text-[10px] text-cafe-muted mt-1.5">No cover available</span>
        </div>
      `;
    }

    const artistsDisplay = renderArtistLinks(manga.artists);
    const { main: mainTitle, jp: jpSubtitle } = resolveDisplayTitles(manga.title_en, manga.title_romaji, manga.title_jp, manga.id);

    card.innerHTML = `
      <div class="w-full">
        <div class="cover-aspect rounded-lg overflow-hidden border border-cafe-gold/25 relative shadow-lg bg-cafe-950">
          ${coverHtml}
        </div>

        <div class="mt-3">
          ${edited ? `<div class="local-edit-badge mb-1.5">Edited</div>` : missing ? `<div class="local-missing-badge mb-1.5">Missing</div>` : ''}
          <h3 class="font-cinzel font-bold text-sm text-cafe-cream group-hover:text-cafe-gold transition-colors leading-snug line-clamp-2" title="${escapeHtml(mainTitle)}">
            ${escapeHtml(mainTitle)}
          </h3>
          ${jpSubtitle ? `
            <div class="text-[11px] text-cafe-gold/90 font-japanese font-medium truncate mt-0.5" title="${escapeHtml(jpSubtitle)}">
              ${escapeHtml(jpSubtitle)}
            </div>
          ` : ''}
        </div>

        <div class="mt-2.5 pt-2.5 border-t border-cafe-gold/15 space-y-1 text-xs">
          ${renderGridCredits(manga)}
        </div>
      </div>

      <div class="mt-3 pt-2 border-t border-cafe-gold/10 flex items-center justify-between gap-1.5 text-[11px] min-w-0">
        <span class="type-badge truncate min-w-0" title="${escapeHtml(formatTypeTag(manga.type, manga.series))}">
          ${escapeHtml(formatTypeTag(manga.type, manga.series))}
        </span>
        <div class="shrink-0">
          ${renderStatusBadge(manga.status)}
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  mangaGrid.appendChild(fragment);
}

function renderArtistsGrid() {
  const mangaGrid = document.getElementById('mangaGrid');
  if (!mangaGrid) return;
  mangaGrid.innerHTML = '';
  mangaGrid.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5';
  const fragment = document.createDocumentFragment();

  filteredArtists.forEach(a => {
    const edited = isArtistLocallyEdited(a);
    const card = document.createElement('div');
    card.className = `glass-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between cursor-pointer space-y-4 group${edited ? ' local-edit-card' : ''}`;
    card.onclick = () => openArtistPage(a.slug || a.name);

    const initial = (a.romaji || a.name || '?')[0].toUpperCase();
    const avatarHtml = a.image && a.image.trim()
      ? `<div class="w-12 h-12 rounded-full overflow-hidden border border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950 shrink-0 shadow transition-colors"><img src="${a.image}" alt="" class="w-full h-full object-cover"></div>`
      : `<div class="w-12 h-12 rounded-full border border-dashed border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950/80 shrink-0 flex items-center justify-center font-cinzel font-bold text-cafe-cream group-hover:text-cafe-gold text-lg shadow transition-colors">${initial}</div>`;

    const worksCount = a.works_count || (a.works ? a.works.length : 0);
    const topWorks = (a.works || []).slice(0, 2);
    const worksListHtml = topWorks.length > 0
      ? topWorks.map(w => {
          const wItem = allManga.find(m => m.id === w.id);
          const wTitle = (w.title_en && w.title_en.trim() !== '' && w.title_en !== '[no data]') 
            ? w.title_en 
            : (wItem?.title_en || w.title_romaji || w.id);
          return `<div class="text-xs text-cafe-cream/90 truncate max-w-full font-medium">• ${escapeHtml(wTitle)}</div>`;
        }).join('')
      : `<div class="text-xs text-cafe-muted">No works mapped yet.</div>`;

    card.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center gap-3">
          ${avatarHtml}
          <div class="min-w-0">
            <h3 class="font-cinzel font-bold text-base text-cafe-cream group-hover:text-cafe-gold transition-colors truncate" title="${escapeHtml(a.romaji || a.name)}">${escapeHtml(a.romaji || a.name)}</h3>
            ${edited ? `<div class="local-edit-badge mt-1">Edited</div>` : ''}
            ${a.kanji ? `<div class="text-[11px] text-cafe-gold/90 font-japanese font-medium truncate mt-0.5">${escapeHtml(a.kanji)}</div>` : ''}
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <span class="px-2 py-0.5 rounded bg-cafe-950 border border-cafe-gold/25 font-mono-isbn font-bold text-cafe-gold text-xs">
            ${worksCount} Work${worksCount !== 1 ? 's' : ''}
          </span>
          ${a.chapters_count ? `
            <span class="px-2 py-0.5 rounded bg-cafe-950 border border-cafe-gold/25 font-mono-isbn font-bold text-cafe-amber text-xs">
              ${a.chapters_count} Chapters
            </span>
          ` : ''}
        </div>

        <div class="pt-2 border-t border-cafe-gold/15 space-y-1">
          <div class="text-[10px] uppercase font-semibold text-cafe-muted tracking-wider">Representative Works:</div>
          ${worksListHtml}
        </div>
      </div>

      <div class="pt-3 border-t border-cafe-gold/15 flex items-center justify-between text-xs text-cafe-cream/80 group-hover:text-cafe-gold font-semibold transition-colors">
        <span>View Artist Portfolio</span>
        <span class="transition-transform group-hover:translate-x-1">&rarr;</span>
      </div>
    `;

    fragment.appendChild(card);
  });

  mangaGrid.appendChild(fragment);
}

function renderTable() {
  const catalogTableHead = document.getElementById('catalogTableHead');
  if (currentCategory === 'artists') {
    if (catalogTableHead) {
      catalogTableHead.innerHTML = `
        <tr class="border-b-2 border-cafe-gold/30 text-cafe-gold font-cinzel text-xs uppercase tracking-wider">
          <th class="py-3 px-3 min-w-[200px]">Artist</th>
          <th class="py-3 px-3 text-center w-36">Documented Works</th>
          <th class="py-3 px-3 text-center w-28">Chapters</th>
          <th class="py-3 px-3">Illustrated Works</th>
        </tr>
      `;
    }
    renderArtistsTable();
    return;
  }

  if (catalogTableHead) {
    catalogTableHead.innerHTML = `
      <tr class="border-b-2 border-cafe-gold/30 text-cafe-gold font-cinzel text-xs uppercase tracking-wider">
        <th class="py-3 px-3">Cover</th>
        <th class="py-3 px-3">Title</th>
        <th class="py-3 px-3">Type</th>
        <th class="py-3 px-3">Artist(s)</th>
        <th class="py-3 px-3">Status</th>
      </tr>
    `;
  }
  renderMangaTable();
}

function renderMangaTable() {
  const mangaTableBody = document.getElementById('mangaTableBody');
  if (!mangaTableBody) return;
  mangaTableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filteredManga.forEach(manga => {
    const edited = isMangaLocallyEdited(manga);
    const missing = !edited && isMangaMissingMetadata(manga);
    const tr = document.createElement('tr');
    tr.className = `border-b border-cafe-gold/15 hover:bg-cafe-900/60 transition-colors cursor-pointer text-xs sm:text-sm group${edited ? ' local-edit-row' : missing ? ' local-missing-row' : ''}`;
    tr.onclick = () => openMangaDetail(manga.id);

    let coverHtml = '';
    if (hasValidCover(manga.cover)) {
      coverHtml = `
        <div class="w-10 h-14 rounded overflow-hidden border border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950 shrink-0 shadow transition-colors">
          <img src="${manga.cover}" alt="" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading="lazy" onerror="this.parentElement.outerHTML='<div class=\\'no-data-thumb\\'><span class=\\'no-data-badge text-[8px]\\'>[no data]</span></div>';">
        </div>
      `;
    } else {
      coverHtml = `
        <div class="no-data-thumb" title="No cover available">
          <span class="no-data-badge text-[8px]">[no data]</span>
        </div>
      `;
    }

    const { main: mainTitle, jp: jpSubtitle } = resolveDisplayTitles(manga.title_en, manga.title_romaji, manga.title_jp, manga.id);

    tr.innerHTML = `
      <td class="py-2.5 px-3 w-14">${coverHtml}</td>
      <td class="py-2.5 px-3 min-w-[240px]">
        <div class="font-cinzel font-bold text-cafe-cream group-hover:text-cafe-gold text-sm line-clamp-1 leading-snug flex items-center gap-2">
          <span class="truncate">${escapeHtml(mainTitle)}</span>
          ${edited ? `<span class="local-edit-badge shrink-0">Edited</span>` : missing ? `<span class="local-missing-badge shrink-0">Missing</span>` : ''}
        </div>
        ${jpSubtitle ? `
          <div class="text-[11px] text-cafe-gold/90 font-japanese font-medium truncate max-w-[280px] mt-0.5" title="${escapeHtml(jpSubtitle)}">
            ${escapeHtml(jpSubtitle)}
          </div>
        ` : ''}
      </td>
      <td class="py-2.5 px-3 min-w-[110px]"><span class="type-badge">${escapeHtml(formatTypeTag(manga.type, manga.series))}</span></td>
      <td class="py-2.5 px-3 min-w-[130px]">${renderArtistLinks(manga.artists)}</td>
      <td class="py-2.5 px-3">${renderStatusBadge(manga.status)}</td>
    `;

    fragment.appendChild(tr);
  });

  mangaTableBody.appendChild(fragment);
}

function renderArtistsTable() {
  const mangaTableBody = document.getElementById('mangaTableBody');
  if (!mangaTableBody) return;
  mangaTableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  filteredArtists.forEach(a => {
    const edited = isArtistLocallyEdited(a);
    const tr = document.createElement('tr');
    tr.className = `border-b border-cafe-gold/15 hover:bg-cafe-900/60 transition-colors cursor-pointer text-xs sm:text-sm group${edited ? ' local-edit-row' : ''}`;
    tr.onclick = () => openArtistPage(a.slug || a.name);

    const initial = (a.romaji || a.name || '?')[0].toUpperCase();
    const avatarHtml = a.image && a.image.trim()
      ? `<div class="w-9 h-9 rounded-full overflow-hidden border border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950 shrink-0 shadow transition-colors"><img src="${a.image}" alt="" class="w-full h-full object-cover"></div>`
      : `<div class="w-9 h-9 rounded-full border border-dashed border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950/80 shrink-0 flex items-center justify-center font-cinzel font-bold text-cafe-cream group-hover:text-cafe-gold text-xs shadow transition-colors">${initial}</div>`;

    const worksCount = a.works_count || (a.works ? a.works.length : 0);
    const allWorks = a.works || [];
    const topWorks = allWorks.slice(0, 3);
    const extraCount = allWorks.length - topWorks.length;
    let worksListHtml = topWorks.length > 0
      ? topWorks.map(w => {
          const wItem = allManga.find(m => m.id === w.id);
          const wTitle = (w.title_en && w.title_en.trim() !== '' && w.title_en !== '[no data]') 
            ? w.title_en 
            : (wItem?.title_en || w.title_romaji || w.id);
          return `<button onclick="event.stopPropagation(); openMangaDetail('${w.id}');" class="text-cafe-gold hover:underline text-xs block truncate max-w-md text-left font-medium">${escapeHtml(wTitle)}</button>`;
        }).join('')
      : `<span class="text-cafe-muted text-xs">—</span>`;
    if (extraCount > 0) {
      worksListHtml += `<span class="text-[11px] text-cafe-muted italic block">+${extraCount} more</span>`;
    }

    tr.innerHTML = `
      <td class="py-2.5 px-3 min-w-[200px]">
        <div class="flex items-center gap-3">
          ${avatarHtml}
          <div class="min-w-0">
            <span class="font-cinzel font-bold text-cafe-cream group-hover:text-cafe-gold transition-colors text-sm block truncate">${escapeHtml(a.romaji || a.name)}</span>
            ${edited ? `<span class="local-edit-badge mt-1">Edited</span>` : ''}
            ${a.kanji ? `<span class="text-[11px] text-cafe-gold/90 font-japanese block font-medium truncate mt-0.5">${escapeHtml(a.kanji)}</span>` : ''}
          </div>
        </div>
      </td>
      <td class="py-2.5 px-3 text-center w-36">
        <span class="px-2.5 py-0.5 rounded bg-cafe-950 border border-cafe-gold/25 font-mono-isbn font-bold text-cafe-gold text-xs">
          ${worksCount} work${worksCount !== 1 ? 's' : ''}
        </span>
      </td>
      <td class="py-2.5 px-3 text-center w-28">
        <span class="px-2.5 py-0.5 rounded bg-cafe-950 border border-cafe-gold/25 font-mono-isbn font-bold text-cafe-amber text-xs">
          ${a.chapters_count ? `${a.chapters_count} chs` : '—'}
        </span>
      </td>
      <td class="py-2.5 px-3 space-y-0.5">
        ${worksListHtml}
      </td>
    `;

    fragment.appendChild(tr);
  });

  mangaTableBody.appendChild(fragment);
}
