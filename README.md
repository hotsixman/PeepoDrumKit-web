# TJA Editor Web

[PeepoDrumKit](https://github.com/samyuu/PeepoDrumKit)을 웹(TypeScript + Svelte)으로 포팅한 태고의 달인 TJA 채보 에디터입니다.
데스크톱 브라우저용 UI와 함께 터치 조작이 가능한 모바일 UI를 제공합니다.

> **이 프로젝트는 [samyuu/PeepoDrumKit](https://github.com/samyuu/PeepoDrumKit) (Copyright (c) 2022 Samyuu)를 참고하여 만들어졌습니다.**
> 차트 데이터 구조, TJA 파서/변환기, 타임라인 편집 로직, 실행 취소(undo) 명령, 게임 미리보기, 템포 계산기 등
> UI를 제외한 코어 코드는 원본 C++ 코드를 최대한 그대로 TypeScript로 옮겼으며, 대부분의 함수/변수 이름도 원본과 동일합니다.
> 그래픽 에셋(`public/assets/graphics/*.svg`)은 원본 저장소에서 가져왔습니다. 자세한 내용은 [NOTICE.md](NOTICE.md)를 참고하세요.

*English: A web port of [PeepoDrumKit](https://github.com/samyuu/PeepoDrumKit), a Taiko no Tatsujin TJA chart editor, written in TypeScript + Svelte with an additional touch-friendly mobile UI. All non-UI logic is ported as directly as possible from the original C++ source.*

## 기능

- TJA 열기/저장 (UTF-8, Shift-JIS 자동 감지 · 저장 시 UTF-8 BOM), 드래그 앤 드롭
- 타임라인: 노트 배치(돈/카/큰 노트/연타/풍선), 템포·박자·스크롤 속도·마디선·고고타임·가사 편집
- 선택/박스 선택/범위 선택, 복사·잘라내기·붙여넣기, 이동, 변환(반전, 스케일 등), 실행 취소/다시 실행 (병합 포함)
- 오디오 재생(재생 속도 조절), 파형 표시, 메트로놈, 노트 히트 사운드
- 게임 미리보기(실제 게임 화면과 유사한 스크롤 미리보기)
- 템포 계산기, TJA 내보내기 미리보기 / 임포트 테스트, 단축키 재설정, 영어·일본어·한국어 UI

## 데스크톱 / 모바일

| | 데스크톱 | 모바일 |
|---|---|---|
| 커서 이동 | 클릭 | 탭 |
| 스크롤 | 휠 / 가운데 버튼 드래그 / 스크롤바 | 한 손가락 드래그 (관성 포함) |
| 확대/축소 | Alt + 휠 | 핀치 |
| 박스 선택 | 오른쪽 버튼 드래그 | 길게 누른 후 드래그 / "Select" 모드 |
| 노트 배치 | 키보드 (F/J = 돈, D/K = 카 …) | 하단 Don / Ka / Drumroll / Balloon 버튼 |
| 패널 | 도킹된 탭 패널 | 하단 시트 |

화면 폭에 따라 레이아웃이 자동으로 선택되며, 메뉴의 Window 항목에서 수동으로 전환할 수 있습니다.

## 데모

https://hotsixman.github.io/peepo-web/

## 개발

```sh
npm install
npm run dev      # 개발 서버
npm run build    # dist/ 에 정적 빌드
npm run check    # svelte-check (타입 검사)
npm test         # vitest (TJA 파서 / 라운드트립 테스트)
```

`main` 브랜치에 푸시하면 GitHub Actions(`.github/workflows/deploy.yml`)가 빌드하여 GitHub Pages에 배포합니다.
(저장소 Settings → Pages → Source를 **GitHub Actions**로 설정해야 합니다.)

## 원본과의 차이점

- **UI**: Dear ImGui 대신 Svelte 컴포넌트 + Canvas 2D로 새로 구성했습니다. 타임라인과 게임 미리보기는 원본과 같은 즉시 모드 방식으로 매 프레임 캔버스에 그립니다.
- **오디오**: WASAPI 대신 Web Audio API를 사용합니다. 원본의 효과음 wav 파일은 저장소에 포함되어 있지 않아 효과음을 합성해서 사용하며, 설정에서 사용자 효과음 파일을 지정할 수 있습니다.
- **파일 접근**: 브라우저 보안 정책상 File System Access API(지원 브라우저) 또는 업로드/다운로드 방식으로 파일을 다룹니다. 곡 파일은 TJA와 함께 열거나 폴더 열기로 불러옵니다.
- **성능**: 파형은 줌 레벨별 타일로 오프스크린 캔버스에 캐시하고, 파형 밉맵 생성은 Web Worker에서 수행하며, 미니맵 역시 캐시하여 큰 채보에서도 프레임 저하가 없도록 했습니다.

## 라이선스 / 크레딧

원본 PeepoDrumKit의 저작권은 Samyuu에게 있습니다 (Copyright (c) 2022 Samyuu).
원본 저장소에는 별도의 오픈 소스 라이선스가 명시되어 있지 않으므로, 이 포팅을 재배포하거나 공개하기 전에 원작자의 허락을 확인하시기 바랍니다.
