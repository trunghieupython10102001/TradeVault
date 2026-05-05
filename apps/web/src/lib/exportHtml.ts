import { formatDate } from './utils';
import { formatCurrency } from './calculations';

type TradeImage = { id?: string; type?: string; url: string; caption?: string | null };
interface Trade {
  id: string;
  symbol: string;
  side: string;
  status: string;
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  commission: number;
  pnl?: number | null;
  rMultiple?: number | null;
  strategy?: string | null;
  timeframe?: string | null;
  rating?: number;
  entryDate: string;
  exitDate?: string | null;
  setupDescription?: string | null;
  notes?: string | null;
  mistakes?: string | null;
  lessons?: string | null;
  images?: TradeImage[];
}

function stars(rating: number): string {
  return [1, 2, 3, 4, 5]
    .map((s) => `<span style="color:${s <= rating ? '#f59e0b' : '#374151'}">★</span>`)
    .join('');
}

function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${color};color:#fff;letter-spacing:.5px">${text}</span>`;
}

function pnlColor(val: number | null): string {
  if (val == null) return '#9ca3af';
  return val >= 0 ? '#10b981' : '#ef4444';
}

function tradeRow(t: Trade, imageMap: Map<string, string>): string {
  const pnl = t.pnl != null ? Number(t.pnl) : null;
  const rMult = t.rMultiple != null ? Number(t.rMultiple) : null;
  const sideBg = t.side === 'LONG' ? '#10b981' : '#ef4444';
  const statusBg = t.status === 'OPEN' ? '#3b82f6' : '#6b7280';

  return `
  <tr class="trade-row" onclick="toggleDetail('${t.id}')">
    <td>${badge(t.side, sideBg)}</td>
    <td><strong>${t.symbol}</strong></td>
    <td>${badge(t.status, statusBg)}</td>
    <td class="mono">$${Number(t.entryPrice).toFixed(2)}</td>
    <td class="mono">${t.exitPrice ? `$${Number(t.exitPrice).toFixed(2)}` : '—'}</td>
    <td class="mono">${Number(t.quantity)}</td>
    <td class="mono" style="color:${pnlColor(pnl)};font-weight:600">
      ${pnl != null ? formatCurrency(pnl) : '—'}
    </td>
    <td class="mono" style="color:${pnlColor(rMult)};font-weight:600">
      ${rMult != null ? `${rMult >= 0 ? '+' : ''}${rMult.toFixed(2)}R` : '—'}
    </td>
    <td>${t.strategy ? `<span class="strategy-badge">${t.strategy}</span>` : '—'}</td>
    <td class="mono">${formatDate(t.entryDate, 'MM/dd/yyyy HH:mm')}</td>
    <td>${stars(t.rating || 0)}</td>
    <td style="color:#6b7280;font-size:12px">▼</td>
  </tr>
  <tr class="detail-row" id="detail-${t.id}" style="display:none">
    <td colspan="12">
      <div class="detail-content">
        ${detailContent(t, imageMap)}
      </div>
    </td>
  </tr>`;
}

async function fetchAsBase64(url: string, webBase: string): Promise<string> {
  try {
    const absUrl = url.startsWith('http://') || url.startsWith('https://')
      ? url
      : webBase.replace(/\/$/, '') + (url.startsWith('/') ? url : '/' + url);
    const res = await fetch(absUrl);
    if (!res.ok) return absUrl;
    const blob = await res.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(absUrl);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function detailContent(t: Trade, imageMap: Map<string, string>): string {
  const sections: string[] = [];

  sections.push(`
    <div class="detail-grid">
      <div class="detail-block">
        <span class="detail-label">Stop Loss</span>
        <span class="detail-val">${t.stopLoss ? `$${Number(t.stopLoss).toFixed(2)}` : '—'}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Take Profit</span>
        <span class="detail-val">${t.takeProfit ? `$${Number(t.takeProfit).toFixed(2)}` : '—'}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Commission</span>
        <span class="detail-val">$${Number(t.commission).toFixed(2)}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Timeframe</span>
        <span class="detail-val">${t.timeframe || '—'}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Entry Date</span>
        <span class="detail-val">${formatDate(t.entryDate, 'MMM dd, yyyy HH:mm')}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Exit Date</span>
        <span class="detail-val">${t.exitDate ? formatDate(t.exitDate, 'MMM dd, yyyy HH:mm') : '—'}</span>
      </div>
    </div>`);

  const notes = [
    t.setupDescription && `<div class="note-block"><span class="note-label">Setup</span><p class="note-text">${escHtml(t.setupDescription)}</p></div>`,
    t.notes && `<div class="note-block"><span class="note-label">Notes</span><p class="note-text">${escHtml(t.notes)}</p></div>`,
    t.mistakes && `<div class="note-block"><span class="note-label">Mistakes</span><p class="note-text">${escHtml(t.mistakes)}</p></div>`,
    t.lessons && `<div class="note-block"><span class="note-label">Lessons</span><p class="note-text">${escHtml(t.lessons)}</p></div>`,
  ].filter(Boolean);

  if (notes.length > 0) {
    sections.push(`<div class="notes-section">${notes.join('')}</div>`);
  }

  if (t.images && t.images.length > 0) {
    const imgs = t.images.map((img: TradeImage) => {
      if (img.type === 'tradingview') {
        return `<a href="${escAttr(img.url)}" target="_blank" class="tv-link">📈 ${escHtml(img.caption || 'TradingView Chart')} ↗</a>`;
      }
      const src = imageMap.get(img.url) ?? img.url;
      const caption = escAttr(img.caption || '');
      return `<img src="${escAttr(src)}" alt="${caption}" class="thumb" onclick="openLightbox('${escAttr(src)}', '${caption}')" />`;
    }).join('');
    sections.push(`<div class="images-section">${imgs}</div>`);
  }

  return sections.join('');
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str: string): string {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function summaryStats(trades: Trade[]): string {
  const closed = trades.filter((t) => t.pnl != null);
  const totalPnl = closed.reduce((s, t) => s + Number(t.pnl), 0);
  const wins = closed.filter((t) => Number(t.pnl) > 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + Number(t.pnl), 0) / wins.length : 0;
  const losses = closed.filter((t) => Number(t.pnl) < 0);
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0) / losses.length) : 0;
  const pf = avgLoss > 0 ? (wins.reduce((s, t) => s + Number(t.pnl), 0)) / Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0)) : 0;

  const stat = (label: string, value: string, color = '#e5e7eb') =>
    `<div class="stat-card"><span class="stat-label">${label}</span><span class="stat-val" style="color:${color}">${value}</span></div>`;

  return `
  <div class="stats-bar">
    ${stat('Total Trades', String(trades.length))}
    ${stat('Closed', String(closed.length))}
    ${stat('Win Rate', `${winRate.toFixed(1)}%`, winRate >= 50 ? '#10b981' : '#ef4444')}
    ${stat('Total P&L', formatCurrency(totalPnl), totalPnl >= 0 ? '#10b981' : '#ef4444')}
    ${stat('Avg Win', formatCurrency(avgWin), '#10b981')}
    ${stat('Avg Loss', formatCurrency(-avgLoss), '#ef4444')}
    ${stat('Profit Factor', pf > 0 ? pf.toFixed(2) : '—', pf >= 1 ? '#10b981' : '#ef4444')}
  </div>`;
}

export async function generateTradeHtml(trades: Trade[], exportedAt: Date = new Date(), webBaseUrl = 'http://localhost:3000'): Promise<string> {
  const dateStr = formatDate(exportedAt, 'MMM dd, yyyy HH:mm');

  // Collect all unique image URLs (non-tradingview) and fetch as base64
  const imageUrls = Array.from(new Set(
    trades.flatMap((t) =>
      (t.images ?? []).filter((img) => img.type !== 'tradingview').map((img) => img.url)
    )
  ));
  const imageMap = new Map<string, string>();
  await Promise.all(
    imageUrls.map(async (url) => {
      const data = await fetchAsBase64(url, webBaseUrl);
      imageMap.set(url, data);
    })
  );

  const rows = trades.map((t) => tradeRow(t, imageMap)).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Trade Journal Export — ${dateStr}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0f1117;
      color: #e5e7eb;
      min-height: 100vh;
      padding: 32px 24px;
    }
    .header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid #1f2937;
    }
    .header h1 { font-size: 22px; font-weight: 700; color: #f9fafb; }
    .header .meta { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .header .logo { font-size: 13px; color: #6b7280; }
    .stats-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: #1a1d27;
      border: 1px solid #1f2937;
      border-radius: 8px;
      padding: 12px 18px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 110px;
    }
    .stat-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; }
    .stat-val { font-size: 18px; font-weight: 700; }
    .search-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .search-bar input, .search-bar select {
      background: #1a1d27;
      border: 1px solid #1f2937;
      border-radius: 6px;
      padding: 7px 12px;
      color: #e5e7eb;
      font-size: 13px;
      outline: none;
    }
    .search-bar input { width: 220px; }
    .search-bar input::placeholder { color: #4b5563; }
    .table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid #1f2937; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr { background: #1a1d27; }
    thead th {
      padding: 11px 14px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: .5px;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }
    thead th:hover { color: #9ca3af; }
    tbody tr.trade-row {
      border-top: 1px solid #1f2937;
      cursor: pointer;
      transition: background .15s;
    }
    tbody tr.trade-row:hover { background: #1a1d27; }
    tbody tr.trade-row td { padding: 10px 14px; vertical-align: middle; }
    tbody tr.detail-row td { padding: 0; background: #12151e; }
    .detail-content {
      padding: 16px 20px;
      border-top: 1px solid #1f2937;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .detail-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .detail-block { display: flex; flex-direction: column; gap: 2px; min-width: 130px; }
    .detail-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; }
    .detail-val { font-size: 13px; color: #e5e7eb; font-weight: 500; }
    .notes-section { display: flex; flex-wrap: wrap; gap: 14px; }
    .note-block { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 200px; }
    .note-label { font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: .5px; }
    .note-text { font-size: 13px; color: #d1d5db; line-height: 1.5; white-space: pre-wrap; }
    .images-section { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-start; }
    .thumb { width: 120px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid #1f2937; transition: opacity .15s; cursor: zoom-in; }
    .thumb:hover { opacity: .85; }
    .lightbox-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.88);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
    }
    .lightbox-overlay.open { display: flex; }
    .lightbox-overlay img { max-width: 92vw; max-height: 82vh; border-radius: 8px; object-fit: contain; box-shadow: 0 8px 40px rgba(0,0,0,.6); }
    .lightbox-caption { color: #d1d5db; font-size: 13px; }
    .lightbox-close {
      position: fixed;
      top: 20px; right: 24px;
      background: rgba(255,255,255,.1);
      border: none;
      color: #fff;
      font-size: 22px;
      width: 40px; height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .lightbox-close:hover { background: rgba(255,255,255,.2); }
    .tv-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #1a1d27;
      border: 1px solid #1f2937;
      border-radius: 6px;
      color: #60a5fa;
      font-size: 12px;
      text-decoration: none;
    }
    .tv-link:hover { border-color: #60a5fa; }
    .mono { font-family: 'SF Mono', 'Fira Code', monospace; }
    .strategy-badge {
      display: inline-block;
      padding: 2px 8px;
      background: #1e3a5f;
      color: #60a5fa;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #1f2937;
      font-size: 11px;
      color: #4b5563;
      text-align: center;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Trade Journal</h1>
      <div class="meta">Exported on ${dateStr} &nbsp;·&nbsp; ${trades.length} trade${trades.length !== 1 ? 's' : ''}</div>
    </div>
    <div class="logo">TradeVault Export</div>
  </div>

  ${summaryStats(trades)}

  <div class="search-bar">
    <input type="text" id="searchInput" placeholder="Search symbol..." oninput="filterTable()" />
    <select id="sideFilter" onchange="filterTable()">
      <option value="">All Sides</option>
      <option value="LONG">Long</option>
      <option value="SHORT">Short</option>
    </select>
    <select id="statusFilter" onchange="filterTable()">
      <option value="">All Status</option>
      <option value="OPEN">Open</option>
      <option value="CLOSED">Closed</option>
    </select>
  </div>

  <div class="table-wrap">
    <table id="tradesTable">
      <thead>
        <tr>
          <th onclick="sortTable(0)">Side</th>
          <th onclick="sortTable(1)">Symbol</th>
          <th onclick="sortTable(2)">Status</th>
          <th onclick="sortTable(3)">Entry</th>
          <th onclick="sortTable(4)">Exit</th>
          <th onclick="sortTable(5)">Qty</th>
          <th onclick="sortTable(6)">P&amp;L</th>
          <th onclick="sortTable(7)">R-Mult</th>
          <th>Strategy</th>
          <th onclick="sortTable(9)">Date</th>
          <th>Rating</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="tableBody">
        ${rows}
      </tbody>
    </table>
  </div>

  <div id="lightbox" class="lightbox-overlay" onclick="closeLightbox()">
    <button class="lightbox-close" onclick="closeLightbox()">✕</button>
    <img id="lightboxImg" src="" alt="" onclick="event.stopPropagation()" />
    <div id="lightboxCaption" class="lightbox-caption"></div>
  </div>

  <div class="footer">
    Generated by TradeVault &nbsp;·&nbsp; ${dateStr}
  </div>

  <script>
    function openLightbox(src, caption) {
      document.getElementById('lightboxImg').src = src;
      document.getElementById('lightboxCaption').textContent = caption || '';
      document.getElementById('lightbox').classList.add('open');
    }
    function closeLightbox() {
      document.getElementById('lightbox').classList.remove('open');
      document.getElementById('lightboxImg').src = '';
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeLightbox();
    });

    function toggleDetail(id) {
      const row = document.getElementById('detail-' + id);
      if (!row) return;
      row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }

    function filterTable() {
      const search = document.getElementById('searchInput').value.toLowerCase();
      const side = document.getElementById('sideFilter').value;
      const status = document.getElementById('statusFilter').value;
      const rows = document.querySelectorAll('#tableBody tr.trade-row');
      rows.forEach(function(row) {
        const sym = row.cells[1].textContent.trim().toLowerCase();
        const rowSide = row.cells[0].textContent.trim();
        const rowStatus = row.cells[2].textContent.trim();
        const visible =
          (!search || sym.includes(search)) &&
          (!side || rowSide === side) &&
          (!status || rowStatus === status);
        row.style.display = visible ? '' : 'none';
        const detailId = row.getAttribute('onclick').match(/'([^']+)'/)[1];
        const detail = document.getElementById('detail-' + detailId);
        if (detail) detail.style.display = 'none';
      });
    }

    var sortDir = {};
    function sortTable(col) {
      const tbody = document.getElementById('tableBody');
      const rows = Array.from(tbody.querySelectorAll('tr.trade-row'));
      const dir = sortDir[col] = !(sortDir[col]);
      rows.sort(function(a, b) {
        const av = a.cells[col].textContent.trim();
        const bv = b.cells[col].textContent.trim();
        const an = parseFloat(av.replace(/[^0-9.-]/g, ''));
        const bn = parseFloat(bv.replace(/[^0-9.-]/g, ''));
        if (!isNaN(an) && !isNaN(bn)) return dir ? an - bn : bn - an;
        return dir ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      rows.forEach(function(row) {
        const detailId = row.getAttribute('onclick').match(/'([^']+)'/)[1];
        const detail = document.getElementById('detail-' + detailId);
        tbody.appendChild(row);
        if (detail) tbody.appendChild(detail);
      });
    }
  </script>
</body>
</html>`;
}
