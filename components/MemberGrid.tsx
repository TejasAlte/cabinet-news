'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { House } from '../types';

interface MemberRow {
  id: string;
  full_name: string;
  slug: string;
  house: House;
  photo_url: string | null;
  current_term: string | null;
  party: { name: string; short_name: string } | null;
  state: { name: string } | null;
  constituency: { name: string } | null;
}

export default function MemberGrid({
  house,
  initialMembers,
  initialTotal,
}: {
  house: House;
  initialMembers: MemberRow[];
  initialTotal: number;
}) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(initialTotal);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (loading || members.length >= total) return;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const res = await fetch(`/api/members?house=${house}&page=${nextPage}`);
      const data = await res.json();
      setMembers((prev) => [...prev, ...(data.members ?? [])]);
      setTotal(data.total ?? total);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, [house, loading, members.length, page, total]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {members.map((m) => (
          <Link
            key={m.id}
            href={`/member/${m.slug}`}
            className="card flex items-center gap-4 p-4 hover:border-saffron"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
              {m.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.photo_url} alt={m.full_name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-slate-400">
                  {m.full_name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold text-navy-900">{m.full_name}</p>
              <p className="truncate text-sm text-slate-500">
                {m.party?.short_name ?? 'Independent'} &middot; {m.state?.name ?? '—'}
              </p>
              {m.constituency?.name && (
                <p className="truncate text-xs text-slate-400">{m.constituency.name}</p>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div ref={sentinelRef} className="h-10" />
      {loading && <p className="py-4 text-center text-sm text-slate-400">Loading more members…</p>}
      {!loading && members.length >= total && total > 0 && (
        <p className="py-4 text-center text-sm text-slate-400">
          Showing all {total} members.
        </p>
      )}
      {total === 0 && (
        <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          No members found. Run <code className="rounded bg-slate-200 px-1">npm run seed:members</code> to
          populate the roster.
        </p>
      )}
    </div>
  );
}
