export class LinkRequestParser {
  constructor(commandParser, openAIParser, heuristicParser, logger) {
    this.commandParser = commandParser;
    this.openAIParser = openAIParser;
    this.heuristicParser = heuristicParser;
    this.logger = logger;
  }

  async parse(message) {
    const command = this.commandParser.parse(message);
    if (command) {
      return command;
    }

    try {
      return await this.openAIParser.parse(message);
    } catch (error) {
      this.logger.warning("OpenAI parser failed, falling back to heuristic parser.", {
        error: error.message
      });

      return this.heuristicParser.parse(message);
    }
  }
}
