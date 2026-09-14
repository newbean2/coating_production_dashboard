/**
 * ============================================================================
 * 코팅 설비 생산일지 대시보드 스크립트 (dashboard.js)
 * 
 * [초급자를 위한 전체 작동 원리 안내]
 * 1. 사용자가 <input type="file"> 로 CSV 파일을 선택합니다.
 * 2. FileReader 와 TextDecoder 를 사용하여 파일 내용을 텍스트 문자열로 읽습니다.
 *    - 엑셀에서 바로 저장한 CP949(EUC-KR) 및 UTF-8 인코딩 모두 한글 깨짐 없이 지원합니다.
 * 3. parseCSV() 함수를 통해 줄(Row)과 칸(Column) 단위의 자바스크립트 객체 배열로 변환합니다.
 * 4. 변환된 데이터를 4대 주요 영역에 각각 렌더링(화면에 표시)합니다:
 *    - renderSummaryCards(): 총 롤 수, 불량률(%), 가동률(%), 총 로스시간 계산 및 표시
 *    - renderEquipmentChart(): 설비별 생산 롤 수 집계 후 많은 순으로 세로 막대 그래프 표시
 *    - renderDailyChart(): 일자별 생산 롤 수 집계 후 날짜 오름차순으로 세로 막대 그래프 표시
 *    - renderModelChart(): 생산모델별 생산 롤 수를 세로 막대 그래프로 표시
 *    - renderEquipmentTimeChart(): 설비별 생산시간과 로스시간 합계를 세로 막대로 비교
 *    - renderTable(): 전체 롤 데이터 표와 NG 데이터 전용 표를 생성
 * ============================================================================
 */

// DOM(HTML 문서)이 모두 로드되면 이벤트를 등록합니다.
document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('csvFileInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    // 파일 선택 창에서 파일이 선택되었을 때 실행되는 리스너
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        // 선택한 파일 이름 표시
        fileNameDisplay.textContent = file.name;

        // 파일 읽기 실행
        readCSVFile(file);
    });
});

/**
 * 1. 파일을 ArrayBuffer로 읽어 한글 인코딩(UTF-8 / EUC-KR)에 맞게 안전하게 디코딩하는 함수
 * @param {File} file - 사용자가 업로드한 파일 객체
 */
function readCSVFile(file) {
    const reader = new FileReader();

    reader.onload = function (e) {
        const arrayBuffer = e.target.result;
        let textContent = '';

        // 윈도우 환경 한국어 엑셀 CSV는 종종 EUC-KR(CP949)로 저장되므로,
        // 먼저 표준 UTF-8로 디코딩을 시도하고 실패하면 EUC-KR로 디코딩합니다.
        try {
            const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
            textContent = utf8Decoder.decode(arrayBuffer);
        } catch (error) {
            // UTF-8 디코딩 중 에러(잘못된 바이트)가 발생하면 EUC-KR로 대체 시도
            const eucDecoder = new TextDecoder('euc-kr');
            textContent = eucDecoder.decode(arrayBuffer);
        }

        // 디코딩된 CSV 텍스트 문자열을 파싱합니다.
        const parsedData = parseCSV(textContent);

        if (!parsedData || parsedData.length === 0) {
            alert('CSV 데이터가 비어있거나 올바른 형식이 아닙니다.');
            return;
        }

        // 파싱된 데이터로 4대 대시보드 영역을 모두 업데이트합니다.
        updateDashboard(parsedData);
    };

    reader.onerror = function () {
        alert('파일을 읽는 중 오류가 발생했습니다.');
    };

    // ArrayBuffer 형태로 읽기 시작
    reader.readAsArrayBuffer(file);
}

/**
 * 2. CSV 문자열을 자바스크립트 객체 배열로 변환하는 파서 함수
 * 따옴표("...") 처리 및 윈도우 줄바꿈(\r\n)을 완벽히 처리합니다.
 * @param {string} csvText - 디코딩된 순수 CSV 텍스트
 * @returns {Array<Object>} 각 행을 컬럼명을 키로 하는 객체로 담은 배열
 */
function parseCSV(csvText) {
    // 줄바꿈 기호(\r\n, \r, \n)를 기준으로 행을 분리합니다.
    const lines = csvText.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
    if (lines.length < 2) return [];

    // 쉼표로 분리하되 따옴표 내부의 쉼표는 보호하는 정규식 파서 함수
    function parseCSVLine(line) {
        const result = [];
        let curVal = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                // 연속된 따옴표("")는 하나의 따옴표로 처리
                if (insideQuotes && line[i + 1] === '"') {
                    curVal += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                // 따옴표 바깥의 쉼표는 열(컬럼) 구분 기호
                result.push(curVal.trim());
                curVal = '';
            } else {
                curVal += char;
            }
        }
        result.push(curVal.trim());
        return result;
    }

    // 첫 번째 줄은 컬럼 헤더(키값)입니다.
    const headers = parseCSVLine(lines[0]);

    const dataRows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
            const rowObj = {};
            headers.forEach((header, index) => {
                rowObj[header] = values[index];
            });
            dataRows.push(rowObj);
        }
    }

    return dataRows;
}

/**
 * 3. 대시보드 전체를 일괄 업데이트하는 총괄 함수
 * @param {Array<Object>} data - 파싱된 전체 행 데이터
 */
function updateDashboard(data) {
    renderSummaryCards(data);
    renderEquipmentChart(data);
    renderDailyChart(data);
    renderModelChart(data);
    renderEquipmentTimeChart(data);
    renderTable(data);
}

/**
 * 4. [영역 1] 요약 카드 렌더링 함수
 * 계산 항목:
 * - 총 롤 수: 전체 데이터 행의 개수
 * - 불량률(%): (판정이 'NG'인 롤 수 / 총 롤 수) * 100  (소수점 첫째 자리까지)
 * - 가동률(%): 생산시간 합계 / (생산시간 합계 + 로스시간 합계) * 100 (소수점 첫째 자리까지)
 * - 총 로스시간: 로스시간 합계 (분 단위 표시)
 * @param {Array<Object>} data 
 */
function renderSummaryCards(data) {
    const totalRolls = data.length;

    let ngCount = 0;
    let totalProdTime = 0;
    let totalLossTime = 0;

    data.forEach(row => {
        // 판정이 NG인지 판별 (대소문자 및 공백 유연하게 처리)
        const judgment = (row['판정'] || '').trim().toUpperCase();
        if (judgment === 'NG') {
            ngCount++;
        }

        // 생산시간_분 및 로스시간_분 숫자 변환 (누락이나 NaN 대비 기본값 0)
        const prodTime = parseFloat(row['생산시간_분']) || 0;
        const lossTime = parseFloat(row['로스시간_분']) || 0;

        totalProdTime += prodTime;
        totalLossTime += lossTime;
    });

    // 불량률(%) 계산 및 소수점 1자리 포맷
    const defectRate = totalRolls > 0 ? ((ngCount / totalRolls) * 100).toFixed(1) : '0.0';

    // 가동률(%) 계산 = 생산시간 합계 / (생산시간+로스시간 합계) x 100
    const totalOperatingTime = totalProdTime + totalLossTime;
    const operationRate = totalOperatingTime > 0 ? ((totalProdTime / totalOperatingTime) * 100).toFixed(1) : '0.0';

    // HTML DOM 에 반영
    document.getElementById('cardTotalRolls').textContent = `${totalRolls.toLocaleString()} 롤`;
    document.getElementById('cardDefectRate').textContent = `${defectRate}%`;
    document.getElementById('cardOperationRate').textContent = `${operationRate}%`;
    document.getElementById('cardTotalLoss').textContent = `${totalLossTime.toLocaleString()} 분`;
}

/**
 * 5. [영역 2] 설비별 생산 롤 수 가로 막대 차트 (많은순 정렬)
 * - 외부 차트 라이브러리 없이 div 의 width % 속성으로 렌더링합니다.
 * @param {Array<Object>} data 
 */
function renderEquipmentChart(data) {
    const container = document.getElementById('equipmentBarChart');
    const countMap = createCountMap(data, '설비명', '미지정');
    const sortedItems = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    renderVerticalCountChart(container, sortedItems, data.length, '설비 데이터가 없습니다.');
}

/**
 * 6. [영역 3] 일자별 생산 롤 수 가로 막대 차트 (날짜순 정렬)
 * - 날짜 오름차순(과거->최신)으로 정렬하여 추세를 파악하기 쉽게 만듭니다.
 * - div 의 width % 속성으로 막대를 그립니다.
 * @param {Array<Object>} data 
 */
function renderDailyChart(data) {
    const container = document.getElementById('dailyBarChart');
    const countMap = createCountMap(data, '생산일자', '날짜 미지정');
    const sortedItems = Object.entries(countMap).sort((a, b) => a[0].localeCompare(b[0]));
    renderVerticalCountChart(container, sortedItems, data.length, '일자 데이터가 없습니다.', 'daily-fill');
}

/**
 * 7. [영역 4] 생산모델별 생산 롤 수 세로 막대 차트
 * @param {Array<Object>} data
 */
function renderModelChart(data) {
    const container = document.getElementById('modelBarChart');
    const countMap = createCountMap(data, '생산모델', '모델 미지정');
    const sortedItems = Object.entries(countMap).sort((a, b) => b[1] - a[1]);
    renderVerticalCountChart(container, sortedItems, data.length, '생산모델 데이터가 없습니다.', 'model-fill');
}

/**
 * 8. [영역 5] 설비별 생산시간 및 로스시간 세로 막대 차트
 * 같은 설비의 두 시간 값을 한 그룹에 배치해 설비별 효율 차이를 비교합니다.
 * @param {Array<Object>} data
 */
function renderEquipmentTimeChart(data) {
    const container = document.getElementById('equipmentTimeChart');
    container.innerHTML = '';

    const timeMap = {};
    data.forEach(row => {
        const equipment = (row['설비명'] || '미지정').trim();
        if (!timeMap[equipment]) {
            timeMap[equipment] = { production: 0, loss: 0 };
        }
        timeMap[equipment].production += parseFloat(row['생산시간_분']) || 0;
        timeMap[equipment].loss += parseFloat(row['로스시간_분']) || 0;
    });

    const sortedItems = Object.entries(timeMap).sort((a, b) => {
        const totalA = a[1].production + a[1].loss;
        const totalB = b[1].production + b[1].loss;
        return totalB - totalA;
    });

    if (sortedItems.length === 0) {
        container.innerHTML = '<div class="empty-notice">설비 시간 데이터가 없습니다.</div>';
        return;
    }

    const maxTime = Math.max(...sortedItems.flatMap(([, values]) => [values.production, values.loss]), 1);
    sortedItems.forEach(([equipment, values]) => {
        const column = document.createElement('div');
        column.className = 'bar-column';
        column.innerHTML = `
            <div class="bar-value">${(values.production + values.loss).toLocaleString()}분</div>
            <div class="time-bars">
                <div class="bar-track-vertical" title="생산시간 ${values.production.toLocaleString()}분">
                    <div class="bar-fill-vertical production-fill" style="height: ${(values.production / maxTime * 100).toFixed(1)}%;"></div>
                </div>
                <div class="bar-track-vertical" title="로스시간 ${values.loss.toLocaleString()}분">
                    <div class="bar-fill-vertical loss-fill" style="height: ${(values.loss / maxTime * 100).toFixed(1)}%;"></div>
                </div>
            </div>
            <span class="bar-label" title="${escapeHtml(equipment)}">${escapeHtml(equipment)}</span>
        `;
        container.appendChild(column);
    });
}

/**
 * 집계형 세로 막대 차트를 공통으로 그리는 함수입니다.
 * @param {HTMLElement} container 차트를 넣을 DOM 요소
 * @param {Array<Array<string|number>>} items [라벨, 수량] 목록
 * @param {number} totalCount 전체 데이터 수
 * @param {string} emptyMessage 데이터가 없을 때 표시할 문구
 * @param {string} fillClass 막대 색상 구분용 클래스
 */
function renderVerticalCountChart(container, items, totalCount, emptyMessage, fillClass = '') {
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = `<div class="empty-notice">${emptyMessage}</div>`;
        return;
    }

    const maxCount = Math.max(...items.map(([, count]) => count), 1);
    items.forEach(([label, count]) => {
        const heightPercent = ((count / maxCount) * 100).toFixed(1);
        const sharePercent = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0.0';
        const column = document.createElement('div');
        column.className = 'bar-column';
        column.innerHTML = `
            <div class="bar-value">${count.toLocaleString()}롤</div>
            <div class="bar-track-vertical">
                <div class="bar-fill-vertical ${fillClass}" style="height: ${heightPercent}%;"></div>
            </div>
            <span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
            <span class="bar-share">${sharePercent}%</span>
        `;
        container.appendChild(column);
    });
}

/**
 * CSV 행을 특정 열 기준으로 세는 공통 집계 함수입니다.
 * @param {Array<Object>} data 전체 CSV 데이터
 * @param {string} field 집계할 컬럼명
 * @param {string} fallback 값이 비어 있을 때 사용할 표시명
 * @returns {Object<string, number>} 표시명별 개수 객체
 */
function createCountMap(data, field, fallback) {
    const countMap = {};
    data.forEach(row => {
        const label = (row[field] || fallback).trim();
        countMap[label] = (countMap[label] || 0) + 1;
    });
    return countMap;
}

/**
 * 9. [영역 6] 전체 롤 테이블과 NG 전용 테이블 렌더링 함수
 * - 판정이 'NG'인 행은 .row-ng 클래스를 부여하여 붉은색 배경으로 명확히 구분합니다.
 * @param {Array<Object>} data 
 */
function renderTable(data) {
    const tbody = document.getElementById('tableBody');
    const countDisplay = document.getElementById('tableRowCount');

    tbody.innerHTML = ''; // 기존 내용 초기화
    countDisplay.textContent = `전체 ${data.length.toLocaleString()}건`;

    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="empty-table-cell">데이터가 없습니다.</td></tr>';
        return;
    }

    // 성능 향상을 위해 DocumentFragment 활용
    const fragment = document.createDocumentFragment();

    data.forEach(row => {
        const tr = document.createElement('tr');

        // 판정 값 확인 (OK 또는 NG)
        const judgment = (row['판정'] || '').trim().toUpperCase();
        const isNG = (judgment === 'NG');

        // ★ 조건 충족: 판정이 NG 인 행은 배경으로 구분하기 위해 클래스 추가 ★
        if (isNG) {
            tr.classList.add('row-ng');
        }

        // 판정 뱃지 HTML
        const badgeHtml = isNG 
            ? '<span class="badge badge-ng">NG</span>' 
            : '<span class="badge badge-ok">OK</span>';

        // 숫자 값은 가독성을 위해 첫째 자리 포맷(필요시)
        const formatNum = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? (val || '-') : num.toLocaleString();
        };

        tr.innerHTML = `
            <td>${escapeHtml(row['생산일자'] || '-')}</td>
            <td>${escapeHtml(row['설비명'] || '-')}</td>
            <td>${escapeHtml(row['MES_NO'] || '-')}</td>
            <td style="text-align: left; padding-left: 12px;">${escapeHtml(row['생산모델'] || '-')}</td>
            <td>${formatNum(row['두께_좌'])}</td>
            <td>${formatNum(row['두께_중'])}</td>
            <td>${formatNum(row['두께_우'])}</td>
            <td>${formatNum(row['무게'])}</td>
            <td>${formatNum(row['통기도'])}</td>
            <td>${formatNum(row['인장강도'])}</td>
            <td>${formatNum(row['생산시간_분'])}</td>
            <td>${formatNum(row['로스시간_분'])}</td>
            <td>${badgeHtml}</td>
        `;

        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    // 전체 표와 별개로 NG 행만 다시 렌더링하여 불량 데이터를 한눈에 모아 보여줍니다.
    renderNgTable(data.filter(row => (row['판정'] || '').trim().toUpperCase() === 'NG'));
}

/**
 * NG 판정 데이터만 전용 표에 표시합니다.
 * 전체 표와 동일한 컬럼을 유지해 NG 행의 원본 상세 정보를 빠짐없이 확인할 수 있습니다.
 * @param {Array<Object>} ngRows 판정 값이 NG인 행 목록
 */
function renderNgTable(ngRows) {
    const tbody = document.getElementById('ngTableBody');
    const countDisplay = document.getElementById('ngTableRowCount');
    tbody.innerHTML = '';
    countDisplay.textContent = `NG ${ngRows.length.toLocaleString()}건`;

    if (ngRows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="empty-table-cell">NG 판정 데이터가 없습니다.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    ngRows.forEach(row => {
        const tr = document.createElement('tr');
        tr.classList.add('row-ng');

        const formatNum = (val) => {
            const num = parseFloat(val);
            return isNaN(num) ? (val || '-') : num.toLocaleString();
        };

        tr.innerHTML = `
            <td>${escapeHtml(row['생산일자'] || '-')}</td>
            <td>${escapeHtml(row['설비명'] || '-')}</td>
            <td>${escapeHtml(row['MES_NO'] || '-')}</td>
            <td style="text-align: left; padding-left: 12px;">${escapeHtml(row['생산모델'] || '-')}</td>
            <td>${formatNum(row['두께_좌'])}</td>
            <td>${formatNum(row['두께_중'])}</td>
            <td>${formatNum(row['두께_우'])}</td>
            <td>${formatNum(row['무게'])}</td>
            <td>${formatNum(row['통기도'])}</td>
            <td>${formatNum(row['인장강도'])}</td>
            <td>${formatNum(row['생산시간_분'])}</td>
            <td>${formatNum(row['로스시간_분'])}</td>
            <td><span class="badge badge-ng">NG</span></td>
        `;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
}

/**
 * XSS(교차 사이트 스크립팅) 방지를 위한 텍스트 이스케이프 유틸리티 함수
 * @param {string} str 
 * @returns {string} 이스케이프된 안전한 문자열
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
