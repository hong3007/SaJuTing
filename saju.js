/* SaJuTing 궁합 엔진: 생년월일시 → 사주 8글자 → 두 사람 궁합 점수 (사주 + MBTI)
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
    if ((ga - gb + 10) % 10 === 5) add(W.ganHap, `천간합(${name(ga)}·${name(gb)}) → 첫눈에 끌리는 짝임`);
    else if ((ea + 1) % 5 === eb || (eb + 1) % 5 === ea) add(W.ganSaeng, `일간 ${EL[ea]}·${EL[eb]} 상생 → 서로 살려 주는 사이임`);
    else if (ea === eb) add(W.ganSame, `둘 다 ${EL[ea]} 일간 → 성향 비슷해서 편함`);
    else add(W.ganGeuk, `일간 ${EL[ea]}·${EL[eb]} 상극 → 부딪히기 쉬움 주의`);

    const rel = { hap: '육합', samHap: '삼합', chung: '충', wonjin: '원진' };
    const feel = { hap: '찰떡 궁합임', samHap: '잘 통하는 사이임', chung: '충돌 주의', wonjin: '사소한 오해 주의' };
    const za = A.pillars[2].z, zb = B.pillars[2].z, dr = zhiRel(za, zb);
    const dayPts = { hap: W.dayHap, samHap: W.daySamHap, chung: W.dayChung, wonjin: W.dayWonjin };
    if (dr) add(dayPts[dr], `배우자 자리 ${rel[dr]}(${ZHI_KO[za]}·${ZHI_KO[zb]}) → ${feel[dr]}`);
    const ya = A.pillars[0].z, yb = B.pillars[0].z, yr = zhiRel(ya, yb);
    const yearPts = { hap: W.yearHap, samHap: W.yearSamHap, chung: W.yearChung, wonjin: W.yearWonjin };
    if (yr) add(yearPts[yr], `띠 ${rel[yr]}(${ZHI_ANIMAL[ya]}·${ZHI_ANIMAL[yb]}) → ${feel[yr]}`);

    let fill = 0;
    for (const [P, Q, who] of [[A, B, '상대가 나한테'], [B, A, '내가 상대한테']])
      for (let e = 0; e < 5; e++)
        if (P.count[e] === 0 && Q.count[e] >= 2 && fill < W.fillMax) { fill += W.fill; add(W.fill, `${who} 없는 ${EL[e]} 기운 채워 줌`); }
    return { score: Math.max(0, Math.min(100, s)), reasons: out };
  }

  // ponytail: 성향 축 단순 규칙. 사용자가 고른 MBTI 궁합표(16×16)가 오면 표로 교체
  function mbtiScore(a, b) {
    if (!/^[EI][NS][TF][JP]$/.test(a) || !/^[EI][NS][TF][JP]$/.test(b)) return null;
    const out = []; let s = 50;
    if (a[1] === b[1]) { s += 20; out.push({ pts: 20, text: `둘 다 ${a[1] === 'N' ? 'N(직관)' : 'S(감각)'} → 대화 주파수 맞음` }); }
    else { s -= 10; out.push({ pts: -10, text: 'N·S 달라서 관심사 엇갈릴 수 있음' }); }
    if (a[0] !== b[0]) { s += 10; out.push({ pts: 10, text: 'E·I 보완 → 밸런스 굿' }); }
    if (a[2] !== b[2]) { s += 10; out.push({ pts: 10, text: 'T·F 보완 → 서로 부족한 거 채워 줌' }); }
    if (a[3] !== b[3]) { s += 10; out.push({ pts: 10, text: 'J·P 보완 → 계획파·즉흥파 케미' }); }
    return { score: s, reasons: out };
  }

  // ── 연애 사주 풀이: 미리 써 둔 문장을 규칙으로 고른다 (말투: 여초 커뮤 음슴체. 문장은 자유롭게 고쳐도 됨) ──
  const GAN_IMG = ['큰 나무', '풀꽃', '태양', '촛불', '큰 산', '기름진 땅', '바위', '보석', '바다', '이슬비'];
  const GAN_LOVE = [                                                   // 일간 10: 기본 성향
    '곧게 뻗은 큰 나무 st. 책임감 강하고 한번 마음 주면 오래 감. 리드하고 지켜 주려는 편인데 자존심 때문에 먼저 굽히는 건 ㄹㅇ 못함ㅋㅋ',
    '휘어도 안 꺾이는 풀꽃 st. 상대한테 잘 맞춰 주고 다정한데, 서운한 건 속에 차곡차곡 쌓아 두는 편ㅠ 기댈 수 있는 든든한 사람 옆에서 제일 빛남',
    '모두를 비추는 태양 st. 밝고 솔직해서 연애도 뜨겁고 적극적임. 근데 관심 덜 받으면 금방 시들해지는 거 본인도 앎',
    '어둠 밝히는 촛불 st. 섬세하고 배려 깊어서 작은 것까지 다 챙김. 겉은 차분한데 속정 개깊음. 마음 알아봐 주는 사람한테 약함',
    '묵직한 산 st. 듬직해서 옆에 있으면 안정감 미쳤음. 근데 표현이 적어서 무뚝뚝하다는 오해 자주 받음. 말로 좀 해 주면 연애운 떡상함',
    '곡식 키우는 밭 st. 품 넓고 현실적으로 잘 챙겨 줌. 상대 키워 주는 연애 하는데 내 몫 챙기는 것도 잊지 말기',
    '단단한 바위 st. 의리 있고 호불호 확실함. 연애도 직진인데 말이 좀 직설적이라 한 번만 돌려 말하면 오해 확 줄어듦',
    '반짝이는 보석 st. 감각 예민하고 기준 높아서 아무나 안 만남. 나 귀하게 대해 주는 사람한테만 마음 엶',
    '넓은 바다 st. 생각 깊고 자유로워서 대화 잘 통하는 연애 좋아함. 구속 싫어해서 서로 시간 존중해 주는 관계가 찰떡임',
    '촉촉한 이슬비 st. 감수성 풍부하고 눈치 빨라서 상대 마음 잘 읽음. 상처도 잘 받는 편이라 따뜻하고 한결같은 사람이 찰떡',
  ];
  // 일주 60 (일간 + 일지, 60갑자 순서): [별명, 이모지, 일주 TMI]
  const ILJU = [
    ['생각 많은 새벽 감성러', '🌙', '머리 좋고 생각 깊음. 연애할 때도 혼자 시뮬 백 번 돌리고 나서야 움직이는 타입ㅋㅋ'],               // 갑자
    ['알뜰살뜰 현실 연애 고수', '🐮', '겉은 순한데 속은 단단함. 한번 내 사람이면 끝까지 챙기는 찐 의리파'],                          // 을축
    ['햇살 가득 인간 비타민', '☀️', '어딜 가나 분위기 메이커. 좋아하면 티 다 나서 주변에서 먼저 눈치챔ㅋㅋ'],                         // 병인
    ['감성 충만 새벽 플리 장인', '🎧', '섬세하고 감수성 미쳤음. 노래 한 곡에 썸 서사 다 써 버리는 편'],                               // 정묘
    ['스케일 큰 야망 직진러', '🐉', '꿈도 크고 고집도 큼. 연애도 대충은 안 하고 할 거면 제대로 함'],                                 // 무진
    ['눈치 빠른 계산 천재', '🐍', '똑똑하고 실속 챙길 줄 앎. 상대가 진심인지 3초 만에 간파함'],                                     // 기사
    ['반듯한 원칙주의 모범생', '🐴', '책임감 끝판왕. 약속 안 지키는 사람 제일 싫어하고 연애도 FM으로 함'],                            // 경오
    ['조용한 다정 헌신러', '🐑', '말없이 다 챙겨 주는 스타일. 근데 서운한 거 쌓아 두다가 한 번에 터짐ㅠ'],                            // 신미
    ['다재다능 만능 엔터테이너', '🐒', '재주 많고 머리 회전 빠름. 대화 티키타카 안 되면 바로 식는 편'],                               // 임신
    ['깔끔 지적 감성 요정', '🐓', '섬세하고 깔끔함. 센스 없는 사람은 티 안 나게 은근 거름'],                                          // 계유
    ['고집 있는 현실파 리더', '🐶', '한번 정하면 안 바꿈. 내 사람한테는 무한 신뢰 주는 스타일'],                                      // 갑술
    ['순수 다정 감성러', '🐷', '마음 여리고 다정함. 상대 기분 하나에 하루 텐션이 왔다 갔다 함ㅠㅠ'],                                   // 을해
    ['밝은데 속 깊은 반전캐', '🐭', '겉은 해맑은데 혼자 있을 땐 생각 많음. 그 갭에 반하는 사람 은근 많음'],                           // 병자
    ['조용히 버티는 끈기 장인', '🕯️', '티 안 내고 묵묵히 사랑하는 타입. 쉽게 안 변해서 오래 가는 연애 함'],                            // 정축
    ['카리스마 도전 대장', '⛰️', '새로운 거 도전하는 거 좋아함. 연애도 밀당보다 정면 돌파파'],                                        // 무인
    ['예민 섬세 자기관리 퀸', '🐰', '감각 예민하고 자기관리 철저함. 상대 말투 0.1도 바뀐 것도 다 캐치함'],                            // 기묘
    ['존재감 미친 카리스마 보스', '🐲', '기 세고 존재감 큼. 근데 내 편한테는 세상 든든한 방패 됨'],                                   // 경진
    ['분위기 있는 인기 독점러', '💎', '분위기 있고 매력 있어서 은근 인기 많음. 본인만 모르는 경우 많음ㅋㅋ'],                          // 신사
    ['정 많은 다정 부자', '🌊', '마음 넓고 정 많음. 연인한테 아낌없이 쓰는 스타일'],                                                 // 임오
    ['따뜻한 희생 천사', '💧', '상대 먼저 챙기다 나를 잊는 타입. 나 챙겨 주는 사람 만나야 함 진짜로'],                                // 계미
    ['압박 속 성장캐', '🌳', '힘든 상황에서 더 강해짐. 연애도 고비 넘기면서 단단해지는 편'],                                         // 갑신
    ['날카로운 감각파 깔끔러', '🌿', '취향 확실하고 보는 눈 날카로움. 아닌 건 아니라고 칼같이 말함'],                                 // 을유
    ['의리파 노을 감성 로맨티스트', '🌅', '정 많고 의리 있음. 노을만 봐도 감성 터지는 로맨티스트 기질 있음'],                          // 병술
    ['반듯한 귀인 끌어당김캐', '🍀', '예의 바르고 반듯해서 어른들이 좋아하는 상. 은근 주변에 도와주는 사람 많음'],                     // 정해
    ['현실 감각 갑 다정 실속러', '🪙', '돈 감각 좋고 현실적인데 연인한테는 은근 다정함. 데이트 가성비 장인'],                          // 무자
    ['묵묵한 성실 끝판왕', '🐂', '말없이 꾸준함. 화려하진 않아도 제일 오래 곁에 남는 사람임'],                                        // 기축
    ['추진력 미친 승부사', '🐯', '하고 싶은 건 바로 실행함. 좋아하는 사람 생기면 작전 짜서 바로 들이댐ㅋㅋ'],                          // 경인
    ['예리한 감각 예민 보스', '🐇', '감각 날카롭고 예민함. 거슬리는 거 하나 있으면 신경 쓰여서 잠 못 잠'],                            // 신묘
    ['포부 큰 카리스마 용', '🐉', '꿈 크고 기 셈. 평범한 연애보다 서로 성장하는 연애 원함'],                                         // 임진
    ['계산 빠른 매력 요물', '🐍', '머리 회전 빠르고 매력 있음. 밀당 고수 소리 듣는 편ㅋㅋ'],                                         // 계사
    ['말발 좋은 열정 표현러', '🎤', '표현력 좋고 말 잘함. 좋아하면 플러팅 멘트 술술 나옴ㅋㅋ'],                                       // 갑오
    ['인내심 만렙 현실 다정러', '🌱', '참을성 좋고 현실 감각 있음. 오래 볼수록 진가 나오는 스타일'],                                   // 을미
    ['재주 많은 핵인싸 활동가', '🎉', '사교성 갑이고 재주 많음. 친구 많아서 애인이 은근 질투함'],                                     // 병신
    ['귀티 나는 인기캐', '✨', '깔끔하고 귀티 남. 은근 이성한테 인기 많은 편'],                                                       // 정유
    ['우직한 순정파 신념러', '🗻', '믿는 건 끝까지 믿음. 연애도 한 사람만 오래 보는 순정파'],                                         // 무술
    ['인복 터진 온화 힐러', '🌾', '성격 둥글고 사람 복 많음. 같이 있으면 마음 편해진다는 말 자주 들음'],                              // 기해
    ['겉차속따 냉철 지성파', '🧊', '겉은 차갑고 냉철한데 속은 여림. 마음 열기까지 시간 좀 걸림'],                                     // 경자
    ['속 단단한 원석', '🪨', '조용한데 내면 강함. 쉽게 안 흔들리고 한결같은 연애 함'],                                               // 신축
    ['아이디어 뱅크 자유러', '🗺️', '생각 많고 활동적임. 데이트 코스 짜는 거 진심인 편'],                                             // 임인
    ['순수 감성 다정 요정', '🌸', '마음 맑고 다정함. 사소한 거에 감동받고 고마워할 줄 앎'],                                           // 계묘
    ['큰 그릇 복 많은 리더', '🏯', '그릇 크고 복 있는 편. 연인한테도 든든한 울타리 돼 줌'],                                           // 갑진
    ['화술 천재 매력 부자', '💬', '말 잘하고 재주 많음. 썸 탈 때 대화로 상대 홀리는 타입ㅋㅋ'],                                       // 을사
    ['불꽃 그 자체 열정캐', '🔥', '에너지 미쳤음. 좋고 싫음 확실하고 연애도 화끈하게 함'],                                             // 병오
    ['정 많은 따뜻 헌신러', '🕯️', '마음 따뜻하고 정 많음. 연인 생일은 무조건 이벤트 각'],                                             // 정미
    ['실속파 만능 재주꾼', '🛠️', '재주 많고 실속 있음. 말보다 행동으로 사랑 보여 줌'],                                               // 무신
    ['센스 만점 말 예쁜 사람', '🎀', '센스 있고 말 예쁘게 함. 소소한 선물로 감동 주는 거 잘함'],                                       // 기유
    ['의리 끝판왕 든든 보스', '⚔️', '기 세고 의리 있음. 내 사람 건드리면 가만 안 있음ㅋㅋ'],                                           // 경술
    ['총명한 예술 감성러', '🎨', '머리 좋고 예술 감각 있음. 말 한마디도 예쁘게 하는 편'],                                             // 신해
    ['속 깊은 바다 자존심', '🌊', '속이 깊어서 진짜 속마음은 잘 안 보여 줌. 알면 알수록 빠져드는 타입'],                              // 임자
    ['신중 끝판왕 장기 연애형', '🐢', '신중해서 시작은 느린데 한번 시작하면 오래 감. 찐 장기 연애형'],                                 // 계축
    ['독립심 강한 직진 대장', '🐅', '자기 주관 뚜렷하고 독립심 강함. 연애도 내가 리드해야 직성이 풀림'],                              // 갑인
    ['자기 세계 확실한 예술가', '🌷', '취향 확고하고 자기 세계 있음. 내 세계 존중해 주는 사람한테 마음 엶'],                           // 을묘
    ['여유만만 유머 장인', '😎', '베풀기 좋아하고 웃기는 거 진심임. 같이 있으면 시간 순삭'],                                         // 병진
    ['승부욕 활활 열정러', '🔥', '좋아하면 불타오름. 근데 자존심 건드리면 바로 식음 주의'],                                           // 정사
    ['자존심 센 뜨거운 직진러', '🐎', '열정 넘치고 한번 꽂히면 직진. 지는 거 진짜 싫어함ㅋㅋ'],                                       // 무오
    ['고집 있는 마이웨이', '🌵', '혼자서도 잘 사는 독립파. 연애해도 내 시간 꼭 지켜야 함'],                                           // 기미
    ['강철 멘탈 독고다이', '🗡️', '멘탈 갑에 독립심 강함. 쉽게 안 기대지만 한번 기대면 찐임'],                                         // 경신
    ['완벽주의 미적 감각 장인', '💍', '기준 높고 미적 감각 미쳤음. 대충 하는 연애는 1도 관심 없음'],                                   // 신유
    ['강단 있는 의리 고집쟁이', '🐕', '한번 마음먹으면 끝까지 감. 의리 하나는 진짜 레전드'],                                           // 임술
    ['촉 미친 감수성 끝판왕', '🌧️', '촉이 미쳤음. 연애 시작 전부터 이 사람 각인지 아닌지 이미 앎'],                                   // 계해
  ];
  const iljuIndex = (g, z) => ((6 * g - 5 * z) % 60 + 60) % 60;      // 60갑자 순번: 천간 g, 지지 z
  const EL_STRONG = [
    '나무 기운 많음 → 추진력이랑 성장 욕구 큼. 같이 성장하는 연애 원함',
    '불 기운 많음 → 열정 넘치고 표현 큼. 감정 롤러코스터 잡아 줄 차분한 사람 필요함',
    '흙 기운 많음 → 안정이랑 신뢰가 제일 중요함. 새로운 자극 주는 사람이랑 밸런스 맞음',
    '쇠 기운 많음 → 원칙 확실하고 고집 있음. 말랑하게 풀어 주는 사람이 옆에 있어야 함',
    '물 기운 많음 → 생각이랑 감정이 깊음. 걱정 덜어 주고 현실로 끌어 줄 사람이 찰떡',
  ];
  const EL_LACK = [
    '나무 기운 0 → 먼저 시작하는 힘이 약함. 먼저 다가와 주는 적극적인 사람이 연애 문 열어 줌',
    '불 기운 0 → 감정 표현 서툼. 밝고 표현 잘하는 사람이 마음 녹여 줌',
    '흙 기운 0 → 마음이 잘 흔들림. 듬직하고 한결같은 사람이 중심 잡아 줌',
    '쇠 기운 0 → 결정 장애 살짝 있음ㅋㅋ 맺고 끊음 확실한 사람이 관계 단단하게 해 줌',
    '물 기운 0 → 마음의 여유가 부족할 때 있음. 차분하고 생각 깊은 사람이 쉼표 돼 줌',
  ];
  const SPOUSE = [                                                     // 일지(배우자 자리) → 연인에게 바라는 모습
    '지혜롭고 대화 잘 통하는', '성실하고 묵묵히 곁 지키는', '꿈 크고 활동적인', '다정하고 감성 맞는',
    '능력 있고 큰 그림 같이 그릴', '센스 있고 열정적인', '밝고 솔직해서 같이 있으면 재밌는', '따뜻하고 가정적인',
    '재치 있고 일 처리 시원시원한', '깔끔하고 자기관리 확실한', '의리 있고 믿음직한', '마음 넓고 자유로운',
  ];
  const EL_NAME = ['목(나무)', '화(불)', '토(흙)', '금(쇠)', '수(물)'];
  const ganName = g => `${GAN_KO[g]}${EL[g >> 1]}(${GAN_IMG[g]})`;

  // 별명 (MZ 말투): 타고난 일주 60가지로 정하고, 올해 연애운 별점에 따라 앞말이 바뀐다
  const NICK_MOOD = ['', '충전 중인', '숨 고르는', '', '물 오른', '폼 미친'];  // 별점 1~5
  /** 별명. yearStars = 올해 연애운 별점(없으면 앞말 없음) */
  function nickname(r, yearStars) {
    const [name, emoji] = ILJU[iljuIndex(r.pillars[2].g, r.pillars[2].z)], mood = NICK_MOOD[yearStars] || '';
    return { text: (mood ? mood + ' ' : '') + name, emoji };
  }

  /** 연애 사주 풀이. r = calc() 또는 unpack() 결과 */
  function reading(r) {
    const g = r.pillars[2].g, z = r.pillars[2].z, e = g >> 1;
    const max = Math.max(...r.count), lack = r.count.flatMap((n, i) => n ? [] : [i]);
    const strong = max >= 3 ? r.count.indexOf(max) : -1;
    return {
      type: `${GAN_KO[g]}${ZHI_KO[z]}일주 · ${GAN_IMG[g]}`,
      me: GAN_LOVE[g],
      tmi: ILJU[iljuIndex(g, z)][2],
      style: [
        ...(strong >= 0 ? [EL_STRONG[strong]] : []),
        ...lack.map(i => EL_LACK[i]),
        `배우자 자리는 ${ZHI_KO[z]}(${ZHI_ANIMAL[z]}) → ${SPOUSE[z]} 연인 원함`,
      ],
      meet: [
        `${ganName((g + 5) % 10)} 일간인 사람 → 첫눈에 서로 끌리는 천간합 짝임`,
        `${EL_NAME[(e + 4) % 5]} 기운 강한 사람 → 나 품어 주고 힘 채워 줌`,
        ...lack.map(i => `${EL_NAME[i]} 기운 많은 사람 → 나한테 없는 거 채워 줌`),
        `${SPOUSE[z]} 사람한테 마음 열림`,
      ],
      avoid: `${EL_NAME[(e + 3) % 5]} 기운 너무 센 사람이랑은 부딪히기 쉬움. 한 박자 쉬어 가기`,
    };
  }

  // ── 시기별 연애운: 올해(세운)·이번 달(월운)·오늘(일진) 간지가 내 사주에 주는 영향 ──
  /** 지금 시점의 간지. 년·월은 절기 기준, 일은 한국 날짜 기준 */
  function periods(date = new Date()) {
    const ym = solarAt(date.getTime() + 8 * 3600e3).getLunar().getEightChar();
    const kst = new Date(date.getTime() + 9 * 3600e3);
    const d = Solar.fromYmd(kst.getUTCFullYear(), kst.getUTCMonth() + 1, kst.getUTCDate()).getLunar().getEightChar();
    return {
      year: { ...pillar(ym.getYear(), '년'), name: `${kst.getUTCFullYear()}년` },
      month: { ...pillar(ym.getMonth(), '월'), name: `${kst.getUTCMonth() + 1}월` },
      day: { ...pillar(d.getDay(), '일'), name: '오늘' },
    };
  }
  // 십신: 그 시기 천간이 내 일간에 주는 기운 10가지 [문장, 별점 가감]. 순서 = (오행 관계 × 2) + (음양이 다르면 1)
  const THEME = [
    ['나랑 닮은 사람한테 끌리는 시기임. 친구 같은 편한 인연 생기기 쉬움', 0],                          // 비견
    ['경쟁자 등장 주의보 뜸. 맘에 드는 사람 있으면 망설이지 말고 먼저 가기', -0.5],                     // 겁재
    ['여유 생기고 매력 자연스럽게 흘러넘치는 시기임. 편하게 웃는 모습에 상대가 넘어옴', 0.5],          // 식신
    ['표현력 폭발하는 시기임. 고백각인데 말 날카로워지지 않게만 조심', 0.5],                            // 상관
    ['새로운 만남 우르르 들어오는 시기임. 모임이나 소개팅 나가면 뜻밖의 인연 만날 각', 1],              // 편재
    ['안정적인 인연 들어오는 시기임. 차근차근 믿음 쌓는 만남이 잘 풀림', 0.5],                         // 정재
    ['강렬한 끌림 찾아오는 시기임. 설렘 큰 만큼 상대는 천천히 알아 가기', 0.5],                         // 편관
    ['진지한 인연 찾아오는 시기임. 가벼운 만남보다 오래 갈 관계 고민하게 됨', 1],                       // 정관
    ['혼자만의 시간 필요한 시기임. 서두르지 말고 내 마음부터 들여다보기', -0.5],                        // 편인
    ['사랑받는 시기임. 나 아껴 주는 사람 알아보는 눈 생김', 0],                                        // 정인
  ];
  const BRANCH = {
    hap: ['배우자 자리랑 합 들어옴 → 인연 맺어지기 딱 좋음', 1],
    samHap: ['지인 소개나 모임에서 인연 이어지기 쉬움', 0.5],
    chung: ['배우자 자리 흔들림 → 관계에 변화 생기기 쉬움. 큰 결정은 한 번 더 생각하기', -1],
    wonjin: ['사소한 말이 오해로 번지기 쉬움. 서운한 건 그때그때 말로 풀기', -0.5],
  };
  const PEACH = [9, 6, 3, 0];                                          // 도화: 申子辰→酉, 巳酉丑→午, 寅午戌→卯, 亥卯未→子 (지지 번호 % 4로 묶음)
  const PREFIX = { year: '올해는', month: '이번 달은', day: '오늘은' };

  /** 한 시기의 연애운. r = 내 사주, p = periods()의 year/month/day, scope = 'year'|'month'|'day' */
  function fortune(r, p, scope) {
    const e = r.pillars[2].g >> 1, dz = r.pillars[2].z, yz = r.pillars[0].z;
    const theme = (((p.g >> 1) - e + 5) % 5) * 2 + ((p.g + r.pillars[2].g) % 2);
    const lines = [`${PREFIX[scope]} ${THEME[theme][0]}`];
    let s = 3 + THEME[theme][1];
    const rel = p.z === dz ? null : zhiRel(dz, p.z);
    if (rel) { lines.push(BRANCH[rel][0]); s += BRANCH[rel][1]; }
    if (p.z === PEACH[dz % 4] || p.z === PEACH[yz % 4]) { lines.push('도화 들어옴 → 이성 눈에 확 띄고 인기 떡상함🌸'); s += 1; }
    const stars = Math.max(1, Math.min(5, Math.round(s)));
    return { title: `${p.name} ${p.ko}${p.label}`, stars, lines };
  }

  /** 두 사람 {saju: calc() 결과, mbti: 'ENFP'} → 궁합 */
  function match(a, b) {
    const saju = sajuScore(a.saju, b.saju), mbti = mbtiScore(a.mbti, b.mbti);
    const total = Math.round(mbti ? saju.score * W.sajuWeight + mbti.score * (1 - W.sajuWeight) : saju.score);
    return { total, saju, mbti };
  }

  const api = { calc, match, reading, nickname, periods, fortune, pack, unpack, PLACES, EL, ZHI_EL, W };
  if (typeof module === 'object') module.exports = api; else root.Saju = api;
})(this);
