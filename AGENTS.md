# Portfolio working instructions

Follow the global Codex security policy and project instructions. Obtain explicit approval before pushing, deploying or modifying the original Google Site.

- Use the existing Next.js App Router, TypeScript, Tailwind CSS and CSS tokens. Keep server components as the default and limit client components to browser interactions.
- Keep the admin under `admin/`, served on loopback only and outside the public static export. Never add a hosted write endpoint.
- English routes are unprefixed within the site. Preserve GitHub Pages repository-prefix support for routes, metadata and assets. Japanese routes live under `/ja`. Shared navigation, SEO and static path generation live in `src/lib` and `src/components`.
- Store factual data in `content/data`. Use paired Markdown files in `content/en` and `content/ja` and edit both message dictionaries when changing public labels.
- Keep the visual style restrained and engineering-focused. Preserve semantic structure, keyboard navigation, visible focus, reduced motion, readable contrast and distinct mobile and desktop layouts.
- Keep origins, project status, metrics, job details, credentials and awards tied to primary or owner-supplied evidence. Distinguish individual contributions from team outcomes. Preserve separate hardware versions until their relationship is confirmed.
- Add only publication-approved images and documents to `public`. Strip metadata from web copies. Keep secrets, private contact details, certificates and confidential project information outside the tracked site. Never use temporary authenticated image URLs as production assets.
- Log conflicts and unverified claims in `docs/CONTENT_VERIFICATION.md`. Track missing project files in `docs/MISSING_ASSETS.md`.
- Run the README checks and inspect the rendered pages for relevant visual, content or navigation changes.
