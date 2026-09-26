# Integration Guide for Flutter Demo with Backend

## Overview
This guide walks you through wiring the **Stellar Address Kit Demo** (Flutter) to a backend service that creates and validates payment intents.

## Prerequisites
- **Flutter SDK** 3.16+ (already required for the demo)
- **Dart SDK** 3.2+
- A running **Ignition Pay** compatible backend (or any REST API that can create a payment intent). The backend must expose two endpoints:
  1. `POST /payment-intent` – returns `{ "client_secret": "..." }`
  2. `GET /payment-status/:id` – returns `{ "status": "queued|running|completed|failed" }`
- `curl` or `http` client for testing the API.

## Backend Setup (Example Node.js)
```bash
# Install dependencies
yarn add express body-parser cors stripe

# server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post('/payment-intent', async (req, res) => {
  const { amount, currency } = req.body;
  const intent = await stripe.paymentIntents.create({ amount, currency });
  res.json({ client_secret: intent.client_secret, id: intent.id });
});

app.get('/payment-status/:id', async (req, res) => {
  const intent = await stripe.paymentIntents.retrieve(req.params.id);
  res.json({ status: intent.status });
});

app.listen(3000, () => console.log('Backend listening on :3000'));
```
Make sure to set `STRIPE_SECRET_KEY` in a `.env` file and never commit it.

## Flutter Integration
1. **Add dependencies** to `pubspec.yaml`:
```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0
  flutter_stripe: ^9.0.0
```
2. **Create a service class** (`lib/services/payment_service.dart`):
```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class PaymentService {
  final String backendBaseUrl;
  PaymentService(this.backendBaseUrl);

  Future<String> createPaymentIntent(int amount, String currency) async {
    final response = await http.post(
      Uri.parse('$backendBaseUrl/payment-intent'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'amount': amount, 'currency': currency}),
    );
    final data = jsonDecode(response.body);
    return data['client_secret'];
  }

  Future<String> pollStatus(String paymentId) async {
    final response = await http.get(Uri.parse('$backendBaseUrl/payment-status/$paymentId'));
    final data = jsonDecode(response.body);
    return data['status'];
  }
}
```
3. **Update UI** to trigger the flow (e.g., in `lib/main.dart`):
```dart
import 'package:flutter_stripe/flutter_stripe.dart';
import 'services/payment_service.dart';

final _paymentService = PaymentService('http://localhost:3000');

Future<void> startPayment() async {
  final clientSecret = await _paymentService.createPaymentIntent(2000, 'usd');
  await Stripe.instance.initPaymentSheet(paymentSheetParameters: SetupPaymentSheetParameters(
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: 'Demo Store',
  ));
  await Stripe.instance.presentPaymentSheet();
}
```
4. **Handle callbacks** – Listen for the result and optionally call `pollStatus` to verify server‑side completion.

## Testing the Flow
```bash
# Start backend
node server.js

# Run Flutter app (web)
flutter run -d chrome
```
Press the "Pay" button, the Stripe payment sheet appears, complete the demo payment, and you should see the status transition to `succeeded` both client‑side and via the backend `/payment-status` endpoint.

## Security Checklist
- **Never** embed `STRIPE_SECRET_KEY` (or any private key) in the Flutter code.
- Use **HTTPS** in production for backend communication.
- Validate the amount and currency on the server before creating the intent.
- Verify webhook signatures if you implement Stripe webhooks.

---
For more detailed docs, see the backend README in `backend/README.md` and the Stripe integration guide at https://stripe.com/docs/payments/integration-builder.
