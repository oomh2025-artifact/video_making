import { useState, useCallback } from "react";
import type { SlidesData } from "./types/slides";
import SetupPage from "./pages/SetupPage";
import EditorPage from "./pages/EditorPage";

type Page = "setup" | "editor";

export default function App() {
  const [page, setPage] = useState<Page>("setup");
  const [slidesData, setSlidesData] = useState<SlidesData | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);

  const handleSetupComplete = useCallback((data: SlidesData, audio: File | null) => {
    setSlidesData(data);
    setAudioFile(audio);
    setPage("editor");
  }, []);

  const handleBack = useCallback(() => {
    setPage("setup");
  }, []);

  if (page === "editor" && slidesData) {
    return <EditorPage slidesData={slidesData} audioFile={audioFile} onBack={handleBack} />;
  }

  return <SetupPage onComplete={handleSetupComplete} />;
}
