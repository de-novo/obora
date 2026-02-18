export interface ArtifactRecord {
  id: string;
  runId: string;
  stepName: string;
  name: string;
  mime: string;
  size: number;
  path: string;
  createdAt: string;
}

export interface ArtifactStore {
  save(runId: string, stepName: string, name: string, data: Buffer, mime: string): Promise<ArtifactRecord>;
  get(artifactId: string): Promise<{ record: ArtifactRecord; data: Buffer }>;
  list(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  delete(artifactId: string): Promise<void>;
}
