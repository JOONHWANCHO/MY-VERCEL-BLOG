// 1. 본인의 구글 시트 정보로 변경하세요.
const SPREADSHEET_ID = '1_4ivDTckWs1T0RiN3O5Hao6-LwwQevm1tJZ10AUONps'; 
const SHEET_NAME = 'Sheet1'; // 혹은 '시트1'
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

// 글로벌 데이터 저장소
let globalPosts = [];

// 오리지널 메인 레이아웃 백업 (상세 페이지에서 홈으로 돌아올 때 복원용)
let homeHtmlTemplate = '';

// 구글 시트 JSON 파싱 및 데이터 표준화
async function fetchPosts() {
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const text = await response.text();
        
        // 구글 시트 gviz/tq API 응답에서 순수 JSON 부분만 추출
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);
        
        const rows = data.table.rows;
        // 구글 시트의 모든 헤더 컬럼명 추출 (id, title, content, date, category, image_url, link 등)
        const cols = data.table.cols.map(c => c.label.toLowerCase().trim()); 

        // 구글 시트 행 데이터를 객체 배열로 매핑
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
        console.error('구글 시트 데이터를 가져오는 데 실패했습니다:', error);
        const appContainer = document.getElementById('app');
        if (appContainer) {
            appContainer.innerHTML = '<div class="loading">데이터 로드 실패. 구글 시트의 공개 및 헤더 설정을 확인하세요.</div>';
        }
        return [];
    }
}

// 라우터 처리기 (핵심 제어 로직)
function handleRouting() {
    const path = window.location.pathname;
    const decodedPath = decodeURIComponent(path); 
    const appContainer = document.getElementById('app');

    // 패턴 검사: /post/글번호
    const postRouteMatch = decodedPath.match(/^\/post\/(\d+)$/);

    if (postRouteMatch) {
        const postId = postRouteMatch[1];
        renderPostDetail(postId);
    } else if (decodedPath === '/' || decodedPath === '/index.html') {
        renderHomeLayout();
    } else {
        appContainer.innerHTML = `
            <div class="container" style="padding: 100px 20px; text-align: center;">
                <h2>404 - 페이지를 찾을 수 없습니다.</h2>
                <a href="/" class="back-btn" onclick="routeTo(event, '/')">홈으로 돌아가기</a>
            </div>
        `;
    }
}

// 렌더링: 홈 화면 레이아웃 복원 및 카테고리별 카드 배치
function renderHomeLayout() {
    const appContainer = document.getElementById('app');
    
    // 처음에 백업해둔 메인 구조(배너 및 카테고리 섹션들)를 다시 밀어 넣음
    appContainer.innerHTML = homeHtmlTemplate;

    const trendingList = document.getElementById('trending-posts');
    const recentList = document.getElementById('recent-posts');

    if (globalPosts.length === 0) {
        if (trendingList) trendingList.innerHTML = '<div class="loading">등록된 글이 없습니다.</div>';
        return;
    }

    // 구글 시트의 'category' 열 데이터 기준 필터링 ('인기' / '최신')
    const trendingData = globalPosts.filter(p => p.category === '인기');
    const recentData = globalPosts.filter(p => p.category === '최신');

    // 카드 생성 후 주입
    if (trendingList) trendingList.innerHTML = trendingData.map(post => createCardHtml(post)).join('');
    if (recentList) recentList.innerHTML = recentData.map(post => createCardHtml(post)).join('');
}

// HTML 템플릿: 당근마켓 스타일 카드 컴포넌트
function createCardHtml(post) {
    const fallbackImg = 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=500&q=80'; // 기본 동네 이미지
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;

    return `
        <div class="card" onclick="routeTo(event, '/post/${post.id}')">
            <img class="card-img" src="${imageUrl}" alt="${post.title}" loading="lazy">
            <div class="card-content">
                <div class="card-title">${post.title}</div>
                <div class="card-date">${post.date || ''}</div>
            </div>
        </div>
    `;
}

// 렌더링: 글 상세 화면 및 링크 이동 버튼 기능 추가
function renderPostDetail(id) {
    const appContainer = document.getElementById('app');
    const post = globalPosts.find(p => p.id == id);

    if (!post) {
        appContainer.innerHTML = `
            <div class="container" style="padding: 100px 20px; text-align: center;">
                <h2>존재하지 않거나 삭제된 동네 글입니다.</h2>
                <a href="/" class="back-btn" onclick="routeTo(event, '/')">← 목록으로 돌아가기</a>
            </div>
        `;
        return;
    }

    const fallbackImg = 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&q=80';
    const imageUrl = post.image_url && post.image_url.startsWith('http') ? post.image_url : fallbackImg;
    const formattedContent = post.content ? post.content.replace(/\n/g, '<br>') : '';

    // 구글 시트에 link 값이 존재할 때만 생성할 버튼 HTML 컴포넌트
    let linkButtonHtml = '';
    if (post.link && post.link.startsWith('http')) {
        linkButtonHtml = `
            <div style="margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px; text-align: center;">
                <a href="${post.link}" target="_blank" rel="noopener noreferrer" class="action-btn">
                    🔗 링크 바로가기
                </a>
            </div>
        `;
    }

    // 상세페이지 UI 주입
    appContainer.innerHTML = `
        <div class="container" style="padding: 40px 20px; max-width: 700px;">
            <a href="/" class="back-btn" style="display:inline-block; margin-bottom:20px; color:#FF8A3D; text-decoration:none; font-weight:bold;" onclick="routeTo(event, '/')">← 동네목록으로</a>
            <article style="background: white; border-radius: 12px; border: 1px solid #eee; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                <img src="${imageUrl}" style="width:100%; max-height:400px; object-fit:cover;" alt="본문 이미지">
                <div style="padding: 30px;">
                    <span style="background: #fff1e6; color: #FF8A3D; padding: 4px 10px; border-radius: 4px; font-size: 0.85rem; font-weight: bold;">${post.category || '동네소식'}</span>
                    <h1 style="font-size: 1.8rem; margin: 15px 0 10px 0; line-height: 1.4;">${post.title}</h1>
                    <div style="color: #888; font-size: 0.85rem; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">작성일: ${post.date || '오늘'}</div>
                    <div style="font-size: 1.05rem; line-height: 1.7; color: #333; word-break: break-word; margin-bottom: 10px;">${formattedContent}</div>
                    
                    ${linkButtonHtml}
                </div>
            </article>
        </div>
    `;
}

// SPA 방식 주소 이동 함수
function routeTo(event, path) {
    if (event) event.preventDefault();
    window.history.pushState({}, '', path);
    handleRouting();
}

// 브라우저 뒤로가기 / 앞으로가기 내비게이션 동기화
window.addEventListener('popstate', handleRouting);

// 초기 애플리케이션 진입점
window.addEventListener('DOMContentLoaded', async () => {
    const appContainer = document.getElementById('app');
    if (appContainer) {
        homeHtmlTemplate = appContainer.innerHTML;
    }

    await fetchPosts();
    handleRouting();
});
