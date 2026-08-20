# PocketTalk Vite 6 배포본

Cloudflare 빌드 환경의 Vite 6 이상 요구에 맞춰 수정한 배포본입니다.

## 로컬 확인
프로젝트 루트에서:

```powershell
npm install
npm run build
```

## GitHub 반영
기존 저장소를 이미 연결했다면 이 파일들로 교체한 뒤:

```powershell
git add .
git commit -m "Upgrade Vite to 6 for Cloudflare"
git push
```

Cloudflare가 자동으로 다시 빌드합니다.

## Cloudflare 설정
- Build command: `npm run build`
- Build output directory: `dist`
- Production branch: `main`

환경변수:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_IMAGEKIT_PUBLIC_KEY`
