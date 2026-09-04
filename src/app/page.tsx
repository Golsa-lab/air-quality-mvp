//Home page dell'app.
import Dashboard from "@/components/Dashboard";
import { getMetadata } from "@/lib/domain";

export const dynamic = "force-dynamic"; // la pagina viene rigenerata ad ogni refresh

export default async function Home() {
  let meta;
  try {
    meta = await getMetadata();
  } catch {
    return (
      <main className="page">
        <h1>Qualità dell&apos;aria</h1>
        <p className="sub">
          Il database non risponde. Avvia Postgres con{" "}
          <code>docker compose up -d</code> e carica i dati con{" "}
          <code>python ingest/ingest.py</code>, poi ricarica la pagina.
        </p>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Qualità dell&apos;aria</h1>
      <p className="sub">
        Superamenti dei limiti di legge sui dati ARPA Lombardia, dal{" "}
        {meta.period.from} al {meta.period.to}.
      </p>
      <Dashboard comuni={meta.comuni} period={meta.period} />
    </main>
  );
}
