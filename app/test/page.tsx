'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, X, Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

type Step = 'idle' | 'processing' | 'generating' | 'uploading' | 'completed' | 'error';

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

function ImageDropzone({
  label,
  hint,
  file,
  preview,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
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
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors cursor-pointer overflow-hidden',
          preview ? 'border-zinc-300 h-52' : 'border-zinc-200 h-36 hover:border-zinc-400 hover:bg-zinc-50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={label} className="absolute inset-0 w-full h-full object-cover" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null, null); }}
              className="absolute top-2 right-2 z-10 rounded-full bg-white/80 p-1 hover:bg-white shadow"
            >
              <X className="h-3.5 w-3.5 text-zinc-700" />
            </button>
            <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1 text-xs text-white truncate">
              {file?.name}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-400 p-4 text-center">
            <Upload className="h-6 w-6" />
            <span className="text-sm">Drop or click to upload</span>
            <span className="text-xs">{hint}</span>
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

const STEP_LABELS: Record<string, string> = {
  processing: 'Starting...',
  generating: 'Generating try-on...',
  uploading: 'Saving result...',
  completed: 'Done',
  error: 'Failed',
};

export default function TestPage() {
  const [apiKey, setApiKey] = useState('');
  const [itemName, setItemName] = useState('');

  const [personFile, setPersonFile] = useState<File | null>(null);
  const [personPreview, setPersonPreview] = useState<string | null>(null);
  const [clothingFile, setClothingFile] = useState<File | null>(null);
  const [clothingPreview, setClothingPreview] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('idle');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [result, setResult] = useState<SSEEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingId, setProcessingId] = useState('');

  const isRunning = step !== 'idle' && step !== 'completed' && step !== 'error';

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !personFile || !clothingFile || !itemName) return;

    setStep('processing');
    setProgress(0);
    setResult(null);
    setErrorMessage('');
    setProcessingId('');

    try {
      const [personB64, clothingB64] = await Promise.all([
        toBase64(personFile),
        toBase64(clothingFile),
      ]);

      const res = await fetch('/api/v1/try-on', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          person_image: personB64,
          clothing_image: clothingB64,
          item_name: itemName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        setStep('error');
        setErrorMessage(data.error ?? `HTTP ${res.status}`);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            if (event.message) setStatusMessage(event.message);
            setStep(event.step as Step);

            if (event.step === 'completed') {
              setResult(event);
            } else if (event.step === 'error') {
              setErrorMessage(event.error ?? 'Unknown error');
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch (err) {
      setStep('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [apiKey, personFile, clothingFile, itemName]);

  const reset = () => {
    setStep('idle');
    setProgress(0);
    setStatusMessage('');
    setResult(null);
    setErrorMessage('');
    setProcessingId('');
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto max-w-4xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-zinc-900" />
            <span className="font-semibold text-zinc-900">Try-On API Tester</span>
          </div>
          <Badge variant="secondary">Internal</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8 flex flex-col gap-6">

        {/* Config */}
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>POST /api/v1/try-on</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="try-on-form" onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="fre_live_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isRunning}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="item-name">Item Name</Label>
                <Input
                  id="item-name"
                  placeholder="Blue Denim Jacket"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  disabled={isRunning}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <ImageDropzone
                  label="Person Photo"
                  hint="JPEG / PNG / WebP, max 3 MB"
                  file={personFile}
                  preview={personPreview}
                  disabled={isRunning}
                  onChange={(f, p) => { setPersonFile(f); setPersonPreview(p); }}
                />
                <ImageDropzone
                  label="Clothing Photo"
                  hint="JPEG / PNG / WebP, max 3 MB"
                  file={clothingFile}
                  preview={clothingPreview}
                  disabled={isRunning}
                  onChange={(f, p) => { setClothingFile(f); setClothingPreview(p); }}
                />
              </div>

              <Button
                type="submit"
                disabled={isRunning || !apiKey || !personFile || !clothingFile || !itemName}
                className="w-full"
              >
                {isRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                {isRunning ? (STEP_LABELS[step] ?? 'Processing...') : 'Run Try-On'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Progress */}
        {step !== 'idle' && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {step === 'completed' ? 'Completed' : step === 'error' ? 'Error' : 'Processing'}
                </CardTitle>
                {step === 'completed' && <Badge variant="success">Success</Badge>}
                {step === 'error' && <Badge variant="destructive">Failed</Badge>}
                {isRunning && <Badge variant="secondary">{progress}%</Badge>}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {isRunning && (
                <>
                  <Progress value={progress} />
                  {statusMessage && <p className="text-sm text-zinc-500">{statusMessage}</p>}
                </>
              )}

              {step === 'error' && (
                <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-100 p-4">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-red-700">Request failed</p>
                    <p className="text-sm text-red-600">{errorMessage}</p>
                  </div>
                </div>
              )}

              {step === 'completed' && result && (
                <>
                  <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-100 p-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium text-green-800">Try-on complete</p>
                      <p className="text-xs text-green-700">
                        {result.credits_used} credit{result.credits_used !== 1 ? 's' : ''} used · {result.credits_remaining} remaining · {result.processing_time_ms}ms
                      </p>
                    </div>
                  </div>

                  {result.result_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={result.result_url}
                      alt="Try-on result"
                      className="w-full rounded-lg border border-zinc-200 object-contain max-h-[600px]"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-3 text-xs text-zinc-500">
                    {processingId && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-zinc-700">Processing ID</span>
                        <span className="font-mono break-all">{processingId}</span>
                      </div>
                    )}
                    {result.result_url_expires_at && (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-zinc-700">URL expires at</span>
                        <span>{new Date(result.result_url_expires_at).toLocaleTimeString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {result.result_url && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={result.result_url} target="_blank" rel="noopener noreferrer">
                          Open full image
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={reset}>
                      Run again
                    </Button>
                  </div>
                </>
              )}

              {step === 'error' && (
                <Button variant="outline" size="sm" onClick={reset} className="w-fit">
                  Try again
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
