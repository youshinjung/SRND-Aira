# 팀 공유 (GitHub Pages 배포)

## 1. 저장소 만들기 & 올리기
```bash
cd aira-prototype          # index.html, app.html, README.md가 있는 폴더
git init
git add .
git commit -m "AIRA UI 프로토타입"
git branch -M main
git remote add origin https://github.com/<계정명>/aira-prototype.git
git push -u origin main
```

## 2. GitHub Pages 켜기
저장소 → **Settings → Pages** → Source를 **Deploy from a branch**,
Branch를 **main / (root)** 로 선택 → Save.

1~2분 뒤 `https://<계정명>.github.io/aira-prototype/` 에서 열립니다.
팀원들은 링크만 열면 로그인부터 완료까지 직접 클릭해볼 수 있습니다.

## 3. 팀원과 함께 수정하려면
- 팀원을 저장소 Collaborator로 초대 (Settings → Collaborators).
- Git이 처음인 팀원은 GitHub 웹 화면에서 파일을 바로 편집해도 됩니다 (연필 아이콘).
- 수정을 main에 push하면 Pages가 자동으로 다시 배포됩니다.
