# Trello List Timer Power-Up

카드가 각 리스트에 머문 시간을 카드 하단 배지로 보여주는 커스텀 Power-Up 입니다.

표시 형식:
- `1. [일:시간:분]`
- `2. [일:시간:분]`
- `3. [일:시간:분]`

동작 방식:
- 리스트 번호는 보드의 왼쪽→오른쪽 순서(열린 리스트 기준)로 계산
- 카드가 있는 현재 리스트 번호 타이머만 증가
- 다른 리스트로 이동하면 이전 리스트 시간은 고정(정지)
- 이동한 리스트 번호 타이머가 증가
- 단계 이력은 카드 `shared` pluginData에 저장

## 파일
- `index.html`: Power-Up 진입 파일
- `power-up.js`: 리스트 단계별 타이머 로직

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
2. 카드에 `1. [0:00:00]` 형식 배지 표시 확인
3. 카드를 `2번 리스트`로 이동
4. `1.` 값은 멈추고 `2. [0:00:00]` 새 배지 시작 확인
5. `3번 리스트` 이동 시 `3.` 배지 추가되는지 확인
