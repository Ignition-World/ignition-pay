import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import 'app_color_tokens.dart';
import 'shimmer_loader.dart';

class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.borderRadius = 8,
    this.fit = BoxFit.cover,
    this.semanticLabel,
  });

  final String url;
  final double? width;
  final double? height;
  final double borderRadius;
  final BoxFit fit;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel ?? 'Image',
      image: true,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: CachedNetworkImage(
        imageUrl: url,
        width: width,
        height: height,
        fit: fit,
        placeholder: (_, __) => ShimmerBox(
          width: width ?? 64,
          height: height ?? 64,
          borderRadius: borderRadius,
        ),
        errorWidget: (_, __, ___) => Container(
          width: width,
          height: height,
          color: context.appColors.placeholderSurface,
          child: Icon(
            Icons.broken_image_outlined,
            color: context.appColors.muted,
          ),
        ),
      ),
    );
  }
}
