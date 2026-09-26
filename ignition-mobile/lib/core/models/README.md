# Models with Freezed & JSON Serializable

This directory contains model classes that use Freezed for immutable data classes and JSON serialization.

## Setup
The following dependencies are already added to `pubspec.yaml`:
- `freezed_annotation`: Runtime annotations for Freezed
- `json_annotation`: Runtime annotations for JSON serialization
- `build_runner`: Build tool for code generation
- `freezed`: Code generator for Freezed
- `json_serializable`: Code generator for JSON serialization

## Creating New Models
1. Create a new `.dart` file for your model (e.g., `models/my_model.dart`)
2. Add the necessary imports and part files:
   ```dart
   import 'package:freezed_annotation/freezed_annotation.dart';

   part 'my_model.freezed.dart';
   part 'my_model.g.dart';

   @freezed
   class MyModel with _$MyModel {
     const factory MyModel({
       required String id,
       // Add your fields here
     }) = _MyModel;

     factory MyModel.fromJson(Map<String, dynamic> json) => _$MyModelFromJson(json);
   }
   ```

## Generating Code
Run the build runner to generate the `.freezed.dart` and `.g.dart` files:

```bash
# One-time build
dart run build_runner build

# Watch for changes (recommended during development)
dart run build_runner watch
```

## Features
- **Immutable data classes**: All models are immutable by default
- **JSON serialization**: Automatic fromJson/toJson generation
- **CopyWith method**: Easy object copying with modified fields
- **Union types**: Support for sealed classes/hierarchy
- **Default values**: Use `@Default()` to specify default values
- **Custom JSON keys**: Use `@JsonKey(name: 'custom_key')` for different JSON field names