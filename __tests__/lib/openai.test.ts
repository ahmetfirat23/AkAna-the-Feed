// We must mock 'openai' before importing the module under test so the
// singleton _client is created with our mock constructor.

const mockCreate = jest.fn();

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    })),
  };
});

// Import AFTER the mock is registered
import { generateSummaries } from '../../lib/openai';
import OpenAI from 'openai';

function makeSummaryResponse(results: Array<{ id: string; summary: string }>) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(results),
        },
      },
    ],
  };
}

describe('generateSummaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty Map when given an empty array', async () => {
    const result = await generateSummaries([]);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('calls OpenAI with the correct model (gpt-5.4-mini)', async () => {
    mockCreate.mockResolvedValueOnce(
      makeSummaryResponse([{ id: 'abc', summary: 'Test summary.' }]),
    );

    await generateSummaries([{ id: 'abc', title: 'Title', description: 'Desc' }]);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-5.4-mini');
  });

  it('returns a Map<string, string>', async () => {
    mockCreate.mockResolvedValueOnce(
      makeSummaryResponse([{ id: 'abc', summary: 'Test summary.' }]),
    );

    const result = await generateSummaries([
      { id: 'abc', title: 'Title', description: 'Desc' },
    ]);

    expect(result).toBeInstanceOf(Map);
    expect(typeof result.get('abc')).toBe('string');
    expect(result.get('abc')).toBe('Test summary.');
  });

  it('parses the JSON response correctly', async () => {
    mockCreate.mockResolvedValueOnce(
      makeSummaryResponse([
        { id: 'id-1', summary: 'First summary.' },
        { id: 'id-2', summary: 'Second summary.' },
      ]),
    );

    const result = await generateSummaries([
      { id: 'id-1', title: 'Article 1', description: 'Content 1' },
      { id: 'id-2', title: 'Article 2', description: 'Content 2' },
    ]);

    expect(result.get('id-1')).toBe('First summary.');
    expect(result.get('id-2')).toBe('Second summary.');
  });

  it('batches correctly when given > 20 articles (makes 2 calls)', async () => {
    // 25 articles → batch 1 (20) + batch 2 (5)
    const articles = Array.from({ length: 25 }, (_, i) => ({
      id: `art-${i}`,
      title: `Title ${i}`,
      description: `Description ${i}`,
    }));

    // First batch: 20 results
    mockCreate.mockResolvedValueOnce(
      makeSummaryResponse(
        articles.slice(0, 20).map((a) => ({ id: a.id, summary: `Summary for ${a.id}` })),
      ),
    );
    // Second batch: 5 results
    mockCreate.mockResolvedValueOnce(
      makeSummaryResponse(
        articles.slice(20).map((a) => ({ id: a.id, summary: `Summary for ${a.id}` })),
      ),
    );

    const result = await generateSummaries(articles);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.size).toBe(25);
    expect(result.get('art-0')).toBe('Summary for art-0');
    expect(result.get('art-24')).toBe('Summary for art-24');
  });

  it('returns empty Map on OpenAI error (non-throwing)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('OpenAI API error'));

    const result = await generateSummaries([
      { id: 'abc', title: 'Title', description: 'Desc' },
    ]);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it('silently skips a failing batch and continues with the next', async () => {
    const articles = Array.from({ length: 25 }, (_, i) => ({
      id: `art-${i}`,
      title: `Title ${i}`,
      description: `Description ${i}`,
    }));

    // First batch fails
    mockCreate.mockRejectedValueOnce(new Error('API error'));
    // Second batch succeeds
    mockCreate.mockResolvedValueOnce(
      makeSummaryResponse(
        articles.slice(20).map((a) => ({ id: a.id, summary: `Summary for ${a.id}` })),
      ),
    );

    const result = await generateSummaries(articles);

    expect(mockCreate).toHaveBeenCalledTimes(2);
    // First batch was skipped, only second batch results present
    expect(result.get('art-0')).toBeUndefined();
    expect(result.get('art-24')).toBe('Summary for art-24');
  });

  it('handles markdown-fenced JSON response from OpenAI', async () => {
    mockCreate.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: '```json\n[{"id":"x1","summary":"Wrapped summary."}]\n```',
          },
        },
      ],
    });

    const result = await generateSummaries([
      { id: 'x1', title: 'Title', description: 'Desc' },
    ]);

    expect(result.get('x1')).toBe('Wrapped summary.');
  });
});
