# Code Generation with build_runner

## Setup

Add to `pubspec.yaml` dev_dependencies:
```yaml
dev_dependencies:
  build_runner: ^2.4.0
  freezed: ^2.5.0
  json_serializable: ^6.8.0
```

## Commands

```bash
# One-time generation
./scripts/build.sh generate

# Watch mode (incremental)
./scripts/build.sh watch

# Clean and regenerate
./scripts/build.sh clean-generate
```

## Usage

Annotate models with `@freezed` or `@JsonSerializable` and run generation.
