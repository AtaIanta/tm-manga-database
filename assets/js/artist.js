
let currentArtistDoc = null;
let currentPublisherData = null;

function isChapterByArtist(ch, vol, manga, targetArtist) {
  if (!targetArtist) return false;
  const tSlug = (targetArtist.slug || slugify(targetArtist.romaji || targetArtist.name || '')).toLowerCase().trim();
  const tRomaji = (targetArtist.romaji || targetArtist.name || '').toLowerCase().trim();
  const tKanji = (targetArtist.kanji || '').toLowerCase().trim();
  const tName = (targetArtist.name || '').toLowerCase().trim();

  if (!ch || !ch.artist || typeof ch.artist !== 'string') return false;
  const raw = ch.artist.trim();
  if (!raw || raw === '[no data]' || raw === '[insufficient data]' || raw === 'N/A' || raw === 'TBD') {
    return false;
  }

  const parts = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  for (const part of parts) {
    if (tRomaji && (part === tRomaji || slugify(part) === slugify(tRomaji))) return true;
    if (tSlug && (slugify(part) === tSlug || part === tSlug)) return true;
    if (tName && (part === tName || slugify(part) === slugify(tName))) return true;
    if (tKanji && raw.includes(tKanji)) return true;
    const clean = part.replace(/\(.*?\)/, '').trim();
    if (clean && tRomaji && (clean === tRomaji || clean.includes(tRomaji) || tRomaji.includes(clean))) return true;
  }

  return false;
}

function collectArtistVolumes(doc, artist) {
  if (!doc) return [];
  if (doc.volumes && doc.volumes.length > 0) {
    return doc.volumes.map(v => ({
      volume_number: (v.volume_number !== undefined && v.volume_number !== null) ? v.volume_number : null,
      title: v.title || '',
      title_jp: v.title_jp || '',
      cover: v.cover,
      release_date: v.release_date,
      isbn: v.isbn,
      asin: v.asin,
      is_uncollected: v.is_uncollected === true,
      chapters: (v.chapters || []).filter(c => isChapterByArtist(c, v, doc, artist))
    })).filter(v => v.chapters.length > 0);
  }
  const looseChs = (doc.chapters || []).filter(c => isChapterByArtist(c, null, doc, artist));
  return looseChs.length > 0
    ? [{ volume_number: 'N/A', title: 'Serialized Chapters (No Volume Release)', is_uncollected: true, chapters: looseChs }]
    : [];
}

const countVolumeChapters = vols => vols.reduce((acc, v) => acc + (v.chapters || []).length, 0);

function renderVolumeReleaseLine(vol) {
  if (!vol || vol.is_uncollected) return '';

  let isbnHtml = '';
  if (isNA(vol.isbn)) {
    isbnHtml = '';
  } else if (vol.isbn && String(vol.isbn).trim() && vol.isbn !== 'TBD' && vol.isbn !== '[no data]') {
    const isbn = String(vol.isbn).trim();
    isbnHtml = `
      <span class="font-mono-isbn text-xs text-cafe-amber inline-flex items-center gap-1.5 cursor-pointer hover:underline"
           onclick="event.stopPropagation(); copyText('${escapeHtml(isbn)}', this);" title="Click to copy ISBN">
        <span class="text-cafe-muted font-sans">ISBN:</span>
        <span>${escapeHtml(isbn)}</span>
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
  } else if (vol.asin && String(vol.asin).trim() && vol.asin !== '[no data]') {
    const asin = String(vol.asin).trim();
    asinHtml = `
      <span class="font-mono-isbn text-xs text-cafe-amber inline-flex items-center gap-1.5 cursor-pointer hover:underline"
           onclick="event.stopPropagation(); copyText('${escapeHtml(asin)}', this);" title="Click to copy Amazon ASIN">
        <span class="text-cafe-muted font-sans">ASIN:</span>
        <span>${escapeHtml(asin)}</span>
      </span>
    `;
  }

  let dateHtml = '';
  if (isNA(vol.release_date)) {
    dateHtml = '';
  } else if (vol.release_date && String(vol.release_date).trim() && vol.release_date !== '[no data]') {
    dateHtml = `<span>Released: <strong class="text-cafe-cream">${escapeHtml(String(vol.release_date).trim())}</strong></span>`;
  } else {
    dateHtml = `<span>Released: <span class="no-data-badge">[no data]</span></span>`;
  }

  if (!dateHtml && !isbnHtml && !asinHtml) return '';
  return `<div class="text-xs text-cafe-muted mt-2 flex flex-wrap items-center gap-4">${dateHtml}${isbnHtml}${asinHtml}</div>`;
}

function buildDynamicArtistData(nameQuery) {
  if (!nameQuery) return null;
  const slug = slugify(nameQuery);
  const qLower = nameQuery.toLowerCase().trim();
  const matchedWorks = [];
  let totalChapters = 0;

  const existing = (allArtists || []).find(a =>
    a.slug === slug ||
    slugify(a.slug || '') === slug ||
    (a.romaji && (a.romaji.toLowerCase() === qLower || slugify(a.romaji) === slug)) ||
    (a.kanji && a.kanji.trim() === nameQuery.trim())
  );

  const artistObj = existing ? { ...existing } : {
    slug: slug,
    romaji: nameQuery.replace(/\(.*?\)/, '').trim(),
    kanji: (nameQuery.match(/\((.*?)\)/) || [])[1] || ''
  };

  allManga.forEach(m => {
    const liveDoc = (typeof sessionMangaDocs !== 'undefined' && sessionMangaDocs[m.id]) || (typeof currentDetailDoc !== 'undefined' && currentDetailDoc && currentDetailDoc.id === m.id ? currentDetailDoc : m);

    let vols = collectArtistVolumes(liveDoc, artistObj);
    totalChapters += countVolumeChapters(vols);

    if (vols.length === 0) {
      const isAnthology = (liveDoc.type === 'Anthology' || (liveDoc.title_romaji && liveDoc.title_romaji.toLowerCase().includes('anthology')));
      if (!isAnthology && (liveDoc.artists || []).some(a => isChapterByArtist({ artist: a }, null, liveDoc, artistObj))) {
        if (liveDoc.volumes && liveDoc.volumes.length > 0) {
          vols = liveDoc.volumes.map(v => ({
            volume_number: (v.volume_number !== undefined && v.volume_number !== null) ? v.volume_number : null,
            title: v.title || '',
            title_jp: v.title_jp || '',
            cover: v.cover,
            release_date: v.release_date,
            isbn: v.isbn,
            asin: v.asin,
            is_uncollected: v.is_uncollected === true,
            chapters: (v.chapters && v.chapters.length > 0) ? v.chapters : []
          }));
        } else {
          vols = [{
            volume_number: null,
            title: liveDoc.title_en || liveDoc.title_romaji || '',
            cover: getPrimaryCover(liveDoc),
            release_date: liveDoc.release_date,
            chapters: []
          }];
        }
      }
    }

    if (vols.length > 0) {
      matchedWorks.push({
        id: liveDoc.id,
        title_romaji: liveDoc.title_romaji,
        title_jp: liveDoc.title_jp,
        title_en: liveDoc.title_en,
        cover: getPrimaryCover(liveDoc),
        volumes: vols
      });
    }
  });

  return {
    ...artistObj,
    works_count: matchedWorks.length,
    chapters_count: totalChapters,
    works: matchedWorks
  };
}

async function openArtistPage(nameOrSlug, pushHistory = true) {
  if (!nameOrSlug) return;
  const slug = slugify(nameOrSlug);
  const editingThis = typeof isArtistEditOpen === 'function' && isArtistEditOpen() && currentArtistDoc && (currentArtistDoc.slug === slug || slugify(currentArtistDoc.romaji || currentArtistDoc.name || '') === slug);
  if (!bypassUnsavedLeavePrompt && !editingThis && typeof guardUnsavedEdit === 'function' && isDirectEditOpen()) {
    guardUnsavedEdit(() => { openArtistPage(nameOrSlug, pushHistory); });
    return;
  }
  const qLower = nameOrSlug.toLowerCase().trim();

  let artistData = (allArtists || []).find(a => 
    a.slug === slug || 
    slugify(a.slug || '') === slug ||
    (a.romaji && (a.romaji.toLowerCase() === qLower || slugify(a.romaji) === slug)) ||
    (a.kanji && a.kanji.trim() === nameOrSlug.trim()) ||
    (a.name && (a.name.toLowerCase() === qLower || slugify(a.name) === slug))
  );

  if (!artistData) {
    try {
      const aRes = await fetch(`data/artists/${slug}.json`, { cache: 'no-cache' });
      if (aRes.ok) {
        const rawArtist = await aRes.json();
        artistData = {
          name: rawArtist.romaji || rawArtist.name || slug,
          slug: rawArtist.slug || slug,
          romaji: rawArtist.romaji || slug,
          kanji: rawArtist.kanji || '',
          circle: rawArtist.circle || null,
          image: rawArtist.image || null,
          bio: rawArtist.bio || null,
          socials: rawArtist.socials || {},
          has_page: true,
          works: []
        };
        allArtists.push(artistData);
      }
    } catch (err) {}
  }

  const dynamicData = buildDynamicArtistData(artistData?.romaji || nameOrSlug);
  if (artistData) {
    artistData = {
      ...artistData,
      works: dynamicData ? dynamicData.works : [],
      works_count: dynamicData ? dynamicData.works_count : 0,
      chapters_count: dynamicData ? dynamicData.chapters_count : 0
    };
  } else {
    artistData = dynamicData;
  }

  if (!artistData) {
    alert(`Could not find portfolio records for artist: ${nameOrSlug}`);
    return;
  }

  currentArtistDoc = artistData;

  cancelDirectArtistEdit(false);

  if (pushHistory) {
    window.location.hash = `artist=${encodeURIComponent(artistData.slug || slug)}`;
  }

  renderArtistPageContent(artistData);

  if (catalogView) catalogView.classList.add('hidden');
  if (mangaFullPageView) mangaFullPageView.classList.add('hidden');
  if (publisherFullPageView) publisherFullPageView.classList.add('hidden');
  if (artistFullPageView) artistFullPageView.classList.remove('hidden');

  scrollToWikiPriority();
}

function closeArtistPageView(updateHistory = true) {
  if (typeof guardUnsavedEdit === 'function') {
    guardUnsavedEdit(() => finishCloseArtistPageView(updateHistory));
    return;
  }
  finishCloseArtistPageView(updateHistory);
}

async function revertCurrentArtistChanges() {
  if (!currentArtistDoc) return;
  const slug = currentArtistDoc.slug || slugify(currentArtistDoc.romaji || currentArtistDoc.name || 'artist');
  const label = currentArtistDoc.romaji || currentArtistDoc.name || slug;
  let original = null;
  try {
    const res = await fetch(`data/artists/${slug}.json`, { cache: 'no-cache' });
    if (res.ok) original = await res.json();
  } catch (err) {}

  if (!original) {
    showUnsavedLeaveModal([{
      label,
      note: 'This artist profile exists only in this session. Reverting removes the local profile data.'
    }], () => applyRevertedArtist(slug, null), {
      title: 'Revert this artist?',
      intro: 'Nothing in the archive file will be restored.',
      confirmLabel: 'Remove local profile'
    });
    return;
  }

  showUnsavedLeaveModal([{
    label,
    note: 'Local edits will be replaced by the archive file.'
  }], () => applyRevertedArtist(slug, original), {
    title: 'Revert changes?',
    intro: 'The page will go back to the downloaded archive copy.',
    confirmLabel: 'Revert changes'
  });
}

function applyRevertedArtist(slug, original) {
  const index = allArtists.findIndex(artist => artist.slug === slug);
  if (!original) {
    if (index >= 0) {
      const keptWorks = allArtists[index].works;
      allArtists[index] = {
        ...allArtists[index],
        circle: null,
        image: null,
        bio: null,
        notes: null,
        sources: [],
        socials: {},
        _isLocallyModified: false,
        works: keptWorks
      };
      delete allArtists[index]._isLocallyModified;
    }
  } else {
    const previous = index >= 0 ? allArtists[index] : {};
    const restored = {
      ...previous,
      ...original,
      slug: original.slug || slug,
      romaji: original.romaji || original.name || previous.romaji || slug,
      works: previous.works || [],
      works_count: previous.works_count,
      chapters_count: previous.chapters_count
    };
    delete restored._isLocallyModified;
    if (index >= 0) allArtists[index] = restored;
    else allArtists.unshift(restored);
  }

  const fresh = (allArtists || []).find(artist => artist.slug === slug);
  if (fresh) {
    currentArtistDoc = { ...fresh, _isLocallyModified: false };
    delete currentArtistDoc._isLocallyModified;
  }
  if (isArtistEditOpen()) cancelDirectArtistEdit(false);
  if (currentArtistDoc) renderArtistPageContent(currentArtistDoc);
  if (typeof applyFilters === 'function') applyFilters();
  showToastNotification(original ? 'Reverted to the archive file.' : 'Local artist profile changes removed.', 'info');
}

function finishCloseArtistPageView(updateHistory = true) {
  cancelDirectArtistEdit(false);
  if (artistFullPageView) artistFullPageView.classList.add('hidden');
  if (publisherFullPageView) publisherFullPageView.classList.add('hidden');

  if (typeof currentDetailDoc !== 'undefined' && currentDetailDoc && window.location.hash.startsWith('#manga')) {
    if (mangaFullPageView) mangaFullPageView.classList.remove('hidden');
  } else {
    if (mangaFullPageView) mangaFullPageView.classList.add('hidden');
    if (catalogView) catalogView.classList.remove('hidden');
    if (updateHistory) {
      if (typeof currentCategory !== 'undefined' && currentCategory === 'artists') {
        window.location.hash = 'artists';
      } else {
        history.pushState('', document.title, window.location.pathname + window.location.search);
      }
    }
  }
}

function renderArtistPageContent(artist) {
  const heroNameEl = document.getElementById('artistHeroName');
  if (heroNameEl) heroNameEl.textContent = artist.romaji || artist.name || artist.slug;

  const localWarning = document.getElementById('artistLocalWarningBanner');
  if (localWarning) {
    if (artist._isLocallyModified) {
      localWarning.classList.remove('hidden');
      localWarning.hidden = false;
    } else {
      localWarning.classList.add('hidden');
      localWarning.hidden = true;
    }
  }
  const artistRevertBtn = document.getElementById('artistRevertBtn');
  if (artistRevertBtn) artistRevertBtn.classList.toggle('hidden', !artist._isLocallyModified);

  const kanjiBadge = document.getElementById('artistKanjiBadge');
  if (kanjiBadge) {
    if (artist.kanji) {
      kanjiBadge.textContent = artist.kanji;
      kanjiBadge.classList.remove('hidden');
    } else {
      kanjiBadge.classList.add('hidden');
    }
  }

  const bioEl = document.getElementById('artistHeroBio');
  if (bioEl) {
    const rawBio = (artist.bio || artist.overview || '').trim();
    if (rawBio) {
      bioEl.innerHTML = renderMarkdown(rawBio);
    } else {
      bioEl.innerHTML = '<span class="no-data-badge">[no data]</span> <span class="text-cafe-muted text-xs">No archival profile or overview recorded for this artist yet. Contributions are welcome!</span>';
    }
  }

  const notesEl = document.getElementById('artistNotesSection');
  if (notesEl) {
    const rawNotes = (artist.notes || '').trim();
    if (rawNotes) {
      notesEl.innerHTML = renderMarkdown(rawNotes);
    } else {
      notesEl.innerHTML = '<span class="no-data-badge">[no data]</span>';
    }
  }

  const sourcesContainer = document.getElementById('artistSourcesSection');
  if (sourcesContainer) {
    sourcesContainer.innerHTML = renderSourcesList(artist.sources);
  }

  const circleEl = document.getElementById('artistCircleDisplay');
  if (circleEl) {
    const tr = circleEl.closest('tr');
    if (isNA(artist.circle)) {
      if (tr) {
        tr.classList.add('hidden');
        tr.style.display = 'none';
      }
      circleEl.innerHTML = '';
    } else {
      if (tr) {
        tr.classList.remove('hidden');
        tr.style.display = '';
      }
      if (artist.circle && artist.circle.trim()) {
        circleEl.innerHTML = `<span class="font-semibold text-cafe-cream">${escapeHtml(artist.circle)}</span>`;
      } else {
        circleEl.innerHTML = '<span class="no-data-badge">[no data]</span>';
      }
    }
  }

  const captionEl = document.getElementById('artistInfoboxNameCaption');
  if (captionEl) captionEl.textContent = artist.romaji || artist.name || artist.slug;

  const avatarImg = document.getElementById('artistAvatarImg');
  const avatarPlaceholder = document.getElementById('artistAvatarPlaceholder');
  const avatarInitial = document.getElementById('artistAvatarInitial');
  if (avatarInitial) {
    const initialChar = (artist.romaji || artist.name || '?')[0].toUpperCase();
    avatarInitial.textContent = initialChar;
  }

  if (artist.image && artist.image.trim()) {
    if (avatarImg) {
      avatarImg.src = artist.image;
      avatarImg.classList.remove('hidden');
    }
    if (avatarPlaceholder) avatarPlaceholder.classList.add('hidden');
  } else {
    if (avatarImg) avatarImg.classList.add('hidden');
    if (avatarPlaceholder) avatarPlaceholder.classList.remove('hidden');
  }

  const socialsContainer = document.getElementById('artistSocialLinks');
  if (socialsContainer) {
    socialsContainer.innerHTML = '';
    const socials = artist.socials || {};
    let hasAnySocial = false;

    if (socials.twitter) {
      hasAnySocial = true;
      const a = document.createElement('a');
      a.href = socials.twitter;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'px-3 py-1 rounded-lg bg-cafe-950/90 border border-sky-500/40 text-sky-400 hover:bg-sky-500/10 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm';
      a.innerHTML = `
        <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        <span>Twitter / X</span>
      `;
      socialsContainer.appendChild(a);
    }

    if (socials.pixiv) {
      hasAnySocial = true;
      const a = document.createElement('a');
      a.href = socials.pixiv;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'px-3 py-1 rounded-lg bg-cafe-950/90 border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm';
      a.innerHTML = `
        <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-2h2v2zm0-4h-2V7h2v5.5z"/></svg>
        <span>Pixiv</span>
      `;
      socialsContainer.appendChild(a);
    }

    if (socials.website) {
      hasAnySocial = true;
      const a = document.createElement('a');
      a.href = socials.website;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'px-3 py-1 rounded-lg bg-cafe-950/90 border border-cafe-gold/30 text-cafe-gold hover:bg-cafe-gold/10 text-xs font-medium transition-colors flex items-center gap-1.5 shadow-sm';
      a.innerHTML = `
        <svg class="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
        <span>Website</span>
      `;
      socialsContainer.appendChild(a);
    }

    if (!hasAnySocial) {
      socialsContainer.innerHTML = '<span class="no-data-badge">[no data]</span>';
    }
  }

  const noticeEl = document.getElementById('artistMissingNotice');
  const noticeDetails = document.getElementById('artistMissingNoticeDetails');
  if (noticeEl) {
    const missingFields = [];
    if (!isNA(artist.kanji) && (!artist.kanji || !artist.kanji.trim() || artist.kanji === '[no data]')) missingFields.push('Kanji / Japanese Name');
    if (!isNA(artist.circle) && (!artist.circle || !artist.circle.trim() || artist.circle === '[no data]')) missingFields.push('Circle Affiliation');
    if (!isNA(artist.bio) && (!artist.bio || !artist.bio.trim() || artist.bio === '[no data]')) missingFields.push('Biographical Profile');
    if (!isNA(artist.image) && (!artist.image || !artist.image.trim() || artist.image === '[no data]')) missingFields.push('Avatar Image');
    const socials = artist.socials || {};
    const isSocialsNA = isNA(socials) || (isNA(socials.twitter) && isNA(socials.pixiv) && isNA(socials.website));
    if (!isSocialsNA && !socials.twitter && !socials.pixiv && !socials.website) missingFields.push('Social / Web Links');

    if (missingFields.length > 0) {
      noticeEl.classList.remove('hidden');
      noticeEl.hidden = false;
      if (noticeDetails) noticeDetails.textContent = missingFields.join(', ');
    } else {
      noticeEl.classList.add('hidden');
      noticeEl.hidden = true;
    }
  }

  const works = artist.works || [];
  let calculatedChaptersTotal = 0;

  const worksListContainer = document.getElementById('artistWorksList');
  if (!worksListContainer) return;
  worksListContainer.innerHTML = '';

  works.forEach(work => {
    const mangaDoc = (typeof sessionMangaDocs !== 'undefined' && sessionMangaDocs[work.id]) || 
                     (typeof currentDetailDoc !== 'undefined' && currentDetailDoc && currentDetailDoc.id === work.id ? currentDetailDoc : null) || 
                     allManga.find(m => m.id === work.id);

    const vols = mangaDoc
      ? collectArtistVolumes(mangaDoc, artist)
      : (work.volumes || [])
          .map(v => ({ ...v, chapters: (v.chapters || []).filter(c => isChapterByArtist(c, v, null, artist)) }))
          .filter(v => v.chapters.length > 0);

    if (vols.length === 0) return;
    calculatedChaptersTotal += countVolumeChapters(vols);

    const catalogItem = allManga.find(m => m.id === work.id);
    const workCover = hasValidCover(work.cover) ? work.cover : catalogItem?.cover;
    const coverHtml = hasValidCover(workCover)
      ? `<div class="w-12 h-16 rounded overflow-hidden border border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950 shrink-0 shadow transition-colors"><img src="${workCover}" alt="" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"></div>`
      : `<div class="no-data-thumb w-12 h-16"><span class="no-data-badge text-[8px]">[no data]</span></div>`;
    const { main: mainTitle, jp: jpSubtitle } = resolveDisplayTitles(
      (work.title_en && work.title_en !== '[no data]') ? work.title_en : catalogItem?.title_en,
      work.title_romaji || catalogItem?.title_romaji,
      work.title_jp,
      work.id
    );

    const volCardsHtml = vols.map(v => {
      const isUncollected = v.is_uncollected === true;
      const rawVolNum = (v.volume_number !== undefined && v.volume_number !== null) ? String(v.volume_number).trim() : '';
      const volBadge = (!isUncollected && rawVolNum && rawVolNum !== 'N/A')
        ? (/^(vol|volume)\b/i.test(rawVolNum) ? rawVolNum : `Vol. ${rawVolNum}`)
        : '';
      const vTitle = (v.title || '').trim();
      const vTitleJp = (v.title_jp || '').trim();

      return `
        <div class="volume-card-compact space-y-1.5">
          <div class="border-b border-cafe-gold/10 pb-1 space-y-0.5">
            <div class="flex flex-wrap items-center gap-2">
              ${(vTitle && volBadge) ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono-isbn bg-cafe-gold/20 text-cafe-gold border border-cafe-gold/30 shrink-0 select-none">${escapeHtml(volBadge)}</span>` : ''}
              <span class="font-cinzel font-bold text-xs sm:text-sm text-cafe-cream leading-tight">${escapeHtml(vTitle || volBadge || (isUncollected ? 'Serialized Chapters' : 'Volume'))}</span>
            </div>
            ${vTitleJp ? `<div class="text-[11px] text-cafe-gold/80 font-japanese font-medium">${escapeHtml(vTitleJp)}</div>` : ''}
            ${renderVolumeReleaseLine(v)}
          </div>
          <div class="chapter-list-scroll">
            ${v.chapters.map(c => renderChapterRow(c)).join('')}
          </div>
        </div>
      `;
    }).join('');

    const mangaItem = catalogItem || work;
    const typeTag = mangaItem ? formatTypeTag(mangaItem.type, mangaItem.series) : '';

    const card = document.createElement('div');
    card.className = 'list-row p-3 sm:p-4 rounded-xl space-y-2.5';
    card.innerHTML = `
      <div class="flex items-center gap-4 min-w-0 cursor-pointer group" onclick="openMangaDetail('${work.id}')" title="Click to view manga details">
        ${coverHtml}
        <div class="space-y-1 min-w-0 flex-1">
          <h4 class="font-cinzel font-bold text-sm sm:text-base text-cafe-cream group-hover:text-cafe-gold transition-colors leading-snug line-clamp-1">
            ${escapeHtml(mainTitle)}
          </h4>
          ${jpSubtitle ? `<div class="text-xs text-cafe-gold/90 font-japanese font-medium truncate max-w-md">${escapeHtml(jpSubtitle)}</div>` : ''}
          ${typeTag ? `<span class="px-2 py-0.5 rounded text-xs font-bold font-mono-isbn bg-cafe-gold/20 text-cafe-gold border border-cafe-gold/40 shrink-0 select-none">${escapeHtml(typeTag)}</span>` : ''}
        </div>
      </div>

      ${volCardsHtml ? `
        <div class="pt-2 border-t border-cafe-gold/15 flex flex-col space-y-2 w-full">
          ${volCardsHtml}
        </div>
      ` : ''}
    `;

    worksListContainer.appendChild(card);
  });

  if (worksListContainer.children.length === 0) {
    calculatedChaptersTotal = 0;
    worksListContainer.innerHTML = renderArtistWorksEmptyState();
  }

  const displayedWorksCount = worksListContainer.querySelectorAll(':scope > .list-row').length;
  const sw = document.getElementById('artistStatWorks');
  if (sw) sw.textContent = displayedWorksCount;
  const sc = document.getElementById('artistStatChapters');
  if (sc) sc.textContent = calculatedChaptersTotal;
}

function renderArtistWorksEmptyState() {
  return `
    <div class="glass-panel rounded-xl p-8 text-center text-cafe-muted">
      <span class="no-data-badge">[no data]</span> No works mapped to this artist yet.
    </div>
  `;
}

let dummyTitleIdEdited = false;

function openAddDummyTitleModal() {
  if (typeof isEditModeEnabled === 'function' && !isEditModeEnabled()) return;
  dummyTitleIdEdited = false;
  const modal = document.getElementById('addDummyTitleModal');
  const titleInput = document.getElementById('dummyTitleInput');
  const idInput = document.getElementById('dummyIdInput');
  const errorEl = document.getElementById('dummyTitleError');
  const searchValue = (document.getElementById('searchInput')?.value || '').trim();
  const parsed = typeof parseSearchQuery === 'function' ? parseSearchQuery(searchValue) : { includeTerms: [], excludeTerms: [] };
  const seedTitle = searchValue && parsed.excludeTerms.length === 0
    ? searchValue.replace(/^"(.*)"$/, '$1').trim()
    : '';
  if (titleInput) titleInput.value = seedTitle;
  if (idInput) idInput.value = seedTitle ? mangaIdFromTitle(seedTitle) : '';
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
  if (modal) modal.classList.remove('hidden');
  if (titleInput) titleInput.focus();
}

function closeAddDummyTitleModal() {
  const modal = document.getElementById('addDummyTitleModal');
  if (modal) modal.classList.add('hidden');
}

document.addEventListener('keydown', (event) => {
  const modal = document.getElementById('addDummyTitleModal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAddDummyTitleModal();
  } else if (event.key === 'Enter' && (event.target?.id === 'dummyTitleInput' || event.target?.id === 'dummyIdInput')) {
    event.preventDefault();
    confirmAddDummyTitle();
  }
});

function onDummyTitleInput() {
  const title = document.getElementById('dummyTitleInput')?.value || '';
  const idInput = document.getElementById('dummyIdInput');
  if (!dummyTitleIdEdited && idInput) {
    idInput.value = mangaIdFromTitle(title);
  }
}

function onDummyIdInput() {
  const idInput = document.getElementById('dummyIdInput');
  if (!idInput) return;
  if (!idInput.value.trim()) {
    dummyTitleIdEdited = false;
    onDummyTitleInput();
    return;
  }
  dummyTitleIdEdited = true;
}

function setDummyTitleError(message) {
  const errorEl = document.getElementById('dummyTitleError');
  if (!errorEl) return;
  errorEl.textContent = message || '';
  errorEl.classList.toggle('hidden', !message);
}

function confirmAddDummyTitle() {
  const title = (document.getElementById('dummyTitleInput')?.value || '').trim();
  let id = (document.getElementById('dummyIdInput')?.value || '').trim().toLowerCase();
  if (!title) {
    setDummyTitleError('Enter the romanized title first.');
    return;
  }
  if (!id) id = mangaIdFromTitle(title);
  id = mangaIdFromTitle(id) || mangaIdFromTitle(title);
  const idInput = document.getElementById('dummyIdInput');
  if (idInput) idInput.value = id;
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    setDummyTitleError('The ID needs lowercase letters, numbers, and hyphens. Fate/stay night should be fate-stay-night.');
    return;
  }
  const taken = (allManga || []).some(manga => manga.id === id) || (sessionMangaDocs && sessionMangaDocs[id]);
  if (taken) {
    setDummyTitleError(`“${id}” is already used. Choose a different ID.`);
    return;
  }

  const onArtistPage = artistFullPageView && !artistFullPageView.classList.contains('hidden') && currentArtistDoc;
  const artistName = onArtistPage
    ? (currentArtistDoc.romaji || currentArtistDoc.name || currentArtistDoc.slug || '').trim()
    : '';
  const doc = {
    id,
    title_romaji: title,
    title_jp: null,
    title_en: null,
    alt_titles: [],
    synopsis: null,
    show_chapter_artists: true,
    volumes: [
      {
        volume_number: 'Vol. 1',
        title,
        title_jp: null,
        release_date: null,
        isbn: null,
        asin: null,
        cover: null,
        chapters: [
          {
            chapter_number: 1,
            title: null,
            title_jp: null,
            artist: artistName || null
          }
        ]
      }
    ],
    notes: null,
    sources: [],
    artists: artistName ? [artistName] : [],
    custom_roles: [],
    publisher: null,
    status: 'Unknown',
    type: 'Unknown',
    series: 'Unknown',
    release_year: null
  };

  const stored = typeof sanitizeMangaDocForStorage === 'function'
    ? sanitizeMangaDocForStorage(doc)
    : doc;
  stored._isLocallyModified = true;
  sessionMangaDocs[stored.id] = stored;

  const normalized = normalizeMangaDoc(stored, `${stored.id}.json`);
  normalized._isLocallyModified = true;
  allManga.push(normalized);

  if (typeof updateArtistsFromMangaDoc === 'function') updateArtistsFromMangaDoc(stored);
  if (typeof updateStats === 'function') updateStats();

  if (onArtistPage) {
    const dynamic = buildDynamicArtistData(currentArtistDoc.romaji || currentArtistDoc.name || currentArtistDoc.slug);
    if (dynamic) {
      currentArtistDoc.works = dynamic.works;
      currentArtistDoc.works_count = dynamic.works_count;
      currentArtistDoc.chapters_count = dynamic.chapters_count;
    }
    renderArtistPageContent(currentArtistDoc);
  }

  if (typeof applyFilters === 'function') applyFilters();
  closeAddDummyTitleModal();
  if (typeof openMangaDetail === 'function') openMangaDetail(stored.id);
  showToastNotification(`Added “${title}” as ${stored.id}. Fill in the page, then download the JSON to keep it.`, 'info', 5000);
}

function updateArtistsFromMangaDoc(doc) {
  if (!doc) return;
  const involvedArtists = new Set();
  const addNames = (str) => {
    if (!str) return;
    str.split(',').map(s => s.trim().replace(/^[,]+|[,]+$/g, '')).filter(Boolean).forEach(name => {
      if (name !== '[no data]' && name !== '[insufficient data]') involvedArtists.add(name);
    });
  };

  (doc.artists || []).forEach(a => addNames(a));
  (doc.volumes || []).forEach(v => {
    (v.chapters || []).forEach(c => { if (c.artist) addNames(c.artist); });
  });
  (doc.chapters || []).forEach(c => { if (c.artist) addNames(c.artist); });

  allArtists.forEach(a => {
    const existingWorkIdx = (a.works || []).findIndex(w => w.id === doc.id);

    const matchingVols = collectArtistVolumes(doc, a);

    if (matchingVols.length > 0) {
      const workObj = {
        id: doc.id,
        title_romaji: doc.title_romaji,
        title_jp: doc.title_jp,
        title_en: doc.title_en,
        cover: getPrimaryCover(doc),
        volumes: matchingVols
      };

      if (existingWorkIdx !== -1) {
        a.works[existingWorkIdx] = workObj;
      } else {
        a.works = a.works || [];
        a.works.unshift(workObj);
      }
      a._isLocallyModified = true;
      a.works_count = a.works.length;
      a.chapters_count = a.works.reduce((acc, w) => acc + countVolumeChapters(w.volumes || []), 0);
    } else if (existingWorkIdx !== -1) {
      a.works.splice(existingWorkIdx, 1);
      a._isLocallyModified = true;
      a.works_count = a.works.length;
      a.chapters_count = a.works.reduce((acc, w) => acc + countVolumeChapters(w.volumes || []), 0);
    }
  });

  involvedArtists.forEach(name => {
    const s = slugify(name);
    const exists = allArtists.some(a => a.slug === s || (a.romaji && a.romaji.toLowerCase() === name.toLowerCase()) || (a.name && a.name.toLowerCase() === name.toLowerCase()));
    if (!exists) {
      const newArt = buildDynamicArtistData(name);
      if (newArt && newArt.works_count > 0) {
        newArt._isLocallyModified = true;
        allArtists.push(newArt);
      }
    }
  });

  filteredArtists = [...allArtists];
}

function updateArtistAvatarLive(url) {
  const avatarImg = document.getElementById('artistAvatarImg');
  const avatarPlaceholder = document.getElementById('artistAvatarPlaceholder');
  if (!avatarImg || !avatarPlaceholder) return;
  if (url && url.trim()) {
    avatarImg.src = url.trim();
    avatarImg.classList.remove('hidden');
    avatarPlaceholder.classList.add('hidden');
  } else {
    avatarImg.classList.add('hidden');
    avatarPlaceholder.classList.remove('hidden');
  }
}

function startDirectArtistEdit() {
  if (typeof isEditModeEnabled === 'function' && !isEditModeEnabled()) return;
  if (!currentArtistDoc) return;
  const a = currentArtistDoc;

  const viewActs = document.getElementById('artistViewActions');
  const editActs = document.getElementById('artistEditActions');
  if (viewActs) viewActs.classList.add('hidden');
  if (editActs) editActs.classList.remove('hidden');

  const titleView = document.getElementById('artistTitleView');
  const titleEdit = document.getElementById('artistTitleEdit');
  if (titleView) titleView.classList.add('hidden');
  if (titleEdit) titleEdit.classList.remove('hidden');

  const bioView = document.getElementById('artistHeroBio');
  const bioEdit = document.getElementById('artistBioEdit');
  if (bioView) bioView.classList.add('hidden');
  if (bioEdit) bioEdit.classList.remove('hidden');

  const notesView = document.getElementById('artistNotesSection');
  const notesEdit = document.getElementById('artistNotesEdit');
  if (notesView) notesView.classList.add('hidden');
  if (notesEdit) notesEdit.classList.remove('hidden');

  const sourcesView = document.getElementById('artistSourcesSection');
  const sourcesEdit = document.getElementById('artistSourcesEdit');
  if (sourcesView) sourcesView.classList.add('hidden');
  if (sourcesEdit) sourcesEdit.classList.remove('hidden');

  const avatarEdit = document.getElementById('editArtistAvatarContainer');
  if (avatarEdit) avatarEdit.classList.remove('hidden');

  const circleView = document.getElementById('artistCircleDisplay');
  const circleEdit = document.getElementById('editArtistCircleContainer');
  if (circleView) {
    circleView.classList.add('hidden');
    const tr = circleView.closest('tr');
    if (tr) {
      tr.classList.remove('hidden');
      tr.style.display = '';
    }
  }
  if (circleEdit) circleEdit.classList.remove('hidden');

  const socialsView = document.getElementById('artistSocialLinks');
  const socialsEdit = document.getElementById('editArtistSocialsContainer');
  if (socialsView) socialsView.classList.add('hidden');
  if (socialsEdit) socialsEdit.classList.remove('hidden');

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = (val !== null && val !== undefined) ? val : '';
  };

  setVal('editArtistAvatar', a.image || '');
  setVal('editArtistName', a.romaji || a.name || '');
  setVal('editArtistKanji', a.kanji || '');
  setVal('editArtistCircle', a.circle || '');
  setVal('editArtistBio', a.bio || a.overview || '');
  setVal('editArtistNotes', a.notes || '');

  const sourcesEditEl = document.getElementById('editArtistSources');
  if (sourcesEditEl) {
    if (a.sources && Array.isArray(a.sources)) {
      sourcesEditEl.value = a.sources.map(s => typeof s === 'string' ? s : (s.url || s.desc || s.name || '')).filter(Boolean).join('\n');
    } else if (typeof a.sources === 'string') {
      sourcesEditEl.value = a.sources;
    } else {
      sourcesEditEl.value = '';
    }
  }

  setVal('editArtistTwitter', a.socials?.twitter || '');
  setVal('editArtistPixiv', a.socials?.pixiv || '');
  setVal('editArtistWebsite', a.socials?.website || '');
}

function cancelDirectArtistEdit(reRender = true) {
  const viewActs = document.getElementById('artistViewActions');
  const editActs = document.getElementById('artistEditActions');
  if (editActs) editActs.classList.add('hidden');
  if (viewActs) viewActs.classList.remove('hidden');

  const titleView = document.getElementById('artistTitleView');
  const titleEdit = document.getElementById('artistTitleEdit');
  if (titleEdit) titleEdit.classList.add('hidden');
  if (titleView) titleView.classList.remove('hidden');

  const bioView = document.getElementById('artistHeroBio');
  const bioEdit = document.getElementById('artistBioEdit');
  if (bioEdit) bioEdit.classList.add('hidden');
  if (bioView) bioView.classList.remove('hidden');

  const notesView = document.getElementById('artistNotesSection');
  const notesEdit = document.getElementById('artistNotesEdit');
  if (notesEdit) notesEdit.classList.add('hidden');
  if (notesView) notesView.classList.remove('hidden');

  const sourcesView = document.getElementById('artistSourcesSection');
  const sourcesEdit = document.getElementById('artistSourcesEdit');
  if (sourcesEdit) sourcesEdit.classList.add('hidden');
  if (sourcesView) sourcesView.classList.remove('hidden');

  const avatarEdit = document.getElementById('editArtistAvatarContainer');
  if (avatarEdit) avatarEdit.classList.add('hidden');

  const circleView = document.getElementById('artistCircleDisplay');
  const circleEdit = document.getElementById('editArtistCircleContainer');
  if (circleEdit) circleEdit.classList.add('hidden');
  if (circleView) circleView.classList.remove('hidden');

  const socialsView = document.getElementById('artistSocialLinks');
  const socialsEdit = document.getElementById('editArtistSocialsContainer');
  if (socialsEdit) socialsEdit.classList.add('hidden');
  if (socialsView) socialsView.classList.remove('hidden');

  if (reRender && currentArtistDoc) {
    renderArtistPageContent(currentArtistDoc);
  }
}

function saveDirectArtistEdit() {
  if (!currentArtistDoc) return;

  const romaji = document.getElementById('editArtistName')?.value.trim() || currentArtistDoc.romaji || currentArtistDoc.name || 'Artist Name';
  const kanji = document.getElementById('editArtistKanji')?.value.trim() || '';
  const circle = document.getElementById('editArtistCircle')?.value.trim() || null;
  const image = document.getElementById('editArtistAvatar')?.value.trim() || null;
  const bio = document.getElementById('editArtistBio')?.value.trim() || null;
  const notes = document.getElementById('editArtistNotes')?.value.trim() || null;

  const sourcesRaw = document.getElementById('editArtistSources')?.value || '';
  const sources = sourcesRaw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  const twitter = document.getElementById('editArtistTwitter')?.value.trim() || null;
  const pixiv = document.getElementById('editArtistPixiv')?.value.trim() || null;
  const website = document.getElementById('editArtistWebsite')?.value.trim() || null;

  const slug = currentArtistDoc.slug || slugify(romaji);

  const doc = {
    ...currentArtistDoc,
    slug: slug,
    romaji: romaji,
    kanji: kanji,
    circle: circle,
    image: image,
    bio: bio,
    notes: notes,
    sources: sources,
    socials: {
      twitter: twitter,
      pixiv: pixiv,
      website: website
    },
    has_page: true,
    _isLocallyModified: true
  };
  delete doc.name;

  const existingIdx = allArtists.findIndex(a => a.slug === doc.slug || (a.romaji && a.romaji.toLowerCase() === doc.romaji.toLowerCase()) || (a.name && a.name.toLowerCase() === doc.romaji.toLowerCase()));
  if (existingIdx !== -1) {
    allArtists[existingIdx] = { ...allArtists[existingIdx], ...doc };
  } else {
    allArtists.unshift(doc);
  }

  currentArtistDoc = doc;
  renderArtistPageContent(currentArtistDoc);

  cancelDirectArtistEdit();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToastNotification('Artist profile saved to local display only! Use "Download JSON" if you wish to export the file.', 'info');
}

async function downloadArtistJson() {
  if (!currentArtistDoc) return;
  const cleanDoc = typeof sanitizeArtistDocForStorage === 'function'
    ? sanitizeArtistDocForStorage(currentArtistDoc)
    : currentArtistDoc;
  const slug = cleanDoc.slug || slugify(currentArtistDoc.romaji || currentArtistDoc.kanji || 'artist');
  await saveJsonToFile(cleanDoc, `${slug}.json`);
}

const openArtistEditModal = startDirectArtistEdit;
const closeArtistEditModal = cancelDirectArtistEdit;
const saveArtistEditToSession = saveDirectArtistEdit;

function openPublisherPage(publisherName, pushHistory = true) {
  if (!publisherName || publisherName === 'Unknown' || publisherName === 'N/A' || publisherName === '[no data]') return;

  const pLower = publisherName.trim().toLowerCase();
  let pubWorks = allManga.filter(m => (m.publisher || '').trim().toLowerCase() === pLower);
  if (pubWorks.length === 0) {
    pubWorks = allManga.filter(m => (m.publisher || '').trim().toLowerCase().includes(pLower));
  }
  if (pubWorks.length === 0) return;

  pubWorks.sort((a, b) => (b.release_year || 0) - (a.release_year || 0));

  let totalVolumes = 0;
  const years = [];
  pubWorks.forEach(m => {
    if (m.release_year) years.push(m.release_year);
    totalVolumes += (m.volumes || []).length;
  });

  const yearsStr = years.length > 0
    ? (Math.min(...years) === Math.max(...years) ? `${Math.min(...years)}` : `${Math.min(...years)} – ${Math.max(...years)}`)
    : '—';

  currentPublisherData = {
    name: publisherName,
    works_count: pubWorks.length,
    volumes_count: totalVolumes,
    years: yearsStr,
    works: pubWorks
  };

  if (pushHistory) {
    window.location.hash = `publisher=${encodeURIComponent(publisherName)}`;
  }

  if (catalogView) catalogView.classList.add('hidden');
  if (mangaFullPageView) mangaFullPageView.classList.add('hidden');
  if (artistFullPageView) artistFullPageView.classList.add('hidden');
  if (publisherFullPageView) publisherFullPageView.classList.remove('hidden');

  scrollToWikiPriority();

  const nameEl = document.getElementById('publisherHeroName');
  if (nameEl) nameEl.textContent = publisherName;
  const breadcrumbEl = document.getElementById('publisherBreadcrumbName');
  if (breadcrumbEl) breadcrumbEl.textContent = publisherName;
  const captionEl = document.getElementById('publisherInfoboxNameCaption');
  if (captionEl) captionEl.textContent = publisherName;
  const descEl = document.getElementById('publisherHeroDesc');
  if (descEl) descEl.textContent = `Official publisher and imprint for ${publisherName} TYPE-MOON manga publications, tankōbon compilations, and anthology releases.`;

  const statWorks = document.getElementById('publisherStatWorks');
  if (statWorks) statWorks.textContent = pubWorks.length;
  const countPill = document.getElementById('publisherWorksCountPill');
  if (countPill) countPill.textContent = `${pubWorks.length} work${pubWorks.length === 1 ? '' : 's'}`;
  const statVolumes = document.getElementById('publisherStatVolumes');
  if (statVolumes) statVolumes.textContent = totalVolumes;
  const statYears = document.getElementById('publisherStatYears');
  if (statYears) statYears.textContent = yearsStr;

  const pubNoticeEl = document.getElementById('publisherMissingNotice');
  const pubNoticeDetails = document.getElementById('publisherMissingNoticeDetails');
  if (pubNoticeEl) {
    const missingPubFields = [];
    missingPubFields.push('Dedicated Corporate Profile & Overview');

    const worksMissingCovers = pubWorks.filter(m => !isNA(m.cover) && !hasValidCover(m.cover));
    if (worksMissingCovers.length > 0) {
      missingPubFields.push(`${worksMissingCovers.length} work${worksMissingCovers.length > 1 ? 's' : ''} missing cover art`);
    }

    const worksMissingIsbn = pubWorks.filter(m => m.missing_audit && m.missing_audit.missing_isbn);
    if (worksMissingIsbn.length > 0) {
      missingPubFields.push(`${worksMissingIsbn.length} work${worksMissingIsbn.length > 1 ? 's' : ''} missing ISBN/ASIN`);
    }

    if (missingPubFields.length > 0) {
      pubNoticeEl.classList.remove('hidden');
      pubNoticeEl.hidden = false;
      if (pubNoticeDetails) pubNoticeDetails.textContent = missingPubFields.join(', ');
    } else {
      pubNoticeEl.classList.add('hidden');
      pubNoticeEl.hidden = true;
    }
  }

  const listContainer = document.getElementById('publisherWorksList');
  if (listContainer) {
    listContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    pubWorks.forEach(manga => {
      const { main: mainTitle, jp: jpSubtitle } = resolveDisplayTitles(manga.title_en, manga.title_romaji, manga.title_jp, manga.id);

      const coverHtml = hasValidCover(manga.cover)
        ? `<div class="w-12 h-16 rounded overflow-hidden border border-cafe-gold/30 group-hover:border-cafe-gold bg-cafe-950 shrink-0 shadow transition-colors"><img src="${manga.cover}" alt="" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"></div>`
        : `<div class="no-data-thumb w-12 h-16"><span class="no-data-badge text-[8px]">[no data]</span></div>`;

      const itemCard = document.createElement('div');
      itemCard.className = 'list-row flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer group';
      itemCard.onclick = () => openMangaDetail(manga.id);

      const creditsHtml = renderFullCredits(manga);

      itemCard.innerHTML = `
        <div class="flex items-center gap-4 min-w-0">
          ${coverHtml}
          <div class="space-y-1 min-w-0">
            <h4 class="font-cinzel font-bold text-sm sm:text-base text-cafe-cream group-hover:text-cafe-gold transition-colors leading-snug line-clamp-1">
              ${escapeHtml(mainTitle)}
            </h4>
            ${jpSubtitle ? `<div class="text-xs text-cafe-gold/90 font-japanese font-medium truncate max-w-md">${escapeHtml(jpSubtitle)}</div>` : ''}
            <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-cafe-muted pt-0.5">
              <span class="type-badge shrink-0">${escapeHtml(formatTypeTag(manga.type, manga.series))}</span>
              ${creditsHtml}
            </div>
          </div>
        </div>

        <div class="shrink-0 self-start sm:self-center">
          ${renderStatusBadge(manga.status)}
        </div>
      `;

      fragment.appendChild(itemCard);
    });

    listContainer.appendChild(fragment);
  }
}

function startDirectPublisherEdit() {
  if (typeof isEditModeEnabled === 'function' && !isEditModeEnabled()) return;
  if (!currentPublisherData) return;
  const p = currentPublisherData;

  const viewActs = document.getElementById('publisherViewActions');
  const editActs = document.getElementById('publisherEditActions');
  if (viewActs) viewActs.classList.add('hidden');
  if (editActs) editActs.classList.remove('hidden');

  const titleView = document.getElementById('publisherTitleView');
  const titleEdit = document.getElementById('publisherTitleEdit');
  if (titleView) titleView.classList.add('hidden');
  if (titleEdit) titleEdit.classList.remove('hidden');

  const editName = document.getElementById('editPublisherName');
  if (editName) editName.value = p.name || '';

  const descView = document.getElementById('publisherHeroDesc');
  const descEdit = document.getElementById('publisherDescEdit');
  if (descView) descView.classList.add('hidden');
  if (descEdit) descEdit.classList.remove('hidden');

  const editDesc = document.getElementById('editPublisherDesc');
  if (editDesc) editDesc.value = p.overview || (descView ? descView.textContent.trim() : '');
}

function cancelDirectPublisherEdit() {
  const viewActs = document.getElementById('publisherViewActions');
  const editActs = document.getElementById('publisherEditActions');
  if (viewActs) viewActs.classList.remove('hidden');
  if (editActs) editActs.classList.add('hidden');

  const titleView = document.getElementById('publisherTitleView');
  const titleEdit = document.getElementById('publisherTitleEdit');
  if (titleView) titleView.classList.remove('hidden');
  if (titleEdit) titleEdit.classList.add('hidden');

  const descView = document.getElementById('publisherHeroDesc');
  const descEdit = document.getElementById('publisherDescEdit');
  if (descView) descView.classList.remove('hidden');
  if (descEdit) descEdit.classList.add('hidden');
}

function saveDirectPublisherEdit() {
  if (!currentPublisherData) return;
  const editName = document.getElementById('editPublisherName');
  const editDesc = document.getElementById('editPublisherDesc');

  const newName = editName ? editName.value.trim() : '';
  const newDesc = editDesc ? editDesc.value.trim() : '';

  if (newName) {
    currentPublisherData.name = newName;
    const heroName = document.getElementById('publisherHeroName');
    if (heroName) heroName.textContent = newName;
    const captionEl = document.getElementById('publisherInfoboxNameCaption');
    if (captionEl) captionEl.textContent = newName;
  }

  if (newDesc) {
    currentPublisherData.overview = newDesc;
    const heroDesc = document.getElementById('publisherHeroDesc');
    if (heroDesc) heroDesc.textContent = newDesc;

    const pubNoticeEl = document.getElementById('publisherMissingNotice');
    if (pubNoticeEl) {
      const pubNoticeDetails = document.getElementById('publisherMissingNoticeDetails');
      const missingPubFields = [];
      const pubWorks = currentPublisherData.works || [];
      const worksMissingCovers = pubWorks.filter(m => !isNA(m.cover) && !hasValidCover(m.cover));
      if (worksMissingCovers.length > 0) {
        missingPubFields.push(`${worksMissingCovers.length} work${worksMissingCovers.length > 1 ? 's' : ''} missing cover art`);
      }
      const worksMissingIsbn = pubWorks.filter(m => m.missing_audit && m.missing_audit.missing_isbn);
      if (worksMissingIsbn.length > 0) {
        missingPubFields.push(`${worksMissingIsbn.length} work${worksMissingIsbn.length > 1 ? 's' : ''} missing ISBN/ASIN`);
      }
      if (missingPubFields.length > 0) {
        pubNoticeEl.classList.remove('hidden');
        pubNoticeEl.hidden = false;
        if (pubNoticeDetails) pubNoticeDetails.textContent = missingPubFields.join(', ');
      } else {
        pubNoticeEl.classList.add('hidden');
        pubNoticeEl.hidden = true;
      }
    }
  }

  cancelDirectPublisherEdit();
}

function closePublisherPageView(updateHash = true) {
  cancelDirectPublisherEdit();
  if (publisherFullPageView) publisherFullPageView.classList.add('hidden');
  if (artistFullPageView) artistFullPageView.classList.add('hidden');
  if (mangaFullPageView) mangaFullPageView.classList.add('hidden');
  if (catalogView) catalogView.classList.remove('hidden');

  currentPublisherData = null;

  if (updateHash && (window.location.hash.startsWith('#publisher') || window.location.hash.startsWith('#publisher='))) {
    if (typeof currentCategory !== 'undefined' && currentCategory === 'artists') {
      window.location.hash = 'artists';
    } else {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
  }
}

