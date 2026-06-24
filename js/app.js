// 카테고리별 렌더링을 위한 renderHome 함수 수정
async function renderHome() {
    const posts = await fetchPosts();
    
    const trendingList = document.getElementById('trending-posts');
    const recentList = document.getElementById('recent-posts');
    
    // 카테고리 컬럼 기준으로 필터링 (구글 시트에 'category' 컬럼 추가 필요)
    const trendingData = posts.filter(p => p.category === '인기');
    const recentData = posts.filter(p => p.category === '최신');

    trendingList.innerHTML = trendingData.map(post => createCard(post)).join('');
    recentList.innerHTML = recentData.map(post => createCard(post)).join('');
}

function createCard(post) {
    return `
        <div class="card" onclick="routeTo(event, '/post/${post.id}')">
            <img class="card-img" src="${post.image_url || 'https://via.placeholder.com/300x200'}" alt="썸네일">
            <div class="card-content">
                <div class="card-title">${post.title}</div>
                <div class="card-date">${post.date}</div>
            </div>
        </div>
    `;
}