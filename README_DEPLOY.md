# PocketTalk v2 배포 패키지

## 1. Supabase
1. `supabase-v2-admin-reports.sql` 전체 실행
2. `profiles`에서 현재 실장님 익명 계정 UUID를 확인 후 `is_admin=true` 지정
3. Edge Function `imagekit-auth`는 기존 배포 유지
4. 새 Edge Function `imagekit-delete` 생성 → `imagekit-delete.ts` 전체 붙여넣기 → Deploy
5. Supabase Secret `IMAGEKIT_PRIVATE_KEY`가 등록되어 있는지 확인

## 2. Cloudflare Pages
GitHub에 이 폴더 전체를 업로드한 뒤 Cloudflare Pages에서 저장소 연결.
- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`
- Node.js: 22 (`.nvmrc` 포함)

Cloudflare Pages 환경변수(Production/Preview 모두):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_IMAGEKIT_PUBLIC_KEY`

## 3. 배포 후
- Cloudflare Pages URL 접속
- 익명 로그인 확인
- 관리자 메뉴가 현재 관리자 계정에만 표시되는지 확인
- 게시글 신고 / 댓글 신고 / 채팅 신고
- 관리자 처리 / 관리자 삭제
- 이미지 게시글 삭제 시 ImageKit 파일도 삭제되는지 확인

주의: VITE_ 접두사 값은 브라우저 빌드에 포함됩니다. Supabase Anon Key와 ImageKit Public Key만 넣고, ImageKit Private Key는 절대 Cloudflare에 넣지 마세요.
