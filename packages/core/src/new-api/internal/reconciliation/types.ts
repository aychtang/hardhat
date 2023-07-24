import { Artifact } from "../../types/artifact";
import { Future, ModuleParameters } from "../../types/module";
import { ExecutionState, ExecutionStateMap } from "../types/execution-state";

export interface ReconciliationFailure {
  futureId: string;
  failure: string;
}

interface ReconciliationFutureResultSuccess {
  success: true;
}

export interface ReconciliationFutureResultFailure {
  success: false;
  failure: ReconciliationFailure;
}

export type ReconciliationFutureResult =
  | ReconciliationFutureResultSuccess
  | ReconciliationFutureResultFailure;

export interface ReconciliationResult {
  reconciliationFailures: ReconciliationFailure[];
  missingExecutedFutures: string[];
}

export interface ReconciliationContext {
  executionStateMap: ExecutionStateMap;
  deploymentParameters: { [key: string]: ModuleParameters };
  accounts: string[];
  moduleArtifactMap: ArtifactMap;
  storedArtifactMap: ArtifactMap;
}

export type ReconciliationCheck = (
  future: Future,
  executionState: ExecutionState,
  context: ReconciliationContext
) => ReconciliationFutureResult;

export interface ArtifactMap {
  [futureId: string]: Artifact;
}
