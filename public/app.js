// UI Elements
const searchInput = document.getElementById('searchInput');
const fetchBtn = document.getElementById('fetchBtn');
const gamesGrid = document.getElementById('gamesGrid');
const downloadedGrid = document.getElementById('downloadedGrid');
const platformFilter = document.getElementById('platformFilter');
const regionFilter = document.getElementById('regionFilter');
const revisionFilter = document.getElementById('revisionFilter');
const downloadedPlatformFilter = document.getElementById('downloadedPlatformFilter');
const downloadedRegionFilter = document.getElementById('downloadedRegionFilter');
const downloadedRevisionFilter = document.getElementById('downloadedRevisionFilter');
const sortBy = document.getElementById('sortBy');
const totalGamesEl = document.getElementById('totalGames');
const downloadedCountEl = document.getElementById('downloadedCount');
const downloadModal = document.getElementById('downloadModal');
const downloadName = document.getElementById('downloadName');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const cancelBtn = document.getElementById('cancelBtn');
const closeModal = document.querySelector('.close');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const metadataModal = document.getElementById('metadataModal');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const downloadHighestRevisionsBtn = document.getElementById('downloadHighestRevisionsBtn');
const selectModeBtn = document.getElementById('selectModeBtn');
const downloadSelectedBtn = document.getElementById('downloadSelectedBtn');
const cancelSelectBtn = document.getElementById('cancelSelectBtn');
const selectedCountEl = document.getElementById('selectedCount');
const selectAllFilteredBtn = document.getElementById('selectAllFilteredBtn');
const cancelBatchBtn = document.getElementById('cancelBatchBtn');
const browseResultsSummary = document.getElementById('browseResultsSummary');
const browsePageSizeSelect = document.getElementById('browsePageSize');
const browsePrevPageBtn = document.getElementById('browsePrevPageBtn');
const browseNextPageBtn = document.getElementById('browseNextPageBtn');
const browsePageIndicator = document.getElementById('browsePageIndicator');
const searchHistoryChips = document.getElementById('searchHistoryChips');
const clearSearchHistoryBtn = document.getElementById('clearSearchHistoryBtn');
const searchAssistText = document.getElementById('searchAssistText');
const queueSummaryText = document.getElementById('queueSummaryText');
const queueActiveBadge = document.getElementById('queueActiveBadge');
const queueList = document.getElementById('queueList');
const recentDownloadsList = document.getElementById('recentDownloadsList');
const collectionNameInput = document.getElementById('collectionNameInput');
const collectionDescriptionInput = document.getElementById('collectionDescriptionInput');
const createCollectionBtn = document.getElementById('createCollectionBtn');
const collectionsList = document.getElementById('collectionsList');
const activeCollectionSummary = document.getElementById('activeCollectionSummary');
const collectionGamesSection = document.getElementById('collectionGamesSection');
const collectionGamesTitle = document.getElementById('collectionGamesTitle');
const collectionGamesSubtitle = document.getElementById('collectionGamesSubtitle');
const collectionGamesGrid = document.getElementById('collectionGamesGrid');
const serviceHealthList = document.getElementById('serviceHealthList');
const settingsServiceHealthList = document.getElementById('settingsServiceHealthList');
const metadataSyncText = document.getElementById('metadataSyncText');

// State
let allGames = [];
let downloadedGames = [];
let queueItems = [];
let recentDownloads = [];
let collections = [];
let activeCollectionId = null;
let activeCollectionGames = [];
let activeCollectionGameIds = new Set();
let serviceHealthSnapshot = null;
let metadataSyncSnapshot = null;
let browseSearchHistory = [];
let currentDownloading = null;
let currentDownloadController = null;
let currentMetadataGame = null;
let downloadAllQueue = [];
let downloadAllActive = false;
let downloadAllTotal = 0;
let downloadAllCompleted = 0;
let downloadAllCurrentGameId = null;
let cancelBatchRequested = false;
let selectMode = false;
let selectedGameIds = new Set();
let activeLetter = '';
let activePlatform = '';
let activeRegion = '';
let activeRevision = '';
let downloadedActiveLetter = '';
let downloadedActivePlatform = '';
let downloadedActiveRegion = '';
let downloadedActiveRevision = '';
let browseSearchQuery = '';
let browseSearchDebounce = null;
let browseCurrentPage = 1;
let browsePageSize = 120;
let browseDataVersion = 0;
let downloadedDataVersion = 0;
let browsePlatformOptions = [];
let downloadedPlatformOptions = [];
let browseViewCache = { key: '', model: null };
let downloadedViewCache = { key: '', model: null };
let browseSearchScoreCache = { key: '', scores: new Map() };
const BROWSE_SEARCH_DEBOUNCE_MS = 150;
const DEFAULT_BROWSE_PAGE_SIZE = 120;
const SEARCH_HISTORY_STORAGE_KEY = 'myrientGet.searchHistory';
const MAX_SEARCH_HISTORY = 6;
const PLATFORM_ORDER = ['Nintendo Game Boy Advance', 'Nintendo 64', 'Nintendo Entertainment System', 'Super Nintendo Entertainment System', 'Sony PlayStation', 'Sony PlayStation 2', 'Sony PlayStation Portable'];
const REGION_ORDER = ['USA', 'Europe', 'Japan', 'World', 'Australia', 'Korea', 'Asia', 'Brazil', 'Canada', 'China', 'Taiwan', 'Hong Kong', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Sweden', 'Russia', 'Unknown'];
const REGION_ALIASES = {
    'USA': 'USA',
    'Europe': 'Europe',
    'Japan': 'Japan',
    'World': 'World',
    'Australia': 'Australia',
    'Korea': 'Korea',
    'Asia': 'Asia',
    'Brazil': 'Brazil',
    'Canada': 'Canada',
    'China': 'China',
    'Taiwan': 'Taiwan',
    'Hong Kong': 'Hong Kong',
    'France': 'France',
    'Germany': 'Germany',
    'Italy': 'Italy',
    'Spain': 'Spain',
    'Netherlands': 'Netherlands',
    'Sweden': 'Sweden',
    'Russia': 'Russia',
    'USA, Europe': 'USA',
    'Europe, USA': 'Europe'
};

function escapeForSingleQuotedJs(value) {
    return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function escapeForHtmlAttribute(value) {
    return String(value).replace(/"/g, '&quot;');
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeImageUrl(value) {
    const normalized = String(value || '').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.startsWith('/cached-images/')) {
        return normalized;
    }

    try {
        const parsed = new URL(normalized, window.location.origin);
        if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.origin !== 'null') {
            return parsed.href;
        }
    } catch (_error) {
        return '';
    }

    return '';
}

function sanitizeSourceBadgeClass(value) {
    return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'unknown';
}

function formatRelativeDate(value) {
    const timestamp = Date.parse(value || '');
    if (!timestamp) {
        return 'Just now';
    }

    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));
    if (diffMinutes < 1) {
        return 'Just now';
    }
    if (diffMinutes < 60) {
        return `${diffMinutes} min ago`;
    }

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} hr ago`;
    }

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
        return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }

    return new Date(timestamp).toLocaleDateString();
}

function readSearchHistory() {
    try {
        const stored = localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : [];
    } catch (_error) {
        return [];
    }
}

function writeSearchHistory() {
    localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(browseSearchHistory));
}

function rememberSearchQuery(rawValue) {
    const normalized = String(rawValue || '').trim();
    if (!normalized) {
        return;
    }

    browseSearchHistory = [
        normalized,
        ...browseSearchHistory.filter(value => value.toLowerCase() !== normalized.toLowerCase())
    ].slice(0, MAX_SEARCH_HISTORY);
    writeSearchHistory();
    renderSearchHistory();
}

function clearSearchHistory() {
    browseSearchHistory = [];
    writeSearchHistory();
    renderSearchHistory();
}

function renderSearchHistory() {
    if (!searchHistoryChips) {
        return;
    }

    if (browseSearchHistory.length === 0) {
        searchHistoryChips.innerHTML = '<span class="panel-subtitle">No recent searches yet</span>';
        if (clearSearchHistoryBtn) {
            clearSearchHistoryBtn.disabled = true;
        }
        return;
    }

    searchHistoryChips.innerHTML = browseSearchHistory
        .map(query => `<button type="button" class="search-history-chip" data-query="${escapeForHtmlAttribute(query)}">${escapeHtml(query)}</button>`)
        .join('');

    if (clearSearchHistoryBtn) {
        clearSearchHistoryBtn.disabled = false;
    }
}

function tokenizeSearchTerm(searchTerm) {
    return searchTerm
        .toLowerCase()
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean);
}

function getFuzzySequenceScore(haystack, needle) {
    if (!needle) {
        return 0;
    }

    let haystackIndex = 0;
    let lastMatchIndex = -2;
    let score = 0;

    for (const char of needle) {
        const matchIndex = haystack.indexOf(char, haystackIndex);
        if (matchIndex === -1) {
            return 0;
        }
        score += lastMatchIndex === matchIndex - 1 ? 4 : 1;
        lastMatchIndex = matchIndex;
        haystackIndex = matchIndex + 1;
    }

    return score;
}

function computeSearchScore(game, searchTerm) {
    if (!searchTerm) {
        return 1;
    }

    const normalizedQuery = searchTerm.toLowerCase().trim();
    const tokens = tokenizeSearchTerm(normalizedQuery);
    if (tokens.length === 0) {
        return 1;
    }

    const name = String(game.name || '').toLowerCase();
    const filename = String(game.filename || '').toLowerCase();
    const platform = String(getPlatformLabel(game) || '').toLowerCase();
    const searchText = game._searchText || `${name} ${filename} ${platform}`;
    let score = 0;

    if (name.startsWith(normalizedQuery)) score += 160;
    else if (name.includes(normalizedQuery)) score += 110;

    if (filename.startsWith(normalizedQuery)) score += 110;
    else if (filename.includes(normalizedQuery)) score += 80;

    if (platform.includes(normalizedQuery)) score += 50;

    for (const token of tokens) {
        if (name.includes(token)) score += 45;
        else if (filename.includes(token)) score += 30;
        else if (platform.includes(token)) score += 20;
        else if (searchText.includes(token)) score += 10;
        else {
            const fuzzyScore = Math.max(
                getFuzzySequenceScore(name, token),
                getFuzzySequenceScore(filename, token),
                getFuzzySequenceScore(platform, token)
            );
            if (!fuzzyScore) {
                return 0;
            }
            score += fuzzyScore;
        }
    }

    return score;
}

function getPlatformLabel(game) {
    return game._platformLabel || game.platform || 'Nintendo Game Boy Advance';
}

function parseRegionsFromFilename(filename) {
    const matches = new Set();
    const segments = filename.match(/\(([^)]+)\)/g) || [];
    for (const segment of segments) {
        const content = segment.slice(1, -1);
        for (const token of content.split(',')) {
            const normalized = token.trim();
            const region = REGION_ALIASES[normalized];
            if (region) {
                matches.add(region);
            }
        }
    }

    if (matches.size === 0) {
        matches.add('Unknown');
    }

    return sortByPreferredOrder(Array.from(matches), REGION_ORDER);
}

function parseRevisionFromFilename(filename) {
    const match = filename.match(/\((Rev(?:ision)?\.?\s*[^)]+)\)/i);
    if (!match) {
        return 'Original';
    }

    return match[1]
        .replace(/^Revision\.?\s*/i, 'Rev ')
        .replace(/^Rev\.?\s*/i, 'Rev ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getRevisionRankFromLabel(revision) {
    if (revision === 'Original') {
        return 0;
    }

    const numericMatch = revision.match(/^Rev\s+(\d+)/i);
    if (numericMatch) {
        return Number(numericMatch[1]);
    }

    return 0;
}

function getRevisionGroupKeyFromGame(game) {
    return `${getPlatformLabel(game)}::${game.filename
        .replace(/\s*\((Rev(?:ision)?\.?\s*[^)]+)\)/ig, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()}`;
}

function getSearchTextForGame(game) {
    return `${game.name} ${game.filename} ${getPlatformLabel(game)}`.toLowerCase();
}

function getLetterBucket(name) {
    const firstCharacter = String(name || '').trim().charAt(0).toUpperCase();
    return /^[A-Z]$/.test(firstCharacter) ? firstCharacter : '#';
}

function decorateGame(game) {
    const platformLabel = game.platform || 'Nintendo Game Boy Advance';
    const regions = parseRegionsFromFilename(game.filename);
    const revision = parseRevisionFromFilename(game.filename);
    const sizeBytes = parseSize(game.size);
    const dateValue = Date.parse(game.date);
    const safeDateValue = Number.isNaN(dateValue) ? 0 : dateValue;

    return {
        ...game,
        _platformLabel: platformLabel,
        _regions: regions,
        _revision: revision,
        _revisionRank: getRevisionRankFromLabel(revision),
        _revisionGroupKey: getRevisionGroupKeyFromGame({ ...game, platform: platformLabel, _platformLabel: platformLabel }),
        _sizeBytes: sizeBytes,
        _displaySize: formatSizeFromBytes(sizeBytes, game.size),
        _dateValue: safeDateValue,
        _displayDate: safeDateValue ? new Date(safeDateValue).toLocaleDateString() : game.date,
        _nameUpper: game.name.toUpperCase(),
        _searchText: getSearchTextForGame({ ...game, platform: platformLabel, _platformLabel: platformLabel }),
        _letterBucket: getLetterBucket(game.name)
    };
}

function invalidateBrowseViewCache() {
    browseViewCache = { key: '', model: null };
    browseSearchScoreCache = { key: '', scores: new Map() };
}

function invalidateDownloadedViewCache() {
    downloadedViewCache = { key: '', model: null };
}

function sortByPreferredOrder(values, preferredOrder) {
    return values.sort((a, b) => {
        const aIndex = preferredOrder.indexOf(a);
        const bIndex = preferredOrder.indexOf(b);
        const normalizedA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
        const normalizedB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
        if (normalizedA !== normalizedB) {
            return normalizedA - normalizedB;
        }
        return a.localeCompare(b);
    });
}

function getAvailablePlatforms(games) {
    const platforms = Array.from(new Set(games.map(getPlatformLabel)));
    return sortByPreferredOrder(platforms, PLATFORM_ORDER);
}

function getRegionsForGame(game) {
    return game._regions || parseRegionsFromFilename(game.filename);
}

function getRevisionForGame(game) {
    return game._revision || parseRevisionFromFilename(game.filename);
}

function getRevisionRank(game) {
    return typeof game._revisionRank === 'number'
        ? game._revisionRank
        : getRevisionRankFromLabel(getRevisionForGame(game));
}

function getRevisionGroupKey(game) {
    return game._revisionGroupKey || getRevisionGroupKeyFromGame(game);
}

function getHighestRevisionGames(games) {
    const bestByGroup = new Map();

    for (const game of games) {
        const groupKey = getRevisionGroupKey(game);
        const existing = bestByGroup.get(groupKey);
        if (!existing) {
            bestByGroup.set(groupKey, game);
            continue;
        }

        const rankDiff = getRevisionRank(game) - getRevisionRank(existing);
        if (rankDiff > 0) {
            bestByGroup.set(groupKey, game);
            continue;
        }

        if (rankDiff === 0) {
            const dateDiff = (game._dateValue || 0) - (existing._dateValue || 0);
            if (dateDiff > 0 || (dateDiff === 0 && game.filename.localeCompare(existing.filename) < 0)) {
                bestByGroup.set(groupKey, game);
            }
        }
    }

    return Array.from(bestByGroup.values());
}

function matchesLetterFilter(game, letter = activeLetter) {
    if (letter === '#') {
        return (game._letterBucket || getLetterBucket(game.name)) === '#';
    }
    if (letter) {
        return (game._letterBucket || getLetterBucket(game.name)) === letter;
    }
    return true;
}

function getBrowseSearchScores() {
    if (!browseSearchQuery) {
        return new Map();
    }

    const cacheKey = `${browseDataVersion}::${browseSearchQuery}`;
    if (browseSearchScoreCache.key === cacheKey) {
        return browseSearchScoreCache.scores;
    }

    const scores = new Map();
    allGames.forEach(game => {
        const score = computeSearchScore(game, browseSearchQuery);
        if (score > 0) {
            scores.set(game.id, score);
        }
    });

    browseSearchScoreCache = { key: cacheKey, scores };
    return scores;
}

function matchesSearchTerm(game, searchTerm) {
    if (!searchTerm) {
        return true;
    }

    if (searchTerm === browseSearchQuery) {
        return (getBrowseSearchScores().get(game.id) || 0) > 0;
    }

    return computeSearchScore(game, searchTerm) > 0;
}

function getFilteredGamesForState(games, state, filters = {}) {
    const platform = Object.prototype.hasOwnProperty.call(filters, 'platform') ? filters.platform : state.platform;
    const region = Object.prototype.hasOwnProperty.call(filters, 'region') ? filters.region : state.region;
    const revision = Object.prototype.hasOwnProperty.call(filters, 'revision') ? filters.revision : state.revision;
    const letter = Object.prototype.hasOwnProperty.call(filters, 'letter') ? filters.letter : state.letter;
    const searchTerm = Object.prototype.hasOwnProperty.call(filters, 'searchTerm') ? filters.searchTerm : (state.searchTerm || '');

    return games.filter(game => {
        if (!matchesSearchTerm(game, searchTerm)) {
            return false;
        }
        if (platform && getPlatformLabel(game) !== platform) {
            return false;
        }
        if (region && !getRegionsForGame(game).includes(region)) {
            return false;
        }
        if (revision && getRevisionForGame(game) !== revision) {
            return false;
        }
        return matchesLetterFilter(game, letter);
    });
}

function getBrowseFilterState() {
    return {
        platform: activePlatform,
        region: activeRegion,
        revision: activeRevision,
        letter: activeLetter,
        searchTerm: browseSearchQuery
    };
}

function getDownloadedFilterState() {
    return {
        platform: downloadedActivePlatform,
        region: downloadedActiveRegion,
        revision: downloadedActiveRevision,
        letter: downloadedActiveLetter
    };
}

function getFilteredGames(filters = {}) {
    return getFilteredGamesForState(allGames, getBrowseFilterState(), filters);
}

function getFilteredDownloadedGames(filters = {}) {
    return getFilteredGamesForState(downloadedGames, getDownloadedFilterState(), filters);
}

function getAvailableRegions(games) {
    const regions = new Set();
    games.forEach(game => {
        getRegionsForGame(game).forEach(region => regions.add(region));
    });
    return sortByPreferredOrder(Array.from(regions), REGION_ORDER);
}

function sortRevisions(revisions) {
    return revisions.sort((a, b) => {
        if (a === 'Original') return -1;
        if (b === 'Original') return 1;

        const aMatch = a.match(/^Rev\s+(\d+)/i);
        const bMatch = b.match(/^Rev\s+(\d+)/i);
        if (aMatch && bMatch) {
            const diff = Number(aMatch[1]) - Number(bMatch[1]);
            if (diff !== 0) {
                return diff;
            }
        }

        return a.localeCompare(b);
    });
}

function getAvailableRevisions(games) {
    const revisions = new Set();
    games.forEach(game => revisions.add(getRevisionForGame(game)));
    return sortRevisions(Array.from(revisions));
}

function formatFilterButtonLabel(label, count) {
    return `${label} (${count})`;
}

function matchesFacetState(game, state, excludedFacet = '') {
    if (!matchesSearchTerm(game, state.searchTerm || '')) {
        return false;
    }
    if (!matchesLetterFilter(game, state.letter || '')) {
        return false;
    }
    if (excludedFacet !== 'platform' && state.platform && getPlatformLabel(game) !== state.platform) {
        return false;
    }
    if (excludedFacet !== 'region' && state.region && !getRegionsForGame(game).includes(state.region)) {
        return false;
    }
    if (excludedFacet !== 'revision' && state.revision && getRevisionForGame(game) !== state.revision) {
        return false;
    }
    return true;
}

function matchesCascadeState(game, state, includedFilters = []) {
    if (!matchesSearchTerm(game, state.searchTerm || '')) {
        return false;
    }
    if (!matchesLetterFilter(game, state.letter || '')) {
        return false;
    }
    if (includedFilters.includes('platform') && state.platform && getPlatformLabel(game) !== state.platform) {
        return false;
    }
    if (includedFilters.includes('region') && state.region && !getRegionsForGame(game).includes(state.region)) {
        return false;
    }
    if (includedFilters.includes('revision') && state.revision && getRevisionForGame(game) !== state.revision) {
        return false;
    }
    return true;
}

function getCascadeCounts(games, state, facetKey, includedFilters = []) {
    const counts = new Map();
    let allCount = 0;

    for (const game of games) {
        if (!matchesCascadeState(game, state, includedFilters)) {
            continue;
        }

        allCount++;

        if (facetKey === 'platform') {
            const platform = getPlatformLabel(game);
            counts.set(platform, (counts.get(platform) || 0) + 1);
            continue;
        }

        if (facetKey === 'region') {
            for (const region of getRegionsForGame(game)) {
                counts.set(region, (counts.get(region) || 0) + 1);
            }
            continue;
        }

        const revision = getRevisionForGame(game);
        counts.set(revision, (counts.get(revision) || 0) + 1);
    }

    return { counts, allCount };
}

function buildViewModel(games, state, platformOptions) {
    const searchScores = state.searchTerm === browseSearchQuery ? getBrowseSearchScores() : new Map();
    return {
        filteredGames: games.filter(game => matchesFacetState(game, state)),
        platformOptions,
        searchScores
    };
}

function getBrowseViewModel() {
    const state = getBrowseFilterState();
    const cacheKey = [
        browseDataVersion,
        state.platform,
        state.region,
        state.revision,
        state.letter,
        state.searchTerm
    ].join('::');

    if (browseViewCache.key === cacheKey && browseViewCache.model) {
        return browseViewCache.model;
    }

    const model = buildViewModel(allGames, state, browsePlatformOptions);
    browseViewCache = { key: cacheKey, model };
    return model;
}

function getDownloadedViewModel() {
    const state = getDownloadedFilterState();
    const cacheKey = [
        downloadedDataVersion,
        state.platform,
        state.region,
        state.revision,
        state.letter
    ].join('::');

    if (downloadedViewCache.key === cacheKey && downloadedViewCache.model) {
        return downloadedViewCache.model;
    }

    const model = buildViewModel(downloadedGames, state, downloadedPlatformOptions);
    downloadedViewCache = { key: cacheKey, model };
    return model;
}

function getFacetScope(kind = 'browse') {
    return kind === 'downloaded'
        ? {
            games: downloadedGames,
            state: getDownloadedFilterState(),
            platformOptions: downloadedPlatformOptions,
            containers: {
                platform: downloadedPlatformFilter,
                region: downloadedRegionFilter,
                revision: downloadedRevisionFilter
            }
        }
        : {
            games: allGames,
            state: getBrowseFilterState(),
            platformOptions: browsePlatformOptions,
            containers: {
                platform: platformFilter,
                region: regionFilter,
                revision: revisionFilter
            }
        };
}

function getFacetValue(kind, facetKey) {
    if (kind === 'downloaded') {
        if (facetKey === 'platform') return downloadedActivePlatform;
        if (facetKey === 'region') return downloadedActiveRegion;
        return downloadedActiveRevision;
    }

    if (facetKey === 'platform') return activePlatform;
    if (facetKey === 'region') return activeRegion;
    return activeRevision;
}

function setFacetValue(kind, facetKey, value) {
    if (kind === 'downloaded') {
        if (facetKey === 'platform') downloadedActivePlatform = value;
        else if (facetKey === 'region') downloadedActiveRegion = value;
        else downloadedActiveRevision = value;
        return;
    }

    if (facetKey === 'platform') activePlatform = value;
    else if (facetKey === 'region') activeRegion = value;
    else activeRevision = value;
}

function getFacetIncludedFilters(facetKey) {
    if (facetKey === 'region') {
        return ['platform'];
    }
    if (facetKey === 'revision') {
        return ['platform', 'region'];
    }
    return [];
}

function getFacetAllLabel(facetKey) {
    if (facetKey === 'region') {
        return 'All Regions';
    }
    if (facetKey === 'revision') {
        return 'All Revisions';
    }
    return 'All Platforms';
}

function getFacetOptions(facetKey, scope, counts) {
    if (facetKey === 'platform') {
        return scope.platformOptions;
    }
    if (facetKey === 'region') {
        return sortByPreferredOrder(Array.from(counts.keys()), REGION_ORDER);
    }
    return sortRevisions(Array.from(counts.keys()));
}

function renderCascadeFacet(kind, facetKey) {
    const scope = getFacetScope(kind);
    const includedFilters = getFacetIncludedFilters(facetKey);
    let { counts, allCount } = getCascadeCounts(scope.games, scope.state, facetKey, includedFilters);
    let options = getFacetOptions(facetKey, scope, counts);
    const activeValue = getFacetValue(kind, facetKey);

    if (activeValue && !options.includes(activeValue)) {
        setFacetValue(kind, facetKey, '');
        const refreshedScope = getFacetScope(kind);
        ({ counts, allCount } = getCascadeCounts(refreshedScope.games, refreshedScope.state, facetKey, includedFilters));
        options = getFacetOptions(facetKey, refreshedScope, counts);
    }

    renderFacetButtons(
        scope.containers[facetKey],
        getFacetValue(kind, facetKey),
        facetKey,
        getFacetAllLabel(facetKey),
        allCount,
        options,
        (option) => counts.get(option) || 0
    );
}

function refreshBrowseFilters() {
    ['platform', 'region', 'revision'].forEach(facetKey => renderCascadeFacet('browse', facetKey));
}

function refreshDownloadedFilters() {
    ['platform', 'region', 'revision'].forEach(facetKey => renderCascadeFacet('downloaded', facetKey));
}

function renderFacetButtons(container, activeValue, datasetKey, allLabel, allCount, options, countGetter) {
    container.innerHTML = [
        `<button class="platform-filter-btn${activeValue === '' ? ' active' : ''}" data-${datasetKey}="">${formatFilterButtonLabel(allLabel, allCount)}</button>`,
        ...options.map(option =>
            `<button class="platform-filter-btn${activeValue === option ? ' active' : ''}" data-${datasetKey}="${escapeForHtmlAttribute(option)}">${formatFilterButtonLabel(option, countGetter(option))}</button>`
        )
    ].join('');
}

function renderPlatformFilter() {
    renderCascadeFacet('browse', 'platform');
}

function renderRegionFilter() {
    renderCascadeFacet('browse', 'region');
}

function renderRevisionFilter() {
    renderCascadeFacet('browse', 'revision');
}

function renderDownloadedPlatformFilter() {
    renderCascadeFacet('downloaded', 'platform');
}

function renderDownloadedRegionFilter() {
    renderCascadeFacet('downloaded', 'region');
}

function renderDownloadedRevisionFilter() {
    renderCascadeFacet('downloaded', 'revision');
}

function setBrowsePage(pageNumber) {
    browseCurrentPage = Math.max(1, pageNumber);
}

function updateBrowseView(options = {}) {
    if (options.resetPage) {
        setBrowsePage(1);
    }
    refreshBrowseFilters();
    sortAndDisplayGames();
}

function applyBrowseSearch(rawValue) {
    browseSearchQuery = rawValue.trim().toLowerCase();
    updateBrowseView({ resetPage: true });
}

function scheduleBrowseSearch(rawValue) {
    if (browseSearchDebounce) {
        clearTimeout(browseSearchDebounce);
    }

    browseSearchDebounce = setTimeout(() => {
        browseSearchDebounce = null;
        applyBrowseSearch(rawValue);
    }, BROWSE_SEARCH_DEBOUNCE_MS);
}

function renderBrowsePagination(totalResults) {
    const totalPages = Math.max(1, Math.ceil(totalResults / browsePageSize));
    if (browseCurrentPage > totalPages) {
        browseCurrentPage = totalPages;
    }

    const start = totalResults === 0 ? 0 : ((browseCurrentPage - 1) * browsePageSize) + 1;
    const end = totalResults === 0 ? 0 : Math.min(totalResults, browseCurrentPage * browsePageSize);
    const querySuffix = browseSearchQuery ? ` for "${searchInput.value.trim()}"` : '';

    if (browseResultsSummary) {
        browseResultsSummary.textContent = totalResults === 0
            ? `No games match the current filters${querySuffix}`
            : `Showing ${start}-${end} of ${totalResults.toLocaleString()} games${querySuffix}`;
    }

    if (searchAssistText) {
        searchAssistText.textContent = browseSearchQuery
            ? `Smart search is ranking close matches for "${searchInput.value.trim()}".`
            : 'Smart search matches names, filenames, and platforms.';
    }

    if (browsePageIndicator) {
        browsePageIndicator.textContent = `Page ${totalPages === 0 ? 1 : browseCurrentPage} of ${totalPages}`;
    }

    if (browsePrevPageBtn) {
        browsePrevPageBtn.disabled = browseCurrentPage <= 1 || totalResults === 0;
    }

    if (browseNextPageBtn) {
        browseNextPageBtn.disabled = browseCurrentPage >= totalPages || totalResults === 0;
    }

    if (browsePageSizeSelect) {
        browsePageSizeSelect.value = String(browsePageSize);
    }
}

platformFilter.addEventListener('click', e => {
    const btn = e.target.closest('.platform-filter-btn');
    if (!btn) return;
    activePlatform = btn.dataset.platform || '';
    updateBrowseView({ resetPage: true });
});

regionFilter.addEventListener('click', e => {
    const btn = e.target.closest('.platform-filter-btn');
    if (!btn) return;
    activeRegion = btn.dataset.region || '';
    updateBrowseView({ resetPage: true });
});

revisionFilter.addEventListener('click', e => {
    const btn = e.target.closest('.platform-filter-btn');
    if (!btn) return;
    activeRevision = btn.dataset.revision || '';
    updateBrowseView({ resetPage: true });
});

downloadedPlatformFilter.addEventListener('click', e => {
    const btn = e.target.closest('.platform-filter-btn');
    if (!btn) return;
    downloadedActivePlatform = btn.dataset.platform || '';
    refreshDownloadedFilters();
    displayDownloadedGames();
});

downloadedRegionFilter.addEventListener('click', e => {
    const btn = e.target.closest('.platform-filter-btn');
    if (!btn) return;
    downloadedActiveRegion = btn.dataset.region || '';
    refreshDownloadedFilters();
    displayDownloadedGames();
});

downloadedRevisionFilter.addEventListener('click', e => {
    const btn = e.target.closest('.platform-filter-btn');
    if (!btn) return;
    downloadedActiveRevision = btn.dataset.revision || '';
    refreshDownloadedFilters();
    displayDownloadedGames();
});

// Letter filter
document.getElementById('letterFilter').addEventListener('click', e => {
    const btn = e.target.closest('.letter-btn');
    if (!btn) return;
    activeLetter = btn.dataset.letter;
    document.querySelectorAll('.letter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateBrowseView({ resetPage: true });
});

document.getElementById('downloadedLetterFilter').addEventListener('click', e => {
    const btn = e.target.closest('.letter-btn');
    if (!btn) return;
    downloadedActiveLetter = btn.dataset.letter;
    document.querySelectorAll('#downloadedLetterFilter .letter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    refreshDownloadedFilters();
    displayDownloadedGames();
});

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const tabName = btn.dataset.tab;

        // Update active button
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update active content
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');

        if (tabName === 'downloaded') {
            loadDownloadedGames();
            loadRecentDownloads();
            loadCollections();
        }

        if (tabName === 'settings') {
            loadServiceHealth();
        }
    });
});

// Fetch games from server
async function fetchGames() {
    fetchBtn.disabled = true;
    fetchBtn.textContent = '🔄 Fetching...';

    try {
        const response = await fetch('/api/fetch-games');
        const data = await response.json();

        if (data.success) {
            showToast(`Found and cached ${data.count} games!`, 'success');
            await loadGames();
            await refreshWorkspaceData();
        } else {
            showToast('Error fetching games: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.textContent = '🔄 Refresh Game List';
    }
}

// Load games from database
async function loadGames() {
    gamesGrid.innerHTML = '<div class="loading">Loading games...</div>';

    try {
        const response = await fetch('/api/games');
        const data = await response.json();

        if (data.success) {
            allGames = data.games.map(decorateGame);
            browsePlatformOptions = getAvailablePlatforms(allGames);
            browseDataVersion++;
            invalidateBrowseViewCache();
            updateBrowseView({ resetPage: true });
            updateStats();
            renderCollections();
        } else {
            gamesGrid.innerHTML = '<div class="empty-state">Error loading games</div>';
        }
    } catch (error) {
        gamesGrid.innerHTML = `<div class="empty-state">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// Load downloaded games
async function loadDownloadedGames() {
    downloadedGrid.innerHTML = '<div class="loading">Loading...</div>';

    try {
        const response = await fetch('/api/downloaded');
        const data = await response.json();

        if (data.success) {
            downloadedGames = data.games.map(decorateGame);
            downloadedPlatformOptions = getAvailablePlatforms(downloadedGames);
            downloadedDataVersion++;
            invalidateDownloadedViewCache();
            if (data.games.length === 0) {
                downloadedGrid.innerHTML = '<div class="empty-state">No games downloaded yet</div>';
            } else {
                refreshDownloadedFilters();
                displayDownloadedGames();
            }
            renderCollections();
        }
    } catch (error) {
        downloadedGrid.innerHTML = `<div class="empty-state">Error: ${escapeHtml(error.message)}</div>`;
    }
}

function displayDownloadedGames() {
    const games = [...getDownloadedViewModel().filteredGames].sort((a, b) => a.name.localeCompare(b.name));
    displayGames(games, downloadedGrid, true);
}

// Sort and display games
function sortAndDisplayGames() {
    const viewModel = getBrowseViewModel();
    const sorted = [...viewModel.filteredGames];
    const activeSearchScores = browseSearchQuery ? (viewModel.searchScores || new Map()) : null;

    switch (sortBy.value) {
        case 'size':
            sorted.sort((a, b) => (b._sizeBytes || 0) - (a._sizeBytes || 0));
            break;
        case 'date':
            sorted.sort((a, b) => (b._dateValue || 0) - (a._dateValue || 0));
            break;
        case 'name':
        default:
            sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (activeSearchScores) {
        sorted.sort((a, b) => {
            const scoreDiff = (activeSearchScores.get(b.id) || 0) - (activeSearchScores.get(a.id) || 0);
            if (scoreDiff !== 0) {
                return scoreDiff;
            }

            if (sortBy.value === 'size') {
                return (b._sizeBytes || 0) - (a._sizeBytes || 0) || a.name.localeCompare(b.name);
            }

            if (sortBy.value === 'date') {
                return (b._dateValue || 0) - (a._dateValue || 0) || a.name.localeCompare(b.name);
            }

            return a.name.localeCompare(b.name);
        });
    }

    renderBrowsePagination(sorted.length);

    const startIndex = (browseCurrentPage - 1) * browsePageSize;
    const pagedGames = sorted.slice(startIndex, startIndex + browsePageSize);
    displayGames(pagedGames, gamesGrid, false);
}

// Parse file size string
function parseSize(sizeStr) {
    const match = sizeStr.match(/([\d.]+)\s+([KMGT]?i?B)/);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2];
    const units = { 'B': 1, 'KiB': 1024, 'MiB': 1024 * 1024, 'GiB': 1024 * 1024 * 1024 };
    return value * (units[unit] || 1);
}

// Format file size for display
function formatSize(sizeStr) {
    const bytes = parseSize(sizeStr);
    if (bytes === 0) return sizeStr;

    return formatSizeFromBytes(bytes, sizeStr);
}

function formatSizeFromBytes(bytes, fallback = '0 B') {
    if (bytes === 0) return fallback;

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

// Toggle selection mode
function toggleSelectMode() {
    selectMode = !selectMode;
    selectedGameIds.clear();
    selectModeBtn.style.display = selectMode ? 'none' : '';
    downloadSelectedBtn.style.display = selectMode ? '' : 'none';
    cancelSelectBtn.style.display = selectMode ? '' : 'none';
    selectAllFilteredBtn.style.display = selectMode ? '' : 'none';
    downloadAllBtn.style.display = selectMode ? 'none' : '';
    downloadHighestRevisionsBtn.style.display = selectMode ? 'none' : '';
    selectedCountEl.textContent = '0';
    sortAndDisplayGames();
}

// Select all games currently visible (matching letter filter & search)
function selectAllFiltered() {
    getFilteredGames().filter(g => !g.downloaded).forEach(g => selectedGameIds.add(g.id));
    selectedCountEl.textContent = selectedGameIds.size;
    sortAndDisplayGames();
}

// Toggle individual card selection
function toggleGameSelection(gameId) {
    if (selectedGameIds.has(gameId)) {
        selectedGameIds.delete(gameId);
    } else {
        selectedGameIds.add(gameId);
    }
    selectedCountEl.textContent = selectedGameIds.size;
    // Update card appearance without full re-render
    const card = document.querySelector(`.game-card[data-id='${gameId}']`);
    if (card) card.classList.toggle('selected', selectedGameIds.has(gameId));
}

// Download selected games
async function downloadSelected() {
    const toDownload = allGames.filter(g => selectedGameIds.has(g.id) && !g.downloaded);
    if (toDownload.length === 0) {
        showToast('No undownloaded games selected.', 'info');
        return;
    }
    if (!confirm(`Download ${toDownload.length} selected game(s)?`)) return;

    toggleSelectMode(); // exit select mode

    downloadAllQueue = [...toDownload];
    downloadAllTotal = toDownload.length;
    downloadAllCompleted = 0;
    downloadAllActive = true;
    downloadAllBtn.disabled = true;
    downloadHighestRevisionsBtn.disabled = true;
    downloadAllBtn.textContent = `⏬ Downloading (0/${downloadAllTotal})...`;
    cancelBatchBtn.style.display = '';
    cancelBatchBtn.disabled = false;
    cancelBatchBtn.textContent = '⏹ Cancel Batch';
    await processDownloadAllQueue();
}

async function downloadHighestRevisions() {
    const highestRevisionGames = getHighestRevisionGames(getFilteredGames());
    const toDownload = highestRevisionGames.filter(g => !g.downloaded);

    if (toDownload.length === 0) {
        showToast('All highest visible revisions are already downloaded!', 'info');
        return;
    }

    if (!confirm(`Queue ${toDownload.length} highest-revision game(s) from the current filters for download?`)) return;

    downloadAllQueue = [...toDownload];
    downloadAllTotal = toDownload.length;
    downloadAllCompleted = 0;
    downloadAllActive = true;

    downloadAllBtn.disabled = true;
    downloadHighestRevisionsBtn.disabled = true;
    downloadAllBtn.textContent = `⏬ Downloading (0/${downloadAllTotal})...`;
    cancelBatchBtn.style.display = '';
    cancelBatchBtn.disabled = false;
    cancelBatchBtn.textContent = '⏹ Cancel Batch';

    await processDownloadAllQueue();
}

function getActiveCollection() {
    return collections.find(collection => collection.id === activeCollectionId) || null;
}

function getQueueItemForGame(gameId) {
    return queueItems.find(item => item.game_id === gameId && !['completed', 'cancelled'].includes(item.status)) || null;
}

function renderGameCards(games, isDownloaded = false, options = {}) {
    const activeCollection = getActiveCollection();
    const collectionView = Boolean(options.collectionView);

    return games.map(game => {
        const isSelected = selectedGameIds.has(game.id);
        const escapedName = escapeForSingleQuotedJs(game.name);
        const escapedFilename = escapeForSingleQuotedJs(game.filename);
        const safeName = escapeHtml(game.name);
        const safeDeveloper = game.developer ? escapeHtml(game.developer) : '';
        const safeReleaseDate = game.release_date ? escapeHtml(game.release_date) : '';
        const safePosterUrl = sanitizeImageUrl(game.box_art);
        const safeDownloadLabel = game.download_label ? escapeForSingleQuotedJs(game.download_label) : '';
        const queueItem = getQueueItemForGame(game.id);
        const inActiveCollection = activeCollectionGameIds.has(game.id);
        const cardClick = selectMode && !isDownloaded
            ? `toggleGameSelection(${game.id})`
            : `openGameMetadata(${game.id}, '${escapedName}', '${escapedFilename}')`;
        return `
        <div class="game-card${isSelected ? ' selected' : ''}" data-id="${game.id}" onclick="${cardClick}" style="cursor: pointer;">
            ${selectMode && !isDownloaded ? `<div class="select-checkbox">${isSelected ? '✔' : ''}</div>` : ''}
            ${game.downloaded ? '<div class="game-status">✓ Downloaded</div>' : ''}
            ${safePosterUrl ? `<img src="${escapeForHtmlAttribute(safePosterUrl)}" alt="${escapeForHtmlAttribute(game.name)}" class="game-poster" onerror="this.style.display='none'">` : ''}
            <h3>${safeName}</h3>
            <div class="game-info">
                <div class="game-detail">
                    <span>Size:</span>
                    <span>${escapeHtml(game._displaySize || formatSize(game.size))}</span>
                </div>
                <div class="game-detail">
                    <span>Date:</span>
                    <span>${escapeHtml(game._displayDate || game.date)}</span>
                </div>
                <div class="game-detail">
                    <span>Platform:</span>
                    <span>${escapeHtml(getPlatformLabel(game))}</span>
                </div>
                ${game.developer ? `<div class="game-detail"><span>Dev:</span><span>${safeDeveloper}</span></div>` : ''}
                ${game.release_date ? `<div class="game-detail"><span>Released:</span><span>${safeReleaseDate}</span></div>` : ''}
            </div>
            <div class="game-actions">
                ${collectionView ? `
                    <button class="btn btn-danger" onclick="event.stopPropagation(); removeGameFromActiveCollection(${game.id})">Remove</button>
                    ${game.download_label ? `<button class="btn btn-secondary" onclick="event.stopPropagation(); openFile('${safeDownloadLabel}')">Open</button>` : ''}
                ` : isDownloaded ? `
                    <button class="btn btn-danger" onclick="event.stopPropagation(); deleteGame(${game.id})">Delete</button>
                    ${game.download_label ? `<button class="btn btn-secondary" onclick="event.stopPropagation(); openFile('${safeDownloadLabel}')">Open</button>` : ''}
                ` : selectMode ? '' : `
                    <button class="btn btn-primary" onclick="event.stopPropagation(); downloadGame(${game.id}, '${escapedFilename}')">Download</button>
                    <button class="btn btn-secondary" onclick="event.stopPropagation(); enqueueGame(${game.id})" ${queueItem ? 'disabled' : ''}>${queueItem ? 'Queued' : 'Queue'}</button>
                `}
                ${!collectionView && activeCollection ? `
                    <button class="btn ${inActiveCollection ? 'btn-success' : 'btn-secondary'}" onclick="event.stopPropagation(); ${inActiveCollection ? `removeGameFromActiveCollection(${game.id})` : `saveGameToActiveCollection(${game.id})`}">${inActiveCollection ? 'Saved' : 'Save'}</button>
                ` : ''}
            </div>
        </div>`;
    }).join('');
}

function displayGames(games, container, isDownloaded = false, options = {}) {
    if (games.length === 0) {
        container.innerHTML = '<div class="empty-state">No games found</div>';
        return;
    }

    container.innerHTML = renderGameCards(games, isDownloaded, options);
}

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    return response.json();
}

function renderQueuePanel() {
    const pendingCount = queueItems.filter(item => item.status === 'pending').length;
    const downloadingCount = queueItems.filter(item => item.status === 'downloading').length;
    const pausedCount = queueItems.filter(item => item.status === 'paused').length;
    const failedCount = queueItems.filter(item => item.status === 'failed').length;

    if (queueSummaryText) {
        if (queueItems.length === 0) {
            queueSummaryText.textContent = 'No queued downloads yet.';
        } else {
            queueSummaryText.textContent = `${queueItems.length} item(s) tracked • ${pendingCount} pending • ${downloadingCount} downloading • ${pausedCount} paused • ${failedCount} failed`;
        }
    }

    if (queueActiveBadge) {
        const isActive = queueItems.some(item => item.status === 'downloading');
        queueActiveBadge.textContent = isActive ? 'Active' : (queueItems.length ? 'Queued' : 'Idle');
        queueActiveBadge.className = `status-badge ${isActive ? 'active' : (queueItems.length ? 'pending' : '')}`.trim();
    }

    if (!queueList) {
        return;
    }

    if (queueItems.length === 0) {
        queueList.innerHTML = '<div class="empty-state compact">No queued downloads yet</div>';
        return;
    }

    queueList.innerHTML = queueItems.map(item => {
        const game = item.game || {};
        const title = game.name || `Game #${item.game_id}`;
        const statusLabel = item.status.charAt(0).toUpperCase() + item.status.slice(1);
        const meta = [
            game.platform || '',
            `Updated ${formatRelativeDate(item.updated_at)}`,
            item.attempts ? `Attempts: ${item.attempts}` : '',
            item.error || ''
        ].filter(Boolean).join(' • ');

        return `
            <div class="queue-item">
                <div class="queue-item-details">
                    <div class="queue-item-title">${escapeHtml(title)}</div>
                    <div class="queue-item-meta">${escapeHtml(meta)}</div>
                </div>
                <div class="queue-item-actions">
                    <span class="status-badge ${item.status}">${escapeHtml(statusLabel)}</span>
                    ${item.status === 'paused' || item.status === 'failed'
                ? `<button type="button" class="btn btn-secondary btn-small" onclick="resumeQueueItem(${item.id})">Resume</button>`
                : ''}
                    ${item.status === 'pending' || item.status === 'downloading'
                ? `<button type="button" class="btn btn-secondary btn-small" onclick="pauseQueueItem(${item.id})">Pause</button>`
                : ''}
                    <button type="button" class="btn btn-danger btn-small" onclick="removeQueueItem(${item.id})">Remove</button>
                </div>
            </div>
        `;
    }).join('');
}

async function loadQueue() {
    try {
        const data = await fetchJson('/api/queue');
        if (data.success) {
            queueItems = data.queue || [];
            renderQueuePanel();
        }
    } catch (error) {
        if (queueSummaryText) {
            queueSummaryText.textContent = `Queue unavailable: ${error.message}`;
        }
    }
}

async function enqueueGame(gameId) {
    try {
        const data = await fetchJson('/api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        });

        if (data.success) {
            showToast('Game added to the download queue', 'success');
            await loadQueue();
            sortAndDisplayGames();
        } else {
            showToast(data.error || 'Unable to queue game', 'error');
        }
    } catch (error) {
        showToast('Queue error: ' + error.message, 'error');
    }
}

async function queueGames(games, successMessage) {
    if (games.length === 0) {
        showToast('Nothing to queue from the current selection.', 'info');
        return;
    }

    try {
        const results = await Promise.all(games.map(game =>
            fetchJson('/api/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: game.id })
            })
        ));
        const queuedCount = results.filter(result => result.success).length;
        if (queuedCount === 0) {
            showToast('No games were added to the queue.', 'info');
            return;
        }
        showToast(successMessage.replace('{count}', queuedCount), 'success');
        await loadQueue();
        sortAndDisplayGames();
    } catch (error) {
        showToast('Queue error: ' + error.message, 'error');
    }
}

async function queueAllFiltered() {
    const candidates = getFilteredGames().filter(game => !game.downloaded);
    if (candidates.length === 0) {
        showToast('All visible games are already downloaded or queued.', 'info');
        return;
    }
    if (!confirm(`Add ${candidates.length} visible game(s) to the queue?`)) {
        return;
    }
    await queueGames(candidates, 'Queued {count} game(s)');
}

async function queueHighestRevisions() {
    const candidates = getHighestRevisionGames(getFilteredGames()).filter(game => !game.downloaded);
    if (candidates.length === 0) {
        showToast('No highest-revision games are available to queue.', 'info');
        return;
    }
    if (!confirm(`Add ${candidates.length} highest-revision game(s) to the queue?`)) {
        return;
    }
    await queueGames(candidates, 'Queued {count} highest-revision game(s)');
}

async function pauseQueueItem(queueId) {
    try {
        const data = await fetchJson(`/api/queue/${queueId}/pause`, { method: 'POST' });
        if (data.success) {
            await loadQueue();
            showToast('Queue item paused', 'info');
        }
    } catch (error) {
        showToast('Pause failed: ' + error.message, 'error');
    }
}

async function resumeQueueItem(queueId) {
    try {
        const data = await fetchJson(`/api/queue/${queueId}/resume`, { method: 'POST' });
        if (data.success) {
            await loadQueue();
            showToast('Queue item resumed', 'success');
        }
    } catch (error) {
        showToast('Resume failed: ' + error.message, 'error');
    }
}

async function removeQueueItem(queueId) {
    try {
        const data = await fetchJson(`/api/queue/${queueId}`, { method: 'DELETE' });
        if (data.success) {
            await loadQueue();
            showToast('Queue item removed', 'info');
        }
    } catch (error) {
        showToast('Remove failed: ' + error.message, 'error');
    }
}

function renderRecentDownloads() {
    if (!recentDownloadsList) {
        return;
    }

    if (recentDownloads.length === 0) {
        recentDownloadsList.innerHTML = '<div class="empty-state compact">No recent downloads yet</div>';
        return;
    }

    recentDownloadsList.innerHTML = recentDownloads.map(game => `
        <div class="recent-download-item">
            <div class="recent-download-details">
                <div class="recent-download-title">${escapeHtml(game.name)}</div>
                <div class="recent-download-meta">${escapeHtml(`${getPlatformLabel(game)} • ${formatRelativeDate(game.downloaded_at || game.created_at)}`)}</div>
            </div>
            <div class="queue-item-actions">
                <button type="button" class="btn btn-secondary btn-small" onclick="openGameMetadata(${game.id}, '${escapeForSingleQuotedJs(game.name)}', '${escapeForSingleQuotedJs(game.filename)}')">Details</button>
                ${game.download_label ? `<button type="button" class="btn btn-secondary btn-small" onclick="openFile('${escapeForSingleQuotedJs(game.download_label)}')">Open</button>` : ''}
            </div>
        </div>
    `).join('');
}

async function loadRecentDownloads() {
    try {
        const data = await fetchJson('/api/recent-downloads');
        if (data.success) {
            recentDownloads = (data.games || []).map(decorateGame);
            renderRecentDownloads();
        }
    } catch (error) {
        if (recentDownloadsList) {
            recentDownloadsList.innerHTML = `<div class="empty-state compact">Recent downloads unavailable: ${escapeHtml(error.message)}</div>`;
        }
    }
}

function renderCollections() {
    const activeCollection = getActiveCollection();

    if (collectionsList) {
        if (collections.length === 0) {
            collectionsList.innerHTML = '<div class="empty-state compact">No collections yet</div>';
        } else {
            collectionsList.innerHTML = collections.map(collection => `
                <div class="collection-item ${collection.id === activeCollectionId ? 'active' : ''}">
                    <button type="button" class="collection-select-btn collection-item-details" onclick="selectCollection(${collection.id})">
                        <div class="collection-item-title">${escapeHtml(collection.name)}</div>
                        <div class="collection-item-meta">${escapeHtml(`${collection.game_count} game(s)${collection.description ? ` • ${collection.description}` : ''}`)}</div>
                    </button>
                    <div class="collection-item-actions">
                        <button type="button" class="btn btn-secondary btn-small" onclick="selectCollection(${collection.id})">${collection.id === activeCollectionId ? 'Active' : 'Open'}</button>
                        <button type="button" class="btn btn-danger btn-small" onclick="deleteCollection(${collection.id})">Delete</button>
                    </div>
                </div>
            `).join('');
        }
    }

    if (!activeCollectionSummary) {
        return;
    }

    if (!activeCollection) {
        activeCollectionSummary.className = 'collection-summary empty';
        activeCollectionSummary.textContent = collections.length
            ? 'Choose a collection, then use Save on any game card to add titles to it.'
            : 'Create your first collection to start organizing games.';
        if (collectionGamesSection) {
            collectionGamesSection.style.display = 'none';
        }
        return;
    }

    activeCollectionSummary.className = 'collection-summary';
    activeCollectionSummary.innerHTML = `
        <strong>${escapeHtml(activeCollection.name)}</strong>
        <span>${escapeHtml(activeCollection.description || 'No description yet.')}</span>
        <span>${activeCollectionGames.length} saved game(s)</span>
    `;

    if (collectionGamesSection) {
        collectionGamesSection.style.display = '';
    }
    if (collectionGamesTitle) {
        collectionGamesTitle.textContent = activeCollection.name;
    }
    if (collectionGamesSubtitle) {
        collectionGamesSubtitle.textContent = activeCollection.description || 'Saved games for the active collection.';
    }
    if (collectionGamesGrid) {
        displayGames(activeCollectionGames, collectionGamesGrid, true, { collectionView: true });
    }
}

async function loadCollections() {
    try {
        const data = await fetchJson('/api/collections');
        if (data.success) {
            collections = data.collections || [];
            if (activeCollectionId && !collections.some(collection => collection.id === activeCollectionId)) {
                activeCollectionId = collections[0] ? collections[0].id : null;
            }
            if (!activeCollectionId && collections[0]) {
                activeCollectionId = collections[0].id;
            }
            if (activeCollectionId) {
                await loadCollectionGames(activeCollectionId);
            } else {
                activeCollectionGames = [];
                activeCollectionGameIds = new Set();
            }
            renderCollections();
            sortAndDisplayGames();
            if (downloadedGames.length > 0) {
                displayDownloadedGames();
            }
        }
    } catch (error) {
        if (collectionsList) {
            collectionsList.innerHTML = `<div class="empty-state compact">Collections unavailable: ${escapeHtml(error.message)}</div>`;
        }
    }
}

async function loadCollectionGames(collectionId) {
    try {
        const data = await fetchJson(`/api/collections/${collectionId}/games`);
        if (data.success) {
            activeCollectionGames = (data.games || []).map(decorateGame);
            activeCollectionGameIds = new Set(activeCollectionGames.map(game => game.id));
        }
    } catch (_error) {
        activeCollectionGames = [];
        activeCollectionGameIds = new Set();
    }
}

async function selectCollection(collectionId) {
    activeCollectionId = collectionId;
    await loadCollectionGames(collectionId);
    renderCollections();
    sortAndDisplayGames();
    if (downloadedGames.length > 0) {
        displayDownloadedGames();
    }
}

async function createCollection() {
    const name = collectionNameInput ? collectionNameInput.value.trim() : '';
    const description = collectionDescriptionInput ? collectionDescriptionInput.value.trim() : '';
    if (!name) {
        showToast('Enter a collection name first.', 'info');
        return;
    }

    try {
        const data = await fetchJson('/api/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (data.success) {
            if (collectionNameInput) collectionNameInput.value = '';
            if (collectionDescriptionInput) collectionDescriptionInput.value = '';
            activeCollectionId = data.collection.id;
            await loadCollections();
            showToast('Collection created', 'success');
        } else {
            showToast(data.error || 'Unable to create collection', 'error');
        }
    } catch (error) {
        showToast('Collection error: ' + error.message, 'error');
    }
}

async function deleteCollection(collectionId) {
    if (!confirm('Delete this collection?')) {
        return;
    }

    try {
        const data = await fetchJson(`/api/collections/${collectionId}`, { method: 'DELETE' });
        if (data.success) {
            if (activeCollectionId === collectionId) {
                activeCollectionId = null;
            }
            await loadCollections();
            showToast('Collection deleted', 'info');
        }
    } catch (error) {
        showToast('Delete failed: ' + error.message, 'error');
    }
}

async function saveGameToActiveCollection(gameId) {
    if (!activeCollectionId) {
        showToast('Select a collection first.', 'info');
        return;
    }

    try {
        const data = await fetchJson(`/api/collections/${activeCollectionId}/games`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId })
        });
        if (data.success) {
            await loadCollections();
            showToast('Game saved to collection', 'success');
        }
    } catch (error) {
        showToast('Save failed: ' + error.message, 'error');
    }
}

async function removeGameFromActiveCollection(gameId) {
    if (!activeCollectionId) {
        return;
    }

    try {
        const data = await fetchJson(`/api/collections/${activeCollectionId}/games/${gameId}`, { method: 'DELETE' });
        if (data.success) {
            await loadCollections();
            showToast('Game removed from collection', 'info');
        }
    } catch (error) {
        showToast('Remove failed: ' + error.message, 'error');
    }
}

function renderServiceHealth() {
    const markup = !serviceHealthSnapshot
        ? '<div class="empty-state compact">Checking service health...</div>'
        : Object.entries(serviceHealthSnapshot.services || {}).map(([name, service]) => `
            <div class="service-health-item">
                <div class="service-health-item-details">
                    <div class="service-health-item-title">${escapeHtml(name)}</div>
                    <div class="service-health-item-meta">${escapeHtml(service.detail || 'Ready to use')}</div>
                </div>
                <span class="status-badge ${service.status}">${escapeHtml(service.status)}</span>
            </div>
        `).join('');

    if (serviceHealthList) {
        serviceHealthList.innerHTML = markup;
    }
    if (settingsServiceHealthList) {
        settingsServiceHealthList.innerHTML = markup;
    }

    if (metadataSyncText) {
        if (!metadataSyncSnapshot) {
            metadataSyncText.textContent = 'Waiting for sync activity.';
        } else {
            const sync = metadataSyncSnapshot.sync;
            metadataSyncText.textContent = sync.running
                ? `Syncing metadata • ${sync.completed} complete • ${sync.queued} queued`
                : `Last run updated ${sync.updated} game(s), ${sync.failed} missed`;
        }
    }
}

async function loadServiceHealth() {
    try {
        const [health, metadata] = await Promise.all([
            fetchJson('/api/health'),
            fetchJson('/api/metadata-sync-status')
        ]);

        if (health.success) {
            serviceHealthSnapshot = health;
        }
        if (metadata.success) {
            metadataSyncSnapshot = metadata;
        }
        renderServiceHealth();
    } catch (error) {
        if (serviceHealthList) {
            serviceHealthList.innerHTML = `<div class="empty-state compact">Status unavailable: ${escapeHtml(error.message)}</div>`;
        }
        if (settingsServiceHealthList) {
            settingsServiceHealthList.innerHTML = `<div class="empty-state compact">Status unavailable: ${escapeHtml(error.message)}</div>`;
        }
    }
}

async function refreshWorkspaceData() {
    await Promise.all([
        loadQueue(),
        loadRecentDownloads(),
        loadCollections(),
        loadServiceHealth()
    ]);
}

// Cancel the active single download and close the modal
async function cancelCurrentDownload() {
    if (currentDownloadController) {
        currentDownloadController.abort();
        currentDownloadController = null;
    }
    if (currentDownloading) {
        fetch('/api/cancel-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: currentDownloading.gameId })
        }).catch(() => { });
    }
    closeDownloadModal();
}

// Close download modal
function closeDownloadModal() {
    downloadModal.classList.remove('show');
    currentDownloading = null;
}

// Download game
async function downloadGame(gameId, filename) {
    // Show modal
    downloadModal.classList.add('show');
    downloadName.textContent = filename.replace(/\.[^.]+$/, '');
    currentDownloadController = new AbortController();
    currentDownloading = { gameId, filename };
    progressFill.style.width = '0%';
    document.getElementById('progressPercentage').textContent = '0%';
    progressText.textContent = 'Preparing download...';

    let progressInterval;
    try {
        // Simulate progress updates while downloading
        progressInterval = setInterval(() => {
            const currentWidth = parseFloat(progressFill.style.width);
            if (currentWidth < 90) {
                const newWidth = currentWidth + Math.random() * 20;
                progressFill.style.width = Math.min(newWidth, 90) + '%';
                document.getElementById('progressPercentage').textContent =
                    Math.round(Math.min(newWidth, 90)) + '%';
                progressText.textContent = 'Downloading...';
            }
        }, 300);

        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, filename }),
            signal: currentDownloadController.signal
        });

        clearInterval(progressInterval);
        const data = await response.json();

        if (data.success) {
            progressFill.style.width = '100%';
            document.getElementById('progressPercentage').textContent = '100%';
            progressText.textContent = 'Download complete!';
            showToast(`Downloaded: ${filename}`, 'success');

            // Reload games after a delay
            setTimeout(() => {
                downloadModal.classList.remove('show');
                loadGames();
                loadDownloadedGames();
                refreshWorkspaceData();
            }, 1500);
        } else if (!data.cancelled) {
            clearInterval(progressInterval);
            showToast('Download failed: ' + data.error, 'error');
            progressText.textContent = 'Download failed';
            setTimeout(() => {
                downloadModal.classList.remove('show');
            }, 2000);
        }
    } catch (error) {
        if (progressInterval) clearInterval(progressInterval);
        if (error.name !== 'AbortError') {
            showToast('Download error: ' + error.message, 'error');
            progressText.textContent = 'Download error';
            setTimeout(() => {
                downloadModal.classList.remove('show');
            }, 2000);
        }
    }
}

// Download all non-downloaded games sequentially
async function downloadAll() {
    const notDownloaded = getFilteredGames().filter(g => !g.downloaded);
    if (notDownloaded.length === 0) {
        showToast('All visible games are already downloaded!', 'info');
        return;
    }

    if (!confirm(`Queue ${notDownloaded.length} game(s) for download? This may take a long time.`)) return;

    downloadAllQueue = [...notDownloaded];
    downloadAllTotal = notDownloaded.length;
    downloadAllCompleted = 0;
    downloadAllActive = true;

    downloadAllBtn.disabled = true;
    downloadHighestRevisionsBtn.disabled = true;
    downloadAllBtn.textContent = `⏬ Downloading (0/${downloadAllTotal})...`;
    cancelBatchBtn.style.display = '';
    cancelBatchBtn.disabled = false;
    cancelBatchBtn.textContent = '⏹ Cancel Batch';

    await processDownloadAllQueue();
}

// Cancel the running batch download queue
function cancelBatch() {
    cancelBatchRequested = true;
    cancelBatchBtn.disabled = true;
    cancelBatchBtn.textContent = '⏳ Cancelling...';
    if (downloadAllCurrentGameId !== null) {
        fetch('/api/cancel-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: downloadAllCurrentGameId })
        }).catch(() => { });
    }
}

async function processDownloadAllQueue() {
    if (cancelBatchRequested || downloadAllQueue.length === 0) {
        const wasCancelled = cancelBatchRequested;
        downloadAllActive = false;
        cancelBatchRequested = false;
        downloadAllCurrentGameId = null;
        downloadAllBtn.disabled = false;
        downloadHighestRevisionsBtn.disabled = false;
        downloadAllBtn.textContent = '⏬ Download All';
        cancelBatchBtn.style.display = 'none';
        if (wasCancelled) {
            showToast(`Batch cancelled. ${downloadAllCompleted} of ${downloadAllTotal} downloaded.`, 'info');
        } else {
            showToast(`Batch download complete! ${downloadAllCompleted} of ${downloadAllTotal} games downloaded.`, 'success');
        }
        loadGames();
        loadDownloadedGames();
        refreshWorkspaceData();
        updateStats();
        return;
    }

    const game = downloadAllQueue.shift();
    downloadAllCurrentGameId = game.id;
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId: game.id, filename: game.filename })
        });
        const data = await response.json();
        if (data.success) {
            downloadAllCompleted++;
            showToast(`Downloaded: ${game.name}`, 'success');
        } else if (!data.cancelled) {
            showToast(`Failed: ${game.name} — ${data.error}`, 'error');
        }
    } catch (error) {
        if (!cancelBatchRequested) {
            showToast(`Error: ${game.name} — ${error.message}`, 'error');
        }
    }

    downloadAllBtn.textContent = `⏬ Downloading (${downloadAllCompleted}/${downloadAllTotal})...`;
    await processDownloadAllQueue();
}

// Delete downloaded game
async function deleteGame(gameId) {
    if (!confirm('Are you sure you want to delete this game?')) return;

    try {
        const response = await fetch(`/api/game/${gameId}`, { method: 'DELETE' });
        const data = await response.json();

        if (data.success) {
            showToast('Game deleted successfully', 'success');
            loadDownloadedGames();
            loadGames();
            refreshWorkspaceData();
        } else {
            showToast('Error deleting game', 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// Open file (this would be handled differently in production)
function openFile(path) {
    showToast('File location: ' + String(path || ''), 'success');
}

// Rebuild the library from Myrient + disk scan
async function rebuildLibrary() {
    if (!confirm('Rebuild the library?\n\nThis will:\n• Re-fetch the full game list from Myrient\n• Remove entries no longer on Myrient\n• Preserve your metadata and download history\n• Recover any files already in the downloads folder')) return;

    const btn = document.getElementById('rebuildBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Rebuilding...';

    try {
        const response = await fetch('/api/rebuild', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            await loadGames();
            await loadDownloadedGames();
            await refreshWorkspaceData();
            updateStats();
        } else {
            showToast('Rebuild failed: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Rebuild error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Rebuild Library';
    }
}

async function reindexDownloadedGames() {
    if (!confirm('Rebuild the downloaded games index from disk?\n\nThis will:\n• Scan the downloads folder\n• Mark matching games as downloaded\n• Clear missing download paths\n• Leave the online library untouched')) return;

    const btn = document.getElementById('reindexDownloadsBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Reindexing...';

    try {
        const response = await fetch('/api/reindex-downloads', { method: 'POST' });
        const data = await response.json();

        if (data.success) {
            showToast(data.message, 'success');
            await loadGames();
            await loadDownloadedGames();
            await refreshWorkspaceData();
            updateStats();
        } else {
            showToast('Download reindex failed: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Download reindex error: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔁 Reindex Downloaded Games';
    }
}

// Cleanup invalid entries
async function cleanupDatabase() {
    if (!confirm('Remove invalid placeholder entries (./ and ../) from your library?')) return;

    try {
        const response = await fetch('/api/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.success) {
            showToast(`Removed ${data.removed} invalid entries`, 'success');
            loadGames();
            refreshWorkspaceData();
        } else {
            showToast('Error cleaning database', 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

// Update statistics
async function updateStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        if (data.success) {
            totalGamesEl.textContent = data.stats.total_games || 0;
            downloadedCountEl.textContent = data.stats.downloaded_count || 0;
        }
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
// Modal controls
closeModal.addEventListener('click', () => {
    cancelCurrentDownload();
});

cancelBtn.addEventListener('click', () => {
    cancelCurrentDownload();
});

downloadModal.addEventListener('click', (e) => {
    if (e.target === downloadModal) {
        cancelCurrentDownload();
    }
});

// Event listeners
// Open metadata modal for a game
async function openGameMetadata(gameId, gameName, filename = gameName) {
    currentMetadataGame = { gameId, gameName, filename };
    const modalContent = document.getElementById('metadataContent');

    // Show loading state
    modalContent.innerHTML = '<div class="metadata-loading"><div class="spinner" style="margin: 20px auto;"></div><p>Fetching metadata...</p></div>';
    metadataModal.classList.add('show');

    try {
        const response = await fetch('/api/fetch-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, gameName })
        });

        const data = await response.json();
        displayMetadataModal(gameName, data);
    } catch (error) {
        modalContent.innerHTML = `<p class="error">Error fetching metadata: ${escapeHtml(error.message)}</p>`;
    }
}

// Display formatted metadata in modal
function displayMetadataModal(gameName, data) {
    const modalContent = document.getElementById('metadataContent');
    const game = data.metadata || {};
    const source = sanitizeSourceBadgeClass(data.source || 'unknown');
    const safeDisplayName = escapeHtml(game.name || gameName);
    const safeBoxArtUrl = sanitizeImageUrl(data.box_art);

    const genresHtml = game.genres ? `<div class="metadata-row"><label>Genres:</label><span>${escapeHtml(game.genres)}</span></div>` : '';
    const developerHtml = game.developer ? `<div class="metadata-row"><label>Developer:</label><span>${escapeHtml(game.developer)}</span></div>` : '';
    const publisherHtml = game.publisher ? `<div class="metadata-row"><label>Publisher:</label><span>${escapeHtml(game.publisher)}</span></div>` : '';
    const releaseHtml = game.releaseDate ? `<div class="metadata-row"><label>Release Date:</label><span>${escapeHtml(new Date(game.releaseDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</span></div>` : (game.releaseYear ? `<div class="metadata-row"><label>Release Year:</label><span>${escapeHtml(game.releaseYear)}</span></div>` : '');
    const ratingHtml = game.rating ? `<div class="metadata-row"><label>Rating:</label><span class="rating">⭐ ${game.rating.toFixed(2)} / 10</span></div>` : '';
    const esrbHtml = game.esrb ? `<div class="metadata-row"><label>ESRB:</label><span>${escapeHtml(game.esrb)}</span></div>` : '';
    const sourceHtml = `<div class="metadata-row"><label>Source:</label><span class="source-badge ${source}">${source.toUpperCase()}</span></div>`;

    const overviewHtml = game.overview ? `
        <div class="metadata-section">
            <h3>Overview</h3>
            <p class="overview-text">${escapeHtml(game.overview)}</p>
        </div>
    ` : '';

    const boxArtHtml = safeBoxArtUrl ? `<img src="${escapeForHtmlAttribute(safeBoxArtUrl)}" alt="${escapeForHtmlAttribute(gameName)}" class="metadata-boxart">` : '';

    // Build action buttons
    const escapedModalFilename = currentMetadataGame ? escapeForSingleQuotedJs(currentMetadataGame.filename) : '';
    const escapedGameName = escapeForSingleQuotedJs(gameName);
    let actionButtonsHtml = `<button class="btn btn-primary" onclick="downloadGame(${currentMetadataGame.gameId}, '${escapedModalFilename}')">Download Game</button>`;

    // Always offer to fetch box art from TheGamesDB
    if (game.gdbId) {
        actionButtonsHtml += `<button class="btn btn-secondary" onclick="fetchBoxArtFromTheGamesDB(${game.gdbId}, '${escapedGameName}')">Fetch Box Art</button>`;
    } else if (source === 'launchbox' || source === 'unknown') {
        // For LaunchBox games without gdbId, search first then fetch
        actionButtonsHtml += `<button class="btn btn-secondary" onclick="searchAndFetchBoxArt('${escapedGameName}')">Fetch Box Art</button>`;
    }

    // Add replace image button if we have a box art URL
    if (safeBoxArtUrl && currentMetadataGame) {
        actionButtonsHtml += `<button class="btn btn-success" onclick="replaceLocalImage('${escapeForSingleQuotedJs(currentMetadataGame.gameName)}', '${escapeForSingleQuotedJs(safeBoxArtUrl)}')">Replace Local Image</button>`;
    }

    modalContent.innerHTML = `
        <div class="metadata-container">
            ${boxArtHtml}
            <div class="metadata-details">
                <h2>${safeDisplayName}</h2>
                ${sourceHtml}
                ${genresHtml}
                ${developerHtml}
                ${publisherHtml}
                ${releaseHtml}
                ${ratingHtml}
                ${esrbHtml}
                ${overviewHtml}
                <div class="metadata-actions">
                    ${actionButtonsHtml}
                </div>
            </div>
        </div>
    `;
}

// Close metadata modal
function closeMetadataModal() {
    metadataModal.classList.remove('show');
    currentMetadataGame = null;
}

// Fetch metadata and box art from LaunchBox
async function fetchMetadata(gameId, gameName) {
    try {
        const response = await fetch('/api/fetch-metadata', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameId, gameName })
        });

        const data = await response.json();

        if (data.success) {
            showToast('Metadata fetched! Refreshing...', 'success');
            await loadGames();
        } else {
            showToast(data.message || 'No metadata found', 'info');
        }
    } catch (error) {
        showToast('Error fetching metadata: ' + error.message, 'error');
    }
}

// Fetch box art from TheGamesDB by game ID (on-demand)
async function fetchBoxArtFromTheGamesDB(gdbId, gameName) {
    try {
        const response = await fetch(`/api/fetch-box-art?gdbId=${gdbId}&gameName=${encodeURIComponent(gameName)}`);
        const data = await response.json();

        if (data.success && data.boxArtUrl) {
            // Save box art to database
            const saveResponse = await fetch('/api/save-box-art', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: currentMetadataGame.gameId, boxArtPath: data.boxArtUrl })
            });
            const saveData = await saveResponse.json();

            // Update the modal with the fetched image
            const imgElement = document.querySelector('.metadata-boxart');
            if (imgElement) {
                imgElement.src = data.boxArtUrl;
            } else {
                // If no image element exists, reload the metadata
                await openGameMetadata(currentMetadataGame.gameId, currentMetadataGame.gameName);
            }

            showToast(data.cached ? 'Using cached box art' : 'Box art fetched from TheGamesDB!', 'success');
        } else {
            showToast('No box art found on TheGamesDB', 'info');
        }
    } catch (error) {
        showToast('Error fetching box art: ' + error.message, 'error');
    }
}

// Search TheGamesDB and fetch box art for LaunchBox games without gdbId
async function searchAndFetchBoxArt(gameName) {
    try {
        const response = await fetch(`/api/thegamesdb-search?name=${encodeURIComponent(gameName)}`);
        const data = await response.json();

        if (data.success && data.game) {
            // Now fetch the box art for this game
            const boxArtResponse = await fetch(`/api/fetch-box-art?gdbId=${data.game.id}&gameName=${encodeURIComponent(gameName)}`);
            const boxArtData = await boxArtResponse.json();

            if (boxArtData.success && boxArtData.boxArtUrl) {
                // Save box art to database
                await fetch('/api/save-box-art', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ gameId: currentMetadataGame.gameId, boxArtPath: boxArtData.boxArtUrl })
                });

                // Update the modal
                const imgElement = document.querySelector('.metadata-boxart');
                if (imgElement) {
                    imgElement.src = boxArtData.boxArtUrl;
                } else {
                    // If no image element exists, create one
                    const modalDetails = document.querySelector('.metadata-details');
                    if (modalDetails) {
                        const img = document.createElement('img');
                        img.src = boxArtData.boxArtUrl;
                        img.alt = gameName;
                        img.className = 'metadata-boxart';
                        modalDetails.parentElement.insertBefore(img, modalDetails);
                    }
                }
                showToast('Box art fetched from TheGamesDB!', 'success');
            } else {
                showToast('No box art found on TheGamesDB', 'info');
            }
        } else {
            showToast('Game not found on TheGamesDB', 'info');
        }
    } catch (error) {
        showToast('Error searching TheGamesDB: ' + error.message, 'error');
    }
}

// Replace local image with fetched image
async function replaceLocalImage(gameName, imageUrl) {
    try {
        const modalContent = document.getElementById('metadataContent');
        const safeImageUrl = sanitizeImageUrl(imageUrl);

        if (!safeImageUrl) {
            showToast('Invalid image URL', 'error');
            return;
        }

        // Show loading state
        const originalButton = event.target;
        originalButton.disabled = true;
        originalButton.textContent = '⏳ Caching...';

        const response = await fetch('/api/cache-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gameName, imageUrl: safeImageUrl })
        });

        const data = await response.json();

        if (data.success) {
            // Save to database
            const saveResponse = await fetch('/api/save-box-art', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gameId: currentMetadataGame.gameId, boxArtPath: data.localPath })
            });

            showToast('Local image replaced successfully!', 'success');
            originalButton.textContent = '✓ Image Replaced';
            originalButton.classList.add('btn-disabled');

            // Update the modal with new image
            const imgElements = modalContent.querySelectorAll('.metadata-boxart');
            imgElements.forEach(img => {
                img.src = data.localPath || safeImageUrl;
            });
        } else {
            showToast('Failed to cache image: ' + data.error, 'error');
            originalButton.disabled = false;
            originalButton.textContent = 'Replace Local Image';
        }
    } catch (error) {
        showToast('Error replacing image: ' + error.message, 'error');
        event.target.disabled = false;
        event.target.textContent = 'Replace Local Image';
    }
}

fetchBtn.addEventListener('click', fetchGames);

searchInput.addEventListener('input', (e) => {
    scheduleBrowseSearch(e.target.value);
});

searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        rememberSearchQuery(searchInput.value);
    }
});

searchInput.addEventListener('blur', () => {
    rememberSearchQuery(searchInput.value);
});

if (searchHistoryChips) {
    searchHistoryChips.addEventListener('click', (event) => {
        const chip = event.target.closest('.search-history-chip');
        if (!chip) {
            return;
        }
        const value = chip.dataset.query || '';
        searchInput.value = value;
        applyBrowseSearch(value);
    });
}

if (clearSearchHistoryBtn) {
    clearSearchHistoryBtn.addEventListener('click', clearSearchHistory);
}

const cleanupBtn = document.getElementById('cleanupBtn');
if (cleanupBtn) {
    cleanupBtn.addEventListener('click', cleanupDatabase);
}

if (createCollectionBtn) {
    createCollectionBtn.addEventListener('click', createCollection);
}

if (browsePageSizeSelect) {
    browsePageSizeSelect.value = String(DEFAULT_BROWSE_PAGE_SIZE);
    browsePageSizeSelect.addEventListener('change', (e) => {
        browsePageSize = Number(e.target.value) || DEFAULT_BROWSE_PAGE_SIZE;
        updateBrowseView({ resetPage: true });
    });
}

if (browsePrevPageBtn) {
    browsePrevPageBtn.addEventListener('click', () => {
        if (browseCurrentPage > 1) {
            setBrowsePage(browseCurrentPage - 1);
            sortAndDisplayGames();
        }
    });
}

if (browseNextPageBtn) {
    browseNextPageBtn.addEventListener('click', () => {
        setBrowsePage(browseCurrentPage + 1);
        sortAndDisplayGames();
    });
}

sortBy.addEventListener('change', sortAndDisplayGames);

// Initialize
browseSearchHistory = readSearchHistory();
renderSearchHistory();
loadGames();
loadDownloadedGames();
refreshWorkspaceData();
updateStats();

// Refresh stats periodically
setInterval(updateStats, 5000);
setInterval(refreshWorkspaceData, 7000);
