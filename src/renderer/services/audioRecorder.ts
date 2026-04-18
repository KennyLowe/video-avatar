// Browser-API audio capture that lives in the renderer.
//
// MediaRecorder handles the raw capture — Chromium returns Opus-in-WebM by
// default, which we ship across the IPC boundary to main and convert to the
// canonical 48 kHz mono 24-bit WAV via the bundled ffmpeg sidecar.
//
// Web Audio's AnalyserNode drives the live RMS + peak meter and the scrolling
// waveform without blocking the recorder.

export interface RecorderSnapshot {
  /** Normalised 0..1 peak since the last frame. */
  peak: number;
  /** Normalised 0..1 RMS. */
  rms: number;
  /** Copy of the most-recent 1024-sample time-domain buffer, -1..1. */
  waveform: Float32Array;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface AudioRecorderOptions {
  deviceId?: string;
  onSnapshot?: (snap: RecorderSnapshot) => void;
  /** Milliseconds between AnalyserNode samples. Defaults to 50 ms. */
  snapshotIntervalMs?: number;
}

export interface StopResult {
  /** Raw bytes as a base64 string, ready for voices.saveRecording IPC. */
  bytesBase64: string;
  /** Extension hint for ffmpeg on the main side (`webm` in Chromium). */
  sourceExtension: string;
  durationMs: number;
}

export async function enumerateInputDevices(): Promise<AudioDevice[]> {
  // Some browsers return anonymised labels until the first getUserMedia
  // permission prompt has been granted at least once. A cheap approach is to
  // request + immediately release a stream on first call.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((t) => t.stop());
  } catch {
    // Permission denied or no device — fall through; we'll still get an empty
    // list and the UI can display "no microphone found".
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Unnamed microphone' }));
}

export class AudioRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private snapshotTimer: number | null = null;
  private chunks: Blob[] = [];
  private startedAtMs = 0;
  private state: 'idle' | 'recording' | 'paused' = 'idle';

  constructor(private readonly options: AudioRecorderOptions = {}) {}

  getState(): 'idle' | 'recording' | 'paused' {
    return this.state;
  }

  async start(): Promise<void> {
    if (this.state !== 'idle') throw new Error(`Cannot start: recorder is ${this.state}`);

    const constraints: MediaStreamConstraints = this.options.deviceId
      ? { audio: { deviceId: { exact: this.options.deviceId } } }
      : { audio: true };
    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    // MediaRecorder with Opus — default bit-rate is fine; we re-encode on
    // the main side anyway.
    const mimeType = pickSupportedMimeType();
    this.mediaRecorder = new MediaRecorder(this.mediaStream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.mediaRecorder.addEventListener('dataavailable', (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data);
    });

    // Analyser graph for meters.
    const AudioCtx = window.AudioContext;
    this.audioContext = new AudioCtx();
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);

    this.mediaRecorder.start(250 /* ms timeslice */);
    this.startedAtMs = performance.now();
    this.state = 'recording';

    const interval = this.options.snapshotIntervalMs ?? 50;
    this.snapshotTimer = window.setInterval(() => this.sampleSnapshot(), interval);
  }

  pause(): void {
    if (this.state !== 'recording') return;
    this.mediaRecorder?.pause();
    this.state = 'paused';
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.mediaRecorder?.resume();
    this.state = 'recording';
  }

  async stop(): Promise<StopResult> {
    if (this.state === 'idle') throw new Error('Recorder is not running.');
    const endPromise = new Promise<void>((resolve) => {
      this.mediaRecorder?.addEventListener('stop', () => resolve(), { once: true });
    });
    this.mediaRecorder?.stop();
    await endPromise;
    const durationMs = Math.max(0, performance.now() - this.startedAtMs);
    this.teardown();

    const blob = new Blob(this.chunks, { type: this.chunks[0]?.type ?? 'audio/webm' });
    const buf = new Uint8Array(await blob.arrayBuffer());
    const bytesBase64 = uint8ToBase64(buf);
    this.chunks = [];
    this.state = 'idle';
    return {
      bytesBase64,
      sourceExtension: mimeTypeToExt(blob.type),
      durationMs,
    };
  }

  cancel(): void {
    if (this.state === 'idle') return;
    try {
      this.mediaRecorder?.stop();
    } catch {
      // ignore
    }
    this.teardown();
    this.chunks = [];
    this.state = 'idle';
  }

  private sampleSnapshot(): void {
    if (!this.analyser || !this.options.onSnapshot) return;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    let peak = 0;
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const v = buffer[i] ?? 0;
      const abs = v < 0 ? -v : v;
      if (abs > peak) peak = abs;
      sumSquares += v * v;
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    this.options.onSnapshot({ peak, rms, waveform: buffer });
  }

  private teardown(): void {
    if (this.snapshotTimer !== null) {
      window.clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.audioContext?.close();
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.analyser = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaRecorder = null;
  }
}

function pickSupportedMimeType(): string | null {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const mt of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return null;
}

function mimeTypeToExt(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

function uint8ToBase64(bytes: Uint8Array): string {
  // Chunked conversion to avoid "Maximum call stack size exceeded" for
  // multi-minute recordings (String.fromCharCode(...largeArray) splats every
  // byte as an argument).
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
