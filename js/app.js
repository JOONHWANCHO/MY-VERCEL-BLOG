// 본인의 구글 스프레드시트 고유 ID 및 시트명을 입력하세요
const SPREADSHEET_ID = '1_4ivDTckWs1T0RiN3O5Hao6-LwwQevm1tJZ10AUONps'; 
const SHEET_NAME = 'Sheet1'; 
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

let globalPosts = [];
let homeHtmlTemplate = '';

async function fetchPosts() {
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const text = await response.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);
        
        const rows = data.table.rows;
        const cols = data.table.cols.map(c => c.label.toLowerCase().trim()); 

        globalPosts = rows.map(row => {
            const item = {};
            row.c.forEach((cell, index) => {
                const key = cols[index] || `col_${index}`;
                item[key] = cell ? cell.v : '';
            });
            return item;
        });
        return globalPosts;
    } catch (error) {
        console.error('데이터 수집 실패:', error);
        return [];
    }
}

function handleStampSystem() {
    const today = new Date().toISOString().split('T')[0];
    let stampData = JSON.parse(localStorage.getItem('kid_stamps')) || { lastDate: '', count: 0 };

    if (stampData.lastDate !== today) {
        stampData.count = stampData.count >= 5 ? 1 : stampData.count + 1;
        stampData.lastDate = today;
        localStorage.setItem('kid_stamps', JSON.stringify(stampData));
    }

    const stampContainer = document.getElementById('stamp-container');
    if (stampContainer) {
        let stampIcons = '';
        for (let i = 1; i <= 5; i++) {
            stampIcons += (i <= stampData.count) ? `<span class="stamp active">⚡</span>` : `<span class="stamp">⚪</span>`;
        }
        stampContainer.innerHTML = `
            <div class="stamp-box">
                <h4>⚡ 야놀자 락인 보너스 스탬프 (${stampData.count}/5)</h4>
                <p>매일 앱 방문 시 야놀자 키즈 코인이 충전되며 연속 완주 시 히든 쿠폰이 발급됩니다.</p>
                <div class="stamp-grid">${stampIcons}</div>
            </div>
        `;
    }
}

function toggleWishlist(postId, event) {
    if (event) event.stopPropagation();
    let wishList = JSON.parse(localStorage.getItem('kid_wishlist')) || [];
    const index = wishList.indexOf(String(postId));
    
    if (index > -1) {
        wishList.splice(index, 1);
    } else {
        wishList.push(String(postId));
    }
    localStorage.setItem('kid_wishlist', JSON.stringify(wishList));
    
    const currentPath = window.location.pathname;
    if (currentPath === '/' || currentPath === '/index.html') {
        renderHomeLayout();
    } else if (currentPath === '/wishes') {
        renderWishlistPage();
    } else {
        renderPostDetail(postId);
    }
}

function createCardHtml(post) {
    const fallbackImg = 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=500&q=80';
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;
    const wishList = JSON.parse(localStorage.getItem('kid_wishlist')) || [];
    const isWished = wishList.includes(String(post.id));

    return `
        <div class="card" onclick="routeTo(event, '/post/${post.id}')">
            <div class="wish-badge" onclick="toggleWishlist('${post.id}', event)">${isWished ? '❤️' : '🤍'}</div>
            <img class="card-img" src="${imageUrl}" alt="${post.title}" loading="lazy">
            <div class="card-content">
                <div class="card-title">${post.title}</div>
                <div class="card-date">💵 특가 소식 확인</div>
            </div>
        </div>
    `;
}

function handleRouting() {
    const path = window.location.pathname;
    const decodedPath = decodeURIComponent(path); 
    const appContainer = document.getElementById('app');
    const postRouteMatch = decodedPath.match(/^\/post\/(\d+)$/);

    if (postRouteMatch) {
        renderPostDetail(postRouteMatch[1]);
    } else if (decodedPath === '/wishes') {
        renderWishlistPage();
    } else if (decodedPath === '/' || decodedPath === '/index.html') {
        renderHomeLayout();
    } else {
        appContainer.innerHTML = `<div class="container" style="padding:100px 0; text-align:center;"><h2>페이지를 찾을 수 없습니다.</h2></div>`;
    }
}

function renderHomeLayout() {
    const appContainer = document.getElementById('app');
    appContainer.innerHTML = homeHtmlTemplate;
    handleStampSystem();

    const trendingList = document.getElementById('trending-posts');
    const recentList = document.getElementById('recent-posts');

    const trendingData = globalPosts.filter(p => p.category === '인기');
    const recentData = globalPosts.filter(p => p.category === '최신');

    if (trendingList) trendingList.innerHTML = trendingData.map(post => createCardHtml(post)).join('');
    if (recentList) recentList.innerHTML = recentData.map(post => createCardHtml(post)).join('');
}

function renderWishlistPage() {
    const appContainer = document.getElementById('app');
    const wishList = JSON.parse(localStorage.getItem('kid_wishlist')) || [];
    const wishedPosts = globalPosts.filter(post => wishList.includes(String(post.id)));

    let contentHtml = '';
    if (wishedPosts.length === 0) {
        contentHtml = `
            <div style="text-align:center; padding: 80px 20px; color:#888;">
                <p style="font-size:3rem; margin:0;">❤️</p>
                <p style="font-size:0.95rem; margin-top:10px;">저장한 내역이 없습니다.<br>가고 싶은 명소를 위시리스트에 담아보세요!</p>
            </div>
        `;
    } else {
        contentHtml = `<div class="card-grid">${wishedPosts.map(post => createCardHtml(post)).join('')}</div>`;
    }

    appContainer.innerHTML = `
        <div class="container" style="padding: 30px 16px 80px 16px;">
            <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:12px;">
                <h2 style="margin:0 0 4px 0; font-size:1.4rem; font-weight:800;">❤️ 마이 야놀자 위시</h2>
                <p style="margin:0; color:#666; font-size:0.85rem;">선택하신 초특가 액티비티 보관함입니다.</p>
            </div>
            ${contentHtml}
        </div>
    `;
}

function renderPostDetail(id) {
    const appContainer = document.getElementById('app');
    const post = globalPosts.find(p => p.id == id);

    if (!post) {
        appContainer.innerHTML = `<div class="container" style="padding:100px 0; text-align:center;"><h2>컨텐츠가 존재하지 않습니다.</h2></div>`;
        return;
    }

    const fallbackImg = 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=800&q=80';
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;
    const formattedContent = post.content ? post.content.replace(/\n/g, '<br>') : '';
    const wishList = JSON.parse(localStorage.getItem('kid_wishlist')) || [];
    const isWished = wishList.includes(String(post.id));

    let linkButtonHtml = '';
    if (post.link && post.link.startsWith('http')) {
        linkButtonHtml = `
            <div style="margin-top: 25px; display: flex; gap: 10px;">
                <button onclick="toggleWishlist('${post.id}', null)" class="wish-btn ${isWished ? 'active' : ''}">
                    ${isWished ? '❤️' : '🤍 찜하기'}
                </button>
                <a href="${post.link}" target="_blank" rel="noopener noreferrer" class="action-btn">
                    ⚡ 야놀자 초특가 예약하기
                </a>
            </div>
        `;
    }

    appContainer.innerHTML = `
        <div class="container" style="padding: 16px 16px 80px 16px; max-width: 650px;">
            <a href="/" class="back-btn" style="display:inline-block; margin-bottom:15px; color:var(--primary); text-decoration:none; font-weight:bold;" onclick="routeTo(event, '/')">← 뒤로가기</a>
            <article style="background: white; border-radius: var(--border-radius-md); overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                <img src="${imageUrl}" style="width:100%; max-height:350px; object-fit:cover;">
                <div style="padding: 20px;">
                    <span style="background: #FFF0F6; color: var(--primary); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;">${post.category || '핫플레이스'}</span>
                    <h1 style="font-size: 1.4rem; margin: 12px 0 10px 0; line-height:1.4; font-weight:800;">${post.title}</h1>
                    <div style="font-size: 0.95rem; line-height: 1.6; color: #444; margin-bottom:10px;">${formattedContent}</div>
                    ${linkButtonHtml}
                </div>
            </article>
        </div>
    `;
}

function routeTo(e, path) {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    handleRouting();
    window.scrollTo(0,0); // 페이지 전환 시 상단 스크롤 리셋 UX 적용
}

window.addEventListener('popstate', handleRouting);
window.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.getElementById('app');
    if (appContainer) homeHtmlTemplate = appContainer.innerHTML;
    await fetchPosts();
    handleRouting();
});