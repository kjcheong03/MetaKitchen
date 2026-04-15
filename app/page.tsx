"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { SimliClient } from "simli-client";

type Message = { role: "user" | "assistant"; content: string };
type GeminiMsg = { role: "user" | "model"; parts: [{ text: string }] };
type Status = "idle" | "connecting" | "ready" | "speaking" | "thinking" | "listening";

// ── Languages ────────────────────────────────────────────────────
const LANGUAGES = [
  { id: "en",    sarvamCode: "en-IN", ttsCode: "en-IN", label: "English",  nativeLabel: "English"  },
  { id: "hi",    sarvamCode: "hi-IN", ttsCode: "hi-IN", label: "Hindi",    nativeLabel: "हिन्दी"     },
  { id: "hi-en", sarvamCode: "hi-IN", ttsCode: "hi-IN", label: "Hinglish", nativeLabel: "Hinglish"  },
  { id: "ta",    sarvamCode: "ta-IN", ttsCode: "ta-IN", label: "Tamil",    nativeLabel: "தமிழ்"      },
  { id: "te",    sarvamCode: "te-IN", ttsCode: "te-IN", label: "Telugu",   nativeLabel: "తెలుగు"     },
  { id: "bn",    sarvamCode: "bn-IN", ttsCode: "bn-IN", label: "Bengali",  nativeLabel: "বাংলা"      },
  { id: "kn",    sarvamCode: "kn-IN", ttsCode: "kn-IN", label: "Kannada",  nativeLabel: "ಕನ್ನಡ"      },
  { id: "mr",    sarvamCode: "mr-IN", ttsCode: "mr-IN", label: "Marathi",  nativeLabel: "मराठी"      },
] as const;
type Lang = typeof LANGUAGES[number];

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const simliRef = useRef<SimliClient | null>(null);
  const isStartingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [statusText, setStatusText] = useState("Click 'Start Session' to meet Dr Aara");
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatHistory, setChatHistory] = useState<GeminiMsg[]>([]);
  const [inputText, setInputText] = useState("");
  const [language, setLanguage] = useState<Lang>(LANGUAGES[0]);
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Simli session ──────────────────────────────────────────────
  const startSession = useCallback(async () => {
    if (isStartingRef.current || !videoRef.current || !audioRef.current) return;
    isStartingRef.current = true;

    if (simliRef.current) {
      try { await simliRef.current.stop(); } catch { /* ignore */ }
      simliRef.current = null;
    }

    sessionIdRef.current = crypto.randomUUID();
    setStatus("connecting");
    setStatusText("Connecting to Dr Aara...");

    try {
      const res = await fetch("/api/simli-token", { method: "POST" });
      const { session_token, error } = await res.json();
      if (error) throw new Error(error);

      const client = new SimliClient(session_token, videoRef.current, audioRef.current, null, undefined, "livekit");

      client.on("start", () => { setIsConnected(true); setStatus("ready"); setStatusText("Ask Dr Aara anything below, or use the mic"); });
      client.on("speaking", () => { setStatus("speaking"); setStatusText("Dr Aara is speaking..."); });
      client.on("silent", () => { setStatus("ready"); setStatusText("Ask Dr Aara anything below, or use the mic"); });
      client.on("error", (msg: string) => { console.error(msg); setStatus("idle"); setIsConnected(false); setStatusText("Connection error — please restart"); isStartingRef.current = false; });
      client.on("startup_error", (msg: string) => { console.error(msg); setStatus("idle"); setIsConnected(false); setStatusText(`Startup failed: ${msg}`); isStartingRef.current = false; });

      simliRef.current = client;
      await client.start();
    } catch (err) {
      console.error(err);
      setStatusText(`Failed: ${err instanceof Error ? err.message : "unknown error"}`);
      setStatus("idle");
      setIsConnected(false);
      simliRef.current = null;
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  const stopSession = useCallback(async () => {
    if (simliRef.current) { try { await simliRef.current.stop(); } catch { /* ignore */ } simliRef.current = null; }
    isStartingRef.current = false;
    setIsConnected(false);
    setStatus("idle");
    setStatusText("Click 'Start Session' to meet Dr Aara");
  }, []);

  useEffect(() => {
    return () => { simliRef.current?.stop().catch(() => {}); simliRef.current = null; };
  }, []);

  // ── Core pipeline: text → Gemini → Sarvam TTS → Simli ─────────
  const processText = useCallback(async (userText: string) => {
    if (!userText.trim() || !isConnected) return;

    setMessages(prev => [...prev, { role: "user", content: userText }]);
    setStatus("thinking");
    setStatusText("Thinking...");

    try {
      // 1. Gemini
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history: chatHistory, languageId: language.id, sessionId: sessionIdRef.current }),
      });
      const { reply, error: chatErr } = await chatRes.json();
      if (chatErr || !reply) throw new Error(chatErr ?? "No reply");

      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      setChatHistory(prev => [...prev,
        { role: "user" as const, parts: [{ text: userText }] },
        { role: "model" as const, parts: [{ text: reply }] },
      ]);

      // 2. Sarvam TTS
      const ttsRes = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply, languageCode: language.ttsCode }),
      });
      const { audio, error: ttsErr } = await ttsRes.json();
      if (ttsErr || !audio) throw new Error(ttsErr ?? "No audio");

      // 3. WAV → PCM16 → Simli
      await sendAudioToSimli(audio);
    } catch (err) {
      console.error(err);
      setStatusText("Something went wrong. Try again.");
      setStatus("ready");
    }
  }, [isConnected, chatHistory, language]);

  const sendAudioToSimli = useCallback(async (base64Wav: string) => {
    if (!simliRef.current) return;
    const bin = atob(base64Wav);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const ctx = new AudioContext({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(bytes.buffer);
    const float32 = decoded.getChannelData(0);
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const c = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = c < 0 ? c * 32768 : c * 32767;
    }
    const uint8 = new Uint8Array(pcm16.buffer);
    for (let i = 0; i < uint8.length; i += 6000) {
      simliRef.current.sendAudioData(uint8.slice(i, i + 6000));
      await new Promise(r => setTimeout(r, 50));
    }
    await ctx.close();
  }, []);

  // ── Text submit ────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText("");
    await processText(text);
  }, [inputText, processText]);

  // ── Convert audio blob → WAV (Sarvam requires wav/mp3/ogg) ───
  const toWav = useCallback(async (blob: Blob): Promise<Blob> => {
    const arrayBuffer = await blob.arrayBuffer();
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();

    const numChannels = 1;
    const sampleRate = 16000;
    const float32 = decoded.getChannelData(0);

    // Resample if needed
    let samples: Float32Array;
    if (decoded.sampleRate !== sampleRate) {
      const ratio = decoded.sampleRate / sampleRate;
      const newLen = Math.round(float32.length / ratio);
      samples = new Float32Array(newLen);
      for (let i = 0; i < newLen; i++) samples[i] = float32[Math.round(i * ratio)];
    } else {
      samples = float32;
    }

    // Float32 → PCM16
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const c = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = c < 0 ? c * 32768 : c * 32767;
    }

    // Write WAV
    const dataLen = pcm.byteLength;
    const buf = new ArrayBuffer(44 + dataLen);
    const view = new DataView(buf);
    const write = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    write(0, "RIFF"); view.setUint32(4, 36 + dataLen, true); write(8, "WAVE");
    write(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, dataLen, true);
    new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
    return new Blob([buf], { type: "audio/wav" });
  }, []);

  // ── Mic ────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!isConnected || isRecording || status === "thinking" || status === "speaking") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatus("listening");
      setStatusText("Listening...");
    } catch { setStatusText("Mic access denied"); }
  }, [isConnected, isRecording, status]);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || !isRecording) return;
    return new Promise<void>(resolve => {
      const recorder = mediaRecorderRef.current!;
      recorder.onstop = async () => {
        const rawBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach(t => t.stop());
        setIsRecording(false);
        setStatus("thinking");
        setStatusText("Transcribing...");

        if (rawBlob.size < 1000) {
          setStatusText("Too short — try again");
          setStatus("ready");
          resolve();
          return;
        }

        try {
          const wavBlob = await toWav(rawBlob);
          const form = new FormData();
          form.append("audio", wavBlob, "rec.wav");
          form.append("language_code", language.sarvamCode);
          const sttRes = await fetch("/api/stt", { method: "POST", body: form });
          const { transcript, error } = await sttRes.json() as { transcript?: string; error?: string };
          if (error || !transcript?.trim()) {
            console.error("[STT] error:", error);
            setStatusText("Couldn't hear that — try again");
            setStatus("ready");
          } else {
            await processText(transcript);
          }
        } catch (err) {
          console.error("[STT] conversion failed:", err);
          setStatusText("Mic error — try again");
          setStatus("ready");
        }
        resolve();
      };
      recorder.stop();
    });
  }, [isRecording, processText]);

  return (
    <main className="h-screen flex flex-col overflow-hidden" style={{ background: "#f0f2f5" }}>

      {/* ── Full-width teal header ──────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 relative" style={{ background: "#075e54" }}>
        <div className="relative">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#128c7e" }}>
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#075e54] ${isConnected ? "bg-[#25d366]" : "bg-gray-400"}`} />
        </div>
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">Dr Aara</p>
          <p className="text-[#b2dfdb] text-xs">{isConnected ? "online" : "offline"}</p>
        </div>

        {/* Language selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white transition-colors"
            style={{ background: "#128c7e" }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
            </svg>
            {language.nativeLabel}
          </button>

          {showLangMenu && (
            <>
              {/* Backdrop */}
              <div className="fixed inset-0 z-10" onClick={() => setShowLangMenu(false)} />
              {/* Dropdown */}
              <div className="absolute right-0 top-full mt-2 w-44 rounded-xl shadow-xl overflow-hidden z-20" style={{ background: "#fff" }}>
                {LANGUAGES.map(lang => (
                  <button key={lang.id}
                    onClick={() => { setLanguage(lang); setShowLangMenu(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors"
                    style={{ color: lang.id === language.id ? "#075e54" : "#111b21" }}>
                    <span>{lang.label}</span>
                    <span className="text-xs" style={{ color: "#8696a0" }}>{lang.nativeLabel}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Body (avatar + chat side by side) ──────────────────── */}
      <div className="flex flex-1 overflow-hidden">

      {/* ── Left panel — Avatar ─────────────────────────────────── */}
      <div className="flex flex-col w-[340px] flex-shrink-0" style={{ borderRight: "1px solid #d1d7db" }}>

        {/* Grey background for left panel */}
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 py-8"
          style={{ background: "#f0f2f5" }}>

          <div className="relative">
            <div className={`w-72 h-72 rounded-full overflow-hidden shadow-xl border-4 transition-all duration-500 ${
              status === "speaking" ? "border-[#25d366]" : "border-white"
            }`}>
              {/* Placeholder shown when not connected */}
              <div className={`absolute inset-0 flex items-center justify-center bg-[#dfe5e7] transition-opacity duration-500 ${isConnected ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
                <svg className="w-28 h-28 text-[#adb5bd]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                </svg>
              </div>
              {/* Video always mounted so Simli can attach */}
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            </div>
            {status === "speaking" && (
              <div className="absolute inset-0 rounded-full border-4 border-[#25d366]/40 animate-ping pointer-events-none" />
            )}
          </div>

          <audio ref={audioRef} autoPlay className="hidden" />

          <p className="text-[#54656f] text-xs text-center">{isConnected ? statusText : "Your Health Companion"}</p>

          {/* Connect / controls */}
          {!isConnected ? (
            <button onClick={startSession} disabled={status === "connecting"}
              className="w-full py-3 rounded-full text-white font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: "#25d366" }}>
              {status === "connecting"
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Connecting...</>
                : "Start Session"}
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3 w-full">
              <button
                onMouseDown={startRecording} onMouseUp={stopRecording}
                onTouchStart={startRecording} onTouchEnd={stopRecording}
                disabled={status === "thinking" || status === "speaking"}
                className="w-16 h-16 rounded-full flex items-center justify-center shadow-md transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: isRecording ? "#e53e3e" : "#25d366" }}>
                {isRecording
                  ? <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6"/></svg>
                  : <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>}
              </button>
              <p className="text-[#54656f] text-xs">{isRecording ? "Release to send" : "Hold to speak"}</p>
              <button onClick={() => void stopSession()} className="text-xs text-[#8696a0] hover:text-[#54656f] transition-colors mt-1">End Session</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel — Chat ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Messages — WhatsApp wallpaper bg */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1"
          style={{ background: "#efeae2", backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c8c0b4' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
              <div className="bg-white/80 rounded-2xl px-6 py-4 text-center shadow-sm max-w-xs">
                <p className="text-[#54656f] text-sm font-medium mb-1">Hi, I&apos;m Dr Aara</p>
                <p className="text-[#8696a0] text-xs leading-relaxed">
                  Start a session, then type or hold the mic to speak. I understand English and Hindi.
                </p>
              </div>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                {["My blood sugar has been high lately", "What foods spike insulin resistance?", "Help me understand my metabolic health"].map(p => (
                  <button key={p} onClick={() => { if (isConnected) void processText(p); }}
                    disabled={!isConnected}
                    className="px-4 py-2.5 rounded-xl bg-white/80 shadow-sm text-[#54656f] text-xs text-left hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    &ldquo;{p}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-1`}>
              <div className={`max-w-[70%] px-3 py-2 rounded-lg shadow-sm text-sm leading-relaxed relative ${
                msg.role === "user"
                  ? "rounded-tr-none text-[#111b21]"
                  : "rounded-tl-none text-[#111b21]"
              }`}
                style={{ background: msg.role === "user" ? "#dcf8c6" : "#ffffff" }}>
                {msg.content}
              </div>
            </div>
          ))}

          {status === "thinking" && (
            <div className="flex justify-start mb-1">
              <div className="px-4 py-3 rounded-lg rounded-tl-none shadow-sm" style={{ background: "#ffffff" }}>
                <div className="flex gap-1 items-center">
                  <div className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 rounded-full bg-[#8696a0] animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input bar */}
        <div className="px-3 py-2 flex items-center gap-2" style={{ background: "#f0f2f5" }}>
          <div className="flex-1 flex items-center rounded-full px-4 py-2 gap-2" style={{ background: "#ffffff" }}>
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
              placeholder={isConnected ? "Type a message" : "Start a session first..."}
              disabled={!isConnected || status === "thinking" || status === "speaking"}
              className="flex-1 bg-transparent text-sm text-[#111b21] placeholder-[#8696a0] focus:outline-none disabled:opacity-50"
            />
          </div>
          <button
            onClick={() => void handleSend()}
            disabled={!isConnected || !inputText.trim() || status === "thinking" || status === "speaking"}
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            style={{ background: "#25d366" }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
      </div>{/* end body */}
    </main>
  );
}
