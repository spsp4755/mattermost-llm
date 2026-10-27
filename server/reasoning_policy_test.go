package main

import (
	"github.com/stretchr/testify/require"
	"strings"
	"testing"
)

func TestStreamHidesIncompleteReasoning(t *testing.T) {
	stream := "data: {\"choices\":[{\"delta\":{\"content\":\"<th\"}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"content\":\"ink>private reasoning\"}}]}\n\n" +
		"data: {\"choices\":[{\"delta\":{\"content\":\"</think>Public answer\"}}]}\n\ndata: [DONE]\n"
	var snapshots []string
	result, err := consumeOpenAITextStream(strings.NewReader(stream), func(s string) error { snapshots = append(snapshots, s); return nil })
	require.NoError(t, err)
	require.Equal(t, "Public answer", result)
	for _, s := range snapshots {
		require.NotContains(t, s, "private")
		require.NotContains(t, s, "<th")
	}
}

func TestStreamReportsProviderError(t *testing.T) {
	_, err := consumeOpenAITextStream(strings.NewReader("data: {\"error\":{\"message\":\"capacity exhausted\"}}\n"), nil)
	require.Error(t, err)
}

func TestReasoningOnlyIsNotAnAnswer(t *testing.T) {
	parts := splitInlineReasoningSections("<think>private reasoning")
	require.Empty(t, parts.Answer)
	require.Equal(t, "private reasoning", parts.Reasoning)
}

func TestAutomaticDiagramsForOrdinaryChat(t *testing.T) {
	for _, mode := range []string{"chat", "multimodal"} {
		prompt := buildDoc2VLLMSystemPrompt(BotDefinition{Mode: mode, OutputMode: "markdown"}, "", false)
		require.Contains(t, prompt, "Do not wait for the user to ask")
	}
	for _, mode := range []string{"text", "json"} {
		require.NotContains(t, buildDoc2VLLMSystemPrompt(BotDefinition{Mode: "chat", OutputMode: mode}, "", false), "[Response formatting]")
	}
	require.NotContains(t, buildDoc2VLLMSystemPrompt(BotDefinition{Mode: "ocr", OutputMode: "markdown"}, "", true), "[Response formatting]")
}

func TestHeadingReasoningBufferedBeforeAnswer(t *testing.T) {
	require.Empty(t, splitInlineReasoningSections("Reasoning:\nprivate").Answer)
	parts := splitInlineReasoningSections("Reasoning:\nprivate\nAnswer:\npublic")
	require.Equal(t, "public", parts.Answer)
	require.Equal(t, "private", parts.Reasoning)
	require.Equal(t, "Reasoning helps solve problems.", splitInlineReasoningSections("Reasoning helps solve problems.").Answer)
}

func TestTypedReasoningBlocksCanBeShown(t *testing.T) {
	parts := extractChoiceResponseParts(doc2vllmChoice{Message: doc2vllmChoiceMessage{Content: []any{map[string]any{"type": "reasoning", "text": "private"}, map[string]any{"type": "text", "text": "public"}}}})
	require.Equal(t, "public", parts.Answer)
	require.Equal(t, "private", parts.Reasoning)
}

func TestReasoningPolicyAtHTTPBoundary(t *testing.T) {
	for _, show := range []bool{false, true} {
		response := doc2vllmOCRResponse{Choices: []doc2vllmChoice{{Message: doc2vllmChoiceMessage{Content: "<think>tagged secret</think>answer", ReasoningContent: "private"}}}}
		filtered := filterResponseReasoning(response, show)
		text := extractDoc2VLLMResponseText(filtered)
		require.Contains(t, text, "answer")
		if show {
			require.Contains(t, text, "private")
		} else {
			require.NotContains(t, text, "private")
			require.NotContains(t, text, "tagged secret")
		}
	}
	for _, raw := range []string{`{"reasoning_content":"private","error":{"message":"<think>private</think>bad request"}}`, "<think>private</think>bad request"} {
		body := redactProviderBody([]byte(raw), false)
		require.NotContains(t, string(body), "private")
		require.Contains(t, string(body), "bad request")
	}
}

func TestGenerationSettingsIndependentOfModelName(t *testing.T) {
	for _, name := range []string{"Qwen", "GLM", "DeepSeek", "MiniMax", "Kimi", "future-alias"} {
		for _, dialect := range []string{"chat_template_kwargs.enable_thinking", "chat_template_kwargs.thinking", "thinking.type", "enable_thinking"} {
			bot := BotDefinition{Model: name, ThinkingMode: "disabled", ThinkingParameter: dialect, ExtraRequestJSON: `{"chat_template_kwargs":{"custom":7}}`}
			body, err := buildDoc2VLLMRequestBody(doc2vllmChatRequest{Model: name}, bot)
			require.NoError(t, err)
			require.Equal(t, float64(7), body["chat_template_kwargs"].(map[string]any)["custom"])
			switch dialect {
			case "thinking.type":
				require.Equal(t, "disabled", body["thinking"].(map[string]any)["type"])
			case "enable_thinking":
				require.Equal(t, false, body["enable_thinking"])
			default:
				require.Equal(t, false, body["chat_template_kwargs"].(map[string]any)[strings.TrimPrefix(dialect, "chat_template_kwargs.")])
			}
		}
	}
	body, err := buildDoc2VLLMRequestBody(doc2vllmChatRequest{}, BotDefinition{})
	require.NoError(t, err)
	require.NotContains(t, body, "thinking")
	require.NotContains(t, body, "chat_template_kwargs")
	_, err = buildDoc2VLLMRequestBody(doc2vllmChatRequest{}, BotDefinition{ThinkingMode: "disabled"})
	require.Error(t, err)
	_, err = parseDoc2VLLMExtraRequestJSON(`{"stream":false}`)
	require.Error(t, err)
}

func TestDocumentReasoningAggregatedOutsideAnswer(t *testing.T) {
	for _, mode := range []string{"markdown", "text", "json"} {
		result := doc2vllmDocumentResult{Attachment: botAttachment{Name: "file.pdf"}, Response: doc2vllmOCRResponse{Choices: []doc2vllmChoice{{Message: doc2vllmChoiceMessage{Content: "public", Reasoning: "private"}}}}}
		output := buildDocumentResponseOutput(mode, "", []doc2vllmDocumentResult{result, result}, nil, 0)
		parts := splitInlineReasoningSections(output)
		require.Contains(t, parts.Answer, "public")
		require.NotContains(t, parts.Answer, "private")
		require.Equal(t, 2, strings.Count(parts.Reasoning, "private"))
	}
}

func TestReasoningFirstBoldHeadingsPreserveFinalAnswer(t *testing.T) {
	parts := splitInlineReasoningSections("**Reasoning**\n\nprivate\n\n**Answer**\n\npublic")
	require.Equal(t, "public", parts.Answer)
	require.Equal(t, "private", parts.Reasoning)
	require.Equal(t, "bad request", string(redactProviderBody([]byte("Reasoning:\nprivate\nAnswer:\nbad request"), false)))
}

func TestRefinerFallbackKeepsReasoningSeparate(t *testing.T) {
	output := buildVLLMFallbackOutput("**Answer**\n\npublic\n\n**Reasoning**\n\nprivate", "refiner unavailable")
	parts := splitInlineReasoningSections(output)
	require.Contains(t, parts.Answer, "public")
	require.Contains(t, parts.Answer, "refiner unavailable")
	require.NotContains(t, parts.Answer, "private")
	require.Equal(t, "private", parts.Reasoning)
}
