<h1 align="center">
  <img src="../electron/app.ico" alt="VRChat Event Creator" width="96" height="96" align="middle" />&nbsp;VRChat Event Creator
</h1>
<p align="center">
  <a href="https://github.com/Cynacedia/VRC-Event-Creator/releases">
    <img src="https://img.shields.io/github/downloads/Cynacedia/VRC-Event-Creator/total?style=plastic&labelColor=555&color=blue" alt="Downloads" />
  </a>
</p>
<p align="center">
  <a href="../README.md">English</a> |
  <a href="README.fr.md">Français</a> |
  <a href="README.es.md">Español</a> |
  <a href="README.de.md">Deutsch</a> |
  <a href="README.ja.md">日本語</a> |
  <a href="README.zh.md">中文（简体）</a> |
  <a href="README.pt.md">Português</a> |
  <a href="README.ko.md">한국어</a> |
  <a href="README.ru.md">Русский</a>
</p>
반복적인 설정을 줄여주는 VRChat용 올인원 이벤트 생성 도구입니다.
그룹별 이벤트 템플릿을 만들고 저장하며, 간단한 반복 패턴에서 다가오는 날짜를 생성해 세부 정보를 즉시 자동으로 채워 줍니다 - 주간 모임, 시청 파티, 커뮤니티 이벤트를 빠르게 일정 잡기에 적합합니다.

## 스크린샷
<table>
  <tr>
    <td align="center">
      <img src=".imgs/1MP-Basics-Screenshot%202026-01-02%20230956.png" width="300" alt="프로필: 템플릿" />
      <br />
      프로필: 템플릿
    </td>
    <td align="center">
      <img src=".imgs/2MP-Schedule-Screenshot%202026-01-02%20231523.png" width="300" alt="프로필: 일정 규칙" />
      <br />
      프로필: 일정 규칙
    </td>
    <td align="center">
      <img src=".imgs/3CE-ProfileSelect-Screenshot%202026-01-02%20231634.png" width="300" alt="생성: 프로필 선택" />
      <br />
      생성: 프로필 선택
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src=".imgs/4CE-DateSelect-Screenshot%202026-01-02%20231805.png" width="300" alt="생성: 날짜 선택" />
      <br />
      생성: 날짜 선택
    </td>
    <td align="center">
      <img src=".imgs/5CE-Review-Screenshot%202026-01-02%20231907.png" width="300" alt="생성: 검토 후 제출" />
      <br />
      생성: 검토 후 제출
    </td>
    <td align="center">
      <img src=".imgs/6S-ThemeStudio-Screenshot%202026-01-02%20232221.png" width="300" alt="테마 스튜디오: 사용자 UI" />
      <br />
      테마 스튜디오: 사용자 UI
    </td>
  </tr>
</table>

## 다운로드
- GitHub Releases: https://github.com/Cynacedia/VRC-Event-Creator/releases
- Windows용 포터블 `.exe`는 단독 실행됩니다(실행에 Node.js 불필요).
- 앱 데이터는 표준 Electron 사용자 데이터 디렉터리에 저장됩니다(설정 > 애플리케이션 정보에서 확인). `VRC_EVENT_DATA_DIR`로 변경 가능합니다.

## 기능
- 그룹별 이벤트 상세를 자동으로 채우는 프로필/템플릿.
- 반복 패턴 생성기(다가오는 날짜 목록 + 수동 날짜/시간 입력).
- 그룹 캘린더 이벤트 생성 마법사.
- 예정 이벤트용 수정 보기(그리드 + 편집 모달).
- 프리셋이 포함된 테마 스튜디오와 전체 UI 색상 제어(#RRGGBBAA 지원).
- 이미지 ID용 갤러리 선택 및 업로드.
- 첫 실행 언어 선택이 있는 현지화(en, fr, es, de, ja, zh, pt, ko, ru).

## 데이터 저장
앱 파일은 Electron 사용자 데이터 디렉터리에 저장됩니다(설정 > 애플리케이션 정보에서 확인):

- `profiles.json` (프로필 템플릿)
- `cache.json` (세션 토큰)
- `settings.json` (연락처 이메일)
- `themes.json` (테마 프리셋 및 사용자 색상)

`VRC_EVENT_DATA_DIR` 환경 변수로 데이터 디렉터리를 변경할 수 있습니다.
첫 실행 시 앱은 프로젝트 폴더의 기존 `profiles.json`을 가져오려고 시도합니다.

캐시 파일에는 세션 토큰이 포함되므로 공유하지 마세요.

## 사용 참고사항
- 프로필에는 프로필 이름, 이벤트 이름, 설명이 필요합니다.
- VRChat API 사용을 위해 첫 실행 시 연락처 이메일이 필요합니다.
- 비공개 그룹은 접근 유형을 그룹만 사용할 수 있습니다.
- 기간은 DD:HH:MM 형식이며 최대 31일입니다.
- 태그는 최대 5개, 언어는 최대 3개입니다.
- 갤러리 업로드 제한: PNG/JPG, 64-2048 px, 10MB 미만, 계정당 64장.
- VRChat은 현재 동시에 최대 10개의 예정 이벤트만 허용합니다.

## 업데이트
- 시작 시와 실행 중 매시간 확인합니다.
- 새 버전이 있으면 UPDATE가 GitHub 저장소로 연결됩니다.
- UPDATE가 표시되면 이벤트 생성과 편집이 차단됩니다.
- 자동 업데이트 없음; 수동 업데이트.

## 문제 해결
- 로그인 문제: `cache.json`을 삭제하고 다시 로그인하세요(애플리케이션 정보에 표시된 데이터 폴더 사용).
- 그룹이 보이지 않음: 대상 그룹에 대한 캘린더 접근 권한이 필요합니다.
- 속도 제한: VRChat이 이벤트 생성에 제한을 둘 수 있습니다. 잠시 기다렸다가 재시도하고, 여러 번 실패하면 중지하세요. 새로고침/이벤트 생성 버튼을 반복 클릭하지 마세요.

## 개인정보 및 보안
- 비밀번호는 저장되지 않습니다. 세션 토큰만 캐시됩니다.
- `cache.json`이나 앱 데이터 폴더를 공유하지 마세요.

## 번역
*번역은 기계 번역이라 부정확할 수 있습니다. 수정 제안에 참여해 주세요.
- English: ../README.md
- Français: README.fr.md
- Español: README.es.md
- Deutsch: README.de.md
- 日本語: README.ja.md
- 中文（简体）: README.zh.md
- Português: README.pt.md
- 한국어: README.ko.md
- Русский: README.ru.md

## 동작 방식
- 앱은 Electron을 사용합니다:
  - `electron/main.js`가 VRChat API 호출, 프로필 영속화, 세션 캐시를 처리합니다.
  - `electron/preload.js`가 렌더러에 IPC 메서드를 노출합니다.
  - `electron/renderer/`가 UI를 렌더링하고 마법사 흐름을 관리합니다.
  - `electron/core/date-utils.js`가 패턴에서 향후 날짜를 생성합니다.

## 면책 조항
이 프로젝트는 VRChat과 관련이 없으며 VRChat의 승인을 받지 않았습니다. 사용은 본인 책임입니다.

## 요구 사항(소스에서 빌드)
- Node.js 20+ (22.21.1 권장)
- npm
- 최소 한 개 이상의 그룹에서 이벤트를 만들 수 있는 VRChat 계정

## 설정(소스 기준)
1) 의존성 설치:

```bash
npm install
```

2) VRChat API 사용을 위한 연락처 이메일 제공:
- 첫 실행 시 입력하거나 애플리케이션 정보에서 업데이트하세요.

## 실행(소스 기준)
```bash
npm run start:gui
```

## 빌드
- Windows 포터블 빌드:

```bash
npm run dist:gui
```

- 크로스플랫폼 빌드(DMG/AppImage용 macOS/Linux 도구 필요):

```bash
npm run dist:gui:all
```
