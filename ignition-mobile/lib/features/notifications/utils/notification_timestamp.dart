/// Formats a notification timestamp for the notification centre list.
///
/// Deliberately dependency-free (no `intl` locale data to initialise) and
/// deterministic: pass [now] to make the output testable.
String formatNotificationTimestamp(DateTime value, {DateTime? now}) {
  final reference = now ?? DateTime.now();
  final elapsed = reference.difference(value);

  if (elapsed.isNegative) return _absolute(value);
  if (elapsed.inMinutes < 1) return 'Just now';
  if (elapsed.inMinutes < 60) return '${elapsed.inMinutes}m ago';
  if (elapsed.inHours < 24) return '${elapsed.inHours}h ago';
  if (elapsed.inDays < 7) return '${elapsed.inDays}d ago';
  return _absolute(value);
}

const List<String> _months = <String>[
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _absolute(DateTime value) {
  final hour = value.hour.toString().padLeft(2, '0');
  final minute = value.minute.toString().padLeft(2, '0');
  return '${_months[value.month - 1]} ${value.day}, $hour:$minute';
}
