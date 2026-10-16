export type ResponseParts = {
    body: string;
    reasoning: string;
    correlationID: string;
    duration: string;
};

// Mirrors server/execution.go buildBotResponseMessage and doc2vllm.go renderAssistantResponseParts.
const metaFooterPattern = /\n*_Correlation ID:_ `([^`]*)`(?:\n_LLM API response time:_ `([^`]*)`)?\s*$/;
const answerReasoningPattern = /^\*\*Answer\*\*\n\n([\s\S]*?)\n\n\*\*Reasoning\*\*\n\n([\s\S]*)$/;

export function splitResponseParts(message: string): ResponseParts {
    let body = (message || '').replace(/\r\n/g, '\n');
    let correlationID = '';
    let duration = '';

    const meta = body.match(metaFooterPattern);
    if (meta) {
        correlationID = meta[1];
        duration = meta[2] || '';
        body = body.slice(0, meta.index);
    }

    let reasoning = '';
    const sections = body.trim().match(answerReasoningPattern);
    if (sections) {
        body = sections[1];
        reasoning = sections[2].trim();
    }

    return {body: body.trim(), reasoning, correlationID, duration};
}
