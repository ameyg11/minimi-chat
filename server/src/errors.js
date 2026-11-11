export class AgentError extends Error {
  constructor(message, code = 'agent') {
    super(message);
    this.publicMessage = message;
    this.code = code;
  }
}
