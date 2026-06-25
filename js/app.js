const SPREADSHEET_ID = '1_4ivDTckWs1T0RiN3O5Hao6-LwwQevm1tJZ10AUONps'; 
const SHEET_NAME = 'Sheet1'; 
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;
const TRACKING_API_URL = "https://script.google.com/macros/s/AKfycbzDL2_0OmI_LVYIxbWj_7FdqTxJGIATsjeyh90n6O29jYD_LRnnw_qHjEyWlyDZ4W4/exec";

let globalPosts = [];
let homeHtmlTemplate = '';

// 무한 스크롤 및 검색/필터링 상태 관리 변수들
let filteredPosts = [];      // 카테고리나 검색으로 걸러진 최종 타겟 데이터 배열
let currentPage = 1;         // 현재 렌더링된 무한스크롤 페이지 번호
const ITEMS_PER_PAGE = 10;   // 한 번 스크롤할 때마다 추가로 보여줄 카테고리 카드 수
let scrollObserver = null;   // 최하단 감지용 옵저버 인스턴스

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
        // 검색창이나 카테고리 리스트에서 하트 누를 시 리스트 갱신 처리
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

    // 💡 문자열 오작동을 방지하기 위해 톳씨(싱글쿼터)를 이스케이프하거나 안전하게 변환합니다.
    const safeTitle = post.title ? post.title.replace(/'/g, "\\'") : "이름 없는 액티비티";

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

// [실시간 통합 검색 기능 엔진]
function handleSearch(keyword) {
    const cleanKeyword = keyword.trim().toLowerCase();
    if (!cleanKeyword) {
        // 검색창을 완전히 비우면 홈 레이아웃으로 자동 리턴
        if (window.location.pathname !== '/' && window.location.pathname !== '/index.html') {
            routeTo(null, '/');
        }
        return;
    }

    // 주소창 강제 맵핑 (SPA pushState 활용)
    if (window.location.pathname !== '/search') {
        window.history.pushState({}, '', '/search');
    }

    // 제목 또는 본문 내용에 검색 키워드가 포함된 행 필터링
    filteredPosts = globalPosts.filter(post => {
        const titleMatch = post.title ? post.title.toLowerCase().includes(cleanKeyword) : false;
        const contentMatch = post.content ? post.content.toLowerCase().includes(cleanKeyword) : false;
        return titleMatch || contentMatch;
    });

    renderInfiniteListPage(`🔍 '${keyword}' 검색 결과`);
}

// [카테고리 & 검색어 전용 무한 스크롤 페이지 렌더러]
function renderInfiniteListPage(titleText) {
    const appContainer = document.getElementById('app');
    currentPage = 1; // 페이지 상태 초기화

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

    appendNextItems(); // 최초 1회차 아이템 풀 채우기
    setupInfiniteScroll(); // 스크롤 하단 바인딩 연결
}

// 페이지 번호에 맞춰 데이터를 잘라서 그리드 레이아웃에 추가(Append)해 주는 기능
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

    // 다음 가져올 데이터가 더 있는지 검증 후 스크롤 하단 가이드 텍스트 처리
    if (endIndex >= filteredPosts.length) {
        if (trigger) trigger.textContent = "📍 해당 카테고리의 모든 상품을 확인하셨습니다.";
        destroyObserver(); // 관찰 종료
    } else {
        if (trigger) trigger.textContent = "⚡ 다음 특가 불러오는 중...";
    }
}

// 브라우저 최적화 API인 IntersectionObserver를 이용한 하단 스크롤 센서 연결
function setupInfiniteScroll() {
    destroyObserver(); // 기존 메모리 혼선 방지를 위한 안전 예방 삭제
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

// 하트 토글 시 화면 전체 구조를 파괴하지 않고 리스트만 리렌더링해 주는 보조 메서드
function refreshListUI() {
    const gridContainer = document.getElementById('infinite-card-grid');
    if (!gridContainer) return;
    
    const limitIndex = currentPage * ITEMS_PER_PAGE;
    const visibleData = filteredPosts.slice(0, limitIndex);
    gridContainer.innerHTML = visibleData.map(post => createCardHtml(post)).join('');
}

function handleRouting() {
    destroyObserver(); // 라우팅 시 무한스크롤 감지 센서 오프 처리
    const path = window.location.pathname;
    const decodedPath = decodeURIComponent(path); 
    const appContainer = document.getElementById('app');
    const postRouteMatch = decodedPath.match(/^\/post\/(\d+)$/);
    const categoryRouteMatch = decodedPath.match(/^\/category\/(.+)$/);

    // 상세, 찜 보드가 아닐 때는 검색어 인풋 초기화 유도
    if (decodedPath !== '/search' && document.getElementById('main-search-input')) {
        document.getElementById('main-search-input').value = '';
    }

    if (postRouteMatch) {
        renderPostDetail(postRouteMatch[1]);
    } else if (categoryRouteMatch) {
        // [카테고리 분기 매핑]
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

// 📍 [여기 추가] 홈 레이아웃 템플릿이 화면에 다 그려진 후 지도를 렌더링합니다.
renderNearLocationMap(globalPosts);

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

    const fallbackImg = 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=800&q=80';
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;
    
    // 개행 문자 치환 대신 마크다운 파서 가동 (보안 옵션 기본 탑재)
    let parsedMarkdownContent = '제공되는 상세 설명 정보가 없습니다.';
    if (post.content) {
        try {
            // marked 라이브러리를 사용해 마크다운을 안전한 HTML 문자열로 파싱
            parsedMarkdownContent = marked.parse(post.content);
        } catch (e) {
            console.error('마크다운 파싱 에러:', e);
            parsedMarkdownContent = post.content.replace(/\n/g, '<br>'); // 에러 시 폴백
        }
    }

    // 유의사항 및 취소규정도 마크다운 적용이 가능하도록 가공
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

// 라우팅 스크롤 매니징 패치 보완
function routeTo(e, path) {
    if (e) e.preventDefault();
    window.history.pushState({}, '', path);
    
    // 상세 페이지를 벗어날 때는 하단 구매바 엘리먼트가 잔존하지 않도록 수동 클린업
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

// 초기화 시점에 호출해 주세요 (예: 돔 로드 완료 시점)
function initBannerCarousel() {
    const container = document.getElementById('top-banner-carousel');
    if (!container) return;

    // 가상의 배너 데이터 (추후 구글 시트에 별도 탭을 만들어 연동하셔도 좋습니다)
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

    // HTML 구조 동적 생성
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

    // 1. 스크롤 감지하여 인디케이터 숫자 변경
    track.addEventListener('scroll', () => {
        const width = track.clientWidth;
        const newIndex = Math.round(track.scrollLeft / width);
        if (newIndex !== currentIndex && newIndex < banners.length) {
            currentIndex = newIndex;
            indicator.innerHTML = `${String(currentIndex + 1).padStart(2, '0')} <span class="total">/ ${String(banners.length).padStart(2, '0')}+</span>`;
        }
    });

    // 2. 자동 슬라이드 가동 함수
    function startAutoSlide() {
        autoSlideTimer = setInterval(() => {
            currentIndex = (currentIndex + 1) % banners.length;
            const targetLeft = currentIndex * (track.clientWidth - 10); // 간격 보정
            track.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }, 3500); // 3.5초 주기 무브
    }

    function stopAutoSlide() {
        clearInterval(autoSlideTimer);
    }

    // 3. 재생/일시정지 토글 버튼 이벤트
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

    // 최초 자동 타이머 실행
    startAutoSlide();
}

// 앱 실행 시 배너 빌드 트리거 추가
document.addEventListener('DOMContentLoaded', () => {
    initBannerCarousel();
    // ... 기존 데이터 페치 및 렌더링 함수들 ...
});

// ==========================================================================
// [5개 연동 버전] 상위 5개 장소 표시, 마커 전체 매핑 및 슬라이더 연동 엔진
// ==========================================================================
function renderNearLocationMap(posts) {
    const mapContainer = document.getElementById('near-map');
    const slider = document.getElementById('map-spots-slider');
    
    if (!mapContainer || !slider) return;

    if (!posts || posts.length === 0) {
        slider.innerHTML = `<div class="map-loading-msg">액티비티 데이터가 없습니다.</div>`;
        return;
    }

    if (typeof kakao === 'undefined') {
        slider.innerHTML = `<div class="map-loading-msg" style="color:red;">카카오 스크립트 로드 실패</div>`;
        return;
    }

    // 안전하게 카카오 맵 라이브러리 실행
    kakao.maps.load(async function() {
        // 최대 5개의 액티비티 추출
        const targetSpots = posts.slice(0, 5);
        const geocoder = new kakao.maps.services.Geocoder();

        // 5개 장소의 주소를 위경도 좌표로 비동기 변환
        const convertedSpotsPromises = targetSpots.map((spot, index) => {
            return new Promise((resolve) => {
                const keys = Object.keys(spot);
                const addressKey = keys.find(k => k.toLowerCase().includes('address') || k.includes('주소') || k.includes('위치'));
                const titleKey = keys.find(k => k.toLowerCase().includes('title') || k.includes('제목') || k.toLowerCase().includes('name'));
                
                const spotAddress = addressKey ? String(spot[addressKey]).trim() : "서울 송파구 올림픽로 240";
                const spotTitle = titleKey ? spot[titleKey] : `추천 장소 ${index + 1}`;

                geocoder.addressSearch(spotAddress, function(result, status) {
                    if (status === kakao.maps.services.Status.OK) {
                        resolve({
                            ...spot,
                            title: spotTitle,
                            lat: parseFloat(result[0].y),
                            lng: parseFloat(result[0].x)
                        });
                    } else {
                        resolve(null); // 주소 변환 실패 시 제외
                    }
                });
            });
        });

        const validSpots = (await Promise.all(convertedSpotsPromises)).filter(s => s !== null);

        if (validSpots.length === 0) {
            slider.innerHTML = `<div class="map-loading-msg">올바른 주소가 포함된 데이터가 없습니다.</div>`;
            return;
        }

        // 1. 초기 지도 생성 (첫 번째 장소 중심)
        const initialPosition = new kakao.maps.LatLng(validSpots[0].lat, validSpots[0].lng);
        const mapOption = { center: initialPosition, level: 5 };
        const map = new kakao.maps.Map(mapContainer, mapOption);

        const markers = [];
        const infowindows = [];

        // 2. 지도에 5개 마커와 인포윈도우 모두 그리기
        validSpots.forEach((spot, idx) => {
            const position = new kakao.maps.LatLng(spot.lat, spot.lng);
            
            const marker = new kakao.maps.Marker({
                position: position,
                map: map
            });

            const infowindow = new kakao.maps.InfoWindow({
                content: `<div style="padding:5px; font-size:11px; font-weight:700; color:#222; text-align:center; width:130px;">${spot.title}</div>`
            });

            // 첫 번째 장소의 말풍선만 처음에 열어둠
            if (idx === 0) infowindow.open(map, marker);

            markers.push(marker);
            infowindows.push(infowindow);

            // 마커 클릭 시 하단 카드 활성화 및 이동 연동
            kakao.maps.event.addListener(marker, 'click', function() {
                selectSpot(idx);
            });
        });

        // 3. 하단 5개 슬라이더 카드 HTML 구성
        slider.innerHTML = validSpots.map((spot, idx) => {
            const imgUrl = spot.image_url || spot.이미지 || 'https://images.unsplash.com/photo-1489710437720-ebb67ec84dd2?w=100&q=80';
            const spotId = spot.id || spot.ID || 1;
            const isActive = idx === 0 ? 'active' : '';

            return `
                <div class="map-recommend-card ${isActive}" id="map-card-${idx}" onclick="window.mapSelectEngine(${idx})">
                    <img src="${imgUrl}" alt="장소">
                    <div class="info">
                        <div class="badge-tag">TOP ${idx + 1} 액티비티</div>
                        <div class="place-name">${spot.title}</div>
                    </div>
                </div>
            `;
        }).join('');

        // 4. 중앙 제어 함수 정의 (카드 클릭 및 마커 클릭 연동)
        window.mapSelectEngine = function(index) {
            selectSpot(index);
        };

        function selectSpot(index) {
            const target = validSpots[index];
            if (!target) return;

            // 모든 카드 비활성화 후 선택된 카드 활성화
            document.querySelectorAll('.map-recommend-card').forEach(card => card.classList.remove('active'));
            const activeCard = document.getElementById(`map-card-${index}`);
            if (activeCard) {
                activeCard.classList.add('active');
                // 클릭한 카드가 슬라이더 화면 밖으로 나가있다면 자동으로 스크롤 이동
                activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }

            // 모든 인포윈도우 닫고 선택된 마커의 인포윈도우만 열기
            infowindows.forEach(info => info.close());
            infowindows[index].open(map, markers[index]);

            // 지도를 선택된 위치로 부드럽게 이동시킴 (PanTo)
            const movePosition = new kakao.maps.LatLng(target.lat, target.lng);
            map.panTo(movePosition);
        }
    });
}

// 💡 [app.js 내부에 추가할 글로벌 트래커 엔진]
async function sendUserActionLog(postId, title, actionType) {
    try {
        // 백그라운드 비동기 통신으로 사용자 동작 전송 (보안상 cors 예외 처리를 위해 텍스트 전송 후 파싱 유도)
        fetch(TRACKING_API_URL, {
            method: "POST",
            mode: "no-cors", // 브라우저 CORS 차단 우회 보호 조치
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                postId: postId,
                title: title,
                actionType: actionType // 'view' (조회) 또는 'click' (카드 링크 클릭)
            })
        });
    } catch (e) {
        console.warn("로그 전송 실패:", e);
    }
}