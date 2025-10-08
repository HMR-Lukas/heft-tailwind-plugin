# @derlesh/heft-tailwind-plugin

A [Heft](https://heft.rushstack.io/) task plugin that prebuilds [Tailwind CSS](https://tailwindcss.com/) v4 via PostCSS before Webpack runs.

## Install

```
npm i -D @derlesh/heft-tailwind-plugin @tailwindcss/postcss postcss
```

> Requires Node 18+ and Tailwind 4.

## Configuration

Add `tailwind` and `webpack` to your heft.json config file. It should look like in the example:

**<project>/config/heft.json**

```json
{
  "extends": "@microsoft/spfx-web-build-rig/profiles/default/config/heft.json",
  ...
  "phasesByName": {
    "build": {
      "tasksByName": {
        "tailwind": {
          "taskPlugin": {
            "pluginPackage": "@derlesh/heft-tailwind-plugin",
            "pluginName": "tailwind-plugin",
            "options": { }
          }
        },
        "webpack": { "taskDependencies": ["tailwind"] }
      }
    }
  }
  ...
}
```

The plugin will search for any **tailwind.css** file that contains `@import "tailwindcss"` in your project. If successfull, it will generate a compatible `tailwind.generated.css` file in the same folder.

## Usage

1. Create a Tailwind CSS file anywhere in your project, e.g. `src/webparts/MyWebpart/styles/tailwind.css`

```
@import "tailwindcss";

:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  ...
}

...
```

2. Import `tailwind.generated.css` in your webpart like other CSS file.

```
import "./styles/tailwind.generated.css";
```

**Notice:** If your source css file is named something else like `styles.css`, you have to import `styles.generated.css`

### Contributing

Contributions are welcome! Whether bug reports, ideas or pull requests

- Issues: describe the problem/idea and steps to reproduce if possible.
- Pull Requests: keep them focused, explain the “why”, and include a small repro or log if helpful.