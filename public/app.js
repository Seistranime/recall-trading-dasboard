// app.js
document.addEventListener('DOMContentLoaded', () => {
  const tabTradeBtn = document.getElementById('tab-trade');
  const tabPortfolioBtn = document.getElementById('tab-portfolio');
  const tradeSection = document.getElementById('trade-section');
  const portfolioSection = document.getElementById('portfolio-section');

  tabTradeBtn.onclick = () => {
    tabTradeBtn.classList.add('active');
    tabPortfolioBtn.classList.remove('active');
    tradeSection.classList.remove('hidden');
    portfolioSection.classList.add('hidden');
  };
  tabPortfolioBtn.onclick = () => {
    tabPortfolioBtn.classList.add('active');
    tabTradeBtn.classList.remove('active');
    portfolioSection.classList.remove('hidden');
    tradeSection.classList.add('hidden');
  };

  const form = document.getElementById('trade-form');
  const resultBox = document.getElementById('trade-result');
  const clearBtn = document.getElementById('clear-form');

  clearBtn.addEventListener('click', () => {
    form.reset();
    resultBox.textContent = '';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resultBox.textContent = 'Executing...';

    const payload = {
      fromChain: document.getElementById('fromChain').value,
      fromSpecificChain: document.getElementById('fromSpecific').value,
      toChain: document.getElementById('toChain').value,
      toSpecificChain: document.getElementById('toSpecific').value,
      choose: document.getElementById('chooseAction').value,
      isBridge: document.getElementById('isBridge').checked,
      fromToken: document.getElementById('fromToken').value.trim(),
      toToken: document.getElementById('toToken').value.trim(),
      amount: document.getElementById('amount').value,
      slippageTolerance: document.getElementById('slippage').value,
      reason: document.getElementById('reason').value.trim(),
    };

    try {
      const resp = await fetch('/api/trade', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      resultBox.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      resultBox.textContent = 'Error: ' + err.message;
    }
  });

  // Portfolio
  const refreshBtn = document.getElementById('refresh-portfolio');
  const portfolioContent = document.getElementById('portfolio-content');

  refreshBtn.addEventListener('click', loadPortfolio);

  async function loadPortfolio(){
    portfolioContent.innerHTML = '<p class="muted">Loading...</p>';
    try {
      const r = await fetch('/api/portfolio');
      const res = await r.json();
      if (!res.ok) {
        portfolioContent.innerHTML = '<pre class="result">' + JSON.stringify(res, null, 2) + '</pre>';
        return;
      }
      const data = res.data;
      // Try to render common portfolio shapes (holdings list, balances, pnl) — generic rendering
      if (Array.isArray(data?.holdings) && data.holdings.length){
        const rows = data.holdings.map(h => `<tr>
          <td>${h.token || h.symbol || h.asset}</td>
          <td>${h.balance ?? h.quantity ?? ''}</td>
          <td class="small">${h.chain ?? h.network ?? ''}</td>
          <td class="small">${h.usd_value ?? h.value_usd ?? ''}</td>
        </tr>`).join('');
        portfolioContent.innerHTML = `<table class="portfolio-table">
          <thead><tr><th>Token</th><th>Balance</th><th>Network</th><th>USD value</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
      } else {
        // fallback: pretty-print JSON
        portfolioContent.innerHTML = `<pre class="result">${JSON.stringify(data, null, 2)}</pre>`;
      }
    } catch (err) {
      portfolioContent.innerHTML = '<p class="muted">Error loading portfolio: ' + err.message + '</p>';
    }
  }
});
