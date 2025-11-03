// server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

// Node 18+ includes a global fetch. If not present, warn (node-fetch removed).
const globalFetch = (typeof fetch !== 'undefined') ? fetch : null;


const app = express();
const PORT = process.env.PORT || 3000;


const DATA_DIR = path.join(__dirname, 'data');
const PORTFOLIO_FILE = path.join(DATA_DIR, 'portfolio.json');
const ADDRESSES_FILE = path.join(DATA_DIR, 'addresses.json');


// Replace with your actual Recall agent endpoint & API key if available
const RECALL_AGENT_ENDPOINT = process.env.RECALL_AGENT_ENDPOINT || 'https://app.recall.network/agents/b3a80008-bc75-473a-b3eb-8f6166c8b550';
const RECALL_API_KEY = process.env.RECALL_API_KEY || '';


app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));


// ensure data dir
fs.ensureDirSync(DATA_DIR);
if (!fs.existsSync(PORTFOLIO_FILE)) {
fs.writeJsonSync(PORTFOLIO_FILE, []);
}
if (!fs.existsSync(ADDRESSES_FILE)) {
	fs.writeJsonSync(ADDRESSES_FILE, []);
}


function readPortfolio() {
try {
return fs.readJsonSync(PORTFOLIO_FILE);
} catch (e) {
return [];
}
}


function writePortfolio(data) {
fs.writeJsonSync(PORTFOLIO_FILE, data, { spaces: 2 });
}


// API: get portfolio
app.get('/api/portfolio', (req, res) => {
const data = readPortfolio();
res.json({ success: true, portfolio: data });
});


// API: portfolio balance summary (sum of amounts grouped by fromToken/toToken mix)
app.get('/api/portfolio/balance', (req, res) => {
	try {
		const data = readPortfolio();
		// simple aggregation: total amount per token (fromToken and toToken)
		const balances = {};
		data.forEach(item => {
			// treat 'toToken' as asset acquired when buy, 'fromToken' as asset acquired when sell
			if (item.choose === 'buy') {
				balances[item.toToken] = (balances[item.toToken] || 0) + Number(item.amount || 0);
			} else if (item.choose === 'sell') {
				balances[item.fromToken] = (balances[item.fromToken] || 0) + Number(item.amount || 0);
			}
		});
		res.json({ success: true, balances });
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error calculating balances' });
	}
});


// Addresses endpoints: store token addresses that can be used in manual trade
app.get('/api/addresses', (req, res) => {
	try {
		const list = fs.readJsonSync(ADDRESSES_FILE);
		res.json({ success: true, addresses: list });
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error reading addresses' });
	}
});

app.post('/api/addresses', (req, res) => {
	try {
		const { label, address, chain } = req.body;
		if (!address) return res.status(400).json({ success: false, message: 'Address is required' });
		const list = fs.readJsonSync(ADDRESSES_FILE);
		const entry = { id: Date.now().toString(), label: label || '', address, chain: chain || '', added: new Date().toISOString() };
		list.push(entry);
		fs.writeJsonSync(ADDRESSES_FILE, list, { spaces: 2 });
		res.json({ success: true, address: entry });
	} catch (err) {
		res.status(500).json({ success: false, message: 'Error saving address' });
	}
});


// Verification endpoint: basic market data checks using CoinGecko public API and Dexscreener lookups
// This endpoint accepts a token id/address and returns whether it passes the simple thresholds.
app.post('/api/verify', async (req, res) => {
	try {
		const { addressOrId } = req.body;
		if (!addressOrId) return res.status(400).json({ success: false, message: 'addressOrId required' });

		// Try CoinGecko: their API expects coin ids (like 'bitcoin') or contract addresses for platforms.
		// We'll perform a simple search endpoint call then grab market_data.
		const cgSearch = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(addressOrId)}`;
		let market = null;
		if (globalFetch) {
			const sresp = await globalFetch(cgSearch);
			const sjson = await sresp.json();
			// Try to find a coin with matching contract address or id
			const found = sjson.coins && sjson.coins.length ? sjson.coins[0] : null;
			if (found) {
				// fetch coin details
				const detailUrl = `https://api.coingecko.com/api/v3/coins/${found.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;
				const dresp = await globalFetch(detailUrl);
				const djson = await dresp.json();
				market = djson.market_data || null;
			}
		}

		// Fallback: if market data missing, respond with not-verified
		if (!market) {
			return res.json({ success: true, verified: false, reason: 'Market data not found on CoinGecko' });
		}

		// thresholds
		const minVolume24h = 500000; // USD
		const minLiquidity = 500000; // USD - approximate using total_volume
		const minMarketCap = 1000000; // USD - FDC approx market cap

		const vol = market.total_volume ? (market.total_volume.usd || 0) : 0;
		const mcap = market.market_cap ? (market.market_cap.usd || 0) : 0;

		const passVolume = vol >= minVolume24h;
		const passLiquidity = vol >= minLiquidity; // simple proxy
		const passMcap = mcap >= minMarketCap;

		const verified = passVolume && passLiquidity && passMcap;
		res.json({ success: true, verified, checks: { volume24h: vol, marketCap: mcap, passVolume, passLiquidity, passMcap } });
	} catch (err) {
		console.error('Verify error', err);
		res.status(500).json({ success: false, message: 'Verification error' });
	}
});


// API: create manual trade
app.post('/api/trade', async (req, res) => {
try {
const {
fromChain,
fromSpecific,
toChain,
toSpecific,
choose,
fromToken,
toToken,
amount,
reason
} = req.body;


if (!fromChain || !fromSpecific || !toChain || !toSpecific || !choose || !fromToken || !toToken || !amount) {
return res.status(400).json({ success: false, message: 'Missing required fields' });
}


// build trade record
const trade = {
id: Date.now().toString(),
timestamp: new Date().toISOString(),
fromChain,
fromSpecific,
toChain,
toSpecific,
choose,
fromToken,
toToken,
amount: Number(amount),
reason: reason || '',
status: 'executed' // for demo we mark executed
};


// append to portfolio
const portfolio = readPortfolio();
portfolio.push(trade);
writePortfolio(portfolio);


// Optional: send metadata to Recall agent (placeholder)
if (RECALL_API_KEY) {
		try {
			if (globalFetch) {
				await globalFetch(RECALL_AGENT_ENDPOINT, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${RECALL_API_KEY}`
					},
					body: JSON.stringify({ trade })
				});
			} else {
				console.warn('Skipping Recall agent call: global fetch not available. Set RECALL_API_KEY to enable.');
			}
		} catch (error) {
			console.error('Error sending trade to Recall agent:', error);
		}
}


res.json({ success: true, trade });
} catch (error) {
console.error('Error creating trade:', error);
res.status(500).json({ success: false, message: 'Internal server error' });
}
});


app.listen(PORT, () => {
console.log(`Server is running on http://localhost:${PORT}`);
});