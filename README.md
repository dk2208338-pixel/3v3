# 3v3

세로 화면 3:3 오토배틀 방치형 RPG입니다. 영웅을 소환하고, 3명을 골라 스테이지를 깨고, 레벨과 장비로 키웁니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버 (브라우저에서 휴대폰 크기로 보기)
npm run build    # dist/ 에 배포용 빌드
```

개발 중에는 처음 시작할 때 루비 100,000개를 줍니다 (`src/game/state.ts`의 `DEV_RUBY`).
스테이지 화면 맨 아래 "개발용: 저장 데이터 초기화"로 처음부터 다시 할 수 있습니다.

## 캐릭터 이름 바꾸기

`data/characters.csv` 한 파일만 고치면 됩니다. 엑셀이나 구글 시트에서 열고 저장할 때 CSV(UTF-8)로 저장하세요.

| 열 | 뜻 | 값 |
|---|---|---|
| `id` | 시트 파일 이름 (바꾸지 마세요) | `c01` → `assets/sheets/c01.webp` |
| `name` | 이름 | 자유 |
| `ult_name` | 궁극기 이름 | 자유 |
| `rarity` | 등급 | `R`(일반), `SR`(희귀), `SSR`(전설) |
| `element` | 속성 | `물` `번개` `바람` `음파` `불` `무속` (색이 정해져 있음) |
| `role` | 역할 | `탱커` `전사` `원거리` |

## 캐릭터 추가하기

1. 시트 이미지를 `assets/sheets/c07.webp`처럼 넣습니다.
2. `tools/sheet_layouts.json`의 `sheets`에 한 줄 추가합니다.
   - 초상화 3장이 맨 위 가운데 줄에 따로 있는 시트: `"c07": { "layout": "standard" }`
   - 초상화가 첫 줄 대기 동작 오른쪽에 붙어 있는 시트: `"c07": { "layout": "wide" }`
   - 프레임 하나만 위치가 다르면 `"frames": { "proj": [x0, y0, x1, y1] }`로 덮어씁니다.
   - 궁극기 그림 속 캐릭터가 더 크게 그려졌으면 `"sc": { "ring": 0.8 }`로 줄입니다.
3. `data/characters.csv`에 한 줄 추가합니다.
4. 스프라이트를 다시 만듭니다.

```bash
pip install pillow numpy scipy
npm run sprites            # 전체
python3 tools/build_sprites.py c07   # 하나만
```

`public/sprites/<id>.png/.json`(전투용 묶음 이미지)와 `public/portraits/<id>.png`(초상화)가 만들어집니다.
변환기는 시트에 그려진 체크무늬 배경을 지우지만, 반투명 이펙트 안쪽에 비친 체크무늬는 지우지 못합니다.
새로 생성하는 시트는 단색 배경(예: `#FF00FF`)으로 받으면 더 깨끗합니다.

## 구조

| 경로 | 내용 |
|---|---|
| `src/game/battle.ts` | 오토배틀 시뮬레이션과 캔버스 그리기 |
| `src/game/progression.ts` | 스탯, 레벨업 비용, 장비, 스테이지 난이도, 보상 수치 |
| `src/game/gacha.ts` | 소환 확률, 천장, 중복 보상 |
| `src/game/state.ts` | 저장 데이터 (브라우저 localStorage) |
| `src/ui/*` | 화면: 스테이지, 팀 편성, 전투, 영웅, 소환 |
| `tools/build_sprites.py` | 시트 → 게임용 스프라이트 변환 |
