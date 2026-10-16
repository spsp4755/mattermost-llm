import {splitResponseParts} from './response_parts';

test('splitResponseParts moves metadata footer out of the body', () => {
    expect(splitResponseParts('안녕하세요\n\n_Correlation ID:_ `corr-1`\n_LLM API response time:_ `2.35초`')).toEqual({
        body: '안녕하세요',
        reasoning: '',
        correlationID: 'corr-1',
        duration: '2.35초',
    });
});

test('splitResponseParts separates answer and reasoning', () => {
    const parts = splitResponseParts('**Answer**\n\n결론\n\n**Reasoning**\n\n이유\n\n_Correlation ID:_ `c2`');
    expect(parts.body).toBe('결론');
    expect(parts.reasoning).toBe('이유');
    expect(parts.correlationID).toBe('c2');
    expect(parts.duration).toBe('');
});

test('splitResponseParts leaves plain messages untouched', () => {
    expect(splitResponseParts('**Reasoning**\n\n생각만 있음')).toEqual({
        body: '**Reasoning**\n\n생각만 있음',
        reasoning: '',
        correlationID: '',
        duration: '',
    });
});
