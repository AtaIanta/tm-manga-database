
const catalogView = document.getElementById('catalogView');
const mangaFullPageView = document.getElementById('mangaFullPageView');
const artistFullPageView = document.getElementById('artistFullPageView');
const publisherFullPageView = document.getElementById('publisherFullPageView');
const missingDataModal = document.getElementById('missingDataModal');
const aiDisclosureModal = document.getElementById('aiDisclosureModal');
let missingDataCategory = 'all';

let lightboxCovers = [];
let lightboxCurrentIdx = 0;
let lightboxMangaTitle = '';

const TARGET_WORK_SERIES_CODE_MAP = {
  "Fate/stay night": "FSN",
  "Fate/Zero": "FZ",
  "Fate/hollow ataraxia": "FHA",
  "Fate/Extra": "FE",
  "Fate/EXTRA CCC": "FECCC",
  "Fate/EXTELLA": "FEX",
  "Fate/Apocrypha": "FA",
  "Fate/Grand Order": "FGO",
  "Fate/strange Fake": "FSF",
  "Fate/Prototype": "FP",
  "Fate/kaleid liner PRISMA ILLYA": "PI",
  "Fate/Type Redline": "FTR",
  "Fate series": "FATE",
  "Tsukihime": "TSUKI",
  "Shingetsutan Tsukihime": "TSUKI",
  "Tsukihime -A piece of blue glass moon-": "TSUKI-R",
  "Melty Blood": "MB",
  "Kara no Kyoukai": "KNK",
  "Witch on the Holy Night": "MAHOYO",
  "Mahoutsukai no Yoru": "MAHOYO",
  "Mahoyo": "MAHOYO",
  "CANAAN": "CAN",
  "Canaan": "CAN",
  "Sekai Seifuku: Bouryaku no Zvezda": "ZVEZDA",
  "Zvezda": "ZVEZDA",
  "Koha-Ace": "KOHA",
  "Chibichuki!": "CHIBI",
  "Nasuverse": "NASU",
  "Other": "OTHER",
  "TYPE-MOON": "TM"
};

function getSeriesCodeFromTargetWork(targetWork) {
  if (!targetWork) return "TM";
  if (TARGET_WORK_SERIES_CODE_MAP[targetWork]) {
    return TARGET_WORK_SERIES_CODE_MAP[targetWork];
  }
  for (const [key, code] of Object.entries(TARGET_WORK_SERIES_CODE_MAP)) {
    if (targetWork.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(targetWork.toLowerCase())) {
      return code;
    }
  }
  return "TM";
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Opening a wiki page should start at the top of the content.
function scrollToWikiPriority() {
  if (window.scrollY <= 0) return;

  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  root.style.scrollBehavior = previous;
}

function linkCitationMarkers(html) {
  if (!html || typeof html !== 'string') return '';
  const parts = html.split(/(<[^>]+>)/g);
  let inAnchor = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('<')) {
      if (/^<a\b/i.test(part)) inAnchor = true;
      else if (/^<\/a>/i.test(part)) inAnchor = false;
      continue;
    }
    if (!inAnchor && part) {
      parts[i] = part.replace(/\[\^?(\d+)\]/g, (match, num) => {
        return `<sup class="reference font-mono font-bold text-cafe-gold text-[10px] ml-0.5 select-none"><a href="#source-${num}" id="cite-ref-${num}" class="hover:underline hover:text-cafe-amber" title="Jump to source [${num}]">[${num}]</a></sup>`;
      });
    }
  }

  return parts.join('');
}

function renderMarkdown(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return '';

  let html = '';
  if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
    try {
      html = marked.parse(text, { breaks: true, gfm: true });
    } catch (e) {
      console.warn('marked.parse error, using fallback:', e);
      html = escapeHtml(text).replace(/\n/g, '<br>');
    }
  } else {
    html = escapeHtml(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\[(.*?)\]\(((?:https?:\/\/|\/|#)[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-cafe-gold hover:underline">$1</a>')
      .replace(/\n\n/g, '<br><br>')
      .replace(/\n/g, '<br>');
  }

  return linkCitationMarkers(html);
}

function slugify(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .substring(0, 45);
}

function mangaIdFromTitle(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== 'string') {
    return { includeTerms: [], excludeTerms: [] };
  }

  const regex = /(?:-?"[^"]*"|-[^\s]+|[^\s]+)/g;
  const matches = rawQuery.match(regex) || [];

  const includeTerms = [];
  const excludeTerms = [];

  for (const token of matches) {
    let isExclude = false;
    let term = token.trim();

    if (term.startsWith('-') && term.length > 1) {
      isExclude = true;
      term = term.slice(1).trim();
    }

    if (term.startsWith('"') && term.endsWith('"') && term.length >= 2) {
      term = term.slice(1, -1).trim();
    }

    term = term.toLowerCase();
    if (!term || term === '-') continue;

    if (isExclude) {
      excludeTerms.push(term);
    } else {
      includeTerms.push(term);
    }
  }

  return { includeTerms, excludeTerms };
}

function matchesSearchQuery(searchableText, includeTerms, excludeTerms) {
  if (!includeTerms.length && !excludeTerms.length) return true;
  const text = (searchableText || '').toLowerCase();

  for (const exc of excludeTerms) {
    if (text.includes(exc)) {
      return false;
    }
  }

  for (const inc of includeTerms) {
    if (!text.includes(inc)) {
      return false;
    }
  }

  return true;
}

function copyText(text, element) {
  if (!text || text === 'N/A' || text === '[no data]') return;
  navigator.clipboard.writeText(text).then(() => {
    if (element) {
      const origText = element.dataset.origText || element.innerHTML;
      element.dataset.origText = origText;
      element.classList.add('copy-tooltip', 'copied');
      setTimeout(() => {
        element.classList.remove('copied');
      }, 1500);
    }
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function showToastNotification(msg, type = 'warning') {
  let toast = document.getElementById('appToastNotice');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToastNotice';
    document.body.appendChild(toast);
  }
  const isBlue = type === 'info' || msg.toLowerCase().includes('local display') || msg.toLowerCase().includes('synced');
  toast.className = `fixed bottom-5 right-5 z-50 max-w-md ${isBlue ? 'bg-sky-950/95 border-sky-400/80 text-sky-200' : 'bg-amber-950/95 border-amber-500/80 text-amber-200'} border px-4 py-3 rounded-xl shadow-2xl text-xs flex items-center gap-3 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-none`;
  toast.innerHTML = `
    <span class="text-base shrink-0">${isBlue ? 'ℹ️' : '⚠️'}</span>
    <span class="leading-relaxed font-medium">${escapeHtml(msg)}</span>
  `;
  toast.classList.remove('pointer-events-none', 'opacity-0', 'translate-y-2');
  toast.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2', 'pointer-events-none');
    toast.classList.remove('opacity-100', 'translate-y-0');
  }, 6000);
}

async function saveJsonToFile(data, suggestedFilename) {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: suggestedFilename,
        types: [{
          description: 'JSON File',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();
      showToastNotification(`Saved to ${handle.name}!`, 'info');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('showSaveFilePicker failed, falling back to download:', err);
    }
  }
  const blob = new Blob([jsonStr], { type: 'application/json' });
  downloadBlob(blob, suggestedFilename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function isNA(val) {
  if (val === null || val === undefined) return false;
  const s = String(val).trim().toUpperCase();
  return s === 'N/A' || s === 'NA' || s === '[N/A]' || s === 'NOT APPLICABLE' || s === '[NOT APPLICABLE]';
}

function renderValueOrNoData(val, isMonospace = false) {
  if (isNA(val)) {
    return '';
  }
  if (val === null || val === undefined || val === '' || val === '[no data]' || val === 'TBD' || val === 'Unknown') {
    return `<span class="no-data-badge">[no data]</span>`;
  }
  if (isMonospace) {
    return `<span class="font-mono-isbn text-white">${escapeHtml(val.toString())}</span>`;
  }
  return escapeHtml(val.toString());
}

function formatTypeTag(type, series) {
  const cleanType = (type || '').trim();
  const cleanSeries = (series || '').trim();
  if (!cleanType && !cleanSeries) return 'Manga';
  if (!cleanSeries || cleanSeries.toLowerCase() === 'other' || cleanSeries.toLowerCase() === 'nasuverse' || cleanType.toLowerCase() === cleanSeries.toLowerCase()) {
    return cleanType || cleanSeries;
  }
  if (!cleanType) return cleanSeries;
  return `${cleanType} · ${cleanSeries}`;
}

function mapToCanonicalFranchise(seriesName) {
  if (!seriesName || seriesName === 'Unknown' || seriesName === '[no data]' || seriesName === 'N/A') return 'Unknown';
  const s = seriesName.trim();
  if (/^fate/i.test(s) || /el-melloi/i.test(s)) return 'Fate series';
  if (/tsukihime/i.test(s) || /melty blood/i.test(s) || /hana no miyako/i.test(s)) return 'Tsukihime';
  if (/mahoutsukai no yoru/i.test(s) || /mahoyo/i.test(s)) return 'Mahoyo';
  if (/canaan/i.test(s)) return 'Canaan';
  if (/zvezda/i.test(s)) return 'Zvezda';
  if (/all around type-moon/i.test(s) || /kara no kyoukai/i.test(s) || /koha-ace/i.test(s) || /chibichuki/i.test(s) || /tsuki no sango/i.test(s) || /mahoutsukai no hako/i.test(s) || /type-moon/i.test(s) || /nasuverse/i.test(s)) return 'Nasuverse';
  return 'Other';
}

function renderStatusBadge(status) {
  const s = (status || '').toString().trim();
  const sLower = s.toLowerCase();

  if (sLower.includes('ongoing') || sLower.includes('publishing')) {
    return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-950/80 text-sky-400 border border-sky-500/40 whitespace-nowrap">Ongoing</span>`;
  } else if (sLower.includes('hiatus')) {
    return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-500/40 whitespace-nowrap">Hiatus</span>`;
  } else if (sLower.includes('cancelled') || sLower.includes('canceled')) {
    return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-500/40 whitespace-nowrap">Cancelled</span>`;
  } else if (sLower.includes('finished') || sLower.includes('completed')) {
    return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 whitespace-nowrap">Finished</span>`;
  } else {
    return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-cafe-900/90 text-cafe-cream border border-stone-400/40 whitespace-nowrap" title="Publication status unconfirmed / unknown">Unknown</span>`;
  }
}

function hasValidCover(url) {
  return !!(url && url.trim() && !url.includes('simg') && url !== '[no data]');
}

function getPrimaryCover(manga) {
  for (const vol of (manga?.volumes || [])) {
    if (hasValidCover(vol.cover)) return vol.cover;
  }
  if (hasValidCover(manga?.cover)) return manga.cover;
  return '';
}

function getMangaMissingFields(manga) {
  if (!manga) return [];
  const record = (typeof sessionMangaDocs !== 'undefined' && manga.id && sessionMangaDocs[manga.id]) || manga;
  const missingFields = [];
  const displayCover = getPrimaryCover(record);
  if (!isNA(displayCover) && !hasValidCover(displayCover)) missingFields.push('Cover Art');

  const volumes = record.volumes || [];
  const isIsbnNA = volumes.length > 0 && volumes.every(v => isNA(v.isbn) || v.is_uncollected);
  const volsMissingIsbn = volumes.filter(v => !v.is_uncollected && !isNA(v.isbn) && (!v.isbn || v.isbn === '[no data]')).length;
  if (!isIsbnNA && volsMissingIsbn > 0) {
    missingFields.push(`ISBN (${volsMissingIsbn} vols)`);
  }

  const isArtistNA = Array.isArray(record.artists) && record.artists.length > 0 && record.artists.every(isNA);
  const hasValidArtist = (record.artists || []).some(a => a && a !== '[no data]' && a !== '[insufficient data]' && !isNA(a));
  const hasValidRole = (record.custom_roles || []).some(r => r.names && r.names !== '[no data]' && !isNA(r.names));
  if (!isArtistNA && !hasValidArtist && !hasValidRole) missingFields.push('Artist Attribution');

  const serVal = record.magazine;
  if (!isNA(serVal) && (!serVal || serVal === '[no data]')) missingFields.push('Magazine Serialization');

  const status = record.status;
  if (!isNA(status) && (!status || status === '[no data]' || String(status).toLowerCase() === 'unknown')) {
    missingFields.push('Status Validation');
  }

  const synVal = (record.synopsis || '').trim();
  if (!isNA(synVal) && (!synVal || synVal === '[no data]')) missingFields.push('Synopsis');

  if (volumes.length > 0) {
    const volsWithoutChapters = volumes.filter(v => !isNA(v.chapters) && !v.is_uncollected && (!v.chapters || v.chapters.length === 0));
    if (volsWithoutChapters.length > 0) {
      missingFields.push(`Chapter Lists (${volsWithoutChapters.length} vols)`);
    }
  }

  return missingFields;
}

function resolveDisplayTitles(titleEn, titleRomaji, titleJp, fallback = '') {
  const cleanEn = (titleEn || '').trim();
  const cleanRomaji = (titleRomaji || '').trim();
  const cleanJp = (titleJp || '').trim();
  const main = (cleanEn && cleanEn !== '[no data]') ? cleanEn : (cleanRomaji || fallback);
  const jpNoBrackets = cleanJp.replace(/[『』]/g, '');
  const showJp = cleanJp && cleanJp !== '[no data]' && cleanJp !== main && cleanJp !== cleanRomaji && cleanJp !== cleanEn &&
                 jpNoBrackets !== cleanRomaji && jpNoBrackets !== cleanEn;
  return { main, jp: showJp ? cleanJp : '' };
}

function renderArtistLinks(artists) {
  const list = (artists || []).filter(a => a && !a.toLowerCase().includes('various'));
  if (!list.length || list.some(a => a === '[no data]' || a === '[insufficient data]')) {
    return '<span class="no-data-badge">[no data]</span>';
  }
  return list.map(a =>
    `<button onclick="event.stopPropagation(); openArtistPage('${escapeHtml(a)}');" class="text-cafe-gold hover:underline font-semibold text-left">${escapeHtml(a)}</button>`
  ).join(', ');
}

function renderFullCredits(manga) {
  if (!manga) return '';
  const parts = [];

  const formatNames = (names) => {
    const list = typeof names === 'string'
      ? names.split(',').map(s => s.trim()).filter(Boolean)
      : (Array.isArray(names) ? names.filter(s => s && s.trim()) : [names]);

    if (!list.length) return '';

    return list.map(name => {
      const s = typeof slugify === 'function' ? slugify(name) : name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const isArtist = typeof allArtists !== 'undefined' && Array.isArray(allArtists) && allArtists.some(a =>
        a.slug === s ||
        (a.romaji && a.romaji.toLowerCase() === name.toLowerCase()) ||
        (a.name && a.name.toLowerCase() === name.toLowerCase())
      );
      if (isArtist) {
        return `<button onclick="event.stopPropagation(); openArtistPage('${escapeHtml(name)}');" class="text-cafe-gold hover:underline font-semibold text-left">${escapeHtml(name)}</button>`;
      }
      return `<span class="text-cafe-cream font-medium">${escapeHtml(name)}</span>`;
    }).join(', ');
  };

  if (manga.custom_roles && Array.isArray(manga.custom_roles) && manga.custom_roles.length > 0) {
    manga.custom_roles.forEach(r => {
      const roleName = (r.role || 'Story:').trim().replace(/[:\s]+$/, '');
      const renderedNames = formatNames(r.names);
      if (renderedNames) {
        parts.push(`<span><span class="text-white font-medium">${escapeHtml(roleName)}:</span> ${renderedNames}</span>`);
      }
    });
  }
  const hasCustomArt = manga.custom_roles && Array.isArray(manga.custom_roles) && manga.custom_roles.some(r => /art|illustrat/i.test(r.role || ''));
  if (!hasCustomArt) {
    const artDisplay = renderArtistLinks(manga.artists);
    parts.push(`<span><span class="text-white font-medium">Art:</span> ${artDisplay}</span>`);
  }

  return parts.join(' <span class="text-cafe-gold/40">·</span> ');
}

function renderGridCredits(manga) {
  if (!manga) return '';
  const rows = [];

  const formatNames = (names) => {
    const list = typeof names === 'string'
      ? names.split(',').map(s => s.trim()).filter(Boolean)
      : (Array.isArray(names) ? names.filter(s => s && s.trim()) : [names]);

    if (!list.length) return '';

    return list.map(name => {
      const s = typeof slugify === 'function' ? slugify(name) : name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const isArtist = typeof allArtists !== 'undefined' && Array.isArray(allArtists) && allArtists.some(a =>
        a.slug === s ||
        (a.romaji && a.romaji.toLowerCase() === name.toLowerCase()) ||
        (a.name && a.name.toLowerCase() === name.toLowerCase())
      );
      if (isArtist) {
        return `<button onclick="event.stopPropagation(); openArtistPage('${escapeHtml(name)}');" class="text-cafe-gold hover:underline font-semibold text-left">${escapeHtml(name)}</button>`;
      }
      return `<span class="text-cafe-cream font-medium">${escapeHtml(name)}</span>`;
    }).join(', ');
  };

  if (manga.custom_roles && Array.isArray(manga.custom_roles) && manga.custom_roles.length > 0) {
    manga.custom_roles.forEach(r => {
      const roleName = (r.role || 'Story:').trim().replace(/[:\s]+$/, '');
      const renderedNames = formatNames(r.names);
      if (renderedNames) {
        rows.push(`
          <div class="flex items-center text-cafe-cream/80 text-[11px]">
            <span class="text-white mr-1.5 shrink-0 font-medium">${escapeHtml(roleName)}:</span>
            <span class="truncate">${renderedNames}</span>
          </div>
        `);
      }
    });
  }
  const hasCustomArt = manga.custom_roles && Array.isArray(manga.custom_roles) && manga.custom_roles.some(r => /art|illustrat/i.test(r.role || ''));
  if (!hasCustomArt) {
    const artDisplay = renderArtistLinks(manga.artists);
    rows.push(`
      <div class="flex items-center text-cafe-cream/80 text-[11px]">
        <span class="text-white mr-1.5 shrink-0 font-medium">Art:</span>
        <span class="truncate">${artDisplay}</span>
      </div>
    `);
  }

  return rows.join('');
}

function renderChapterRow(ch, trailingHtml = '') {
  const rawNum = (ch.chapter_number !== undefined && ch.chapter_number !== null) ? ch.chapter_number : (ch.chapter || '');
  const numStr = rawNum ? rawNum.toString().trim() : '';
  const titleStr = (ch.title || '').trim();
  const titleJpStr = (ch.title_jp || '').trim();

  let chPrefix = '';
  if (numStr) {
    const isPureNumber = /^\d+(\.\d+)?$/.test(numStr);
    const startsWithChapter = /^chapter\b/i.test(numStr);
    if (startsWithChapter) {
      chPrefix = numStr;
    } else if (isPureNumber) {
      if (/^chapter\b/i.test(titleStr)) {

        chPrefix = numStr;
      } else {
        chPrefix = `Chapter ${numStr}`;
      }
    } else {
      chPrefix = numStr;
    }
  }

  let titleHtml = '';
  if (titleStr || titleJpStr) {
    let formattedTitle = '';
    let rawCombined = '';
    if (titleStr && titleJpStr) {
      formattedTitle = `${escapeHtml(titleStr)} <span class="font-japanese text-cafe-gold/90 font-normal ml-1.5">(${escapeHtml(titleJpStr)})</span>`;
      rawCombined = `${titleStr} (${titleJpStr})`;
    } else if (titleStr) {
      formattedTitle = escapeHtml(titleStr);
      rawCombined = titleStr;
    } else {
      formattedTitle = `<span class="font-japanese text-cafe-gold/90 font-normal">(${escapeHtml(titleJpStr)})</span>`;
      rawCombined = `(${titleJpStr})`;
    }

    if (chPrefix) {
      titleHtml = `<span class="text-cafe-muted/60 shrink-0">-</span> <span class="truncate" title="${escapeHtml(rawCombined)}">${formattedTitle}</span>`;
    } else {
      titleHtml = `<span class="truncate" title="${escapeHtml(rawCombined)}">${formattedTitle}</span>`;
    }
  }

  return `
    <div class="chapter-row">
      ${chPrefix ? `<span class="shrink-0 font-semibold">${escapeHtml(chPrefix)}</span>` : ''}
      ${titleHtml}
      ${trailingHtml}
    </div>
  `;
}

function renderSourcesList(rawSources) {
  const validSources = [];
  if (Array.isArray(rawSources)) {
    rawSources.forEach(s => {
      if (typeof s === 'string' && s.trim()) validSources.push(s.trim());
      else if (s && typeof s === 'object') {
        const u = s.url || s.desc || s.name || '';
        if (u.trim()) validSources.push(u.trim());
      }
    });
  } else if (typeof rawSources === 'string' && rawSources.trim()) {
    validSources.push(rawSources.trim());
  }

  if (validSources.length === 0) {
    return `<span class="no-data-badge">[no data]</span>`;
  }

  return `
    <ol class="list-decimal list-inside space-y-1.5 text-xs text-cafe-cream/90 leading-relaxed">
      ${validSources.map((src, idx) => {
        const num = idx + 1;
        const contentHtml = /^https?:\/\//i.test(src)
          ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" class="text-cafe-gold hover:underline font-mono-isbn text-xs inline-flex items-center gap-1 break-all">
               <span>${escapeHtml(src)}</span>
               <svg class="w-3 h-3 text-cafe-gold/60 shrink-0 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
             </a>`
          : `<span>${renderMarkdown(src)}</span>`;
        return `
          <li id="source-${num}" class="pl-1 transition-colors">
            <a href="#cite-ref-${num}" class="text-cafe-gold/70 hover:text-cafe-gold hover:underline mr-1 font-bold select-none" title="Jump up to citation in text">^</a>
            ${contentHtml}
          </li>
        `;
      }).join('')}
    </ol>
  `;
}

function getMangaCoversList(manga) {
  const covers = [];
  const seenUrls = new Set();
  const isValidUrl = (url) => url && typeof url === 'string' && url.trim() !== '' && url !== '[no data]' && !url.includes('simg');

  if (Array.isArray(manga.volumes)) {
    manga.volumes.forEach((v, idx) => {
      if (isValidUrl(v.cover) && !seenUrls.has(v.cover)) {
        seenUrls.add(v.cover);
        const vNum = (v.volume_number !== undefined && v.volume_number !== null) ? String(v.volume_number).trim() : (v.volume || (idx + 1));
        const vLabel = (typeof vNum === 'string' && /^(vol|volume)\b/i.test(vNum)) ? vNum : `Vol. ${vNum}`;
        covers.push({
          label: `${vLabel} Cover`,
          shortLabel: vLabel,
          url: v.cover,
          fullUrl: v.cover_full || null,
          volNum: vNum
        });
      }
    });
  }

  if (isValidUrl(manga.cover) && !seenUrls.has(manga.cover)) {
    seenUrls.add(manga.cover);
    if (covers.length === 0) {
      covers.push({
        label: 'Cover',
        shortLabel: 'Cover',
        url: manga.cover,
        volNum: 1
      });
    } else {
      covers.unshift({
        label: 'Main Cover',
        shortLabel: 'Main',
        url: manga.cover,
        volNum: null
      });
    }
  }

  return covers;
}

window.switchInfoboxCover = function(url, label) {
  const infoboxCover = document.getElementById('infoboxCoverImg');
  const infoboxCoverCaption = document.getElementById('infoboxCoverCaption');
  const infoboxCoverSelector = document.getElementById('infoboxCoverSelector');
  if (infoboxCover && url) {
    infoboxCover.src = url;
    infoboxCover.classList.remove('hidden');
  }
  if (infoboxCoverCaption) {
    if (!infoboxCoverSelector || infoboxCoverSelector.classList.contains('hidden') || !infoboxCoverSelector.hasChildNodes()) {
      infoboxCoverCaption.textContent = label;
      infoboxCoverCaption.classList.remove('hidden');
    } else {
      infoboxCoverCaption.textContent = '';
      infoboxCoverCaption.classList.add('hidden');
    }
  }
  if (infoboxCoverSelector) {
    const buttons = infoboxCoverSelector.querySelectorAll('button');
    buttons.forEach(b => {
      if (b.textContent.trim() === label.trim()) {
        b.className = 'px-2 py-0.5 rounded text-[11px] transition-all bg-cafe-gold text-cafe-950 font-bold shadow-sm';
      } else {
        b.className = 'px-2 py-0.5 rounded text-[11px] transition-all text-cafe-cream/80 hover:text-cafe-gold hover:bg-cafe-900/80 border border-cafe-gold/20';
      }
    });
  }
};

window.openVolumeCover = function(coverUrl, volTitle) {
  if (!coverUrl || coverUrl === '[no data]') return;
  const covers = (typeof currentDetailDoc !== 'undefined' && currentDetailDoc) ? getMangaCoversList(currentDetailDoc) : [];
  const title = (typeof currentDetailDoc !== 'undefined' && currentDetailDoc) ? (currentDetailDoc.title_en || currentDetailDoc.title_romaji || currentDetailDoc.id) : '';
  if (covers && covers.length > 0) {
    const idx = covers.findIndex(c => c.url === coverUrl || (c.url && coverUrl && (coverUrl.endsWith(c.url) || c.url.endsWith(coverUrl))));
    if (idx >= 0) {
      openCoverLightbox(covers, idx, title);
      return;
    }
  }
  openCoverLightbox([{ url: coverUrl, label: volTitle ? `${volTitle} Cover` : 'Cover' }], 0, title);
};

function resolveFullCoverUrl(cov) {
  if (cov.fullUrl) return cov.fullUrl;
  let candidate = cov.url;
  if (candidate === cov.url && cov.url && cov.url.includes('/small/')) {
    candidate = cov.url.replace('/small/', '/full/');
  }
  if (typeof sessionUploadedCovers !== 'undefined') {
    if (sessionUploadedCovers[candidate]) {
      if (!cov._sessionFullUrl) {
        try { cov._sessionFullUrl = URL.createObjectURL(sessionUploadedCovers[candidate]); } catch (e) {}
      }
      return cov._sessionFullUrl || candidate;
    }
    if (sessionUploadedCovers[cov.url]) {
      if (!cov._sessionUrl) {
        try { cov._sessionUrl = URL.createObjectURL(sessionUploadedCovers[cov.url]); } catch (e) {}
      }
      return cov._sessionUrl || cov.url;
    }
  }
  return candidate || cov.url;
}

window.openCoverLightbox = function(coversArray, startIdx, mangaTitle) {
  if (!coversArray || coversArray.length === 0) return;
  lightboxCovers = coversArray;
  lightboxCurrentIdx = Math.max(0, Math.min(startIdx || 0, coversArray.length - 1));
  lightboxMangaTitle = mangaTitle || '';
  renderCoverLightbox();
  const modal = document.getElementById('coverLightboxModal');
  if (modal) modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

window.openCurrentCoverLightbox = function() {
  if (typeof currentDetailDoc === 'undefined' || !currentDetailDoc) return;
  const covers = getMangaCoversList(currentDetailDoc);
  if (!covers || covers.length === 0) return;
  const infoboxImg = document.getElementById('infoboxCoverImg');
  const currentSrc = infoboxImg ? infoboxImg.src : '';
  let startIdx = 0;
  if (currentSrc) {
    const found = covers.findIndex(c => currentSrc.endsWith(c.url) || c.url === currentSrc);
    if (found >= 0) startIdx = found;
  }
  const title = currentDetailDoc.title_en || currentDetailDoc.title_romaji || currentDetailDoc.id;
  openCoverLightbox(covers, startIdx, title);
};

window.navigateCoverLightbox = function(dir) {
  if (!lightboxCovers.length) return;
  lightboxCurrentIdx = (lightboxCurrentIdx + dir + lightboxCovers.length) % lightboxCovers.length;
  renderCoverLightbox();
};

window.closeCoverLightbox = function() {
  const modal = document.getElementById('coverLightboxModal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
};

function renderCoverLightbox() {
  const cov = lightboxCovers[lightboxCurrentIdx];
  if (!cov) return;
  const fullUrl = resolveFullCoverUrl(cov);

  const img = document.getElementById('coverLightboxImg');
  if (img) {
    img.style.opacity = '0.6';
    img.src = fullUrl;
    img.onload = () => { img.style.opacity = '1'; };
  }

  const titleEl = document.getElementById('coverLightboxTitle');
  if (titleEl) titleEl.textContent = lightboxMangaTitle || 'Cover Preview';

  const captionEl = document.getElementById('coverLightboxCaption');
  if (captionEl) captionEl.textContent = cov.label || 'Cover';

  const counterEl = document.getElementById('coverLightboxCounter');
  if (counterEl) {
    if (lightboxCovers.length > 1) {
      counterEl.textContent = `${lightboxCurrentIdx + 1} / ${lightboxCovers.length}`;
      counterEl.classList.remove('hidden');
    } else {
      counterEl.classList.add('hidden');
    }
  }

  const rawLink = document.getElementById('coverLightboxOpenRaw');
  if (rawLink) rawLink.href = fullUrl;

  const prevBtn = document.getElementById('coverLightboxPrevBtn');
  const nextBtn = document.getElementById('coverLightboxNextBtn');
  const hasMultiple = lightboxCovers.length > 1;
  if (prevBtn) prevBtn.style.display = hasMultiple ? '' : 'none';
  if (nextBtn) nextBtn.style.display = hasMultiple ? '' : 'none';

  const thumbsContainer = document.getElementById('coverLightboxThumbnails');
  if (thumbsContainer) {
    if (lightboxCovers.length <= 1) {
      thumbsContainer.innerHTML = '';
    } else {
      thumbsContainer.innerHTML = lightboxCovers.map((c, idx) => {
        const isActive = idx === lightboxCurrentIdx;
        return `
          <button type="button" onclick="navigateCoverLightbox(${idx - lightboxCurrentIdx}); event.stopPropagation();"
                  class="flex flex-col items-center gap-1 p-1 rounded-lg transition-all ${isActive ? 'ring-2 ring-cafe-gold bg-cafe-900' : 'opacity-60 hover:opacity-90 hover:bg-cafe-900/50'}"
                  title="${escapeHtml(c.label)}">
            <div class="w-9 h-14 sm:w-11 sm:h-16 rounded overflow-hidden bg-cafe-950 border ${isActive ? 'border-cafe-gold' : 'border-cafe-gold/30'}">
              <img src="${escapeHtml(c.url)}" alt="${escapeHtml(c.label)}" class="w-full h-full object-cover">
            </div>
            <span class="text-[9px] font-medium text-cafe-gold ${isActive ? '' : 'text-cafe-muted'} max-w-[48px] truncate">${escapeHtml(c.shortLabel || c.label)}</span>
          </button>
        `;
      }).join('');
    }
  }
}

function initAmbientCanvas() {
  const canvas = document.getElementById('ambientCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const particles = [];
  const count = 35;
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 2.2 + 0.8,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: -Math.random() * 0.45 - 0.15,
      alpha: Math.random() * 0.45 + 0.15,
      color: Math.random() > 0.4 ? '#e5c158' : (Math.random() > 0.5 ? '#c59b27' : '#55c97b')
    });
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.y < -10) {
        p.y = canvas.height + 10;
        p.x = Math.random() * canvas.width;
      }
      if (p.x < -10) p.x = canvas.width + 10;
      if (p.x > canvas.width + 10) p.x = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });
    ctx.globalAlpha = 1.0;
    requestAnimationFrame(animate);
  }
  animate();
}

const EDIT_MODE_KEY = 'tmEditMode';
let editModeEnabled = false;

function isEditModeEnabled() {
  return editModeEnabled;
}

function syncEditModeToggle() {
  const toggle = document.getElementById('editModeToggle');
  if (!toggle) return;
  toggle.classList.toggle('is-on', editModeEnabled);
  toggle.setAttribute('aria-checked', editModeEnabled ? 'true' : 'false');
}

function closeActiveEditors() {
  const mangaEdit = document.getElementById('mangaEditActions');
  if (mangaEdit && !mangaEdit.classList.contains('hidden') && typeof cancelDirectMangaEdit === 'function') {
    cancelDirectMangaEdit();
  }
  const artistEdit = document.getElementById('artistEditActions');
  if (artistEdit && !artistEdit.classList.contains('hidden') && typeof cancelDirectArtistEdit === 'function') {
    cancelDirectArtistEdit(false);
  }
  const publisherEdit = document.getElementById('publisherEditActions');
  if (publisherEdit && !publisherEdit.classList.contains('hidden') && typeof cancelDirectPublisherEdit === 'function') {
    cancelDirectPublisherEdit();
  }
  const dummyModal = document.getElementById('addDummyTitleModal');
  if (dummyModal && !dummyModal.classList.contains('hidden') && typeof closeAddDummyTitleModal === 'function') {
    closeAddDummyTitleModal();
  }
}

function setEditMode(enabled) {
  const next = Boolean(enabled);
  const turningOff = editModeEnabled && !next;
  editModeEnabled = next;
  document.body.classList.toggle('edit-mode', editModeEnabled);
  if (turningOff) closeActiveEditors();
  try {
    localStorage.setItem(EDIT_MODE_KEY, editModeEnabled ? '1' : '0');
  } catch (e) {}
  syncEditModeToggle();
  if (typeof applyFilters === 'function') applyFilters();
}

function toggleEditMode() {
  setEditMode(!editModeEnabled);
}

function initEditMode() {
  try {
    editModeEnabled = localStorage.getItem(EDIT_MODE_KEY) === '1';
  } catch (e) {
    editModeEnabled = false;
  }
  document.body.classList.toggle('edit-mode', editModeEnabled);
  syncEditModeToggle();
}

function isModalOpen() {
  const aboutModal = document.getElementById('aboutModal');
  const aboutOpen = aboutModal && !aboutModal.classList.contains('hidden');
  const missingOpen = missingDataModal && !missingDataModal.classList.contains('hidden');
  const aiOpen = aiDisclosureModal && !aiDisclosureModal.classList.contains('hidden');
  const lightboxModal = document.getElementById('coverLightboxModal');
  const lightboxOpen = lightboxModal && !lightboxModal.classList.contains('hidden');
  return Boolean(aboutOpen || missingOpen || aiOpen || lightboxOpen);
}

function openAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (!modal) return;
  syncEditModeToggle();
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAboutModal() {
  const modal = document.getElementById('aboutModal');
  if (modal) modal.classList.add('hidden');
  if (!isModalOpen()) document.body.style.overflow = '';
}

function openMissingDataFromAbout() {
  closeAboutModal();
  openMissingDataModal();
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const modal = document.getElementById('aboutModal');
  if (!modal || modal.classList.contains('hidden')) return;
  event.preventDefault();
  closeAboutModal();
});

initEditMode();

function openAiDisclosureModal() {
  const m = document.getElementById('aiDisclosureModal');
  if (m) m.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAiDisclosureModal() {
  const m = document.getElementById('aiDisclosureModal');
  if (m) m.classList.add('hidden');
  document.body.style.overflow = '';
}

function openMissingDataModal() {
  renderMissingDataReport();
  if (missingDataModal) missingDataModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeMissingDataModal(returnToAbout = true) {
  if (missingDataModal) missingDataModal.classList.add('hidden');
  if (returnToAbout) {
    openAboutModal();
    return;
  }
  if (!isModalOpen()) document.body.style.overflow = '';
}

function setMissingDataFilter(category) {
  missingDataCategory = category;
  document.querySelectorAll('.missing-filter-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-cafe-gold', 'text-cafe-950');
    btn.classList.add('bg-cafe-900/80', 'text-cafe-cream/80');
  });

  const activeBtn = document.getElementById(`missingFilterBtn-${category}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-cafe-gold', 'text-cafe-950');
    activeBtn.classList.remove('bg-cafe-900/80', 'text-cafe-cream/80');
  }

  renderMissingDataReport();
}

function handleMissingDataSearch() {
  renderMissingDataReport();
}

function renderMissingDataReport() {
  const rawSearch = document.getElementById('missingDataSearchInput')?.value || '';
  const { includeTerms, excludeTerms } = parseSearchQuery(rawSearch);
  const search = rawSearch.trim().toLowerCase();
  const listContainer = document.getElementById('missingDataList');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  let totalIncomplete = 0;
  let missingCoversCount = 0;
  let missingIsbnCount = 0;
  let missingChaptersCount = 0;

  const incompleteWorks = [];

  (typeof allManga !== 'undefined' ? allManga : []).forEach(m => {
    const audit = m.missing_audit || {};
    const hasMissingCover = audit.missing_cover || (audit.missing_vol_covers > 0);
    const hasMissingIsbn = audit.missing_isbn && (m.volumes || []).length > 0;
    const hasMissingChapters = audit.missing_vol_chapters > 0;

    if (hasMissingCover) missingCoversCount++;
    if (hasMissingIsbn) missingIsbnCount++;
    if (hasMissingChapters) missingChaptersCount++;

    const isAnyIncomplete = audit.has_missing;
    if (isAnyIncomplete) totalIncomplete++;

    let matchCat = false;
    if (missingDataCategory === 'all') matchCat = isAnyIncomplete;
    else if (missingDataCategory === 'covers') matchCat = hasMissingCover;
    else if (missingDataCategory === 'isbn') matchCat = hasMissingIsbn;
    else if (missingDataCategory === 'chapters') matchCat = hasMissingChapters;

    if (matchCat) {
      const targetText = `${m.title_romaji || ''} ${m.title_jp || ''} ${m.title_en || ''} ${(m.alt_titles || []).join(' ')} ${m.series || ''} ${(m.artists || []).join(' ')}`;
      if (matchesSearchQuery(targetText, includeTerms, excludeTerms)) {
        incompleteWorks.push(m);
      }
    }
  });

  const missingArtistsList = (typeof allArtists !== 'undefined' ? allArtists : []).filter(a => !a.has_page);
  const missingArtistsCount = missingArtistsList.length;

  const totalWorksEl = document.getElementById('missingStatIncompleteWorks');
  if (totalWorksEl) totalWorksEl.textContent = totalIncomplete;
  const covEl = document.getElementById('missingStatCovers');
  if (covEl) covEl.textContent = missingCoversCount;
  const isbnEl = document.getElementById('missingStatIsbn');
  if (isbnEl) isbnEl.textContent = missingIsbnCount;
  const chapsEl = document.getElementById('missingStatChapters');
  if (chapsEl) chapsEl.textContent = missingChaptersCount;
  const statArtistsEl = document.getElementById('missingStatArtists');
  if (statArtistsEl) statArtistsEl.textContent = missingArtistsCount;

  const fAll = document.getElementById('countFilterAll');
  if (fAll) fAll.textContent = totalIncomplete;
  const fArt = document.getElementById('countFilterArtists');
  if (fArt) fArt.textContent = missingArtistsCount;
  const fCov = document.getElementById('countFilterCovers');
  if (fCov) fCov.textContent = missingCoversCount;
  const fIsbn = document.getElementById('countFilterIsbn');
  if (fIsbn) fIsbn.textContent = missingIsbnCount;
  const fCh = document.getElementById('countFilterChapters');
  if (fCh) fCh.textContent = missingChaptersCount;

  const countShowing = document.getElementById('missingShowingCount');

  if (missingDataCategory === 'artists') {
    const filteredArtists = missingArtistsList.filter(a => {
      if (!search) return true;
      return (a.romaji || a.name || '').toLowerCase().includes(search) ||
             (a.slug || '').toLowerCase().includes(search) ||
             (a.kanji || '').toLowerCase().includes(search);
    });

    if (countShowing) countShowing.textContent = `Showing ${filteredArtists.length} missing artist pages`;

    if (filteredArtists.length === 0) {
      listContainer.innerHTML = `
        <div class="py-12 text-center text-cafe-muted">
          <span class="text-3xl">🎨</span>
          <h4 class="text-sm font-cinzel font-bold text-cafe-gold mt-2">No matching missing artist entries</h4>
          <p class="text-xs text-cafe-muted mt-1">All filtered artists have documented profile entries.</p>
        </div>
      `;
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredArtists.forEach(artist => {
      const itemCard = document.createElement('div');
      itemCard.className = 'bg-cafe-900/70 rounded-xl p-3 sm:p-4 border border-cafe-gold/20 hover:border-cafe-gold/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';

      itemCard.innerHTML = `
        <div class="space-y-1.5 min-w-0">
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-purple-950/80 text-purple-300 border border-purple-500/30">
              Illustrator / Mangaka
            </span>
            ${artist.kanji ? `<span class="text-[11px] text-cafe-gold/90 font-japanese font-medium">${escapeHtml(artist.kanji)}</span>` : ''}
          </div>
          <h4 class="font-cinzel font-bold text-sm text-white leading-snug truncate">
            ${escapeHtml(artist.romaji || artist.name || artist.slug)}
          </h4>
          <div class="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
            <span class="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/30 font-medium">
              Missing Profile Page (data/artists/${escapeHtml(artist.slug)}.json)
            </span>
            <span class="px-2 py-0.5 rounded bg-cafe-950 text-cafe-gold border border-cafe-gold/20 font-mono-isbn font-medium">
              ${artist.works_count || 0} works · ${artist.chapters_count || 0} chapters
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <button onclick="closeMissingDataModal(false); openArtistPage('${escapeHtml(artist.slug)}');" class="px-3 py-1.5 rounded-lg bg-cafe-950 border border-cafe-gold/30 hover:border-cafe-gold text-cafe-gold font-semibold text-xs transition-colors flex items-center gap-1">
            <span>Inspect Artist</span>
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7m0 0l-7 7"/></svg>
          </button>
        </div>
      `;
      fragment.appendChild(itemCard);
    });

    listContainer.appendChild(fragment);
    return;
  }

  if (countShowing) countShowing.textContent = `Showing ${incompleteWorks.length} incomplete works`;

  if (incompleteWorks.length === 0) {
    listContainer.innerHTML = `
      <div class="py-12 text-center text-cafe-muted">
        <span class="text-3xl">✨</span>
        <h4 class="text-sm font-cinzel font-bold text-cafe-gold mt-2">No matching incomplete entries</h4>
        <p class="text-xs text-cafe-muted mt-1">All entries in this category meet current archival criteria.</p>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  incompleteWorks.forEach(m => {
    const audit = m.missing_audit || {};
    const badges = [];
    if (audit.missing_cover) badges.push(`<span class="px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-500/30 font-medium">Missing Main Cover</span>`);
    if (audit.missing_vol_covers > 0) badges.push(`<span class="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30 font-medium">${audit.missing_vol_covers} Vol Covers Missing</span>`);
    if (audit.missing_isbn && (m.volumes || []).length > 0) badges.push(`<span class="px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-500/30 font-medium">Missing ISBN</span>`);
    if (audit.missing_vol_chapters > 0) badges.push(`<span class="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-500/30 font-medium">Chapters Not Cataloged (${audit.missing_vol_chapters} vols)</span>`);
    if (audit.missing_artists) badges.push(`<span class="px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-500/30 font-medium">No Artist Data</span>`);

    const itemCard = document.createElement('div');
    itemCard.className = 'bg-cafe-900/70 rounded-xl p-3 sm:p-4 border border-cafe-gold/20 hover:border-cafe-gold/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';

    itemCard.innerHTML = `
      <div class="space-y-1.5 min-w-0">
        <div class="flex items-center gap-2">
          <span class="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider bg-cafe-950 text-cafe-gold border border-cafe-gold/20">
            ${escapeHtml(m.series_code || m.series || 'TM')}
          </span>
          <span class="text-[11px] text-cafe-gold/90 font-japanese font-medium truncate">${escapeHtml(m.title_jp)}</span>
        </div>
        <h4 class="font-cinzel font-bold text-sm text-white leading-snug truncate">
          ${escapeHtml(m.title_romaji)}
        </h4>
        <div class="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
          ${badges.join('')}
        </div>
      </div>

      <button onclick="closeMissingDataModal(false); openMangaDetail('${m.id}');" class="px-3 py-1.5 rounded-lg bg-cafe-950 border border-cafe-gold/30 hover:border-cafe-gold text-cafe-gold font-semibold text-xs transition-colors shrink-0 flex items-center gap-1">
        <span>Inspect Entry</span>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7m0 0l-7 7"/></svg>
      </button>
    `;
    fragment.appendChild(itemCard);
  });

  listContainer.appendChild(fragment);
}
