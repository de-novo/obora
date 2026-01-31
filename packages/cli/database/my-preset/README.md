# my-preset

Test

## Category

Database & ORM (exclusive - only one preset from this category can be installed)

## Installation

```bash
obora add my-preset
```

## Configuration

### Dependencies

Add your preset's dependencies to `manifest.json`:

```json
{
  "common": {
    "dependencies": {
      "your-package": "^1.0.0"
    }
  }
}
```

### Files

1. Create template files in the `files/` directory
2. Reference them in `manifest.json`:

```json
{
  "common": {
    "files": ["config.ts"]
  }
}
```

### Transforms

Add code transformations in `manifest.json`:

```json
{
  "common": {
    "transform": [
      {
        "target": "app/providers.tsx",
        "type": "provider-wrap",
        "provider": "YourProvider",
        "content": "import { YourProvider } from './your-provider'"
      }
    ]
  }
}
```

## Development

1. Edit `manifest.json` to configure your preset
2. Add template files to `files/` directory
3. Test with `obora add my-preset`
4. Validate with `obora doctor --presets`

## Transform Types

- `import`: Add import statements
- `dependency`: Add npm dependencies
- `provider-wrap`: Wrap app with a provider component
- `layout-component`: Add components to layout
- `nestjs-module`: Add NestJS module imports

See [preset.schema.json](../../preset.schema.json) for full schema documentation.
