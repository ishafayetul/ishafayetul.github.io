# Shafayetul Islam | Robotics Software Engineer

A bilingual English and Japanese robotics engineering portfolio built with Next.js App Router, TypeScript, Tailwind CSS, Lucide and Markdown. The pages are statically generated. Search, theme selection and media controls run in the browser.

## Local development

Use Node.js 22.13 or newer. The repository includes a lockfile and a Node 22 version hint.

```sh
nvm use
npm ci --ignore-scripts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). English uses unprefixed URLs and Japanese uses `/ja`. No account, database or API key is required.

## Local admin

Run `npm run admin` and open [the admin editor](http://127.0.0.1:4174/) in desktop Chrome or Edge. Choose **Open portfolio folder**, select this repository's root, and grant local file access. The editor uses the browser's folder permission to read and write source files in the checkout. The localhost server serves the editor files.

Use **Projects** and **Technical notes** for bilingual metadata and Markdown. Use **Project media** to add a thumbnail, gallery photos or architecture images. Use **Image library** to import a WebP and copy its path for the profile or an article. Profile, jobs, publications, achievements, qualifications, teaching and interface copy have their own sections. Save each record, then review your Git diff. Rebuild the public site after editing.

The editor runs on the local loopback address and is outside the public build. Its folder permission is scoped to the folder you choose. [Chrome folder access documentation](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

## Production checks

```sh
npm run content:validate
npm test
npm run lint
npm run typecheck
npm run build
npm start
```

The production build writes static files to `out/`. In another terminal, run `npm run smoke -- http://127.0.0.1:4173/` to check the export. When building for a GitHub Pages project URL, set the same `SITE_URL` for the build, local static preview, and smoke test. Pass the path that the preview prints.

Set `SITE_URL` to the final HTTPS site URL, including the repository path when applicable. Builds without it retain noindex metadata. Canonicals, hreflang, the sitemap and all public asset links reflect the configured URL.

## Deploy to GitHub Pages

1. Push the reviewed repository to GitHub and select **GitHub Actions** under **Settings → Pages → Build and deployment → Source**.
2. Run the **GitHub Pages** workflow manually from the repository's default branch. It gets the Pages URL from GitHub and uploads only the static `out/` directory.
3. Open the deployment URL and check English and Japanese pages, a case study and the résumé.

The public site uses static HTML, CSS, JavaScript and media. It needs no database or deployed server. Republishing uses a new GitHub Pages workflow run. [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Update content

- Profile, career history, skills, education, teaching, achievements, publications and project metadata live in `content/data`.
- Project and article Markdown bodies are in `content/en` and `content/ja`. Interface labels and SEO descriptions are in `messages/en.json` and `messages/ja.json`.
- Start a project with `npm run project:new -- project-slug "English title"`. Complete both locales, add supporting evidence and assets, then remove the draft flag.
- Place publication-approved images under `public/images` and use localized alt text in each asset record. Keep technical figures readable in the full view.
- Replace `public/documents/shafayetul-islam-resume.pdf` with an approved public PDF, or rebuild the current portfolio-derived version with `python scripts/build-resume.py` using a Python environment with ReportLab. Inspect the rendered PDF before publishing.

See [the content guide](docs/CONTENT_GUIDE.md), [verification notes](docs/CONTENT_VERIFICATION.md), [missing assets](docs/MISSING_ASSETS.md) and [project status](docs/PROJECT_STATUS.md).
