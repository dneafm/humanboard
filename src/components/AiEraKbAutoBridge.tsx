import { useEffect } from 'react';
import { useAppStore } from '../store';

type BridgePayload = {
  ideas: ReturnType<typeof useAppStore.getState>['ideas'];
};

export default function AiEraKbAutoBridge() {
  const setIdeas = useAppStore((state) => state.setIdeas);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch('/api/ai-era-kb');
        if (!response.ok) return;
        const payload = (await response.json()) as BridgePayload;
        if (cancelled || !Array.isArray(payload.ideas)) return;

        const current = useAppStore.getState().ideas.filter(
          (idea) => !idea.id.startsWith('kb-aiera-') && !idea.id.startsWith('kb-')
        );
        setIdeas([...payload.ideas, ...current]);
      } catch {
        // silent bridge failure
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [setIdeas]);

  return null;
}