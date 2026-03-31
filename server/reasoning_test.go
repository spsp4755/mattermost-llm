package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExtractStreamingDeltaTextIgnoresReasoningContent(t *testing.T) {
	delta, err := extractStreamingDeltaText([]byte(`{"choices":[{"delta":{"reasoning_content":"step by step","content":"Final answer"}}]}`))
	require.NoError(t, err)
	require.Equal(t, "Final answer", delta)

	delta, err = extractStreamingDeltaText([]byte(`{"choices":[{"delta":{"reasoning_content":"step by step"}}]}`))
	require.NoError(t, err)
	require.Empty(t, delta)
}

func TestBuildRenderableDoc2VLLMContentSeparatesReasoningAndAnswer(t *testing.T) {
	format, content := buildRenderableDoc2VLLMContent(doc2vllmOCRResponse{
		Choices: []doc2vllmChoice{{
			Message: doc2vllmChoiceMessage{
				Role:             "assistant",
				Content:          "Final answer",
				ReasoningContent: "Step 1\nStep 2",
			},
		}},
	})

	require.Equal(t, "text", format)
	require.Contains(t, content, "**Answer**")
	require.Contains(t, content, "Final answer")
	require.Contains(t, content, "**Reasoning**")
	require.Contains(t, content, "Step 1")
}

func TestBuildRenderableDoc2VLLMContentSplitsThinkTags(t *testing.T) {
	format, content := buildRenderableDoc2VLLMContent(doc2vllmOCRResponse{
		Choices: []doc2vllmChoice{{
			Message: doc2vllmChoiceMessage{
				Role:    "assistant",
				Content: "<think>Analyze carefully</think>Safe answer",
			},
		}},
	})

	require.Equal(t, "text", format)
	require.Contains(t, content, "**Answer**")
	require.Contains(t, content, "Safe answer")
	require.Contains(t, content, "**Reasoning**")
	require.Contains(t, content, "Analyze carefully")
}
