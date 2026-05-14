'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  Plus,
  Upload,
  Download,
  Search,
  MoreHorizontal,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit3,
  Trash2,
  TrendingUp,
  X,
  CheckSquare,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { generateTradeHtml } from '@/lib/exportHtml';
import Topbar from '@/components/layout/Topbar';
import { useToast } from '@/lib/toast-context';
import { formatCurrency } from '@/lib/calculations';
import { formatDate } from '@/lib/utils';
import styles from './page.module.css';

const PAGE_SIZE = 25;

export default function TradeLogPage() {
  const router = useRouter();
  const toast = useToast();
  const [trades, setTrades] = useState<Record<string, any>[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sideFilter, setSideFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const allSelected = trades.length > 0 && selectedIds.size === trades.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < trades.length;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportHtml = async () => {
    setExporting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/trades/export', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Failed to fetch trades');
      const { data } = await res.json();
      const html = await generateTradeHtml(data, new Date(), window.location.origin);
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('HTML export downloaded');
    } catch {
      toast.error('Failed to export trades');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/trades/export?format=csv', {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trades-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('CSV export downloaded');
    } catch {
      toast.error('Failed to export trades');
    } finally {
      setExporting(false);
    }
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trades.map((t) => t.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/trades/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const deletedCount = selectedIds.size;
        setTrades((prev) => prev.filter((t) => !selectedIds.has(t.id)));
        setTotal((prev) => prev - deletedCount);
        setSelectedIds(new Set());
        toast.success(`Deleted ${deletedCount} trade${deletedCount > 1 ? 's' : ''}`);
      } else {
        toast.error('Failed to delete trades');
      }
    } catch {
      toast.error('Failed to delete trades');
    } finally {
      setBulkDeleting(false);
      setShowBulkConfirm(false);
    }
  };

  // Fetch accounts once on mount
  useEffect(() => {
    apiFetch('/api/accounts').then((r) => r.ok ? r.json() : []).then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchTrades() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.append('search', searchQuery);
        if (sideFilter !== 'ALL') params.append('side', sideFilter);
        if (statusFilter !== 'ALL') params.append('status', statusFilter);
        if (accountFilter !== 'ALL') params.append('accountId', accountFilter);
        params.append('page', String(page));
        params.append('limit', String(PAGE_SIZE));

        const res = await apiFetch(`/api/trades?${params.toString()}`);
        if (res.ok) {
          const json = await res.json();
          setTrades(json.data || []);
          setTotal(json.meta?.total ?? 0);
          setTotalPages(json.meta?.totalPages ?? 1);
        }
      } catch {
        console.error('Failed to fetch trades');
      } finally {
        setLoading(false);
      }
    }

    const debounceTimer = setTimeout(fetchTrades, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, sideFilter, statusFilter, accountFilter, page]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/trades/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        setTrades((prev) => prev.filter((t) => t.id !== deleteId));
        setTotal((prev) => prev - 1);
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(deleteId); return next; });
        toast.success('Trade deleted');
      } else {
        toast.error('Failed to delete trade');
      }
    } catch {
      toast.error('Failed to delete trade');
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <Topbar title="Trade Log" subtitle={loading ? 'Loading...' : `${total} trade${total !== 1 ? 's' : ''}`} />

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <div className={styles.bulkBarLeft}>
            <CheckSquare size={16} className={styles.bulkBarIcon} />
            <span className={styles.bulkBarCount}>{selectedIds.size} selected</span>
          </div>
          <div className={styles.bulkBarActions}>
            <button className={styles.bulkBarClear} onClick={() => setSelectedIds(new Set())}>
              Clear
            </button>
            <button
              className={styles.bulkBarDelete}
              onClick={() => setShowBulkConfirm(true)}
            >
              <Trash2 size={14} />
              Delete {selectedIds.size} trade{selectedIds.size > 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}
      <div className={styles.page}>
        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <div className={styles.searchBox}>
              <Search size={16} />
              <input
                type="text"
                placeholder="Search symbol..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className={styles.searchInput}
              />
            </div>
            <select
              value={sideFilter}
              onChange={(e) => { setSideFilter(e.target.value); setPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">All Sides</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className={styles.filterSelect}
            >
              <option value="ALL">All Status</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
            {accounts.length > 0 && (
              <select
                value={accountFilter}
                onChange={(e) => { setAccountFilter(e.target.value); setPage(1); }}
                className={styles.filterSelect}
              >
                <option value="ALL">All Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className={styles.toolbarRight}>
            <Link href="/dashboard/trades/import" className={styles.importBtn}>
              <Upload size={16} />
              Import CSV
            </Link>
            <button
              className={styles.exportBtn}
              onClick={handleExportCsv}
              disabled={exporting || total === 0}
              title="Export trades as CSV"
            >
              <Download size={16} />
              CSV
            </button>
            <button
              className={styles.exportBtn}
              onClick={handleExportHtml}
              disabled={exporting || total === 0}
              title="Export trades as HTML page"
            >
              <Download size={16} />
              HTML
            </button>
            <Link href="/dashboard/trades/new" className={styles.addBtn}>
              <Plus size={16} />
              New Trade
            </Link>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <colgroup>
                <col style={{ width: '3.5%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '5%' }} />
                <col style={{ width: '8.5%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '7.5%' }} />
                <col style={{ width: '11.5%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className={styles.checkboxCol}></th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Status</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Qty</th>
                  <th>P&L</th>
                  <th>Strategy</th>
                  <th>Date</th>
                  <th>Rating</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className={styles.row}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <td key={j}>
                        <div className={styles.skeleton} style={{ width: j === 0 ? 16 : j === 1 ? 60 : j === 10 ? 70 : 50, height: 16 }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty State */}
        {!loading && trades.length === 0 && (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <TrendingUp size={48} />
            </div>
            <h3 className={styles.emptyTitle}>No trades yet</h3>
            <p className={styles.emptyText}>
              Start logging your trades to track performance and identify patterns.
            </p>
            <Link href="/dashboard/trades/new" className={styles.emptyBtn}>
              <Plus size={16} />
              Log Your First Trade
            </Link>
          </div>
        )}

        {/* Table */}
        {!loading && trades.length > 0 && (
          <>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <colgroup>
                  <col style={{ width: '3.5%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '9%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '5%' }} />
                  <col style={{ width: '8.5%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '11%' }} />
                  <col style={{ width: '7.5%' }} />
                  <col style={{ width: '11.5%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={styles.checkboxCol}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th>Status</th>
                    <th>Entry</th>
                    <th>Exit</th>
                    <th>Qty</th>
                    <th>P&L</th>
                    <th>Strategy</th>
                    <th>Date</th>
                    <th>Rating</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((trade) => (
                    <React.Fragment key={trade.id}>
                    <tr
                      className={`${styles.row} ${selectedIds.has(trade.id) ? styles.rowSelected : ''} ${expandedId === trade.id ? styles.rowExpanded : ''}`}
                      onClick={() => setExpandedId(expandedId === trade.id ? null : trade.id)}
                    >
                      <td className={styles.checkboxCol} onClick={(e) => { e.stopPropagation(); toggleSelect(trade.id); }}>
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={selectedIds.has(trade.id)}
                          onChange={() => toggleSelect(trade.id)}
                        />
                      </td>
                      <td>
                        <span className={styles.symbolLink}>
                          {trade.symbol}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${trade.side === 'LONG' ? 'badge-long' : 'badge-short'}`}>
                          {trade.side}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${trade.status === 'OPEN' ? 'badge-open' : 'badge-closed'}`}>
                          {trade.status}
                        </span>
                      </td>
                      <td className={styles.mono}>${Number(trade.entryPrice).toFixed(2)}</td>
                      <td className={styles.mono}>
                        {trade.exitPrice ? `$${Number(trade.exitPrice).toFixed(2)}` : '—'}
                      </td>
                      <td className={styles.mono}>{Number(trade.quantity)}</td>
                      <td className={styles.mono}>
                        {trade.pnl != null ? (
                          <span className={Number(trade.pnl) >= 0 ? 'pnl-positive' : 'pnl-negative'}>
                            {formatCurrency(Number(trade.pnl))}
                          </span>
                        ) : (
                          <span className="pnl-neutral">—</span>
                        )}
                      </td>
                      <td>
                        {trade.strategy && (
                          <span className={styles.strategyBadge}>{trade.strategy}</span>
                        )}
                      </td>
                      <td className={styles.dateCell}>
                        <span className={styles.dateCellInner}>
                          <Clock size={12} />
                          {trade.status === 'CLOSED' && trade.exitDate
                            ? formatDate(trade.exitDate, 'MM/dd HH:mm')
                            : formatDate(trade.entryDate, 'MM/dd HH:mm')}
                        </span>
                      </td>
                      <td>
                        {trade.rating > 0 ? (
                          <div className={styles.stars}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <span
                                key={s}
                                className={s <= trade.rating ? styles.starFilled : styles.starEmpty}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className={styles.noRating}>—</span>
                        )}
                      </td>
                      <td>
                        <div className={styles.actionCell}>
                          <ChevronDown
                            size={14}
                            className={`${styles.expandIcon} ${expandedId === trade.id ? styles.expandIconOpen : ''}`}
                          />
                          <div className={styles.menuWrapper} ref={openMenuId === trade.id ? menuRef : null}>
                            <button
                              className={styles.moreBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (openMenuId === trade.id) {
                                  setOpenMenuId(null);
                                } else {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                                  setOpenMenuId(trade.id);
                                }
                              }}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {openMenuId === trade.id && (
                              <div className={styles.dropdown} style={{ top: menuPos.top, right: menuPos.right }}>
                                <button
                                  className={styles.dropdownItem}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/dashboard/trades/${trade.id}`);
                                    setOpenMenuId(null);
                                  }}
                                >
                                  <Eye size={14} /> View Details
                                </button>
                                <button
                                  className={styles.dropdownItem}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/dashboard/trades/${trade.id}/edit`);
                                    setOpenMenuId(null);
                                  }}
                                >
                                  <Edit3 size={14} /> Edit Trade
                                </button>
                                <div className={styles.dropdownDivider} />
                                <button
                                  className={`${styles.dropdownItem} ${styles.dropdownDanger}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteId(trade.id);
                                    setOpenMenuId(null);
                                  }}
                                >
                                  <Trash2 size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>

                    {/* Expandable detail row */}
                    {expandedId === trade.id && (
                      <tr className={styles.expandRow} key={`${trade.id}-expand`}>
                        <td colSpan={12} className={styles.expandCell}>
                          <div className={styles.expandContent}>
                            {/* Notes & Analysis */}
                            <div className={styles.expandSection}>
                              {trade.setupDescription && (
                                <div className={styles.expandBlock}>
                                  <span className={styles.expandLabel}>Setup</span>
                                  <p className={styles.expandText}>{trade.setupDescription}</p>
                                </div>
                              )}
                              {trade.notes && (
                                <div className={styles.expandBlock}>
                                  <span className={styles.expandLabel}>Notes</span>
                                  <p className={styles.expandText}>{trade.notes}</p>
                                </div>
                              )}
                              {trade.mistakes && (
                                <div className={styles.expandBlock}>
                                  <span className={styles.expandLabel}>Mistakes</span>
                                  <p className={styles.expandText}>{trade.mistakes}</p>
                                </div>
                              )}
                              {trade.lessons && (
                                <div className={styles.expandBlock}>
                                  <span className={styles.expandLabel}>Lessons</span>
                                  <p className={styles.expandText}>{trade.lessons}</p>
                                </div>
                              )}
                              {!trade.setupDescription && !trade.notes && !trade.mistakes && !trade.lessons && (
                                <span className={styles.expandEmpty}>No notes for this trade.</span>
                              )}
                            </div>

                            {/* Images & Charts */}
                            {trade.images && trade.images.length > 0 && (
                              <div className={styles.expandImages}>
                                {trade.images.map((img: any) => (
                                  img.type === 'tradingview' ? (
                                    <div key={img.id} className={styles.expandTvCard}>
                                      <ExternalLink size={14} />
                                      <a href={img.url} target="_blank" rel="noopener noreferrer" className={styles.expandTvLink}>
                                        {img.caption || 'TradingView Chart'}
                                      </a>
                                    </div>
                                  ) : (
                                    <button
                                      key={img.id}
                                      className={styles.expandThumbBtn}
                                      onClick={(e) => { e.stopPropagation(); setLightboxUrl(img.url); }}
                                    >
                                      <img src={img.url} alt={img.caption || ''} className={styles.expandThumb} />
                                    </button>
                                  )
                                ))}
                              </div>
                            )}

                            {/* Quick actions */}
                            <div className={styles.expandActions}>
                              <button
                                className={styles.expandActionBtn}
                                onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/trades/${trade.id}`); }}
                              >
                                <Eye size={13} /> Full Detail
                              </button>
                              <button
                                className={styles.expandActionBtn}
                                onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/trades/${trade.id}/edit`); }}
                              >
                                <Edit3 size={13} /> Edit
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 0 && (
              <div className={styles.pagination}>
                <span className={styles.pageInfo}>
                  Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total}
                </span>
                <div className={styles.pageButtons}>
                  <button
                    className={styles.pageBtn}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    // Show pages around current page
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                      if (i === 6) pageNum = totalPages;
                    } else if (page >= totalPages - 3) {
                      pageNum = i === 0 ? 1 : totalPages - 6 + i;
                    } else {
                      const nums = [1, page - 2, page - 1, page, page + 1, page + 2, totalPages];
                      pageNum = nums[i]!;
                    }
                    const showEllipsisBefore = i === 1 && pageNum > 2;
                    const showEllipsisAfter = i === 5 && pageNum < totalPages - 1;
                    return (
                      <React.Fragment key={i}>
                        {showEllipsisBefore && <span className={styles.pageEllipsis}>…</span>}
                        <button
                          className={`${styles.pageBtn} ${pageNum === page ? styles.pageBtnActive : ''}`}
                          onClick={() => setPage(pageNum)}
                        >
                          {pageNum}
                        </button>
                        {showEllipsisAfter && <span className={styles.pageEllipsis}>…</span>}
                      </React.Fragment>
                    );
                  })}
                  <button
                    className={styles.pageBtn}
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className={styles.overlay} onClick={() => !deleting && setDeleteId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => !deleting && setDeleteId(null)}>
              <X size={18} />
            </button>
            <div className={styles.modalIcon}>
              <Trash2 size={28} />
            </div>
            <h3 className={styles.modalTitle}>Delete Trade</h3>
            <p className={styles.modalText}>
              Are you sure you want to delete this trade? This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setDeleteId(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className={styles.modalDelete}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Trade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkConfirm && (
        <div className={styles.overlay} onClick={() => !bulkDeleting && setShowBulkConfirm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.modalClose} onClick={() => !bulkDeleting && setShowBulkConfirm(false)}>
              <X size={18} />
            </button>
            <div className={styles.modalIcon}>
              <Trash2 size={28} />
            </div>
            <h3 className={styles.modalTitle}>Delete {selectedIds.size} Trade{selectedIds.size > 1 ? 's' : ''}</h3>
            <p className={styles.modalText}>
              Are you sure you want to delete {selectedIds.size} selected trade{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.modalCancel}
                onClick={() => setShowBulkConfirm(false)}
                disabled={bulkDeleting}
              >
                Cancel
              </button>
              <button
                className={styles.modalDelete}
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size} Trade${selectedIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxUrl(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightboxUrl(null)}>
            <X size={22} />
          </button>
          <img
            src={lightboxUrl}
            alt="Trade screenshot"
            className={styles.lightboxImg}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
