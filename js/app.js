// 1. 본인의 구글 시트 정보로 변경하세요.
const SPREADSHEET_ID = '1_4ivDTckWs1T0RiN3O5Hao6-LwwQevm1tJZ10AUONps'; 
const SHEET_NAME = 'Sheet1'; // 혹은 '시트1'
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

// 글로벌 데이터 저장소
let globalPosts = [];

// DOM 컴포넌트 선언
const appContainer = document.getElementById('app');

// 구글 시트 JSON 파싱 및 데이터 표준화
async function fetchPosts() {
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const text = await response.text();
        
        // 구글 시트의 gviz/tq API 응답 wrapper 제거 작업
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);
        
        const rows = data.table.rows;
        const cols = data.table.cols.map(c => c.label.toLowerCase()); // id, title, content, date 등 추출

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
        appContainer.innerHTML = '<div class="loading">데이터 로드 실패. 시트 공개 설정을 확인하세요.</div>';
        return [];
    }
}

// 라우터 처리기 (핵심 로직)
function handleRouting() {
    const path = window.location.pathname;
    
    // 디코딩을 통해 한글 주소 핸들링 가능 처리 (/글/1)
    const decodedPath = decodeURIComponent(path); 
    
    // 패턴 검사: /글/글번호
    const postRouteMatch = decodedPath.match(/^\/글\/(\d+)$/);

    if (postRouteMatch) {
        const postId = postRouteMatch[1];
        renderPostDetail(postId);
    } else if (decodedPath === '/' || decodedPath === '/index.html') {
        renderPostList();
    } else {
        appContainer.innerHTML = '<h2>404 - 페이지를 찾을 수 없습니다.</h2><a href="/" onclick="routeTo(event, \'/\')">홈으로 돌아가기</a>';
    }
}

// 렌더링: 글 목록 화면
function renderPostList() {
    if (globalPosts.length === 0) {
        appContainer.innerHTML = '<div class="loading">등록된 글이 없거나 데이터를 불러오지 못했습니다.</div>';
        return;
    }

    let html = '<ul class="post-list">';
    globalPosts.forEach(post => {
        html += `
            <li class="post-item">
                <h2><a href="/글/${post.id}" onclick="routeTo(event, '/글/${post.id}')">${post.title}</a></h2>
                <div style="color: #888; font-size: 0.85rem;">${post.date || ''}</div>
            </li>
        `;
    });
    html += '</ul>';
    appContainer.innerHTML = html;
}

// 렌더링: 글 상세 화면
function renderPostDetail(id) {
    // 구글 시트 내 ID는 숫자나 문자가 섞일 수 있으므로 느슨한 비교(==) 적용
    const post = globalPosts.find(p => p.id == id);

    if (!post) {
        appContainer.innerHTML = '<h2>존재하지 않는 글번호입니다.</h2><a href="/" onclick="routeTo(event, \'/\')">목록으로 돌아가기</a>';
        return;
    }

    appContainer.innerHTML = `
        <article class="post-detail">
            <a href="/" class="back-btn" onclick="routeTo(event, '/')">← 목록으로 가기</a>
            <h1>${post.title}</h1>
            <div class="post-meta">작성일: ${post.date || '알 수 없음'}</div>
            <div class="post-content">${post.content.replace(/\n/g, '<br>')}</div>
        </article>
    `;
}

// SPA 방식 주소 이동 함수 (새로고침 없이 URL만 변경 후 라우팅 실행)
function routeTo(event, path) {
    event.preventDefault();
    window.history.pushState({}, '', path);
    handleRouting();
}

// 뒤로가기 / 앞으로가기 브라우저 이벤트 핸들링
window.addEventListener('popstate', handleRouting);

// 어플리케이션 초기화 구동
window.addEventListener('DOMContentLoaded', async () => {
    await fetchPosts(); // 데이터 1회 선행 동기화 후
    handleRouting();    // 주소지에 맞춰 라우팅
});