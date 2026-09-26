import express from 'express';

const app = express();
app.use(express.json());

interface Sep38Quote {
  id: string;
  sell_asset: string;
  buy_asset: string;
  sell_amount: string;
  buy_amount: string;
  rate: string;
  expires_at: string;
}

const quotes = new Map<string, Sep38Quote>();

interface PaymentRequest {
  destination: string;
  amount: string;
}

const HORIZON_URL = process.env.HORIZON_URL || 'https://horizon-testnet.stellar.org';

app.post('/api/payments', async (req, res) => {
  try {
    const { destination, amount } = req.body as PaymentRequest;
    res.json({ success: true, hash: 'placeholder_tx_hash', destination, amount });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/accounts/:address', async (req, res) => {
  try {
    const address = req.params.address;
    const response = await fetch(`${HORIZON_URL}/accounts/${address});
    if (!response.ok) {
      if (response.status === 404) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }
      return res.status(400).json({ success: false, error: 'Failed to fetch account from Horizon' });
    }
    const data = await response.json();
    const balances = (data.balances || []).map((balance: any) => {
      if (balance.asset_type === 'native') {
        return { type: 'native', balance: balance.balance };
      }
      return {
        type: balance.asset_type,
        asset_code: balance.asset_code,
        asset_issuer: balance.asset_issuer,
        balance: balance.balance,
      };
    });
    res.json({ address, balances });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/sep38/quote', (req, res) => {
  try {
    const { sell_asset, buy_asset, sell_amount, rate } = req.body;
    if (!sell_asset || !buy_asset || !sell_amount || !rate) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    const id = Math.random().toString(36).substr(2, 9);
    const buy_amount = (parseFloat(sell_amount) * parseFloat(rate)).toFixed(7);
    const expires_at = new Date(Date.now() + 60_000).toISOString();
    const quote: Sep38Quote = { id, sell_asset, buy_asset, sell_amount, buy_amount, rate, expires_at };
    quotes.set(id, quote);
    res.json({ success: true, quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post('/sep38/execute', (req, res) => {
  try {
    const { quote_id } = req.body;
    if (!quote_id) {
      return res.status(400).json({ success: false, error: 'Missing quote_id' });
    }
    const quote = quotes.get(quote_id);
    if (!quote || new Date(quote.expires_at) <= new Date()) {
      return res.status(400).json({ success: false, error: 'Quote not found or expired' });
    }
    quotes.delete(quote_id); // one-time use
    res.json({ success: true, hash: 'placeholder_tx_hash', quote });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('API server running on port ' + PORT));
