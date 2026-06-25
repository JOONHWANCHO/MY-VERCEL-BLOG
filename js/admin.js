// ==========================================================================
// [Admin Engine] 구글 스프레드시트 트래픽 수집 및 대시보드 시각화 처리 로직
// ==========================================================================

const SPREADSHEET_ID = '1_4ivDTckWs1T0RiN3O5Hao6-LwwQevm1tJZ10AUONps'; 
const SHEET_NAME = 'Sheet1'; 
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${SHEET_NAME}`;

document.addEventListener('DOMContentLoaded', () => {
    loadAdminDashboardData();
});

async function loadAdminDashboardData() {
    try {
        const response = await fetch(GOOGLE_SHEET_URL);
        const text = await response.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);
        
        const rows = data.table.rows;
        const cols = data.table.cols.map(c => c.label.toLowerCase().trim()); 

        // 1. 구글 시트 데이터를 표준 객체로 파싱
        const parsedPosts = rows.map((row, idx) => {
            const item = {};
            row.c.forEach((cell, index) => {
                const key = cols[index] || `col_${index}`;
                item[key] = cell ? cell.v : '';
            });
            
            // 유연한 명칭 처리를 위한 매핑 연동
            const titleKey = Object.keys(item).find(k => k.includes('title') || k.includes('제목') || k.includes('name'));
            const categoryKey = Object.keys(item).find(k => k.includes('category') || k.includes('카테고리'));
            
            item.extractedTitle = titleKey ? item[titleKey] : `액티비티 #${idx + 1}`;
            item.extractedCategory = categoryKey ? item[categoryKey] : '일반';

            // 💡 [트래킹 가상화] 데이터에 일치하는 고유 통계 데이터 부여 (순위 보장형 난수 인가)
            // 실제 상용 시스템에서는 이 값을 로컬스토리지나 서버 인입 로그에서 매핑해 가져오게 됩니다.
            const baseMultiplier = rows.length - idx; // 상위 행 데이터일수록 가중치 부여
            item.views = Math.floor(Math.random() * 150) + (baseMultiplier * 60) + 120;
            item.clicks = Math.floor(item.views * (Math.random() * 0.15 + 0.05)); // 5% ~ 20% 이내의 합리적 CTR 발생
            item.ctr = item.views > 0 ? ((item.clicks / item.views) * 100).toFixed(1) : "0.0";
            
            return item;
        });

        // 2. 대시보드 데이터 연동 렌더링 시작
        buildSummaryWidgets(parsedPosts);
        buildTopClicksChart(parsedPosts);
        buildStatsTable(parsedPosts);

    } catch (error) {
        console.error("관리자 대시보드 데이터 바인딩 실패:", error);
        const chartBox = document.getElementById('top-clicks-chart');
        if (chartBox) chartBox.innerHTML = `<div style="color:red; padding:20px;">구글 시트 연동 중 에러가 발생했습니다.</div>`;
    }
}

// 상단 요약 총합 및 평균 CTR 계산 위젯 배포
function buildSummaryWidgets(posts) {
    let totalViews = 0;
    let totalClicks = 0;

    posts.forEach(p => {
        totalViews += p.views;
        totalClicks += p.clicks;
    });

    const averageCtr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0";

    // 애니메이션 효과를 가미하여 숫자를 자연스럽게 올림 처리
    animateCountValue('stat-total-views', totalViews);
    animateCountValue('stat-total-clicks', totalClicks);
    document.getElementById('stat-ctr').innerText = `${averageCtr}%`;
}

// 가장 많이 클릭된 TOP 5 커스텀 그래프 바 시각화 엔진
function buildTopClicksChart(posts) {
    const chartContainer = document.getElementById('top-clicks-chart');
    if (!chartContainer) return;

    // 클릭수 기준 내림차순 정렬 후 상위 5개 슬라이싱
    const sortedTop5 = [...posts].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
    const maxClickValue = sortedTop5[0].clicks; // 차트 스케일링용 맥스치 기준값 지정

    chartContainer.innerHTML = sortedTop5.map((spot, idx) => {
        // 비율에 맞게 백분율 너비 계산
        const percentageWidth = maxClickValue > 0 ? (spot.clicks / maxClickValue) * 100 : 0;
        
        return `
            <div class="chart-row">
                <div class="chart-info-text">
                    <span><strong>${idx + 1}.</strong> ${spot.extractedTitle}</span>
                    <span>${spot.clicks} Clicks (${spot.ctr}%)</span>
                </div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" id="admin-bar-${idx}" style="width: 0%"></div>
                </div>
            </div>
        `;
    }).join('');

    // 차트 로드 시 가득 차오르는 인터랙션 애니메이션 연동 적용
    setTimeout(() => {
        sortedTop5.forEach((spot, idx) => {
            const bar = document.getElementById(`admin-bar-${idx}`);
            if (bar) {
                const percentageWidth = maxClickValue > 0 ? (spot.clicks / maxClickValue) * 100 : 0;
                bar.style.width = `${percentageWidth}%`;
            }
        });
    }, 150);
}

// 액티비티별 전체 분석 통계 리스트 렌더링 테이블 트리거
function buildStatsTable(posts) {
    const tableBody = document.getElementById('admin-stats-table-body');
    if (!tableBody) return;

    // 테이블은 기본적으로 조회수(Views)가 높은 인기 트래픽 순으로 기본 정렬
    const sortedByViews = [...posts].sort((a, b) => b.views - a.views);

    tableBody.innerHTML = sortedByViews.map((spot, index) => {
        return `
            <tr>
                <td><span class="rank-badge">${index + 1}</span></td>
                <td><strong>${spot.extractedTitle}</strong></td>
                <td><span style="color:#64748b; font-size:0.85rem;">${spot.extractedCategory}</span></td>
                <td>${spot.views.toLocaleString()} 회</td>
                <td>${spot.clicks.toLocaleString()} 회</td>
                <td><span style="color:#10b981; font-weight:700;">${spot.ctr}%</span></td>
            </tr>
        `;
    }).join('');
}

// 대시보드 위젯 카운팅 넘버 스크롤 애니메이션 유틸리티
function animateCountValue(id, endValue) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startPosition = 0;
    const totalDuration = 1000; // 1초 동안 구동
    const frameRate = 1000 / 60; // 60fps 기반 계산
    const totalFrames = Math.round(totalDuration / frameRate);
    const stepIncrement = endValue / totalFrames;

    const timer = setInterval(() => {
        startPosition += stepIncrement;
        if (startPosition >= endValue) {
            clearInterval(timer);
            obj.innerText = endValue.toLocaleString();
        } else {
            obj.innerText = Math.floor(startPosition).toLocaleString();
        }
    }, frameRate);
}