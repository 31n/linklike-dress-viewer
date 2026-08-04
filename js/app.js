/* eslint-disable no-undef */
'use strict';

const API_BASE   = 'https://31n.github.io/linklike-dress-api/api/v1';
const IMAGE_BASE = 'https://31n.github.io/linklike-dress-api/images/characters';

/** 4方向の定義 */
const DIRECTIONS = [
  { key: 'front_left',  label: '前面・左' },
  { key: 'front_right', label: '前面・右' },
  { key: 'back_left',   label: '背面・左' },
  { key: 'back_right',  label: '背面・右' },
];

/** レアリティタグに対応するCSSクラス */
const RARITY_TAGS = new Set(['DR', 'LR', 'UR', 'mUR', 'SR', 'mSR', 'R', 'BR']);

/** 画像 URL を生成する */
function imageUrl(slug, costumeId, direction) {
  return `${IMAGE_BASE}/${slug}/costumes/${costumeId}/${direction}.png`;
}

// ===== DOM 参照 =====
const searchInput   = document.getElementById('search-input');
const searchClear   = document.getElementById('search-clear');
const resultCount   = document.getElementById('result-count');
const resultsGrid   = document.getElementById('results-grid');
const stateEmpty    = document.getElementById('state-empty');
const stateLoading  = document.getElementById('state-loading');
const stateError    = document.getElementById('state-error');
const stateNoResults = document.getElementById('state-no-results');
const noResultsQuery = document.getElementById('no-results-query');
const modal         = document.getElementById('modal');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalClose    = document.getElementById('modal-close');
const modalCharName = document.getElementById('modal-character-name');
const modalCostName = document.getElementById('modal-costume-name');
const modalTags     = document.getElementById('modal-tags');
const modalImages   = document.getElementById('modal-images');

let fuse = null;
/** 現在モーダルに表示中の衣装 */
let activeCostume = null;

// ===== 状態管理 =====
function showState(id) {
  [stateEmpty, stateLoading, stateError, stateNoResults, resultsGrid].forEach(el => {
    el.classList.add('hidden');
  });
  if (id) document.getElementById(id).classList.remove('hidden');
}

// ===== 初期化 =====
async function init() {
  showState('state-loading');
  try {
    const res = await fetch(`${API_BASE}/search-index.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const allEntries = await res.json();

    /** キャラクター slug → aliases マップ */
    const charAliasMap = {};
    allEntries
      .filter(e => e.type === 'character')
      .forEach(c => { charAliasMap[c.slug] = c.aliases || []; });

    /** コスチュームエントリにキャラのエイリアスをマージ */
    const costumes = allEntries
      .filter(e => e.type === 'costume')
      .map(c => ({
        ...c,
        _charAliases: charAliasMap[c.characterSlug] || [],
      }));

    fuse = new Fuse(costumes, {
      keys: [
        { name: 'name',          weight: 3 },
        { name: 'characterName', weight: 2 },
        { name: 'tags',          weight: 1.5 },
        { name: 'aliases',       weight: 1 },
        { name: '_charAliases',  weight: 1 },
      ],
      threshold: 0.35,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });

    showState('state-empty');
  } catch (err) {
    console.error('[init]', err);
    showState('state-error');
  }
}

// ===== 検索 =====
const MAX_RESULTS = 60;

let debounceTimer = null;
function onSearchInput() {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  searchClear.classList.toggle('hidden', q === '');
  debounceTimer = setTimeout(() => runSearch(q), 250);
}

function runSearch(q) {
  if (!fuse) return;

  if (q === '') {
    resultCount.classList.add('hidden');
    showState('state-empty');
    return;
  }

  const raw = fuse.search(q);
  const items = raw.slice(0, MAX_RESULTS).map(r => r.item);

  if (items.length === 0) {
    resultCount.classList.add('hidden');
    noResultsQuery.textContent = q;
    showState('state-no-results');
    return;
  }

  resultCount.textContent = `${raw.length} 件中 ${items.length} 件を表示`;
  resultCount.classList.remove('hidden');

  renderResults(items);
  showState(null);
  resultsGrid.classList.remove('hidden');
}

// ===== 結果レンダリング =====
function renderResults(costumes) {
  resultsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  costumes.forEach(c => fragment.appendChild(createCard(c)));
  resultsGrid.appendChild(fragment);
}

function createCard(costume) {
  const card = document.createElement('article');
  card.className = 'costume-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `${costume.characterName}の衣装: ${costume.name}`);

  // サムネイル（front_left）
  const thumb = document.createElement('div');
  thumb.className = 'card-thumb';
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.alt = `${costume.name} - front_left`;
  img.src = imageUrl(costume.characterSlug, costume.costumeId, 'front_left');
  img.onerror = function () {
    this.parentElement.innerHTML = '<span class="no-image">No Image</span>';
  };
  thumb.appendChild(img);

  // 情報エリア
  const body = document.createElement('div');
  body.className = 'card-body';

  const charEl = document.createElement('p');
  charEl.className = 'card-character';
  charEl.textContent = costume.characterName;

  const nameEl = document.createElement('p');
  nameEl.className = 'card-name';
  nameEl.textContent = costume.name;

  const tagsEl = renderTags(costume.tags, 'card-tags');

  body.append(charEl, nameEl, tagsEl);
  card.append(thumb, body);

  // クリック＆キーボード
  card.addEventListener('click', () => openModal(costume));
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(costume); }
  });

  return card;
}

function renderTags(tags, containerClass) {
  const el = document.createElement('div');
  el.className = containerClass;
  (tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.textContent = tag;
    span.className = RARITY_TAGS.has(tag) ? `tag tag-${tag}` : 'tag tag-cond';
    el.appendChild(span);
  });
  return el;
}

// ===== モーダル =====
function openModal(costume) {
  activeCostume = costume;
  modalCharName.textContent = costume.characterName;
  modalCostName.textContent = costume.name;

  // タグ
  modalTags.innerHTML = '';
  (costume.tags || []).forEach(tag => {
    const span = document.createElement('span');
    span.textContent = tag;
    span.className = RARITY_TAGS.has(tag) ? `tag tag-${tag}` : 'tag tag-cond';
    modalTags.appendChild(span);
  });

  // 画像リセット
  modalImages.innerHTML = '<div class="image-loading"><div class="spinner"></div><p>画像を読み込み中...</p></div>';

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  modalClose.focus();

  loadModalImages(costume);
}

function loadModalImages(costume) {
  const { characterSlug, costumeId } = costume;
  const items = [];
  let pending = DIRECTIONS.length;

  DIRECTIONS.forEach((dir, idx) => {
    const item = document.createElement('div');
    item.className = 'image-item';
    items[idx] = item;

    const imgEl = document.createElement('img');
    imgEl.alt = `${costume.name} - ${dir.label}`;
    imgEl.loading = 'lazy';

    const label = document.createElement('p');
    label.className = 'image-label';
    label.textContent = dir.label;

    imgEl.onerror = function () {
      const placeholder = document.createElement('div');
      placeholder.className = 'img-error';
      placeholder.textContent = '画像なし';
      this.replaceWith(placeholder);
      tryFinish();
    };
    imgEl.onload = tryFinish;

    item.append(imgEl, label);
    // src を設定するのは append 後にする（FireFox の onload 即時発火を防ぐ）
    imgEl.src = imageUrl(characterSlug, costumeId, dir.key);
  });

  function tryFinish() {
    pending--;
    if (pending <= 0) {
      modalImages.innerHTML = '';
      items.forEach(item => modalImages.appendChild(item));
    }
  }
}

function closeModal() {
  modal.classList.add('hidden');
  document.body.style.overflow = '';
  activeCostume = null;
}

// ===== イベント =====
searchInput.addEventListener('input', onSearchInput);

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchInput.focus();
  onSearchInput();
});

document.querySelectorAll('.hint-tag').forEach(btn => {
  btn.addEventListener('click', () => {
    searchInput.value = btn.dataset.query;
    searchInput.dispatchEvent(new Event('input'));
    searchInput.focus();
  });
});

modalClose.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', closeModal);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
});

// ===== 起動 =====
init();
