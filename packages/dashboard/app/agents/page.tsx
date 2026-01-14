"use client";

export default function AgentsPage() {
  return (
    <div className="canvas-grid h-full overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-foreground">Agents</h1>
        <p className="text-sm text-muted-foreground">Configured agents and their runs</p>
      </div>

      <div className="flex flex-col items-center justify-center rounded-lg bg-card py-12">
        <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
          <svg className="size-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="mb-1 text-sm font-medium text-foreground">Agent runs coming soon</p>
        <p className="text-xs text-muted-foreground">This page will show agent execution history.</p>
      </div>
    </div>
  );
}
