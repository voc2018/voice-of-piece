# Voice of Piece

**Fair resonance of African art and culture.**

Voice of Piece is a digital platform that gives Tanzanian artists a space of their own online — with their name, story, artworks, and authorship kept together.

The public site at **[voiceofpiece.org](https://voiceofpiece.org)** introduces the project and connects visitors to individual artist websites. Each artist site is served from its own subdomain, while artwork records and images can be managed through a private studio backed by Cloudflare D1 and R2.

Voice of Piece is an initiative of **Voice of Calling NPO**.

## What this repository contains

This repository powers the main Voice of Piece website and the individual websites for 17 Tanzanian artists.

- Main site: `voiceofpiece.org`
- 17 artist subdomains such as `ezekiel.voiceofpiece.org`
- Static artist pages and media
- Cloudflare Worker routing
- Public artwork API
- Private artwork-management studio
- Cloudflare D1 integration for artwork metadata
- Cloudflare R2 integration for artwork images
- English, Kiswahili, and Korean content support in the studio workflow

## Artists

The current site includes individual web spaces for:

| Artist | Site |
| --- | --- |
| Aggrey Paul Mwasha | `aggrey.voiceofpiece.org` |
| Alto Augustino Haule | `alto.voiceofpiece.org` |
| Elichilia Ezekiel Mcharo | `elichilia.voiceofpiece.org` |
| Evarist Fabian Chikawe | `evarist.voiceofpiece.org` |
| Evodius Tumsime Nicholaus | `evodius.voiceofpiece.org` |
| Ezekiel Charles Loishooki | `ezekiel.voiceofpiece.org` |
| Godwin Josephat Makombe | `godwin.voiceofpiece.org` |
| Hedwiga Medard Tairo | `hedwiga.voiceofpiece.org` |
| James Romanus Haule | `james.voiceofpiece.org` |
| John Mussa Ngwesa | `john.voiceofpiece.org` |
| Kipara David Mzuguno | `kipara.voiceofpiece.org` |
| Ladislaus Tumwesige Nicholaus | `ladislaus.voiceofpiece.org` |
| Lutengano Anganile Mwakisopile | `lutengano.voiceofpiece.org` |
| Omary Said Mitole | `mitole.voiceofpiece.org` |
| Paul John Mwakoro | `paul.voiceofpiece.org` |
| Price Deodatus Tarimo | `price.voiceofpiece.org` |
| Simon Venance Mussa | `simon.voiceofpiece.org` |

## Project structure

```text
.
├── public/
│   ├── index.html          # Main Voice of Piece website
│   ├── img/                # Shared images
│   ├── studio/             # Private browser-based artwork studio
│   ├── aggrey/             # Artist website + media
│   ├── alto/
│   ├── ...
│   └── simon/
├── src/
│   ├── index.js            # Cloudflare Worker, routing, public API, R2 photos
│   └── studio.js           # Authenticated studio API
├── package.json
├── package-lock.json
└── wrangler.jsonc          # Cloudflare Worker, routes, D1 and R2 bindings
```

## Architecture

### Static website

The files in `public/` are served through Cloudflare Workers static assets. The root site presents the Voice of Piece project and artist directory.

### Artist subdomains

`src/index.js` maps each supported artist subdomain to that artist's folder in `public/`.

For example:

```text
https://ezekiel.voiceofpiece.org/
        ↓
public/ezekiel/
```

Requests using an artist path on the main domain are redirected to the corresponding subdomain.

### Artwork API

Published artwork data is read from Cloudflare D1.

```http
GET /api/artists/:slug/artworks
```

Artwork images stored in Cloudflare R2 are served through:

```http
GET /photos/<r2_key>
```

### Studio

The browser-based studio at `/studio/` allows authorized administrators to manage artwork records and photos.

The studio supports:

- creating artwork records
- editing artwork metadata
- replacing main artwork photos
- publishing and hiding artworks
- maintaining titles, media, and descriptions in Kiswahili, English, and Korean
- optional AI-assisted text polishing and translation

Admin passwords and API credentials are **not stored in this repository**. They are configured as Cloudflare Worker secrets.

## Technology

- HTML, CSS, and vanilla JavaScript
- Cloudflare Workers
- Cloudflare Workers Static Assets
- Cloudflare D1
- Cloudflare R2
- Wrangler
- OpenAI API for optional studio writing/translation assistance

## Local development

### 1. Install dependencies

```bash
npm install
```

### 2. Configure local secrets

The studio expects an administrator password. AI-assisted writing and translation additionally require an OpenAI API key.

For local Wrangler development, create a `.dev.vars` file:

```text
ADMIN_PASSWORD=your-local-admin-password
OPENAI_API_KEY=your-api-key
```

Optional:

```text
OPENAI_MODEL=your-model-name
```

Do not commit `.dev.vars`, `.env`, API keys, passwords, or other credentials.

### 3. Start the local Worker

```bash
npx wrangler dev
```

The application uses the D1 and R2 bindings defined in `wrangler.jsonc`. The current project assumes the corresponding Voice of Piece Cloudflare resources and database schema already exist.

## Cloudflare configuration

`wrangler.jsonc` defines:

- the Worker entry point
- static asset serving
- the root domain and artist subdomain routes
- the D1 database binding as `DB`
- the R2 bucket binding as `PHOTOS`

Production secrets should be configured through Wrangler or the Cloudflare dashboard, never committed to GitHub.

Example:

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put OPENAI_API_KEY
```

## Deployment

After authenticating Wrangler with the correct Cloudflare account:

```bash
npx wrangler deploy
```

Before deploying changes, verify that:

1. the intended artist folders are present under `public/`;
2. matching artist subdomains are listed in `src/index.js`;
3. matching custom-domain routes are present in `wrangler.jsonc`;
4. required D1 and R2 bindings are available;
5. required Worker secrets are configured.

## Adding a new artist

To add another artist website:

1. Create `public/<artist-slug>/` and add the artist site's files.
2. Add the slug to `ARTIST_SUBDOMAINS` in `src/index.js`.
3. Add the artist custom-domain route to `wrangler.jsonc`.
4. Add the artist to the main directory in `public/index.html`.
5. Add or initialize the corresponding artist record in the production data system as needed.
6. Test both the main-site link and the artist subdomain before deployment.

## Security notes

- Secrets are kept outside the repository.
- Studio sessions use an `HttpOnly`, `Secure`, `SameSite=Strict` cookie.
- Only SHA-256 hashes of session tokens are stored in D1.
- Studio write requests require an application-specific request header.
- Uploaded studio images are restricted to JPG, PNG, or WebP and limited in size.
- Public artwork endpoints return only published records.

## Project links

- Website: [voiceofpiece.org](https://voiceofpiece.org)
- Shop: [voiceofpiece.com](https://voiceofpiece.com)
- Instagram: [@voiceofpiece](https://www.instagram.com/voiceofpiece/)

## About Voice of Piece

Voice of Piece works to make artists visible **without asking them to become louder than their work**. Each artist receives a place where their work can be found under their own name, connected to clear credit, rights, and fair payment.

> We do not ask them to speak louder. We build the place where their work can be found, credited and fairly paid.

---

**Voice of Piece — Voice of Calling NPO**
