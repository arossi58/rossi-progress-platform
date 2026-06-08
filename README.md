# Progress Board

A simple capstone progress board (HTML/CSS/JS). Entries — text, images, and
PDFs — are stored in **this GitHub repo** so **anyone can view them**.

- **Viewing** is public and needs no login.
- **Adding** entries needs a GitHub personal access token (only you have it).

## One-time setup

### 1. Push this code to GitHub
```bash
git add .
git commit -m "Progress board"
git push
```

### 2. Turn on GitHub Pages (so others can view the site)
1. Go to your repo on GitHub → **Settings → Pages**.
2. Under **Build and deployment → Source**, pick **Deploy from a branch**.
3. Branch: **main**, folder: **/ (root)**. Save.
4. After a minute your site is live at:
   `https://arossi58.github.io/rossi-progress-platform/`

Share that URL — anyone can open it and see your progress.

### 3. Create a token (so YOU can add entries)
1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access:** only `rossi-progress-platform`.
3. **Permissions → Repository permissions → Contents:** **Read and write**.
4. Generate it and copy the token (starts with `github_pat_...`).

## Using it
1. Open the site (the Pages URL, or `index.html` locally).
2. Under **Editor Access**, paste your token and click **Save token**
   (stored only in your browser — never committed).
3. Fill in the week, description, attach images/PDFs, and **Publish Entry**.
   The files and entry are committed to the repo; viewers see them shortly after.

## How it works
- `data/entries.json` — the list of entries.
- `uploads/` — uploaded image & PDF files.
- The page reads these publicly to display the board, and uses the GitHub API
  (with your token) to commit new ones.

> Note: GitHub repos work best with files under ~25 MB each. Keep PDFs/images
> reasonably sized.
