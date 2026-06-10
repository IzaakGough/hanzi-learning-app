import { useEffect, useState } from "react";
import { HEALTHCHECK_PATH, type HealthcheckResponse } from "@hanzi-learning-app/shared";

const apiBaseUrl = "http://localhost:3001";

export function App() {
  const [health, setHealth] = useState<HealthcheckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}${HEALTHCHECK_PATH}`, {
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`Healthcheck failed with status ${response.status}`);
        }

        const data = (await response.json()) as HealthcheckResponse;
        setHealth(data);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        setError(fetchError instanceof Error ? fetchError.message : "Unknown error");
      }
    }

    void loadHealth();

    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Ticket 001</p>
        <h1>Hanzi Learning App</h1>
        <p className="body">
          Local-first workspace scaffold for the Mandarin learning app.
        </p>
        <dl className="status">
          <div>
            <dt>Frontend</dt>
            <dd>React + Vite</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>Node + TypeScript</dd>
          </div>
          <div>
            <dt>Healthcheck</dt>
            <dd>{health ? `${health.status} (${health.service})` : error ?? "Loading..."}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
