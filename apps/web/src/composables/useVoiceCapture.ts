import { reactive, ref } from "vue";

// Chrome exposes SpeechRecognition under the webkit-prefixed name.
const SpeechRecognitionCtor: typeof window.SpeechRecognition | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

// Fires once, with the full accumulated transcript, whenever recognition ends —
// whether the user clicked stop or the browser ended it on its own (mobile browsers
// commonly do this after a brief pause) — rather than per browser-detected "final"
// chunk, since the Web Speech API treats any pause as final.
export function useVoiceCapture(onStopped: (transcript: string) => void) {
  const supported = Boolean(SpeechRecognitionCtor);
  const recording = ref(false);
  const interimTranscript = ref("");
  const error = ref<string | null>(null);

  let recognition: SpeechRecognition | undefined;
  let finalSegments: string[] = [];

  function start() {
    if (!SpeechRecognitionCtor || recording.value) return;
    error.value = null;
    // SpeechRecognition (like getUserMedia) only works in a secure context —
    // https:// or localhost. Served over plain http:// (e.g. a Tailscale IP/
    // hostname without TLS), the browser silently refuses to even show the
    // mic permission prompt, which looks identical to a broken mic.
    if (!window.isSecureContext) {
      error.value = "Voice input needs a secure connection (https). This page was loaded over plain http.";
      return;
    }
    finalSegments = [];
    recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      // On mobile Chrome, event.results can contain multiple "final" entries that are
      // each a growing re-hypothesis of the SAME utterance ("assign" / "assign ticket"
      // / "assign ticket to adonis") rather than genuinely separate phrases — joining
      // every final entry duplicates the whole thing. Collapse a final entry into the
      // previous one whenever one is a prefix of the other (same utterance, revised);
      // only entries that aren't prefix-related are treated as a distinct new phrase.
      let interimText = "";
      const segments: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) {
          interimText += result[0].transcript;
          continue;
        }
        const text = result[0].transcript.trim();
        if (!text) continue;
        const prev = segments[segments.length - 1];
        if (prev && (text.startsWith(prev) || prev.startsWith(text))) {
          segments[segments.length - 1] = text.length > prev.length ? text : prev;
        } else {
          segments.push(text);
        }
      }
      finalSegments = segments;
      interimTranscript.value = interimText;
    };
    // The lib.dom types this project uses don't declare onerror/error on
    // SpeechRecognition, though every implementing browser supports it.
    (recognition as any).onerror = (event: { error: string }) => {
      error.value =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. Check your browser/site permissions."
          : `Voice input error: ${event.error}`;
    };
    recognition.onend = () => {
      recording.value = false;
      interimTranscript.value = "";
      // Mobile browsers frequently end recognition on their own (e.g. after a brief
      // pause) well before the user meant to stop — commit whatever was captured
      // either way, instead of only on an explicit stop(), or it's silently lost.
      const transcript = finalSegments.join(" ").trim();
      if (transcript) onStopped(transcript);
    };

    try {
      recognition.start();
      recording.value = true;
    } catch {
      error.value = "Couldn't start voice input.";
    }
  }

  function stop() {
    recognition?.stop();
  }

  // reactive() so nested ref properties (recording, interimTranscript) auto-unwrap in templates.
  return reactive({ supported, recording, interimTranscript, error, start, stop });
}
