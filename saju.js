/* SaJuTeeing 궁합 엔진: 생년월일시 → 사주 8글자 → 두 사람 궁합 점수 (사주 + MBTI)
 * 브라우저: lunar.js 다음에 <script src="saju.js"> → window.Saju
 * Node:    require('./saju.js')
 * 만세력(절기·음력 변환)은 lunar-javascript(MIT) 사용. 해석 규칙과 점수는 아래 W 표에서 조정한다. */
(function (root) {
  const { Solar, Lunar } = typeof module === 'object' ? require('lunar-javascript') : root;

  const GAN = '甲乙丙丁戊己庚辛壬癸', GAN_KO = '갑을병정무기경신임계';
  const ZHI = '子丑寅卯辰巳午未申酉戌亥', ZHI_KO = '자축인묘진사오미신유술해';
  const ZHI_ANIMAL = ['쥐', '소', '호랑이', '토끼', '용', '뱀', '말', '양', '원숭이', '닭', '개', '돼지'];
  const EL = ['목', '화', '토', '금', '수'];                         // 나무·불·흙·쇠·물
  const ZHI_EL = [4, 2, 0, 0, 2, 1, 1, 2, 3, 3, 2, 4];               // 지지 → 오행
  const WONJIN = [7, 6, 9, 8, 11, 10, 1, 0, 3, 2, 5, 4];              // 원진(서로 꺼리는 띠) 짝

  // 궁합 점수표: 사용자가 정할 가중치. 기본 50점에서 더하고 뺀다.
  const W = {
    base: 50,
    ganHap: 15, ganSaeng: 8, ganSame: 3, ganGeuk: -6,                 // 일간(나 자신)끼리
    dayHap: 12, daySamHap: 8, dayChung: -12, dayWonjin: -8,           // 일지(배우자 자리)끼리
    yearHap: 6, yearSamHap: 6, yearChung: -6, yearWonjin: -4,         // 띠끼리
    fill: 4, fillMax: 12,                                             // 부족한 오행을 상대가 채워 줌
    sajuWeight: 0.6,                                                  // 총점 = 사주 60% + MBTI 40%
  };

  // 출생지(시·도청 경도). 실제 해 기준 시각 보정용
  const PLACES = {
    서울: 126.98, 부산: 129.08, 대구: 128.6, 인천: 126.71, 광주: 126.85, 대전: 127.38, 울산: 129.31,
    세종: 127.29, 경기: 127.01, 강원: 127.73, 충북: 127.49, 충남: 126.66, 전북: 127.15, 전남: 126.46,
    경북: 128.73, 경남: 128.68, 제주: 126.53,
  };

  const seoul = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  });
  // 한국 시계 시각 → UTC. 서머타임(1948~60, 1987~88)과 UTC+8:30 시기(1954~61)는 브라우저 시간대 정보로 처리
  function seoulToUtc(y, mo, d, h, mi) {
    const wall = Date.UTC(y, mo - 1, d, h, mi);
    const offset = t => {
      const p = Object.fromEntries(seoul.formatToParts(new Date(t)).map(x => [x.type, +x.value]));
      return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
    };
    const t = wall - offset(wall - 9 * 3600e3);
    return wall - offset(t);
  }
  const solarAt = ms => { const d = new Date(ms); return Solar.fromYmdHms(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), 0); };
  const pillar = (gz, label) => { const g = GAN.indexOf(gz[0]), z = ZHI.indexOf(gz[1]); return { label, g, z, ko: GAN_KO[g] + ZHI_KO[z], hanja: gz }; };

  /** @param {{date:string, time?:string, calendar?:'solar'|'lunar'|'leap', place?:string}} input  date 'YYYY-MM-DD', time 'HH:MM' 또는 빈칸(모름) */
  function calc({ date, time = '', calendar = 'solar', place = '서울' }) {
    let [y, m, d] = String(date).split('-').map(Number);
    if (!y || !m || !d) throw new Error('생년월일을 입력하세요');
    if (calendar !== 'solar') {
      try { ({ y, m, d } = (s => ({ y: s.getYear(), m: s.getMonth(), d: s.getDay() }))(Lunar.fromYmd(y, calendar === 'leap' ? -m : m, d).getSolar())); }
      catch { throw new Error(calendar === 'leap' ? `${y}년에는 윤${m}월이 없습니다` : '없는 음력 날짜입니다'); }
    }
    const known = /^\d{1,2}:\d{2}$/.test(time);
    const [h, mi] = known ? time.split(':').map(Number) : [12, 0];
    const utc = seoulToUtc(y, m, d, h, mi);
    // 해·달 기둥은 절기 경계(중국 표준시 UTC+8 기준)로, 날·시 기둥은 출생지의 실제 해 기준 시각으로
    const ym = solarAt(utc + 8 * 3600e3).getLunar().getEightChar();
    const lng = PLACES[place] ?? 127.5;
    const dt = solarAt(utc + lng * 4 * 60e3).getLunar().getEightChar();
    dt.setSect(1);                                                     // 밤 11시부터 다음 날로 본다 (시각 모르면 정오로 계산)
    const pillars = [pillar(ym.getYear(), '년'), pillar(ym.getMonth(), '월'), pillar(dt.getDay(), '일')];
    if (known) pillars.push(pillar(dt.getTime(), '시'));
    return { solar: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ...summary(pillars) };
  }
  function summary(pillars) {
    const count = [0, 0, 0, 0, 0];
    for (const p of pillars) { count[p.g >> 1]++; count[ZHI_EL[p.z]]++; }
    return { timeKnown: pillars.length === 4, pillars, count, dayEl: pillars[2].g >> 1 };
  }

  // 서버 저장용: [[천간 번호, 지지 번호], ...] (년·월·일·시)
  const pack = r => r.pillars.map(p => [p.g, p.z]);
  // 서버에서 받은 값 → calc 결과 모양. 다른 사용자가 보낸 값이라 번호를 검사하고 글자는 여기서 다시 만든다
  function unpack(arr) {
    if (!Array.isArray(arr) || arr.length < 3 || arr.length > 4) throw new Error('사주 데이터 오류');
    return summary(arr.map((gz, i) => {
      const [g, z] = Array.isArray(gz) ? gz : [];
      if (!Number.isInteger(g) || !Number.isInteger(z) || g < 0 || g > 9 || z < 0 || z > 11 || g % 2 !== z % 2) throw new Error('사주 데이터 오류');
      return pillar(GAN[g] + ZHI[z], '년월일시'[i]);
    }));
  }

  const zhiRel = (a, b) =>
    (a + b) % 12 === 1 ? 'hap' : a !== b && a % 4 === b % 4 ? 'samHap' : Math.abs(a - b) === 6 ? 'chung' : WONJIN[a] === b ? 'wonjin' : null;

  function sajuScore(A, B) {
    const out = []; let s = W.base;
    const add = (pts, text) => { s += pts; out.push({ pts, text }); };
    const ga = A.pillars[2].g, gb = B.pillars[2].g, ea = ga >> 1, eb = gb >> 1;
    const name = g => `${GAN_KO[g]}${EL[g >> 1]}`;
    if ((ga - gb + 10) % 10 === 5) add(W.ganHap, `일간 ${name(ga)}·${name(gb)}이 천간합: 서로 끌리는 짝`);
    else if ((ea + 1) % 5 === eb || (eb + 1) % 5 === ea) add(W.ganSaeng, `일간 ${EL[ea]}·${EL[eb]}이 서로 살려 주는 상생 관계`);
    else if (ea === eb) add(W.ganSame, `일간이 같은 ${EL[ea]} 기운: 비슷한 성향`);
    else add(W.ganGeuk, `일간 ${EL[ea]}·${EL[eb]}이 상극: 부딪히기 쉬움`);

    const rel = { hap: '육합', samHap: '삼합', chung: '충', wonjin: '원진' };
    const za = A.pillars[2].z, zb = B.pillars[2].z, dr = zhiRel(za, zb);
    const dayPts = { hap: W.dayHap, samHap: W.daySamHap, chung: W.dayChung, wonjin: W.dayWonjin };
    if (dr) add(dayPts[dr], `배우자 자리(일지) ${ZHI_KO[za]}·${ZHI_KO[zb]} ${rel[dr]}`);
    const ya = A.pillars[0].z, yb = B.pillars[0].z, yr = zhiRel(ya, yb);
    const yearPts = { hap: W.yearHap, samHap: W.yearSamHap, chung: W.yearChung, wonjin: W.yearWonjin };
    if (yr) add(yearPts[yr], `띠 ${ZHI_ANIMAL[ya]}·${ZHI_ANIMAL[yb]} ${rel[yr]}`);

    let fill = 0;
    for (const [P, Q, who] of [[A, B, '상대가 나에게'], [B, A, '내가 상대에게']])
      for (let e = 0; e < 5; e++)
        if (P.count[e] === 0 && Q.count[e] >= 2 && fill < W.fillMax) { fill += W.fill; add(W.fill, `${who} 없는 ${EL[e]} 기운을 채워 줌`); }
    return { score: Math.max(0, Math.min(100, s)), reasons: out };
  }

  // ponytail: 성향 축 단순 규칙. 사용자가 고른 MBTI 궁합표(16×16)가 오면 표로 교체
  function mbtiScore(a, b) {
    if (!/^[EI][NS][TF][JP]$/.test(a) || !/^[EI][NS][TF][JP]$/.test(b)) return null;
    const out = []; let s = 50;
    if (a[1] === b[1]) { s += 20; out.push({ pts: 20, text: `둘 다 ${a[1] === 'N' ? '직관(N)' : '감각(S)'}형: 대화 주파수가 맞음` }); }
    else { s -= 10; out.push({ pts: -10, text: 'N·S가 달라 관심사가 엇갈릴 수 있음' }); }
    if (a[0] !== b[0]) { s += 10; out.push({ pts: 10, text: '외향·내향이 서로 보완' }); }
    if (a[2] !== b[2]) { s += 10; out.push({ pts: 10, text: '사고·감정이 서로 보완' }); }
    if (a[3] !== b[3]) { s += 10; out.push({ pts: 10, text: '계획·즉흥이 서로 보완' }); }
    return { score: s, reasons: out };
  }

  /** 두 사람 {saju: calc() 결과, mbti: 'ENFP'} → 궁합 */
  function match(a, b) {
    const saju = sajuScore(a.saju, b.saju), mbti = mbtiScore(a.mbti, b.mbti);
    const total = Math.round(mbti ? saju.score * W.sajuWeight + mbti.score * (1 - W.sajuWeight) : saju.score);
    return { total, saju, mbti };
  }

  const api = { calc, match, pack, unpack, PLACES, EL, ZHI_EL, W };
  if (typeof module === 'object') module.exports = api; else root.Saju = api;
})(this);
