
let currentDetailDoc = null;
let activeMangaIndex = -1;
let editVolumesData = [];
let editAuthorRoles = [];
let editAltTitles = [];
let editGlobalSyncAuthor = true;
let editGlobalShowArtists = true;
let editGlobalOneshot = false;
const sessionUploadedCovers = {};

async function openMangaDetail(id, pushHistory = true) {
  if (!id) return;
  const editingThis = typeof isMangaEditOpen === 'function' && isMangaEditOpen() && currentDetailDoc && (currentDetailDoc.id === id);
  if (!bypassUnsavedLeavePrompt && !editingThis && typeof guardUnsavedEdit === 'function' && isDirectEditOpen()) {
    guardUnsavedEdit(() => { openMangaDetail(id, pushHistory); });
    return;
  }
  const catalogItem = allManga.find(m => m.id === id || (m.series_code && m.series_code.toLowerCase() === id.toLowerCase()));
  if (!catalogItem) return;

  const actualId = catalogItem.id;
  if (typeof currentCategory !== 'undefined' && currentCategory !== 'artists') {
    const nextCategory = catalogItem.archive_kind === 'doujin' ? 'doujins' : 'manga';
    if (currentCategory !== nextCategory) {
      currentCategory = nextCategory;
      if (typeof syncCategoryTabs === 'function') syncCategoryTabs(nextCategory);
    }
  }
  activeMangaIndex = (typeof filteredManga !== 'undefined' ? filteredManga : allManga).findIndex(m => m.id === actualId);
  if (pushHistory) {
    window.location.hash = `manga=${encodeURIComponent(actualId)}`;
  }

  let mangaDoc = sessionMangaDocs[actualId] || null;
  if (catalogItem._isLocallyModified) {
    if (mangaDoc) mangaDoc._isLocallyModified = true;
  }
  if (!mangaDoc) {
    try {
      const res = await fetch(archiveJsonPathForId(actualId), { cache: 'no-cache' });
      if (res.ok) {
        mangaDoc = await res.json();
      }
    } catch (err) {
      console.warn(`Could not load ${archiveJsonPathForId(actualId)} directly. Using catalog fallback.`, err);
    }
  }

  if (!mangaDoc) {
    mangaDoc = {
      id: catalogItem.id,
      title_romaji: catalogItem.title_romaji,
      title_jp: catalogItem.title_jp,
      title_en: catalogItem.title_en,
      series: catalogItem.series,
      type: catalogItem.type,
      release_year: catalogItem.release_year,
      artists: catalogItem.artists || ["[no data]"],
      publisher: catalogItem.publisher || "Unknown",
      cover: catalogItem.cover,
      synopsis: catalogItem.synopsis,
      notes: catalogItem.notes,
      completion_score: catalogItem.completion_score ?? 0,
      volumes: [
        {
          volume_number: 1,
          title: catalogItem.title_en || catalogItem.title_romaji || 'Vol. 1',
          release_date: `${catalogItem.release_year || ''}`,
          isbn: '',
          asin: '',
          cover: catalogItem.cover,
          chapters: []
        }
      ]
    };
  }

  if (catalogItem._isLocallyModified && mangaDoc && !mangaDoc._isLocallyModified) {
    mangaDoc = { ...mangaDoc, _isLocallyModified: true };
  }
  currentDetailDoc = mangaDoc;

  cancelDirectMangaEdit();

  renderDetailContent(mangaDoc);

  if (catalogView) catalogView.classList.add('hidden');
  if (artistFullPageView) artistFullPageView.classList.add('hidden');
  if (publisherFullPageView) publisherFullPageView.classList.add('hidden');
  if (mangaFullPageView) mangaFullPageView.classList.remove('hidden');

  scrollToWikiPriority();
}

function closeFullPageView(updateHistory = true) {
  if (typeof guardUnsavedEdit === 'function') {
    guardUnsavedEdit(() => finishCloseFullPageView(updateHistory));
    return;
  }
  finishCloseFullPageView(updateHistory);
}

async function revertCurrentMangaChanges() {
  if (!currentDetailDoc) return;
  const id = currentDetailDoc.id;
  const title = currentDetailDoc.title_romaji || currentDetailDoc.title_en || id;
  let original = null;
  try {
    const res = await fetch(archiveJsonPathForId(id), { cache: 'no-cache' });
    if (res.ok) original = await res.json();
  } catch (err) {}

  if (!original) {
    showUnsavedLeaveModal([{
      label: title,
      note: 'This title exists only in this session. Reverting removes it.'
    }], () => removeLocalOnlyManga(id), {
      title: 'Revert this title?',
      intro: 'Nothing in the archive file will be restored.',
      confirmLabel: 'Remove local title'
    });
    return;
  }

  showUnsavedLeaveModal([{
    label: title,
    note: 'Local edits will be replaced by the archive file.'
  }], () => applyRevertedManga(id, original), {
    title: 'Revert changes?',
    intro: 'The page will go back to the downloaded archive copy.',
    confirmLabel: 'Revert changes'
  });
}

function removeLocalOnlyManga(id) {
  delete sessionMangaDocs[id];
  const index = allManga.findIndex(manga => manga.id === id);
  if (index >= 0) allManga.splice(index, 1);
  (allArtists || []).forEach(artist => {
    if (!Array.isArray(artist.works)) return;
    const workIndex = artist.works.findIndex(work => work.id === id);
    if (workIndex >= 0) artist.works.splice(workIndex, 1);
    artist.works_count = artist.works.length;
  });
  if (typeof updateStats === 'function') updateStats();
  if (typeof applyFilters === 'function') applyFilters();
  finishCloseFullPageView(true);
  showToastNotification('Local title removed.', 'info');
}

function applyRevertedManga(id, original) {
  delete sessionMangaDocs[id];
  const normalized = normalizeMangaDoc(original, `${id}.json`, archiveFolderForId(id));
  const index = allManga.findIndex(manga => manga.id === id);
  if (index >= 0) allManga[index] = normalized;
  else allManga.push(normalized);
  currentDetailDoc = original;
  if (isMangaEditOpen()) cancelDirectMangaEdit();
  if (typeof updateArtistsFromMangaDoc === 'function') updateArtistsFromMangaDoc(original);
  renderDetailContent(currentDetailDoc);
  if (typeof applyFilters === 'function') applyFilters();
  showToastNotification('Reverted to the archive file.', 'info');
}

function finishCloseFullPageView(updateHistory = true) {
  cancelDirectMangaEdit();
  if (mangaFullPageView) mangaFullPageView.classList.add('hidden');
  if (artistFullPageView) artistFullPageView.classList.add('hidden');
  if (publisherFullPageView) publisherFullPageView.classList.add('hidden');
  if (catalogView) catalogView.classList.remove('hidden');

  currentDetailDoc = null;

  if (updateHistory) {
    if (typeof currentCategory !== 'undefined' && currentCategory === 'artists') {
      window.location.hash = 'artists';
    } else if (typeof currentCategory !== 'undefined' && currentCategory === 'doujins') {
      window.location.hash = 'doujins';
    } else {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
  }
}

function renderDetailContent(manga) {
  const artistsList = (manga.artists || []).filter(a => a && !a.toLowerCase().includes('various') && a !== '[no data]' && a !== '[insufficient data]');

  const titleRomaji = manga.title_romaji || manga.id;
  const titleJp = manga.title_jp || '';
  const titleEn = manga.title_en || '';

  const { main: mainTitle, jp: jpSubtitle } = resolveDisplayTitles(titleEn, titleRomaji, titleJp, manga.id);

  const tMain = document.getElementById('modalTitleMain');
  if (tMain) tMain.textContent = mainTitle;

  const tSub = document.getElementById('modalTitleSubJp');
  if (tSub) {
    tSub.textContent = jpSubtitle;
    tSub.classList.toggle('hidden', !jpSubtitle);
  }

  const mangaMissingNotice = document.getElementById('mangaMissingNotice');
  const mangaMissingNoticeDetails = document.getElementById('mangaMissingNoticeDetails');
  if (mangaMissingNotice) {
    const missingFields = getMangaMissingFields(manga);
    if (missingFields.length > 0) {
      mangaMissingNotice.classList.remove('hidden');
      mangaMissingNotice.hidden = false;
      if (mangaMissingNoticeDetails) {
        mangaMissingNoticeDetails.textContent = missingFields.join(', ');
      }
    } else {
      mangaMissingNotice.classList.add('hidden');
      mangaMissingNotice.hidden = true;
    }
  }

  const isModified = typeof isMangaLocallyEdited === 'function'
    ? isMangaLocallyEdited(manga)
    : Boolean(manga._isLocallyModified || (sessionMangaDocs[manga.id] && sessionMangaDocs[manga.id]._isLocallyModified));
  const localWarningBanner = document.getElementById('mangaLocalWarningBanner');
  if (localWarningBanner) {
    if (isModified) {
      localWarningBanner.classList.remove('hidden');
      localWarningBanner.hidden = false;
    } else {
      localWarningBanner.classList.add('hidden');
      localWarningBanner.hidden = true;
    }
  }
  const revertBtn = document.getElementById('mangaRevertBtn');
  if (revertBtn) revertBtn.classList.toggle('hidden', !isModified);

  const synEl = document.getElementById('modalSynopsis');
  if (synEl) {
    const rawSyn = (manga.synopsis || '').trim();
    if (rawSyn) {
      synEl.innerHTML = renderMarkdown(rawSyn);
    } else {
      synEl.innerHTML = '<span class="no-data-badge">[no data]</span>';
    }
  }

  const notesEl = document.getElementById('modalNotesSection');
  if (notesEl) {
    const rawNotes = (manga.notes || '').trim();
    if (rawNotes) {
      notesEl.innerHTML = renderMarkdown(rawNotes);
    } else {
      notesEl.innerHTML = '<span class="no-data-badge">[no data]</span>';
    }
  }

  const sourcesContainer = document.getElementById('modalSourcesSection');
  if (sourcesContainer) {
    sourcesContainer.innerHTML = renderSourcesList(manga.sources);
  }

  const volumesContainer = document.getElementById('modalVolumesContainer');
  if (!volumesContainer) return;
  volumesContainer.innerHTML = '';

  const volumesList = (manga.volumes && Array.isArray(manga.volumes) && manga.volumes.length > 0)
    ? manga.volumes
    : [
        {
          volume_number: 1,
          title: mainTitle || 'Vol. 1',
          release_date: (manga.release_year ? manga.release_year.toString() : ''),
          isbn: '',
          asin: '',
          cover: getPrimaryCover(manga),
          chapters: manga.chapters || []
        }
      ];

  volumesList.forEach(vol => {
    const volCard = document.createElement('div');
    volCard.className = 'volume-card flex flex-col gap-3';

      const hasVolCover = hasValidCover(vol.cover);
      let coverHtml = '';
      if (hasVolCover) {
        coverHtml = `
          <div class="relative group w-16 h-24 sm:w-20 sm:h-28 rounded-lg overflow-hidden border border-cafe-gold/30 hover:border-cafe-gold shrink-0 bg-cafe-950 shadow-md hover:shadow-xl cursor-pointer transition-all duration-300"
               onclick="openVolumeCover('${escapeHtml(vol.cover)}', '${escapeHtml(vol.title || '')}')"
               title="Click to view full size cover">
            <img src="${vol.cover}" alt="${escapeHtml(vol.title || '')}" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onerror="this.parentElement.outerHTML='<div class=\\'no-data-cover\\'><span class=\\'no-data-badge\\'>[no data]</span></div>';">
            <div class="absolute inset-0 bg-cafe-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center pointer-events-none">
              <span class="p-1 sm:px-1.5 sm:py-0.5 rounded-full bg-cafe-950/90 border border-cafe-gold/60 text-cafe-gold shadow-lg flex items-center gap-1" title="View Full Size">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/></svg>
                <span class="hidden sm:inline text-[9px] font-semibold">View</span>
              </span>
            </div>
          </div>
        `;
      } else {
        coverHtml = `
          <div class="no-data-cover" title="No volume cover available">
            <svg class="w-5 h-5 text-cafe-gold/35 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
            <span class="no-data-badge">[no data]</span>
          </div>
        `;
      }

      let chaptersSectionHtml = '';
      if (vol.chapters && vol.chapters.length > 0) {
        const showArtists = manga.show_chapter_artists !== false;
        const chaptersListHtml = vol.chapters.map(ch => {
          const effectiveArtist = (ch.artist && ch.artist.trim() && ch.artist !== '[no data]' && ch.artist !== '[insufficient data]')
            ? ch.artist
            : null;
          const artistHtml = (effectiveArtist && showArtists)
            ? `<span class="text-cafe-muted/80 shrink-0">by</span> <button onclick="openArtistPage('${escapeHtml(effectiveArtist)}')" class="text-cafe-gold hover:underline truncate">${escapeHtml(effectiveArtist)}</button>`
            : '';
          return renderChapterRow(ch, artistHtml);
        }).join('');

        chaptersSectionHtml = `
          <div class="chapter-list-scroll mt-2">
            ${chaptersListHtml}
          </div>
        `;
      }

      let isbnHtml = '';
      if (isNA(vol.isbn)) {
        isbnHtml = '';
      } else if (vol.isbn && vol.isbn.trim() && vol.isbn !== 'TBD' && vol.isbn !== '[no data]') {
        isbnHtml = `
          <span class="font-mono-isbn text-xs text-cafe-amber inline-flex items-center gap-1.5 cursor-pointer hover:underline"
               onclick="copyText('${vol.isbn}', this);" title="Click to copy ISBN">
            <span class="text-cafe-muted font-sans">ISBN:</span>
            <span>${vol.isbn}</span>
          </span>
        `;
      } else {
        isbnHtml = `
          <span class="text-xs text-cafe-muted inline-flex items-center gap-1.5">
            <span>ISBN:</span>
            <span class="no-data-badge">[no data]</span>
          </span>
        `;
      }

      let asinHtml = '';
      if (isNA(vol.asin)) {
        asinHtml = '';
      } else if (vol.asin && vol.asin.trim() && vol.asin !== '[no data]') {
        asinHtml = `
          <span class="font-mono-isbn text-xs text-cafe-amber inline-flex items-center gap-1.5 cursor-pointer hover:underline"
               onclick="copyText('${vol.asin}', this);" title="Click to copy Amazon ASIN">
            <span class="text-cafe-muted font-sans">ASIN:</span>
            <span>${vol.asin}</span>
          </span>
        `;
      }

      let dateHtml = '';
      if (isNA(vol.release_date)) {
        dateHtml = '';
      } else if (vol.release_date && vol.release_date.trim() && vol.release_date !== '[no data]') {
        dateHtml = `<span>Released: <strong class="text-cafe-cream">${vol.release_date}</strong></span>`;
      } else {
        dateHtml = `<span>Released: <span class="no-data-badge">[no data]</span></span>`;
      }

      const rawVolNum = (vol.volume_number !== undefined && vol.volume_number !== null) ? String(vol.volume_number).trim() : '';
      const isUncollected = vol.is_uncollected === true || ['uncollected', 'serialized', '[no volume]', 'no volume'].includes(rawVolNum.toLowerCase());
      let volBadge = '';
      if (!isUncollected && rawVolNum && rawVolNum !== 'N/A') {
        volBadge = /^\d+(\.\d+)?$/.test(rawVolNum) ? `Vol. ${rawVolNum}` : rawVolNum;
      }

      const t = (vol.title || '').trim();
      const tJp = (vol.title_jp || '').trim();

      let headerHtml = '';
      if (t) {
        headerHtml = `
          <div class="flex flex-wrap items-center gap-2">
            ${volBadge ? `<span class="px-2 py-0.5 rounded text-xs font-bold font-mono-isbn bg-cafe-gold/20 text-cafe-gold border border-cafe-gold/40 shrink-0 select-none">${escapeHtml(volBadge)}</span>` : ''}
            <span class="text-sm sm:text-base font-bold text-cafe-cream font-cinzel leading-snug">${escapeHtml(t)}</span>
          </div>
          ${tJp ? `<div class="text-xs text-cafe-gold/90 font-japanese font-medium mt-1">${escapeHtml(tJp)}</div>` : ''}
        `;
      } else if (volBadge) {
        headerHtml = `
          <div class="text-sm sm:text-base font-bold text-cafe-cream font-cinzel leading-snug">${escapeHtml(volBadge)}</div>
          ${tJp ? `<div class="text-xs text-cafe-gold/90 font-japanese font-medium mt-1">${escapeHtml(tJp)}</div>` : ''}
        `;
      } else {
        const fallback = isUncollected ? 'Serialized Chapters' : (manga.title_en || manga.title_romaji || manga.id);
        headerHtml = `
          <div class="text-sm sm:text-base font-bold text-cafe-cream font-cinzel leading-snug">${escapeHtml(fallback)}</div>
          ${tJp ? `<div class="text-xs text-cafe-gold/90 font-japanese font-medium mt-1">${escapeHtml(tJp)}</div>` : ''}
        `;
      }

      volCard.innerHTML = `
        <div class="flex gap-4 items-start">
          ${coverHtml}
          <div class="flex-1 min-w-0">
            <div class="space-y-0.5">
              ${headerHtml}
            </div>
            ${!isUncollected ? `
            <div class="text-xs text-cafe-muted mt-2 flex flex-wrap items-center gap-4">
              ${dateHtml}
              ${isbnHtml}
              ${asinHtml}
            </div>
            ` : ''}
          </div>
        </div>
        ${chaptersSectionHtml}
      `;
      volumesContainer.appendChild(volCard);
    });

  const infoboxCover = document.getElementById('infoboxCoverImg');
  const infoboxCoverCaption = document.getElementById('infoboxCoverCaption');
  const infoboxCoverSelector = document.getElementById('infoboxCoverSelector');
  const existingPlaceholder = document.getElementById('infoboxNoCoverPlaceholder');
  if (existingPlaceholder) existingPlaceholder.remove();

  const coversList = getMangaCoversList(manga);

  if (coversList.length > 0 && infoboxCover) {
    const currentCover = coversList[0];
    infoboxCover.src = currentCover.url;
    infoboxCover.classList.remove('hidden');

    if (coversList.length === 1) {
      if (infoboxCoverCaption) {
        infoboxCoverCaption.textContent = 'Cover';
        infoboxCoverCaption.classList.remove('hidden');
      }
      if (infoboxCoverSelector) {
        infoboxCoverSelector.innerHTML = '';
        infoboxCoverSelector.classList.add('hidden');
      }
    } else {
      if (infoboxCoverCaption) {
        infoboxCoverCaption.textContent = '';
        infoboxCoverCaption.classList.add('hidden');
      }
      if (infoboxCoverSelector) {
        infoboxCoverSelector.innerHTML = '';
        infoboxCoverSelector.classList.remove('hidden');

        coversList.forEach((cov, idx) => {
          if (idx > 0) {
            const sep = document.createElement('span');
            sep.className = 'text-cafe-gold/30 text-xs select-none px-0.5';
            sep.textContent = '|';
            infoboxCoverSelector.appendChild(sep);
          }

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `px-2 py-0.5 rounded text-[11px] transition-all ${idx === 0 ? 'bg-cafe-gold text-cafe-950 font-bold shadow-sm' : 'text-cafe-cream/80 hover:text-cafe-gold hover:bg-cafe-900/80 border border-cafe-gold/20'}`;
          btn.textContent = cov.label;
          btn.title = `Switch to ${cov.label}`;
          btn.onclick = () => {
            infoboxCover.src = cov.url;
            if (infoboxCoverCaption) infoboxCoverCaption.textContent = cov.label;
            const buttons = infoboxCoverSelector.querySelectorAll('button');
            buttons.forEach((b, bIdx) => {
              if (bIdx === idx) {
                b.className = 'px-2 py-0.5 rounded text-[11px] transition-all bg-cafe-gold text-cafe-950 font-bold shadow-sm';
              } else {
                b.className = 'px-2 py-0.5 rounded text-[11px] transition-all text-cafe-cream/80 hover:text-cafe-gold hover:bg-cafe-900/80 border border-cafe-gold/20';
              }
            });
          };
          infoboxCoverSelector.appendChild(btn);
        });
      }
    }

    infoboxCover.onerror = () => {
      infoboxCover.classList.add('hidden');
      if (!document.getElementById('infoboxNoCoverPlaceholder')) {
        const noCov = document.createElement('div');
        noCov.id = 'infoboxNoCoverPlaceholder';
        noCov.className = 'w-full py-12 flex flex-col items-center justify-center text-center bg-cafe-950/70 border border-dashed border-cafe-gold/30 rounded-lg';
        noCov.innerHTML = '<span class="no-data-badge text-xs">[no data]</span><span class="text-[10px] text-cafe-muted mt-2">No cover image available</span>';
        infoboxCover.parentElement.appendChild(noCov);
      }
    };
  } else if (infoboxCover) {
    infoboxCover.classList.add('hidden');
    if (infoboxCoverCaption) infoboxCoverCaption.classList.add('hidden');
    if (infoboxCoverSelector) {
      infoboxCoverSelector.innerHTML = '';
      infoboxCoverSelector.classList.add('hidden');
    }
    const noCov = document.createElement('div');
    noCov.id = 'infoboxNoCoverPlaceholder';
    noCov.className = 'w-full py-12 flex flex-col items-center justify-center text-center bg-cafe-950/70 border border-dashed border-cafe-gold/30 rounded-lg';
    noCov.innerHTML = '<span class="no-data-badge text-xs">[no data]</span><span class="text-[10px] text-cafe-muted mt-2">No cover image available</span>';
    infoboxCover.parentElement.appendChild(noCov);
  }

  function setInfoboxRowVisibility(el, isHidden) {
    if (!el) return;
    const tr = el.closest('tr');
    if (tr) {
      tr.classList.toggle('hidden', Boolean(isHidden));
      tr.style.display = isHidden ? 'none' : '';
    }
  }

  const authorsEl = document.getElementById('infoboxAuthors');
  if (authorsEl) {
    const rolesList = (manga.custom_roles && Array.isArray(manga.custom_roles)) ? manga.custom_roles : [];

    const hasArt = artistsList.length > 0 && !artistsList.includes('[no data]') && !artistsList.includes('[insufficient data]') && !artistsList.every(isNA);
    const artHtml = hasArt ? artistsList.map(a => `
      <button onclick="openArtistPage('${escapeHtml(a)}')" class="text-cafe-gold hover:underline font-semibold text-left inline-flex items-center gap-1">
        <span>${escapeHtml(a)}</span>
      </button>
    `).join(', ') : '';

    const isAuthorsNA = Array.isArray(manga.artists) && manga.artists.length > 0 && manga.artists.every(isNA);

    if (rolesList.length > 0 || hasArt) {
      setInfoboxRowVisibility(authorsEl, false);
      const rolesHtml = rolesList.map(r => {
        const rawRole = r.role || 'Story:';
        const rName = rawRole.endsWith(':') ? rawRole : rawRole + ':';
        const namesList = typeof r.names === 'string' ? r.names.split(',').map(s => s.trim()).filter(Boolean) : (Array.isArray(r.names) ? r.names : [r.names]);
        const namesHtml = namesList.map(n => `<span class="text-white">${escapeHtml(n)}</span>`).join(', ');
        return `<div><span class="text-white text-[11px] font-medium">${escapeHtml(rName)}</span> ${namesHtml}</div>`;
      }).join('');

      const artRowHtml = hasArt ? `<div><span class="text-white text-[11px] font-medium">Mangaka:</span> ${artHtml}</div>` : '';

      authorsEl.innerHTML = `
        <div class="flex flex-col gap-1">
          ${rolesHtml}
          ${artRowHtml}
        </div>
      `;
    } else if (isAuthorsNA) {
      setInfoboxRowVisibility(authorsEl, true);
      authorsEl.innerHTML = '';
    } else {
      setInfoboxRowVisibility(authorsEl, false);
      authorsEl.innerHTML = '<span class="no-data-badge">[no data]</span>';
    }
  }

  const pubEl = document.getElementById('infoboxPublisher');
  if (pubEl) {
    if (isNA(manga.publisher)) {
      setInfoboxRowVisibility(pubEl, true);
      pubEl.innerHTML = '';
    } else {
      setInfoboxRowVisibility(pubEl, false);
      if (manga.publisher && manga.publisher !== 'Unknown' && manga.publisher !== '[no data]') {
        pubEl.innerHTML = `<button onclick="openPublisherPage('${escapeHtml(manga.publisher)}')" class="text-cafe-gold hover:underline font-semibold text-left transition-colors">${escapeHtml(manga.publisher)}</button>`;
      } else {
        pubEl.innerHTML = '<span class="no-data-badge">[no data]</span>';
      }
    }
  }

  const serEl = document.getElementById('infoboxSerializedIn');
  if (serEl) {
    const sVal = manga.magazine;
    if (isNA(sVal)) {
      setInfoboxRowVisibility(serEl, true);
      serEl.innerHTML = '';
    } else {
      setInfoboxRowVisibility(serEl, false);
      serEl.innerHTML = renderValueOrNoData(sVal);
    }
  }

  const statEl = document.getElementById('infoboxStatus');
  if (statEl) {
    if (isNA(manga.status)) {
      setInfoboxRowVisibility(statEl, true);
      statEl.innerHTML = '';
    } else {
      setInfoboxRowVisibility(statEl, false);
      statEl.innerHTML = renderStatusBadge(manga.status);
    }
  }

  const typeEl = document.getElementById('infoboxType');
  if (typeEl) {
    if (isNA(manga.type)) {
      setInfoboxRowVisibility(typeEl, true);
      typeEl.innerHTML = '';
    } else {
      setInfoboxRowVisibility(typeEl, false);
      typeEl.className = 'text-white font-medium';
      typeEl.innerHTML = renderValueOrNoData(manga.type);
    }
  }

  const seriesEl = document.getElementById('infoboxSeries');
  if (seriesEl) {
    const serVal = manga.series;
    if (isNA(serVal)) {
      setInfoboxRowVisibility(seriesEl, true);
      seriesEl.innerHTML = '';
    } else {
      setInfoboxRowVisibility(seriesEl, false);
      seriesEl.className = 'text-white font-medium';
      seriesEl.innerHTML = renderValueOrNoData(serVal);
    }
  }

  [['infoboxSerializationStart', manga.serialization_start], ['infoboxSerializationEnd', manga.serialization_end]].forEach(([elId, val]) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (isNA(val)) {
      setInfoboxRowVisibility(el, true);
      el.innerHTML = '';
    } else {
      setInfoboxRowVisibility(el, false);
      el.innerHTML = renderValueOrNoData(val, true);
    }
  });
}

function hasUploadedCoversForDoc(doc) {
  if (!doc) return false;
  const id = doc.id;
  for (const p of Object.keys(sessionUploadedCovers)) {
    if (p.includes(id)) return true;
  }
  const paths = [doc.cover, ...(doc.volumes || []).map(v => v.cover)];
  return paths.some(p => p && sessionUploadedCovers[p]);
}

function updateExportZipButtonsVisibility() {
  const hasCovers = currentDetailDoc && hasUploadedCoversForDoc(currentDetailDoc);
  const topBtn = document.getElementById('mangaDownloadZipBtn');
  if (topBtn) {
    if (hasCovers) topBtn.classList.remove('hidden');
    else topBtn.classList.add('hidden');
  }
  const editTopBtn = document.getElementById('mangaEditDownloadZipBtn');
  if (editTopBtn) {
    if (hasCovers) editTopBtn.classList.remove('hidden');
    else editTopBtn.classList.add('hidden');
  }
  const bannerZipBtn = document.getElementById('mangaBannerDownloadZipBtn');
  if (bannerZipBtn) {
    if (hasCovers) bannerZipBtn.classList.remove('hidden');
    else bannerZipBtn.classList.add('hidden');
  }
  const bannerText = document.getElementById('mangaLocalWarningBannerText');
  if (bannerText) {
    if (hasCovers) {
      bannerText.textContent = 'This page is currently displayed with local session changes, including newly uploaded cover images. Download ZIP package to preserve both your data and images.';
    } else {
      bannerText.textContent = 'This page is currently displayed with local session changes. Download JSON to preserve your changes or contribute them to the archive.';
    }
  }
}

function updateInfoboxCoverLive(url) {
  const img = document.getElementById('infoboxCoverImg');
  if (img && url && url.trim()) {
    img.src = url.trim();
    img.classList.remove('hidden');
    const placeholder = document.getElementById('infoboxNoCoverPlaceholder');
    if (placeholder) placeholder.remove();
  }
}

function syncVol1ToMainCover(val, previewUrl) {
  updateInfoboxCoverLive(previewUrl || val);
}

async function generateCoverVariants(file) {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined' || !file || !file.type || !file.type.startsWith('image/')) {
      resolve({ full: file, small: file });
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;
      const mimeType = file.type || 'image/jpeg';

      const createVariantBlob = (targetWidth) => {
        return new Promise((resBlob) => {
          try {
            const canvas = document.createElement('canvas');
            let w = origW;
            let h = origH;
            if (origW > targetWidth) {
              w = targetWidth;
              h = Math.round(origH * (targetWidth / origW));
            }
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              resBlob(blob || file);
            }, mimeType, 0.90);
          } catch (e) {
            console.warn('Canvas resizing error', e);
            resBlob(file);
          }
        });
      };

      createVariantBlob(400).then((smallBlob) => {
        resolve({
          full: file,           
          small: smallBlob
        });
      }).catch(() => {
        resolve({ full: file, small: file });
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ full: file, small: file });
    };

    img.src = objectUrl;
  });
}

function triggerVolumeCoverUpload(vIdx) {
  const input = document.getElementById(`volCoverFileInput_${vIdx}`);
  if (input) input.click();
}

function handleVolumeCoverFileSelected(vIdx, file) {
  if (!file) return;
  const mangaId = currentDetailDoc?.id || 'manga';
  const vol = editVolumesData[vIdx];
  const volNum = vol?.volume_number || (vIdx + 1);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const baseName = `${mangaId}-vol-${volNum}.${ext}`;

  const fullPath = `assets/covers/full/${baseName}`;
  const smallPath = `assets/covers/small/${baseName}`;

  sessionUploadedCovers[fullPath] = file;
  sessionUploadedCovers[smallPath] = file;

  const previewUrl = URL.createObjectURL(file);
  if (vol) {
    vol.cover = smallPath;
    vol.cover_full = fullPath;
  }

  const inputEl = document.getElementById(`volCoverInput_${vIdx}`);
  if (inputEl) inputEl.value = smallPath;
  const fullInputEl = document.getElementById(`volCoverFullInput_${vIdx}`);
  if (fullInputEl) fullInputEl.value = fullPath;

  const previewImg = document.getElementById(`volCoverPreview_${vIdx}`);
  if (previewImg) {
    previewImg.src = previewUrl;
    previewImg.classList.remove('hidden');
    const placeholder = document.getElementById(`volCoverNoCover_${vIdx}`);
    if (placeholder) placeholder.classList.add('hidden');
  }

  if (vIdx === 0) {
    syncVol1ToMainCover(smallPath, previewUrl);
  }

  updateExportZipButtonsVisibility();

  generateCoverVariants(file).then(variants => {
    sessionUploadedCovers[fullPath] = variants.full;
    sessionUploadedCovers[smallPath] = variants.small;
    if (previewImg && variants.small && variants.small !== file) {
      previewImg.src = URL.createObjectURL(variants.small);
    }
  }).catch(e => console.warn('Variant generation error', e));

  showToastNotification(`Volume ${volNum} cover uploaded! (Full & 400px small variant ready)`, 'info');
}

function onVolumeCoverInputChanged(vIdx, val) {
  if (!editVolumesData[vIdx]) return;
  editVolumesData[vIdx].cover = val;
  const previewImg = document.getElementById(`volCoverPreview_${vIdx}`);
  if (previewImg) {
    if (val && val.trim()) {
      previewImg.src = val.trim();
      previewImg.classList.remove('hidden');
      const placeholder = document.getElementById(`volCoverNoCover_${vIdx}`);
      if (placeholder) placeholder.classList.add('hidden');
    } else {
      previewImg.classList.add('hidden');
      const placeholder = document.getElementById(`volCoverNoCover_${vIdx}`);
      if (placeholder) placeholder.classList.remove('hidden');
    }
  }
  if (vIdx === 0) {
    syncVol1ToMainCover(val, val);
  }
}

function onVolumeCoverFullInputChanged(vIdx, val) {
  if (!editVolumesData[vIdx]) return;
  editVolumesData[vIdx].cover_full = val;
}

function renderAuthorRolesInPlace() {
  const container = document.getElementById('editAuthorRolesList');
  if (!container) return;
  if (editAuthorRoles.length === 0) {
    container.innerHTML = '<div class="text-[10px] text-cafe-muted italic py-0.5">No custom roles added. Click "+ Add Role" to add one.</div>';
    return;
  }
  container.innerHTML = editAuthorRoles.map((r, rIdx) => `
    <div class="flex items-center gap-1.5">
      <input type="text" value="${escapeHtml(r.role || 'Story:')}" placeholder="Role (e.g. Story:)"
             data-role-suggest="true" autocomplete="off"
             oninput="editAuthorRoles[${rIdx}].role = this.value"
             class="w-32 px-1.5 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-amber text-xs font-semibold outline-none focus:border-cafe-gold shrink-0">
      <input type="text" value="${escapeHtml(r.names || '')}" placeholder="Contributor(s) (e.g. TYPE-MOON, Marvelous)"
             data-credit-suggest="true" autocomplete="off"
             oninput="editAuthorRoles[${rIdx}].names = this.value"
             class="flex-1 min-w-0 px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs outline-none focus:border-cafe-gold">
      <button type="button" onclick="removeAuthorRoleInPlace(${rIdx})" class="p-1 text-red-400 hover:text-red-300 transition-colors shrink-0" title="Remove role">
        &times;
      </button>
    </div>
  `).join('');
}

function addAuthorRoleInPlace(roleName = 'Story:', names = '') {
  editAuthorRoles.push({ role: roleName, names: names });
  renderAuthorRolesInPlace();
}

function removeAuthorRoleInPlace(rIdx) {
  editAuthorRoles.splice(rIdx, 1);
  renderAuthorRolesInPlace();
}

function renderAltTitlesEditor() {
  const container = document.getElementById('editAltTitlesList');
  if (!container) return;
  if (editAltTitles.length === 0) {
    container.innerHTML = '<div class="text-[10px] text-cafe-muted italic py-0.5">No alternative titles yet.</div>';
    return;
  }
  container.innerHTML = editAltTitles.map((title, idx) => `
    <div class="flex items-center gap-1.5">
      <input type="text" value="${escapeHtml(title || '')}" placeholder="Alternative title"
             oninput="editAltTitles[${idx}] = this.value"
             class="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-cafe-900 border border-cafe-gold/35 text-cafe-cream text-xs outline-none focus:border-cafe-gold">
      <button type="button" onclick="removeAltTitleInPlace(${idx})" class="p-1 text-red-400 hover:text-red-300 transition-colors shrink-0" title="Remove title">&times;</button>
    </div>
  `).join('');
}

function addAltTitleInPlace() {
  editAltTitles.push('');
  renderAltTitlesEditor();
  const inputs = document.querySelectorAll('#editAltTitlesList input');
  const last = inputs[inputs.length - 1];
  if (last) last.focus();
}

function removeAltTitleInPlace(idx) {
  editAltTitles.splice(idx, 1);
  renderAltTitlesEditor();
}

function collectAltTitlesForSave() {
  const seen = new Set();
  const titles = [];
  editAltTitles.forEach(title => {
    const clean = (title || '').trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) return;
    seen.add(key);
    titles.push(clean);
  });
  return titles;
}

function syncArtToAuthors() {
  const artistsSet = new Set();
  const collect = (artistStr) => {
    if (!artistStr) return;
    const parts = artistStr.split(',').map(s => s.trim().replace(/^[,]+|[,]+$/g, '')).filter(Boolean);
    parts.forEach(p => {
      if (p && p !== '[no data]' && p !== '[insufficient data]') {
        artistsSet.add(p);
      }
    });
  };

  (editVolumesData || []).forEach(v => {
    (v.chapters || []).forEach(c => collect(c.artist));
  });

  const artInput = document.getElementById('editInfoboxArtists');
  if (artInput) {
    if (artistsSet.size > 0) {
      artInput.value = Array.from(artistsSet).join(', ');
    } else if (currentDetailDoc && currentDetailDoc.artists && Array.isArray(currentDetailDoc.artists) && currentDetailDoc.artists.length > 0) {
      const existing = currentDetailDoc.artists.filter(a => a && a !== '[no data]' && a !== '[insufficient data]');
      artInput.value = existing.length > 0 ? existing.join(', ') : '[no data]';
    } else {
      artInput.value = '[no data]';
    }
  }
}

function toggleGlobalSyncAuthor(isChecked = true) {
  editGlobalSyncAuthor = !!isChecked;
  if (editGlobalSyncAuthor) {
    let primaryArtist = '';
    for (const vol of editVolumesData) {
      for (const ch of (vol.chapters || [])) {
        if (ch.artist && ch.artist.trim() && ch.artist !== '[no data]' && ch.artist !== '[insufficient data]') {
          primaryArtist = ch.artist.trim().replace(/^[,]+|[,]+$/g, '');
          break;
        }
      }
      if (primaryArtist) break;
    }
    if (!primaryArtist) {
      const infoArt = document.getElementById('editInfoboxArtists')?.value.trim();
      if (infoArt && infoArt !== '[no data]' && infoArt !== '[insufficient data]') {
        primaryArtist = infoArt;
      }
    }
    if (primaryArtist) {
      editVolumesData.forEach(v => {
        (v.chapters || []).forEach(c => {
          c.artist = primaryArtist;
        });
      });
      syncArtToAuthors();
    }
  }
  renderVolumesInPlaceEdit();
}

function toggleGlobalShowArtists(isChecked = true) {
  editGlobalShowArtists = !!isChecked;
  renderVolumesInPlaceEdit();
}

function toggleGlobalOneshot(isChecked = true) {
  editGlobalOneshot = !!isChecked;
  if (editVolumesData.length === 0) {
    addVolumeInPlace();
  }
  const vol1 = editVolumesData[0];
  if (!vol1.chapters) vol1.chapters = [];

  if (isChecked) {
    if (vol1.chapters.length === 0) {
      let curArt = '';
      for (const v of editVolumesData) {
        for (const c of (v.chapters || [])) {
          if (c.artist && c.artist.trim()) { curArt = c.artist.trim(); break; }
        }
        if (curArt) break;
      }
      if (!curArt) {
        const infoArt = document.getElementById('editInfoboxArtists')?.value.trim() || '';
        if (infoArt && infoArt !== '[no data]') curArt = infoArt;
      }
      vol1.chapters.push({
        chapter: 'Oneshot',
        title: '',
        title_jp: '',
        artist: curArt
      });
    } else {
      vol1.chapters[0].chapter = 'Oneshot';
      if (!vol1.chapters[0].title || /^chapter\s*1?$/i.test(vol1.chapters[0].title)) {
        vol1.chapters[0].title = '';
      }
    }
  } else {
    if (vol1.chapters.length > 0 && vol1.chapters[0].chapter === 'Oneshot') {
      vol1.chapters[0].chapter = '1';
      if (!vol1.chapters[0].title || vol1.chapters[0].title === 'Chapter 1') {
        vol1.chapters[0].title = '';
      }
    }
  }
  renderVolumesInPlaceEdit();
  syncArtToAuthors();
}

function toggleVolumeUncollected(vIdx, isChecked) {
  if (vIdx === null || !editVolumesData[vIdx]) return;
  editVolumesData[vIdx].is_uncollected = !!isChecked;

  const grid = document.getElementById(`volIdentifiersGrid_${vIdx}`);
  const releaseInput = document.getElementById(`volReleaseDateInput_${vIdx}`);
  const isbnInput = document.getElementById(`volIsbnInput_${vIdx}`);
  const asinInput = document.getElementById(`volAsinInput_${vIdx}`);
  const volNumInput = document.getElementById(`volNumberInput_${vIdx}`);

  if (isChecked) {
    if (grid) grid.classList.add('hidden');
    if (releaseInput) { releaseInput.disabled = true; releaseInput.value = ''; }
    if (isbnInput) { isbnInput.disabled = true; isbnInput.value = ''; }
    if (asinInput) { asinInput.disabled = true; asinInput.value = ''; }
    editVolumesData[vIdx].release_date = '';
    editVolumesData[vIdx].isbn = '';
    editVolumesData[vIdx].asin = '';
    if (volNumInput && (!volNumInput.value.trim() || volNumInput.value.toLowerCase().startsWith('vol.'))) {
      volNumInput.placeholder = 'Serialized / Non-volume';
    }
  } else {
    if (grid) grid.classList.remove('hidden');
    if (releaseInput) releaseInput.disabled = false;
    if (isbnInput) isbnInput.disabled = false;
    if (asinInput) asinInput.disabled = false;
    if (volNumInput && (!volNumInput.value.trim() || volNumInput.placeholder === 'Serialized / Non-volume')) {
      volNumInput.value = `Vol. ${vIdx + 1}`;
      editVolumesData[vIdx].volume_number = `Vol. ${vIdx + 1}`;
    }
  }
}

function updateChapterArtist(vIdx, cIdx, val) {
  if (vIdx === null || !editVolumesData[vIdx] || !editVolumesData[vIdx].chapters[cIdx]) return;
  editVolumesData[vIdx].chapters[cIdx].artist = val;

  if (editGlobalSyncAuthor) {
    editVolumesData.forEach(v => {
      (v.chapters || []).forEach(c => {
        c.artist = val;
      });
    });
    const inputs = document.querySelectorAll('[data-ch-artist-input]');
    inputs.forEach(inp => {
      inp.value = val;
    });
  }
  syncArtToAuthors();
}

function insertChapterAt(vIdx, prevIdx = -1, type = 'full') {
  if (vIdx === null || !editVolumesData[vIdx]) return;
  const vol = editVolumesData[vIdx];
  vol.chapters = vol.chapters || [];
  const chs = vol.chapters;

  let defaultArtist = '';
  if (editGlobalSyncAuthor) {
    for (const v of editVolumesData) {
      for (const c of (v.chapters || [])) {
        if (c.artist && c.artist.trim()) {
          defaultArtist = c.artist.trim();
          break;
        }
      }
      if (defaultArtist) break;
    }
    if (!defaultArtist) {
      const infoArt = document.getElementById('editInfoboxArtists')?.value.trim() || '';
      if (infoArt && infoArt !== '[no data]') defaultArtist = infoArt;
    }
  } else {
    defaultArtist = chs.length > 0 ? (chs[0]?.artist || '') : '';
  }

  if (prevIdx === -1) {

    let newChapter = '1';
    let defaultTitle = '';
    if (type === 'half') {
      newChapter = '0.5';
      defaultTitle = 'Extra';
    } else {
      newChapter = '1';
      defaultTitle = '';
      chs.forEach(c => {
        const num = parseFloat(c.chapter);
        if (!isNaN(num) && num >= 1) {
          const bumped = num + 1;
          c.chapter = bumped.toString();
          if (c.title && c.title.toLowerCase() === `chapter ${num}`) {
            c.title = `Chapter ${bumped}`;
          }
        }
      });
    }
    chs.unshift({
      chapter: newChapter,
      title: defaultTitle,
      title_jp: '',
      artist: defaultArtist
    });
  } else {

    const insertAt = prevIdx + 1;
    const prevCh = chs[prevIdx];
    const prevNum = prevCh ? parseFloat(prevCh.chapter) : NaN;
    const art = (editGlobalSyncAuthor && defaultArtist) ? defaultArtist : (prevCh?.artist || defaultArtist);

    let newChapter = '';
    let defaultTitle = '';

    if (type === 'half') {
      newChapter = !isNaN(prevNum) ? (Math.floor(prevNum) + 0.5).toString() : `${prevCh ? prevCh.chapter : (prevIdx + 1)}.5`;
      defaultTitle = 'Extra';
    } else {
      const nextInt = !isNaN(prevNum) ? Math.floor(prevNum) + 1 : (prevIdx + 2);
      newChapter = nextInt.toString();
      defaultTitle = '';
      for (let i = insertAt; i < chs.length; i++) {
        const num = parseFloat(chs[i].chapter);
        if (!isNaN(num) && num >= nextInt) {
          const bumped = num + 1;
          chs[i].chapter = bumped.toString();
          if (chs[i].title && chs[i].title.toLowerCase() === `chapter ${num}`) {
            chs[i].title = `Chapter ${bumped}`;
          }
        }
      }
    }

    chs.splice(insertAt, 0, {
      chapter: newChapter,
      title: defaultTitle,
      title_jp: '',
      artist: art
    });
  }

  renderVolumesInPlaceEdit();
  syncArtToAuthors();
}

function renderChapterInsertDivider(vIdx, prevIdx = -1) {
  return `
    <div class="flex items-center justify-center gap-1.5 py-0.5 my-0.5">
      <div class="h-px bg-cafe-gold/15 flex-1"></div>
      <button type="button" onclick="insertChapterAt(${vIdx}, ${prevIdx}, 'full')" class="px-2 py-0.5 rounded bg-cafe-950 hover:bg-cafe-900 border border-cafe-gold/30 hover:border-cafe-gold text-cafe-gold text-[10px] font-semibold transition-colors flex items-center gap-1 shadow-sm">
        <span>+ Full Ch.</span>
      </button>
      <button type="button" onclick="insertChapterAt(${vIdx}, ${prevIdx}, 'half')" class="px-2 py-0.5 rounded bg-cafe-950 hover:bg-cafe-900 border border-cafe-amber/40 hover:border-cafe-amber text-cafe-amber text-[10px] font-semibold transition-colors flex items-center gap-1 shadow-sm">
        <span>+ Half Ch. (.5 / Extra)</span>
      </button>
      <div class="h-px bg-cafe-gold/15 flex-1"></div>
    </div>
  `;
}

const insertChapterBeforeFirst = (vIdx = 0, type = 'full') => insertChapterAt(vIdx, -1, type);
const insertChapterBetween = (vIdx = 0, prevIdx = -1, type = 'full') => insertChapterAt(vIdx, prevIdx, type);
const toggleChapterOneshotCheckbox = (vIdx = 0, isChecked = true) => toggleGlobalOneshot(isChecked);
const toggleChapterOneshot = (vIdx = 0, cIdx = 0) => toggleGlobalOneshot(true);
const toggleSyncAuthorCheckbox = (vIdx = 0, isChecked = true) => toggleGlobalSyncAuthor(isChecked);
const syncAuthorFromFirstChapter = (vIdx = 0) => toggleGlobalSyncAuthor(true);
const toggleShowChapterArtists = (vIdx = 0, checked = true) => toggleGlobalShowArtists(checked);

function startDirectMangaEdit() {
  if (typeof isEditModeEnabled === 'function' && !isEditModeEnabled()) return;
  if (!currentDetailDoc) return;
  const m = currentDetailDoc;

  const viewActs = document.getElementById('mangaViewActions');
  const editActs = document.getElementById('mangaEditActions');
  if (viewActs) viewActs.classList.add('hidden');
  if (editActs) editActs.classList.remove('hidden');

  const titleView = document.getElementById('mangaTitleView');
  const titleEdit = document.getElementById('mangaTitleEdit');
  if (titleView) titleView.classList.add('hidden');
  if (titleEdit) titleEdit.classList.remove('hidden');

  const notesSection = document.getElementById('modalNotesSection');
  const notesEdit = document.getElementById('modalNotesEdit');
  if (notesSection) notesSection.classList.add('hidden');
  if (notesEdit) notesEdit.classList.remove('hidden');

  const sourcesSection = document.getElementById('modalSourcesSection');
  const sourcesEdit = document.getElementById('modalSourcesEdit');
  if (sourcesSection) sourcesSection.classList.add('hidden');
  if (sourcesEdit) sourcesEdit.classList.remove('hidden');

  const synView = document.getElementById('modalSynopsis');
  const synEdit = document.getElementById('modalSynopsisEdit');
  if (synView) synView.classList.add('hidden');
  if (synEdit) synEdit.classList.remove('hidden');

  const toggleTableField = (viewId, editId) => {
    const vEl = document.getElementById(viewId);
    const eEl = document.getElementById(editId);
    if (vEl) {
      vEl.classList.add('hidden');
      const tr = vEl.closest('tr');
      if (tr) {
        tr.classList.remove('hidden');
        tr.style.display = '';
      }
    }
    if (eEl) eEl.classList.remove('hidden');
  };
  toggleTableField('infoboxAuthors', 'editInfoboxAuthorsContainer');
  toggleTableField('infoboxPublisher', 'editInfoboxPublisherContainer');
  toggleTableField('infoboxSerializedIn', 'editInfoboxSerializedInContainer');
  toggleTableField('infoboxStatus', 'editInfoboxStatusContainer');
  toggleTableField('infoboxType', 'editInfoboxTypeContainer');
  toggleTableField('infoboxSeries', 'editInfoboxSeriesContainer');
  toggleTableField('infoboxSerializationStart', 'editInfoboxSerializationStartContainer');
  toggleTableField('infoboxSerializationEnd', 'editInfoboxSerializationEndContainer');

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    const cleanVal = (val !== null && val !== undefined) ? val.toString().trim() : '';
    if (el.tagName === 'SELECT') {
      if (!cleanVal) {
        el.value = '';
        return;
      }
      const hasOpt = Array.from(el.options).some(o => o.value.toLowerCase() === cleanVal.toLowerCase() || o.value === cleanVal);
      if (!hasOpt) {
        const opt = document.createElement('option');
        opt.value = cleanVal;
        opt.textContent = cleanVal;
        el.appendChild(opt);
      }
      const matchedOpt = Array.from(el.options).find(o => o.value.toLowerCase() === cleanVal.toLowerCase());
      if (matchedOpt) el.value = matchedOpt.value;
      else el.value = cleanVal;
    } else {
      el.value = cleanVal;
    }
  };

  setVal('editTitleRomaji', m.title_romaji || '');
  setVal('editTitleJp', m.title_jp || '');
  setVal('editTitleEn', m.title_en || '');
  editAltTitles = (Array.isArray(m.alt_titles) ? m.alt_titles : [])
    .map(title => (title == null ? '' : String(title).trim()))
    .filter(Boolean);
  renderAltTitlesEditor();
  setVal('editNotes', m.notes || '');
  setVal('editSynopsis', m.synopsis || '');
  const sourcesEditEl = document.getElementById('editSources');
  if (sourcesEditEl) {
    if (m.sources && Array.isArray(m.sources)) {
      sourcesEditEl.value = m.sources.map(s => typeof s === 'string' ? s : (s.url || s.name || '')).filter(Boolean).join('\n');
    } else if (typeof m.sources === 'string') {
      sourcesEditEl.value = m.sources;
    } else {
      sourcesEditEl.value = '';
    }
  }

  if (m.custom_roles && Array.isArray(m.custom_roles) && m.custom_roles.length > 0) {
    editAuthorRoles = m.custom_roles.map(r => ({
      role: r.role || 'Story:',
      names: Array.isArray(r.names) ? r.names.join(', ') : (r.names || '')
    }));
  } else {
    editAuthorRoles = [];
  }
  renderAuthorRolesInPlace();

  setVal('editInfoboxPublisher', m.publisher || '');
  setVal('editInfoboxSerializedIn', m.magazine || '');
  setVal('editInfoboxStatus', (m.status && m.status !== '[no data]' && m.status !== 'N/A') ? m.status : 'Unknown');
  setVal('editInfoboxType', m.type || 'Unknown');
  setVal('editInfoboxSeries', mapToCanonicalFranchise(m.series));
  setVal('editInfoboxSerializationStart', m.serialization_start || '');
  setVal('editInfoboxSerializationEnd', m.serialization_end || '');

  editVolumesData = (m.volumes && Array.isArray(m.volumes) && m.volumes.length > 0)
    ? m.volumes.map((v, vIdx) => {
        let vNum = (v.volume_number !== undefined && v.volume_number !== null) ? v.volume_number : (v.volume || (vIdx + 1));
        if (typeof vNum === 'number' || /^\d+(\.\d+)?$/.test(String(vNum).trim())) {
          vNum = `Vol. ${vNum}`;
        }
        return {
          volume_number: vNum,
          title: v.title || '',
          title_jp: v.title_jp || '',
          is_uncollected: v.is_uncollected === true,
          release_date: v.release_date || '',
          isbn: v.isbn || '',
          asin: v.asin || '',
          cover: v.cover || '',
          cover_full: v.cover_full || '',
          chapters: (v.chapters && Array.isArray(v.chapters)) ? v.chapters.map(c => ({
            chapter: (c.chapter_number !== undefined ? c.chapter_number : '').toString(),
            title: c.title || '',
            title_jp: c.title_jp || '',
            artist: c.artist || ''
          })) : []
        };
      })
    : [
        {
          volume_number: 'Vol. 1',
          title: '',
          title_jp: '',
          is_uncollected: false,
          release_date: m.release_date || '',
          isbn: '',
          asin: '',
          cover: getPrimaryCover(m),
          cover_full: '',
          chapters: (m.chapters && Array.isArray(m.chapters)) ? m.chapters.map(c => ({
            chapter: (c.chapter_number !== undefined ? c.chapter_number : '').toString(),
            title: c.title || '',
            title_jp: c.title_jp || '',
            artist: c.artist || ''
          })) : []
        }
      ];

  editGlobalSyncAuthor = true;
  editGlobalShowArtists = m.show_chapter_artists !== false;
  const firstChName = editVolumesData[0]?.chapters?.[0]?.chapter?.toString().toLowerCase();
  editGlobalOneshot = (m.type === 'Oneshot' || firstChName === 'oneshot');

  updateInfoboxCoverLive(editVolumesData[0]?.cover || m.cover || '');

  renderVolumesInPlaceEdit();
  syncArtToAuthors();
}

function cancelDirectMangaEdit() {
  const viewActs = document.getElementById('mangaViewActions');
  const editActs = document.getElementById('mangaEditActions');
  if (editActs) editActs.classList.add('hidden');
  if (viewActs) viewActs.classList.remove('hidden');

  const titleView = document.getElementById('mangaTitleView');
  const titleEdit = document.getElementById('mangaTitleEdit');
  if (titleEdit) titleEdit.classList.add('hidden');
  if (titleView) titleView.classList.remove('hidden');

  const notesSection = document.getElementById('modalNotesSection');
  const notesEdit = document.getElementById('modalNotesEdit');
  if (notesEdit) notesEdit.classList.add('hidden');
  if (notesSection) notesSection.classList.remove('hidden');

  const sourcesSection = document.getElementById('modalSourcesSection');
  const sourcesEdit = document.getElementById('modalSourcesEdit');
  if (sourcesEdit) sourcesEdit.classList.add('hidden');
  if (sourcesSection) sourcesSection.classList.remove('hidden');

  const synView = document.getElementById('modalSynopsis');
  const synEdit = document.getElementById('modalSynopsisEdit');
  if (synEdit) synEdit.classList.add('hidden');
  if (synView) synView.classList.remove('hidden');

  const untoggleTableField = (viewId, editId) => {
    const vEl = document.getElementById(viewId);
    const eEl = document.getElementById(editId);
    if (eEl) eEl.classList.add('hidden');
    if (vEl) vEl.classList.remove('hidden');
  };
  untoggleTableField('infoboxAuthors', 'editInfoboxAuthorsContainer');
  untoggleTableField('infoboxPublisher', 'editInfoboxPublisherContainer');
  untoggleTableField('infoboxSerializedIn', 'editInfoboxSerializedInContainer');
  untoggleTableField('infoboxStatus', 'editInfoboxStatusContainer');
  untoggleTableField('infoboxType', 'editInfoboxTypeContainer');
  untoggleTableField('infoboxSeries', 'editInfoboxSeriesContainer');
  untoggleTableField('infoboxSerializationStart', 'editInfoboxSerializationStartContainer');
  untoggleTableField('infoboxSerializationEnd', 'editInfoboxSerializationEndContainer');

  if (currentDetailDoc) {
    renderDetailContent(currentDetailDoc);
  }
}

function addVolumeInPlace() {
  const nextNum = editVolumesData.length + 1;
  editVolumesData.push({
    volume_number: `Vol. ${nextNum}`,
    title: '',
    title_jp: '',
    is_uncollected: false,
    release_date: '',
    isbn: '',
    asin: '',
    cover: '',
    cover_full: '',
    chapters: []
  });
  renderVolumesInPlaceEdit();
  syncArtToAuthors();
}

function removeVolumeInPlace(vIdx) {
  if (editVolumesData.length <= 1) {
    alert('Every manga entry must have at least one volume. Volume 1 serves as the container for all releases.');
    return;
  }
  const volNum = editVolumesData[vIdx]?.volume_number || (vIdx + 1);
  if (!confirm(`Are you sure you want to delete Volume ${volNum}?`)) return;
  editVolumesData.splice(vIdx, 1);
  renderVolumesInPlaceEdit();
  syncArtToAuthors();
}

function removeChapterFromVolumeInPlace(vIdx, cIdx) {
  if (!editVolumesData[vIdx] || !editVolumesData[vIdx].chapters) return;
  editVolumesData[vIdx].chapters.splice(cIdx, 1);
  renderVolumesInPlaceEdit();
  syncArtToAuthors();
}

function swapNeighbor(list, index, delta) {
  const next = index + delta;
  if (!list || next < 0 || next >= list.length) return false;
  const item = list[index];
  list[index] = list[next];
  list[next] = item;
  return true;
}

function rerenderVolumesKeepingPlace() {
  const y = window.scrollY;
  renderVolumesInPlaceEdit();
  window.scrollTo(0, y);
}

function moveVolumeInPlace(vIdx, delta) {
  if (!swapNeighbor(editVolumesData, vIdx, delta)) return;
  rerenderVolumesKeepingPlace();
  const cover = editVolumesData[0] && editVolumesData[0].cover;
  if (cover) updateInfoboxCoverLive(cover);
}

function moveChapterInPlace(vIdx, cIdx, delta) {
  const chapters = editVolumesData[vIdx] && editVolumesData[vIdx].chapters;
  if (!swapNeighbor(chapters, cIdx, delta)) return;
  rerenderVolumesKeepingPlace();
}

function renderNeighborMoveButtons(upCall, downCall, atStart, atEnd, noun) {
  const base = 'p-0.5 text-cafe-gold/80 hover:text-cafe-gold transition-colors shrink-0 disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:text-cafe-gold/80';
  return `
    <button type="button" onclick="${upCall}" ${atStart ? 'disabled' : ''} title="Move ${noun} up" aria-label="Move ${noun} up" class="${base}">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
    </button>
    <button type="button" onclick="${downCall}" ${atEnd ? 'disabled' : ''} title="Move ${noun} down" aria-label="Move ${noun} down" class="${base}">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
    </button>
  `;
}

function renderVolumesInPlaceEdit() {
  const container = document.getElementById('modalVolumesContainer');
  if (!container) return;
  container.innerHTML = '';

  const controlBar = document.createElement('div');
  controlBar.className = 'flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-cafe-950/70 border border-cafe-gold/30 text-xs mb-3';
  controlBar.innerHTML = `
    <div class="flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-1.5 cursor-pointer text-cafe-cream hover:text-cafe-gold select-none font-medium text-xs">
        <input type="checkbox" id="editGlobalOneshot" ${editGlobalOneshot ? 'checked' : ''} onchange="toggleGlobalOneshot(this.checked)" class="w-3.5 h-3.5 rounded border-cafe-gold/40 text-cafe-gold focus:ring-0 bg-cafe-900 cursor-pointer">
        <span>Oneshot</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer text-cafe-cream hover:text-cafe-gold select-none font-medium text-xs">
        <input type="checkbox" id="editGlobalSyncAuthor" ${editGlobalSyncAuthor ? 'checked' : ''} onchange="toggleGlobalSyncAuthor(this.checked)" class="w-3.5 h-3.5 rounded border-cafe-gold/40 text-cafe-gold focus:ring-0 bg-cafe-900 cursor-pointer">
        <span>Sync author</span>
      </label>
      <label class="flex items-center gap-1.5 cursor-pointer text-cafe-cream hover:text-cafe-gold select-none font-medium text-xs">
        <input type="checkbox" id="editGlobalShowArtists" ${editGlobalShowArtists ? 'checked' : ''} onchange="toggleGlobalShowArtists(this.checked)" class="w-3.5 h-3.5 rounded border-cafe-gold/40 text-cafe-gold focus:ring-0 bg-cafe-900 cursor-pointer">
        <span>Show author in chapter display</span>
      </label>
    </div>
    <button type="button" onclick="addVolumeInPlace()" class="px-3 py-1.5 rounded-lg bg-cafe-gold/20 hover:bg-cafe-gold/30 border border-cafe-gold/40 text-cafe-gold text-xs font-semibold flex items-center gap-1.5 transition-colors shadow">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      <span>+ Add Volume</span>
    </button>
  `;
  container.appendChild(controlBar);

  editVolumesData.forEach((vol, vIdx) => {
    const volCard = document.createElement('div');
    volCard.className = 'bg-cafe-900/80 rounded-xl p-4 border border-cafe-gold/25 flex flex-col gap-3 shadow-md mb-3';

    const chList = vol.chapters || [];

    let chaptersListContent = '';
    if (chList.length === 0) {
      chaptersListContent = `
        ${renderChapterInsertDivider(vIdx, -1)}
        <div class="py-2.5 text-center text-cafe-muted text-xs">No chapters added to this volume yet. Use the buttons above to add one.</div>
      `;
    } else {
      const rows = chList.map((ch, cIdx) => {
        return `
          <div class="flex items-center gap-1.5 py-1 px-2 rounded-lg bg-cafe-950/70 border border-cafe-gold/15">
            <input type="text" value="${escapeHtml(ch.chapter || '')}" placeholder="Ch. / Act / Name" title="Chapter # or Act / Name (e.g. 1, Act 1, Extras, Prologue)"
                   oninput="editVolumesData[${vIdx}].chapters[${cIdx}].chapter = this.value"
                   class="w-24 sm:w-32 px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-gold text-xs font-medium outline-none focus:border-cafe-gold shrink-0">
            <input type="text" value="${escapeHtml(ch.title || '')}" placeholder="Chapter Title"
                   oninput="editVolumesData[${vIdx}].chapters[${cIdx}].title = this.value"
                   class="flex-1 min-w-[90px] px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs outline-none focus:border-cafe-gold">
            <input type="text" value="${escapeHtml(ch.title_jp || '')}" placeholder="JP Title (日本語)"
                   oninput="editVolumesData[${vIdx}].chapters[${cIdx}].title_jp = this.value"
                   class="flex-1 min-w-[90px] px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-amber font-japanese text-xs outline-none focus:border-cafe-gold">
            <input type="text" value="${escapeHtml(ch.artist || '')}" placeholder="Artist"
                   data-ch-artist-input="true" data-artist-suggest="true" autocomplete="off"
                   oninput="updateChapterArtist(${vIdx}, ${cIdx}, this.value)"
                   class="w-24 sm:w-32 px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-cream text-xs outline-none focus:border-cafe-gold shrink-0">
            <div class="flex items-center shrink-0">
              ${renderNeighborMoveButtons(`moveChapterInPlace(${vIdx}, ${cIdx}, -1)`, `moveChapterInPlace(${vIdx}, ${cIdx}, 1)`, cIdx === 0, cIdx === chList.length - 1, 'chapter')}
            </div>
            <button type="button" onclick="removeChapterFromVolumeInPlace(${vIdx}, ${cIdx})" title="Delete chapter"
                     class="p-1 text-red-400 hover:text-red-300 transition-colors shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
          ${renderChapterInsertDivider(vIdx, cIdx)}
        `;
      }).join('');

      chaptersListContent = `
        ${renderChapterInsertDivider(vIdx, -1)}
        ${rows}
      `;
    }

    volCard.innerHTML = `
      <div class="flex flex-col sm:flex-row gap-4 items-start">
        <div class="w-20 shrink-0 flex flex-col items-center gap-1.5">
          <div class="w-20 h-28 rounded-lg overflow-hidden border border-cafe-gold/30 bg-cafe-950 flex items-center justify-center relative group">
            ${vol.cover ? `<img id="volCoverPreview_${vIdx}" src="${escapeHtml(vol.cover)}" class="w-full h-full object-cover">` : `<span id="volCoverNoCover_${vIdx}" class="no-data-badge text-[9px]">[no cover]</span><img id="volCoverPreview_${vIdx}" src="" class="w-full h-full object-cover hidden">`}
          </div>
          <button type="button" onclick="triggerVolumeCoverUpload(${vIdx})" class="w-full py-1 rounded bg-cafe-900 border border-cafe-gold/30 hover:border-cafe-gold text-cafe-gold text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors" title="Upload cover image">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            <span>Upload</span>
          </button>
        </div>
        <div class="flex-1 min-w-0 w-full space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <label for="volNumberInput_${vIdx}" class="text-xs text-cafe-amber font-semibold shrink-0">Volume:</label>
                <input type="text" id="volNumberInput_${vIdx}" value="${escapeHtml(String(vol.volume_number || `Vol. ${vIdx + 1}`))}"
                       placeholder="Vol. 1, Volume 1, Omnibus 1, etc."
                       title="Volume designation (e.g. Vol. 1, Volume 1, Vol 1 Rerelease, Omnibus 1)"
                       oninput="editVolumesData[${vIdx}].volume_number = this.value"
                       class="w-40 sm:w-56 px-2.5 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs font-mono-isbn outline-none focus:border-cafe-gold">
              </div>
              <label class="flex items-center gap-1.5 cursor-pointer text-cafe-cream hover:text-cafe-gold select-none font-medium text-xs">
                <input type="checkbox" id="volIsUncollected_${vIdx}" ${vol.is_uncollected ? 'checked' : ''}
                       onchange="toggleVolumeUncollected(${vIdx}, this.checked)"
                       class="w-3.5 h-3.5 rounded border-cafe-gold/40 text-cafe-gold focus:ring-0 bg-cafe-900 cursor-pointer">
                <span class="text-[11px] text-cafe-muted hover:text-cafe-cream">No volume (holder for uncollected chapters — drops volume tag &amp; identifiers)</span>
              </label>
            </div>
            <div class="flex items-center gap-0.5 shrink-0">
              ${renderNeighborMoveButtons(`moveVolumeInPlace(${vIdx}, -1)`, `moveVolumeInPlace(${vIdx}, 1)`, vIdx === 0, vIdx === editVolumesData.length - 1, 'volume')}
              <button type="button" onclick="removeVolumeInPlace(${vIdx})" class="text-red-400 hover:text-red-300 p-1 transition-colors shrink-0" title="Delete Volume">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label class="block text-[10px] font-semibold text-cafe-amber mb-0.5">Volume Title (Romaji / English)</label>
              <input type="text" id="volTitleInput_${vIdx}" value="${escapeHtml(vol.title || '')}" placeholder="Volume Title"
                     oninput="editVolumesData[${vIdx}].title = this.value"
                     class="w-full px-2.5 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs font-bold font-cinzel outline-none focus:border-cafe-gold">
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-cafe-amber mb-0.5">Volume Japanese Title</label>
              <input type="text" id="volTitleJpInput_${vIdx}" value="${escapeHtml(vol.title_jp || '')}" placeholder="巻のタイトル (Japanese)"
                     oninput="editVolumesData[${vIdx}].title_jp = this.value"
                     class="w-full px-2.5 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-amber text-xs font-japanese outline-none focus:border-cafe-gold">
            </div>
          </div>
          <div id="volIdentifiersGrid_${vIdx}" class="grid grid-cols-1 sm:grid-cols-3 gap-2 ${vol.is_uncollected ? 'hidden' : ''}">
            <div>
              <label class="block text-[10px] text-cafe-muted mb-0.5">Release Date</label>
              <input type="text" id="volReleaseDateInput_${vIdx}" value="${escapeHtml(vol.release_date || '')}" placeholder="YYYY-MM-DD"
                     ${vol.is_uncollected ? 'disabled' : ''}
                     oninput="editVolumesData[${vIdx}].release_date = this.value"
                     class="w-full px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs font-mono-isbn outline-none focus:border-cafe-gold disabled:opacity-40 disabled:cursor-not-allowed">
            </div>
            <div>
              <label class="block text-[10px] text-cafe-muted mb-0.5">ISBN</label>
              <input type="text" id="volIsbnInput_${vIdx}" value="${escapeHtml(vol.isbn || '')}" placeholder="ISBN"
                     ${vol.is_uncollected ? 'disabled' : ''}
                     oninput="editVolumesData[${vIdx}].isbn = this.value"
                     class="w-full px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-amber text-xs font-mono-isbn outline-none focus:border-cafe-gold disabled:opacity-40 disabled:cursor-not-allowed">
            </div>
            <div>
              <label class="block text-[10px] text-cafe-muted mb-0.5">ASIN</label>
              <input type="text" id="volAsinInput_${vIdx}" value="${escapeHtml(vol.asin || '')}" placeholder="ASIN"
                     ${vol.is_uncollected ? 'disabled' : ''}
                     oninput="editVolumesData[${vIdx}].asin = this.value"
                     class="w-full px-2 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-cafe-amber text-xs font-mono-isbn outline-none focus:border-cafe-gold disabled:opacity-40 disabled:cursor-not-allowed">
            </div>
          </div>

          <div class="space-y-2">
            <div>
              <label class="block text-[10px] font-semibold text-cafe-amber mb-0.5">Small Cover URL / Path</label>
              <input type="text" id="volCoverInput_${vIdx}" value="${escapeHtml(vol.cover || '')}" placeholder="assets/covers/small/... or https://..."
                     oninput="onVolumeCoverInputChanged(${vIdx}, this.value)"
                     class="w-full px-2.5 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs font-mono-isbn outline-none focus:border-cafe-gold">
              <input type="file" id="volCoverFileInput_${vIdx}" accept="image/*" class="hidden" onchange="handleVolumeCoverFileSelected(${vIdx}, this.files[0])">
            </div>
            <div>
              <label class="block text-[10px] font-semibold text-cafe-amber mb-0.5">Full Cover URL / Path</label>
              <input type="text" id="volCoverFullInput_${vIdx}" value="${escapeHtml(vol.cover_full || '')}" placeholder="assets/covers/full/... or https://..."
                     oninput="onVolumeCoverFullInputChanged(${vIdx}, this.value)"
                     class="w-full px-2.5 py-1 rounded bg-cafe-900 border border-cafe-gold/30 text-white text-xs font-mono-isbn outline-none focus:border-cafe-gold">
            </div>
          </div>
        </div>
      </div>

      <div class="mt-2 pt-2 border-t border-cafe-gold/15 space-y-2">
        <div class="flex items-center justify-between pb-1.5 border-b border-cafe-gold/10">
          <span class="font-semibold text-cafe-amber uppercase tracking-wider text-[10px]">Chapters</span>
          <span class="text-[10px] text-cafe-muted">${chList.length} chapter${chList.length === 1 ? '' : 's'}</span>
        </div>

        <div class="space-y-1 max-h-[500px] overflow-y-auto pr-1">
          ${chaptersListContent}
        </div>
      </div>
    `;
    container.appendChild(volCard);
  });

  const addVolBottomBtn = document.createElement('button');
  addVolBottomBtn.type = 'button';
  addVolBottomBtn.onclick = addVolumeInPlace;
  addVolBottomBtn.className = 'w-full py-2.5 rounded-xl border border-dashed border-cafe-gold/40 hover:border-cafe-gold text-cafe-gold/80 hover:text-cafe-gold text-xs font-semibold flex items-center justify-center gap-2 transition-colors mt-2';
  addVolBottomBtn.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
    <span>Add Another Volume</span>
  `;
  container.appendChild(addVolBottomBtn);
}

function saveDirectMangaEdit() {
  if (!currentDetailDoc) return;

  const titleRomaji = document.getElementById('editTitleRomaji')?.value.trim();
  if (!titleRomaji) {
    alert('Please enter a Romanized title.');
    return;
  }
  const titleJp = document.getElementById('editTitleJp')?.value.trim() || '';
  const titleEn = document.getElementById('editTitleEn')?.value.trim() || '';
  const altTitles = collectAltTitlesForSave();
  const notes = document.getElementById('editNotes')?.value.trim() || '';
  const synopsis = document.getElementById('editSynopsis')?.value.trim() || '';

  const artistsRaw = document.getElementById('editInfoboxArtists')?.value.trim() || '';
  const artistsList = artistsRaw && artistsRaw !== '[no data]' ? artistsRaw.split(',').map(s => s.trim().replace(/^[,]+|[,]+$/g, '')).filter(Boolean) : [];

  const validCustomRoles = editAuthorRoles
    .map(r => ({ role: (r.role || '').trim(), names: (r.names || '').trim().replace(/^[,]+|[,]+$/g, '') }))
    .filter(r => r.role && r.names);

  const publisher = document.getElementById('editInfoboxPublisher')?.value.trim() || '';
  const magazine = document.getElementById('editInfoboxSerializedIn')?.value.trim() || '';
  const status = document.getElementById('editInfoboxStatus')?.value || null;
  const type = document.getElementById('editInfoboxType')?.value.trim() || null;
  const series = document.getElementById('editInfoboxSeries')?.value.trim() || null;
  const serializationStart = document.getElementById('editInfoboxSerializationStart')?.value.trim() || '';
  const serializationEnd = document.getElementById('editInfoboxSerializationEnd')?.value.trim() || '';

  const sourcesRaw = document.getElementById('editSources')?.value || '';
  const sourcesList = sourcesRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  const volumesList = editVolumesData.map((v, i) => {
    const volNumEl = document.getElementById(`volNumberInput_${i}`);
    let rawVolNum = volNumEl ? volNumEl.value : v.volume_number;
    let volNum;
    if (rawVolNum !== undefined && rawVolNum !== null && String(rawVolNum).trim() !== '') {
      const s = String(rawVolNum).trim();
      volNum = isNaN(s) ? s : Number(s);
    } else {
      volNum = `Vol. ${i + 1}`;
    }

    const isUncollectedEl = document.getElementById(`volIsUncollected_${i}`);
    const isUncollectedVal = isUncollectedEl ? isUncollectedEl.checked : Boolean(v.is_uncollected);

    const volTitleEl = document.getElementById(`volTitleInput_${i}`);
    const titleVal = volTitleEl ? volTitleEl.value.trim() : (v.title || '').trim();

    const volTitleJpEl = document.getElementById(`volTitleJpInput_${i}`);
    const titleJpVal = volTitleJpEl ? volTitleJpEl.value.trim() : (v.title_jp || '').trim();

    const volCoverEl = document.getElementById(`volCoverInput_${i}`);
    const coverVal = volCoverEl ? volCoverEl.value.trim() : (v.cover || '').trim();

    const volCoverFullEl = document.getElementById(`volCoverFullInput_${i}`);
    const coverFullVal = volCoverFullEl ? volCoverFullEl.value.trim() : (v.cover_full || '').trim();

    const volObj = {
      volume_number: volNum,
      title: titleVal || null,
      title_jp: titleJpVal || null,
      release_date: v.release_date || null,
      isbn: v.isbn || null,
      asin: v.asin || null,
      cover: coverVal || null,
      cover_full: (coverFullVal && coverFullVal !== coverVal) ? coverFullVal : null,
      chapters: (v.chapters || []).map((c, ci) => {
        let chNum = c.chapter;
        if (chNum !== undefined && chNum !== null && String(chNum).trim() !== '') {
          const s = String(chNum).trim();
          chNum = isNaN(s) ? s : Number(s);
        } else {
          chNum = ci + 1;
        }
        const chTitle = (c.title || '').trim();
        const chTitleJp = (c.title_jp || '').trim();
        const chArtist = (c.artist || '').trim();
        return {
          chapter_number: chNum,
          title: chTitle || null,
          title_jp: chTitleJp || null,
          artist: chArtist || null
        };
      })
    };
    if (isUncollectedVal) {
      volObj.is_uncollected = true;
      volObj.release_date = null;
      volObj.isbn = null;
      volObj.asin = null;
    }
    return volObj;
  });

  const parsedYear = serializationStart ? parseInt(serializationStart.slice(0, 4), 10) : (parseInt(currentDetailDoc?.release_year, 10) || null);
  const year = (!isNaN(parsedYear) && parsedYear > 0) ? parsedYear : null;

  const doc = {
    ...currentDetailDoc,
    id: currentDetailDoc.id,
    title_romaji: titleRomaji,
    title_jp: titleJp || null,
    title_en: titleEn || null,
    alt_titles: altTitles,
    type: type,
    series: series,
    status: status,
    release_year: year || null,
    serialization_start: serializationStart || null,
    serialization_end: serializationEnd || null,
    publisher: publisher || null,
    magazine: magazine || null,
    synopsis: synopsis || null,
    notes: notes || null,
    artists: artistsList.length > 0 ? artistsList : (currentDetailDoc.artists || []),
    custom_roles: validCustomRoles,
    sources: sourcesList,
    volumes: volumesList,
    show_chapter_artists: editGlobalShowArtists
  };

  const stored = typeof sanitizeMangaDocForStorage === 'function'
    ? sanitizeMangaDocForStorage(doc)
    : doc;
  stored._isLocallyModified = true;
  sessionMangaDocs[stored.id] = stored;
  currentDetailDoc = stored;
  if (typeof updateArtistsFromMangaDoc === 'function') {
    updateArtistsFromMangaDoc(currentDetailDoc);
  }

  const idx = allManga.findIndex(m => m.id === stored.id);
  if (idx >= 0) {
    const normalized = normalizeMangaDoc(stored, `${stored.id}.json`, archiveFolderForId(stored.id));
    normalized._isLocallyModified = true;
    allManga[idx] = normalized;
  }

  renderDetailContent(currentDetailDoc);
  if (typeof updateStats === 'function') updateStats();
  if (typeof applyFilters === 'function') applyFilters();
  cancelDirectMangaEdit();

  const localWarning = document.getElementById('mangaLocalWarningBanner');
  if (localWarning) {
    localWarning.classList.remove('hidden');
    localWarning.hidden = false;
  }
  updateExportZipButtonsVisibility();

  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (hasUploadedCoversForDoc(currentDetailDoc)) {
    showToastNotification('Changes saved! New covers were uploaded. Click "Download ZIP" to download your JSON and cover images together.', 'info', 5000);
  } else {
    showToastNotification('Changes saved to local display only! Use "Download JSON" if you wish to export the file.', 'info');
  }
}

const openContributeModalForManga = startDirectMangaEdit;
const openContributeModal = startDirectMangaEdit;
const closeContributeModal = cancelDirectMangaEdit;
const saveContributionToSession = saveDirectMangaEdit;

function openExportPackageModal(doc) {
  const modal = document.getElementById('exportMangaPackageModal');
  if (!modal) return;
  modal.classList.remove('hidden');
}

function closeExportPackageModal() {
  const modal = document.getElementById('exportMangaPackageModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function confirmDownloadZip() {
  closeExportPackageModal();
  if (currentDetailDoc) {
    downloadSingleMangaZip(currentDetailDoc);
  }
}

async function confirmDownloadJsonOnly() {
  closeExportPackageModal();
  const doc = currentDetailDoc;
  if (!doc) return;
  const cleanDoc = typeof sanitizeMangaDocForStorage === 'function'
    ? sanitizeMangaDocForStorage(doc)
    : { ...doc };
  delete cleanDoc._isLocallyModified;
  await saveJsonToFile(cleanDoc, `${cleanDoc.id}.json`);
}

async function downloadSingleMangaZip(docToSave = null) {
  const doc = docToSave || currentDetailDoc;
  if (!doc) return;

  if (typeof JSZip === 'undefined') {
    showToastNotification('ZIP library not loaded. Downloading JSON instead.', 'warning');
    await downloadSingleMangaJson(doc);
    return;
  }

  showToastNotification('Creating ZIP archive...', 'info', 2000);

  const zip = new JSZip();
  const cleanDoc = typeof sanitizeMangaDocForStorage === 'function'
    ? sanitizeMangaDocForStorage(doc)
    : { ...doc };
  delete cleanDoc._isLocallyModified;

  const archivePath = typeof archiveJsonPathForId === 'function'
    ? archiveJsonPathForId(cleanDoc.id)
    : `data/manga/${cleanDoc.id}.json`;
  zip.file(archivePath, JSON.stringify(cleanDoc, null, 2));

  const referencedCovers = new Set();
  if (cleanDoc.cover && typeof cleanDoc.cover === 'string') {
    referencedCovers.add(cleanDoc.cover);
  }
  if (Array.isArray(cleanDoc.volumes)) {
    cleanDoc.volumes.forEach(v => {
      if (v.cover && typeof v.cover === 'string') {
        referencedCovers.add(v.cover);
      }
      if (v.cover_full && typeof v.cover_full === 'string') {
        referencedCovers.add(v.cover_full);
      }
    });
  }

  for (const cPath of Array.from(referencedCovers)) {
    if (typeof cPath === 'string' && cPath.includes('assets/covers/')) {
      const baseName = cPath.split('/').pop();
      referencedCovers.add(`assets/covers/full/${baseName}`);
      referencedCovers.add(`assets/covers/small/${baseName}`);
    }
  }

  let addedCovers = 0;
  for (const coverPath of referencedCovers) {
    if (sessionUploadedCovers[coverPath]) {
      const fileData = sessionUploadedCovers[coverPath];
      const relPath = coverPath.replace(/^\.?\//, '');
      zip.file(relPath, fileData);
      addedCovers++;
    }
  }

  for (const [p, fileData] of Object.entries(sessionUploadedCovers)) {
    if (!referencedCovers.has(p) && p.includes(cleanDoc.id)) {
      const relPath = p.replace(/^\.?\//, '');
      zip.file(relPath, fileData);
      addedCovers++;
    }
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  downloadBlob(zipBlob, `${cleanDoc.id}.zip`);
  showToastNotification(`Downloaded ${cleanDoc.id}.zip with JSON and ${addedCovers} cover image(s)!`, 'info');
}

function downloadCurrentPageZip() {
  if (currentDetailDoc) {
    downloadSingleMangaZip(currentDetailDoc);
  }
}

async function downloadSingleMangaJson(docToSave = null) {
  const doc = docToSave || currentDetailDoc;
  if (!doc) return;

  if (hasUploadedCoversForDoc(doc)) {
    openExportPackageModal(doc);
    return;
  }

  const cleanDoc = typeof sanitizeMangaDocForStorage === 'function'
    ? sanitizeMangaDocForStorage(doc)
    : { ...doc };
  delete cleanDoc._isLocallyModified;
  await saveJsonToFile(cleanDoc, `${cleanDoc.id}.json`);
}

function copyCurrentMangaJson(btn) {
  if (!currentDetailDoc) return;
  const cleanDoc = typeof sanitizeMangaDocForStorage === 'function'
    ? sanitizeMangaDocForStorage(currentDetailDoc)
    : currentDetailDoc;
  copyText(JSON.stringify(cleanDoc, null, 2), btn);
}

let artistSuggestInput = null;
let artistSuggestMatches = [];
let artistSuggestIndex = -1;
let artistSuggestRange = { start: 0, end: 0 };
let artistSuggestHideTimer = null;
let artistSuggestSuppress = false;

function collectCachedArtists() {
  const list = [];
  const seen = new Set();
  const blocked = new Set(['various', 'various artists', 'type-moon', 'tm', 'n/a', 'unknown', '[no data]', '[insufficient data]']);
  (allArtists || []).forEach(artist => {
    const name = (artist.romaji || artist.name || '').trim();
    const key = name.toLowerCase();
    if (!name || blocked.has(key) || seen.has(key)) return;
    seen.add(key);
    list.push({
      name,
      kanji: (artist.kanji || '').trim(),
      slug: (artist.slug || slugify(name) || '').toLowerCase()
    });
  });
  return list;
}

function artistTokenAtCaret(input) {
  const value = input.value || '';
  const caret = input.selectionStart == null ? value.length : input.selectionStart;
  const before = value.lastIndexOf(',', Math.max(0, caret - 1));
  const after = value.indexOf(',', caret);
  const startBound = before === -1 ? 0 : before + 1;
  const endBound = after === -1 ? value.length : after;
  const raw = value.slice(startBound, endBound);
  const lead = (raw.match(/^\s*/) || [''])[0].length;
  return {
    start: startBound + lead,
    end: endBound,
    query: raw.trim()
  };
}

function rankArtistMatch(artist, query) {
  const q = query.toLowerCase();
  const name = artist.name.toLowerCase();
  const kanji = (artist.kanji || '').toLowerCase();
  const slug = artist.slug || '';
  if (name.startsWith(q) || slug.startsWith(q)) return 0;
  if (kanji && kanji.startsWith(q)) return 1;
  if (name.includes(q) || slug.includes(q) || (kanji && kanji.includes(q))) return 2;
  return -1;
}

function hideArtistSuggestMenu() {
  const menu = document.getElementById('artistSuggestMenu');
  if (menu) {
    menu.classList.add('hidden');
    menu.innerHTML = '';
  }
  artistSuggestInput = null;
  artistSuggestMatches = [];
  artistSuggestIndex = -1;
}

function positionArtistSuggestMenu() {
  const menu = document.getElementById('artistSuggestMenu');
  if (!menu || !artistSuggestInput || menu.classList.contains('hidden')) return;
  const rect = artistSuggestInput.getBoundingClientRect();
  const width = Math.max(rect.width, 180);
  let left = rect.left;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
  menu.style.width = `${width}px`;
  menu.style.left = `${Math.max(8, left)}px`;
  const menuHeight = menu.offsetHeight || 0;
  const below = rect.bottom + 4;
  if (menuHeight && below + menuHeight > window.innerHeight - 8 && rect.top - menuHeight - 4 > 8) {
    menu.style.top = `${rect.top - menuHeight - 4}px`;
  } else {
    menu.style.top = `${below}px`;
  }
}

function renderArtistSuggestMenu() {
  const menu = document.getElementById('artistSuggestMenu');
  if (!menu) return;
  if (!artistSuggestMatches.length || !artistSuggestInput) {
    hideArtistSuggestMenu();
    return;
  }
  menu.innerHTML = artistSuggestMatches.map((artist, idx) => `
    <button type="button" class="artist-suggest-item${idx === artistSuggestIndex ? ' is-active' : ''}" role="option" data-suggest-idx="${idx}">
      ${escapeHtml(artist.name)}
      ${artist.kanji ? `<span>${escapeHtml(artist.kanji)}</span>` : ''}
      ${artist.subtitle ? `<span>${escapeHtml(artist.subtitle)}</span>` : ''}
    </button>
  `).join('');
  menu.classList.remove('hidden');
  menu.querySelectorAll('[data-suggest-idx]').forEach(btn => {
    btn.addEventListener('mousedown', event => {
      event.preventDefault();
      const match = artistSuggestMatches[Number(btn.getAttribute('data-suggest-idx'))];
      if (match) applyArtistSuggestion(match.name);
    });
    btn.addEventListener('mouseenter', () => {
      artistSuggestIndex = Number(btn.getAttribute('data-suggest-idx'));
      menu.querySelectorAll('.artist-suggest-item').forEach((item, itemIdx) => {
        item.classList.toggle('is-active', itemIdx === artistSuggestIndex);
      });
    });
  });
  positionArtistSuggestMenu();
}

function refreshArtistSuggestions(input, fromFocus = false) {
  if (!input || !input.hasAttribute('data-artist-suggest')) return;
  const token = artistTokenAtCaret(input);
  const query = token.query;
  if (!query) {
    hideArtistSuggestMenu();
    return;
  }
  const matches = [];
  collectCachedArtists().forEach(artist => {
    const rank = rankArtistMatch(artist, query);
    if (rank < 0) return;
    matches.push({ ...artist, rank });
  });
  matches.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (fromFocus && matches.some(artist => artist.name.toLowerCase() === query.toLowerCase())) {
    hideArtistSuggestMenu();
    return;
  }
  artistSuggestInput = input;
  artistSuggestRange = { start: token.start, end: token.end };
  artistSuggestMatches = matches.slice(0, 12);
  artistSuggestIndex = artistSuggestMatches.length ? 0 : -1;
  renderArtistSuggestMenu();
}

function applyArtistSuggestion(name) {
  const input = artistSuggestInput;
  if (!input) return;
  const value = input.value || '';
  const start = artistSuggestRange.start || 0;
  const end = artistSuggestRange.end == null ? value.length : artistSuggestRange.end;
  const next = `${value.slice(0, start)}${name}${value.slice(end)}`;
  const caret = start + name.length;
  artistSuggestSuppress = true;
  input.value = next;
  if (typeof input.setSelectionRange === 'function') input.setSelectionRange(caret, caret);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  artistSuggestSuppress = false;
  hideArtistSuggestMenu();
  input.focus();
}

function splitCommaNames(raw) {
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const names = [];
  values.forEach(value => {
    String(value).split(',').forEach(part => {
      const name = part.trim().replace(/^[,]+|[,]+$/g, '');
      if (name) names.push(name);
    });
  });
  return names;
}

function collectCachedCreditNames() {
  const list = [];
  const seen = new Set();
  const blocked = new Set(['various', 'various artists', 'n/a', 'unknown', '[no data]', '[insufficient data]', 'tbd']);
  const add = (name, extra = {}) => {
    const clean = (name || '').trim();
    const key = clean.toLowerCase();
    if (!clean || blocked.has(key) || seen.has(key)) return;
    seen.add(key);
    list.push({
      name: clean,
      kanji: (extra.kanji || '').trim(),
      slug: (extra.slug || (typeof slugify === 'function' ? slugify(clean) : '') || '').toLowerCase(),
      subtitle: extra.subtitle || ''
    });
  };

  collectCachedArtists().forEach(artist => add(artist.name, artist));

  const docs = new Map();
  (allManga || []).forEach(manga => {
    if (manga && manga.id) docs.set(manga.id, manga);
  });
  if (typeof sessionMangaDocs === 'object' && sessionMangaDocs) {
    Object.values(sessionMangaDocs).forEach(doc => {
      if (doc && doc.id) docs.set(doc.id, doc);
    });
  }
  docs.forEach(doc => {
    (doc.custom_roles || []).forEach(role => {
      splitCommaNames(role && role.names).forEach(name => add(name));
    });
  });

  collectCachedPublishers().forEach(publisher => {
    add(publisher.name, { subtitle: publisher.subtitle });
  });
  return list;
}

function collectCachedPublishers() {
  const list = [];
  const seen = new Set();
  const blocked = new Set(['unknown', 'n/a', '[no data]', '[insufficient data]']);
  const add = (name, worksCount) => {
    const clean = (name || '').trim();
    const key = clean.toLowerCase();
    if (!clean || blocked.has(key) || seen.has(key)) return;
    seen.add(key);
    const count = Number(worksCount) || 0;
    list.push({
      name: clean,
      subtitle: count > 0 ? `${count} work${count === 1 ? '' : 's'}` : ''
    });
  };
  (allPublishers || []).forEach(pub => add(pub.name, pub.works_count));
  (allManga || []).forEach(manga => {
    if (!seen.has((manga.publisher || '').trim().toLowerCase())) add(manga.publisher, 0);
  });
  return list;
}

function rankPublisherMatch(publisher, query) {
  const q = query.toLowerCase();
  const name = publisher.name.toLowerCase();
  if (name.startsWith(q)) return 0;
  if (name.includes(q)) return 1;
  return -1;
}

function normalizeRoleKey(role) {
  return String(role || '').trim().replace(/[:\s]+$/g, '').toLowerCase();
}

function collectCachedCreditRoles(currentValue = '') {
  const byKey = new Map();
  const add = (role) => {
    const clean = String(role || '').trim();
    const key = normalizeRoleKey(clean);
    if (!key || key === '[no data]' || key === 'n/a' || key === 'unknown') return;
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, { name: clean, count: 1, slug: key, kanji: '' });
    else existing.count += 1;
  };

  const docs = new Map();
  (allManga || []).forEach(manga => {
    if (manga && manga.id) docs.set(manga.id, manga);
  });
  if (typeof sessionMangaDocs === 'object' && sessionMangaDocs) {
    Object.values(sessionMangaDocs).forEach(doc => {
      if (doc && doc.id) docs.set(doc.id, doc);
    });
  }
  docs.forEach(doc => {
    (doc.custom_roles || []).forEach(role => add(role && role.role));
  });

  const currentKey = normalizeRoleKey(currentValue);
  (editAuthorRoles || []).forEach(role => {
    const key = normalizeRoleKey(role && role.role);
    if (key && key === currentKey && !byKey.has(key)) return;
    add(role && role.role);
  });

  return [...byKey.values()];
}

function refreshRoleSuggestions(input) {
  if (!input || !input.hasAttribute('data-role-suggest')) return;
  const query = (input.value || '').trim();
  const matchQuery = query.replace(/[:\s]+$/g, '');
  const matches = [];
  collectCachedCreditRoles(query).forEach(role => {
    if (!matchQuery) {
      matches.push({ ...role, rank: 0 });
      return;
    }
    const rank = rankArtistMatch(role, matchQuery);
    if (rank < 0) return;
    matches.push({ ...role, rank });
  });
  matches.sort((a, b) => a.rank - b.rank || b.count - a.count || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (!matches.length) {
    hideArtistSuggestMenu();
    return;
  }
  const exact = normalizeRoleKey(query);
  artistSuggestInput = input;
  artistSuggestRange = { start: 0, end: (input.value || '').length };
  artistSuggestMatches = matches.slice(0, 12);
  const exactIdx = exact ? matches.findIndex(role => normalizeRoleKey(role.name) === exact) : -1;
  artistSuggestIndex = exactIdx >= 0 ? exactIdx : 0;
  renderArtistSuggestMenu();
}

function refreshCreditSuggestions(input, fromFocus = false) {
  if (!input || !input.hasAttribute('data-credit-suggest')) return;
  const token = artistTokenAtCaret(input);
  const query = token.query;
  if (!query) {
    hideArtistSuggestMenu();
    return;
  }
  const matches = [];
  collectCachedCreditNames().forEach(entry => {
    const rank = rankArtistMatch(entry, query);
    if (rank < 0) return;
    matches.push({ ...entry, rank });
  });
  matches.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (fromFocus && matches.some(entry => entry.name.toLowerCase() === query.toLowerCase())) {
    hideArtistSuggestMenu();
    return;
  }
  artistSuggestInput = input;
  artistSuggestRange = { start: token.start, end: token.end };
  artistSuggestMatches = matches.slice(0, 12);
  artistSuggestIndex = artistSuggestMatches.length ? 0 : -1;
  renderArtistSuggestMenu();
}

function refreshPublisherSuggestions(input, fromFocus = false) {
  if (!input || !input.hasAttribute('data-publisher-suggest')) return;
  const query = (input.value || '').trim();
  if (!query) {
    hideArtistSuggestMenu();
    return;
  }
  const matches = [];
  collectCachedPublishers().forEach(publisher => {
    const rank = rankPublisherMatch(publisher, query);
    if (rank < 0) return;
    matches.push({ ...publisher, rank });
  });
  matches.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  if (fromFocus && matches.some(publisher => publisher.name.toLowerCase() === query.toLowerCase())) {
    hideArtistSuggestMenu();
    return;
  }
  artistSuggestInput = input;
  artistSuggestRange = { start: 0, end: (input.value || '').length };
  artistSuggestMatches = matches.slice(0, 12);
  artistSuggestIndex = artistSuggestMatches.length ? 0 : -1;
  renderArtistSuggestMenu();
}

function onArtistSuggestInput(event) {
  if (artistSuggestSuppress) return;
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.hasAttribute('data-role-suggest')) refreshRoleSuggestions(input);
  else if (input.hasAttribute('data-credit-suggest')) refreshCreditSuggestions(input);
  else if (input.hasAttribute('data-artist-suggest')) refreshArtistSuggestions(input);
  else if (input.hasAttribute('data-publisher-suggest')) refreshPublisherSuggestions(input);
}

function onArtistSuggestFocus(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (input.hasAttribute('data-role-suggest')) refreshRoleSuggestions(input);
  else if (input.hasAttribute('data-credit-suggest')) refreshCreditSuggestions(input, true);
  else if (input.hasAttribute('data-artist-suggest')) refreshArtistSuggestions(input, true);
  else if (input.hasAttribute('data-publisher-suggest')) refreshPublisherSuggestions(input, true);
}

function onArtistSuggestBlur() {
  clearTimeout(artistSuggestHideTimer);
  artistSuggestHideTimer = setTimeout(() => {
    if (artistSuggestInput && document.activeElement === artistSuggestInput) return;
    hideArtistSuggestMenu();
  }, 150);
}

function onArtistSuggestKeydown(event) {
  if (!artistSuggestInput || event.target !== artistSuggestInput || !artistSuggestMatches.length) return;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    artistSuggestIndex = (artistSuggestIndex + 1) % artistSuggestMatches.length;
    renderArtistSuggestMenu();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    artistSuggestIndex = (artistSuggestIndex - 1 + artistSuggestMatches.length) % artistSuggestMatches.length;
    renderArtistSuggestMenu();
  } else if ((event.key === 'Enter' || event.key === 'Tab') && artistSuggestIndex >= 0) {
    event.preventDefault();
    applyArtistSuggestion(artistSuggestMatches[artistSuggestIndex].name);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    hideArtistSuggestMenu();
  }
}

function bindArtistSuggestions() {
  if (window._artistSuggestBound) return;
  window._artistSuggestBound = true;
  document.addEventListener('input', onArtistSuggestInput);
  document.addEventListener('focusin', onArtistSuggestFocus);
  document.addEventListener('focusout', onArtistSuggestBlur);
  document.addEventListener('keydown', onArtistSuggestKeydown, true);
  window.addEventListener('resize', positionArtistSuggestMenu);
  document.addEventListener('scroll', positionArtistSuggestMenu, true);
}

