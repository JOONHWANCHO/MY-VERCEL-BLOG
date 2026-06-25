const SPREADSHEET_ID = '1_4ivDTckWs1T0RiN3O5Hao6-LwwQevm1tJZ10AUONps'; 
const SHEET_NAME = 'Sheet1'; 
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

// 💡 [필수 설정] 본인의 구글 Apps Script 웹 앱 배포 URL 주소를 여기에 넣어주세요!
const TRACKING_API_URL = "https://script.google.com/macros/s/AKfycbzDL2_0OmI_LVYIxbWj_7FdqTxJGIATsjeyh90n6O29jYD_LRnnw_qHjEyWlyDZ4W4/exec";

let globalPosts = [];
let homeHtmlTemplate = '';

// 무한 스크롤 및 검색/필터링 상태 관리 변수들
let filteredPosts = [];      // 카테고리나 검색으로 걸러진 최종 타겟 데이터 배열
let currentPage = 1;         // 현재 렌더링된 무한스크롤 페이지 번호
const ITEMS_PER_PAGE = 10;   // 한 번 스크롤할 때마다 추가로 보여줄 카테고리 카드 수
let scrollObserver = null;   // 최하단 감지용 옵저버 인스턴스

// 🎯 [트래킹 엔진] 구글 시트로 사용자 액션 로그를 실시간 전송하는 함수
async function sendUserActionLog(postId, title, actionType) {
    if (!TRACKING_API_URL || TRACKING_API_URL.includes("방금_복사한_배포_URL_값")) {
        console.warn("TRACKING_API_URL 주소가 올바르게 설정되지 않았습니다.");
        return;
    }
    try {
        fetch(TRACKING_API_URL, {
            method: "POST",
            mode: "no-cors", // 브라우저 CORS 차단 정책 우회 조치
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                postId: String(postId),
                title: title,
                actionType: actionType // 'view' 또는 'click'
            })
        });
    } catch (e) {
        console.warn("로그 데이터 전송 에러:", e);
    }
}

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
                <h4>⚡ 노리야 보너스 스탬프 (${stampData.count}/5)</h4>
                <p>매일 앱 방문 시 노리야 키즈 코인이 충전되며 연속 완주 시 히든 쿠폰이 발급됩니다.</p>
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
    } else if (currentPath.startsWith('/category/') || currentPath === '/search') {
        refreshListUI();
    } else {
        renderPostDetail(postId);
    }
}

function createCardHtml(post) {
    const fallbackImg = 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=500&q=80';
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;
    const wishList = JSON.parse(localStorage.getItem('kid_wishlist')) || [];
    const isWished = wishList.includes(String(post.id));

    // 💡 문자열 오작동을 방지하기 위해 톳씨(싱글쿼터) 안전 치환 처리
    const safeTitle = post.title ? post.title.replace(/'/g, "\\'") : "추천 액티비티";

    // 💡 [클릭 로그 추가] onclick 이벤트 내부에 sendUserActionLog를 연결했습니다.
    return `
        <div class="card" onclick="sendUserActionLog('${post.id}', '${safeTitle}', 'click'); routeTo(event, '/post/${post.id}')">
            <div class="wish-badge" onclick="toggleWishlist('${post.id}', event)">${isWished ? '❤️' : '🤍'}</div>
            <img class="card-img" src="${imageUrl}" alt="${post.title}" loading="lazy">
            <div class="card-content">
                <div class="card-title">${post.title}</div>
                <div class="card-date">💵 특가 소식 확인</div>
            </div>
        </div>
    `;
}

function handleSearch(keyword) {
    const cleanKeyword = keyword.trim().toLowerCase();
    if (!cleanKeyword) {
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            routeTo(null, '/');
        }
        return;
    }

    if (window.location.pathname !== '/search') {
        window.history.pushState({}, '', '/search');
    }

    filteredPosts = globalPosts.filter(post => {
        const titleMatch = post.title ? post.title.toLowerCase().includes(cleanKeyword) : false;
        const contentMatch = post.content ? post.content.toLowerCase().includes(cleanKeyword) : false;
        return titleMatch || contentMatch;
    });

    renderInfiniteListPage(`🔍 '${keyword}' 검색 결과`);
}

function renderInfiniteListPage(titleText) {
    const appContainer = document.getElementById('app');
    currentPage = 1;

    appContainer.innerHTML = `
        <div class="container" style="padding: 20px 16px 80px 16px;">
            <div style="margin-bottom:20px; border-bottom:1px solid #eee; padding-bottom:12px;">
                <h2 style="margin:0 0 4px 0; font-size:1.3rem; font-weight:800; color:var(--primary);">${titleText}</h2>
                <p style="margin:0; color:#666; font-size:0.85rem;">총 <span id="total-count" style="font-weight:bold; color:#1A1A1A;">${filteredPosts.length}</span>개의 추천 여가를 찾았습니다.</p>
            </div>
            <div id="infinite-card-grid" class="card-grid"></div>
            <div id="scroll-trigger" style="height: 40px; margin-top:20px; text-align:center; color:#999; font-size:0.85rem;"></div>
        </div>
    `;

    appendNextItems();
    setupInfiniteScroll();
}

function appendNextItems() {
    const gridContainer = document.getElementById('infinite-card-grid');
    const trigger = document.getElementById('scroll-trigger');
    if (!gridContainer) return;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const targetSlice = filteredPosts.slice(startIndex, endIndex);

    if (targetSlice.length > 0) {
        const htmlBuffer = targetSlice.map(post => createCardHtml(post)).join('');
        gridContainer.insertAdjacentHTML('beforeend', htmlBuffer);
    }

    if (endIndex >= filteredPosts.length) {
        if (trigger) trigger.textContent = "📍 해당 카테고리의 모든 상품을 확인하셨습니다.";
        destroyObserver();
    } else {
        if (trigger) trigger.textContent = "⚡ 다음 특가 불러오는 중...";
    }
}

function setupInfiniteScroll() {
    destroyObserver();
    const trigger = document.getElementById('scroll-trigger');
    if (!trigger) return;

    scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && (currentPage * ITEMS_PER_PAGE) < filteredPosts.length) {
            currentPage++;
            appendNextItems();
        }
    }, { threshold: 0.1 });

    scrollObserver.observe(trigger);
}

function destroyObserver() {
    if (scrollObserver) {
        scrollObserver.disconnect();
        scrollObserver = null;
    }
}

function refreshListUI() {
    const gridContainer = document.getElementById('infinite-card-grid');
    if (!gridContainer) return;
    
    const limitIndex = currentPage * ITEMS_PER_PAGE;
    const visibleData = filteredPosts.slice(0, limitIndex);
    gridContainer.innerHTML = visibleData.map(post => createCardHtml(post)).join('');
}

function handleRouting() {
    destroyObserver();
    const path = window.location.pathname;
    const decodedPath = decodeURIComponent(path); 
    const postRouteMatch = decodedPath.match(/^\/post\/(\d+)$/);
    const categoryRouteMatch = decodedPath.match(/^\/category\/(.+)$/);

    if (decodedPath !== '/search' && document.getElementById('main-search-input')) {
        document.getElementById('main-search-input').value = '';
    }

    if (postRouteMatch) {
        renderPostDetail(postRouteMatch[1]);
    } else if (categoryRouteMatch) {
        const categoryName = categoryRouteMatch[1];
        filteredPosts = globalPosts.filter(p => p.category === categoryName);
        renderInfiniteListPage(`🎪 노리야 키즈 [${categoryName}] 기획전`);
    } else if (decodedPath === '/wishes') {
        renderWishlistPage();
    } else if (decodedPath === '/' || decodedPath === '/index.html') {
        renderHomeLayout();
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
    
    // 메인 홈 레이아웃 로드가 끝난 후 하단 지도 영역 렌더링 트리거 연계
    if (typeof renderNearLocationMap === 'function') {
        renderNearLocationMap(globalPosts);
    }
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
                <h2 style="margin:0 0 4px 0; font-size:1.4rem; font-weight:800;">❤️ 마이 노리야 위시</h2>
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

    // 💡 [조회수 로그 추가] 상세 페이지 레이아웃이 열릴 때 구글 시트에 'view'를 실시간 전송합니다.
    sendUserActionLog(post.id, post.title, 'view');

    const fallbackImg = 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=800&q=80';
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;
    
    let parsedMarkdownContent = '제공되는 상세 설명 정보가 없습니다.';
    if (post.content) {
        try {
            parsedMarkdownContent = marked.parse(post.content);
        } catch (e) {
            console.error('마크다운 파싱 에러:', e);
            parsedMarkdownContent = post.content.replace(/\n/g, '<br>');
        }
    }

    const formatBlock = (text) => text ? text.replace(/\n/g, '<br>') : '제공되는 정보가 없습니다.';

    const wishList = JSON.parse(localStorage.getItem('kid_wishlist')) || [];
    const isWished = wishList.includes(String(post.id));

    appContainer.innerHTML = `
        <div class="container" style="padding: 16px 16px 100px 16px; max-width: 650px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <a href="/" class="back-btn" style="color:var(--primary); text-decoration:none; font-weight:bold; font-size:0.95rem;" onclick="routeTo(event, '/')">← 홈으로</a>
                <span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">상품번호 #${post.id}</span>
            </div>

            <div style="position:relative; border-radius:var(--border-radius-md); overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.05);">
                <img src="${imageUrl}" style="width:100%; max-height:340px; object-fit:cover; display:block;">
                <span style="position:absolute; bottom:14px; left:14px; background:rgba(0,0,0,0.6); color:#FFF; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:bold;">
                    ${post.category || '기획전'}
                </span>
            </div>

            <div class="detail-info-section">
                <h1 style="font-size: 1.45rem; margin: 0 0 16px 0; line-height:1.4; font-weight:800; color:#1A1A1A;">${post.title}</h1>
                <table class="info-meta-table">
                    <tr>
                        <td class="label">이용대상</td>
                        <td class="value">${post.target || '전연령 및 아동 동반 부모'}</td>
                    </tr>
                    <tr>
                        <td class="label">운영시간</td>
                        <td class="value">${post.runtime || '현장 사정에 따라 변동 가능 (상세 확인)'}</td>
                    </tr>
                </table>
            </div>

            <div class="detail-info-section">
                <h3 class="detail-section-title">✨ 액티비티 소개</h3>
                <div class="markdown-body">
                    ${parsedMarkdownContent}
                </div>
            </div>

            <div class="detail-info-section">
                <h3 class="detail-section-title">📍 장소 및 위치 안내</h3>
                <div class="map-address-box">
                    <span>🏢</span>
                    <strong>${post.address || '상세 주소 현장 문의 / 전국 제휴처'}</strong>
                </div>
            </div>

            <div class="detail-info-section">
                <h3 class="detail-section-title">💡 이용 유의사항</h3>
                <div class="info-text-block">
                    ${formatBlock(post.notice || '• 보호자 동반 입장이 필수인 상품입니다.\n• 양도 및 재판매는 불가합니다.')}
                </div>
            </div>

            <div class="detail-info-section">
                <h3 class="detail-section-title">❌ 취소 및 환불 규정</h3>
                <div class="info-text-block" style="background:#FFF5F5; color:#C92A2A;">
                    ${formatBlock(post.policy || '• 이용 1일 전 취소 시: 100% 환불 가능\n• 당일 취소 및 노쇼: 환불 불가')}
                </div>
            </div>
        </div>

        <div class="fixed-booking-bar">
            <div class="container" style="margin:0 auto;">
                <button onclick="toggleWishlist('${post.id}', null)" class="wish-btn ${isWished ? 'active' : ''}" style="width:70px; padding:0; display:flex; align-items:center; justify-content:center; font-size:1.3rem;">
                    ${isWished ? '❤️' : '🤍'}
                </button>
                <a href="${post.link && post.link.startsWith('http') ? post.link : '#'}" target="_blank" rel="noopener noreferrer" class="action-btn" style="flex-grow:1; display:flex; align-items:center; justify-content:center; border-radius:var(--border-radius-sm);">
                    ⚡ 실시간 즉시 예약하기
                </a>
            </div>
        </div>
    `;
}

function routeTo(e, path) {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    
    const existingBar = document.querySelector('.fixed-booking-bar');
    if (existingBar) existingBar.remove();
    
    handleRouting();
    window.scrollTo(0,0);
}

window.addEventListener('popstate', handleRouting);
window.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.getElementById('app');
    if (appContainer) homeHtmlTemplate = appContainer.innerHTML;
    await fetchPosts();
    handleRouting();
});

function initBannerCarousel() {
    const container = document.getElementById('top-banner-carousel');
    if (!container) return;

    const banners = [
        {
            img: "https://images.unsplash.com/photo-1595974482597-4b8da8879bc5?w=1000&q=80",
            title: "2026 숙박세일 페스타<br>최대 7만원 쿠폰 받기",
            desc: "NOL 단독 더하기 쿠폰 혜택까지",
            badge: "🎈 문화체육관광부 × 한국관광공사"
        },
        {
            img: "https://images.unsplash.com/photo-1513885535751-8b9238bd345a?w=1000&q=80",
            title: "여름방학 도파민 폭발!<br>전국 테마파크 종일권 특가",
            desc: "최대 45% 단독 선착순 할인 공급",
            badge: "⚡ 한정수량"
        },
        {
            img: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=1000&q=80",
            title: "아이랑 가기 좋은<br>전국 실내 아쿠아리움 TOP 5",
            desc: "시원한 실내에서 만나는 바다 세상",
            badge: "🐳 MD추천"
        }
    ];

    container.innerHTML = `
        <div class="banner-carousel-container">
            <div class="banner-track" id="bannerTrack">
                ${banners.map(b => `
                    <div class="banner-item">
                        <img src="${b.img}" alt="배너">
                        <div class="banner-overlay">
                            <div class="banner-badge" style="font-size:0.68rem; color:#333; font-weight:700;">${b.badge}</div>
                            <div class="banner-title">${b.title}</div>
                            <div class="banner-desc">${b.desc}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="banner-controls">
                <button class="banner-play-toggle" id="bannerPlayBtn">⏸</button>
                <div class="banner-indicator" id="bannerIndicator">01 <span class="total">/ ${String(banners.length).padStart(2, '0')}+</span></div>
            </div>
        </div>
    `;

    const track = document.getElementById('bannerTrack');
    const indicator = document.getElementById('bannerIndicator');
    const playBtn = document.getElementById('bannerPlayBtn');
    
    let currentIndex = 0;
    let isPlaying = true;
    let autoSlideTimer = null;

    track.addEventListener('scroll', () => {
        const width = track.clientWidth;
        const newIndex = Math.round(track.scrollLeft / width);
        if (newIndex !== currentIndex && newIndex < banners.length) {
            currentIndex = newIndex;
            indicator.innerHTML = `${String(currentIndex + 1).padStart(2, '0')} <span class="total">/ ${String(banners.length).padStart(2, '0')}+</span>`;
        }
    });

    function startAutoSlide() {
        autoSlideTimer = setInterval(() => {
            currentIndex = (currentIndex + 1) % banners.length;
            const targetLeft = currentIndex * (track.clientWidth - 10);
            track.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }, 3500);
    }

    function stopAutoSlide() {
        clearInterval(autoSlideTimer);
    }

    playBtn.addEventListener('click', () => {
        if (isPlaying) {
            stopAutoSlide();
            playBtn.innerText = '▶';
        } else {
            startAutoSlide();
            playBtn.innerText = '⏸';
        }
        isPlaying = !isPlaying;
    });

    startAutoSlide();
}

document.addEventListener('DOMContentLoaded', () => {
    initBannerCarousel();
});

// [지도 추천 장소 연동 엔진]
function renderNearLocationMap(posts) {
    const mapContainer = document.getElementById('near-map');
    const recommendContainer = document.getElementById('near-recommend-spot');
    
    if (!mapContainer || !recommendContainer) return;
    if (!posts || posts.length === 0) return;

    if (typeof kakao === 'undefined' || !kakao.maps || !kakao.maps.services) {
        return;
    }

    const DEFAULT_LAT = 37.555142;
    const DEFAULT_LNG = 126.970450;

    if (!navigator.geolocation) {
        processDistanceAndMap(DEFAULT_LAT, DEFAULT_LNG, posts, true);
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            processDistanceAndMap(position.coords.latitude, position.coords.longitude, posts, false);
        },
        (error) => {
            console.warn("위치 권한 제한 - 기본 위치 대체", error);
            processDistanceAndMap(DEFAULT_LAT, DEFAULT_LNG, posts, true);
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
    );

    async function processDistanceAndMap(centerLat, centerLng, postsData, isDefault) {
        try {
            const geocoder = new kakao.maps.services.Geocoder();
            const distancePromises = postsData.map(post => {
                return new Promise((resolve) => {
                    const address = post.address || post.Address || post.주소; 
                    if (!address) return resolve(null);
                    
                    geocoder.addressSearch(address, function(result, status) {
                        if (status === kakao.maps.services.Status.OK) {
                            const spotLat = parseFloat(result[0].y);
                            const spotLng = parseFloat(result[0].x);
                            const distance = calculateHaversine(centerLat, centerLng, spotLat, spotLng);
                            resolve({ ...post, lat: spotLat, lng: spotLng, distance: distance });
                        } else {
                            resolve(null); 
                        }
                    });
                });
            });

            const calculatedSpots = (await Promise.all(distancePromises)).filter(spot => spot !== null);
            if (calculatedSpots.length === 0) return;

            calculatedSpots.sort((a, b) => a.distance - b.distance);
            const closestSpot = calculatedSpots[0];

            const spotPosition = new kakao.maps.LatLng(closestSpot.lat, closestSpot.lng);
            const mapOption = { center: spotPosition, level: 5 };
            const map = new kakao.maps.Map(mapContainer, mapOption);

            const marker = new kakao.maps.Marker({ position: spotPosition, map: map });
            const infowindow = new kakao.maps.InfoWindow({
                content: `<div style="padding:6px; font-size:11px; font-weight:700; color:#222; text-align:center; width:130px;">${closestSpot.title || closestSpot.제목 || '추천 장소'}</div>`
            });
            infowindow.open(map, marker);

            let distanceText = closestSpot.distance < 1 
                ? `${Math.round(closestSpot.distance * 1000)}m 앞` 
                : `${closestSpot.distance.toFixed(1)}km 근처`;

            let prefixTag = isDefault ? `📍 추천 액티비티` : `⚡ 현재 위치에서 ${distanceText}`;
            const imgUrl = closestSpot.image_url || closestSpot.이미지 || 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=100&q=80';
            const spotId = closestSpot.id || closestSpot.ID;

            recommendContainer.innerHTML = `
                <div class="near-recommend-card" onclick="sendUserActionLog('${spotId}', '${(closestSpot.title || '추천').replace(/'/g, "\\'")}', 'click'); location.search = '?id=${spotId}'">
                    <img src="${imgUrl}" alt="추천">
                    <div class="info">
                        <div class="distance-tag" style="${isDefault ? 'color:#111;' : ''}">${prefixTag}</div>
                        <div class="place-name">${closestSpot.title || closestSpot.제목}</div>
                    </div>
                </div>
            `;
        } catch (err) {
            console.error("내부 지도 빌드 에러:", err);
        }
    }

    function calculateHaversine(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
    }
}