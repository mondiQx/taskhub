import { reactive, ref } from "vue";

// Chrome exposes SpeechRecognition under the webkit-prefixed name.
const SpeechRecognitionCtor: typeof window.SpeechRecognition | undefined =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export function useVoiceCapture(onFinalTranscript: (transcript: string) => void) {
  const supported = Boolean(SpeechRecognitionCtor);
  const recording = ref(false);
  const interimTranscript = ref("");

  let recognition: SpeechRecognition | undefined;

  function start() {
    if (!SpeechRecognitionCtor || recording.value) return;
    recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      interimTranscript.value = interimText;
      if (finalText.trim()) onFinalTranscript(finalText.trim());
    };
    recognition.onend = () => {
      recording.value = false;
      interimTranscript.value = "";
    };

    recognition.start();
    recording.value = true;
  }

  function stop() {
    recognition?.stop();
  }

  // reactive() so nested ref properties (recording, interimTranscript) auto-unwrap in templates.
  return reactive({ supported, recording, interimTranscript, start, stop });
}
