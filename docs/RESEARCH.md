# 상영관 자료 조사 기록

조사일: 2026-10-15 (Asia/Seoul)

이번 조사는 **지점 탐색에 필요한 위치·교통·공식 링크와 포맷 근거**를 보강했다. 실시간 상영시간표, 판매 가능한 좌석, 현장 실측을 수집한 작업은 아니다. 총 11개 기록 중 10개는 탐색 목록이고, CGV 판교 1개는 운영 종료 보도를 보존한 기록이다. 서울·경기 전체 영화관 목록은 아니다.

## 이번 변경

- CGV 영등포타임스퀘어 IMAX, 메가박스 수원AK플라자 Dolby Cinema, 메가박스 안성스타필드 Dolby Cinema를 추가했다. 세 상영관의 화면 치수, 좌석 수, 행 수, 좌석 배치도는 확인할 수 없어 `null`로 남겼다.
- 기존 8개 기록에 한국어 설명, 공식 연결 링크, 확인 범위와 출처 목록을 추가했다. 운영 중인 지점의 주소와 교통 정보를 가능한 범위에서 보강했다.
- 용산 IMAX의 31 × 22.4m에 대해 **2019-07-24 CGV 영사기술팀 인터뷰**라는 직접 운영사 근거를 추가했다. 신뢰도는 `high_historical_primary`이다. 2026년 실측이라는 뜻은 아니다.
- 코엑스의 17.4 × 7.4m는 Dolby Cinema 전환 이전 M관 자료이므로 현재 `screen_m.value`를 `null`로 수정했다. 기존 수치는 `historical_screen_m`에 남겼다. 현재 크기 비교나 시야각 계산에 사용할 수 없다.
- 코엑스 378석은 2020년 개관 보도의 역사적 수치로 표시했다. 월드타워 34 × 13.8m 역시 리뉴얼 이전 사양임을 해당 값 옆에 기록했다.
- 용산·왕십리·광교의 기존 좌석 도식 셀 좌표와 장애인석 위치는 유지했다. 후속 상세 이미지 확인으로 읽을 수 있는 실제 좌석 표기 44개만 추가했다. 전체 좌석 번호나 실측 간격이 확인된 것은 아니다.

## 자료별 확인 범위

| 자료 | 발행일 | 이번에 사용한 사실 | 확인 방법·한계 |
| --- | --- | --- | --- |
| [CGV 용산아이파크몰](https://cgv.co.kr/cnm/bzplcCgv/0013001) | 표시 없음 | IMAX 표기, 주소, 1호선 용산역 연결, 신용산역 4번 출구 | 공식 도메인 검색 색인. 직접 본문 추출은 빈 화면 |
| [CGV 왕십리 방문 안내](https://m.cgv.co.kr/WebAPP/TheaterV4/TheaterDetail.aspx?tc=0074) | 표시 없음 | 왕십리광장로 17 5층, 왕십리역 환승 노선 | 구형 공식 모바일 페이지 검색 색인. 최신 내부 출입 동선은 확정하지 않음 |
| [CGV 광교](https://cgv.co.kr/cnm/bzplcCgv/0257001) | 표시 없음 | IMAX 표기, 갤러리아 10층, 광교중앙역 4번 출구 740m | 공식 도메인 검색 색인. 직접 본문 추출은 빈 화면 |
| [CGV 영등포타임스퀘어](https://cgv.co.kr/cnm/bzplcCgv/0059001) | 표시 없음 | 현재 지점명, IMAX·SCREENX, 타임스퀘어 주소, 영등포역 5번 출구 | 공식 도메인 검색 색인. 조조·심야 연결통로 제한 안내 포함 |
| [CJ 영사기술팀 인터뷰](https://cjnews.cj.net/%EC%9D%B8%ED%84%B0%EB%B7%B0-%EA%B5%AD%EB%82%B4-%EC%95%84%EC%9D%B4%EB%A7%A5%EC%8A%A4-%EB%81%9D%ED%8C%90%EC%99%95-%EC%9A%A9%EC%95%84%EB%A7%A5%EC%9D%98-%EC%B0%BD%EC%A1%B0%EC%9E%90-cj/) | 2019-07-24 | 용산 31 × 22.4m, 레이저, 1.43:1·1.9:1 대응 | 공식 본문 직접 확인. 과거 사양 |
| [CJ 영등포 IMAX 개관 발표](https://cjnews.cj.net/cgv-imax%EA%B4%80-%ED%99%95%EB%8C%80cgv%EC%98%81%EB%93%B1%ED%8F%AC-%EB%8C%80%EC%A0%84%ED%84%B0%EB%AF%B8%EB%84%90-%EC%B2%9C%EC%95%88%ED%8E%9C%ED%83%80%ED%8F%AC%ED%8A%B8-%ED%8F%89%ED%83%9D/) | 2023-12-08 | 영등포 IMAX 2023-12-15 개관 예고 | 공식 본문 직접 확인. 치수·좌석 수는 없음 |
| [Dolby 한국 지점 발표](https://news.dolby.com/en-WW/238494-megabox-adopting-new-dolby-vision-dolby-atmos-offering-for-premium-movie-theaters/) | 2024-06-17 한국 발표일 | 코엑스·남양주·수원AK·안성의 Dolby Cinema 지점 근거 | 공식 검색 색인. 페이지 표시는 6월 16일 PDT. 과거 지점 목록이며 당일 편성 근거가 아님 |
| [코엑스몰 지하철 안내](https://www.starfield.co.kr/coexmall/about/directions.do?type=metro) | 표시 없음 | 삼성역 5·6번 / 봉은사역 7번 출구 연결, 몰 대표 주소 | 몰 공식 공개 안내. 영화관 주소 표기와 몰 대표 주소를 구분 |
| [코엑스몰 메가박스 안내](https://www.starfield.co.kr/coexmall/entertainment/megabox.do) | 표시 없음 | 몰 내 메가박스 입점, 공식 링크 | 공개 본문 직접 확인. 치수·좌석 수 미제공 |
| [현대 SPACE 1 위치 안내](https://home.ehyundai.com/newPortal/outlet/DP/WC/WC000000_V.do?branchCd=B00178000&n=1) | 표시 없음 | 다산순환로 50, 다산역 땡큐11·도농역 땡큐50 연결 | 공식 본문 직접 확인. 버스 배차·실시간 소요 시간은 확인하지 않음 |
| [AK플라자 수원](https://www.akplaza.com/store/introduce?store=02) | 표시 없음 | 덕영대로 924, 수원역에서 백화점 2층 연결 | 공식 도메인 검색 색인. 직접 열기는 오류 |
| [메가박스 수원AK플라자 주소 공지](https://m.megabox.co.kr/support/notice/detail?artiNo=10914&bbsNo=9) | 2023-07-26 | 영화관의 AK플라자 수원 주소 | 공식 검색 색인. 과거 주차 요금을 현재 요금으로 옮기지 않음 |
| [스타필드 안성 메가박스](https://www.starfield.co.kr/anseong/entertainment/megabox.do) | 표시 없음 | Dolby Cinema, Dolby Vision·Atmos, 몰 주소 | 현재 공개 본문 직접 확인 |
| [스타필드 안성 교통](https://www.starfield.co.kr/anseong/about/directions.do) | 표시 없음 | 안성IC·38번 국도 접근 | 공식 본문 직접 확인. 버스 노선·주차 요금은 확정하지 않음 |
| [롯데시네마 수퍼플렉스](https://www.lottecinema.co.kr/NLCHS/Cinema/SpecialCinema?divisionCode=2&screendivcd=940) | 표시 없음 | 월드타워, 4K Dual Laser, Dolby Atmos | 공식 도메인 검색 색인. 직접 본문은 JavaScript 껍데기 |
| [월드타워 시설 정보 재게시](https://public.ai.kr/ko/facilities/%EB%A1%AF%EB%8D%B0%EC%8B%9C%EB%84%A4%EB%A7%88-%EC%9B%94%EB%93%9C%ED%83%80%EC%9B%8C-FC002402) | 표시 없음 | 올림픽로 300 주소 | KOPIS 데이터를 재게시하는 2차 사이트. KOPIS 원본을 직접 검증하지 않음 |

메가박스의 `theater?brchNo=1351`, `0019`, `0052`, `0020` 공개 URL을 열어봤지만, 반환된 본문은 공통 사이트 화면이었다. 지점 URL이 열린다는 사실을 주소·좌석·현재 상영 포맷이 확인됐다는 근거로 쓰지 않았다. 대신 지점이 소재한 몰의 직접 안내와 Dolby의 공식 지점 자료를 연결했다.

## 추가 스키마

`rooms[]`에 다음 선택 필드를 추가했다. 기존 필드를 제거하거나 좌석 도식을 변경하지 않았다.

- `official_url`: 운영사 지점 또는 특별관 안내. 종료 기록은 `null`.
- `address`, `transport`: 출처에 근거한 방문 정보. 미확인은 빈 값을 유지하며 정밀 도보 시간은 추정하지 않는다.
- `summary`: 이용자용 한국어 소개.
- `verified_date`: `info_sources`를 검토한 날짜. 좌석·치수·현재 운영 전체를 인증하는 값이 아니다. 이번에 새로 확인하지 않은 판교 기록은 `null`.
- `verification_note`: 확인한 사실과 확인하지 못한 범위.
- `info_sources`: 기존 최상위 `sources`의 식별자 배열.
- `tags`: 지점 약칭·역 이름 등 검색용 키워드. 객관적인 품질 순위가 아니다.
- `historical_screen_m`: 코엑스의 이전 M관 자료 보관 전용. 현재 수치 계산에서 제외한다.

최상위 `research_updated_at`과 `research_scope`를 추가했다. 기존 `checked_at`과 좌석 도식의 `observed_at`은 과거 검토 시간을 보존한다. 각 새 출처에는 `verification_method`를 추가해 직접 본문 확인, 검색 색인, 공통 화면만 받은 경우를 구분했다.

## 남은 검증 한계

1. 운영사 예매 화면의 현재 전체 좌석 배치도와 실제 좌석 번호는 새로 확보하지 못했다.
2. 화면 높이·곡률·스크린 하단 높이·열 간격·좌석 폭·경사·시선 높이의 현장 실측이 없다. 시뮬레이터의 가정값을 상영관의 사실로 저장하면 안 된다.
3. 코엑스는 현재 치수가 없다. 월드타워의 리뉴얼 전 34 × 13.8m도 현재 곡면 스크린의 실측치처럼 소개하면 안 된다.
4. 판교 종료 기록의 근거는 기존 언론 보도이며 운영사 폐점 공지 원문은 새로 확보하지 않았다.
5. 별도 요금·상영시간·주차 할인표는 빠르게 바뀌므로 복제하지 않았다. 이용자는 공식 링크에서 원하는 날짜와 회차를 확인해야 한다.
6. `Dolby Atmos` 음향 적용관이나 `Dolby Vision + Dolby Atmos`관을 `Dolby Cinema` 브랜드와 자동으로 같은 것으로 분류하면 안 된다.

이 문서는 출처 페이지의 사진·좌석표 이미지를 복제하지 않는다. 사실은 요약하고 원문으로 연결한다.


## 후속 좌석 표기 확인 (2026-10-15)

사용자가 의자와 행·번호를 실제 배치에 가깝게 보기를 요청해, 기존 글이 연결한 전체/상세 이미지 6개를 공개 다운로드로 받아 원본을 직접 보았다. 이미지는 `/tmp`의 조사용 경로에만 저장했고 저장소나 서비스에 포함하지 않았다. 전체 배치 이미지에는 번호가 없고 상세 이미지에서는 회색 좌석의 번호가 가려져 있다. 따라서 미확인 좌석에 왼쪽부터 순번을 붙여 실제 예매번호처럼 표시하지 않는다.

| 상영관 | 직접 읽은 좌석 표기 | 개수 | 직접 읽은 행 이름 |
| --- | --- | --- | --- |
| [용산 상세 이미지](https://drive.google.com/file/d/13RW0g0TmBPFu05LNtMgutHQilc3CJU_l/view) | A17, A18, A19, A22, A23, A24 | 6 | A |
| [왕십리 상세 이미지](https://drive.google.com/file/d/1QJ9WIJ64xLB_eTeRHdb-PGj9Iw5A8nfn/view) | A5, A6, A7, A9, A10, A11; B5, B6, B7 | 9 | A, B |
| [광교 상세 이미지](https://drive.google.com/file/d/1hdHNdgUAn-RJHK_XbYsKo74UX2d3-tqJ/view) | A7, A10, A12, A13, A14, A15, A18, A21; B7, B9, B10, B11, B12, B13, B14, B15, B16, B17, B18, B19, B21; C7, C9, C10, C12, C16, C18, C19, C21 | 29 | A, B, C |

각 행의 `seat_labels`는 `occupied_grid_columns_zero_based`와 같은 순서·길이의 배열이다. 읽은 표기는 `A17`처럼 원문으로 저장하고, 읽지 못한 표기는 `null`로 남겼다. 상세 이미지의 장애인석과 통로를 기준으로 기존 전체 도식과 대응했다. 예를 들어 용산의 격자 열 18은 실제 `A17`이므로 **격자 열이나 행 내 순번을 예매 좌석 번호로 쓰면 틀린다**. 왕십리 상세 이미지의 왼쪽 끝 `A5`는 전체 도식의 첫 좌석이 아니라 격자 열 5에 해당한다.

`row_label_confidence`는 실제 글자를 읽은 행만 `observed_operator_ui_screenshot_secondary_hosted`로 높였다. 그 뒤 행들은 기존 순차 추정 표시를 유지했다. `seat_label_verification`은 이미지 확인일, 출처, 읽은 개수, 대응 방법을 기록한다. `exact_seat_numbers_known=false`는 전체 번호를 알지 못한다는 뜻이므로 그대로 유지한다. 이 이미지는 2026년 8월 자료이며 10월 15일의 현재 예매상태나 좌석 번호를 보증하지 않는다.
