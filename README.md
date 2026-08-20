# 포켓톡 V1

## 현재 포함 기능
- Supabase Anonymous Auth 자동 로그인
- 익명 닉네임 자동 생성 및 변경
- 게시판 3개
- 게시글 작성/목록/삭제
- 게시글 작성 후 30분 이내 수정 UI
- 댓글 작성/수정/삭제
- 사용자 생성 공개 채팅방
- Supabase Realtime 기반 실시간 메시지
- 방장 채팅방 즉시 삭제
- 모바일 중심 UI

## 아직 다음 단계에서 추가
- ImageKit 업로드/자동 리사이즈/WebP
- 신고 화면
- 관리자 화면
- 차단 관리
- 마지막 사용자 퇴장 후 5분 자동 정리

## 1. 설치
```bash
npm install
```

## 2. 환경변수
`.env.example`을 복사해 `.env`로 이름 변경 후 Supabase 값을 입력합니다.

```env
VITE_SUPABASE_URL=Project URL
VITE_SUPABASE_ANON_KEY=Publishable Key
```

## 3. 실행
```bash
npm run dev
```

## 4. 빌드
```bash
npm run build
```

생성 결과는 `dist` 폴더입니다.

## Supabase 값 위치
Supabase Dashboard → Project Settings → API
- Project URL
- Publishable key
