// 防御性补丁
if (typeof window.translateTech !== 'function') {
    window.translateTech = function(text) { return text; };
}

// ========== 全局状态 ==========
var masterModelList = [];
var currentFilterType = 'family';
var currentFamilyValue = '';
var currentGenValue = '';
var selectedModels = [];
var menuCounter = 0;
var currentDeviceParts = null;
var favorites = JSON.parse(localStorage.getItem('tp_favs') || '[]');
var loadedFiles = new Set();
var partsCache = {};
var MAX_CONCURRENT = 6;
var secretTipsEnabled = false;
var lastEnterTime = 0;

var currentPage = 'detail';
var compareModels = [];
var comparePending = true;
var currentModelData = null;

var globalTricksList = [];
var currentTrickText = '';

var articlesList = [];
var articlesFilteredList = [];
var currentFamilyFilter = '';
var currentSearchKeyword = '';

// ========== 协议检测 ==========
(function() {
    try {
        var p = performance.getEntriesByType('navigation')[0] && performance.getEntriesByType('navigation')[0].nextHopProtocol;
        if (p === 'h2' || p === 'h3') MAX_CONCURRENT = 255;
    } catch (e) {}
})();

// 对比页筛选状态
let currentCompareFamily = '';
let currentCompareGen = '';
let compareFiltersInitialized = false;

let hideLegacyModels = localStorage.getItem('tp_hide_legacy') === 'true';

// ========== DOM 快捷选择 ==========
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

var $display = $('#specDisplay');
var $favCount = $('#favCount');
var $familySel = $('#familySelect');
var $genSel = $('#generationSelect');
var $familyBtn = $('#filterFamilyBtn');
var $genBtn = $('#filterGenBtn');
var $searchInput = $('#searchModalInput');
var $searchResults = $('#searchModalResults');
var $mobileBtn = $('#mobileMenuBtn');
var $overlay = $('#sidebarOverlayBg');
var $compareModalBody = $('#compareModalBody');
var $fruModalBody = $('#fruModalBody');

var $detailPage = $('#detailPage');
var $comparePage = $('#comparePage');
var $comparePageSearch = $('#comparePageSearch');
var $comparePageGrid = $('#comparePageGrid');
var $comparePageResult = $('#comparePageResult');
var $sidebarCompare = $('#sidebarCompare');
var $favoritesPage = $('#favoritesPage');
var $favoritesPageGrid = $('#favoritesPageGrid');
var $favoritesPageSubtitle = $('#favoritesPageSubtitle');

var $settingsBtn = $('#settingsBtn');
var $settingsOverlay = $('#settingsOverlay');
var $settingsThemeToggle = $('#settingsThemeToggle');
var $translateToggle = $('#settingsTranslateToggle');
var themeColorPicker = $('#themeColorPicker');

var $modelPanel = $('#modelSelectOverlay');
var $modelPanelSearch = $('#modelPanelSearch');
var $modelPanelList = $('#modelPanelList');
var $panelFamilyBtn = $('#panelFilterFamilyBtn');
var $panelGenBtn = $('#panelFilterGenBtn');
var $panelFamilySel = $('#panelFamilySelect');
var $panelGenerationSel = $('#panelGenerationSelect');
var $panelResetBtn = $('#panelResetFilterBtn');

var $globalTrickBar = $('#globalTrickBar');
var $globalTrickText = $('#globalTrickText');
var $refreshTrickBtn = $('#refreshTrickBtn');
var $refreshBgBtn = $('#refreshBgBtn');
var $globalHomeBg = $('#globalHomeBg');

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

// ========== 全局语录相关 ==========
function loadTricksAndDisplay() {
    return fetch('modeldata/tricks.json').then(function(resp) {
        if (resp.ok) return resp.json();
        throw new Error('No tricks');
    }).then(function(tricks) {
        if (Array.isArray(tricks) && tricks.length > 0) {
            globalTricksList = tricks;
            refreshRandomTrick();
        } else {
            $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
        }
    }).catch(function() {
        $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
    });
}

function refreshRandomTrick() {
    if (globalTricksList.length > 0) {
        var randomIndex = Math.floor(Math.random() * globalTricksList.length);
        currentTrickText = globalTricksList[randomIndex];
        $globalTrickText.textContent = currentTrickText;
    } else {
        $globalTrickText.textContent = 'ThinkPad 经典永流传 ✨';
    }
}

function refreshHomeBackground() {
    if (!$globalHomeBg) return;
    var randomIndex = Math.floor(Math.random() * 13) + 1;
    var bgUrl = 'modeldata/model-images/startpage/' + randomIndex + '.png';
    $globalHomeBg.src = bgUrl;
    $globalHomeBg.onerror = function() { $globalHomeBg.style.display = 'none'; };
    if (currentPage === 'detail' && !document.querySelector('.nav-item.active') || !document.querySelector('.nav-item.active') || !document.querySelector('.nav-item.active').dataset || !document.querySelector('.nav-item.active').dataset.modelId) {
        $globalHomeBg.style.display = 'block';
    }
}

function setHomeOnlyElementsVisible(visible) {
    if ($globalHomeBg) $globalHomeBg.style.display = visible ? 'block' : 'none';
    if ($globalTrickBar) $globalTrickBar.style.display = visible ? 'flex' : 'none';
}

function initHomeBackgroundImage() {
    if (!$globalHomeBg) return;
    var randomIndex = Math.floor(Math.random() * 13) + 1;
    var bgUrl = 'modeldata/model-images/startpage/' + randomIndex + '.png';
    $globalHomeBg.src = bgUrl;
    $globalHomeBg.alt = 'ThinkPad 装饰背景';
    $globalHomeBg.onerror = function() { $globalHomeBg.style.display = 'none'; };
    $globalHomeBg.onload = function() {
        if (currentPage === 'detail' && (!document.querySelector('.nav-item.active') || !document.querySelector('.nav-item.active').dataset || !document.querySelector('.nav-item.active').dataset.modelId)) {
            setHomeOnlyElementsVisible(true);
        }
    };
}

function openImageModal(imgUrl) {
    var modal = document.getElementById('imageModal');
    var modalImg = document.getElementById('modalImage');
    if (modal && modalImg) {
        modalImg.src = imgUrl;
        modal.classList.add('show');
    }
}
function closeImageModal() {
    var modal = document.getElementById('imageModal');
    if (modal) modal.classList.remove('show');
}

// ========== 侧边栏 ==========
function closeSidebar() { document.body.classList.add('sidebar-hidden'); }
function toggleSidebar() { document.body.classList.toggle('sidebar-hidden'); }
if ($mobileBtn) $mobileBtn.addEventListener('click', toggleSidebar);
if ($overlay) $overlay.addEventListener('click', closeSidebar);

function setActiveSidebarItem(id) {
    var items = $$('.sidebar-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('active');
    if ($sidebarCompare) $sidebarCompare.classList.remove('compare-active');
    if (id) {
        var el = document.getElementById(id);
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
    // 重新填充筛选器
    populateFilters();
    // 刷新型号选择面板列表（如果打开中）
    if ($modelPanel && $modelPanel.classList.contains('show')) {
        renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : '');
    }
    // 刷新对比页列表（如果当前在对比页）
    if (currentPage === 'compare') {
        renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    }
    // 刷新收藏页（如果当前在收藏页）
    if (currentPage === 'favorites') {
        renderFavoritesPage();
    }
    // 刷新主页欢迎页的统计数字
    if (currentPage === 'detail' && $display && $display.querySelector('.welcome-page')) {
        const statsSpan = $display.querySelector('.welcome-stats span');
        if (statsSpan) statsSpan.textContent = getFilteredModelList().length;
    }
    // 更新筛选摘要（如果有）
    updateFilterSummary();
}

// ========== 主题 ==========
function applyTheme(isLight) {
    document.body.classList.toggle('light-mode', isLight);
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    if ($settingsThemeToggle) $settingsThemeToggle.checked = !isLight;
    var titleImg = document.getElementById('sidebarTitleImg');
    if (titleImg) {
        titleImg.src = isLight ? 'title-light.png' : 'title.png';
    }
}
var savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') applyTheme(true);
else if (savedTheme === 'dark') applyTheme(false);
else {
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(!prefersDark);
}
if ($settingsThemeToggle) {
    $settingsThemeToggle.addEventListener('change', function(e) { applyTheme(!e.target.checked); });
}
var savedThemeColor = localStorage.getItem('themeColor') || 'red';
document.body.classList.add('theme-' + savedThemeColor);
if (themeColorPicker) {
    var activeSwatch = themeColorPicker.querySelector('[data-color="' + savedThemeColor + '"]');
    if (activeSwatch) activeSwatch.classList.add('active');
    themeColorPicker.addEventListener('click', function(e) {
        var swatch = e.target.closest('.color-swatch');
        if (!swatch) return;
        var newColor = swatch.dataset.color;
        var clsList = document.body.classList;
        for (var i = 0; i < clsList.length; i++) {
            if (clsList[i].indexOf('theme-') === 0) document.body.classList.remove(clsList[i]);
        }
        document.body.classList.add('theme-' + newColor);
        localStorage.setItem('themeColor', newColor);
        var swatches = themeColorPicker.querySelectorAll('.color-swatch');
        for (var j = 0; j < swatches.length; j++) swatches[j].classList.remove('active');
        swatch.classList.add('active');
    });
}
if ($translateToggle) {
    $translateToggle.checked = window.getTranslationEnabled ? window.getTranslationEnabled() : false;
    $translateToggle.addEventListener('change', function(e) {
        if (window.setTranslationEnabled) window.setTranslationEnabled(e.target.checked);
        if (currentModelData) renderSpecs(currentModelData);
        else if (currentPage === 'detail') {
            var activeName = document.querySelector('.nav-item.active') && document.querySelector('.nav-item.active').dataset.modelId;
            if (activeName) {
                var model = masterModelList.find(function(m) { return m.model_name === activeName; });
                if (model) renderSpecs(model);
            }
        }
    });
}
window.openSettingsPanel = function() { if ($settingsOverlay) $settingsOverlay.classList.add('show'); };
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
window.closeSettingsPanel = function() { if ($settingsOverlay) $settingsOverlay.classList.remove('show'); };
if ($settingsBtn) $settingsBtn.addEventListener('click', window.openSettingsPanel);

// ========== 页面切换 ==========
window.showDetailPage = function () {
    currentPage = 'detail';
    
    // 隐藏其他页面
    if ($detailPage) $detailPage.classList.remove('hidden');
    if ($comparePage) $comparePage.classList.remove('active');
    if ($favoritesPage) $favoritesPage.classList.remove('active');
    if (document.getElementById('generatorPage')) document.getElementById('generatorPage').classList.remove('active');
    
    // 关闭所有浮动面板
    const modelPanel = document.getElementById('modelSelectOverlay');
    if (modelPanel) modelPanel.classList.remove('show');
    const settingsPanel = document.getElementById('settingsOverlay');
    if (settingsPanel) settingsPanel.classList.remove('show');
    
    // 隐藏文章页面
    const articlesListPage = document.getElementById('articlesListPage');
    const articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    
    setActiveSidebarItem('sidebarHome');
    
    // 重置主内容为欢迎页
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
    
    // 清除当前型号数据和高亮
    currentModelData = null;
    const activeModelItem = document.querySelector('.nav-item.active');
    if (activeModelItem) activeModelItem.classList.remove('active');
    
    // 显示主页专属元素（背景图、语录栏）
    setHomeOnlyElementsVisible(true);
};

window.showHome = function () {
    showDetailPage();
};

window.showComparePage = function() {
    currentPage = 'compare';
    if ($detailPage) $detailPage.classList.add('hidden');
    if ($comparePage) $comparePage.classList.add('active');
    if ($favoritesPage) $favoritesPage.classList.remove('active');
    var genPage = document.getElementById('generatorPage');
    if (genPage) genPage.classList.remove('active');
    var articlesListPage = document.getElementById('articlesListPage');
    var articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    setActiveSidebarItem(null);
    if ($sidebarCompare) $sidebarCompare.classList.add('compare-active');
    setHomeOnlyElementsVisible(false);
    window.closeSearchModal();
    initCompareFilters();
    if (comparePending) {
        if ($comparePageResult) $comparePageResult.innerHTML = '';
        renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    }
    updateCompareActionBtn();
};
if ($sidebarCompare) $sidebarCompare.addEventListener('click', function() { if (currentPage === 'compare') return; window.showComparePage(); });

window.showFavoritesPage = function() {
    currentPage = 'favorites';
    if ($detailPage) $detailPage.classList.add('hidden');
    if ($comparePage) $comparePage.classList.remove('active');
    if ($favoritesPage) $favoritesPage.classList.add('active');
    var genPage = document.getElementById('generatorPage');
    if (genPage) genPage.classList.remove('active');
    var articlesListPage = document.getElementById('articlesListPage');
    var articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    setActiveSidebarItem('sidebarFavorites');
    setHomeOnlyElementsVisible(false);
    window.closeSearchModal();
    renderFavoritesPage();
};

function renderFavoritesPage() {
    const filteredList = getFilteredModelList();
    const list = filteredList.filter(m => favorites.includes(m.model_name));
    if ($favoritesPageSubtitle) $favoritesPageSubtitle.textContent = `已收藏 ${list.length} 个型号`;
    if ($favoritesPageGrid) {
        let html = list.length === 0 ? '<div class="loading-text" style="grid-column:1/-1;">暂无收藏型号</div>' : list.map(m => `<div class="compare-card" onclick="selectFavoriteFromPage('${m.model_name.replace(/'/g, "\\'")}')"><div class="compare-card-info"><div class="compare-card-name">${m.model_name}</div><div class="compare-card-meta"><span>${m.model_family || '系列未知'}</span><span class="compare-part-arch" style="margin-left:6px;">${m.model_generation || '代数未知'}</span></div></div><button class="favorite-remove" onclick="event.stopPropagation(); removeFavoriteFromPage('${m.model_name.replace(/'/g, "\\'")}')" title="取消收藏">×</button></div>`).join('');
        html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
        $favoritesPageGrid.innerHTML = html;
    }
}

// 同时确保依赖的 selectFavoriteFromPage 和 removeFavoriteFromPage 也存在
window.selectFavoriteFromPage = function(name) {
    window.showDetailPage();
    var model = masterModelList.find(function(m) { return m.model_name === name; });
    if (model && model._isLight) {
        loadModelFile(model.filename).then(function() {
            model = masterModelList.find(function(m) { return m.model_name === name; });
            if (model) renderSpecs(model);
        });
    } else if (model) {
        renderSpecs(model);
    }
};

window.removeFavoriteFromPage = function(name) {
    toggleFavorite(name);
    renderFavoritesPage();
    var btn = document.getElementById('favToggleBtn');
    if (btn && btn.dataset.model === name) btn.textContent = '☆ 收藏';
};

window.showGeneratorPage = function() {
    currentPage = 'generator';
    if ($detailPage) $detailPage.classList.add('hidden');
    if ($comparePage) $comparePage.classList.remove('active');
    if ($favoritesPage) $favoritesPage.classList.remove('active');
    var genPage = document.getElementById('generatorPage');
    if (genPage) genPage.classList.add('active');
    var articlesListPage = document.getElementById('articlesListPage');
    var articleDetailPage = document.getElementById('articleDetailPage');
    if (articlesListPage) articlesListPage.style.display = 'none';
    if (articleDetailPage) articleDetailPage.style.display = 'none';
    setActiveSidebarItem('sidebarGenerator');
    setHomeOnlyElementsVisible(false);
    window.closeSearchModal();
    if (window.initGenerator) window.initGenerator();
};

// ========== 文章阅览 ==========
function loadArticlesIndex() {
    return fetch('modeldata/articles/articles.json').then(function(resp) {
        if (!resp.ok) throw new Error('无法加载文章索引');
        return resp.json();
    }).then(function(data) {
        articlesList = data;
        initArticlesFilters();
        applyArticlesFilters();
    }).catch(function(e) {
        console.error('加载文章索引失败:', e);
        var container = document.getElementById('articlesListContainer');
        if (container) container.innerHTML = '<div class="loading-text">加载文章列表失败</div>';
    });
}

function initArticlesFilters() {
    var familySelect = document.getElementById('articlesFamilyFilter');
    if (!familySelect) return;
    var families = [];
    for (var i = 0; i < articlesList.length; i++) {
        if (articlesList[i].family && families.indexOf(articlesList[i].family) === -1) families.push(articlesList[i].family);
    }
    families.sort();
    familySelect.innerHTML = '<option value="">全部分类</option>';
    for (var j = 0; j < families.length; j++) {
        var option = document.createElement('option');
        option.value = families[j];
        option.textContent = families[j];
        familySelect.appendChild(option);
    }
    familySelect.addEventListener('change', function(e) {
        currentFamilyFilter = e.target.value;
        applyArticlesFilters();
    });
    var searchInput = document.getElementById('articlesSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            currentSearchKeyword = e.target.value.trim().toLowerCase();
            applyArticlesFilters();
        });
    }
    var resetBtn = document.getElementById('articlesResetFilterBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            familySelect.value = '';
            searchInput.value = '';
            currentFamilyFilter = '';
            currentSearchKeyword = '';
            applyArticlesFilters();
        });
    }
}

function applyArticlesFilters() {
    var filtered = articlesList.slice();
    if (currentFamilyFilter) {
        filtered = filtered.filter(function(a) { return a.family === currentFamilyFilter; });
    }
    if (currentSearchKeyword) {
        filtered = filtered.filter(function(a) {
            return (a.title && a.title.toLowerCase().indexOf(currentSearchKeyword) !== -1) ||
                   (a.description && a.description.toLowerCase().indexOf(currentSearchKeyword) !== -1);
        });
    }
    articlesFilteredList = filtered;
    renderArticlesList();
}

function renderArticlesList() {
    var container = document.getElementById('articlesListContainer');
    if (!container) return;
    if (!articlesFilteredList.length) {
        container.innerHTML = '<div class="loading-text">没有找到匹配的文章</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < articlesFilteredList.length; i++) {
        var article = articlesFilteredList[i];
        html += '<div class="article-card" onclick="openArticle(\'' + escapeHtml(article.file) + '\')">' +
                '<h3>' + escapeHtml(article.title) + '</h3>' +
                '<div class="article-family">' + escapeHtml(article.family) + '</div>' +
                '<div class="article-desc">' + escapeHtml(article.description) + '</div>' +
                '</div>';
    }
    container.innerHTML = html;
}

function openArticle(fileId) {
    var markdownPath = 'modeldata/articles/' + fileId + '/' + fileId + '.md';
    fetch(markdownPath).then(function(resp) {
        if (!resp.ok) throw new Error('无法加载文章');
        return resp.text();
    }).then(function(markdownText) {
        var baseDir = 'modeldata/articles/' + fileId + '/';
        // 处理图片相对路径
        var processedMarkdown = markdownText.replace(/!\[([^\]]*)\]\((?!https?:\/\/|\/)([^)]+)\)/g, function(match, alt, src) {
            return '![' + alt + '](' + baseDir + src + ')';
        });
        
        var htmlContent = '';
        
        // 检测 marked 是否存在
        if (typeof marked !== 'undefined') {
            // 尝试新版 marked（parse 方法，可能异步）
            if (typeof marked.parse === 'function') {
                // 同步调用，返回结果
                htmlContent = marked.parse(processedMarkdown);
            } 
            // 旧版 marked（直接调用）
            else if (typeof marked === 'function') {
                htmlContent = marked(processedMarkdown);
            } 
            else {
                htmlContent = '<div class="loading-text">Markdown 解析器不可用</div>';
            }
        } else {
            htmlContent = '<div class="loading-text">Markdown 解析器未加载，请刷新页面或检查网络。</div>';
        }
        
        // 获取文章元数据
        var articleMeta = null;
        for (var i = 0; i < articlesList.length; i++) {
            if (articlesList[i].file === fileId) {
                articleMeta = articlesList[i];
                break;
            }
        }
        
        // 更新页面内容
        var titleEl = document.getElementById('articleDetailTitle');
        var metaEl = document.getElementById('articleDetailMeta');
        var contentEl = document.getElementById('articleContent');
        if (titleEl) titleEl.innerHTML = articleMeta ? escapeHtml(articleMeta.title) : fileId;
        if (metaEl) metaEl.innerHTML = '<span>分类：' + escapeHtml(articleMeta ? articleMeta.family : '未分类') + '</span><span style="margin-left: 20px;">描述：' + escapeHtml(articleMeta ? articleMeta.description : '') + '</span>';
        if (contentEl) contentEl.innerHTML = htmlContent;
        
        // 为文章内图片添加点击放大功能
        var articleImages = document.querySelectorAll('#articleContent img');
        for (var j = 0; j < articleImages.length; j++) {
            articleImages[j].style.cursor = 'pointer';
            articleImages[j].onclick = (function(img) {
                return function() { openImageModal(img.src); };
            })(articleImages[j]);
        }
        
        // 切换页面显示
        document.getElementById('articlesListPage').style.display = 'none';
        document.getElementById('articleDetailPage').style.display = 'block';
        document.getElementById('detailPage').classList.add('hidden');
        document.getElementById('comparePage').classList.remove('active');
        document.getElementById('favoritesPage').classList.remove('active');
        document.getElementById('generatorPage').classList.remove('active');
        if (document.querySelector('main')) document.querySelector('main').scrollTop = 0;
        
    }).catch(function(e) {
        console.error('加载文章失败:', e);
        alert('文章加载失败，请检查路径或网络');
    });
}

window.showArticlesPage = function() {
    document.getElementById('detailPage').classList.add('hidden');
    document.getElementById('comparePage').classList.remove('active');
    document.getElementById('favoritesPage').classList.remove('active');
    document.getElementById('generatorPage').classList.remove('active');
    document.getElementById('articlesListPage').style.display = 'block';
    document.getElementById('articleDetailPage').style.display = 'none';
    setActiveSidebarItem('sidebarArticles');
    if (typeof setHomeOnlyElementsVisible === 'function') setHomeOnlyElementsVisible(false);
    var familySelect = document.getElementById('articlesFamilyFilter');
    var searchInput = document.getElementById('articlesSearchInput');
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
window.openModelPanel = function() {
    if (!$modelPanel) return;
    populatePanelFilters(); syncPanelFilters();
    $modelPanel.classList.add('show');
    $modelPanelSearch.value = '';
    renderModelPanelList('');
    $modelPanelSearch.focus();
};
window.closeModelPanel = function() { if ($modelPanel) $modelPanel.classList.remove('show'); };
function populatePanelFilters() {
    if (!$panelFamilySel || !$panelGenerationSel) return;
    var families = [];
    for (var i = 0; i < masterModelList.length; i++) {
        var f = masterModelList[i].model_family;
        if (f && families.indexOf(f) === -1) families.push(f);
    }
    families.sort();
    $panelFamilySel.innerHTML = '<option value="">全部系列</option>';
    for (var j = 0; j < families.length; j++) {
        var o = document.createElement('option');
        o.value = families[j];
        o.textContent = families[j];
        $panelFamilySel.appendChild(o);
    }
    var gens = [];
    for (var k = 0; k < masterModelList.length; k++) {
        var g = masterModelList[k].model_generation;
        if (g && gens.indexOf(g) === -1) gens.push(g);
    }
    gens.sort(function(a, b) {
        var getPriority = function(s) {
            if (s.length === 3) return 1;
            if (s.length === 4) return 2;
            if (s.toLowerCase().indexOf('gen') === 0) return 3;
            return 4;
        };
        return getPriority(a) - getPriority(b) || a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    $panelGenerationSel.innerHTML = '<option value="">全部代数</option>';
    for (var l = 0; l < gens.length; l++) {
        var o2 = document.createElement('option');
        o2.value = gens[l];
        o2.textContent = gens[l];
        $panelGenerationSel.appendChild(o2);
    }
}
function syncPanelFilters() {
    if ($panelFamilyBtn && $panelGenBtn) {
        $panelFamilyBtn.classList.toggle('filter-active', currentFilterType === 'family');
        $panelGenBtn.classList.toggle('filter-active', currentFilterType === 'generation');
    }
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
    var baseList = getPanelFiltered();
    var filtered = query ? baseList.filter(function(m) { return m.model_name.toLowerCase().indexOf(query) !== -1; }) : baseList;
    if (filtered.length === 0) {
        $modelPanelList.innerHTML = '<div class="loading-text">未找到匹配的型号</div>';
        return;
    }
    var html = '';
    for (var i = 0; i < filtered.length; i++) {
        html += '<div class="nav-item" onclick="selectModelFromPanel(\'' + filtered[i].model_name.replace(/'/g, "\\'") + '\')">' + filtered[i].model_name + '</div>';
    }
    $modelPanelList.innerHTML = html;
}
window.selectModelFromPanel = function(name) {
    window.closeModelPanel();
    syncFiltersFromPanel();
    var model = masterModelList.find(function(m) { return m.model_name === name; });
    if (model && model._isLight) {
        loadModelFile(model.filename).then(function() {
            model = masterModelList.find(function(m) { return m.model_name === name; });
            if (model) { if (currentPage !== 'detail') window.showDetailPage(); renderSpecs(model); }
        });
    } else {
        if (model) { if (currentPage !== 'detail') window.showDetailPage(); renderSpecs(model); }
    }
};
function syncFiltersFromPanel() {
    if ($panelFamilySel) currentFamilyValue = $panelFamilySel.value;
    if ($panelGenerationSel) currentGenValue = $panelGenerationSel.value;
    if ($familySel && $panelFamilySel) $familySel.value = currentFamilyValue;
    if ($genSel && $panelGenerationSel) $genSel.value = currentGenValue;
}
if ($modelPanelSearch) $modelPanelSearch.addEventListener('input', function(e) { renderModelPanelList(e.target.value.toLowerCase()); });
if ($panelFamilyBtn) $panelFamilyBtn.addEventListener('click', function() {
    currentFilterType = 'family';
    $panelFamilyBtn.classList.add('filter-active');
    if ($panelGenBtn) $panelGenBtn.classList.remove('filter-active');
    if ($panelFamilySel) $panelFamilySel.style.display = 'block';
    if ($panelGenerationSel) $panelGenerationSel.style.display = 'none';
    renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : '');
});
if ($panelGenBtn) $panelGenBtn.addEventListener('click', function() {
    currentFilterType = 'generation';
    $panelGenBtn.classList.add('filter-active');
    if ($panelFamilyBtn) $panelFamilyBtn.classList.remove('filter-active');
    if ($panelGenerationSel) $panelGenerationSel.style.display = 'block';
    if ($panelFamilySel) $panelFamilySel.style.display = 'none';
    renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : '');
});
if ($panelFamilySel) $panelFamilySel.addEventListener('change', function(e) {
    currentFamilyValue = e.target.value;
    renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : '');
});
if ($panelGenerationSel) $panelGenerationSel.addEventListener('change', function(e) {
    currentGenValue = e.target.value;
    renderModelPanelList($modelPanelSearch ? $modelPanelSearch.value.toLowerCase() : '');
});
if ($panelResetBtn) $panelResetBtn.addEventListener('click', function() {
    if ($panelFamilySel) $panelFamilySel.value = '';
    if ($panelGenerationSel) $panelGenerationSel.value = '';
    currentFamilyValue = '';
    currentGenValue = '';
    renderModelPanelList('');
});

// ========== 数据加载 ==========
function loadModelFile(filename) {
    if (loadedFiles.has(filename)) return Promise.resolve();
    return fetch('modeldata/' + filename).then(function(resp) {
        if (!resp.ok) throw new Error('无法加载: ' + filename);
        return resp.json();
    }).then(function(json) {
        var items = json.thinkpad_database || (Array.isArray(json) ? json : [json]);
        if (!Array.isArray(items)) items = [items];
        for (var i = 0; i < items.length; i++) {
            var laptop = items[i];
            if (!laptop.model_name) continue;
            var full = { filename: filename, model_family: laptop.model_family || '未指定系列', model_generation: laptop.model_generation || '未指定代数', _isLight: false };
            for (var key in laptop) full[key] = laptop[key];
            var idx = masterModelList.findIndex(function(m) { return m.model_name === full.model_name; });
            if (idx >= 0) masterModelList[idx] = full;
            else masterModelList.push(full);
            if (laptop.nickname && typeof laptop.nickname === 'string' && laptop.nickname.trim() !== '') {
                var nick = { filename: filename, model_name: laptop.nickname.trim(), _isNickname: true, _originalName: laptop.model_name };
                for (var k in full) nick[k] = full[k];
                if (laptop.nickfamily && typeof laptop.nickfamily === 'string' && laptop.nickfamily.trim() !== '') nick.model_family = laptop.nickfamily.trim();
                delete nick.addons;
                var nidx = masterModelList.findIndex(function(m) { return m.model_name === nick.model_name; });
                if (nidx >= 0) masterModelList[nidx] = nick;
                else masterModelList.push(nick);
            }
        }
        loadedFiles.add(filename);
        populateFilters();
    }).catch(function(e) { console.error('加载型号文件失败:', e); });
}

function loadIndex() {
    return fetch('modeldata/index.json').then(function(resp) {
        if (!resp.ok) throw new Error('无法加载 index.json');
        return resp.json();
    }).then(function(data) {
        if (!Array.isArray(data)) throw new Error('格式错误');
        masterModelList = [];
        for (var i = 0; i < data.length; i++) {
            var item = data[i];
            masterModelList.push({ model_name: item.name, model_family: item.family || '未指定系列', model_generation: item.generation || '未指定代数', filename: item.file, _isLight: true });
            if (item.nickname && typeof item.nickname === 'string' && item.nickname.trim() !== '') {
                masterModelList.push({ model_name: item.nickname.trim(), model_family: item.nickfamily || item.family || '未指定系列', model_generation: item.generation || '未指定代数', filename: item.file, _isLight: true, _isNickname: true, _originalName: item.name });
            }
        }
        populateFilters();
        updateFavCount();
        updateWelcomeStats();
        var randomImg = Math.floor(Math.random() * 9) + 1;
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
        return loadTricksAndDisplay();
    }).then(function() {
        initHomeBackgroundImage();
        setHomeOnlyElementsVisible(true);
    }).catch(function(e) { console.error('加载索引失败:', e); if ($display) $display.innerHTML = '<div class="loading-text">加载数据失败</div>'; });
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
    var el = $('#welcomeModelCount');
    if (el) el.textContent = masterModelList.length;
}
if ($familyBtn && $genBtn) {
    $familyBtn.addEventListener('click', function() { currentFilterType = 'family'; $familyBtn.classList.add('filter-active'); $genBtn.classList.remove('filter-active'); if ($familySel) $familySel.style.display = 'block'; if ($genSel) $genSel.style.display = 'none'; applyFilter(); });
    $genBtn.addEventListener('click', function() { currentFilterType = 'generation'; $genBtn.classList.add('filter-active'); $familyBtn.classList.remove('filter-active'); if ($genSel) $genSel.style.display = 'block'; if ($familySel) $familySel.style.display = 'none'; applyFilter(); });
}
if ($familySel) $familySel.addEventListener('change', function(e) { currentFamilyValue = e.target.value; applyFilter(); });
if ($genSel) $genSel.addEventListener('change', function(e) { currentGenValue = e.target.value; applyFilter(); });
var resetBtn = $('#resetFilterBtn');
if (resetBtn) resetBtn.addEventListener('click', function() { if ($familySel) $familySel.value = ''; if ($genSel) $genSel.value = ''; currentFamilyValue = ''; currentGenValue = ''; selectedModels = []; applyFilter(); });

window.toggleCard = function(el) { var card = el.closest('.card'); if (card) card.classList.toggle('folded'); };
window.menuTimers = {};
window.menuEnter = function(menuId) { if (window.menuTimers[menuId]) { clearTimeout(window.menuTimers[menuId]); delete window.menuTimers[menuId]; } var menu = document.getElementById(menuId); if (menu) menu.classList.remove('hidden'); };
window.menuLeave = function(menuId) { window.menuTimers[menuId] = setTimeout(function() { var menu = document.getElementById(menuId); if (menu) menu.classList.add('hidden'); delete window.menuTimers[menuId]; }, 150); };

window.closeFruModal = function() { var modal = $('#fruModal'); if (modal) modal.classList.remove('show'); };
function showFruModal(data) {
    if (!$fruModalBody) return;
    var frus = (data && (data.FRUs || data.frus || data.Frus)) || null;
    var html = '<div class="loading-text">无 FRU 信息</div>';
    if (frus) {
        var items = [];
        if (Array.isArray(frus)) {
            items = frus.map(function(f) { return typeof f === 'object' ? Object.entries(f).map(function(entry) { return entry[0] + ': ' + entry[1]; }).join('<br>') : String(f); });
        } else if (typeof frus === 'object') {
            items = Object.entries(frus).map(function(entry) { return entry[0] + ': ' + entry[1]; });
        } else {
            items = [String(frus)];
        }
        html = items.map(function(t) { return '<div class="fru-item">' + t + '</div>'; }).join('');
    }
    html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
    $fruModalBody.innerHTML = html;
    var modal = $('#fruModal');
    if (modal) modal.classList.add('show');
}
window.showFruModalByPart = function(partData) { showFruModal(partData); };
window.showFruModalByPartId = function(partId) { if (!currentDeviceParts) return; var parts = partId.split('_'); var type = parts[0]; var index = parseInt(parts[1], 10); var part = currentDeviceParts[type] && currentDeviceParts[type][index]; if (part) showFruModal(part.data); };

window.closeSearchModal = function() { var modal = $('#searchModal'); if (modal) modal.classList.remove('show'); };
window.openSearchModal = function() { var modal = $('#searchModal'); if (!modal) return; modal.classList.add('show'); if ($searchInput) { $searchInput.focus(); $searchInput.value = ''; } if ($searchResults) $searchResults.innerHTML = ''; };
if ($searchInput) {
    $searchInput.addEventListener('input', function(e) {
        if (!$searchResults) return;
        var q = e.target.value.toLowerCase();
        var results = masterModelList.filter(function(m) { return m.model_name.toLowerCase().indexOf(q) !== -1; }).slice(0, 30);
        if (results.length === 0) $searchResults.innerHTML = '<div class="loading-text">未找到匹配的型号</div>';
        else {
            var html = '';
            for (var i = 0; i < results.length; i++) {
                html += '<div class="search-result" onclick="window.selectFromSearch(\'' + results[i].model_name.replace(/'/g, "\\'") + '\')"><div class="name">' + results[i].model_name + '</div><div class="meta">' + (results[i].model_family || '') + ' · ' + (results[i].model_generation || '') + '</div></div>';
            }
            html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
            $searchResults.innerHTML = html;
        }
    });
    $searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var now = Date.now();
            if ($searchInput.value.trim() === '我也不知道写点啥') {
                if (now - lastEnterTime < 500) {
                    secretTipsEnabled = true;
                    var activeModelName = document.querySelector('.nav-item.active') && document.querySelector('.nav-item.active').dataset.modelId;
                    if (activeModelName) {
                        var model = masterModelList.find(function(m) { return m.model_name === activeModelName; });
                        if (model) renderSpecs(model);
                    }
                    window.closeSearchModal();
                    lastEnterTime = 0;
                } else lastEnterTime = now;
            } else lastEnterTime = 0;
        }
    });
}
window.selectFromSearch = function(name) {
    var model = masterModelList.find(function(m) { return m.model_name === name; });
    if (model && model._isLight) {
        loadModelFile(model.filename).then(function() {
            model = masterModelList.find(function(m) { return m.model_name === name; });
            if (model) { if (currentPage !== 'detail') window.showDetailPage(); renderSpecs(model); }
        });
    } else {
        if (model) { if (currentPage !== 'detail') window.showDetailPage(); renderSpecs(model); }
    }
    window.closeSearchModal();
};
var searchModalEl = $('#searchModal');
if (searchModalEl) searchModalEl.addEventListener('click', function(e) { if (e.target === this) window.closeSearchModal(); });

window.closeCompareSelectModal = function() { var modal = $('#compareSelectModal'); if (modal) modal.classList.remove('show'); };
window.toggleSelectModel = function(name, checked) { var model = masterModelList.find(function(m) { return m.model_name === name; }); if (!model) return; if (checked) { if (!selectedModels.some(function(m) { return m.model_name === name; })) selectedModels.push(model); } else selectedModels = selectedModels.filter(function(m) { return m.model_name !== name; }); };
window.clearSelectedModels = function() { selectedModels = []; };
function initCompareFilters() {
    if (compareFiltersInitialized) return;
    
    const toolbar = document.querySelector('#comparePage .compare-toolbar');
    if (!toolbar) return;
    
    // 获取所有唯一的系列和代数
    const families = [...new Set(masterModelList.map(m => m.model_family).filter(Boolean))].sort();
    const gens = [...new Set(masterModelList.map(m => m.model_generation).filter(Boolean))].sort((a, b) => {
        // 按数字或字母排序
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    });
    
    // 创建系列筛选下拉框
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
    
    // 创建代数筛选下拉框
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
    
    // 插入到搜索框之前
    const searchInput = document.getElementById('comparePageSearch');
    if (searchInput && searchInput.parentNode) {
        searchInput.parentNode.insertBefore(familySelect, searchInput);
        searchInput.parentNode.insertBefore(genSelect, searchInput);
        // 添加一些间距
        familySelect.style.marginRight = '8px';
        genSelect.style.marginRight = '8px';
    } else {
        toolbar.appendChild(familySelect);
        toolbar.appendChild(genSelect);
    }
    
    // 绑定事件
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
function resetComparePage() { compareModels = []; comparePending = true; selectedModels = []; if ($comparePageSearch) $comparePageSearch.value = ''; if ($comparePageResult) $comparePageResult.innerHTML = ''; renderComparePageGrid(''); updateCompareActionBtn(); }
function updateCompareActionBtn() { var btn = $('#runCompareBtn'); if (!btn) return; if (comparePending) { btn.textContent = compareModels.length >= 2 ? '开始对比' : '已选 ' + compareModels.length + ' 个'; btn.classList.add('btn-accent'); btn.disabled = compareModels.length < 2; } else { btn.textContent = '重新选择'; btn.classList.remove('btn-accent'); btn.disabled = false; } }
function renderComparePageGrid(q) {
    if (!$comparePageGrid) return;
    q = (q || '').toLowerCase();
    let filtered = getFilteredModelList().filter(m => m.model_name.toLowerCase().includes(q));
    
    // 系列筛选
    if (currentCompareFamily) {
        filtered = filtered.filter(m => m.model_family === currentCompareFamily);
    }
    // 代数筛选
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
window.toggleComparePageModel = function(name) {
    if (!comparePending) return;
    var idx = compareModels.indexOf(name);
    if (idx >= 0) compareModels.splice(idx, 1);
    else { if (compareModels.length >= 5) { alert('最多选择 5 个型号进行对比'); return; } compareModels.push(name); }
    renderComparePageGrid($comparePageSearch ? $comparePageSearch.value.trim() : '');
    if ($comparePageResult) $comparePageResult.innerHTML = '';
    updateCompareActionBtn();
};
if ($comparePageSearch) $comparePageSearch.addEventListener('input', function(e) { if (!comparePending) return; renderComparePageGrid(e.target.value); });
var clearBtn = $('#clearComparePageBtn');
if (clearBtn) clearBtn.addEventListener('click', function() { compareModels = []; comparePending = true; selectedModels = []; if ($comparePageSearch) $comparePageSearch.value = ''; if ($comparePageResult) $comparePageResult.innerHTML = ''; renderComparePageGrid(''); updateCompareActionBtn(); });
var runBtn = $('#runCompareBtn');
if (runBtn) {
    runBtn.addEventListener('click', function() {
        if (comparePending) {
            if (compareModels.length < 2) { alert('请至少选择两个型号'); return; }
            if ($comparePageResult) $comparePageResult.innerHTML = '<div class="loading-text">加载型号数据中...</div>';
            if ($comparePageGrid) $comparePageGrid.innerHTML = '';
            var modelsToLoad = compareModels.map(function(name) { return masterModelList.find(function(x) { return x.model_name === name; }); }).filter(function(x) { return x; });
            var loadPromises = [];
            for (var i = 0; i < modelsToLoad.length; i++) {
                var m = modelsToLoad[i];
                if (m._isLight) loadPromises.push(loadModelFile(m.filename));
            }
            Promise.all(loadPromises).then(function() {
                var loadedModels = compareModels.map(function(name) { return masterModelList.find(function(x) { return x.model_name === name; }); }).filter(function(x) { return x; });
                selectedModels = loadedModels;
                var devicesPromises = loadedModels.map(function(model) { return loadDeviceParts(model).then(function(parts) { return { model: model, parts: parts }; }); });
                return Promise.all(devicesPromises);
            }).then(function(devicesWithParts) {
                renderCompareResultTable(devicesWithParts);
                comparePending = false;
                updateCompareActionBtn();
            }).catch(function(e) { console.error('对比失败:', e); if ($comparePageResult) $comparePageResult.innerHTML = '<div class="loading-text">加载对比数据失败，请重试</div>'; });
        } else resetComparePage();
    });
}

function makeCard(title, contentHtml, useFlow) {
    var bodyClass = useFlow ? 'card-body card-body-flow' : 'card-body';
    return '<div class="card"><div class="card-title" onclick="toggleCard(this)"><span>' + title + '</span><span class="card-chevron">▼</span></div><div class="' + bodyClass + '">' + contentHtml + '</div></div>';
}

function renderBatteryItems(batteries) {
    if (!batteries || batteries.length === 0) return '<span style="color:var(--text-muted);">无电池信息</span>';
    var html = '';
    for (var i = 0; i < batteries.length; i++) {
        var b = batteries[i];
        var title = b.type || '未命名电池';
        html += '<div class="part-row"><div class="part-info-wrap">' +
                '<div class="part-title-text">' + title + '</div>';
        if (b.capacity) html += '<div class="part-field"><span class="field-name">容量</span><span class="field-value">' + b.capacity + '</span></div>';
        if (b.form) html += '<div class="part-field"><span class="field-name">规格</span><span class="field-value">' + b.form + '</span></div>';
        if (b.tech) html += '<div class="part-field"><span class="field-name">技术</span><span class="field-value">' + b.tech + '</span></div>';
        html += '</div></div>';
    }
    return html;
}

function renderStorageItems(storage) {
    var labels = { ssd_sata: 'SATA SSD', ssd_pcie: 'PCIe SSD', hdd: 'HDD', sshd: 'SSHD', optical: '光驱', floppy: '软驱', optane: '傲腾', emmc: 'eMMC' };
    if (!storage) return '<span style="color:var(--text-muted);">无存储信息</span>';
    var entries = [];
    for (var key in storage) {
        if (storage.hasOwnProperty(key) && storage[key] && typeof storage[key] === 'string' && storage[key].trim() !== '') entries.push([key, storage[key]]);
    }
    if (entries.length === 0) return '<span style="color:var(--text-muted);">无存储信息</span>';
    var html = '';
    for (var i = 0; i < entries.length; i++) {
        var key = entries[i][0];
        var value = entries[i][1];
        var label = labels[key] || key.replace(/_/g, ' ');
        html += '<div class="part-row"><div class="part-info-wrap">' +
                '<div class="part-title-text">' + label + '</div>' +
                '<div class="part-field"><span class="field-name">容量</span><span class="field-value">' + value + '</span></div>' +
                '</div></div>';
    }
    return html;
}

function renderCompareResultTable(devicesWithParts) {
    function formatMemory(model) { if (!model.memory) return 'N/A'; var html = ''; if (model.memory.max_capacity) html += model.memory.max_capacity; if (model.memory.type) html += ' ' + model.memory.type; if (model.memory.slots) html += ' (' + model.memory.slots + '插槽)'; return html.trim() || 'N/A'; }
    function formatStorage(model) { if (!model.storage) return 'N/A'; var labels = { ssd_sata: 'SATA', ssd_pcie: 'PCIe', hdd: 'HDD', sshd: 'SSHD', optical: '光驱', floppy: '软驱', optane: '傲腾', emmc: 'eMMC' }; var parts = []; for (var k in model.storage) { if (model.storage[k] && typeof model.storage[k] === 'string' && model.storage[k].trim()) parts.push('<div>' + (labels[k] || k) + ': ' + model.storage[k] + '</div>'); } return parts.join('') || 'N/A'; }
    function formatBattery(model) { var bats = model.Battary || model.battery || []; if (bats.length === 0) return 'N/A'; var html = ''; for (var i = 0; i < bats.length; i++) { var b = bats[i]; html += '<div class="compare-part-item">' + (b.type || '电池') + '<br>容量: ' + (b.capacity || b.cap || '?') + ' | 规格: ' + (b.form || '?') + ' | 技术: ' + (b.tech || '?') + '</div>'; } return html; }
    function checkAllSame(getter) { var values = devicesWithParts.map(function(d) { return getter(d.model); }); return values.every(function(v) { return v === values[0]; }) ? values[0] : null; }
    function checkPartsAllSame(type) { var signatures = devicesWithParts.map(function(d) { var parts = d.parts && d.parts[type] || []; return parts.map(function(p) { var data = p.data && p.data.thinkpad_database ? p.data.thinkpad_database[0] : p.data; return data.model || p.name; }).sort().join('|'); }); return signatures.every(function(s) { return s === signatures[0]; }) ? signatures[0] : null; }
    function renderPartSummary(partsArr, type, model) { if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>'; var html = ''; for (var i = 0; i < partsArr.length; i++) { var part = partsArr[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.model || d.type || part.name || '未知'; var arch = d.Architecture || d.Generation || d.generation || ''; var detailId = 'detail-' + type + '-' + model.model_name.replace(/[^a-zA-Z0-9]/g, '_') + '-' + i; var filename = part.name; html += '<div class="compare-part-summary" id="' + detailId + '-summary"><div><span class="compare-part-name">' + name + '</span>' + (arch ? '<span class="compare-part-arch">' + arch + '</span>' : '') + '</div><button class="btn btn-sm compare-detail-btn" onclick="togglePartDetail(\'' + detailId + '\', \'' + type + '\', \'' + filename.replace(/'/g, "\\'") + '\')">展开详情</button></div><div class="compare-part-detail hidden" id="' + detailId + '-detail"><div class="loading-text" style="padding:12px;">加载中...</div></div>'; } return html; }
    function buildPartCard(title, type, devicesWithParts, renderFn) { var html = '<div class="card"><div class="card-title"><span>' + title + '</span></div><div class="card-body compare-card-body">'; for (var i = 0; i < devicesWithParts.length; i++) { html += '<div class="compare-model-col">' + renderFn(devicesWithParts[i].parts && devicesWithParts[i].parts[type], type, devicesWithParts[i].model) + '</div>'; } html += '</div></div>'; return html; }
    function renderPartsIfSame(title, type) { var same = checkPartsAllSame(type); if (same !== null) { var firstParts = devicesWithParts[0].parts && devicesWithParts[0].parts[type] || []; if (firstParts.length === 0) return '<div class="compare-row compare-merged"><div class="compare-merged-label">' + title + '</div><div class="compare-merged-value" style="color:var(--text-muted);">无</div></div>'; var itemsHtml = ''; for (var i = 0; i < firstParts.length; i++) { var part = firstParts[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.model || d.type || part.name || '未知'; var arch = d.Architecture || d.Generation || d.generation || ''; var detailId = 'detail-merged-' + type + '-' + i; var filename = part.name; itemsHtml += '<div class="compare-part-summary" id="' + detailId + '-summary"><div><span class="compare-part-name">' + name + '</span>' + (arch ? '<span class="compare-part-arch">' + arch + '</span>' : '') + '</div><button class="btn btn-sm compare-detail-btn" onclick="togglePartDetail(\'' + detailId + '\', \'' + type + '\', \'' + filename.replace(/'/g, "\\'") + '\')">展开详情</button></div><div class="compare-part-detail hidden" id="' + detailId + '-detail"><div class="loading-text" style="padding:12px;">加载中...</div></div>'; } return '<div class="compare-row compare-merged"><div class="compare-merged-label">' + title + '</div><div class="compare-merged-value">' + itemsHtml + '</div></div>'; } return null; }

    var mergedHtml = '';
    var cpuMerged = renderPartsIfSame('处理器 (CPU)', 'cpu');
    if (cpuMerged) mergedHtml += cpuMerged; else mergedHtml += buildPartCard('处理器 (CPU)', 'cpu', devicesWithParts, renderPartSummary);
    var gpuMerged = renderPartsIfSame('显卡', 'graphics');
    if (gpuMerged) mergedHtml += gpuMerged; else mergedHtml += buildPartCard('显卡', 'graphics', devicesWithParts, renderPartSummary);
    var dispSame = renderPartsIfSame('显示屏', 'display');
    if (dispSame) mergedHtml += dispSame; else mergedHtml += buildPartCard('显示屏', 'display', devicesWithParts, function(partsArr, type, model) { if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>'; var html = ''; for (var i = 0; i < partsArr.length; i++) { var part = partsArr[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.type || part.name || '未知'; var info = [window.translateTech(d.tech), d.brightness, d.refresh_rate].filter(function(x) { return x; }).join(' · '); html += '<div><b>' + name + '</b>' + (info ? '<br>' + info : '') + '</div>'; } return html; });
    var memSame = checkAllSame(formatMemory);
    if (memSame !== null) mergedHtml += '<div class="compare-row compare-merged"><div class="compare-merged-label">内存</div><div class="compare-merged-value">' + memSame + '</div></div>';
    else { mergedHtml += '<div class="card"><div class="card-title"><span>内存</span></div><div class="card-body compare-card-body">'; for (var i = 0; i < devicesWithParts.length; i++) { mergedHtml += '<div class="compare-model-col"><div style="padding:6px 0;">' + formatMemory(devicesWithParts[i].model) + '</div></div>'; } mergedHtml += '</div></div>'; }
    var storSame = checkAllSame(formatStorage);
    if (storSame !== null) mergedHtml += '<div class="compare-row compare-merged"><div class="compare-merged-label">储存</div><div class="compare-merged-value">' + storSame + '</div></div>';
    else { mergedHtml += '<div class="card"><div class="card-title"><span>储存</span></div><div class="card-body compare-card-body">'; for (var i = 0; i < devicesWithParts.length; i++) { mergedHtml += '<div class="compare-model-col"><div style="padding:6px 0;">' + formatStorage(devicesWithParts[i].model) + '</div></div>'; } mergedHtml += '</div></div>'; }
    var battSame = checkAllSame(formatBattery);
    if (battSame !== null) mergedHtml += '<div class="compare-row compare-merged"><div class="compare-merged-label">电池</div><div class="compare-merged-value">' + battSame + '</div></div>';
    else { mergedHtml += '<div class="card"><div class="card-title"><span>电池</span></div><div class="card-body compare-card-body">'; for (var i = 0; i < devicesWithParts.length; i++) { mergedHtml += '<div class="compare-model-col"><div style="padding:6px 0;">' + formatBattery(devicesWithParts[i].model) + '</div></div>'; } mergedHtml += '</div></div>'; }
    var ethSame = renderPartsIfSame('有线网卡', 'ethernet');
    if (ethSame) mergedHtml += ethSame; else mergedHtml += buildPartCard('有线网卡', 'ethernet', devicesWithParts, function(partsArr, type, model) { if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>'; var html = ''; for (var i = 0; i < partsArr.length; i++) { var part = partsArr[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.type || d['model-type'] || part.name || '未知'; html += '<div><b>' + name + '</b>'; if (d['model-type']) html += '<br>功能: ' + d['model-type']; if (d.speed) html += '<br>连接速度: ' + d.speed; html += '</div>'; } return html; });
    var wlanSame = renderPartsIfSame('无线网卡', 'wlan');
    if (wlanSame) mergedHtml += wlanSame; else mergedHtml += buildPartCard('无线网卡', 'wlan', devicesWithParts, function(partsArr, type, model) { if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>'; var html = ''; for (var i = 0; i < partsArr.length; i++) { var part = partsArr[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.model || d.type || part.name || '未知'; html += '<div><b>' + name + '</b>'; if (d.form) html += '<br>形态: ' + d.form; if (d.feature) html += '<br>功能: ' + d.feature; html += '</div>'; } return html; });
    var wwanSame = renderPartsIfSame('WWAN', 'wwan');
    if (wwanSame) mergedHtml += wwanSame; else mergedHtml += buildPartCard('WWAN', 'wwan', devicesWithParts, function(partsArr, type, model) { if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>'; var html = ''; for (var i = 0; i < partsArr.length; i++) { var part = partsArr[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.model || d.type || part.name || '未知'; html += '<div><b>' + name + '</b>'; if (d.form) html += '<br>形态: ' + d.form; if (d.feature) html += '<br>功能: ' + d.feature; html += '</div>'; } return html; });
    var dockSame = renderPartsIfSame('扩展坞', 'dock');
    if (dockSame) mergedHtml += dockSame; else mergedHtml += buildPartCard('扩展坞', 'dock', devicesWithParts, function(partsArr, type, model) { if (!partsArr || partsArr.length === 0) return '<span style="color:var(--text-muted);">-</span>'; var html = ''; for (var i = 0; i < partsArr.length; i++) { var part = partsArr[i]; var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data; var name = d.model || d.type || part.name || '未知'; html += '<div><b>' + name + '</b>'; if (d.power) html += '<br>供电: ' + d.power; if (d.ports && Array.isArray(d.ports)) html += '<br>端口: ' + d.ports.join('、'); else if (d.ports) html += '<br>端口: ' + d.ports; html += '</div>'; } return html; });
    var diffHtml = '<div class="card"><div class="card-title"><span>接口与其他</span></div><div class="card-body card-body-flow" style="overflow-x:auto;"><table class="compare-table"><thead><tr><th>规格</th>';
    for (var i = 0; i < devicesWithParts.length; i++) diffHtml += '<th>' + devicesWithParts[i].model.model_name + '</th>';
    diffHtml += '</tr></thead><tbody>';
    var miscRows = [
        { label: '接口', getValue: function(m) { return Array.isArray(m.ports) ? m.ports.join('、') : (m.ports || '-'); } },
        { label: '尺寸', getValue: function(m) { return (m.physical && m.physical.dimensions) || '-'; } },
        { label: '重量', getValue: function(m) { return (m.physical && m.physical.weight) || '-'; } },
        { label: '材质', getValue: function(m) { return (m.physical && m.physical.case_material) || m.case_material || '-'; } },
        { label: '安全特性', getValue: function(m) { return Array.isArray(m.security) ? m.security.join('、') : (m.security || '-'); } },
        { label: '预装系统', getValue: function(m) { return Array.isArray(m.system) ? m.system.join('<br>') : (m.system || '-'); } }
    ];
    for (var i = 0; i < miscRows.length; i++) {
        var row = miscRows[i];
        var sameValue = checkAllSame(row.getValue);
        if (sameValue !== null) diffHtml += '<tr><td><b>' + row.label + '</b></td><td colspan="' + devicesWithParts.length + '" style="color:var(--accent);">' + sameValue + '</td></tr>';
        else {
            diffHtml += '<tr>';
            diffHtml += '<td><b>' + row.label + '</b></td>';
            for (var j = 0; j < devicesWithParts.length; j++) diffHtml += '<td>' + row.getValue(devicesWithParts[j].model) + '</td>';
            diffHtml += '</tr>';
        }
    }
    diffHtml += '</tbody></table></div></div>';
    var headerHtml = '<div class="compare-header"><div class="compare-header-models">';
    for (var i = 0; i < devicesWithParts.length; i++) headerHtml += '<div class="compare-header-model">' + devicesWithParts[i].model.model_name + '</div>';
    headerHtml += '</div></div>';
    var finalHtml = headerHtml;
    if (mergedHtml) finalHtml += '<div class="card"><div class="card-title"><span>配置对比</span></div><div class="card-body card-body-flow">' + mergedHtml + '</div></div>';
    finalHtml += diffHtml;
    finalHtml = window.globalTranslateHTML ? window.globalTranslateHTML(finalHtml) : finalHtml;
    if ($comparePageResult) {
        $comparePageResult.innerHTML = finalHtml;
        $comparePageResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

var PART_FIELD_LABELS = {
    'model': '型号', 'type': '类型', 'Architecture': '架构', 'generation': '代数', 'family': '系列',
    'cores_threads': '核心/线程', 'base_freq': '基础频率', 'turbo_freq': '睿频', 'cache': '缓存', 'TDP': 'TDP', 'graphics': '集成显卡', 'socket': '插槽', 'process': '制程',
    'VRAM': '显存', 'Generation': '架构', 'Shading Units': '着色单元',
    'tech': '面板技术', 'brightness': '亮度', 'contrast': '对比度', 'viewing_angle': '视角', 'touch': '触摸', 'refresh_rate': '刷新率', 'color_gamut': '色域',
    'model-type': '型号/类型', 'form': '形态', 'feature': '特性', 'interface': '接口', 'protocol': '协议', 'speed': '速率', 'chipset': '芯片组', 'antenna': '天线',
    'ports': '端口', 'power': '供电',
};
function getFieldLabel(key) { return PART_FIELD_LABELS[key] || key.replace(/_/g, ' '); }

function loadFullPartDetails(type, filename) {
    if (!filename) return Promise.resolve(null);
    var fullName = filename.endsWith('.json') ? filename : filename + '.json';
    var folderMap = { cpu: 'CPU', graphics: 'Graphics' };
    var folder = folderMap[type] || type;
    return fetch('modeldata/' + folder + '/' + fullName).then(function(resp) { if (!resp.ok) return null; return resp.json(); }).catch(function(e) { console.error('加载完整零件失败:', e); return null; });
}
window.togglePartDetail = function(detailId, type, filename) {
    var summaryEl = document.getElementById(detailId + '-summary');
    var detailEl = document.getElementById(detailId + '-detail');
    if (!detailEl) return;
    if (!detailEl.classList.contains('hidden')) {
        detailEl.classList.add('hidden');
        var btn = summaryEl && summaryEl.querySelector('.compare-detail-btn');
        if (btn) btn.textContent = '展开详情';
        return;
    }
    detailEl.classList.remove('hidden');
    var btn = summaryEl && summaryEl.querySelector('.compare-detail-btn');
    if (btn) btn.textContent = '收起详情';
    if (detailEl.querySelector('.loading-text')) {
        loadFullPartDetails(type, filename).then(function(fullData) {
            if (fullData) {
                var d = fullData.thinkpad_database ? fullData.thinkpad_database[0] : fullData;
                var lines = [];
                var excludeKeys = ['FRUs', 'frus', 'Frus', 'iconfamily', 'ark'];
                if (type === 'cpu' || type === 'graphics') excludeKeys.push('model');
                if (type === 'display') excludeKeys.push('model', 'type');
                for (var k in d) {
                    if (excludeKeys.indexOf(k) !== -1) continue;
                    if (d[k] == null || d[k] === '') continue;
                    if (typeof d[k] === 'object') continue;
                    var label = getFieldLabel(k);
                    lines.push('<div class="part-field"><span class="field-name">' + label + '</span><span class="field-value">' + d[k] + '</span></div>');
                }
                detailEl.innerHTML = lines.join('') || '<span style="color:var(--text-muted);">无详细信息</span>';
            } else detailEl.innerHTML = '<span style="color:var(--text-muted);">加载失败</span>';
        });
    }
};
window.closeCompareModal = function() { var modal = $('#compareModal'); if (modal) modal.classList.remove('show'); };
var confirmBtn = $('#confirmCompareBtn');
if (confirmBtn) confirmBtn.addEventListener('click', function() {
    if (selectedModels.length === 0) return;
    var loadPromises = [];
    for (var i = 0; i < selectedModels.length; i++) { if (selectedModels[i]._isLight) loadPromises.push(loadModelFile(selectedModels[i].filename)); }
    Promise.all(loadPromises).then(function() {
        var modal = $('#compareSelectModal');
        if (modal) modal.classList.remove('show');
        showCompareModalLegacy();
    });
});
var compareSelectModalEl = $('#compareSelectModal');
if (compareSelectModalEl) compareSelectModalEl.addEventListener('click', function(e) { if (e.target === this) window.closeCompareSelectModal(); });

function showCompareModalLegacy() {
    if (!$compareModalBody) return;
    $compareModalBody.innerHTML = '<div class="loading-text">加载对比数据中...</div>';
    var modal = $('#compareModal'); if (modal) modal.classList.add('show');
    var devicesPromises = selectedModels.map(function(model) { return loadDeviceParts(model).then(function(parts) { return { model: model, parts: parts }; }); });
    Promise.all(devicesPromises).then(function(devicesWithParts) {
        function formatMemory(model) { if (!model.memory) return 'N/A'; var html = ''; if (model.memory.max_capacity) html += '容量: ' + model.memory.max_capacity + '<br>'; if (model.memory.type) html += '类型: ' + model.memory.type + '<br>'; if (model.memory.slots) html += '插槽: ' + model.memory.slots; return html || 'N/A'; }
        function formatStorage(model) { if (!model.storage) return 'N/A'; var labels = { ssd_sata: 'SATA SSD', ssd_pcie: 'PCIe SSD', hdd: 'HDD', sshd: 'SSHD', optical: '光驱', floppy: '软驱', optane: '傲腾', emmc: 'eMMC' }; var parts = []; for (var k in model.storage) { if (model.storage[k] && typeof model.storage[k] === 'string' && model.storage[k].trim()) parts.push('<b>' + (labels[k] || k) + ':</b> ' + model.storage[k]); } return parts.join('<br>') || 'N/A'; }
        function formatBattery(model) { var bats = model.Battary || model.battery || []; if (bats.length === 0) return 'N/A'; var html = ''; for (var i = 0; i < bats.length; i++) { var b = bats[i]; html += (b.type || '电池') + ': 容量 ' + (b.capacity || b.cap || '') + ' / 规格 ' + (b.form || '') + ' / 技术 ' + (b.tech || '') + '<br>'; } return html; }
        function formatPorts(model) { if (!model.ports) return 'N/A'; return Array.isArray(model.ports) ? model.ports.join('、') : String(model.ports); }
        function formatOther(model) { var items = []; if (model.physical && model.physical.dimensions) items.push('尺寸: ' + model.physical.dimensions); if (model.physical && model.physical.weight) items.push('重量: ' + model.physical.weight); if ((model.physical && model.physical.case_material) || model.case_material) items.push('材质: ' + (model.physical && model.physical.case_material) || model.case_material); if (model.security) items.push('安全: ' + (Array.isArray(model.security) ? model.security.join('、') : model.security)); return items.join('<br>') || 'N/A'; }
        function formatPartFullInfo(data, type) { if (!data) return '无信息'; var d = data.thinkpad_database ? data.thinkpad_database[0] : data; var lines = []; if (type === 'cpu') { if (d.model) lines.push('<b>' + d.model + '</b>'); if (d.cores_threads) lines.push(d.cores_threads); if (d.base_freq) lines.push('基础: ' + d.base_freq); if (d.turbo_freq && d.turbo_freq !== 'null') lines.push('睿频: ' + d.turbo_freq); if (d.cache) lines.push('缓存: ' + d.cache); if (d.graphics) lines.push('集显: ' + d.graphics); } else if (type === 'display') { if (d.type) lines.push('<b>' + d.type + '</b>'); if (d.tech) lines.push(window.translateTech(d.tech)); if (d.brightness) lines.push('亮度: ' + d.brightness); if (d.refresh_rate) lines.push('刷新率: ' + d.refresh_rate); if (d.color_gamut) lines.push('色域: ' + d.color_gamut); if (d.touch) lines.push('触摸: ' + d.touch); } else if (type === 'graphics') { if (d.model) lines.push('<b>' + d.model + '</b>'); if (d.VRAM) lines.push('显存: ' + d.VRAM); if (d.Generation) lines.push('架构: ' + d.Generation); if (d['Shading Units']) lines.push('着色单元: ' + d['Shading Units']); if (d.base_freq) lines.push('基础频率: ' + d.base_freq); } else if (type === 'ethernet') { if (d.type) lines.push('<b>' + d.type + '</b>'); if (d['model-type']) lines.push('功能: ' + d['model-type']); if (d.speed) lines.push('连接速度: ' + d.speed); for (var k in d) { if (['type', 'model-type', 'speed'].indexOf(k) !== -1) continue; if (d[k] && typeof d[k] !== 'object') lines.push(k.replace(/_/g, ' ') + ': ' + d[k]); } } else if (type === 'wlan' || type === 'wwan') { if (d.model) lines.push('<b>' + d.model + '</b>'); else if (d.type) lines.push('<b>' + d.type + '</b>'); if (d.form) lines.push('形态: ' + d.form); if (d.feature) lines.push('功能: ' + d.feature); for (var k in d) { if (['model', 'type', 'form', 'feature', 'FRUs', 'frus', 'Frus'].indexOf(k) !== -1) continue; if (d[k] && typeof d[k] !== 'object') lines.push(k.replace(/_/g, ' ') + ': ' + d[k]); } } else if (type === 'dock') { if (d.model) lines.push('<b>' + d.model + '</b>'); if (d.ports) { var portsStr = Array.isArray(d.ports) ? d.ports.join('、') : d.ports; lines.push('端口: ' + portsStr); } if (d.power) lines.push('供电: ' + d.power); } else { if (d.model) lines.push('<b>' + d.model + '</b>'); else if (d.type) lines.push('<b>' + d.type + '</b>'); } return lines.join('<br>') || 'N/A'; }
        var rows = [
            { label: '处理器 (CPU)', getValue: function(m, p) { var arr = p.cpu || []; return arr.map(function(x) { return formatPartFullInfo(x.data, 'cpu'); }).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无'; } },
            { label: '显卡', getValue: function(m, p) { var arr = p.graphics || []; return arr.map(function(x) { return formatPartFullInfo(x.data, 'graphics'); }).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无'; } },
            { label: '内存', getValue: function(m) { return formatMemory(m); } },
            { label: '显示屏', getValue: function(m, p) { var arr = p.display || []; return arr.map(function(x) { return formatPartFullInfo(x.data, 'display'); }).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无'; } },
            { label: '储存', getValue: function(m) { return formatStorage(m); } },
            { label: '电池', getValue: function(m) { return formatBattery(m); } },
            { label: '有线网卡', getValue: function(m, p) { var arr = p.ethernet || []; return arr.map(function(x) { return formatPartFullInfo(x.data, 'ethernet'); }).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无'; } },
            { label: '无线网卡', getValue: function(m, p) { var arr = p.wlan || []; return arr.map(function(x) { return formatPartFullInfo(x.data, 'wlan'); }).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无'; } },
            { label: 'WWAN', getValue: function(m, p) { var arr = p.wwan || []; return arr.map(function(x) { return formatPartFullInfo(x.data, 'wwan'); }).join('<hr style="border:0;border-top:1px dashed var(--border);margin:6px 0;">') || '无'; } },
            { label: '物理接口', getValue: function(m) { return formatPorts(m); } },
            { label: '其他', getValue: function(m) { return formatOther(m); } }
        ];
        var html = '<table class="compare-table"><thead><tr><th>规格</th>';
        for (var i = 0; i < devicesWithParts.length; i++) html += '<th>' + devicesWithParts[i].model.model_name + '</th>';
        html += '</tr></thead><tbody>';
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            html += '<tr>';
            html += '<td><b>' + row.label + '</b></td>';
            for (var j = 0; j < devicesWithParts.length; j++) html += '<td>' + row.getValue(devicesWithParts[j].model, devicesWithParts[j].parts) + '</td>';
            html += '</tr>';
        }
        html += '</tbody></table>';
        html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
        $compareModalBody.innerHTML = html;
    }).catch(function(e) { console.error('对比失败:', e); $compareModalBody.innerHTML = '<div class="loading-text">加载对比数据失败</div>'; });
}
var compareModalEl = $('#compareModal');
if (compareModalEl) compareModalEl.addEventListener('click', function(e) { if (e.target === this) window.closeCompareModal(); });

function loadPartData(type, filename) {
    if (!filename) return Promise.resolve(null);
    var fullName = filename.endsWith('.json') ? filename : filename + '.json';
    if (partsCache[type] && partsCache[type][fullName]) return Promise.resolve(partsCache[type][fullName]);
    var folderMap = { cpu: 'CPU', ethernet: 'Ethernet', wlan: 'WLAN', wwan: 'WWAN', display: 'Display', graphics: 'Graphics', dock: 'Dock' };
    var folder = folderMap[type] || type;
    return fetch('modeldata/' + folder + '/' + fullName).then(function(resp) {
        if (!resp.ok && fullName.endsWith('.json')) return fetch('modeldata/' + folder + '/' + filename);
        return resp;
    }).then(function(resp) {
        if (!resp.ok) return null;
        return resp.json();
    }).then(function(data) {
        if (data) {
            if (!partsCache[type]) partsCache[type] = {};
            partsCache[type][fullName] = data;
        }
        return data;
    }).catch(function(e) { console.error('加载零件失败:', e); return null; });
}

function loadDeviceParts(device) {
    var tasks = [];
    if (device.processor_options && device.processor_options.length) { for (var i = 0; i < device.processor_options.length; i++) tasks.push({ type: 'cpu', file: device.processor_options[i] }); }
    if (device.display_options && device.display_options.length) { for (var i = 0; i < device.display_options.length; i++) tasks.push({ type: 'display', file: device.display_options[i] }); }
    if (device.graphics_options && device.graphics_options.length) { for (var i = 0; i < device.graphics_options.length; i++) tasks.push({ type: 'graphics', file: device.graphics_options[i] }); }
    if (device.Ethernet) { var items = Array.isArray(device.Ethernet) ? device.Ethernet : device.Ethernet.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s; }); for (var i = 0; i < items.length; i++) tasks.push({ type: 'ethernet', file: items[i] }); }
    if (device.WLAN) { var items = Array.isArray(device.WLAN) ? device.WLAN : [device.WLAN]; for (var i = 0; i < items.length; i++) tasks.push({ type: 'wlan', file: items[i] }); }
    if (device.WWAN) { var items = Array.isArray(device.WWAN) ? device.WWAN : [device.WWAN]; for (var i = 0; i < items.length; i++) tasks.push({ type: 'wwan', file: items[i] }); }
    if (device.dock_support) { var items = Array.isArray(device.dock_support) ? device.dock_support : [device.dock_support]; for (var i = 0; i < items.length; i++) tasks.push({ type: 'dock', file: items[i] }); }
    var promises = tasks.map(function(t) { return loadPartData(t.type, t.file).then(function(data) { return { type: t.type, name: t.file, data: data || { model: t.file, note: '等待补充' } }; }); });
    return Promise.all(promises).then(function(results) {
        var parts = { cpu: [], ethernet: [], wlan: [], wwan: [], display: [], graphics: [], dock: [] };
        for (var i = 0; i < results.length; i++) {
            var r = results[i];
            if (parts[r.type]) parts[r.type].push({ data: r.data, name: r.name, type: r.type });
        }
        return parts;
    });
}

function isFavorite(name) { return favorites.indexOf(name) !== -1; }
function toggleFavorite(name) {
    var idx = favorites.indexOf(name);
    if (idx >= 0) favorites.splice(idx, 1);
    else favorites.push(name);
    localStorage.setItem('tp_favs', JSON.stringify(favorites));
    updateFavCount();
    var btn = $('#favToggleBtn');
    if (btn && btn.dataset.model === name) btn.textContent = isFavorite(name) ? '★ 已收藏' : '☆ 收藏';
}
function updateFavCount() {
    if ($favCount) $favCount.textContent = favorites.length;
    if (currentPage === 'favorites' && $favoritesPageSubtitle) $favoritesPageSubtitle.textContent = '已收藏 ' + favorites.length + ' 个型号';
}
window.switchToModel = function(name) {
    var model = masterModelList.find(function(m) { return m.model_name === name; });
    if (model && model._isLight) {
        loadModelFile(model.filename).then(function() {
            model = masterModelList.find(function(m) { return m.model_name === name; });
            if (model) renderSpecs(model);
        });
    } else if (model) renderSpecs(model);
};

function renderPartCard(partsArr, title, type, useFlow) {
    if (!partsArr || partsArr.length === 0) return makeCard(title, '<span style="color:var(--text-muted);">无</span>', useFlow);
    var itemsHtml = '';
    for (var idx = 0; idx < partsArr.length; idx++) {
        var part = partsArr[idx];
        var d = part.data && part.data.thinkpad_database ? part.data.thinkpad_database[0] : part.data;
        var menuId = 'card-menu-' + menuCounter++;
        var hasFru = d && (d.FRUs || d.frus || d.Frus);
        var fruMenuItem = '';
        if (hasFru) {
            var jsonPart = JSON.stringify(part.data).replace(/"/g, '&quot;').replace(/'/g, "&#39;");
            fruMenuItem = '<div class="card-menu-item" onclick="event.stopPropagation();window.showFruModalByPart(' + jsonPart + ')">可能使用的 FRU</div>';
        }
        var arkMenuItem = '';
        if (type === 'cpu' && d.ark) arkMenuItem = '<div class="card-menu-item" onclick="event.stopPropagation();window.open(\'' + encodeURI(d.ark) + '\',\'_blank\');">查看 ARK</div>';
        var iconHtml = '';
        if ((type === 'cpu' || type === 'graphics') && d.iconfamily) {
            var iconFolder = type === 'cpu' ? 'CPU/cpu_icon' : 'Graphics/Graphics_icons';
            var iconBase = 'modeldata/' + iconFolder + '/' + encodeURIComponent(d.iconfamily);
            iconHtml = '<img src="' + iconBase + '.webp" class="cpu-icon-bg" alt="" loading="lazy" onerror="this.style.display=\'none\';">';
        }
        var menuItems = fruMenuItem + arkMenuItem;
        var menuHtml = menuItems ? '<div class="card-menu-container"><button class="card-menu-btn" onmouseenter="menuEnter(\'' + menuId + '\')" onmouseleave="menuLeave(\'' + menuId + '\')">⋮</button><div id="' + menuId + '" class="card-menu-dropdown hidden" onmouseenter="menuEnter(\'' + menuId + '\')" onmouseleave="menuLeave(\'' + menuId + '\')">' + fruMenuItem + arkMenuItem + '</div></div>' : '';
        var infoLines = [];
        if (type === 'cpu') {
            if (d.model) infoLines.push('<div class="part-title-text">' + d.model + '</div>');
            if (d.cores_threads) infoLines.push('<div class="part-field"><span class="field-name">核心/线程</span><span class="field-value">' + d.cores_threads + '</span></div>');
            if (d.base_freq) infoLines.push('<div class="part-field"><span class="field-name">基础频率</span><span class="field-value">' + d.base_freq + '</span></div>');
            if (d.turbo_freq && d.turbo_freq !== 'null') infoLines.push('<div class="part-field"><span class="field-name">睿频</span><span class="field-value">' + d.turbo_freq + '</span></div>');
            if (d.cache) infoLines.push('<div class="part-field"><span class="field-name">缓存</span><span class="field-value">' + d.cache + '</span></div>');
            if (d.graphics) infoLines.push('<div class="part-field"><span class="field-name">集显</span><span class="field-value">' + d.graphics + '</span></div>');
        } else if (type === 'display') {
            if (d.type) infoLines.push('<div class="part-title-text">' + d.type + '</div>');
            if (d.tech) infoLines.push('<div class="part-field"><span class="field-name">技术</span><span class="field-value">' + window.translateTech(d.tech) + '</span></div>');
            if (d.brightness) infoLines.push('<div class="part-field"><span class="field-name">亮度</span><span class="field-value">' + d.brightness + '</span></div>');
            if (d.refresh_rate) infoLines.push('<div class="part-field"><span class="field-name">刷新率</span><span class="field-value">' + d.refresh_rate + '</span></div>');
            if (d.color_gamut) infoLines.push('<div class="part-field"><span class="field-name">色域</span><span class="field-value">' + d.color_gamut + '</span></div>');
            if (d.touch) infoLines.push('<div class="part-field"><span class="field-name">触摸</span><span class="field-value">' + d.touch + '</span></div>');
        } else if (type === 'graphics') {
            if (d.model) infoLines.push('<div class="part-title-text">' + d.model + '</div>');
            if (d.VRAM) infoLines.push('<div class="part-field"><span class="field-name">显存</span><span class="field-value">' + d.VRAM + '</span></div>');
            if (d.Generation) infoLines.push('<div class="part-field"><span class="field-name">架构</span><span class="field-value">' + d.Generation + '</span></div>');
            if (d.base_freq) infoLines.push('<div class="part-field"><span class="field-name">频率</span><span class="field-value">' + d.base_freq + '</span></div>');
        } else if (type === 'ethernet') {
            if (d.type) infoLines.push('<div class="part-title-text">' + d.type + '</div>');
            if (d['model-type']) infoLines.push('<div class="part-field"><span class="field-name">功能</span><span class="field-value">' + d['model-type'] + '</span></div>');
            if (d.speed) infoLines.push('<div class="part-field"><span class="field-name">连接速度</span><span class="field-value">' + d.speed + '</span></div>');
            for (var k in d) {
                if (['model', 'type', 'model-type', 'speed', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].indexOf(k) !== -1) continue;
                if (d[k] && typeof d[k] !== 'object') infoLines.push('<div class="part-field"><span class="field-name">' + k.replace(/_/g, ' ') + '</span><span class="field-value">' + d[k] + '</span></div>');
            }
        } else if (type === 'wlan' || type === 'wwan') {
            var main = d.model || d.type || part.name;
            if (main) infoLines.push('<div class="part-title-text">' + main + '</div>');
            if (d.form) infoLines.push('<div class="part-field"><span class="field-name">形态</span><span class="field-value">' + d.form + '</span></div>');
            if (d.feature) infoLines.push('<div class="part-field"><span class="field-name">功能</span><span class="field-value">' + d.feature + '</span></div>');
            for (var k in d) {
                if (['model', 'type', 'form', 'feature', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].indexOf(k) !== -1) continue;
                if (d[k] && typeof d[k] !== 'object') infoLines.push('<div class="part-field"><span class="field-name">' + k.replace(/_/g, ' ') + '</span><span class="field-value">' + d[k] + '</span></div>');
            }
        } else if (type === 'dock') {
            if (d.model) infoLines.push('<div class="part-title-text">' + d.model + '</div>');
            if (d.ports) {
                var portsList = Array.isArray(d.ports) ? d.ports.map(function(p) { return '<span class="chip">' + p + '</span>'; }).join(' ') : d.ports;
                infoLines.push('<div class="part-field"><span class="field-name">端口</span><span class="field-value">' + portsList + '</span></div>');
            }
            if (d.power) infoLines.push('<div class="part-field"><span class="field-name">供电</span><span class="field-value">' + d.power + '</span></div>');
            for (var k in d) {
                if (['model', 'type', 'ports', 'power', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].indexOf(k) !== -1) continue;
                if (d[k] && typeof d[k] !== 'object') infoLines.push('<div class="part-field"><span class="field-name">' + k.replace(/_/g, ' ') + '</span><span class="field-value">' + d[k] + '</span></div>');
            }
        } else {
            var main = d.model || d.type || part.name;
            if (main) infoLines.push('<div class="part-title-text">' + main + '</div>');
            for (var k in d) {
                if (['model', 'type', 'FRUs', 'frus', 'Frus', 'iconfamily', 'ark'].indexOf(k) !== -1) continue;
                if (d[k] && typeof d[k] !== 'object') infoLines.push('<div class="part-field"><span class="field-name">' + k.replace(/_/g, ' ') + '</span><span class="field-value">' + d[k] + '</span></div>');
            }
        }
        itemsHtml += '<div class="part-row"><div class="part-info-wrap">' + infoLines.join('') + '</div>' + iconHtml + menuHtml + '</div>';
    }
    return makeCard(title, itemsHtml, useFlow);
}

function renderSpecs(data) {
    if (!data) return;
    currentModelData = data;
    if (currentPage !== 'detail') window.showDetailPage();
    setHomeOnlyElementsVisible(false);
    if (data._isLight) {
        $display.innerHTML = '<div class="loading-text">加载型号数据中...</div>';
        loadModelFile(data.filename).then(function() {
            var freshData = masterModelList.find(function(m) { return m.model_name === data.model_name; }) || data;
            renderSpecsInternal(freshData);
        }).catch(function(e) { console.error(e); $display.innerHTML = '<div class="loading-text">加载失败</div>'; });
    } else {
        renderSpecsInternal(data);
    }
}
function renderSpecsInternal(data) {
    $display.innerHTML = '<div class="loading-text">加载规格数据中...</div>';
    loadDeviceParts(data).then(function(parts) {
        currentDeviceParts = parts;
        var codeField = data._isNickname ? data.addon_model_code : data.model_code;
        var codeHtml = codeField ? '<span class="chip">' + (Array.isArray(codeField) ? codeField.join(' / ') : codeField) + '</span>' : '';
        var counterpart = data._isNickname ? masterModelList.find(function(m) { return m.model_name === data._originalName && !m._isNickname; }) : masterModelList.find(function(m) { return m._isNickname && m._originalName === data.model_name; });
        var switchBtn = counterpart ? '<button class="btn" onclick="window.switchToModel(\'' + counterpart.model_name.replace(/'/g, "\\'") + '\')">' + (data._isNickname ? '切换到原始型号' : '切换到别名') + '</button>' : '';
        var favBtn = '<button class="btn" id="favToggleBtn" data-model="' + data.model_name.replace(/'/g, "\\'") + '" onclick="toggleFavorite(\'' + data.model_name.replace(/'/g, "\\'") + '\')">' + (isFavorite(data.model_name) ? '★ 已收藏' : '☆ 收藏') + '</button>';
        function getUrl(u) { return Array.isArray(u) ? u[0] : u; }
        var psref = getUrl(data.PSREF_link), guide = getUrl(data.user_guide_link), hmm = getUrl(data.HMM_link);
        var addonsHtml = data.addons ? '<div style="color:var(--text-muted);font-size:12px;margin-top:-12px;margin-bottom:12px;">' + data.addons + '</div>' : '';
        var imageAngles = ['main', 'left', 'right', 'front', 'back', 'top', 'bottom', 'full'];
        var imageFolder = data.filename ? data.filename.replace(/\.json$/i, '') : data.model_name.replace(/\s+/g, '_');
        var imagesData = imageAngles.map(function(angle) { return { angle: angle, url: 'modeldata/model-images/' + encodeURIComponent(imageFolder) + '/' + angle + '.avif' }; });
        var imageCardHtml = '<div class="card" id="modelImageCard" style="display:none;"><div class="card-title" onclick="toggleCard(this)"><span>机型外观</span><span class="card-chevron">▼</span></div><div class="card-body" style="height: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 0; position: relative;"><img id="currentModelImage" src="' + imagesData[0].url + '" alt="' + data.model_name + '" style="max-width: 300px; max-height: 300px; border-radius: 12px; object-fit: contain; display: none; cursor: pointer;"><div id="image-nav-buttons" style="margin-top: 12px; display: none; position: absolute; bottom: 8px; left: 0; right: 0;"><button id="prev-image-btn" class="btn btn-sm">◀ 上一张</button><span id="image-counter" style="margin:0 12px; font-size:13px; color:var(--text-secondary);"></span><button id="next-image-btn" class="btn btn-sm">下一张 ▶</button></div></div></div>';
        var memoryCard = makeCard('内存', '<div class="info-row"><span class="info-label">容量</span><span class="info-value">' + (data.memory && data.memory.max_capacity || 'N/A') + '</span></div><div class="info-row"><span class="info-label">类型</span><span class="info-value">' + (data.memory && data.memory.type || 'N/A') + '</span></div><div class="info-row"><span class="info-label">插槽</span><span class="info-value">' + (data.memory && data.memory.slots || 'N/A') + '</span></div>' + (data.memory && data.memory.features ? '<div class="info-row"><span class="info-label">特性</span><span class="info-value">' + data.memory.features + '</span></div>' : ''));
        var storageCard = makeCard('存储', renderStorageItems(data.storage));
        var bats = data.Battary || data.battery || [];
        var batteryCard = makeCard('电池与续航', renderBatteryItems(bats));
        var touchPenHtml = '';
        if (data.touch || data.pen) {
            var items = [];
            if (data.touch) items.push('<div class="info-row"><span class="info-label">触摸</span><span class="info-value">' + (Array.isArray(data.touch) ? data.touch.join('、') : data.touch) + '</span></div>');
            if (data.pen) items.push('<div class="info-row"><span class="info-label">笔</span><span class="info-value">' + (Array.isArray(data.pen) ? data.pen.join('、') : data.pen) + '</span></div>');
            touchPenHtml = makeCard('触摸与笔', items.join(''));
        }
        var portsCard = makeCard('物理接口与多媒体', '<table class="spec-table"><tr><th>接口</th><td>' + (Array.isArray(data.ports) ? data.ports.join('、') : data.ports || '无') + '</td></tr><tr><th>摄像头</th><td>' + (Array.isArray(data.camera) ? data.camera.join('、') : data.camera || '无') + '</td></tr><tr><th>音频</th><td>' + (Array.isArray(data.audio) ? data.audio.join('<br>') : data.audio || 'N/A') + '</td></tr><tr><th>键盘和UltraNav</th><td>' + (Array.isArray(data.keyboard) ? data.keyboard.join('<br>') : data.keyboard || 'N/A') + '</td></tr>' + (data.colorcalibration ? '<tr><th>校色仪</th><td>' + (Array.isArray(data.colorcalibration) ? data.colorcalibration.join('、') : data.colorcalibration) + '</td></tr>' : '') + '</table>', true);
        var otherCard = makeCard('其他', '<table class="spec-table"><tr><th>尺寸</th><td>' + (data.physical && data.physical.dimensions || 'N/A') + '</td></tr><tr><th>重量</th><td>' + (data.physical && data.physical.weight || 'N/A') + '</td></tr><tr><th>材质</th><td>' + (data.physical && data.physical.case_material || data.case_material || 'N/A') + '</td></tr><tr><th>安全特性</th><td>' + (Array.isArray(data.security) ? data.security.join('<br>') : data.security || 'N/A') + '</td></tr><tr><th>预装系统</th><td>' + (Array.isArray(data.system) ? data.system.join('<br>') : data.system || 'N/A') + '</td></tr>' + (data.ACadapter ? '<tr><th>电源适配器</th><td>' + (Array.isArray(data.ACadapter) ? data.ACadapter.join('、') : data.ACadapter) + '</td></tr>' : '') + (data.add_on_tips ? '<tr><th>附加信息</th><td>' + data.add_on_tips + '</td></tr>' : '') + (secretTipsEnabled && data.secret_tips ? '<tr><th>秘密提示</th><td>' + data.secret_tips + '</td></tr>' : '') + '</table>', true);
        var html = '<div class="page-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;"><span>' + (data.model_name || '未知型号') + ' ' + codeHtml + '</span>' + favBtn + switchBtn + '</div><div class="page-subtitle">' + (data.model_family || '') + ' · ' + (data.model_generation || '') + ' · 更新: ' + (data.update_date || 'N/A') + '</div>' + addonsHtml + imageCardHtml + renderPartCard(parts.cpu, '处理器 (CPU)', 'cpu') + renderPartCard(parts.graphics, '显卡', 'graphics') + memoryCard + renderPartCard(parts.display, '显示屏', 'display') + touchPenHtml + storageCard + batteryCard + renderPartCard(parts.ethernet, '有线网卡', 'ethernet') + renderPartCard(parts.wlan, '无线网卡', 'wlan') + renderPartCard(parts.wwan, 'WWAN', 'wwan') + renderPartCard(parts.dock, '专有扩展坞支持', 'dock') + portsCard + otherCard + '<div class="btn-row-bottom">' + (psref ? '<a class="btn" href="' + psref + '" target="_blank" rel="noopener">PSREF 网站</a>' : '') + (guide ? '<a class="btn" href="' + guide + '" target="_blank" rel="noopener">用户手册</a>' : '') + (hmm ? '<a class="btn" href="' + hmm + '" target="_blank" rel="noopener">硬件维护指南</a>' : '') + '</div>';
        html = window.globalTranslateHTML ? window.globalTranslateHTML(html) : html;
        $display.innerHTML = html;
        var imageCard = document.getElementById('modelImageCard');
        if (imageCard) {
            var currentImg = document.getElementById('currentModelImage');
            var prevBtn = document.getElementById('prev-image-btn');
            var nextBtn = document.getElementById('next-image-btn');
            var counterSpan = document.getElementById('image-counter');
            var navContainer = document.getElementById('image-nav-buttons');
            if (currentImg && prevBtn && nextBtn && counterSpan && navContainer) {
                var validImages = [];
                var currentIndex = 0;
                var loadPromises = imagesData.map(function(item) {
                    return new Promise(function(resolve) {
                        var img = new Image();
                        img.onload = function() { resolve({ angle: item.angle, url: item.url, valid: true }); };
                        img.onerror = function() { resolve({ angle: item.angle, url: item.url, valid: false }); };
                        img.src = item.url;
                    });
                });
                Promise.all(loadPromises).then(function(results) {
                    validImages = results.filter(function(r) { return r.valid; });
                    if (validImages.length === 0) { imageCard.style.display = 'none'; return; }
                    imageCard.style.display = ''; navContainer.style.display = '';
                    var mainIndex = -1;
                    for (var i = 0; i < validImages.length; i++) { if (validImages[i].angle === 'main') { mainIndex = i; break; } }
                    currentIndex = mainIndex >= 0 ? mainIndex : 0;
                    function updateDisplay() {
                        var img = validImages[currentIndex];
                        if (img) {
                            currentImg.src = img.url;
                            currentImg.alt = data.model_name + ' - ' + img.angle;
                            currentImg.style.display = 'inline-block';
                            currentImg.style.cursor = 'pointer';
                            currentImg.onclick = function() { openImageModal(img.url); };
                            counterSpan.textContent = (currentIndex + 1) + ' / ' + validImages.length;
                        }
                    }
                    updateDisplay();
                    prevBtn.addEventListener('click', function() { currentIndex = (currentIndex - 1 + validImages.length) % validImages.length; updateDisplay(); });
                    nextBtn.addEventListener('click', function() { currentIndex = (currentIndex + 1) % validImages.length; updateDisplay(); });
                });
            }
        }
    }).catch(function(e) { console.error('渲染失败:', e); $display.innerHTML = '<div class="loading-text">加载规格数据失败</div>'; });
}

if ($refreshTrickBtn) {
    $refreshTrickBtn.addEventListener('click', function() { refreshRandomTrick(); });
}
if ($refreshBgBtn) {
    $refreshBgBtn.addEventListener('click', function() { refreshHomeBackground(); });
}

loadIndex();
