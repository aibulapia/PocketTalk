# PocketTalk GitHub → Cloudflare 배포본

## 1. 환경변수
`.env.example`을 복사해 `.env`를 만들고 값을 입력합니다.

## 2. 로컬 확인
```bash
npm install
npm run build
```

## 3. GitHub 업로드
빈 GitHub 저장소를 만든 뒤 프로젝트 루트에서:
```powershell
git init
git add .
git commit -m "PocketTalk initial deploy"
git branch -M main
git remote add origin https://github.com/계정명/저장소명.git
git push -u origin main
```

## 4. Cloudflare Pages
GitHub 저장소 연결 후:
- Framework preset: Vite
- Production branch: main
- Build command: npm run build
- Build output directory: dist

Cloudflare 환경변수:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_IMAGEKIT_PUBLIC_KEY

IMAGEKIT_PRIVATE_KEY는 GitHub나 Cloudflare에 넣지 않고 Supabase Edge Function Secret에만 유지합니다.

## 포함하지 않는 항목
`.env`, `node_modules`, `dist`는 `.gitignore`로 제외됩니다.
