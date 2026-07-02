import { useMemo, useState } from 'react';
import { ExternalLink, FileText, MapPin, X } from 'lucide-react';

function toDriveOrDocsPreviewUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return value;

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host.includes('drive.google.com')) {
      const fileMatch = path.match(/\/file\/d\/([^/]+)/);
      if (fileMatch?.[1]) {
        return `https://drive.google.com/file/d/${fileMatch[1]}/preview`;
      }

      const openId = parsed.searchParams.get('id');
      if (openId) {
        return `https://drive.google.com/file/d/${openId}/preview`;
      }

      if (path.includes('/view')) {
        return value.replace('/view', '/preview');
      }
    }

    if (host.includes('docs.google.com')) {
      const docMatch = path.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);
      if (docMatch?.[1] && docMatch?.[2]) {
        return `https://docs.google.com/${docMatch[1]}/d/${docMatch[2]}/preview`;
      }

      if (path.includes('/edit')) {
        return value.replace('/edit', '/preview');
      }
    }
  } catch {
    return value;
  }

  return value;
}

export default function EsikatseltavaMateriaali({ title, url, description, typeLabel, iconType = 'file' }) {
  const [isOpen, setIsOpen] = useState(false);
  const embedUrl = useMemo(() => toDriveOrDocsPreviewUrl(url), [url]);

  const LeadingIcon = iconType === 'map' ? MapPin : FileText;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group flex w-full items-center justify-between rounded-xl border border-[hsl(var(--border))]/70 bg-[hsl(var(--card))] p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition-all hover:border-[hsl(var(--primary))]/30 hover:bg-[hsl(var(--muted))]/20"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="shrink-0 rounded-lg bg-[hsl(var(--primary))]/10 p-2 transition-colors group-hover:bg-[hsl(var(--primary))]/15">
            <LeadingIcon className="h-5 w-5 text-[hsl(var(--primary))]" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))] transition-colors group-hover:text-[hsl(var(--primary))]">
              {title}
            </p>
            {description && (
              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                {description}
              </p>
            )}
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{typeLabel}</p>
          </div>
        </div>
        <div className="shrink-0 pl-2 text-[hsl(var(--muted-foreground))] transition-colors group-hover:text-[hsl(var(--primary))]">
          <ExternalLink className="h-4 w-4" />
        </div>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-[hsl(var(--background))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b bg-[hsl(var(--muted))]/20 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <LeadingIcon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" />
                <span className="max-w-xs truncate text-sm font-bold sm:max-w-md">{title}</span>
              </div>

              <div className="flex items-center gap-3">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Avaa uuteen välilehteen
                </a>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-[hsl(var(--muted))]/5">
              <iframe
                src={embedUrl}
                className="h-full w-full border-none"
                title={title}
                allow="autoplay"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
