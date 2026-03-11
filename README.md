# Trello List Timer Power-Up

카드가 각 리스트에 머문 시간을 카드 하단 배지로 보여주는 커스텀 Power-Up 입니다.

표시 형식:
- `하나 [0d 00h 00m]`
- `둘 [0d 00h 00m]`
- `셋 [0d 00h 00m]`

동작 방식:
- 리스트 번호는 보드의 왼쪽→오른쪽 순서(열린 리스트 기준)로 계산
- 카드가 있는 현재 리스트 번호 타이머만 증가
- 다른 리스트로 이동하면 이전 리스트 시간은 고정(정지)
- 이동한 리스트 번호 타이머가 증가
- 단계 이력은 카드 `shared` pluginData에 저장
- 기본값으로 카드 썸네일 배지는 숨김 상태
- 보드 상단 Power-Up 버튼에서 썸네일 타이머 표시 ON/OFF 가능
- 보드 상단 Power-Up 버튼에서 CSV 내보내기 가능
  - 카드별 리스트 체류 시간
  - 리스트 진입 시간
  - 이동한 사용자 정보(`Moved By`)

## 파일
- `index.html`: Power-Up 진입 파일
- `power-up.js`: 리스트 단계별 타이머 로직
- `google-apps-script/`: Google Sheet 자동 적재용 Apps Script
- `scripts/register-trello-webhook.sh`: Trello webhook 등록 스크립트

## 로컬 실행
```bash
cd /Users/daeyeon/Desktop/trello_power_up
python3 -m http.server 8080
```

`http://localhost:8080` 로 열리지만, Trello Power-Up 등록은 보통 HTTPS URL이 필요합니다.  
개발 시에는 `ngrok` 같은 터널로 HTTPS 주소를 만든 뒤 그 URL을 Connector URL로 사용하세요.

예시:
```bash
ngrok http 8080
```

## Trello에 연결
1. Trello 워크스페이스에서 Power-Up 관리자 페이지 이동
2. 커스텀 Power-Up 생성
3. Connector URL을 아래처럼 설정
   - `https://<your-domain-or-ngrok>/index.html`
4. 보드에서 해당 Power-Up 활성화

## 테스트 시나리오
1. `1번 리스트`에 `테스트 카드` 생성
2. 보드 상단 Power-Up 버튼에서 `썸네일 타이머 보이기` 클릭
3. 카드에 `리스트명 [0d 00h 00m]` 형식 배지 표시 확인
4. 카드를 `2번 리스트`로 이동
5. 이전 리스트 시간 고정 + 새 리스트 타이머 증가 확인
6. 보드 상단 버튼 `타임 추적 CSV 내보내기` 클릭 후 CSV 다운로드 확인

## Google Sheet 자동 적재

GitHub Pages Power-Up과 별도로 Google Apps Script 웹앱을 붙이면 Trello webhook 이벤트를 Google Sheet에 자동 적재할 수 있습니다.

- 설정 문서: [google-apps-script/README.md](/Users/daeyeon/Desktop/trello_power_up/google-apps-script/README.md)
- Apps Script 코드: [google-apps-script/Code.gs](/Users/daeyeon/Desktop/trello_power_up/google-apps-script/Code.gs)
- webhook 등록 스크립트: [scripts/register-trello-webhook.sh](/Users/daeyeon/Desktop/trello_power_up/scripts/register-trello-webhook.sh)
