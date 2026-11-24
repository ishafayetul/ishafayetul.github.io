# Update the portfolio

## Edit with the local admin

Run `npm run admin`. Open [Portfolio Admin](http://127.0.0.1:4174/) in desktop Chrome or Edge and grant access to the repository root. Choose a content section and a record. The admin saves changes directly to your checkout so you can inspect them with Git and rebuild. Image uploads resize to a maximum of 1920 pixels on the longest edge and strip source metadata when encoding to WebP.

Use `Draft` to keep an unfinished project out of the public build. Existing slugs are fixed in the editor to preserve links. Removing an image from a project clears its reference and leaves the image file available in the library. Use a current Chrome or Edge build for direct folder writes.

Use the editor's advanced JSON field for optional schema fields that are absent from a record. Apply that JSON to the form, save, then run the content validator. If someone edits a source file on disk while it is open in the admin, the editor reports a conflict before replacing it. Keep a copy of any unsaved edits before reopening the folder.

## Add a project

1. Run `npm run project:new -- my-robot "My Robot"`.
2. Edit the new entry in `content/data/projects.json`. Add the Japanese title and both summaries. Set the main category, technologies, dates, role and a status supported by documentation.
3. Fill in both `content/{en,ja}/projects/my-robot.md` files. Use level-two headings for the overview, engineering problem, individual work, implementation, evaluation or lessons learned as evidence permits.
4. Place approved images, graphics or videos under `public/images/projects`. Add localized alt text and optional localized captions. Image records have `src`, `alt`, optional `caption` and optional CSS `position` and an optional optimized `preview` used by cards. Use `thumbnail` for the card, `gallery` for photo sets and `architecture` for a verified diagram.
5. Add repository, demonstration and publication URLs where available. For YouTube, set `demoUrl` to the public watch URL and `youtubeId` to its video ID. For local video, set `videoSrc` to a public media path and add appropriate captions or a transcript alongside it.
6. Include verified measurement units, conditions and limitations in `metrics`. Add `relatedProjects` by slug. Use `archive` for early projects and `featured` for homepage selections.
7. Remove `draft` when both languages and the evidence are ready. Run the content validator and open both routes.

## Add a technical note

Add a slug, titles, summaries and tags to `content/data/articles.json`. Put the Markdown at `content/en/blog/<slug>.md` and `content/ja/blog/<slug>.md`. Use the optional `project` field to link an existing project.

## Update career, research or translation

- Edit the matching JSON files in `content/data`. Store bilingual prose as `{ "en": "…", "ja": "…" }`. Use ISO month values such as `2026-03` for role dates and keep experience reverse chronological.
- Keep publication author names and ordering as deposited by the publisher. The research page derives display citations and BibTeX from the same record.
- Update both message files for interface labels. Use natural Japanese for employment descriptions, and keep established technology names such as ROS 2, SLAM and LiDAR.
- The Japanese professional descriptions, research notes and localized job titles are prepared for recruiter review. Have a fluent reviewer confirm terminology and institution names before public launch.

## Update images and the résumé

- Prefer original photos, repository renders and approved technical figures. Export regular photos as WebP. Preserve enough detail for labels in the full-size view. Remove EXIF and other nonessential metadata from public copies.
- Originals recovered from the old site are kept locally under the ignored `assets/originals` directory. Keep this directory in a private asset backup if the site is moved to another workspace.
- Replace the PDF at the same public path or update `profile.resume`. Use the same reviewed facts as the website and exclude direct identifiers and private contact details. Check preview and download.
- The supplied PDF is an English, one-page portfolio résumé assembled from the newer brief and sourced project records. It can be regenerated with the ReportLab script in `scripts`.
