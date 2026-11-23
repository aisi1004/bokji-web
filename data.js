/* 정책 데이터는 data/*.json (scripts/collect.mjs 가 매일 만든다). 여기에는 화면용 상수만 둔다. */
const DATA_BASE = "data/";
/* 앱 설정을 인터넷에서 받아오는 주소(공개 저장소 Pages 에 올리는 config.json, 도메인 bokji.imeji.com). 비워 두면 앱에 든 config.json 만 쓴다 */
const CONFIG_URL = "https://bokji.imeji.com/config.json";
const TODAY = (function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();

const CATS = ["생활안정", "주거·자립", "보육·교육", "고용·창업", "보건·의료", "보호·돌봄", "임신·출산", "문화·환경", "농림축산어업", "행정·안전"];

/* 환급금 안내(금액 계산 안 함, 조회 방법만 안내) */
const REFUNDS = [
  { t: "국민건강보험 환급금", q: "의료비를 많이 지출했다면?", how: "건강보험공단 '환급금 조회'에서 본인 인증 후 확인합니다.", link: "https://www.nhis.or.kr" },
  { t: "통신비 환급금", q: "휴대폰 해지·번호이동을 했다면?", how: "통신사 또는 스마트초이스에서 미환급액을 조회합니다.", link: "https://www.smartchoice.or.kr" },
  { t: "자동차 환급금", q: "자동차 구매 5년이 넘었다면?", how: "자동차 등록 지자체에서 과오납·이중납부분을 확인합니다.", link: "https://www.gov.kr" },
  { t: "국민연금 환급금", q: "자격 변동이 잦았다면?", how: "국민연금공단 '내 연금' 조회에서 확인합니다.", link: "https://www.nps.or.kr" },
  { t: "월세·세금 환급", q: "1년간 낸 월세·세금을 돌려받고 싶다면?", how: "홈택스 '환급금 조회'에서 확인합니다.", link: "https://www.hometax.go.kr" }
];

/* 복지 소식은 아직 예시. 출시 전 공개 RSS로 교체 */
const NEWS = [
  { t: "복지 소식은 곧 공식 보도자료로 채워집니다", s: "예시", d: TODAY }
];
