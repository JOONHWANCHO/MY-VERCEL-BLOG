// ==========================================================================
// [Admin OS 최종형] 구글 시트 실제 사용자 데이터 연동 및 보안 로그인 관리 모듈
// ==========================================================================

const TRACKING_API_URL = "https://script.google.com/macros/s/AKfycbzDL2_0OmI_LVYIxbWj_7FdqTxJGIATsjeyh90n6O29jYD_LRnnw_qHjEyWlyDZ4W4/exec";

// 🔐 안전을 위해 브라우저 세션 스토리지 기반 로그인 인증 확인 구동
document.addEventListener('DOMContentLoaded', () => {
    checkAdminSession();
});

function checkAdminSession() {
    const isLogin = sessionStorage.getItem('admin_authenticated');
    const overlay = document.getElementById('admin-login-overlay');
    
    if (isLogin === 'true') {
        if (overlay) overlay.style.display = 'none'; // 로그인 창 은폐
        loadRealDatabaseLogs(); // 실제 구글시트 데이터 집계 호출
    } else {
        if (overlay) overlay.style.display = 'flex'; // 로그인 화면 노출
    }
}

// 🔐 로그인 폼 제출 처리 핸들러 (계정 정보는 임시로 지정해 활용)
function handleAdminLogin(event) {
    event.preventDefault();
    const id = document.getElementById('admin-id').value.trim();
    const pw = document.getElementById('admin-pw').value.trim();
    const errMsg = document.getElementById('login-error-msg');

    // 💡 테스트용 마스터 관리자 계정 정보 설정
    if (id === "admin" && pw === "1234") {
        sessionStorage.setItem('admin_authenticated', 'true');
        errMsg.innerText = "";
        checkAdminSession();
    } else {
        errMsg.innerText = "⚠️ 아이디 또는 비밀번호가 일치하지 않습니다.";
    }
}

// 📊 구글 Apps Script에서 수집된 실제 사용자 Logs 리스트 호출 및 누적 연계 파싱
async function loadRealDatabaseLogs() {
    try {
        const response = await fetch(TRACKING_API_URL);
        const logDataList = await response.json(); // Apps Script에서 내려준 JSON 배열 추출

        if (!logDataList || logDataList.length === 0) {
            document.getElementById('top-clicks-chart').innerHTML = `<div class="loading">적재된 사용자 트래픽 데이터가 아직 존재하지 않습니다.</div>`;
            return;
        }

        // 💡 [실시간 집계 코어 엔진] Raw 로그를 순회하며 PostID별로 views와 clicks를 통합 카운팅 매핑 처리
        const statsMap = {};

        logDataList.forEach(log => {
            const pid = log.postId;
            if (!statsMap[pid]) {
                statsMap[pid] = {
                    id: pid,
                    title: log.title || `삭제된 액티비티 (${pid})`,
                    views: 0,
                    clicks: 0
                };
            }
            
            // 데이터 유형 매핑 가중치 연산
            if (log.actionType === 'view') {
                statsMap[pid].views += 1;
            } else if (log.actionType === 'click') {
                statsMap[pid].clicks += 1;
            }
        });

        // 맵 구조를 정렬을 용이하게 하기 위해 배열 객체 형태로 치환
        const processedReportArray = Object.values(statsMap).map(item => {
            item.ctr = item.views > 0 ? ((item.clicks / item.views) * 100).toFixed(1) : "0.0";
            return item;
        });

        // 3. 실시간 진짜 누적 데이터 대시보드 인터페이스 업데이트 바인딩
        renderAdminDashboard(processedReportArray);

    } catch (error) {
        console.error("구글 로그 데이터베이스 리딩 실패:", error);
        document.getElementById('top-clicks-chart').innerHTML = `<div style="color:red; padding:20px;">원격 데이터 수집 장애가 발생했습니다.</div>`;
    }
}

// 최종 조립 통계 렌더러
function renderAdminDashboard(reportData) {
    let grandViews = 0;
    let grandClicks = 0;

    reportData.forEach(r => {
        grandViews += r.views;
        grandClicks += r.clicks;
    });

    const averageCtr = grandViews > 0 ? ((grandClicks / grandViews) * 100).toFixed(1) : "0.0";

    // 상단 스코어 보드 매핑 애니메이션 연동
    animateCountValue('stat-total-views', grandViews);
    animateCountValue('stat-total-clicks', grandClicks);
    document.getElementById('stat-ctr').innerText = `${averageCtr}%`;

    // TOP 5 클릭 바 차트 구성 (클릭수 정렬)
    const chartContainer = document.getElementById('top-clicks-chart');
    const clickSorted = [...reportData].sort((a, b) => b.clicks - a.clicks).slice(0, 5);
    const maxClick = clickSorted.length > 0 ? clickSorted[0].clicks : 0;

    chartContainer.innerHTML = clickSorted.map((spot, idx) => {
        return `
            <div class="chart-row">
                <div class="chart-info-text">
                    <span><strong>${idx + 1}.</strong> ${spot.title}</span>
                    <span>${spot.clicks} 클릭수 (${spot.ctr}%)</span>
                </div>
                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" id="admin-bar-${idx}" style="width: 0%"></div>
                </div>
            </div>
        `;
    }).join('');

    setTimeout(() => {
        clickSorted.forEach((spot, idx) => {
            const bar = document.getElementById(`admin-bar-${idx}`);
            if (bar && maxClick > 0) {
                bar.style.width = `${(spot.clicks / maxClick) * 100}%`;
            }
        });
    }, 100);

    // 상세 통계 테이블 마크업 바인딩 (조회수 기준 내림차순 정렬)
    const tableBody = document.getElementById('admin-stats-table-body');
    const viewSorted = [...reportData].sort((a, b) => b.views - a.views);

    tableBody.innerHTML = viewSorted.map((spot, index) => {
        return `
            <tr>
                <td><span class="rank-badge">${index + 1}</span></td>
                <td><strong>${spot.title}</strong></td>
                <td><span style="color:#64748b; font-size:0.85rem;">실시간 데이터</span></td>
                <td>${spot.views.toLocaleString()} 회</td>
                <td>${spot.clicks.toLocaleString()} 회</td>
                <td><span style="color:#10b981; font-weight:700;">${spot.ctr}%</span></td>
            </tr>
        `;
    }).join('');
}

// 숫자 롤링 유틸리티 함수
function animateCountValue(id, endValue) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startPosition = 0;
    const totalFrames = 30;
    const stepIncrement = endValue / totalFrames;
    if (endValue === 0) { obj.innerText = "0"; return; }

    const timer = setInterval(() => {
        startPosition += stepIncrement;
        if (startPosition >= endValue) {
            clearInterval(timer);
            obj.innerText = endValue.toLocaleString();
        } else {
            obj.innerText = Math.floor(startPosition).toLocaleString();
        }
    }, 20);
}