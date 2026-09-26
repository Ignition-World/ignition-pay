import 'package:equatable/equatable.dart';

enum TransactionStatus {
  pending('PENDING'),
  completed('COMPLETED'),
  failed('FAILED');

  const TransactionStatus(this.value);
  final String value;

  static TransactionStatus fromString(String value) {
    return TransactionStatus.values.firstWhere(
      (s) => s.value == value,
      orElse: () => TransactionStatus.pending,
    );
  }
}

class TransactionModel extends Equatable {
  final String id;
  final String amount;
  final String asset;
  final String destination;
  final TransactionStatus status;
  final DateTime createdAt;
  final DateTime? updatedAt;
  final String? memo;

  const TransactionModel({
    required this.id,
    required this.amount,
    required this.asset,
    required this.destination,
    required this.status,
    required this.createdAt,
    this.updatedAt,
    this.memo,
  });

  factory TransactionModel.fromJson(Map<String, dynamic> json) {
    return TransactionModel(
      id: json['id'] as String,
      amount: json['amount'] as String,
      asset: json['asset'] as String,
      destination: json['destination'] as String,
      status: TransactionStatus.fromString(json['status'] as String),
      createdAt: DateTime.parse(json['created_at'] as String),
      updatedAt: json['updated_at'] != null
          ? DateTime.parse(json['updated_at'] as String)
          : null,
      memo: json['memo'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'amount': amount,
      'asset': asset,
      'destination': destination,
      'status': status.value,
      'created_at': createdAt.toIso8601String(),
      if (updatedAt != null) 'updated_at': updatedAt!.toIso8601String(),
      if (memo != null) 'memo': memo,
    };
  }

  TransactionModel copyWith({
    String? id,
    String? amount,
    String? asset,
    String? destination,
    TransactionStatus? status,
    DateTime? createdAt,
    DateTime? updatedAt,
    String? memo,
  }) {
    return TransactionModel(
      id: id ?? this.id,
      amount: amount ?? this.amount,
      asset: asset ?? this.asset,
      destination: destination ?? this.destination,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      memo: memo ?? this.memo,
    );
  }

  @override
  List<Object?> get props => [
        id,
        amount,
        asset,
        destination,
        status,
        createdAt,
        updatedAt,
        memo,
      ];
}