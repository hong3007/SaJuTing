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
    if (calendar === 'solar' && new Date(Date.UTC(y, m - 1, d)).getUTCDate() !== d) throw new Error(`${y}년 ${m}월에는 ${d}일이 없습니다`);
    if (calendar !== 'solar') {
      const leap = calendar === 'leap' ? '윤' : '';
      try { ({ y, m, d } = (s => ({ y: s.getYear(), m: s.getMonth(), d: s.getDay() }))(Lunar.fromYmd(y, leap ? -m : m, d).getSolar())); }
      catch (e) {                                                      // 라이브러리 오류: 'wrong lunar year …'(그런 달 없음) / 'only N days …'(그런 날 없음)
        const days = /only (\d+) days/.exec(e.message);
        throw new Error(days ? `음력 ${y}년 ${leap}${m}월은 ${days[1]}일까지 있습니다` : leap ? `${y}년에는 윤${m}월이 없습니다` : '없는 음력 날짜입니다');
      }
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

  // ── 연애 사주 풀이: 미리 써 둔 문장을 규칙으로 고른다 (문장은 자유롭게 고쳐도 됨) ──
  const GAN_IMG = ['큰 나무', '풀꽃', '태양', '촛불', '큰 산', '기름진 땅', '바위', '보석', '바다', '이슬비'];
  const GAN_LOVE = [
    '곧게 뻗은 큰 나무 같은 사람이에요. 책임감이 강하고 한번 마음을 주면 오래 가요. 연애에서도 리드하고 지켜 주려 하지만, 자존심 때문에 먼저 굽히는 건 서툴러요.',
    '부드럽게 휘어도 꺾이지 않는 풀꽃 같은 사람이에요. 상대에게 잘 맞춰 주고 다정하지만, 서운함을 속에 쌓아 두기 쉬워요. 기댈 수 있는 든든한 사람 곁에서 가장 빛나요.',
    '모두를 비추는 태양 같은 사람이에요. 밝고 솔직해서 연애도 뜨겁고 적극적이에요. 다만 관심을 충분히 받지 못하면 금방 시들해질 수 있어요.',
    '어둠을 밝히는 촛불 같은 사람이에요. 섬세하고 배려심이 깊어 작은 것까지 챙겨 줘요. 겉은 차분해도 속정이 깊어, 마음을 알아봐 주는 사람에게 약해요.',
    '묵직한 산 같은 사람이에요. 듬직하고 믿음직해서 연인에게 안정감을 줘요. 표현이 적어 무뚝뚝해 보일 수 있으니, 마음을 말로 전하면 연애운이 커져요.',
    '곡식을 키우는 밭 같은 사람이에요. 품이 넓고 현실적으로 잘 챙겨 줘요. 상대를 키워 주는 연애를 하지만, 내 몫을 챙기는 것도 잊지 마세요.',
    '단단한 바위 같은 사람이에요. 의리 있고 좋고 싫음이 분명해요. 연애도 직진형이지만 말이 직설적이라, 한 번 더 다듬어 말하면 오해가 줄어요.',
    '반짝이는 보석 같은 사람이에요. 감각이 예민하고 기준이 높아 아무나 만나지 않아요. 나를 귀하게 대해 주는 사람에게 마음을 열어요.',
    '넓은 바다 같은 사람이에요. 생각이 깊고 자유로워 대화가 잘 통하는 연애를 좋아해요. 구속을 싫어하니 서로의 시간을 존중하는 관계가 잘 맞아요.',
    '촉촉한 이슬비 같은 사람이에요. 감수성이 풍부하고 눈치가 빨라 상대 마음을 잘 읽어요. 상처도 잘 받는 편이라 따뜻하고 한결같은 사람이 잘 맞아요.',
  ];
  const EL_STRONG = [
    '나무 기운이 많아 추진력과 성장 욕구가 커요. 함께 발전하는 연애를 원해요.',
    '불 기운이 많아 열정적이고 표현이 커요. 감정의 오르내림을 다독여 줄 차분한 사람이 좋아요.',
    '흙 기운이 많아 안정과 신뢰를 가장 중요하게 여겨요. 새로운 자극을 주는 사람과 균형이 맞아요.',
    '쇠 기운이 많아 원칙이 분명하고 고집이 있어요. 부드럽게 풀어 주는 사람이 곁에 있으면 좋아요.',
    '물 기운이 많아 생각과 감정이 깊어요. 걱정을 덜어 주고 현실로 이끌어 줄 사람이 잘 맞아요.',
  ];
  const EL_LACK = [
    '나무 기운이 없어 먼저 시작하는 힘이 약할 수 있어요. 먼저 다가와 주는 적극적인 사람이 연애를 열어 줘요.',
    '불 기운이 없어 감정 표현이 서툴 수 있어요. 밝고 표현을 잘하는 사람이 마음을 데워 줘요.',
    '흙 기운이 없어 마음이 쉽게 흔들릴 수 있어요. 듬직하고 한결같은 사람이 중심을 잡아 줘요.',
    '쇠 기운이 없어 결정을 미루기 쉬워요. 맺고 끊음이 분명한 사람이 관계를 단단하게 해 줘요.',
    '물 기운이 없어 마음의 여유가 부족할 수 있어요. 차분하고 생각이 깊은 사람이 쉼표가 되어 줘요.',
  ];
  const SPOUSE = [                                                     // 일지(배우자 자리) → 연인에게 바라는 모습
    '지혜롭고 대화가 잘 통하는', '성실하고 묵묵히 곁을 지키는', '꿈이 크고 활동적인', '다정하고 감성이 맞는',
    '능력 있고 큰 그림을 함께 그릴', '센스 있고 열정적인', '밝고 솔직해서 함께 있으면 즐거운', '따뜻하고 가정적인',
    '재치 있고 일 처리가 시원시원한', '깔끔하고 자기관리가 확실한', '의리 있고 믿음직한', '마음이 넓고 자유로운',
  ];
  const EL_NAME = ['목(나무)', '화(불)', '토(흙)', '금(쇠)', '수(물)'];
  const ganName = g => `${GAN_KO[g]}${EL[g >> 1]}(${GAN_IMG[g]})`;

  /** 연애 사주 풀이. r = calc() 또는 unpack() 결과 */
  function reading(r) {
    const g = r.pillars[2].g, z = r.pillars[2].z, e = g >> 1;
    const max = Math.max(...r.count), lack = r.count.flatMap((n, i) => n ? [] : [i]);
    const strong = max >= 3 ? r.count.indexOf(max) : -1;
    return {
      type: `${GAN_KO[g]}${EL[e]} · ${GAN_IMG[g]}`,
      me: GAN_LOVE[g],
      style: [
        ...(strong >= 0 ? [EL_STRONG[strong]] : []),
        ...lack.map(i => EL_LACK[i]),
        `배우자 자리는 ${ZHI_KO[z]}(${ZHI_ANIMAL[z]}). ${SPOUSE[z]} 연인을 바라요.`,
      ],
      meet: [
        `${ganName((g + 5) % 10)} 일간인 사람: 처음부터 서로 끌리는 천간합 짝이에요.`,
        `${EL_NAME[(e + 4) % 5]} 기운이 강한 사람: 나를 품고 힘을 채워 줘요.`,
        ...lack.map(i => `${EL_NAME[i]} 기운이 많은 사람: 내게 없는 부분을 채워 줘요.`),
        `${SPOUSE[z]} 사람에게 마음이 열려요.`,
      ],
      avoid: `${EL_NAME[(e + 3) % 5]} 기운이 아주 강한 사람과는 부딪히기 쉬우니, 서로 한 박자 쉬어 가세요.`,
    };
  }

  /** 두 사람 {saju: calc() 결과, mbti: 'ENFP'} → 궁합 */
  function match(a, b) {
    const saju = sajuScore(a.saju, b.saju), mbti = mbtiScore(a.mbti, b.mbti);
    const total = Math.round(mbti ? saju.score * W.sajuWeight + mbti.score * (1 - W.sajuWeight) : saju.score);
    return { total, saju, mbti };
  }

  const api = { calc, match, reading, pack, unpack, PLACES, EL, ZHI_EL, W };
  if (typeof module === 'object') module.exports = api; else root.Saju = api;
})(this);
