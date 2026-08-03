import { reactive, ref } from "vue";

// Chrome exposes SpeechRecognition under the webkit-prefixed name.
const SpeechRecognitionCtor: typeof window.SpeechRecognition | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

// Fires once, with the full accumulated transcript, only when the user explicitly
// stops recording — not per browser-detected "final" chunk. The Web Speech API treats
// any pause as final, so submitting per-chunk would cut the user off mid-thought.
export function useVoiceCapture(onStopped: (transcript: string) => void) {
  const supported = Boolean(SpeechRecognitionCtor);
  const recording = ref(false);
  const interimTranscript = ref("");

  let recognition: SpeechRecognition | undefined;
  let finalSegments: string[] = [];
  let stoppedManually = false;

  function start() {
    if (!SpeechRecognitionCtor || recording.value) return;
    finalSegments = [];
    stoppedManually = false;
    recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalSegments.push(result[0].transcript);
        else interimText += result[0].transcript;
      }
      interimTranscript.value = interimText;
    };
    recognition.onend = () => {
      recording.value = false;
      interimTranscript.value = "";
      // The API can end on its own (e.g. long silence) without the user clicking stop;
      // only hand off the transcript when they actually asked to stop.
      if (stoppedManually) {
        const transcript = finalSegments.join(" ").trim();
        if (transcript) onStopped(transcript);
      }
    };

    recognition.start();
    recording.value = true;
  }

  function stop() {
    stoppedManually = true;
    recognition?.stop();
  }

  // reactive() so nested ref properties (recording, interimTranscript) auto-unwrap in templates.
  return reactive({ supported, recording, interimTranscript, start, stop });
}
