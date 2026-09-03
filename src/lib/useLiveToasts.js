import { useCallback, useRef, useState } from "react";

// Twitch/live-stream-style transient banners ("Ravindran joined", "Booma
// sent the lowest bid") — separate from the persisted chat log, since the
// point here is a brief, noticeable flash on the main screen itself, not
// something you have to open a side panel to see. Auto-dismisses each one
// a few seconds after it appears; a fast burst of events just stacks.
export function useLiveToasts(autoDismissMs = 4000) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const pushToast = useCallback((message, tone = "default") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, autoDismissMs);
  }, [autoDismissMs]);

  return { toasts, pushToast };
}
