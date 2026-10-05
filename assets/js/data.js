
let allManga = [];
let filteredManga = [];
let allArtists = [];
let filteredArtists = [];
let allPublishers = [];
let filteredPublishers = [];

const sessionMangaDocs = {};

async function mapConcurrent(items, limit, fn) {
  const results = [];
  const executing = [];
  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item)).then(res => {
      executing.splice(executing.indexOf(p), 1);
      return res;
    });
    results.push(p);
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  return Promise.all(results);
}

function calculateMangaAudit(doc, artists, vols) {
  let missingVolCovers = 0;
  let missingVolIsbns = 0;
  let missingVolChapters = 0;

  for (const v of vols) {
    const vcov = v.cover;
    if (!isNA(vcov) && (!vcov || vcov === '[no data]' || String(vcov).includes('simg'))) {
      missingVolCovers++;
    }
    const visbn = v.isbn;
    if (!isNA(visbn) && (!visbn || visbn === '[no data]')) {
      missingVolIsbns++;
    }
    const vchaps = v.chapters || [];
    if (!isNA(v.chapters) && (!vchaps || vchaps.length === 0)) {
      missingVolChapters++;
    }
  }

  const cov = (vols[0] && vols[0].cover) || doc.cover;
  const hasMissingCover = !isNA(cov) && (!cov || cov === '[no data]' || String(cov).includes('simg'));
  const hasMissingIsbn = vols.length > 0 && missingVolIsbns > 0;
  const hasNoIdentifier = hasMissingIsbn && vols.every(v => isNA(v.asin) || !v.asin || v.asin === '[no data]');
  const syn = (doc.synopsis || '').trim();
  const hasMissingSynopsis = !isNA(syn) && (!syn || syn === '[no data]');
  const isDocArtistsNA = (Array.isArray(doc.artists) && doc.artists.length > 0 && doc.artists.every(isNA)) || (Array.isArray(doc.custom_roles) && doc.custom_roles.length > 0 && doc.custom_roles.every(r => isNA(r.names)));
  const hasNoArtist = !isDocArtistsNA && (!artists || artists.length === 0 || artists.every(a => a === '[no data]' || (!a && !isNA(a))));

  const hasMissingAny = (
    hasMissingCover ||
    hasMissingIsbn ||
    missingVolCovers > 0 ||
    missingVolChapters > 0 ||
    hasMissingSynopsis ||
    hasNoArtist
  );

  let compScore = 0;
  if (!hasMissingCover) compScore += 20;
  if (!hasNoIdentifier) compScore += 20;
  if (!hasNoArtist) compScore += 20;
  if (!hasMissingSynopsis) compScore += 15;

  const vTotal = vols.length;
  if (vTotal > 0) {
    const volCovRatio = (vTotal - missingVolCovers) / vTotal;
    const volIsbnRatio = (vTotal - missingVolIsbns) / vTotal;
    const volChapsRatio = (vTotal - missingVolChapters) / vTotal;
    compScore += Math.round(volCovRatio * 10 + volIsbnRatio * 5 + volChapsRatio * 10);
  }

  const completionScore = Math.min(100, Math.max(0, compScore));

  return {
    has_missing: hasMissingAny,
    missing_cover: hasMissingCover,
    missing_isbn: hasMissingIsbn,
    has_no_identifier: hasNoIdentifier,
    missing_artists: hasNoArtist,
    missing_synopsis: hasMissingSynopsis,
    missing_vol_covers: missingVolCovers,
    missing_vol_isbns: missingVolIsbns,
    missing_vol_chapters: missingVolChapters,
    total_volumes: vTotal,
    completion_score: completionScore
  };
}

function normalizeMangaDoc(doc, filename) {
  const eid = doc.id || filename.replace(/\.json$/, '');
  const titleRomaji = doc.title_romaji || eid;
  const titleJp = doc.title_jp || '';
  const titleEn = doc.title_en || '';

  const rawArtists = doc.artists || [];
  const artists = [];
  for (const a of rawArtists) {
    if (typeof a !== 'string') continue;
    const aClean = a.trim();
    if (!aClean || ['various', 'unknown', 'insufficient', 'no data', 'type-moon', 'tm'].some(w => aClean.toLowerCase().includes(w))) {
      if (!artists.includes('[no data]')) artists.push('[no data]');
    } else {
      artists.push(aClean);
    }
  }
  if (artists.length === 0) artists.push('[no data]');

  const vols = doc.volumes || [];
  const series = doc.series || 'TYPE-MOON';
  const audit = calculateMangaAudit(doc, artists, vols);
  const cover = getPrimaryCover({ cover: doc.cover, volumes: vols });

  return {
    id: eid,
    json_path: `data/manga/${filename}`,
    title_romaji: titleRomaji,
    title_jp: titleJp,
    title_en: titleEn,
    alt_titles: doc.alt_titles || [titleRomaji, titleEn, titleJp],
    type: doc.type || 'Anthology',
    series: series,
    series_code: getSeriesCodeFromTargetWork(series),
    status: doc.status || null,
    release_year: doc.release_year || null,
    release_date: doc.release_date || null,
    artists: artists,
    publisher: doc.publisher || 'Unknown',
    magazine: isNA(doc.magazine) ? '' : (doc.magazine || ''),
    cover: cover,
    synopsis: doc.synopsis || '',
    notes: doc.notes || '',
    completion_score: audit.completion_score,
    missing_audit: audit,
    volumes: vols,
    chapters: doc.chapters || [],
    custom_roles: doc.custom_roles || [],
    sources: doc.sources || [],
    show_chapter_artists: doc.show_chapter_artists !== false
  };
}

function isEmptyStoredValue(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return !trimmed || trimmed.toLowerCase() === 'n/a' || trimmed === '[no data]';
  }
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function orderRecord(source, keys) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const out = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  const rest = Object.keys(source)
    .filter(key => !Object.prototype.hasOwnProperty.call(out, key))
    .sort();
  for (const key of rest) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

const MANGA_PAGE_KEY_ORDER = [
  'id',
  'title_romaji',
  'title_jp',
  'title_en',
  'alt_titles',
  'synopsis',
  'show_chapter_artists',
  'volumes',
  'notes',
  'sources',
  'cover',
  'custom_roles',
  'artists',
  'publisher',
  'magazine',
  'serialization_start',
  'serialization_end',
  'status',
  'type',
  'series',
  'release_year',
  'release_date'
];

const VOLUME_PAGE_KEY_ORDER = [
  'cover',
  'cover_full',
  'volume_number',
  'title',
  'title_jp',
  'is_uncollected',
  'release_date',
  'isbn',
  'asin',
  'chapters'
];

const CHAPTER_PAGE_KEY_ORDER = [
  'chapter_number',
  'title',
  'title_jp',
  'artist'
];

const ROLE_PAGE_KEY_ORDER = ['role', 'names'];

const ARTIST_PAGE_KEY_ORDER = [
  'slug',
  'romaji',
  'kanji',
  'bio',
  'notes',
  'sources',
  'image',
  'circle',
  'socials'
];

const SOCIAL_PAGE_KEY_ORDER = ['twitter', 'pixiv', 'website'];

function sanitizeMangaDocForStorage(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const out = { ...doc };
  [
    'remote_cover',
    'category',
    'target_work',
    'raw_volumes_num',
    'volumes_count',
    'volumes_display',
    'description',
    'comments',
    'universe_group',
    'demographic',
    'links',
    'serialized_in',
    'series_code',
    'original_story',
    'isbn',
    'asin',
    'cover_full',
    'author',
    'authors',
    'title',
    '_isLocallyModified',
    'completion_score',
    'missing_audit',
    'json_path'
  ].forEach(key => delete out[key]);

  if (Array.isArray(out.volumes)) {
    out.volumes = out.volumes.map(v => {
      if (!v || typeof v !== 'object') return v;
      const vol = { ...v };
      delete vol.remote_cover;
      delete vol.title_japanese;
      delete vol.show_chapter_artists;
      if (!vol.cover_full || vol.cover_full === vol.cover) delete vol.cover_full;
      if (Array.isArray(vol.chapters)) {
        vol.chapters = vol.chapters.map(ch => {
          if (!ch || typeof ch !== 'object') return ch;
          const chapter = { ...ch };
          delete chapter.title_japanese;
          return orderRecord(chapter, CHAPTER_PAGE_KEY_ORDER);
        });
      }
      return orderRecord(vol, VOLUME_PAGE_KEY_ORDER);
    });
    const first = out.volumes[0];
    if (first && first.cover) delete out.cover;
  }

  ['magazine', 'serialization_start', 'serialization_end'].forEach(key => {
    if (isEmptyStoredValue(out[key])) delete out[key];
  });

  if (Array.isArray(out.alt_titles)) {
    const seen = new Set();
    out.alt_titles = out.alt_titles
      .map(title => (title == null ? '' : String(title).trim()))
      .filter(title => {
        if (!title) return false;
        const key = title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    if (out.alt_titles.length === 0) delete out.alt_titles;
  }

  if (Array.isArray(out.custom_roles)) {
    out.custom_roles = out.custom_roles.map(role => orderRecord(role, ROLE_PAGE_KEY_ORDER));
  }

  return orderRecord(out, MANGA_PAGE_KEY_ORDER);
}

function sanitizeArtistDocForStorage(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const slug = doc.slug || slugify(doc.romaji || doc.name || doc.kanji || 'artist');
  const socials = doc.socials && typeof doc.socials === 'object' ? doc.socials : {};
  return orderRecord({
    slug,
    romaji: doc.romaji || doc.name || slug,
    kanji: doc.kanji || null,
    bio: doc.bio || doc.overview || null,
    notes: doc.notes || null,
    sources: Array.isArray(doc.sources) ? doc.sources : [],
    image: doc.image || null,
    circle: doc.circle || null,
    socials: orderRecord({
      twitter: socials.twitter || null,
      pixiv: socials.pixiv || null,
      website: socials.website || null
    }, SOCIAL_PAGE_KEY_ORDER)
  }, ARTIST_PAGE_KEY_ORDER);
}

const ARCHIVE_FILE_CACHE_KEY = 'tmArchiveFileCache';

function readArchiveFileCache() {
  try {
    const raw = localStorage.getItem(ARCHIVE_FILE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch (err) {
    return {};
  }
}

function writeArchiveFileCache(cache) {
  try {
    localStorage.setItem(ARCHIVE_FILE_CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Could not save archive file cache:', err);
  }
}

async function listJsonDirectory(url, label) {
  try {
    const res = await fetch(url, {
      cache: 'no-cache',
      headers: { 'Accept': 'text/html' }
    });
    if (!res.ok) return [];
    const text = await res.text();
    const matches = Array.from(text.matchAll(/href=["']([^"']+\.json)["']/gi))
      .map(m => m[1].split('/').pop())
      .filter(f => f && f.endsWith('.json'));
    return [...new Set(matches)];
  } catch (err) {
    console.error(`Failed to list ${label} directory:`, err);
    return [];
  }
}

async function fetchArchiveManifest() {
  try {
    const dbRes = await fetch('data/database.json', { cache: 'no-cache' });
    if (dbRes.ok) {
      const db = await dbRes.json();
      const mangaFiles = Array.isArray(db.manga_files) ? db.manga_files : [];
      const artistFiles = Array.isArray(db.artist_files) ? db.artist_files : [];
      if (mangaFiles.length > 0 || artistFiles.length > 0) {
        const fileRevs = db.file_revs && typeof db.file_revs === 'object' && !Array.isArray(db.file_revs)
          ? db.file_revs
          : null;
        return { mangaFiles, artistFiles, fileRevs };
      }
    }
  } catch (err) {}

  const [mangaFiles, artistFiles] = await Promise.all([
    listJsonDirectory('data/manga/', 'data/manga/'),
    listJsonDirectory('data/artists/', 'data/artists/')
  ]);
  return { mangaFiles, artistFiles, fileRevs: null };
}

async function loadArchiveDoc(kind, filename, fileRevs, cache) {
  const key = `${kind}/${filename}`;
  const rev = fileRevs && typeof fileRevs[key] === 'string' ? fileRevs[key] : null;
  const cached = cache[key];
  if (rev && cached && cached.rev === rev && cached.doc && typeof cached.doc === 'object') {
    return cached.doc;
  }

  const res = await fetch(`data/${kind}/${filename}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const doc = await res.json();
  if (rev && doc && typeof doc === 'object') {
    cache[key] = { rev, doc };
  }
  return doc;
}

function compileArtistsDatabase(artistDocs, mangaList) {
  const artistsMap = new Map();

  function isValidArtistName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim().toLowerCase();
    if (!clean || clean === '[no data]' || clean === 'n/a' || clean === 'unknown') return false;
    if (['various', 'various artists', 'type-moon', 'tm'].includes(clean)) return false;
    return true;
  }

  function getOrCreateArtist(rawName, explicitSlug = null) {
    const slug = explicitSlug || slugify(rawName);
    if (!slug) return null;
    if (!artistsMap.has(slug)) {
      const kanjiMatch = rawName.match(/\((.*?)\)/);
      const kanji = kanjiMatch ? kanjiMatch[1].trim() : '';
      const romaji = rawName.replace(/\(.*?\)/, '').trim() || slug;
      artistsMap.set(slug, {
        name: rawName,
        slug: slug,
        romaji: romaji,
        kanji: kanji,
        circle: null,
        image: null,
        bio: null,
        socials: {},
        has_page: false,
        worksMap: new Map()
      });
    }
    return artistsMap.get(slug);
  }

  for (const p of artistDocs) {
    if (!p || !p.slug) continue;
    const slug = p.slug;
    const romaji = p.romaji || p.name || slug;
    artistsMap.set(slug, {
      name: romaji,
      slug: slug,
      romaji: romaji,
      kanji: p.kanji || '',
      circle: p.circle || null,
      image: p.image || null,
      bio: p.bio || null,
      socials: p.socials || {},
      has_page: true,
      worksMap: new Map()
    });
  }

  for (const m of mangaList) {
    const mid = m.id;
    const titleRomaji = m.title_romaji || mid;
    const titleJp = m.title_jp || '';
    const titleEn = m.title_en || titleRomaji;
    const publisher = m.publisher || '';
    const cover = m.cover || '';
    const series = m.series || '';
    const year = m.release_year || null;

    for (const art of (m.artists || [])) {
      if (!isValidArtistName(art)) continue;
      const entry = getOrCreateArtist(art);
      if (entry && !entry.worksMap.has(mid)) {
        entry.worksMap.set(mid, {
          id: mid,
          title_romaji: titleRomaji,
          title_jp: titleJp,
          title_en: titleEn,
          publisher: publisher,
          cover: cover,
          series: series,
          year: year,
          role: 'Series Artist',
          volumes: []
        });
      }
    }

    for (const vol of (m.volumes || [])) {
      const vnum = (vol.volume_number !== undefined && vol.volume_number !== null) ? vol.volume_number : null;
      const vtitle = (vol.title || '').trim();
      const vcover = vol.cover || null;

      for (const ch of (vol.chapters || [])) {
        const chart = ch.artist;
        if (!isValidArtistName(chart)) continue;
        const entry = getOrCreateArtist(chart);
        if (!entry) continue;

        if (!entry.worksMap.has(mid)) {
          entry.worksMap.set(mid, {
            id: mid,
            title_romaji: titleRomaji,
            title_jp: titleJp,
            title_en: titleEn,
            publisher: publisher,
            cover: cover,
            series: series,
            year: year,
            role: 'Contributing Chapter Artist',
            volumes: []
          });
        }

        const w = entry.worksMap.get(mid);
        let volEntry = w.volumes.find(v => v.volume_number === vnum && v.title === vtitle);
        if (!volEntry) {
          volEntry = {
            volume_number: vnum,
            title: vtitle,
            cover: vcover,
            chapters: []
          };
          w.volumes.push(volEntry);
        }
        volEntry.chapters.push({
          chapter_number: ch.chapter_number,
          title: ch.title || '',
          title_jp: ch.title_jp || ''
        });
      }
    }

    for (const ch of (m.chapters || [])) {
      const chart = ch.artist;
      if (!isValidArtistName(chart)) continue;
      const entry = getOrCreateArtist(chart);
      if (!entry) continue;

      if (!entry.worksMap.has(mid)) {
        entry.worksMap.set(mid, {
          id: mid,
          title_romaji: titleRomaji,
          title_jp: titleJp,
          title_en: titleEn,
          publisher: publisher,
          cover: cover,
          series: series,
          year: year,
          role: 'Series Artist',
          volumes: []
        });
      }

      const w = entry.worksMap.get(mid);
      let volEntry = w.volumes.find(v => v.is_uncollected);
      if (!volEntry) {
        volEntry = {
          volume_number: 'N/A',
          title: 'Serialized Chapters (No Volume)',
          is_uncollected: true,
          cover: null,
          chapters: []
        };
        w.volumes.push(volEntry);
      }
      volEntry.chapters.push({
        chapter_number: ch.chapter_number,
        title: ch.title || '',
          title_jp: ch.title_jp || ''
      });
    }
  }

  const artistsList = [];
  for (const [slug, entry] of artistsMap.entries()) {
    const worksList = Array.from(entry.worksMap.values());
    worksList.sort((a, b) => (b.year || 0) - (a.year || 0) || a.title_romaji.localeCompare(b.title_romaji));
    const totalChaps = worksList.reduce((acc, w) => acc + w.volumes.reduce((vacc, v) => vacc + v.chapters.length, 0), 0);

    artistsList.push({
      name: entry.name,
      slug: entry.slug,
      romaji: entry.romaji,
      kanji: entry.kanji,
      has_page: entry.has_page,
      image: entry.image,
      circle: entry.circle,
      bio: entry.bio,
      socials: entry.socials,
      works_count: worksList.length,
      chapters_count: totalChaps,
      works: worksList
    });
  }

  artistsList.sort((a, b) => {
    if (b.has_page !== a.has_page) return (b.has_page ? 1 : 0) - (a.has_page ? 1 : 0);
    if (b.works_count !== a.works_count) return b.works_count - a.works_count;
    if (b.chapters_count !== a.chapters_count) return b.chapters_count - a.chapters_count;
    return a.romaji.localeCompare(b.romaji);
  });

  return artistsList;
}

function compilePublishersList() {
  const pubMap = new Map();

  allManga.forEach(m => {
    const pubName = (m.publisher || '').trim();
    if (!pubName || pubName === 'Unknown' || pubName === 'N/A' || pubName === '[no data]') return;

    if (!pubMap.has(pubName)) {
      pubMap.set(pubName, {
        name: pubName,
        works: [],
        seriesSet: new Set(),
        years: [],
        totalVolumes: 0
      });
    }

    const entry = pubMap.get(pubName);
    entry.works.push(m);
    if (m.series) entry.seriesSet.add(m.series);
    if (m.release_year) entry.years.push(m.release_year);

    entry.totalVolumes += (m.volumes || []).length;
  });

  const list = [];
  pubMap.forEach((val, key) => {
    const yearsStr = val.years.length > 0
      ? (Math.min(...val.years) === Math.max(...val.years) ? `${Math.min(...val.years)}` : `${Math.min(...val.years)} – ${Math.max(...val.years)}`)
      : '—';

    list.push({
      name: key,
      works_count: val.works.length,
      volumes_count: val.totalVolumes,
      years_str: yearsStr,
      min_year: val.years.length > 0 ? Math.min(...val.years) : 9999,
      max_year: val.years.length > 0 ? Math.max(...val.years) : 0,
      series: Array.from(val.seriesSet),
      works: val.works
    });
  });

  list.sort((a, b) => b.works_count - a.works_count);
  return list;
}

function updateStats() {
  let incompleteCount = 0;
  allManga.forEach(m => {
    if (m.missing_audit?.has_missing) {
      incompleteCount++;
    }
  });

  const badgeEl = document.getElementById('missingDataBadgeCount');
  if (badgeEl) badgeEl.textContent = incompleteCount;

  const footerBadge = document.getElementById('footerIncompleteBadge');
  if (footerBadge) {
    if (incompleteCount > 0) {
      footerBadge.textContent = `${incompleteCount} Pending`;
      footerBadge.className = 'px-1.5 py-0.5 rounded text-[10px] font-mono-isbn bg-amber-950/80 text-amber-300 border border-amber-500/30';
    } else {
      footerBadge.textContent = 'Complete';
      footerBadge.className = 'px-1.5 py-0.5 rounded text-[10px] font-mono-isbn bg-emerald-950/80 text-emerald-300 border border-emerald-500/30';
    }
  }

  const statTotal = document.getElementById('statTotalWorks');
  if (statTotal) statTotal.textContent = allManga.length;

  const statArtists = document.getElementById('statTotalArtists');
  if (statArtists) statArtists.textContent = allArtists.length;
}

async function loadDatabase() {
  const resultsCount = document.getElementById('resultsCount');
  if (resultsCount) resultsCount.textContent = 'Loading archive entries...';

  try {
    const { mangaFiles, artistFiles, fileRevs } = await fetchArchiveManifest();
    const fileCache = fileRevs ? readArchiveFileCache() : {};

    const loadedManga = await mapConcurrent(mangaFiles, 8, async filename => {
      try {
        const doc = await loadArchiveDoc('manga', filename, fileRevs, fileCache);
        if (!doc) return null;
        const eid = doc.id || filename.replace(/\.json$/, '');
        sessionMangaDocs[eid] = doc;
        return normalizeMangaDoc(doc, filename);
      } catch (err) {
        console.warn(`Failed loading data/manga/${filename}:`, err);
        return null;
      }
    });
    allManga = loadedManga.filter(Boolean);

    const loadedArtists = await mapConcurrent(artistFiles, 8, async filename => {
      try {
        return await loadArchiveDoc('artists', filename, fileRevs, fileCache);
      } catch (err) {
        console.warn(`Failed loading data/artists/${filename}:`, err);
        return null;
      }
    });
    allArtists = compileArtistsDatabase(loadedArtists.filter(Boolean), allManga);

    if (fileRevs) {
      const liveKeys = new Set([
        ...mangaFiles.map(filename => `manga/${filename}`),
        ...artistFiles.map(filename => `artists/${filename}`)
      ]);
      Object.keys(fileCache).forEach(key => {
        if (!liveKeys.has(key)) delete fileCache[key];
      });
      writeArchiveFileCache(fileCache);
    }
  } catch (err) {
    console.error('Error during loadDatabase:', err);
  }

  allPublishers = compilePublishersList();
  filteredArtists = [...allArtists];
  filteredPublishers = [...allPublishers];

  updateStats();
  if (typeof applyFilters === 'function') {
    applyFilters();
  }
}
