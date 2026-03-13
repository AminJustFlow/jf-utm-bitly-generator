export class WorkflowDecision {
  constructor({ status, normalizedRequest = null, warnings = [], missingFields = [], message = "" }) {
    this.status = status;
    this.normalizedRequest = normalizedRequest;
    this.warnings = warnings;
    this.missingFields = missingFields;
    this.message = message;
  }
}
