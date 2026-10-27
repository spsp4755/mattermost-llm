package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

func consumeOpenAITextStream(body io.Reader, onSnapshot func(string) error) (string, error) {
	return consumeOpenAIStream(body, onSnapshot, false)
}

func consumeOpenAIStream(body io.Reader, onSnapshot func(string) error, showReasoning bool) (string, error) {
	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 0, 64*1024), 2*1024*1024)
	var answer, reasoning strings.Builder
	last := ""
	snapshot := func() string {
		parts := splitInlineReasoningSections(answer.String())
		if showReasoning {
			parts.Reasoning = strings.TrimSpace(reasoning.String() + "\n" + parts.Reasoning)
		} else {
			parts.Reasoning = ""
		}
		return renderAssistantResponseParts(parts)
	}
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		raw := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if raw == "[DONE]" {
			break
		}
		if raw == "" {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(raw), &payload); err != nil {
			return "", fmt.Errorf("failed to decode streaming payload: %w", err)
		}
		if payload["error"] != nil {
			return "", fmt.Errorf("LLM returned a streaming error")
		}
		choices, _ := payload["choices"].([]any)
		if len(choices) == 0 {
			continue
		} // Usage-only frames have no choices.
		choice, _ := choices[0].(map[string]any)
		answer.WriteString(extractStreamChoiceText(choice))
		if showReasoning {
			for _, key := range []string{"delta", "message"} {
				item, ok := choice[key].(map[string]any)
				if !ok {
					continue
				}
				reasoning.WriteString(typedReasoningText(item["content"]))
				for _, field := range []string{"reasoning_content", "reasoning", "thinking"} {
					if value, ok := item[field]; ok {
						reasoning.WriteString(extractPrimaryStreamingContentText(value))
						break
					}
				}
				break
			}
		}
		next := snapshot()
		if onSnapshot != nil && next != "" && next != last {
			if err := onSnapshot(next); err != nil {
				return "", err
			}
			last = next
		}
	}
	if err := scanner.Err(); err != nil {
		return "", err
	}
	return snapshot(), nil
}

func extractStreamingDeltaText(raw []byte) (string, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return "", nil
	}

	var payload map[string]any
	if err := json.Unmarshal(raw, &payload); err != nil {
		return "", fmt.Errorf("failed to decode streaming payload: %w", err)
	}

	choices, ok := payload["choices"].([]any)
	if !ok {
		return extractTextFromValue(payload), nil
	}

	parts := make([]string, 0, len(choices))
	for _, choice := range choices {
		item, ok := choice.(map[string]any)
		if !ok {
			continue
		}
		if text := extractStreamChoiceText(item); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, ""), nil
}

func extractStreamChoiceText(choice map[string]any) string {
	for _, key := range []string{"delta", "message"} {
		if raw, ok := choice[key]; ok {
			if text := extractPrimaryStreamingContentText(raw); text != "" {
				return text
			}
		}
	}
	if raw, ok := choice["text"]; ok {
		if text := extractPrimaryStreamingContentText(raw); text != "" {
			return text
		}
	}
	return ""
}

func extractPrimaryStreamingContentText(value any) string {
	switch typed := value.(type) {
	case string:
		return typed
	case map[string]any:
		if kind, _ := typed["type"].(string); isReasoningKey(strings.ToLower(kind)) {
			return ""
		}
		if content, ok := typed["content"]; ok {
			return extractPrimaryStreamingContentText(content)
		}
		if text, ok := typed["text"]; ok {
			return extractPrimaryStreamingContentText(text)
		}
		if outputText, ok := typed["output_text"]; ok {
			return extractPrimaryStreamingContentText(outputText)
		}
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := extractPrimaryStreamingContentText(item); text != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "")
	}
	return ""
}
