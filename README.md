# @hmr-lukas/heft-tailwind-plugin

[Tailwind CSS v4](https://tailwindcss.com/) as a regular [Heft](https://heft.rushstack.io/) task plugin for SharePoint Framework 1.22 and newer. PostCSS is the only compiler used by the plugin.

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
            "options": {}
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

Import the generated file from the SPFx entry point:

```ts
import './global.css'
```

`heft build` performs a normal build. Heft watch commands use the plugin's incremental task hook and rebuild when the input CSS or matching TS, TSX, JS, JSX, or HTML sources change. The generated CSS is ignored by the plugin's watcher and is only written when its contents change.

## Initializer

The optional initializer performs the same setup without modifying a project during npm installation:

```sh
npx heft-tailwind init
npx heft-tailwind init --prefix tw
npx heft-tailwind init --preflight
npx heft-tailwind init --dry-run
```

It creates or updates `config/heft.json` idempotently, creates `src/global.tailwind.css` when missing, and adds `src/global.css` to `.gitignore`. Fresh SPFx 1.22 projects that only contain `config/rig.json` are supported.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `input` | `src/global.tailwind.css` | Input CSS relative to `projectBase`. |
| `output` | `src/global.css` | Generated CSS relative to `projectBase`. |
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
