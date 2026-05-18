// 防御性补丁：如果 translator.js 未加载，提供一个原样返回的函数
if (typeof window.translateTech !== 'function') {
    window.translateTech = function (text) { return text; };
}

// ========== 全局状态 ==========
let masterModelList = [];
let currentFilterType = 'family';
let currentFamilyValue = '';
let currentGenValue = '';
let selectedModels = [];
let menuCounter = 0;
let currentDeviceParts = null;
let favorites = JSON.parse(localStorage.getItem('tp_favs') || '[]');
const loadedFiles = new Set();
const partsCache = {};
let MAX_CONCURRENT = 6;
let secretTipsEnabled = false;
let lastEnterTime = 0;

let currentPage = 'detail';
let compareModels = [];
let comparePending = true;
let currentModelData = null;

// 全局随机语录缓存
let globalTricksList = [];
let currentTrickText = '';

// 文章阅览相关
let articlesList = [];
let articlesFilteredList = [];
let currentFamilyFilter = '';
let currentSearchKeyword = '';

// 不浏览旧机型
let hideLegacyModels = localStorage.getItem('tp_hide_legacy') === 'true';

// 最近浏览记录（最多20条）
let recentModels = JSON.parse(localStorage.getItem('tp_recent') || '[]');
const MAX_RECENT = 20;

// 视图模式
let favoritesViewMode = localStorage.getItem('favorites_view_mode') || 'grid';
let recentViewMode = localStorage.getItem('recent_view_mode') || 'grid';

// ========== 协议检测 ==========
(function () {
    try {
        const p = performance.getEntriesByType('navigation')[0]?.nextHopProtocol;
        if (p === 'h2' || p === 'h3') MAX_CONCURRENT = 255;
    } catch (e) { }
})();

// ========== DOM 快捷选择 ==========
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const $display = $('#specDisplay');
const $favCount = $('#favCount');
const $familySel = $('#familySelect');
const $genSel = $('#generationSelect');
const $familyBtn = $('#filterFamilyBtn');
const $genBtn = $('#filterGenBtn');
const $searchInput = $('#searchModalInput');
const $searchResults = $('#searchModalResults');
const $mobileBtn = $('#mobileMenuBtn');
const $overlay = $('#sidebarOverlayBg');
const $compareModalBody = $('#compareModalBody');
const $fruModalBody = $('#fruModalBody');

const $detailPage = $('#detailPage');
const $comparePage = $('#comparePage');
const $comparePageSearch = $('#comparePageSearch');
const $comparePageGrid = $('#comparePageGrid');
const $comparePageResult = $('#comparePageResult');
const $sidebarCompare = $('#sidebarCompare');
const $favoritesPage = $('#favoritesPage');
const $favoritesPageGrid = $('#favoritesPageGrid');
const $favoritesPageSubtitle = $('#favoritesPageSubtitle');

// 设置面板
const $settingsBtn = $('#settingsBtn');
const $settingsOverlay = $('#settingsOverlay');
const $settingsThemeToggle = $('#settingsThemeToggle');
const $translateToggle = $('#settingsTranslateToggle');
const themeColorPicker = $('#themeColorPicker');

// 型号选择面板
const $modelPanel = $('#modelSelectOverlay');
const $modelPanelSearch = $('#modelPanelSearch');
const $modelPanelList = $('#modelPanelList');
const $panelFamilyBtn = $('#panelFilterFamilyBtn');
const $panelGenBtn = $('#panelFilterGenBtn');
const $panelFamilySel = $('#panelFamilySelect');
const $panelGenerationSel = $('#panelGenerationSelect');
const $panelResetBtn = $('#panelResetFilterBtn');

// 底部语录栏元素和背景图
const $globalTrickBar = $('#globalTrickBar');
const $globalTrickText = $('#globalTrickText');
const $refreshTrickBtn = $('#refreshTrickBtn');
const $refreshBgBtn = $('#refreshBgBtn');
const $globalHomeBg = $('#globalHomeBg');

// ========== 工具函数 ==========
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// 获取过滤后的机型列表（根据“不浏览旧机型”设置）
function getFilteredModelList() {
    if (!hideLegacyModels) return masterModelList;
    return masterModelList.filter(model => {
        const gen = (model.model_generation || '');
        return !gen.toLowerCase().includes('legacy');
    });
}

// 刷新所有依赖机型列表的界面
function refreshAllModelLists() {
    populateFilters();
    if ($modelPanel && $modelPanel.classList.contains('show')) {
        renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : '');
    }
    if (currentPage === 'compare') {
        renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    }
    if (currentPage === 'favorites') {
        renderFavoritesPage();
    }
    if (currentPage === 'recent') {
        renderRecentPage();
    }
    if (currentPage === 'detail' && $display && $display.querySelector('.welcome-page')) {
        const statsSpan = $display.querySelector('.welcome-stats span');
        if (statsSpan) statsSpan.textContent = getFilteredModelList().length;
    }
    updateFilterSummary();
}

// ========== 最近浏览相关 ==========
function addToRecent(modelName) {
    recentModels = recentModels.filter(name => name !== modelName);
    recentModels.unshift(modelName);
    if (recentModels.length > MAX_RECENT) recentModels.pop();
    localStorage.setItem('tp_recent', JSON.stringify(recentModels));
    const recentCount = document.getElementById('recentCount');
    if (recentCount) recentCount.textContent = recentModels.length;
    if (currentPage === 'recent') renderRecentPage();
}

function removeFromRecent(modelName) {
    recentModels = recentModels.filter(name => name !== modelName);
    localStorage.setItem('tp_recent', JSON.stringify(recentModels));
    const recentCount = document.getElementById('recentCount');
    if (recentCount) recentCount.textContent = recentModels.length;
    renderRecentPage();
}

function clearAllRecent() {
    if (confirm('确定要清空所有浏览记录吗？')) {
        recentModels = [];
        localStorage.setItem('tp_recent', JSON.stringify(recentModels));
        const recentCount = document.getElementById('recentCount');
        if (recentCount) recentCount.textContent = 0;
        renderRecentPage();
    }
}

function renderRecentPage() {
    const container = document.getElementById('recentPageGrid');
    const subtitle = document.getElementById('recentPageSubtitle');
    if (!container) return;
    
    const filteredList = getFilteredModelList();
    const recentItems = recentModels.filter(name => filteredList.some(m => m.model_name === name));
    
    if (subtitle) subtitle.textContent = `最近浏览 ${recentItems.length} 个型号 (最多${MAX_RECENT}条)`;
    
    if (recentItems.length === 0) {
        container.innerHTML = '<div class="loading-text" style="grid-column:1/-1;">暂无浏览记录</div>';
        return;
    }
    
    let html = '';
    for (const name of recentItems) {
        const model = filteredList.find(m => m.model_name === name);
        if (!model) continue;
        html += `
            <div class="compare-card" onclick="selectRecentModel('${model.model_name.replace(/'/g, "\\'")}')">
                <div class="compare-card-info">
                    <div class="compare-card-name">${escapeHtml(model.model_name)}</div>
                    <div class="compare-card-meta">
                        <span>${escapeHtml(model.model_family || '系列未知')}</span>
                        <span class="compare-part-arch" style="margin-left:6px;">${escapeHtml(model.model_generation || '代数未知')}</span>
                    </div>
                </div>
                <button class="favorite-remove" onclick="event.stopPropagation(); removeFromRecent('${model.model_name.replace(/'/g, "\\'")}')" title="从记录中移除">×</button>
            </div>
        `;
    }
    container.innerHTML = html;
    
    // 应用视图模式
    if (recentViewMode === 'list') {
        container.classList.add('list-view');
    } else {
        container.classList.remove('list-view');
    }
}

window.selectRecentModel = async function(name) {
    let model = masterModelList.find(m => m.model_name === name);
    if (model && model._isLight) {
        await loadModelFile(model.filename);
        model = masterModelList.find(m => m.model_name === name);
    }
    if (model) {
        if (currentPage !== 'detail') showDetailPage();
        renderSpecs(model);
    }
};

window.showRecentPage = function() {
    currentPage = 'recent';
    
    // 隐藏所有其他页面
    document.getElementById('detailPage').classList.add('hidden');
    document.getElementById('comparePage').classList.remove('active');
    document.getElementById('favoritesPage').classList.remove('active');
    document.getElementById('generatorPage').classList.remove('active');
    document.getElementById('articlesListPage').style.display = 'none';
    document.getElementById('articleDetailPage').style.display = 'none';
    
    // 显示最近浏览页
    const recentPage = document.getElementById('recentPage');
    if (recentPage) recentPage.style.display = 'block';
    
    setActiveSidebarItem('sidebarRecent');
    setHomeOnlyElementsVisible(false);
    renderRecentPage();
    initViewToggle('recentPage', 'recent_view_mode', renderRecentPage);
};
// ========== 视图切换 ==========
function initViewToggle(containerId, storageKey, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const gridBtn = container.querySelector('.view-toggle-btn[data-view="grid"]');
    const listBtn = container.querySelector('.view-toggle-btn[data-view="list"]');
    if (!gridBtn || !listBtn) return;
    
    const savedMode = localStorage.getItem(storageKey) || 'grid';
    
    function setView(mode) {
        const targetGrid = document.getElementById(containerId === 'favoritesPage' ? 'favoritesPageGrid' : 'recentPageGrid');
        if (!targetGrid) return;
        
        if (mode === 'list') {
            targetGrid.classList.add('list-view');
            gridBtn.classList.remove('active');
            listBtn.classList.add('active');
        } else {
            targetGrid.classList.remove('list-view');
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        }
        localStorage.setItem(storageKey, mode);
        if (storageKey === 'favorites_view_mode') favoritesViewMode = mode;
        if (storageKey === 'recent_view_mode') recentViewMode = mode;
        if (callback) callback();
    }
    
    // 移除旧监听器，避免重复绑定
    const newGridBtn = gridBtn.cloneNode(true);
    const newListBtn = listBtn.cloneNode(true);
    gridBtn.parentNode.replaceChild(newGridBtn, gridBtn);
    listBtn.parentNode.replaceChild(newListBtn, listBtn);
    
    newGridBtn.addEventListener('click', () => setView('grid'));
    newListBtn.addEventListener('click', () => setView('list'));
    
    setView(savedMode);
}

// ========== 全局语录相关 ==========
async function loadTricksAndDisplay() {
    try {
        const resp = await fetch('modeldata/tricks.json');
        if (resp.ok) {
            const tricks = await resp.json();
            if (Array.isArray(tricks) && tricks.length > 0) {
                globalTricksList = tricks;
                refreshRandomTrick();
            } else {
                $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
            }
        } else {
            $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
        }
    } catch (e) {
        $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
    }
}

function refreshRandomTrick() {
    if (globalTricksList.length > 0) {
        const randomIndex = Math.floor(Math.random() * globalTricksList.length);
        currentTrickText = globalTricksList[randomIndex];
        $globalTrickText.textContent = currentTrickText;
    } else {
        $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
    }
}

function refreshHomeBackground() {
    if (!$globalHomeBg) return;
    const randomIndex = Math.floor(Math.random() * 9) + 1;
    const bgUrl = `modeldata/model-images/startpage/${randomIndex}.png`;
    $globalHomeBg.src = bgUrl;
    $globalHomeBg.onerror = () => {
        $globalHomeBg.style.display = 'none';
    };
    if (currentPage === 'detail' && !document.querySelector('.nav-item.active')?.dataset?.modelId) {
        $globalHomeBg.style.display = 'block';
    }
}

function setHomeOnlyElementsVisible(visible) {
    if ($globalHomeBg) {
        $globalHomeBg.style.display = visible ? 'block' : 'none';
    }
    if ($globalTrickBar) {
        $globalTrickBar.style.display = visible ? 'flex' : 'none';
    }
}

function initHomeBackgroundImage() {
    if (!$globalHomeBg) return;
    const randomIndex = Math.floor(Math.random() * 9) + 1;
    const bgUrl = `modeldata/model-images/startpage/${randomIndex}.png`;
    $globalHomeBg.src = bgUrl;
    $globalHomeBg.alt = 'ThinkPad 装饰背景';
    $globalHomeBg.onerror = () => {
        $globalHomeBg.style.display = 'none';
    };
    $globalHomeBg.onload = () => {
        if (currentPage === 'detail' && !document.querySelector('.nav-item.active')?.dataset?.modelId) {
            setHomeOnlyElementsVisible(true);
        }
    };
}

function openImageModal(imgUrl) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
        modalImg.src = imgUrl;
        modal.classList.add('show');
    }
}
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) modal.classList.remove('show');
}

// ========== 侧边栏 ==========
function closeSidebar() { document.body.classList.add('sidebar-hidden'); }
function toggleSidebar() { document.body.classList.toggle('sidebar-hidden'); }
if ($mobileBtn) $mobileBtn.addEventListener('click', toggleSidebar);
if ($overlay) $overlay.addEventListener('click', closeSidebar);

function setActiveSidebarItem(id) {
    $$('.sidebar-item').forEach(el => el.classList.remove('active'));
    if ($sidebarCompare) $sidebarCompare.classList.remove('compare-active');
    if (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }
}

function handleResponsive() {
    if (window.innerWidth <= 900) {
        document.body.classList.add('sidebar-hidden');
        if ($mobileBtn) $mobileBtn.style.display = 'flex';
    } else {
        document.body.classList.remove('sidebar-hidden');
        if ($mobileBtn) $mobileBtn.style.display = 'none';
    }
}
window.addEventListener('resize', handleResponsive);
handleResponsive();

// ========== 主题 ==========
function applyTheme(isLight) {
    document.body.classList.toggle('light-mode', isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if ($settingsThemeToggle) $settingsThemeToggle.checked = !isLight;
    const titleImg = document.getElementById('sidebarTitleImg');
    if (titleImg) {
        titleImg.src = isLight ? 'title-light.png' : 'title.png';
    }
}
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') applyTheme(true);
else if (savedTheme === 'dark') applyTheme(false);
else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(!prefersDark);
}
if ($settingsThemeToggle) {
    $settingsThemeToggle.addEventListener('change', (e) => applyTheme(!e.target.checked));
}
const savedThemeColor = localStorage.getItem('themeColor') || 'red';
document.body.classList.add(`theme-${savedThemeColor}`);
if (themeColorPicker) {
    const activeSwatch = themeColorPicker.querySelector(`[data-color="${savedThemeColor}"]`);
    if (activeSwatch) activeSwatch.classList.add('active');
    themeColorPicker.addEventListener('click', (e) => {
        const swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        const newColor = swatch.dataset.color;
        document.body.classList.forEach(cls => { if (cls.startsWith('theme-')) document.body.classList.remove(cls); });
        document.body.classList.add(`theme-${newColor}`);
        localStorage.setItem('themeColor', newColor);
        themeColorPicker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
    });
}
if ($translateToggle) {
    $translateToggle.checked = window.getTranslationEnabled ? window.getTranslationEnabled() : false;
    $translateToggle.addEventListener('change', (e) => {
        if (window.setTranslationEnabled) window.setTranslationEnabled(e.target.checked);
        if (currentModelData) renderSpecs(currentModelData);
        else if (currentPage === 'detail') {
            const activeName = document.querySelector('.nav-item.active')?.dataset?.modelId;
            if (activeName) {
                const model = masterModelList.find(m => m.model_name === activeName);
                if (model) renderSpecs(model);
            }
        }
    });
}
window.openSettingsPanel = function () { if ($settingsOverlay) $settingsOverlay.classList.add('show'); };
window.closeSettingsPanel = function () { if ($settingsOverlay) $settingsOverlay.classList.remove('show'); };
if ($settingsBtn) $settingsBtn.addEventListener('click', openSettingsPanel);

// ========== 页面切换 ==========
window.showDetailPage = function () {
    currentPage = 'detail';
    
    if ($detailPage) $detailPage.classList.remove('hidden');
    if ($comparePage) $comparePage.classList.remove('active');
    if ($favoritesPage) $favoritesPage.classList.remove('active');
    if (document.getElementById('generatorPage')) document.getElementById('generatorPage').classList.remove('active');
    if (document.getElementById('recentPage')) document.getElementById('recentPage').style.display = 'none';
    
    const modelPanel = document.getElementById('modelSelectOverlay');
    if (modelPanel) modelPanel.classList.remove('show');
    const settingsPanel = document.getElementById('settingsOverlay');
    if (settingsPanel) settingsPanel.classList.remove('show');
    
    const articlesListPage = document.getElementById('articlesListPage');
    const articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    
    setActiveSidebarItem('sidebarHome');
    
    if ($display) {
        $display.innerHTML = `
            <div class="welcome-page">
                <div class="welcome-icon">💻</div>
                <div class="welcome-title">ThinkPad Specs</div>
                <div class="welcome-subtitle">ThinkPad 型号规格查询工具</div>
                <div class="welcome-actions">
                    <button class="btn btn-accent" onclick="openModelPanel()">选择型号</button>
                    <button class="btn" onclick="showComparePage()">型号对比</button>
                    <button class="btn" onclick="showFavoritesPage()">我的收藏</button>
                </div>
                <div class="welcome-stats">
                    已收录 <span>${getFilteredModelList().length}</span> 个型号
                </div>
            </div>`;
    }
    
    currentModelData = null;
    const activeModelItem = document.querySelector('.nav-item.active');
    if (activeModelItem) activeModelItem.classList.remove('active');
    
    setHomeOnlyElementsVisible(true);
};
window.showHome = function () { showDetailPage(); };

window.showComparePage = function () {
    currentPage = 'compare';
    if ($detailPage) $detailPage.classList.add('hidden');
    if ($comparePage) $comparePage.classList.add('active');
    if ($favoritesPage) $favoritesPage.classList.remove('active');
    if (document.getElementById('generatorPage')) document.getElementById('generatorPage').classList.remove('active');
    if (document.getElementById('recentPage')) document.getElementById('recentPage').style.display = 'none';
    
    const articlesListPage = document.getElementById('articlesListPage');
    const articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    
    setActiveSidebarItem(null);
    if ($sidebarCompare) $sidebarCompare.classList.add('compare-active');
    setHomeOnlyElementsVisible(false);
    closeSearchModal();
    
    initCompareFilters();
    if (comparePending) {
        if ($comparePageResult) $comparePageResult.innerHTML = '';
        renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    }
    updateCompareActionBtn();
};
if ($sidebarCompare) $sidebarCompare.addEventListener('click', () => { if (currentPage === 'compare') return; showComparePage(); });

window.showFavoritesPage = function () {
    currentPage = 'favorites';
    if ($detailPage) $detailPage.classList.add('hidden');
    if ($comparePage) $comparePage.classList.remove('active');
    if ($favoritesPage) $favoritesPage.classList.add('active');
    if (document.getElementById('generatorPage')) document.getElementById('generatorPage').classList.remove('active');
    if (document.getElementById('recentPage')) document.getElementById('recentPage').style.display = 'none';
    
    const articlesListPage = document.getElementById('articlesListPage');
    const articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    
    setActiveSidebarItem('sidebarFavorites');
    setHomeOnlyElementsVisible(false);
    closeSearchModal();
    renderFavoritesPage();
    initViewToggle('favoritesPage', 'favorites_view_mode', renderFavoritesPage);
};

window.showGeneratorPage = function () {
    currentPage = 'generator';
    if ($detailPage) $detailPage.classList.add('hidden');
    if ($comparePage) $comparePage.classList.remove('active');
    if ($favoritesPage) $favoritesPage.classList.remove('active');
    if (document.getElementById('generatorPage')) document.getElementById('generatorPage').classList.add('active');
    if (document.getElementById('recentPage')) document.getElementById('recentPage').style.display = 'none';
    
    const articlesListPage = document.getElementById('articlesListPage');
    const articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    
    setActiveSidebarItem('sidebarGenerator');
    setHomeOnlyElementsVisible(false);
    closeSearchModal();
    if (window.initGenerator) {
        window.initGenerator();
    }
};

// ========== 文章阅览 ==========
async function loadArticlesIndex() {
    try {
        const resp = await fetch('modeldata/articles/articles.json');
        if (!resp.ok) throw new Error('无法加载文章索引');
        articlesList = await resp.json();
        initArticlesFilters();
        applyArticlesFilters();
    } catch (e) {
        console.error('加载文章索引失败:', e);
        const container = document.getElementById('articlesListContainer');
        if (container) container.innerHTML = '<div class="loading-text">加载文章列表失败</div>';
    }
}

function initArticlesFilters() {
    const familySelect = document.getElementById('articlesFamilyFilter');
    if (!familySelect) return;
    const families = [...new Set(articlesList.map(a => a.family).filter(Boolean))].sort();
    familySelect.innerHTML = '<option value="">全部分类</option>';
    families.forEach(f => {
        const option = document.createElement('option');
        option.value = f;
        option.textContent = f;
        familySelect.appendChild(option);
    });
    familySelect.addEventListener('change', (e) => {
        currentFamilyFilter = e.target.value;
        applyArticlesFilters();
    });
    const searchInput = document.getElementById('articlesSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearchKeyword = e.target.value.trim().toLowerCase();
            applyArticlesFilters();
        });
    }
    const resetBtn = document.getElementById('articlesResetFilterBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (familySelect) familySelect.value = '';
            if (searchInput) searchInput.value = '';
            currentFamilyFilter = '';
            currentSearchKeyword = '';
            applyArticlesFilters();
        });
    }
}

function applyArticlesFilters() {
    let filtered = [...articlesList];
    if (currentFamilyFilter) {
        filtered = filtered.filter(a => a.family === currentFamilyFilter);
    }
    if (currentSearchKeyword) {
        filtered = filtered.filter(a =>
            (a.title && a.title.toLowerCase().includes(currentSearchKeyword)) ||
            (a.description && a.description.toLowerCase().includes(currentSearchKeyword))
        );
    }
    articlesFilteredList = filtered;
    renderArticlesList();
}

function renderArticlesList() {
    const container = document.getElementById('articlesListContainer');
    if (!container) return;
    if (!articlesFilteredList.length) {
        container.innerHTML = '<div class="loading-text">没有找到匹配的文章</div>';
        return;
    }
    let html = '';
    for (const article of articlesFilteredList) {
        html += `
            <div class="article-card" onclick="openArticle('${escapeHtml(article.file)}')">
                <h3>${escapeHtml(article.title)}</h3>
                <div class="article-family">${escapeHtml(article.family)}</div>
                <div class="article-desc">${escapeHtml(article.description)}</div>
            </div>
        `;
    }
    container.innerHTML = html;
}

async function openArticle(fileId) {
    const markdownPath = `modeldata/articles/${fileId}/${fileId}.md`;
    try {
        const resp = await fetch(markdownPath);
        if (!resp.ok) throw new Error(`无法加载文章: ${markdownPath}`);
        const markdownText = await resp.text();
        const baseDir = `modeldata/articles/${fileId}/`;
        const processedMarkdown = markdownText.replace(/!\[([^\]]*)\]\((?!https?:\/\/|\/)([^)]+)\)/g, (match, alt, src) => {
            const newSrc = baseDir + src;
            return `![${alt}](${newSrc})`;
        });
        const htmlContent = marked.parse(processedMarkdown);
        const articleMeta = articlesList.find(a => a.file === fileId);
        document.getElementById('articleDetailTitle').innerHTML = articleMeta ? escapeHtml(articleMeta.title) : fileId;
        document.getElementById('articleDetailMeta').innerHTML = `
            <span>分类：${escapeHtml(articleMeta?.family || '未分类')}</span>
            <span style="margin-left: 20px;">描述：${escapeHtml(articleMeta?.description || '')}</span>
        `;
        document.getElementById('articleContent').innerHTML = htmlContent;
        
        const articleImages = document.querySelectorAll('#articleContent img');
        articleImages.forEach(img => {
            img.style.cursor = 'pointer';
            img.onclick = () => openImageModal(img.src);
        });
        
        // 切换页面显示：隐藏所有其他页面，显示文章详情
        document.getElementById('recentPage').style.display = 'none';
        document.getElementById('articlesListPage').style.display = 'none';
        document.getElementById('articleDetailPage').style.display = 'block';
        document.getElementById('detailPage').classList.add('hidden');
        document.getElementById('comparePage').classList.remove('active');
        document.getElementById('favoritesPage').classList.remove('active');
        document.getElementById('generatorPage').classList.remove('active');
        
        document.querySelector('main').scrollTop = 0;
    } catch (e) {
        console.error('加载文章失败:', e);
        alert('文章加载失败，请检查路径或网络');
    }
}

window.showArticlesPage = function() {
    currentPage = 'articles';
    
    // 隐藏所有其他页面容器
    document.getElementById('detailPage').classList.add('hidden');
    document.getElementById('comparePage').classList.remove('active');
    document.getElementById('favoritesPage').classList.remove('active');
    document.getElementById('generatorPage').classList.remove('active');
    document.getElementById('recentPage').style.display = 'none';
    
    // 显示文章页面
    document.getElementById('articlesListPage').style.display = 'block';
    document.getElementById('articleDetailPage').style.display = 'none';
    
    setActiveSidebarItem('sidebarArticles');
    if (typeof setHomeOnlyElementsVisible === 'function') setHomeOnlyElementsVisible(false);
    
    const familySelect = document.getElementById('articlesFamilyFilter');
    const searchInput = document.getElementById('articlesSearchInput');
    if (familySelect) familySelect.value = '';
    if (searchInput) searchInput.value = '';
    currentFamilyFilter = '';
    currentSearchKeyword = '';
    
    if (articlesList.length === 0) {
        loadArticlesIndex();
    } else {
        applyArticlesFilters();
    }
};

// ========== 型号选择覆盖面板 ==========
window.openModelPanel = function () {
    if (!$modelPanel) return;
    populatePanelFilters(); syncPanelFilters();
    $modelPanel.classList.add('show');
    $modelPanelSearch.value = '';
    renderModelPanelList('');
    $modelPanelSearch.focus();
};
window.closeModelPanel = function () { if ($modelPanel) $modelPanel.classList.remove('show'); };
function populatePanelFilters() {
    if (!$panelFamilySel || !$panelGenerationSel) return;
    const filteredList = getFilteredModelList();
    const families = [...new Set(filteredList.map(m => m.model_family).filter(Boolean))].sort();
    $panelFamilySel.innerHTML = '<option value="">全部系列</option>';
    families.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; $panelFamilySel.appendChild(o); });
    const gens = [...new Set(filteredList.map(m => m.model_generation).filter(Boolean))].sort((a, b) => {
        const getPriority = (s) => { if (s.length === 3) return 1; if (s.length === 4) return 2; if (s.toLowerCase().startsWith('gen')) return 3; return 4; };
        return getPriority(a) - getPriority(b) || a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    $panelGenerationSel.innerHTML = '<option value="">全部代数</option>';
    gens.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; $panelGenerationSel.appendChild(o); });
}
function syncPanelFilters() {
    if ($panelFamilyBtn && $panelGenBtn) { $panelFamilyBtn.classList.toggle('filter-active', currentFilterType === 'family'); $panelGenBtn.classList.toggle('filter-active', currentFilterType === 'generation'); }
    if ($panelFamilySel) $panelFamilySel.style.display = currentFilterType === 'family' ? 'block' : 'none';
    if ($panelGenerationSel) $panelGenerationSel.style.display = currentFilterType === 'generation' ? 'block' : 'none';
    if ($panelFamilySel) $panelFamilySel.value = currentFamilyValue;
    if ($panelGenerationSel) $panelGenerationSel.value = currentGenValue;
}
function getPanelFiltered() {
    let list = getFilteredModelList();
    if (currentFilterType === 'family' && currentFamilyValue) {
        list = list.filter(m => m.model_family === currentFamilyValue);
    } else if (currentFilterType === 'generation' && currentGenValue) {
        list = list.filter(m => m.model_generation === currentGenValue);
    }
    return list;
}
function renderModelPanelList(query) {
    if (!$modelPanelList) return;
    const baseList = getPanelFiltered();
    const filtered = query ? baseList.filter(m => m.model_name.toLowerCase().includes(query)) : baseList;
    if (filtered.length === 0) {
        $modelPanelList.innerHTML = '<div class="loading-text">未找到匹配的型号</div>';
        return;
    }
    $modelPanelList.innerHTML = filtered.map(m => `<div class="nav-item" onclick="selectModelFromPanel('${m.model_name.replace(/'/g, "\\'")}')">${m.model_name}</div>`).join('');
}
window.selectModelFromPanel = async function (name) {
    closeModelPanel();
    syncFiltersFromPanel();
    let model = masterModelList.find(m => m.model_name === name);
    if (model && model._isLight) { await loadModelFile(model.filename); model = masterModelList.find(m => m.model_name === name); }
    if (model) { if (currentPage !== 'detail') showDetailPage(); renderSpecs(model); }
};
function syncFiltersFromPanel() {
    if ($panelFamilySel) currentFamilyValue = $panelFamilySel.value;
    if ($panelGenerationSel) currentGenValue = $panelGenerationSel.value;
    if ($familySel && $panelFamilySel) $familySel.value = currentFamilyValue;
    if ($genSel && $panelGenerationSel) $genSel.value = currentGenValue;
}
if ($modelPanelSearch) $modelPanelSearch.addEventListener('input', e => { renderModelPanelList(e.target.value.toLowerCase()); });
if ($panelFamilyBtn) $panelFamilyBtn.addEventListener('click', () => { currentFilterType = 'family'; $panelFamilyBtn.classList.add('filter-active'); if ($panelGenBtn) $panelGenBtn.classList.remove('filter-active'); if ($panelFamilySel) $panelFamilySel.style.display = 'block'; if ($panelGenerationSel) $panelGenerationSel.style.display = 'none'; renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : ''); });
if ($panelGenBtn) $panelGenBtn.addEventListener('click', () => { currentFilterType = 'generation'; $panelGenBtn.classList.add('filter-active'); if ($panelFamilyBtn) $panelFamilyBtn.classList.remove('filter-active'); if ($panelGenerationSel) $panelGenerationSel.style.display = 'block'; if ($panelFamilySel) $panelFamilySel.style.display = 'none'; renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : ''); });
if ($panelFamilySel) $panelFamilySel.addEventListener('change', e => { currentFamilyValue = e.target.value; renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : ''); });
if ($panelGenerationSel) $panelGenerationSel.addEventListener('change', e => { currentGenValue = e.target.value; renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : ''); });
if ($panelResetBtn) $panelResetBtn.addEventListener('click', () => { if ($panelFamilySel) $panelFamilySel.value = ''; if ($panelGenerationSel) $panelGenerationSel.value = ''; currentFamilyValue = ''; currentGenValue = ''; renderModelPanelList(''); });

// ========== 数据加载 ==========
async function loadModelFile(filename) {
    if (loadedFiles.has(filename)) return;
    try {
        const resp = await fetch(`modeldata/${filename}`);
        if (!resp.ok) throw new Error(`无法加载: ${filename}`);
        const json = await resp.json();
        let items = json.thinkpad_database || (Array.isArray(json) ? json : [json]);
        if (!Array.isArray(items)) items = [items];
        items.forEach(laptop => {
            if (!laptop.model_name) return;
            const full = { filename, model_family: laptop.model_family || '未指定系列', model_generation: laptop.model_generation || '未指定代数', _isLight: false, ...laptop };
            const idx = masterModelList.findIndex(m => m.model_name === full.model_name);
            if (idx >= 0) masterModelList[idx] = full; else masterModelList.push(full);
            if (laptop.nickname && typeof laptop.nickname === 'string' && laptop.nickname.trim() !== '') {
                const nick = { ...full, model_name: laptop.nickname.trim(), _isNickname: true, _originalName: laptop.model_name };
                if (laptop.nickfamily && typeof laptop.nickfamily === 'string' && laptop.nickfamily.trim() !== '') nick.model_family = laptop.nickfamily.trim();
                delete nick.addons;
                const nidx = masterModelList.findIndex(m => m.model_name === nick.model_name);
                if (nidx >= 0) masterModelList[nidx] = nick; else masterModelList.push(nick);
            }
        });
        loadedFiles.add(filename);
        populateFilters();
    } catch (e) { console.error('加载型号文件失败:', e); }
}

async function loadIndex() {
    try {
        const resp = await fetch('modeldata/index.json');
        if (!resp.ok) throw new Error('无法加载 index.json');
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('格式错误');
        masterModelList = data.map(item => ({ model_name: item.name, model_family: item.family || '未指定系列', model_generation: item.generation || '未指定代数', filename: item.file, _isLight: true }));
        data.forEach(item => {
            if (item.nickname && typeof item.nickname === 'string' && item.nickname.trim() !== '') {
                masterModelList.push({ model_name: item.nickname.trim(), model_family: item.nickfamily || item.family || '未指定系列', model_generation: item.generation || '未指定代数', filename: item.file, _isLight: true, _isNickname: true, _originalName: item.name });
            }
        });
        populateFilters();
        updateFavCount();
        updateWelcomeStats();
        
        const recentCount = document.getElementById('recentCount');
        if (recentCount) recentCount.textContent = recentModels.length;
        
        if ($display) {
            $display.innerHTML = `
                <div class="welcome-page">
                    <div class="welcome-icon">💻</div>
                    <div class="welcome-title">ThinkPad Specs</div>
                    <div class="welcome-subtitle">ThinkPad 型号规格查询工具</div>
                    <div class="welcome-actions">
                        <button class="btn btn-accent" onclick="openModelPanel()">选择型号</button>
                        <button class="btn" onclick="showComparePage()">型号对比</button>
                        <button class="btn" onclick="showFavoritesPage()">我的收藏</button>
                    </div>
                    <div class="welcome-stats">
                        已收录 <span>${getFilteredModelList().length}</span> 个型号
                    </div>
                </div>`;
        }
        await loadTricksAndDisplay();
        initHomeBackgroundImage();
        setHomeOnlyElementsVisible(true);
        
        // 初始化“不浏览旧机型”开关
        const hideLegacyToggle = document.getElementById('settingsHideLegacyToggle');
        if (hideLegacyToggle) {
            hideLegacyToggle.checked = hideLegacyModels;
            hideLegacyToggle.addEventListener('change', (e) => {
                hideLegacyModels = e.target.checked;
                localStorage.setItem('tp_hide_legacy', hideLegacyModels);
                refreshAllModelLists();
            });
        }
        
        // 清空最近浏览按钮
        const clearRecentBtn = document.getElementById('clearRecentBtn');
        if (clearRecentBtn) {
            clearRecentBtn.addEventListener('click', clearAllRecent);
        }
    } catch (e) { console.error('加载索引失败:', e); if ($display) $display.innerHTML = '<div class="loading-text">加载数据失败</div>'; }
}

function populateFilters() {
    const filteredList = getFilteredModelList();
    if ($familySel) {
        const families = [...new Set(filteredList.map(m => m.model_family).filter(Boolean))].sort();
        $familySel.innerHTML = '<option value="">全部系列</option>';
        families.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; $familySel.appendChild(o); });
    }
    if ($genSel) {
        const gens = [...new Set(filteredList.map(m => m.model_generation).filter(Boolean))].sort((a, b) => {
            const getPriority = (s) => { if (s.length === 3) return 1; if (s.length === 4) return 2; if (s.toLowerCase().startsWith('gen')) return 3; return 4; };
            return getPriority(a) - getPriority(b) || a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
        });
        $genSel.innerHTML = '<option value="">全部代数</option>';
        gens.forEach(g => { const o = document.createElement('option'); o.value = g; o.textContent = g; $genSel.appendChild(o); });
    }
}
function updateWelcomeStats() {
    const el = $('#welcomeModelCount');
    if (el) el.textContent = getFilteredModelList().length;
}
if ($familyBtn && $genBtn) {
    $familyBtn.addEventListener('click', () => { currentFilterType = 'family'; $familyBtn.classList.add('filter-active'); $genBtn.classList.remove('filter-active'); if ($familySel) $familySel.style.display = 'block'; if ($genSel) $genSel.style.display = 'none'; applyFilter(); });
    $genBtn.addEventListener('click', () => { currentFilterType = 'generation'; $genBtn.classList.add('filter-active'); $familyBtn.classList.remove('filter-active'); if ($genSel) $genSel.style.display = 'block'; if ($familySel) $familySel.style.display = 'none'; applyFilter(); });
}
if ($familySel) $familySel.addEventListener('change', e => { currentFamilyValue = e.target.value; applyFilter(); });
if ($genSel) $genSel.addEventListener('change', e => { currentGenValue = e.target.value; applyFilter(); });
const resetBtn = $('#resetFilterBtn');
if (resetBtn) resetBtn.addEventListener('click', () => { if ($familySel) $familySel.value = ''; if ($genSel) $genSel.value = ''; currentFamilyValue = ''; currentGenValue = ''; selectedModels = []; applyFilter(); });

window.toggleCard = function (el) { const card = el.closest('.card'); if (card) card.classList.toggle('folded'); };
window.menuTimers = {};
window.menuEnter = function (menuId) { if (window.menuTimers[menuId]) { clearTimeout(window.menuTimers[menuId]); delete window.menuTimers[menuId]; } const menu = document.getElementById(menuId); if (menu) menu.classList.remove('hidden'); };
window.menuLeave = function (menuId) { window.menuTimers[menuId] = setTimeout(() => { const menu = document.getElementById(menuId); if (menu) menu.classList.add('hidden'); delete window.menuTimers[menuId]; }, 150); };

window.closeFruModal = function () { const modal = $('#fruModal'); if (modal) modal.classList.remove('show'); };
function showFruModal(data) {
    if (!$fruModalBody) return;
    const frus = (data && (data.FRUs || data.frus || data.Frus)) || null;
    let html = '<div class="loading-text">无 FRU 信息</div>';
    if (frus) {
        let items = [];
        if (Array.isArray(frus)) items = frus.map(f => typeof f === 'object' ? Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('<br>') : String(f));
        else if (typeof frus === 'object') items = Object.entries(frus).map(([k, v]) => `${k}: ${v}`);
        else items = [String(frus)];
        html = items.map(t => `<div class="fru-item">${t}</div>`).join('');
    }
    html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
    $fruModalBody.innerHTML = html;
    const modal = $('#fruModal');
    if (modal) modal.classList.add('show');
}
window.showFruModalByPart = function (partData) { showFruModal(partData); };
window.showFruModalByPartId = function (partId) { if (!currentDeviceParts) return; const [type, index] = partId.split('_'); const part = currentDeviceParts[type]?.[parseInt(index)]; if (part) showFruModal(part.data); };

window.closeSearchModal = function () { const modal = $('#searchModal'); if (modal) modal.classList.remove('show'); };
window.openSearchModal = function () { const modal = $('#searchModal'); if (!modal) return; modal.classList.add('show'); if ($searchInput) { $searchInput.focus(); $searchInput.value = ''; } if ($searchResults) $searchResults.innerHTML = ''; };
if ($searchInput) {
    $searchInput.addEventListener('input', e => {
        if (!$searchResults) return;
        const q = e.target.value.toLowerCase();
        const results = getFilteredModelList().filter(m => m.model_name.toLowerCase().includes(q)).slice(0, 30);
        if (results.length === 0) $searchResults.innerHTML = '<div class="loading-text">未找到匹配的型号</div>';
        else {
            let html = results.map(m => `<div class="search-result" onclick="window.selectFromSearch('${m.model_name.replace(/'/g, "\\'")}')"><div class="name">${m.model_name}</div><div class="meta">${m.model_family || ''} · ${m.model_generation || ''}</div></div>`).join('');
            html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
            $searchResults.innerHTML = html;
        }
    });
    $searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const now = Date.now();
            if ($searchInput.value.trim() === '我也不知道写点啥') {
                if (now - lastEnterTime < 500) {
                    secretTipsEnabled = true;
                    const activeModelName = document.querySelector('.nav-item.active')?.dataset?.modelId;
                    if (activeModelName) {
                        const model = masterModelList.find(m => m.model_name === activeModelName);
                        if (model) renderSpecs(model);
                    }
                    closeSearchModal();
                    lastEnterTime = 0;
                } else lastEnterTime = now;
            } else lastEnterTime = 0;
        }
    });
}
window.selectFromSearch = async function (name) {
    let model = masterModelList.find(m => m.model_name === name);
    if (model && model._isLight) { await loadModelFile(model.filename); model = masterModelList.find(m => m.model_name === name); }
    if (model) { if (currentPage !== 'detail') showDetailPage(); renderSpecs(model); }
    closeSearchModal();
};
const searchModalEl = $('#searchModal');
if (searchModalEl) searchModalEl.addEventListener('click', function (e) { if (e.target === this) closeSearchModal(); });

window.closeCompareSelectModal = function () { const modal = $('#compareSelectModal'); if (modal) modal.classList.remove('show'); };
window.toggleSelectModel = function (name, checked) { const model = masterModelList.find(m => m.model_name === name); if (!model) return; if (checked) { if (!selectedModels.some(m => m.model_name === name)) selectedModels.push(model); } else selectedModels = selectedModels.filter(m => m.model_name !== name); };
window.clearSelectedModels = function () { selectedModels = []; };
function resetComparePage() { compareModels = []; comparePending = true; selectedModels = []; if ($comparePageSearch) $comparePageSearch.value = ''; if ($comparePageResult) $comparePageResult.innerHTML = ''; renderComparePageGrid(''); updateCompareActionBtn(); }
function updateCompareActionBtn() { const btn = $('#runCompareBtn'); if (!btn) return; if (comparePending) { btn.textContent = compareModels.length >= 2 ? '开始对比' : `已选 ${compareModels.length} 个`; btn.classList.add('btn-accent'); btn.disabled = compareModels.length < 2; } else { btn.textContent = '重新选择'; btn.classList.remove('btn-accent'); btn.disabled = false; } }

// 对比页筛选
let currentCompareFamily = '';
let currentCompareGen = '';
let compareFiltersInitialized = false;

function initCompareFilters() {
    if (compareFiltersInitialized) return;
    const toolbar = document.querySelector('#comparePage .compare-toolbar');
    if (!toolbar) return;
    const filteredList = getFilteredModelList();
    const families = [...new Set(filteredList.map(m => m.model_family).filter(Boolean))].sort();
    const gens = [...new Set(filteredList.map(m => m.model_generation).filter(Boolean))].sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    const familySelect = document.createElement('select');
    familySelect.id = 'compareFamilyFilter';
    familySelect.className = 'filter-select';
    familySelect.innerHTML = '<option value="">全部系列</option>';
    families.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f;
        opt.textContent = f;
        familySelect.appendChild(opt);
    });
    
    const genSelect = document.createElement('select');
    genSelect.id = 'compareGenFilter';
    genSelect.className = 'filter-select';
    genSelect.innerHTML = '<option value="">全部代数</option>';
    gens.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        genSelect.appendChild(opt);
    });
    
    const searchInput = document.getElementById('comparePageSearch');
    if (searchInput && searchInput.parentNode) {
        searchInput.parentNode.insertBefore(familySelect, searchInput);
        searchInput.parentNode.insertBefore(genSelect, searchInput);
        familySelect.style.marginRight = '8px';
        genSelect.style.marginRight = '8px';
    } else {
        toolbar.appendChild(familySelect);
        toolbar.appendChild(genSelect);
    }
    
    familySelect.addEventListener('change', (e) => {
        currentCompareFamily = e.target.value;
        renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    });
    genSelect.addEventListener('change', (e) => {
        currentCompareGen = e.target.value;
        renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    });
    
    compareFiltersInitialized = true;
}

function renderComparePageGrid(q) {
    if (!$comparePageGrid) return;
    q = (q || '').toLowerCase();
    let filtered = getFilteredModelList().filter(m => m.model_name.toLowerCase().includes(q));
    
    if (currentCompareFamily) {
        filtered = filtered.filter(m => m.model_family === currentCompareFamily);
    }
    if (currentCompareGen) {
        filtered = filtered.filter(m => m.model_generation === currentCompareGen);
    }
    
    if (filtered.length === 0) {
        $comparePageGrid.innerHTML = '<div class="loading-text">未找到匹配的型号</div>';
        return;
    }
    let html = filtered.map(m => {
        const selected = compareModels.includes(m.model_name);
        return `<div class="compare-card ${selected ? 'selected' : ''}" onclick="toggleComparePageModel('${m.model_name.replace(/'/g, "\\'")}')"><input type="checkbox" ${selected ? 'checked' : ''} onclick="event.stopPropagation(); toggleComparePageModel('${m.model_name.replace(/'/g, "\\'")}')"><div class="compare-card-info"><div class="compare-card-name">${m.model_name}</div><div class="compare-card-meta">${m.model_family || ''} · ${m.model_generation || ''}</div></div></div>`;
    }).join('');
    html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
    $comparePageGrid.innerHTML = html;
}
window.toggleComparePageModel = function (name) {
    if (!comparePending) return;
    const idx = compareModels.indexOf(name);
    if (idx >= 0) compareModels.splice(idx, 1);
    else { if (compareModels.length >= 5) { alert('最多选择 5 个型号进行对比'); return; } compareModels.push(name); }
    renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    if ($comparePageResult) $comparePageResult.innerHTML = '';
    updateCompareActionBtn();
};
if ($comparePageSearch) $comparePageSearch.addEventListener('input', e => { if (!comparePending) return; renderComparePageGrid(e.target.value); });
const clearBtn = $('#clearComparePageBtn');
if (clearBtn) clearBtn.addEventListener('click', () => { compareModels = []; comparePending = true; selectedModels = []; if ($comparePageSearch) $comparePageSearch.value = ''; if ($comparePageResult) $comparePageResult.innerHTML = ''; renderComparePageGrid(''); updateCompareActionBtn(); });
const runBtn = $('#runCompareBtn');
if (runBtn) {
    runBtn.addEventListener('click', async () => {
        if (comparePending) {
            if (compareModels.length < 2) { alert('请至少选择两个型号'); return; }
            if ($comparePageResult) $comparePageResult.innerHTML = '<div class="loading-text">加载型号数据中...</div>';
            if ($comparePageGrid) $comparePageGrid.innerHTML = '';
            try {
                const modelsToLoad = compareModels.map(name => masterModelList.find(x => x.model_name === name)).filter(Boolean);
                for (const m of modelsToLoad) { if (m._isLight) await loadModelFile(m.filename); }
                const loadedModels = compareModels.map(name => masterModelList.find(x => x.model_name === name)).filter(Boolean);
                selectedModels = loadedModels;
                const devicesWithParts = await Promise.all(loadedModels.map(async model => ({ model, parts: await loadDeviceParts(model) })));
                renderCompareResultTable(devicesWithParts);
                comparePending = false; updateCompareActionBtn();
            } catch (e) { console.error('对比失败:', e); if ($comparePageResult) $comparePageResult.innerHTML = '<div class="loading-text">加载对比数据失败，请重试</div>'; }
        } else resetComparePage();
    });
}

function makeCard(title, contentHtml, useFlow = false) {
    const bodyClass = useFlow ? 'card-body card-body-flow' : 'card-body';
    return `<div class="card"><div class="card-title" onclick="toggleCard(this)"><span>${title}</span><span class="card-chevron">▼</span></div><div class="${bodyClass}">${contentHtml}</div></div>`;
}

function renderBatteryItems(batteries) {
    if (!batteries || batteries.length === 0) return '<span style="color:var(--text-muted);">无电池信息</span>';
    return batteries.map(b => {
        const title = b.type || '未命名电池';
        let html = `<div class="part-row"><div class="part-info-wrap">`;
        html += `<div class="part-title-text">${title}</div>`;
        if (b.capacity) html += `<div class="part-field"><span class="field-name">容量</span><span class="field-value">${b.capacity}</span></div>`;
        if (b.form) html += `<div class="part-field"><span class="field-name">规格</span><span class="field-value">${b.form}</span></div>`;
        if (b.tech) html += `<div class="part-field"><span class="field-name">技术</span><span class="field-value">${b.tech}</span></div>`;
        html += `</div></div>`;
        return html;
    }).join('');
}

function renderStorageItems(storage) {
    const labels = { ssd_sata: 'SATA SSD', ssd_pcie: 'PCIe SSD', hdd: 'HDD', sshd: 'SSHD', optical: '光驱', floppy: '软驱', optane: '傲腾', emmc: 'eMMC' };
    if (!storage) return '<span style="color:var(--text-muted);">无存储信息</span>';
    const entries = Object.entries(storage).filter(([, v]) => v && typeof v === 'string' && v.trim() !== '');
    if (entries.length === 0) return '<span style="color:var(--text-muted);">无存储信息</span>';
    return entries.map(([key, value]) => {
        const label = labels[key] || key.replace(/_/g, ' ');
        let html = `<div class="part-row"><div class="part-info-wrap">`;
        html += `<div class="part-title-text">${label}</div>`;
        html += `<div class="part-field"><span class="field-name">容量</span><span class="field-value">${value}</span></div>`;
        html += `</div></div>`;
        return html;
    }).join('');
}

function renderCompareResultTable(devicesWithParts) {
    function formatMemory(model) { if (!model.memory) return 'N/A'; let html = ''; if (model.memory.max_capacity) html += `${model.memory.max_capacity}`; if (model.memory.type) html += ` ${model.memory.type}`; if (model.memory.slots) html += ` (${model.memory.slots}插槽)`; return html.trim() || 'N/A'; }
    function formatStorage(model) { if (!model.storage) return 'N/A'; const labels = { ssd_sata: 'SATA', ssd_pcie: 'PCIe', hdd: 'HDD', sshd: 'SSHD', optical: '光驱', floppy: '软驱', optane: '傲腾', emmc: 'eMMC' }; return Object.entries(model.storage).filter(([, v]) => v && typeof v === 'string' && v.trim() !== '').map(([k, v]) => `<div>${labels[k] || k}: ${v}</div>`).join('') || 'N/A'; }
    function formatBattery(model) { const bats = model.Battary || model.battery || []; if (bats.length === 0) return 'N/A'; return bats.map(b => `<div class="compare-part-item">${b.type || '电池'}<br>容量: ${b.capacity || b.cap || '?'} | 规格: ${b.form || '?'} | 技术: ${b.tech || '?'}</div>`).join(''); }
    function checkAllSame(getter) { const values = devicesWithParts.map(d => getter(d.model)); return values.every(v => v === values[0]) ? values[0] : null; }
    function checkPartsAllSame(type) { const signatures = devicesWithParts.map(d => { const parts = d.parts?.[type] || []; return parts.map(p => { const data = p.data?.thinkpad_database?.[0] || p.data; return data.model || p.name; }).sort().join('|'); }); return signatures.every(s => s === signatures[0]) ? signatures[0] : null; }
    function renderPartSummary(partsArr, type, model) {
        if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return partsArr.map((part, idx) => {
            const d = part.data?.thinkpad_database?.[0] || part.data;
            const name = d.model || d.type || part.name || '未知';
            const arch = d.Architecture || d.Generation || d.generation || '';
            const detailId = `detail-${type}-${model.model_name.replace(/[^a-zA-Z0-9]/g, '_')}-${idx}`;
            const filename = part.name;
            return `<div class="compare-part-summary" id="${detailId}-summary"><div><span class="compare-part-name">${name}</span>${arch ? `<span class="compare-part-arch">${arch}</span>` : ''}</div><button class="btn btn-sm compare-detail-btn" onclick="togglePartDetail('${detailId}', '${type}', '${filename.replace(/'/g, "\\'")}')">展开详情</button></div><div class="compare-part-detail hidden" id="${detailId}-detail"><div class="loading-text" style="padding:12px;">加载中...</div></div>`;
        }).join('');
    }
    function buildPartCard(title, type, devicesWithParts, renderFn) {
        let html = `<div class="card"><div class="card-title"><span>${title}</span></div><div class="card-body compare-card-body">`;
        devicesWithParts.forEach((d, i) => { html += `<div class="compare-model-col">${renderFn(d.parts?.[type], type, d.model)}</div>`; });
        html += '</div></div>'; return html;
    }
    function renderPartsIfSame(title, type) {
        const same = checkPartsAllSame(type);
        if (same !== null) {
            const firstParts = devicesWithParts[0].parts?.[type] || [];
            if (firstParts.length === 0) return `<div class="compare-row compare-merged"><div class="compare-merged-label">${title}</div><div class="compare-merged-value" style="color:var(--text-muted);">无</div></div>`;
            const itemsHtml = firstParts.map((part, idx) => {
                const d = part.data?.thinkpad_database?.[0] || part.data;
                const name = d.model || d.type || part.name || '未知';
                const arch = d.Architecture || d.Generation || d.generation || '';
                const detailId = `detail-merged-${type}-${idx}`; const filename = part.name;
                return `<div class="compare-part-summary" id="${detailId}-summary"><div><span class="compare-part-name">${name}</span>${arch ? `<span class="compare-part-arch">${arch}</span>` : ''}</div><button class="btn btn-sm compare-detail-btn" onclick="togglePartDetail('${detailId}', '${type}', '${filename.replace(/'/g, "\\'")}')">展开详情</button></div><div class="compare-part-detail hidden" id="${detailId}-detail"><div class="loading-text" style="padding:12px;">加载中...</div></div>`;
            }).join('');
            return `<div class="compare-row compare-merged"><div class="compare-merged-label">${title}</div><div class="compare-merged-value">${itemsHtml}</div></div>`;
        }
        return null;
    }
    let mergedHtml = '';
    const cpuMerged = renderPartsIfSame('处理器 (CPU)', 'cpu');
    if (cpuMerged) mergedHtml += cpuMerged; else mergedHtml += buildPartCard('处理器 (CPU)', 'cpu', devicesWithParts, renderPartSummary);
    const gpuMerged = renderPartsIfSame('显卡', 'graphics');
    if (gpuMerged) mergedHtml += gpuMerged; else mergedHtml += buildPartCard('显卡', 'graphics', devicesWithParts, renderPartSummary);
    const dispSame = renderPartsIfSame('显示屏', 'display');
    if (dispSame) mergedHtml += dispSame; else mergedHtml += buildPartCard('显示屏', 'display', devicesWithParts, (partsArr, type, model) => {
        if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return partsArr.map(part => {
            const d = part.data?.thinkpad_database?.[0] || part.data;
            const name = d.type || part.name || '未知';
            const info = [translateTech(d.tech), d.brightness, d.refresh_rate].filter(Boolean).join(' · ');
            return `<div><b>${name}</b>${info ? `<br>${info}` : ''}</div>`;
        }).join('<br>');
    });
    const memSame = checkAllSame(m => formatMemory(m));
    if (memSame !== null) mergedHtml += `<div class="compare-row compare-merged"><div class="compare-merged-label">内存</div><div class="compare-merged-value">${memSame}</div></div>`;
    else {
        mergedHtml += `<div class="card"><div class="card-title"><span>内存</span></div><div class="card-body compare-card-body">`;
        devicesWithParts.forEach(d => { mergedHtml += `<div class="compare-model-col"><div style="padding:6px 0;">${formatMemory(d.model)}</div></div>`; });
        mergedHtml += '</div></div>';
    }
    const storSame = checkAllSame(m => formatStorage(m));
    if (storSame !== null) mergedHtml += `<div class="compare-row compare-merged"><div class="compare-merged-label">储存</div><div class="compare-merged-value">${storSame}</div></div>`;
    else {
        mergedHtml += `<div class="card"><div class="card-title"><span>储存</span></div><div class="card-body compare-card-body">`;
        devicesWithParts.forEach(d => { mergedHtml += `<div class="compare-model-col"><div style="padding:6px 0;">${formatStorage(d.model)}</div></div>`; });
        mergedHtml += '</div></div>';
    }
    const battSame = checkAllSame(m => formatBattery(m));
    if (battSame !== null) mergedHtml += `<div class="compare-row compare-merged"><div class="compare-merged-label">电池</div><div class="compare-merged-value">${battSame}</div></div>`;
    else {
        mergedHtml += `<div class="card"><div class="card-title"><span>电池</span></div><div class="card-body compare-card-body">`;
        devicesWithParts.forEach(d => { mergedHtml += `<div class="compare-model-col"><div style="padding:6px 0;">${formatBattery(d.model)}</div></div>`; });
        mergedHtml += '</div></div>';
    }
    const ethSame = renderPartsIfSame('有线网卡', 'ethernet');
    if (ethSame) mergedHtml += ethSame; else mergedHtml += buildPartCard('有线网卡', 'ethernet', devicesWithParts, (partsArr, type, model) => {
        if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return partsArr.map(part => {
            const d = part.data?.thinkpad_database?.[0] || part.data;
            const name = d.type || d['model-type'] || part.name || '未知';
            let html = `<div><b>${name}</b>`;
            if (d['model-type']) html += `<br>功能: ${d['model-type']}`;
            if (d.speed) html += `<br>连接速度: ${d.speed}`;
            html += '</div>'; return html;
        }).join('');
    });
    const wlanSame = renderPartsIfSame('无线网卡', 'wlan');
    if (wlanSame) mergedHtml += wlanSame; else mergedHtml += buildPartCard('无线网卡', 'wlan', devicesWithParts, (partsArr, type, model) => {
        if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return partsArr.map(part => {
            const d = part.data?.thinkpad_database?.[0] || part.data;
            const name = d.model || d.type || part.name || '未知';
            let html = `<div><b>${name}</b>`;
            if (d.form) html += `<br>形态: ${d.form}`;
            if (d.feature) html += `<br>功能: ${d.feature}`;
            html += '</div>'; return html;
        }).join('');
    });
    const wwanSame = renderPartsIfSame('WWAN', 'wwan');
    if (wwanSame) mergedHtml += wwanSame; else mergedHtml += buildPartCard('WWAN', 'wwan', devicesWithParts, (partsArr, type, model) => {
        if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return partsArr.map(part => {
            const d = part.data?.thinkpad_database?.[0] || part.data;
            const name = d.model || d.type || part.name || '未知';
            let html = `<div><b>${name}</b>`;
            if (d.form) html += `<br>形态: ${d.form}`;
            if (d.feature) html += `<br>功能: ${d.feature}`;
            html += '</div>'; return html;
        }).join('');
    });
    const dockSame = renderPartsIfSame('扩展坞', 'dock');
    if (dockSame) mergedHtml += dockSame; else mergedHtml += buildPartCard('扩展坞', 'dock', devicesWithParts, (partsArr, type, model) => {
        if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>';
        return partsArr.map(part => {
            const d = part.data?.thinkpad_database?.[0] || part.data;
            const name = d.model || d.type || part.name || '未知';
            let html = `<div><b>${name}</b>`;
            if (d.power) html += `<br>供电: ${d.power}`;
            if (d.ports && Array.isArray(d.ports)) html += `<br>端口: ${d.ports.join('、')}`;
            else if (d.ports) html += `<br>端口: ${d.ports}`;
            html += '</div>'; return html;
        }).join('');
    });
    let diffHtml = `<div class="card"><div class="card-title"><span>接口与其他</span></div><div class="card-body card-body-flow" style="overflow-x:auto;"><table class="compare-table"><thead><tr><th>规格</th>`;
    devicesWithParts.forEach(d => diffHtml += `<th>${d.model.model_name}</th>`);
    diffHtml += '</table></thead><tbody>';
    const miscRows = [
        { label: '接口', getValue: m => Array.isArray(m.ports) ? m.ports.join('、') : (m.ports || '-') },
        { label: '尺寸', getValue: m => m.physical?.dimensions || '-' },
        { label: '重量', getValue: m => m.physical?.weight || '-' },
        { label: '材质', getValue: m => m.physical?.case_material || m.case_material || '-' },
        { label: '安全特性', getValue: m => Array.isArray(m.security) ? m.security.join('、') : (m.security || '-') },
        { label: '预装系统', getValue: m => Array.isArray(m.system) ? m.system.join('<br>') : (m.system || '-') },
    ];
    miscRows.forEach(row => {
        const sameValue = checkAllSame(row.getValue);
        if (sameValue !== null) diffHtml += `<tr><td><b>${row.label}</b></td><td colspan="${devicesWithParts.length}" style="color:var(--accent);">${sameValue}</td></tr>`;
        else {
            diffHtml += '<tr>';
            diffHtml += `<td><b>${row.label}</b></td>`;
            devicesWithParts.forEach(d => diffHtml += `<td>${row.getValue(d.model)}</td>`);
            diffHtml += '<tr>';
        }
    });
    diffHtml += '</tbody></table></div></div>';
    let headerHtml = `<div class="compare-header"><div class="compare-header-models">`;
    devicesWithParts.forEach(d => { headerHtml += `<div class="compare-header-model">${d.model.model_name}</div>`; });
    headerHtml += '</div></div>';
    let finalHtml = headerHtml;
    if (mergedHtml) finalHtml += `<div class="card"><div class="card-title"><span>配置对比</span></div><div class="card-body card-body-flow">${mergedHtml}</div></div>`;
    finalHtml += diffHtml;
    finalHtml = window.globalTranslateHTML ? window.globalTranslateHTML(finalHtml) : finalHtml;
    if ($comparePageResult) {
        $comparePageResult.innerHTML = finalHtml;
        $comparePageResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

const PART_FIELD_LABELS = {
    'model': '型号', 'type': '类型', 'Architecture': '架构', 'generation': '代数', 'family': '系列',
    'cores_threads': '核心/线程', 'base_freq': '基础频率', 'turbo_freq': '睿频', 'cache': '缓存', 'TDP': 'TDP', 'graphics': '集成显卡', 'socket': '插槽', 'process': '制程',
    'VRAM': '显存', 'Generation': '架构', 'Shading Units': '着色单元',
    'tech': '面板技术', 'brightness': '亮度', 'contrast': '对比度', 'viewing_angle': '视角', 'touch': '触摸', 'refresh_rate': '刷新率', 'color_gamut': '色域',
    'model-type': '型号/类型', 'form': '形态', 'feature': '特性', 'interface': '接口', 'protocol': '协议', 'speed': '速率', 'chipset': '芯片组', 'antenna': '天线',
    'ports': '端口', 'power': '供电',
};
function getFieldLabel(key) { return PART_FIELD_LABELS[key] || key.replace(/_/g, ' '); }

async function loadFullPartDetails(type, filename) {
    if (!filename) return null;
    let fullName = filename.endsWith('.json') ? filename : filename + '.json';
    const folderMap = { cpu: 'CPU', graphics: 'Graphics' };
    const folder = folderMap[type] || type;
    try { const resp = await fetch(`modeldata/${folder}/${fullName}`); if (!resp.ok) return null; return await resp.json(); }
    catch (e) { console.error(`加载完整零件失败: ${type}/${filename}`, e); return null; }
}
window.togglePartDetail = async function (detailId, type, filename) {
    const summaryEl = document.getElementById(`${detailId}-summary`);
    const detailEl = document.getElementById(`${detailId}-detail`);
    if (!detailEl) return;
    if (!detailEl.classList.contains('hidden')) { detailEl.classList.add('hidden'); const btn = summaryEl?.querySelector('.compare-detail-btn'); if (btn) btn.textContent = '展开详情'; return; }
    detailEl.classList.remove('hidden');
    const btn = summaryEl?.querySelector('.compare-detail-btn'); if (btn) btn.textContent = '收起详情';
    if (detailEl.querySelector('.loading-text')) {
        const fullData = await loadFullPartDetails(type, filename);
        if (fullData) {
            const d = fullData.thinkpad_database?.[0] || fullData;
            const lines = [];
            const excludeKeys = ['FRUs', 'frus', 'Frus', 'iconfamily', 'ark'];
            if (type === 'cpu' || type === 'graphics') excludeKeys.push('model');
            if (type === 'display') excludeKeys.push('model', 'type');
            for (const [k, v] of Object.entries(d)) { if (excludeKeys.includes(k)) continue; if (v == null || v === '') continue; if (typeof v === 'object') continue; const label = getFieldLabel(k); lines.push(`<div class="part-field"><span class="field-name">${label}</span><span class="field-value">${v}</span></div>`); }
            detailEl.innerHTML = lines.join('') || '<span style="color:var(--text-muted);">无详细信息</span>';
        } else detailEl.innerHTML = '<span style="color:var(--text-muted);">加载失败</span>';
    }
};
window.closeCompareModal = function () { const modal = $('#compareModal'); if (modal) modal.classList.remove('show'); };
const confirmBtn = $('#confirmCompareBtn');
if (confirmBtn) confirmBtn.addEventListener('click', async () => { if (selectedModels.length === 0) return; for (const m of selectedModels) { if (m._isLight) await loadModelFile(m.filename); } const modal = $('#compareSelectModal'); if (modal) modal.classList.remove('show'); showCompareModalLegacy(); });
const compareSelectModalEl = $('#compareSelectModal');
if (compareSelectModalEl) compareSelectModalEl.addEventListener('click', function (e) { if (e.target === this) closeCompareSelectModal(); });
async function showCompareModalLegacy() {
    if (!$compareModalBody) return;
    $compareModalBody.innerHTML = '<div class="loading-text">加载对比数据中...</div>';
    const modal = $('#compareModal'); if (modal) modal.classList.add('show');
    try {
        const devicesWithParts = await Promise.all(selectedModels.map(async model => ({ model, parts: await loadDeviceParts(model) })));
        function formatMemory(model) { if (!model.memory) return 'N/A'; let html = ''; if (model.memory.max_capacity) html += `容量: ${model.memory.max_capacity}<br>`; if (model.memory.type) html += `类型: ${model.memory.type}<br>`; if (model.memory.slots) html += `插槽: ${model.memory.slots}`; return html || 'N/A'; }
        function formatStorage(model) { if (!model.storage) return 'N/A'; const labels = { ssd_sata: 'SATA SSD', ssd_pcie: 'PCIe SSD', hdd: 'HDD', sshd: 'SSHD', optical: '光驱', floppy: '软驱', optane: '傲腾', emmc: 'eMMC' }; return Object.entries(model.storage).filter(([, v]) => v && typeof v === 'string' && v.trim() !== '').map(([k, v]) => `<b>${labels[k] || k}:</b> ${v}`).join('<br>') || 'N/A'; }
        function formatBattery(model) { const bats = model.Battary || model.battery || []; if (bats.length === 0) return 'N/A'; return bats.map(b => `${b.type || '电池'}: 容量 ${b.capacity || b.cap || ''} / 规格 ${b.form || ''} / 技术 ${b.tech || ''}`).join('<br>'); }
        function formatPorts(model) { if (!model.ports) return 'N/A'; return Array.isArray(model.ports) ? model.ports.join('、') : String(model.ports); }
        function formatOther(model) { const items = []; if (model.physical?.dimensions) items.push(`尺寸: ${model.physical.dimensions}`); if (model.physical?.weight) items.push(`重量: ${model.physical.weight}`); if (model.physical?.case_material || model.case_material) items.push(`材质: ${model.physical?.case_material || model.case_material}`); if (model.security) items.push(`安全: ${Array.isArray(model.security) ? model.security.join('、') : model.security}`); return items.join('<br>') || 'N/A'; }
        const rows = [
            { label: '处理器 (CPU)', getValue: (m, p) => p.cpu?.map(x => formatPartFullInfo(x.data, 'cpu')).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无' },
            { label: '显卡', getValue: (m, p) => p.graphics?.map(x => formatPartFullInfo(x.data, 'graphics')).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无' },
            { label: '内存', getValue: m => formatMemory(m) },
            { label: '显示屏', getValue: (m, p) => p.display?.map(x => formatPartFullInfo(x.data, 'display')).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无' },
            { label: '储存', getValue: m => formatStorage(m) },
            { label: '电池', getValue: m => formatBattery(m) },
            { label: '有线网卡', getValue: (m, p) => p.ethernet?.map(x => formatPartFullInfo(x.data, 'ethernet')).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无' },
            { label: '无线网卡', getValue: (m, p) => p.wlan?.map(x => formatPartFullInfo(x.data, 'wlan')).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无' },
            { label: 'WWAN', getValue: (m, p) => p.wwan?.map(x => formatPartFullInfo(x.data, 'wwan')).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无' },
            { label: '物理接口', getValue: m => formatPorts(m) },
            { label: '其他', getValue: m => formatOther(m) },
        ];
        let html = '<table class="compare-table"><thead><tr><th>规格</th>';
        devicesWithParts.forEach(d => html += `<th>${d.model.model_name}</th>`);
        html += '<tr></thead><tbody>';
        rows.forEach(row => { html += '<tr>'; html += `<td><b>${row.label}</b></td>`; devicesWithParts.forEach(d => html += `<td>${row.getValue(d.model, d.parts)}</td>`); html += '</tr>'; });
        html += '</tbody></table>';
        html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
        $compareModalBody.innerHTML = html;
    } catch (e) { console.error('对比失败:', e); $compareModalBody.innerHTML = '<div class="loading-text">加载对比数据失败</div>'; }
}
const compareModalEl = $('#compareModal');
if (compareModalEl) compareModalEl.addEventListener('click', function (e) { if (e.target === this) closeCompareModal(); });
function formatPartFullInfo(data, type) {
    if (!data) return '无信息';
    const d = data.thinkpad_database?.[0] || data;
    const lines = [];
    if (type === 'cpu') { if (d.model) lines.push(`<b>${d.model}</b>`); if (d.cores_threads) lines.push(`${d.cores_threads}`); if (d.base_freq) lines.push(`基础: ${d.base_freq}`); if (d.turbo_freq && d.turbo_freq !== 'null') lines.push(`睿频: ${d.turbo_freq}`); if (d.cache) lines.push(`缓存: ${d.cache}`); if (d.graphics) lines.push(`集显: ${d.graphics}`); }
    else if (type === 'display') { if (d.type) lines.push(`<b>${d.type}</b>`); if (d.tech) lines.push(translateTech(d.tech)); if (d.brightness) lines.push(`亮度: ${d.brightness}`); if (d.refresh_rate) lines.push(`刷新率: ${d.refresh_rate}`); if (d.color_gamut) lines.push(`色域: ${d.color_gamut}`); if (d.touch) lines.push(`触摸: ${d.touch}`); }
    else if (type === 'graphics') { if (d.model) lines.push(`<b>${d.model}</b>`); if (d.VRAM) lines.push(`显存: ${d.VRAM}`); if (d.Generation) lines.push(`架构: ${d.Generation}`); if (d['Shading Units']) lines.push(`着色单元: ${d['Shading Units']}`); if (d.base_freq) lines.push(`基础频率: ${d.base_freq}`); }
    else if (type === 'ethernet') { if (d.type) lines.push(`<b>${d.type}</b>`); if (d['model-type']) lines.push(`功能: ${d['model-type']}`); if (d.speed) lines.push(`连接速度: ${d.speed}`); for (const [k, v] of Object.entries(d)) { if (['type', 'model-type', 'speed'].includes(k)) continue; if (v && typeof v !== 'object') lines.push(`${k.replace(/_/g, ' ')}: ${v}`); } }
    else if (type === 'wlan' || type === 'wwan') { if (d.model) lines.push(`<b>${d.model}</b>`); else if (d.type) lines.push(`<b>${d.type}</b>`); if (d.form) lines.push(`形态: ${d.form}`); if (d.feature) lines.push(`功能: ${d.feature}`); for (const [k, v] of Object.entries(d)) { if (['model', 'type', 'form', 'feature', 'FRUs', 'frus', 'Frus'].includes(k)) continue; if (v && typeof v !== 'object') lines.push(`${k.replace(/_/g, ' ')}: ${v}`); } }
    else if (type === 'dock') { if (d.model) lines.push(`<b>${d.model}</b>`); if (d.ports) { const portsStr = Array.isArray(d.ports) ? d.ports.join('、') : d.ports; lines.push(`端口: ${portsStr}`); } if (d.power) lines.push(`供电: ${d.power}`); }
    else { if (d.model) lines.push(`<b>${d.model}</b>`); else if (d.type) lines.push(`<b>${d.type}</b>`); }
    return lines.join('<br>') || 'N/A';
}
async function loadPartData(type, filename) {
    if (!filename) return null;
    let fullName = filename.endsWith('.json') ? filename : filename + '.json';
    if (partsCache[type] && partsCache[type][fullName]) return partsCache[type][fullName];
    const folderMap = { cpu: 'CPU', ethernet: 'Ethernet', wlan: 'WLAN', wwan: 'WWAN', display: 'Display', graphics: 'Graphics', dock: 'Dock' };
    const folder = folderMap[type] || type;
    try {
        const resp = await fetch(`modeldata/${folder}/${fullName}`);
        if (!resp.ok && fullName.endsWith('.json')) { const altResp = await fetch(`modeldata/${folder}/${filename}`); if (altResp.ok) { const data = await altResp.json(); if (!partsCache[type]) partsCache[type] = {}; partsCache[type][fullName] = data; return data; } }
        if (!resp.ok) return null;
        const data = await resp.json(); if (!partsCache[type]) partsCache[type] = {}; partsCache[type][fullName] = data; return data;
    } catch (e) { console.error(`加载零件失败: ${type}/${filename}`, e); return null; }
}
async function loadDeviceParts(device) {
    const tasks = [];
    if (device.processor_options?.length) device.processor_options.forEach(f => tasks.push({ type: 'cpu', file: f }));
    if (device.display_options?.length) device.display_options.forEach(f => tasks.push({ type: 'display', file: f }));
    if (device.graphics_options?.length) device.graphics_options.forEach(f => tasks.push({ type: 'graphics', file: f }));
    if (device.Ethernet) { const items = Array.isArray(device.Ethernet) ? device.Ethernet : device.Ethernet.split(',').map(s => s.trim()).filter(Boolean); items.forEach(f => tasks.push({ type: 'ethernet', file: f })); }
    if (device.WLAN) { const items = Array.isArray(device.WLAN) ? device.WLAN : [device.WLAN]; items.forEach(f => tasks.push({ type: 'wlan', file: f })); }
    if (device.WWAN) { const items = Array.isArray(device.WWAN) ? device.WWAN : [device.WWAN]; items.forEach(f => tasks.push({ type: 'wwan', file: f })); }
    if (device.dock_support) { const items = Array.isArray(device.dock_support) ? device.dock_support : [device.dock_support]; items.forEach(f => tasks.push({ type: 'dock', file: f })); }
    const results = [];
    for (let i = 0; i < tasks.length; i += MAX_CONCURRENT) { const batch = tasks.slice(i, i + MAX_CONCURRENT); const batchResults = await Promise.all(batch.map(async t => { const data = await loadPartData(t.type, t.file); return { type: t.type, name: t.file, data: data || { model: t.file, note: '等待补充' } }; })); results.push(...batchResults); }
    const parts = { cpu: [], ethernet: [], wlan: [], wwan: [], display: [], graphics: [], dock: [] };
    results.forEach(r => { if (parts[r.type]) parts[r.type].push({ data: r.data, name: r.name, type: r.type }); });
    return parts;
}
function isFavorite(name) { return favorites.includes(name); }
function toggleFavorite(name) { const idx = favorites.indexOf(name); if (idx >= 0) favorites.splice(idx, 1); else favorites.push(name); localStorage.setItem('tp_favs', JSON.stringify(favorites)); updateFavCount(); const btn = $('#favToggleBtn'); if (btn && btn.dataset.model === name) btn.textContent = isFavorite(name) ? '★ 已收藏' : '☆ 收藏'; }
function updateFavCount() {
    if ($favCount) $favCount.textContent = favorites.length;
    if (currentPage === 'favorites' && $favoritesPageSubtitle) $favoritesPageSubtitle.textContent = `已收藏 ${favorites.length} 个型号`;
}
window.switchToModel = async function (name) { let model = masterModelList.find(m => m.model_name === name); if (model && model._isLight) { await loadModelFile(model.filename); model = masterModelList.find(m => m.model_name === name); } if (model) renderSpecs(model); };
function renderPartCard(partsArr, title, type, useFlow = false) {
    if (!partsArr || partsArr.length === 0) return makeCard(title, '<span style="color:var(--text-muted);">无</span>', useFlow);
    const itemsHtml = partsArr.map((part, idx) => {
        const d = part.data?.thinkpad_database?.[0] || part.data;
        const menuId = `card-menu-${menuCounter++}`;
        const hasFru = d && (d.FRUs || d.frus || d.Frus);
        let fruMenuItem = ''; if (hasFru) { const jsonPart = JSON.stringify(part.data).replace(/"/g, '&quot;').replace(/'/g, "&#39;"); fruMenuItem = `<div class="card-menu-item" onclick="event.stopPropagation();window.showFruModalByPart(${jsonPart})">可能使用的 FRU</div>`; }
        let arkMenuItem = ''; if (type === 'cpu' && d.ark) arkMenuItem = `<div class="card-menu-item" onclick="event.stopPropagation();window.open('${encodeURI(d.ark)}','_blank');">查看 ARK</div>`;
        let iconHtml = ''; if ((type === 'cpu' || type === 'graphics') && d.iconfamily) { const iconFolder = type === 'cpu' ? 'CPU/cpu_icon' : 'Graphics/Graphics_icons'; const iconBase = `modeldata/${iconFolder}/${encodeURIComponent(d.iconfamily)}`; iconHtml = `<img src="${iconBase}.webp" class="cpu-icon-bg" alt="" loading="lazy" onerror="this.style.display='none';">`; }
        const menuItems = fruMenuItem + arkMenuItem;
        const menuHtml = menuItems ? `<div class="card-menu-container"><button class="card-menu-btn" onmouseenter="menuEnter('${menuId}')" onmouseleave="menuLeave('${menuId}')">⋮</button><div id="${menuId}" class="card-menu-dropdown hidden" onmouseenter="menuEnter('${menuId}')" onmouseleave="menuLeave('${menuId}')">${fruMenuItem}${arkMenuItem}</div></div>` : '';
        const infoLines = [];
        if (type === 'cpu') {
            if (d.model) infoLines.push(`<div class="part-title-text">${d.model}</div>`);
            if (d.cores_threads) infoLines.push(`<div class="part-field"><span class="field-name">核心/线程</span><span class="field-value">${d.cores_threads}</span></div>`);
            if (d.base_freq) infoLines.push(`<div class="part-field"><span class="field-name">基础频率</span><span class="field-value">${d.base_freq}</span></div>`);
            if (d.turbo_freq && d.turbo_freq !== 'null') infoLines.push(`<div class="part-field"><span class="field-name">睿频</span><span class="field-value">${d.turbo_freq}</span></div>`);
            if (d.cache) infoLines.push(`<div class="part-field"><span class="field-name">缓存</span><span class="field-value">${d.cache}</span></div>`);
            if (d.graphics) infoLines.push(`<div class="part-field"><span class="field-name">集显</span><span class="field-value">${d.graphics}</span></div>`);
        }
        else if (type === 'display') {
            if (d.type) infoLines.push(`<div class="part-title-text">${d.type}</div>`);
            if (d.tech) infoLines.push(`<div class="part-field"><span class="field-name">技术</span><span class="field-value">${translateTech(d.tech)}</span></div>`);
            if (d.brightness) infoLines.push(`<div class="part-field"><span class="field-name">亮度</span><span class="field-value">${d.brightness}</span></div>`);
            if (d.refresh_rate) infoLines.push(`<div class="part-field"><span class="field-name">刷新率</span><span class="field-value">${d.refresh_rate}</span></div>`);
            if (d.color_gamut) infoLines.push(`<div class="part-field"><span class="field-name">色域</span><span class="field-value">${d.color_gamut}</span></div>`);
            if (d.touch) infoLines.push(`<div class="part-field"><span class="field-name">触摸</span><span class="field-value">${d.touch}</span></div>`);
        }
        else if (type === 'graphics') {
            if (d.model) infoLines.push(`<div class="part-title-text">${d.model}</div>`);
            if (d.VRAM) infoLines.push(`<div class="part-field"><span class="field-name">显存</span><span class="field-value">${d.VRAM}</span></div>`);
            if (d.Generation) infoLines.push(`<div class="part-field"><span class="field-name">架构</span><span class="field-value">${d.Generation}</span></div>`);
            if (d.base_freq) infoLines.push(`<div class="part-field"><span class="field-name">频率</span><span class="field-value">${d.base_freq}</span></div>`);
        }
        else if (type === 'ethernet') {
            if (d.type) infoLines.push(`<div class="part-title-text">${d.type}</div>`);
            if (d['model-type']) infoLines.push(`<div class="part-field"><span class="field-name">功能</span><span class="field-value">${d['model-type']}</span></div>`);
            if (d.speed) infoLines.push(`<div class="part-field"><span class="field-name">连接速度</span><span class="field-value">${d.speed}</span></div>`);
            for (const [k, v] of Object.entries(d)) {
                if (['model', 'type', 'model-type', 'speed', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].includes(k)) continue;
                if (v && typeof v !== 'object') infoLines.push(`<div class="part-field"><span class="field-name">${k.replace(/_/g, ' ')}</span><span class="field-value">${v}</span></div>`);
            }
        }
        else if (type === 'wlan' || type === 'wwan') {
            const main = d.model || d.type || part.name;
            if (main) infoLines.push(`<div class="part-title-text">${main}</div>`);
            if (d.form) infoLines.push(`<div class="part-field"><span class="field-name">形态</span><span class="field-value">${d.form}</span></div>`);
            if (d.feature) infoLines.push(`<div class="part-field"><span class="field-name">功能</span><span class="field-value">${d.feature}</span></div>`);
            for (const [k, v] of Object.entries(d)) {
                if (['model', 'type', 'form', 'feature', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].includes(k)) continue;
                if (v && typeof v !== 'object') infoLines.push(`<div class="part-field"><span class="field-name">${k.replace(/_/g, ' ')}</span><span class="field-value">${v}</span></div>`);
            }
        }
        else if (type === 'dock') {
            if (d.model) infoLines.push(`<div class="part-title-text">${d.model}</div>`);
            if (d.ports) {
                const portsList = Array.isArray(d.ports) ? d.ports.map(p => `<span class="chip">${p}</span>`).join(' ') : d.ports;
                infoLines.push(`<div class="part-field"><span class="field-name">端口</span><span class="field-value">${portsList}</span></div>`);
            }
            if (d.power) infoLines.push(`<div class="part-field"><span class="field-name">供电</span><span class="field-value">${d.power}</span></div>`);
            for (const [k, v] of Object.entries(d)) {
                if (['model', 'type', 'ports', 'power', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].includes(k)) continue;
                if (v && typeof v !== 'object') infoLines.push(`<div class="part-field"><span class="field-name">${k.replace(/_/g, ' ')}</span><span class="field-value">${v}</span></div>`);
            }
        }
        else {
            const main = d.model || d.type || part.name;
            if (main) infoLines.push(`<div class="part-title-text">${main}</div>`);
            for (const [k, v] of Object.entries(d)) {
                if (['model', 'type', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].includes(k)) continue;
                if (v && typeof v !== 'object') infoLines.push(`<div class="part-field"><span class="field-name">${k.replace(/_/g, ' ')}</span><span class="field-value">${v}</span></div>`);
            }
        }
        return `<div class="part-row"><div class="part-info-wrap">${infoLines.join('')}</div>${iconHtml}${menuHtml}</div>`;
    }).join('');
    return makeCard(title, itemsHtml, useFlow);
}
async function renderSpecs(data) {
    if (!data) return;
    // 添加到最近浏览记录
    addToRecent(data.model_name);
    
    currentModelData = data;
    if (currentPage !== 'detail') showDetailPage();
    setHomeOnlyElementsVisible(false);
    if (data._isLight) { if ($display) $display.innerHTML = '<div class="loading-text">加载型号数据中...</div>'; await loadModelFile(data.filename); data = masterModelList.find(m => m.model_name === data.model_name) || data; }
    if ($display) $display.innerHTML = '<div class="loading-text">加载规格数据中...</div>';
    try {
        const parts = await loadDeviceParts(data); currentDeviceParts = parts;
        const codeField = data._isNickname ? data.addon_model_code : data.model_code;
        const codeHtml = codeField ? `<span class="chip">${Array.isArray(codeField) ? codeField.join(' / ') : codeField}</span>` : '';
        const counterpart = data._isNickname ? masterModelList.find(m => m.model_name === data._originalName && !m._isNickname) : masterModelList.find(m => m._isNickname && m._originalName === data.model_name);
        const switchBtn = counterpart ? `<button class="btn" onclick="window.switchToModel('${counterpart.model_name.replace(/'/g, "\\'")}')">${data._isNickname ? '切换到原始型号' : '切换到别名'}</button>` : '';
        const favBtn = `<button class="btn" id="favToggleBtn" data-model="${data.model_name.replace(/'/g, "\\'")}" onclick="toggleFavorite('${data.model_name.replace(/'/g, "\\'")}')">${isFavorite(data.model_name) ? '★ 已收藏' : '☆ 收藏'}</button>`;
        const getUrl = u => Array.isArray(u) ? u[0] : u;
        const psref = getUrl(data.PSREF_link), guide = getUrl(data.user_guide_link), hmm = getUrl(data.HMM_link);
        const addonsHtml = data.addons ? `<div style="color:var(--text-muted);font-size:12px;margin-top:-12px;margin-bottom:12px;">${data.addons}</div>` : '';
        const imageAngles = ['main', 'left', 'right', 'front', 'back', 'top', 'bottom', 'full'];
        const imageFolder = data.filename ? data.filename.replace(/\.json$/i, '') : data.model_name.replace(/\s+/g, '_');
        const imagesData = imageAngles.map(angle => ({ angle, url: `modeldata/model-images/${encodeURIComponent(imageFolder)}/${angle}.avif` }));
        const imageCardHtml = `
        <div class="card" id="modelImageCard" style="display:none;">
            <div class="card-title" onclick="toggleCard(this)">
                <span>机型外观</span><span class="card-chevron">▼</span>
            </div>
            <div class="card-body" style="height: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0; position: relative;">
                <img id="currentModelImage" src="${imagesData[0].url}" alt="${data.model_name}"
                     style="max-width: 300px; max-height: 300px; border-radius: 12px; object-fit: contain; display: none; cursor: pointer;">
                <div id="image-nav-buttons" style="margin-top: 12px; display: none; position: absolute; bottom: 8px; left: 0; right: 0;">
                    <button id="prev-image-btn" class="btn btn-sm">◀ 上一张</button>
                    <span id="image-counter" style="margin:0 12px; font-size:13px; color:var(--text-secondary);"></span>
                    <button id="next-image-btn" class="btn btn-sm">下一张 ▶</button>
                </div>
            </div>
        </div>`;
        const memoryCard = makeCard('内存', `<div class="info-row"><span class="info-label">容量</span><span class="info-value">${data.memory?.max_capacity || 'N/A'}</span></div><div class="info-row"><span class="info-label">类型</span><span class="info-value">${data.memory?.type || 'N/A'}</span></div><div class="info-row"><span class="info-label">插槽</span><span class="info-value">${data.memory?.slots || 'N/A'}</span></div>${data.memory?.features ? `<div class="info-row"><span class="info-label">特性</span><span class="info-value">${data.memory.features}</span></div>` : ''}`);
        const storageCard = makeCard('存储', renderStorageItems(data.storage));
        const bats = data.Battary || data.battery || [];
        const batteryCard = makeCard('电池与续航', renderBatteryItems(bats));
        let touchPenHtml = ''; if (data.touch || data.pen) { const items = []; if (data.touch) items.push(`<div class="info-row"><span class="info-label">触摸</span><span class="info-value">${Array.isArray(data.touch) ? data.touch.join('、') : data.touch}</span></div>`); if (data.pen) items.push(`<div class="info-row"><span class="info-label">笔</span><span class="info-value">${Array.isArray(data.pen) ? data.pen.join('、') : data.pen}</span></div>`); touchPenHtml = makeCard('触摸与笔', items.join('')); }
        const portsCard = makeCard('物理接口与多媒体', `<table class="spec-table"><tr><th>接口</th><td>${Array.isArray(data.ports) ? data.ports.join('、') : data.ports || '无'}</td></tr><tr><th>摄像头</th><td>${Array.isArray(data.camera) ? data.camera.join('、') : data.camera || '无'}</td></tr><tr><th>音频</th><td>${Array.isArray(data.audio) ? data.audio.join('<br>') : data.audio || 'N/A'}</td></tr></td><th>键盘和UltraNav</th><td>${Array.isArray(data.keyboard) ? data.keyboard.join('<br>') : data.keyboard || 'N/A'}</td></tr>${data.colorcalibration ? `<tr><th>校色仪</th><td>${Array.isArray(data.colorcalibration) ? data.colorcalibration.join('、') : data.colorcalibration}</td></tr>` : ''}</table>`, true);
        const otherCard = makeCard('其他', `<table class="spec-table other-spec-table"><tr><th>尺寸</th><td>${data.physical?.dimensions || 'N/A'}</td><tr><td><th>重量</th><td>${data.physical?.weight || 'N/A'}</td></tr><tr><th>材质</th><td>${data.physical?.case_material || data.case_material || 'N/A'}</td></tr><tr><th>安全特性</th><td>${Array.isArray(data.security) ? data.security.join('<br>') : data.security || 'N/A'}</td></tr><tr><th>预装系统</th><td>${Array.isArray(data.system) ? data.system.join('<br>') : data.system || 'N/A'}</td></tr>${data.ACadapter ? `<tr><th>电源适配器</th><td>${Array.isArray(data.ACadapter) ? data.ACadapter.join('、') : data.ACadapter}</td></tr>` : ''}${data.add_on_tips ? `<tr><th>附加信息</th><td>${data.add_on_tips}</td></tr>` : ''}${secretTipsEnabled && data.secret_tips ? `<tr><th>秘密提示</th><td>${data.secret_tips}</td></tr>` : ''}</tr>`, true);
        let html = `
            <div class="page-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <span>${data.model_name || '未知型号'} ${codeHtml}</span>${favBtn}${switchBtn}
            </div>
            <div class="page-subtitle">${data.model_family || ''} · ${data.model_generation || ''} · 更新: ${data.update_date || 'N/A'}</div>
            ${addonsHtml}
            ${imageCardHtml}
            ${renderPartCard(parts.cpu, '处理器 (CPU)', 'cpu')}
            ${renderPartCard(parts.graphics, '显卡', 'graphics')}
            ${memoryCard}
            ${renderPartCard(parts.display, '显示屏', 'display')}
            ${touchPenHtml}
            ${storageCard}
            ${batteryCard}
            ${renderPartCard(parts.ethernet, '有线网卡', 'ethernet')}
            ${renderPartCard(parts.wlan, '无线网卡', 'wlan')}
            ${renderPartCard(parts.wwan, 'WWAN', 'wwan')}
            ${renderPartCard(parts.dock, '专有扩展坞支持', 'dock')}
            ${portsCard}
            ${otherCard}
            <div class="btn-row-bottom">
                ${psref ? `<a class="btn" href="${psref}" target="_blank" rel="noopener">PSREF 网站</a>` : ''}
                ${guide ? `<a class="btn" href="${guide}" target="_blank" rel="noopener">用户手册</a>` : ''}
                ${hmm ? `<a class="btn" href="${hmm}" target="_blank" rel="noopener">硬件维护指南</a>` : ''}
            </div>`;
        html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
        if ($display) {
            $display.innerHTML = html;
            const imageCard = document.getElementById('modelImageCard');
            if (imageCard) {
                const currentImg = document.getElementById('currentModelImage');
                const prevBtn = document.getElementById('prev-image-btn');
                const nextBtn = document.getElementById('next-image-btn');
                const counterSpan = document.getElementById('image-counter');
                const navContainer = document.getElementById('image-nav-buttons');
                if (currentImg && prevBtn && nextBtn && counterSpan && navContainer) {
                    let validImages = [];
                    let currentIndex = 0;
                    let loadPromises = imagesData.map(({angle, url}) => new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve({angle, url, valid: true});
                        img.onerror = () => resolve({angle, url, valid: false});
                        img.src = url;
                    }));
                    Promise.all(loadPromises).then(results => {
                        validImages = results.filter(r => r.valid);
                        if (validImages.length === 0) { imageCard.style.display = 'none'; return; }
                        imageCard.style.display = ''; navContainer.style.display = '';
                        const mainIndex = validImages.findIndex(img => img.angle === 'main');
                        if (mainIndex >= 0) currentIndex = mainIndex; else currentIndex = 0;
                        function updateDisplay() {
                            const img = validImages[currentIndex];
                            if (img) {
                                currentImg.src = img.url;
                                currentImg.alt = `${data.model_name} - ${img.angle}`;
                                currentImg.style.display = 'inline-block';
                                currentImg.style.cursor = 'pointer';
                                currentImg.onclick = null;
                                currentImg.onclick = () => openImageModal(img.url);
                                counterSpan.textContent = `${currentIndex + 1} / ${validImages.length}`;
                            }
                        }
                        updateDisplay();
                        if (validImages.length > 0) {
                            currentImg.onclick = () => openImageModal(validImages[currentIndex].url);
                        }
                        prevBtn.addEventListener('click', () => { currentIndex = (currentIndex - 1 + validImages.length) % validImages.length; updateDisplay(); });
                        nextBtn.addEventListener('click', () => { currentIndex = (currentIndex + 1) % validImages.length; updateDisplay(); });
                    });
                }
            }
        }
    } catch (e) { console.error('渲染失败:', e); if ($display) $display.innerHTML = '<div class="loading-text">加载规格数据失败</div>'; }
}
function renderFavoritesPage() {
    const filteredList = getFilteredModelList();
    const list = filteredList.filter(m => favorites.includes(m.model_name));
    if ($favoritesPageSubtitle) $favoritesPageSubtitle.textContent = `已收藏 ${list.length} 个型号`;
    if ($favoritesPageGrid) {
        let html = list.length === 0 ? '<div class="loading-text" style="grid-column:1/-1;">暂无收藏型号</div>' : list.map(m => `<div class="compare-card" onclick="selectFavoriteFromPage('${m.model_name.replace(/'/g, "\\'")}')"><div class="compare-card-info"><div class="compare-card-name">${m.model_name}</div><div class="compare-card-meta"><span>${m.model_family || '系列未知'}</span><span class="compare-part-arch" style="margin-left:6px;">${m.model_generation || '代数未知'}</span></div></div><button class="favorite-remove" onclick="event.stopPropagation(); removeFavoriteFromPage('${m.model_name.replace(/'/g, "\\'")}')" title="取消收藏">×</button></div>`).join('');
        html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
        $favoritesPageGrid.innerHTML = html;
    }
    // 应用视图模式
    if (favoritesViewMode === 'list') {
        $favoritesPageGrid.classList.add('list-view');
    } else {
        $favoritesPageGrid.classList.remove('list-view');
    }
}
window.selectFavoriteFromPage = async function (name) {
    showDetailPage();
    let model = masterModelList.find(m => m.model_name === name);
    if (model && model._isLight) { await loadModelFile(model.filename); model = masterModelList.find(m => m.model_name === name); }
    if (model) renderSpecs(model);
};
window.removeFavoriteFromPage = function (name) { toggleFavorite(name); renderFavoritesPage(); const btn = $('#favToggleBtn'); if (btn && btn.dataset.model === name) btn.textContent = '☆ 收藏'; };
const sidebarFavBtn = $('#sidebarFavorites');
if (sidebarFavBtn) sidebarFavBtn.addEventListener('click', () => { if (currentPage === 'favorites') return; showFavoritesPage(); });

function updateFilterSummary() {}

if ($refreshTrickBtn) {
    $refreshTrickBtn.addEventListener('click', () => { refreshRandomTrick(); });
}
if ($refreshBgBtn) {
    $refreshBgBtn.addEventListener('click', () => { refreshHomeBackground(); });
}
loadIndex();