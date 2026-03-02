'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ImageIcon,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FlaskConical,
  ExternalLink,
  Copy,
  Check,
  Coins,
  Clock,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type RunStep = 'idle' | 'processing' | 'generating' | 'uploading' | 'completed' | 'error';

interface SSEEvent {
  step: string;
  progress?: number;
  message?: string;
  processing_id?: string;
  result_url?: string;
  result_url_expires_at?: string;
  credits_used?: number;
  credits_remaining?: number;
  processing_time_ms?: number;
  error?: string;
}

const STEP_META: Record<string, { label: string }> = {
  processing: { label: 'Starting up…' },
  generating: { label: 'Generating try-on…' },
  uploading:  { label: 'Saving result…' },
  completed:  { label: 'Done' },
  error:      { label: 'Failed' },
};

// ── Image dropzone ─────────────────────────────────────────────────────────────

function Dropzone({
  label,
  sublabel,
  file,
  preview,
  onChange,
  disabled,
}: {
  label: string;
  sublabel: string;
  file: File | null;
  preview: string | null;
  onChange: (file: File | null, preview: string | null) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange(f, reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('image/')) handleFile(f);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors overflow-hidden select-none',
          preview ? 'h-56 border-border' : 'h-40 border-border hover:border-primary/50 hover:bg-muted/50',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={label} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
              className="absolute top-2 right-2 z-10 rounded-full bg-background/80 backdrop-blur-sm p-1 hover:bg-background shadow-sm border border-border transition-colors"
            >
              <X className="h-3 w-3 text-foreground" />
            </button>
            <div className="absolute bottom-0 inset-x-0 bg-black/50 backdrop-blur-sm px-2 py-1">
              <p className="text-xs text-white truncate">{file?.name}</p>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <div className="rounded-full bg-muted p-2">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Drop image or click</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold truncate">{value}</p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TestPage() {
  const [apiKey, setApiKey]     = useState('');
  const [itemName, setItemName] = useState('');

  const [personFile, setPersonFile]           = useState<File | null>(null);
  const [personPreview, setPersonPreview]     = useState<string | null>(null);
  const [clothingFile, setClothingFile]       = useState<File | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);

  const [step, setStep]                 = useState<RunStep>('idle');
  const [progress, setProgress]         = useState(0);
  const [result, setResult]             = useState<SSEEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingId, setProcessingId] = useState('');
  const [copiedId, setCopiedId]         = useState(false);

  const isRunning = step !== 'idle' && step !== 'completed' && step !== 'error';
  const canRun    = !!apiKey && !!personFile && !!clothingFile && !!itemName && !isRunning;

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const copyId = () => {
    if (!processingId) return;
    navigator.clipboard.writeText(processingId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 1500);
  };

  const reset = () => {
    setStep('idle');
    setProgress(0);
    setResult(null);
    setErrorMessage('');
    setProcessingId('');
  };

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canRun) return;

    setStep('processing');
    setProgress(10);
    setResult(null);
    setErrorMessage('');
    setProcessingId('');

    try {
      const [personB64, clothingB64] = await Promise.all([
        toBase64(personFile!),
        toBase64(clothingFile!),
      ]);

      const res = await fetch('/api/v1/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ person_image: personB64, clothing_image: clothingB64, item_name: itemName }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setStep('error');
        setErrorMessage(data.error ?? `HTTP ${res.status}`);
        return;
      }

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event: SSEEvent = JSON.parse(line.slice(6));
            if (event.processing_id) setProcessingId(event.processing_id);
            if (event.progress !== undefined) setProgress(event.progress);
            setStep(event.step as RunStep);
            if (event.step === 'completed') setResult(event);
            if (event.step === 'error')     setErrorMessage(event.error ?? 'Unknown error');
          } catch { /* ignore malformed lines */ }
        }
      }
    } catch (err) {
      setStep('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, personFile, clothingFile, itemName, canRun]);

  const stepMeta = STEP_META[step];

  return (
    <div className="min-h-screen bg-muted/40">

      {/* Header */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur-sm px-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <span className="font-semibold tracking-tight">API Tester</span>
        </div>
        <Badge variant="secondary" className="text-xs">Internal</Badge>
        <div className="ml-auto text-xs text-muted-foreground font-mono">POST /api/v1/try-on</div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">

          {/* ── Left: inputs ── */}
          <div className="flex flex-col gap-4">

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Request</CardTitle>
                <CardDescription>Authentication and clothing item details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="fre_live_…"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isRunning}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-name">Item Name</Label>
                  <Input
                    id="item-name"
                    placeholder="Blue Denim Jacket"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    disabled={isRunning}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-base">Images</CardTitle>
                <CardDescription>JPEG · PNG · WebP — max 3 MB each</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Dropzone
                  label="Person photo"
                  sublabel="Full-body or upper-body photo"
                  file={personFile}
                  preview={personPreview}
                  disabled={isRunning}
                  onChange={(f, p) => { setPersonFile(f); setPersonPreview(p); }}
                />
                <Dropzone
                  label="Clothing photo"
                  sublabel="Flat lay or on hanger preferred"
                  file={clothingFile}
                  preview={clothingPreview}
                  disabled={isRunning}
                  onChange={(f, p) => { setClothingFile(f); setClothingPreview(p); }}
                />
              </CardContent>
            </Card>

            <form onSubmit={handleSubmit}>
              <Button type="submit" className="w-full" disabled={!canRun} size="lg">
                {isRunning && <Loader2 className="animate-spin" />}
                {isRunning ? (stepMeta?.label ?? 'Processing…') : 'Run Try-On'}
              </Button>
            </form>
          </div>

          {/* ── Right: result ── */}
          <div className="flex flex-col gap-4">
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Result</CardTitle>
                  <CardDescription>
                    {step === 'idle'      && 'Result will appear here after running'}
                    {isRunning            && (stepMeta?.label ?? 'Processing…')}
                    {step === 'completed' && 'Try-on complete'}
                    {step === 'error'     && 'Request failed'}
                  </CardDescription>
                </div>
                {step === 'completed' && <Badge variant="success">Success</Badge>}
                {step === 'error'     && <Badge variant="destructive">Error</Badge>}
                {isRunning            && <Badge variant="secondary">{progress}%</Badge>}
              </CardHeader>
              <CardContent className="p-0">

                {step === 'idle' && (
                  <div className="flex flex-col items-center justify-center gap-3 border-t bg-muted/30 h-80 text-muted-foreground">
                    <ImageIcon className="h-10 w-10 opacity-25" />
                    <p className="text-sm">No result yet</p>
                  </div>
                )}

                {isRunning && (
                  <div className="flex flex-col items-center justify-center gap-5 border-t bg-muted/30 h-80 px-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <div className="w-full space-y-2">
                      <Progress value={progress} />
                      <p className="text-xs text-center text-muted-foreground">{stepMeta?.label}</p>
                    </div>
                  </div>
                )}

                {step === 'error' && (
                  <div className="border-t p-6 space-y-4">
                    <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-destructive">Request failed</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{errorMessage}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={reset}>
                      Try again
                    </Button>
                  </div>
                )}

                {step === 'completed' && result && (
                  <>
                    {result.result_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={result.result_url}
                        alt="Try-on result"
                        className="w-full object-contain max-h-[480px] border-t"
                      />
                    )}
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                        <p className="text-sm text-green-800 font-medium">Generated successfully</p>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <StatChip icon={Coins} label="Credits used"  value={String(result.credits_used ?? '—')} />
                        <StatChip icon={Coins} label="Remaining"     value={String(result.credits_remaining ?? '—')} />
                        <StatChip icon={Clock} label="Time"          value={result.processing_time_ms ? `${(result.processing_time_ms / 1000).toFixed(1)}s` : '—'} />
                      </div>

                      {processingId && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground font-medium">Processing ID</span>
                          </div>
                          <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
                            <code className="flex-1 text-xs font-mono text-foreground break-all">{processingId}</code>
                            <button
                              type="button"
                              onClick={copyId}
                              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {copiedId
                                ? <Check className="h-4 w-4 text-green-600" />
                                : <Copy className="h-4 w-4" />
                              }
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {result.result_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={result.result_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink />
                              Open full image
                            </a>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={reset}>
                          Run again
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

        </div>
      </main>
    </div>
  );
}
