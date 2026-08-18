# @hmr-lukas/heft-tailwind-plugin

[Tailwind CSS v4](https://tailwindcss.com/) as a regular [Heft](https://heft.rushstack.io/) task plugin for SharePoint Framework 1.22.x and 1.23.x. PostCSS is the only compiler used by the plugin.

## Quickstart

Install the plugin:

```sh
npm i -D @hmr-lukas/heft-tailwind-plugin
```

Then run the initializer from the SPFx project root:

```sh
npx heft-tailwind init
```

The initializer detects the installed SPFx version and configures the correct generated stylesheet:

- SPFx 1.22.x uses `src/global.css`.
- SPFx 1.23.x uses `src/tailwind.global.scss` so the SPFx stylesheet pipeline keeps Tailwind utility names global.

Import the generated file from your `*WebPart.ts`. For example, a standard SPFx 1.23 WebPart uses:

```ts
import '../../tailwind.global.scss'
```

When the initializer upgrades an existing SPFx 1.23 setup, it also migrates static imports that point to the previous `src/global.css` output.

## Install

```sh
npm i -D @hmr-lukas/heft-tailwind-plugin
```

Add the task to `config/heft.json` and make the SPFx Webpack task depend on it:

```json
{
  "extends": "@microsoft/spfx-web-build-rig/profiles/default/config/heft.json",
  "phasesByName": {
    "build": {
      "tasksByName": {
        "tailwind": {
          "taskPlugin": {
            "pluginPackage": "@hmr-lukas/heft-tailwind-plugin",
            "pluginName": "tailwind-plugin",
            "options": {
              "output": "src/tailwind.global.scss"
            }
          }
        },
        "webpack": {
          "taskDependencies": ["tailwind"]
        }
      }
    }
  }
}
```

Create `src/global.tailwind.css`:

```css
@import "tailwindcss";
```

Import the generated file from the WebPart entry point, for example
`src/webparts/myWebPart/MyWebPartWebPart.ts`:

```ts
import '../../tailwind.global.scss'
```

For SPFx 1.22, `src/global.css` remains supported and is the plugin's default output. SPFx 1.23 requires the generated file to end in `.global.scss`: its Webpack rules otherwise scope Tailwind utility classes. The plugin still generates the file exclusively through PostCSS; CSS is valid SCSS and the extension selects SPFx's global stylesheet loader. Never import `global.tailwind.css`; that is the Tailwind input file. If your WebPart entry point uses a different directory depth, adjust the relative path accordingly.

`heft build` performs a normal build. Heft watch commands use the plugin's incremental task hook and rebuild when the input CSS or matching TS, TSX, JS, JSX, or HTML sources change. The generated CSS is ignored by the plugin's watcher and is only written when its contents change.

## Initializer

The optional initializer performs the same setup without modifying a project during npm installation:

```sh
npx heft-tailwind init
npx heft-tailwind init --prefix tw
npx heft-tailwind init --preflight
npx heft-tailwind init --dry-run
npx heft-tailwind --version
```

It creates or updates `config/heft.json` idempotently, makes both Sass and Webpack wait for Tailwind, creates `src/global.tailwind.css` when missing, and adds the version-appropriate output to `.gitignore`. Fresh SPFx projects that only contain `config/rig.json` are supported.

SPFx versions newer than 1.23.x are not configured silently. The initializer prints a warning and asks whether it should continue. In a non-interactive environment, pass `--yes` or `-y` to confirm explicitly:

```sh
npx heft-tailwind init --yes
```

Use `npx heft-tailwind --version` or `npx heft-tailwind -v` to print the installed plugin version.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `input` | `src/global.tailwind.css` | Input CSS relative to `projectBase`. |
| `output` | `src/global.css` | Generated CSS relative to `projectBase`; the initializer overrides this with `src/tailwind.global.scss` for SPFx 1.23.x. |
| `projectBase` | Heft `buildFolderPath` | Base for paths and Tailwind source detection. |
| `prefix` | `""` | Lowercase Tailwind prefix, for example `tw`. |
| `preflight` | `false` | Enables Tailwind Preflight. |
| `optimize` | Heft `--production` | Optimizes and minifies the output. |
| `sourceGlobs` | `src/**/*.{ts,tsx,js,jsx,html}` | Sources scanned and watched for class changes. |

SPFx projects should normally keep Preflight disabled because its global browser reset can affect the SharePoint page. A prefix reduces collisions with host-page classes; Tailwind v4 then uses classes such as `tw:flex`.

## Development

```sh
npm ci
npm run validate
```

Validation runs the tsdown build, TypeScript checks, `publint --strict`, Vitest unit and Heft integration tests, and an `npm pack --dry-run` check. Releases use [Changesets](https://github.com/changesets/changesets) and npm Trusted Publishing with provenance.

Report problems through [GitHub Issues](https://github.com/HMR-Lukas/heft-tailwind-plugin/issues).
