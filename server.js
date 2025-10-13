require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
// support either RECALL_API_BASE or RECALL_API_URL (some .env files use RECALL_API_URL)
const rawRecallBase = process.env.RECALL_API_BASE || process.env.RECALL_API_URL || '';
const RECALL_BASE = String(rawRecallBase || '').replace(/\/$/, '');
const RECALL_KEY = process.env.RECALL_API_KEY || '';
const PORTFOLIO_ENDPOINT = process.env.RECALL_PORTFOLIO_ENDPOINT || '/api/portfolio';

// helper axios instance
const recallAx = axios.create({
  // axios treats baseURL=undefined as 'no base' and will require absolute URLs when calling
  // ensure we don't pass empty string as baseURL which causes 'Invalid URL'
  baseURL: RECALL_BASE || undefined,
  headers: {
    Authorization: `Bearer ${RECALL_KEY}`,
    'Content-Type': 'application/json'
  },
  timeout: 15000
});

if (!RECALL_BASE || !RECALL_KEY) {
  console.warn('WARNING: RECALL_API_BASE (or RECALL_API_URL) and/or RECALL_API_KEY not set.');
  console.warn(`RECALL_BASE='${RECALL_BASE}' RECALL_KEY='${RECALL_KEY ? '[SET]' : '[MISSING]'}'`);
  console.warn('If RECALL_BASE is empty the server will proxy only local routes; set the env var to the Recall API base URL (e.g. https://api.getrecall.ai)');
}

// Proxy endpoint: execute trade (calls Recall /api/trade/execute)
app.post('/api/trade', async (req, res) => {
  /* Expected body fields from frontend:
     {
       fromChain, fromSpecificChain, toChain, toSpecificChain,
       fromToken, toToken, amount, reason, choose, slippageTolerance, isBridge
     }
  */
  try {
    const body = req.body;
    // construct request to Recall trade endpoint
    const resp = await recallAx.post('/api/trade/execute', {
      fromToken: body.fromToken,
      toToken: body.toToken,
      amount: String(body.amount),
      reason: body.reason || 'manual trade from dashboard',
      slippageTolerance: body.slippageTolerance || undefined,
      fromChain: body.fromChain || undefined,
      fromSpecificChain: body.fromSpecificChain || undefined,
      toChain: body.toChain || undefined,
      toSpecificChain: body.toSpecificChain || undefined,
      // add any recall-specific fields if needed (e.g. memo, metadata)
      metadata: {
        mode: body.choose || 'buy',
        isBridge: !!body.isBridge
      }
    });
    res.json({ ok: true, data: resp.data });
  } catch (err) {
    console.error('trade error', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({ ok: false, error: err?.response?.data || err.message });
  }
});

// Portfolio proxy (GET)
app.get('/api/portfolio', async (req, res) => {
  try {
    // call configured portfolio endpoint on Recall base
    const resp = await recallAx.get(PORTFOLIO_ENDPOINT);
    res.json({ ok: true, data: resp.data });
  } catch (err) {
    console.error('portfolio error', err?.response?.data || err.message);
    res.status(err?.response?.status || 500).json({ ok: false, error: err?.response?.data || err.message });
  }
});

// fallback to serve index.html for SPA behavior
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
